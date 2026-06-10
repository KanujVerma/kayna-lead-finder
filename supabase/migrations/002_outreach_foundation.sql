-- Phase 2A — Minimum DB foundation for the outreach engine.
-- Extends the existing `leads` table and adds 7 supporting tables.
-- Pattern mirrors 001_create_leads.sql: text + CHECK (no native enums),
-- uuid_generate_v4() PKs, and the reusable update_updated_at_column() trigger.
-- Idempotent: safe to re-run. Does NOT touch the existing `stage` column.

-- ---------------------------------------------------------------------------
-- 1. Extend `leads`
-- ---------------------------------------------------------------------------
alter table leads
  add column if not exists outreach_state   text        not null default 'new',
  add column if not exists mockup_ready      boolean     not null default false,
  add column if not exists best_email        text,
  add column if not exists email_confidence  text,
  add column if not exists resolved_at       timestamptz,
  add column if not exists quality_score     integer,
  add column if not exists do_not_contact    boolean     not null default false;

-- outreach_state uses text + CHECK (22 values), consistent with `stage`.
alter table leads drop constraint if exists leads_outreach_state_check;
alter table leads
  add constraint leads_outreach_state_check
  check (outreach_state in (
    'new',
    'enriching',
    'enriched',
    'qualified',
    'needs_review',
    'approved_to_send',
    'scheduled',
    'sent_initial',
    'awaiting_response',
    'followup_1_scheduled',
    'followup_1_sent',
    'followup_2_scheduled',
    'followup_2_sent',
    'positive_reply',
    'meeting_requested',
    'manual_outreach',
    'manual_contacted',
    'not_interested',
    'unsubscribed',
    'bounced',
    'do_not_contact',
    'error'
  ));

create index if not exists leads_outreach_state_idx on leads (outreach_state);

-- ---------------------------------------------------------------------------
-- 2. lead_evidence — source-level proof records (never raw HTML; blob_ref only)
-- ---------------------------------------------------------------------------
create table if not exists lead_evidence (
  id            uuid primary key default uuid_generate_v4(),
  lead_id       uuid not null references leads(id) on delete cascade,
  source        text,        -- e.g. 'website', 'places', 'thirdparty'
  evidence_type text,        -- e.g. 'email_mailto', 'email_visible', 'phone'
  value         text,        -- extracted value (email, phone, url)
  confidence    text,        -- resolver confidence tier
  blob_ref      text,        -- pointer to Storage object; never inline raw HTML
  detail        jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists lead_evidence_lead_id_idx on lead_evidence (lead_id);

-- ---------------------------------------------------------------------------
-- 3. lead_resolved — cached resolver output (one row per lead)
-- ---------------------------------------------------------------------------
create table if not exists lead_resolved (
  id               uuid primary key default uuid_generate_v4(),
  lead_id          uuid not null references leads(id) on delete cascade,
  best_email       text,
  email_confidence text,
  context_pack     jsonb,    -- deterministic ~300-400 token context pack
  resolved_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (lead_id)           -- one resolved record per lead
);

drop trigger if exists lead_resolved_updated_at on lead_resolved;
create trigger lead_resolved_updated_at
  before update on lead_resolved
  for each row execute function update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. outreach_messages — sent/scheduled email records
-- ---------------------------------------------------------------------------
create table if not exists outreach_messages (
  id               uuid primary key default uuid_generate_v4(),
  lead_id          uuid not null references leads(id) on delete cascade,
  template         text,                              -- e.g. 'safe_default_v1'
  subject          text,
  body             text,
  direction        text not null default 'outbound',  -- outbound | inbound
  status           text not null default 'scheduled', -- scheduled|sent|failed|bounced
  scheduled_at     timestamptz,
  sent_at          timestamptz,
  gmail_message_id text,
  gmail_thread_id  text,
  detail           jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists outreach_messages_lead_id_idx         on outreach_messages (lead_id);
create index if not exists outreach_messages_gmail_thread_id_idx  on outreach_messages (gmail_thread_id);
create index if not exists outreach_messages_gmail_message_id_idx on outreach_messages (gmail_message_id);

drop trigger if exists outreach_messages_updated_at on outreach_messages;
create trigger outreach_messages_updated_at
  before update on outreach_messages
  for each row execute function update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. suppression — opt-out / bounce / complaint records (send-gate source of truth)
-- ---------------------------------------------------------------------------
create table if not exists suppression (
  id         uuid primary key default uuid_generate_v4(),
  email      text,
  domain     text,
  reason     text not null,   -- unsubscribe | bounce | complaint | manual
  source     text,
  lead_id    uuid references leads(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Dedupe on (email, domain); coalesce NULLs to '' so a domain-only or
-- email-only suppression cannot be inserted twice.
-- Using coalesce rather than NULLS NOT DISTINCT for PG13+ compatibility.
create unique index if not exists suppression_email_domain_key
  on suppression (coalesce(email, ''), coalesce(domain, ''));
create index if not exists suppression_email_idx  on suppression (email);
create index if not exists suppression_domain_idx on suppression (domain);

-- ---------------------------------------------------------------------------
-- 6. audit_log — immutable event log
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id         uuid primary key default uuid_generate_v4(),
  lead_id    uuid references leads(id) on delete set null,
  event_type text not null,   -- e.g. 'outreach_state_transition'
  from_state text,
  to_state   text,
  actor      text,            -- 'system' | 'manual' | user identifier
  detail     jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_lead_id_created_at_idx on audit_log (lead_id, created_at);

-- ---------------------------------------------------------------------------
-- 7. gmail_account — OAuth tokens (AES-GCM encrypted), send settings (one per email)
-- ---------------------------------------------------------------------------
create table if not exists gmail_account (
  id                uuid primary key default uuid_generate_v4(),
  email             text not null,
  access_token_enc  text,    -- AES-GCM encrypted
  refresh_token_enc text,    -- AES-GCM encrypted
  token_expiry      timestamptz,
  scopes            text,
  connected         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (email)
);

drop trigger if exists gmail_account_updated_at on gmail_account;
create trigger gmail_account_updated_at
  before update on gmail_account
  for each row execute function update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 8. settings — fail-closed singleton (id is pinned to 1)
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id                     integer primary key default 1 check (id = 1),
  auto_mode              boolean not null default false,  -- fail closed
  sending_paused         boolean not null default true,   -- fail closed
  physical_address       text,                            -- null until configured
  unsubscribe_configured boolean not null default false,  -- fail closed
  firecrawl_enabled      boolean not null default false,  -- fail closed
  warmup_start_date      date,
  daily_cap              integer not null default 5,
  business_hours_start   text not null default '09:30',
  business_hours_end     text not null default '16:30',
  allowed_cities         text[] not null default
                           array['Pleasanton','Dublin','Livermore','San Ramon','Danville','Alamo'],
  allowed_categories     text[],
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists settings_updated_at on settings;
create trigger settings_updated_at
  before update on settings
  for each row execute function update_updated_at_column();

-- Seed the singleton row with fail-closed defaults.
insert into settings (id) values (1) on conflict (id) do nothing;
