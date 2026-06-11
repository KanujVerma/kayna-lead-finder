# Kayna CRM + Outreach Engine — Build Plan

> **Source of truth** for architecture decisions, phase progress, and blockers.
> Update after every phase: what changed, files touched, passed/failed, next step.

---

## Current Status

| Item | Status |
|------|--------|
| Current phase | Phase 6 — Gmail OAuth + manual-approval send |
| Completed phases | Phase 0 ✅ · Phase 1 ✅ · Phase 2A ✅ · Phase 3 ✅ · Phase 4 ✅ · Phase 5 ✅ |
| Next phase | Phase 6 — Gmail OAuth + manual-approval send |
| Host decision | ✅ Cloudflare Pages/Workers + OpenNext (build verified) |
| Real cold outreach | 🔒 LOCKED — physical address + unsubscribe not yet configured |
| Auto-mode | 🔒 LOCKED — Phase 15 |

### Remote Database (initialized 2026-06-10)

- **Project:** Kayna Lead Finder · ref `qvoxnqlcrmwuvjlkzmcw` · `https://qvoxnqlcrmwuvjlkzmcw.supabase.co`
- `001_create_leads.sql` — ✅ applied successfully
- `002_outreach_foundation.sql` — ✅ applied successfully
- **Verification passed:**
  - 8 public tables exist: `leads` + 7 Phase 2A tables (`lead_evidence`, `lead_resolved`, `outreach_messages`, `suppression`, `audit_log`, `gmail_account`, `settings`)
  - `leads` has the 7 Phase 2A columns (`outreach_state`, `mockup_ready`, `best_email`, `email_confidence`, `resolved_at`, `quality_score`, `do_not_contact`)
  - `settings` has exactly one fail-closed row (`auto_mode=false`, `sending_paused=true`, `unsubscribe_configured=false`, `firecrawl_enabled=false`, `physical_address=null`)
  - both constraints exist: `leads_stage_check` and `leads_outreach_state_check`
- **Remote database is ready for Phase 3.**

---

## Repo Findings (as of Phase 0)

- **Stack:** Next.js 16, React 19, Supabase JS, iron-session, dnd-kit (Kanban), Tailwind 4
- **Existing routes:** `/finder`, `/pipeline`, `/stats`, `/trash`, `/login`
- **API routes:** `/api/leads`, `/api/search`, `/api/score`, `/api/auth/login`, `/api/auth/logout`
- **Auth:** iron-session cookie-based
- **DB:** Supabase (existing `leads` table with Places/PageSpeed data)
- **Rule:** extend the existing lead finder — do not rewrite or replace the Kanban CRM

---

## Finalized Architecture Decisions

### Hosting
- **Primary:** Cloudflare Pages/Workers + `@opennextjs/cloudflare` (no hard-pause, free cron, commercial-OK)
- **Fallback:** Netlify (300 credits/mo, verify hard-pause behavior in Phase 2A dashboard check)
- **Never:** Vercel Hobby (non-commercial ToS)
- **One-time step:** `wrangler login` before first live deploy

### Email System
- **Send:** Gmail API (`gmail.send` scope, Production consent, AES-GCM token encryption) from `team.kayna@gmail.com`
- **Read replies/bounces:** Google Apps Script under `team.kayna@gmail.com` (best-effort, idempotent webhook, no CASA requirement)
- **Account:** `team.kayna@gmail.com` (not personal), unverified-in-Production acceptable for V1 single internal sender

### Background Jobs
- **Engine:** Inngest (durable jobs + delays; free-tier limits are assumptions — see Service Reference)
- **Fallback:** QStash (inactive; documented fallback if Inngest becomes a problem)
- **Browser worker:** GitHub Actions + Playwright (qualified/uncertain leads; free-tier limits are assumptions — see Service Reference)

### Scraping (tiered, free-first)
- **Tier 1:** HTTP + Cheerio (every lead, default)
- **Tier 2:** Playwright on GHA (qualified/uncertain leads only)
- **Tier 3:** Firecrawl optional, capped at 800/1000 credits/mo, disabled by default

### Lead Resolver
- **Confidence ladder:** `official_mailto` → `official_visible` → `public_thirdparty` → `markup_only` / `thirdparty_only` → `guessed` → `none`
- **Rule:** guessed emails never auto-send
- **Output:** deterministic Context Pack (~300–400 tokens, only structure Claude ever sees)

### Claude Usage (V1)
- **V1: fully off.** Zero Claude calls per lead in happy path.
- `toClaude()` guard built + tested; no raw HTML, screenshots, blobs, or large arrays cross boundary.
- Edge-case context-pack calls added later only if explicitly approved.

### CRM Model
- Keep existing `stage` column (human Kanban) unchanged.
- Add orthogonal `outreach_state` (automation lifecycle — 22 states).
- Do not merge or replace the current Kanban.
- **Orthogonality rule:** `stage` = human sales / Kanban pipeline (`new`, `called`, `follow_up`, `meeting`, `proposal`, `won`, `lost`). `outreach_state` = automation / email lifecycle. Sales outcomes never live in `outreach_state`.

### Outreach Safety
- **Default:** manual approval mode (`auto_mode = false`)
- **Single chokepoint:** all sends (manual, auto, Slack) route through the same gate
- **Gate checks:** Gmail connected, not paused, Mon–Fri 9:30–16:30 PT, daily cap available, email not guessed/suppressed/bounced/already-contacted, `physical_address` + `unsubscribe_configured` both `true`
- **Warmup ramp:** Days 1–3 = 5/day → Days 4–7 = 8–10 → Week 2 = 12–15 → Week 3+ = 20–25 max
- **Jitter:** 8–25 min randomized between sends
- **No weekends**

### Follow-up Cadence
- f1 = +3 business days after initial send
- f2 = +4 business days after f1
- Max 2 follow-ups per lead
- **Stop conditions:** reply / unsubscribe / bounce / manual pause / meeting booked / suppression

### Allowed Cities (V1 Tri-Valley default)
- Pleasanton, Dublin, Livermore, San Ramon, Danville, Alamo
- Categories configurable in Settings
- V1 manual mode: no hard city restrictions
- Auto-mode (Phase 15): requires explicit allowlist

---

## Database Schema

### Phase 2A Tables (minimum foundation)

**Extend `leads`:**
```sql
outreach_state       text default 'new'    -- text + CHECK (22 values), consistent with existing `stage`
mockup_ready         boolean default false -- DB field for later/manual usage only; NOT used by safe_default_v1
best_email           text    -- resolver's chosen email
email_confidence     text    -- confidence tier from resolver
resolved_at          timestamptz
quality_score        integer -- 0–100
do_not_contact       boolean default false
```
`outreach_state` uses a **`text` column + `CHECK`** constraint (the 22 values), matching the existing
`stage` pattern — cheaper to evolve than a native enum.

**New tables:**
- `lead_evidence` — source-level proof records (never raw HTML); blob_ref to Storage
- `lead_resolved` — cached resolver output per lead
- `outreach_messages` — sent/scheduled email records
- `suppression` — unique on email + domain index; opt-out/bounce/complaint records (send-gate source of truth)
- `audit_log` — immutable event log
- `gmail_account` — OAuth tokens (AES-GCM encrypted), send settings
- `settings` — fail-closed singleton; `physical_address = null`, `unsubscribe_configured = false`, `auto_mode = false`, `warmup_start_date`, daily caps, business-hours window, allowed cities/categories

**Phase 2A deliverables (code — built in the implementation pass, not now):**
- Migration: `supabase/migrations/002_outreach_foundation.sql` (reuse existing `update_updated_at_column()` trigger)
- **State transition helpers** — typed `transitionOutreachState(...)` with allowed-transition validation + `audit_log` write (uses `getSupabaseServer()` from `lib/supabase.ts`)
- **Jest tests** — legal/illegal transition coverage (`jest.config.ts` + `__tests__/` already configured)
- **Types** — extend `types/index.ts` (add `OutreachState` union + new-table interfaces); do not create a parallel type file

**Phase 2B (deferred):**
- `scrape_jobs` — enrichment job queue
- Playwright job tracking
- Firecrawl usage/cap enforcement
- Advanced follow-up / auto-mode-specific columns

### Outreach States (22)
`new` → `enriching` → `enriched` → `qualified` → `needs_review` → `approved_to_send` → `scheduled` → `sent_initial` → `awaiting_response` → `followup_1_scheduled` → `followup_1_sent` → `followup_2_scheduled` → `followup_2_sent` → `positive_reply` → `meeting_requested` → `manual_outreach` → `manual_contacted` → `not_interested` → `unsubscribed` → `bounced` → `do_not_contact` → `error`

**States intentionally NOT in `outreach_state`** (avoid duplicating the Kanban `stage` / suppression table):
- `meeting_booked` → use Kanban `stage = meeting`
- `converted` → use Kanban `stage = won`
- `suppressed` → enforced by the `suppression` table + send gate, not a duplicate lead state

---

## Email Template: `safe_default_v1`

**Rules:**
- Do not use contractions.
- Do not mention a mockup in the default template.
- Do not include any `mockup_ready` conditional in the default template.
- Keep `mockup_ready` as a DB field for later / manual usage only.
- Do not claim a full website, mockup, demo, or design is completed unless a future manual mode explicitly allows it.
- Allowed phrase: "preliminary website direction."
- Sender identity: Krish / Kayna Team / 408-476-6233. Never "KaynaBot" in customer-facing outreach.
- Template variables stay simple and deterministic. No Claude per-send writing.

```
Subject: Quick website idea for {{business_name}}

Hi {{business_name}} team,

I came across your business while looking at local {{category}} companies in {{city}}.

We made a quick preliminary website direction for you, focused on making the site cleaner and easier for customers to call, book, or request a quote.

Would you be open to a quick 10-minute call this week? I can walk you through it and see if it would be useful.

Best,
Krish
Kayna Team
408-476-6233

{{physical_address}} · Unsubscribe: {{unsubscribe_url}}
```

---

## Service Free-Tier Reference

> Provider limits below are **assumptions** unless verified from official docs/dashboards. Do not hard-code
> quota assumptions into product code — put limits in config/settings and verify per-provider at integration
> time. Any limit that cannot be confirmed from official docs/dashboard stays marked **Unverified**.

| Service | Free Limit (assumption) | Hard Pause? | Verified? | Notes |
|---------|------------------------|-------------|-----------|-------|
| Cloudflare Workers | ~100k req/day | No | Unverified — confirm in dashboard | 10ms CPU/invocation; heavy work → Inngest/GHA |
| Netlify | ~300 credits/mo | Yes | Unverified — confirm in dashboard | Fallback only |
| Supabase | ~500MB DB, 1GB Storage | Idle pause (~7d) | Unverified — confirm in dashboard | Compact evidence; prune old blobs |
| Inngest | ~50k exec/mo, 5 concurrent | No | Unverified — confirm in dashboard | Durable jobs/delays |
| QStash | free tier (fallback) | No | Unverified — confirm in dashboard | Inactive; fallback for Inngest |
| GitHub Actions | ~2k min/mo (private) | No | Unverified — confirm in dashboard | ~3–5 min/Playwright run |
| Firecrawl | ~1k credits/mo | No | Unverified — confirm in dashboard | Optional; disabled by default |
| Gmail API | No hard limit | Rate-limited | Unverified — confirm in docs | Warmup ramp required |
| Apps Script | ~6 min/execution | No | Unverified — confirm in docs | Best-effort reads only |

---

## Phase Roadmap

> Phases 0–9 match the approved first-safe-loop order. Phases 10–16 are deferred/later work. Tracking
> clarity matters more than the original numbering.

| Phase | Name | Status |
|-------|------|--------|
| 0 | Plan file (this document) | ✅ COMPLETE |
| 1 | Feasibility spikes | ✅ COMPLETE — see report below |
| 2A | Minimum DB foundation | ✅ COMPLETE — see report below |
| 2B | Advanced DB tables (deferred) | 🔒 |
| 3 | Settings page | ✅ COMPLETE |
| 4 | Cheerio enrichment | ✅ COMPLETE |
| 5 | Deterministic resolver + Context Pack | ✅ COMPLETE |
| 6 | Gmail OAuth + manual-approval send | 🔒 |
| 7 | Unsubscribe + suppression | 🔒 |
| 8 | Apps Script reply / bounce / opt-out reader | 🔒 |
| 9 | Slack webhook alerts | 🔒 |
| 10 | Playwright GHA worker | 🔒 |
| 11 | Follow-up cadence | 🔒 |
| 12 | Manual outreach queue UI | 🔒 |
| 13 | Slack interactive buttons | 🔒 |
| 14 | Firecrawl fallback (optional) | 🔒 |
| 15 | Auto-mode | 🔒 |
| 16 | Production hardening | 🔒 |

### First Safe Loop (Phases 4→8)
- Phase 4: Cheerio enrichment
- Phase 5: Resolver + Context Pack
- Phase 6: Gmail OAuth + manual-approval send
- Phase 7: Unsubscribe + suppression
- Phase 8: Apps Script reply / bounce / opt-out reader

---

## Phase 2A Report — ✅ COMPLETE

**Completed:** 2026-06-10

### Files touched
- `supabase/migrations/002_outreach_foundation.sql` — **new** — extends `leads` with 7 outreach columns + CHECK constraint (22-value `outreach_state`); creates 7 new tables; seeds fail-closed `settings` singleton
- `types/index.ts` — **extended** — added `OutreachState` union (22 values); extended `Lead` with new outreach fields; added 7 table interfaces (`LeadEvidence`, `LeadResolved`, `OutreachMessage`, `Suppression`, `AuditLog`, `GmailAccount`, `Settings`)
- `lib/outreach-state.ts` — **new** — pure layer (`OUTREACH_STATES`, `ALLOWED_TRANSITIONS`, `TERMINAL_STATES`, `isLegalTransition`, `isTerminalState`, `buildTransitionAudit`) + thin DB layer (`transitionOutreachState()`)
- `__tests__/lib/outreach-state.test.ts` — **new** — 37 pure unit tests (state count, terminal states, legal/illegal transitions, audit payload shape)
- `KAYNA_OUTREACH_BUILD_PLAN.md` — **updated** — this report

### Migration summary (`002_outreach_foundation.sql`)
- `leads` extended: `outreach_state text default 'new'` (text + CHECK, 22 values), `mockup_ready boolean default false`, `best_email`, `email_confidence`, `resolved_at`, `quality_score`, `do_not_contact boolean default false`
- 7 tables created: `lead_evidence`, `lead_resolved` (unique per lead), `outreach_messages`, `suppression` (unique on email+domain, nulls not distinct), `audit_log`, `gmail_account` (unique per email), `settings` (singleton, id = 1)
- `settings` seeded fail-closed: `auto_mode=false`, `sending_paused=true`, `physical_address=null`, `unsubscribe_configured=false`, `firecrawl_enabled=false`
- Reuses existing `update_updated_at_column()` trigger on 4 tables
- Indexes added: `leads_outreach_state_idx`, `lead_evidence_lead_id_idx`, `outreach_messages_lead_id_idx`, `outreach_messages_gmail_thread_id_idx`, `outreach_messages_gmail_message_id_idx`, `suppression_email_idx`, `suppression_domain_idx`, `audit_log_lead_id_created_at_idx`

### Transition graph
Strict lifecycle. 5 terminal states (no exit): `meeting_requested`, `not_interested`, `unsubscribed`, `bounced`, `do_not_contact`. `error` recovers via `needs_review` or `do_not_contact`. Out-of-order jumps rejected; fails closed.

### Checks run
| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Clean — no errors |
| `npm test` (full suite) | ✅ 44/44 pass — 4 suites (37 new + 7 existing) |
| `npm run build` | ✅ Clean — all 14 routes compile |
| `git status` | Modified (uncommitted — pending review) |

### Not built (Phase 2B / later)
- `scrape_jobs` table — Phase 2B
- Playwright job-tracking tables — Phase 2B
- Firecrawl cap enforcement — Phase 2B
- Advanced follow-up / auto-mode columns — Phase 2B
- Settings UI — Phase 3
- Gmail OAuth — Phase 6
- Cheerio enrichment, resolver, Slack, Apps Script, Playwright worker, Firecrawl, follow-ups, auto-mode — later phases

### Blockers
- Migration is a **local file only** — must be applied to the remote Supabase project (`supabase db push` or dashboard SQL editor) before any code that queries the new tables/columns runs. One-time step; no blocker for Phase 3 UI scaffolding.

### Recommended next step
Phase 3 — Settings page: a `/settings` route that reads the singleton `settings` row and lets you set `physical_address`, flip `unsubscribe_configured`, and view the current `sending_paused` / `auto_mode` / daily-cap values. This is the prerequisite for the CAN-SPAM send gate.

---

## Phase 3 Report — ✅ COMPLETE

**Completed:** 2026-06-10

### Files created
- `lib/settings-policy.ts` — pure module: `sanitizeSettingsUpdate`, `validateSettingsUpdate`, `computeReadiness`, `EDITABLE_FIELDS`, `LOCKED_FIELDS` semantics. No Supabase import — fully testable without DB.
- `__tests__/lib/settings-policy.test.ts` — 45 pure unit tests (sanitize strip/force, validate all field types, computeReadiness all cases). No live DB dependency.
- `app/api/settings/route.ts` — `GET` reads singleton; `PATCH` sanitizes → validates → force-locks `auto_mode=false` + `firecrawl_enabled=false` at write layer. Always targets `id=1`, never inserts.
- `components/settings/StatusCard.tsx` — presentational readiness card (ok/warn/locked/disabled states + dot + color).
- `components/settings/SettingsForm.tsx` — `'use client'`: status cards row, editable field sections, locked/disabled section, Save → `PATCH /api/settings` with optimistic update + saved/error feedback.
- `app/(app)/settings/page.tsx` — server component, `dynamic='force-dynamic'`, reads singleton via `getSupabaseServer()`, passes to `SettingsForm`.

### Files edited
- `components/Sidebar.tsx` — added `{ href: '/settings', label: 'Settings' }` to `nav` array.
- `KAYNA_OUTREACH_BUILD_PLAN.md` — this report.

### Behavior added
- `/settings` route with header (eyebrow / Cormorant h1 / italic subtitle) matching existing pages.
- **Status cards:** CAN-SPAM (ready only when address + unsubscribe both set), Physical Address, Unsubscribe, Sending, Auto-mode (locked), Firecrawl (disabled). Cards update after successful save.
- **Editable fields:** `physical_address`, `unsubscribe_configured`, `sending_paused`, `daily_cap`, `business_hours_start`, `business_hours_end`, `allowed_cities` (comma-separated), `allowed_categories` (comma-separated, optional).
- **Locked fields (UI + API):** `auto_mode` shown as disabled toggle with "Locked — Phase 15" badge; `firecrawl_enabled` shown as disabled toggle with "Disabled" badge. Cannot be enabled from UI or API.
- **Validation:** physical_address trim/null/max-500; daily_cap 0–50 integer; HH:MM format + start<end; array fields normalize (trim, dedupe, drop empty).
- **Auth:** inherited from `middleware.ts` — `/settings` + `/api/settings` are login-gated with no extra code.
- **No send button.** No Gmail, no Firecrawl, no Cheerio, no Phase 4 code anywhere.

### Checks run
| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Clean — no errors |
| `npx jest --testPathPatterns="settings-policy"` | ✅ 45/45 pass |
| `npm test` (full suite) | ✅ 89/89 pass — 5 suites, 0 regressions |
| `npm run build` | ✅ Clean — `/settings` (ƒ dynamic) + `/api/settings` (ƒ dynamic) in route table |
| `.env.local` tracked? | ✅ No — confirmed gitignored |

### Blockers
None. DB is already live (Phase 2A migration applied and verified). Settings singleton seeded.

### Recommended next step
Phase 4 — Cheerio enrichment: HTTP + Cheerio scrape of `website` URL per lead, extract emails/phone/contact links, write to `lead_evidence`. Triggered manually per-lead, no auto-mode. Default scraping tier.

---

## Phase 5 Report — ✅ COMPLETE

**Completed:** 2026-06-11

### Files created
- `lib/resolver/resolver-policy.ts` — **new** — pure, no network, no DB. Exports: `normalizeEmail`, `isValidEmail`, `isBadEmail`, `isNoReply`, `isRoleEmail`, `registrableDomain`, `domainMatches`, `classifyEmailCandidates`, `pickBestEmail`, `computeQualityScore`, `buildContextPack`, `planResolutionTransitions`, `buildResolvedLead`. Also exports types: `EmailConfidence`, `EmailCandidate`, `PickedEmail`, `ContextPack`, `ResolvedLead`.
- `lib/resolver/resolve-lead.ts` — **new** — server runner (DB). `resolveLeadById(leadId)`: reads lead + evidence, builds resolved lead (pure), upserts `lead_resolved`, updates `leads` mirror fields, walks `outreach_state` conservatively, returns compact summary.
- `app/api/leads/[id]/resolve/route.ts` — **new** — `POST /api/leads/[id]/resolve`. Next.js 16 async params. Returns compact summary only. Login-gated by middleware.
- `__tests__/lib/resolver-policy.test.ts` — **new** — 90 pure unit tests across 10 describe blocks. Covers: email normalize/validate; bad-email filtering (example/test/asset/malformed); tier classification; deduplication; domain matching; `official_mailto` beats `official_visible`; domain-matched beats off-domain; non-noreply beats noreply; role beats non-role; alphabetical tiebreak; no guessed emails ever generated/selected; quality score computation + thresholds; context pack structure, char budget, no HTML, determinism; `planResolutionTransitions` conservative behavior (forward walk, empty+mismatch for non-forward states, terminal no-ops); `buildResolvedLead` end-to-end integration.

### Files edited
- `components/pipeline/LeadCard.tsx` — added `ResolveState` type, `resolveState`/`resolveMsg` state, `handleResolve()` async function (POST → loading/done/error, shows outcome + score + email), "Resolve lead" button beside "Enrich website". Drag-safe, no stage change, no auto-trigger.
- `KAYNA_OUTREACH_BUILD_PLAN.md` — this report.

### Confidence ladder
| Tier | evidence_type | Meaning |
|------|---|---|
| `official_mailto` (1) | `email_mailto` | href="mailto:…" on lead's own site |
| `official_visible` (2) | `email_visible` | visible in body text on lead's own site |
| `public_thirdparty` (3) | reserved | future (Firecrawl, Places) |
| `markup_only` (4) | reserved | future |
| `guessed` (5) | — | V1: classification only, never selected |
| `none` (6) | — | no usable email found |

### Context Pack shape
Stored in `lead_resolved.context_pack` (jsonb). Compact — ~300–400 tokens. Fields: `business_name`, `website`, `best_email`, `email_confidence`, `quality_score`, `email_summary` {mailto_count, visible_count, candidates[≤5]}, `phone_summary` {tel_count, visible_count, sample[≤3]}, `links_summary` {contact[≤5], booking[≤5], about[≤3], social[≤6]}, `page` {title, description}, `signals` {hasContactForm, hasMailto, hasTel, socialCount}, `warnings[]`, `recommended_action`, `approx_tokens`. No raw HTML, no large arrays, no secrets.

### Quality score formula (0–100, deterministic)
`+45` official_mailto / `+35` official_visible / `+25` public_thirdparty / `+15` markup_only → `+15` domain-match → `+10` has phone → `+12` has contact|booking link → `+4` has about → `+8` has title → `+6` has social → `−10` noreply-selected. Clamped to [0, 100].

### DB writes
- `lead_resolved` — upserted one row per lead (onConflict `lead_id`)
- `leads` mirror fields — `best_email`, `email_confidence`, `resolved_at`, `quality_score`
- `audit_log` — written by `transitionOutreachState()` (non-fatal)
- **Never written:** `outreach_messages`, `suppression`, `leads.stage`

### Conservative outreach_state behavior
Transitions attempted **only** from `{new, enriching, enriched}`:
- No evidence → skip (no writes, no transitions)
- Terminal lead → skip (no writes, no transitions)
- From `new`/`enriching`/`enriched` → walk forward: `new→enriching→enriched→{qualified|needs_review}`
  - `qualified` only when `best_email` present AND `quality_score >= 50`
  - Otherwise `needs_review`
- Already `needs_review`/`qualified`/`approved_to_send`+ → refresh data only, `stateMismatch` note, **no transitions**
- Every hop via `transitionOutreachState()` only; illegal/failed hops non-fatal to data writes

### Checks run
| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Clean — no errors |
| `npx jest --testPathPatterns="resolver-policy"` | ✅ 90/90 pass |
| `npm test` (full suite) | ✅ 243/243 pass — 7 suites, 0 regressions |
| `npm run build` | ✅ Clean — `/api/leads/[id]/resolve` (ƒ dynamic) in route table |
| `.env.local` tracked? | ✅ No — confirmed gitignored |

### Safety guardrails confirmed
- ✅ No Claude/LLM calls anywhere
- ✅ No raw HTML stored or returned (context pack is compact, derived, capped)
- ✅ No Gmail / sending / unsubscribe / outreach_messages / suppression writes
- ✅ No Firecrawl, no Playwright
- ✅ No `leads.stage` change
- ✅ `outreach_state` changed only via `transitionOutreachState()`; illegal hops fail closed
- ✅ Terminal leads left untouched (no writes, no transitions)
- ✅ Already-advanced states (needs_review+) get data refresh only — no forced transitions
- ✅ `.env.local` not tracked by git
- ✅ Cost $0

### Blockers
None. DB tables `lead_resolved` and `lead_evidence` were created in Phase 2A and are already live.

### Recommended next step
Phase 6 — Gmail OAuth + manual-approval send: connect `team.kayna@gmail.com` via Gmail API OAuth (`gmail.send` scope), build the send gate (cap, business hours, suppression check, physical_address + unsubscribe_configured), expose a manual "Send" button that only fires when a lead is `approved_to_send`. Phase 5's `qualified` state is the prerequisite — humans approve leads for send in Phase 6.

---

## Phase 4 Report — ✅ COMPLETE

**Completed:** 2026-06-11

### Files created
- `lib/enrichment/cheerio-extractor.ts` — **new** — pure extraction module (no network, no DB). Functions: `normalizeUrl`, `extractEmails`, `extractPhones`, `extractLinks`, `extractPageSummary`, `extractWebsiteSignals`, `extractEvidence` (orchestrator), `buildLeadEvidenceRows`. Raw HTML is consumed inside `extractEvidence` and never returned or stored. Every row: `source='website'`, `blob_ref=null`, `confidence=null`.
- `lib/enrichment/enrich-lead.ts` — **new** — server-side runner. `enrichLeadById(leadId)`: loads lead, validates website URL (http/https only), fetches with 9s timeout + polite User-Agent, caps body at 1.5 MB, guards content-type (text/html only), calls extractor, deletes prior `source='website'` evidence rows, inserts fresh rows. Returns compact summary only — never raw HTML. No stage change. No outreach_state change.
- `app/api/leads/[id]/enrich/route.ts` — **new** — `POST /api/leads/[id]/enrich`. Login-gated by existing `middleware.ts`. Uses Next.js 16 async params (`await params`). Returns JSON summary (200/404/500). No raw HTML in response.
- `__tests__/lib/cheerio-extractor.test.ts` — **new** — 64 pure unit tests across 8 describe blocks. Covers: `normalizeUrl` (12 cases); `extractEmails` (8 cases inc. dedup, cap, lowercase); `extractPhones` (5 cases); `extractLinks` (12 cases inc. contact/about/booking/social/calendly/dedup/cap); `extractPageSummary` (5 cases inc. og fallback); `extractWebsiteSignals` (5 cases); `extractEvidence` smoke (3 cases); `buildLeadEvidenceRows` invariants (13 cases — verifies `source='website'`, `blob_ref=null`, `confidence=null`, no HTML in values/detail on every row).

### Files edited
- `components/pipeline/LeadCard.tsx` — added `EnrichState` type, `enrichState`/`enrichMsg` local state, `handleEnrich()` async function (POST → loading/done/error), and an "Enrich website" button rendered only when `lead.website` is truthy. Uses existing `onPointerDown stopPropagation` drag-safe pattern. Shows "Enriched · N rows" on success, error message in red on failure.
- `package.json` — added `cheerio` (^1.2.0) as runtime dependency.
- `package-lock.json` — updated.
- `KAYNA_OUTREACH_BUILD_PLAN.md` — this report.

### Dependency added
`cheerio@1.2.0` — MIT, pure Node.js HTML parser. No paid services, no credentials, no network calls in the package itself.

### Evidence shape written to `lead_evidence`
| evidence_type | value | detail |
|---|---|---|
| `email_mailto` | email address | null |
| `email_visible` | email address | null |
| `phone_tel` | normalized digits | null |
| `phone_visible` | normalized digits | null |
| `link_contact` | absolute URL | `{text?}` |
| `link_about` | absolute URL | `{text?}` |
| `link_booking` | absolute URL | `{platform?, text?}` |
| `link_social` | absolute URL | `{platform, text?}` |
| `page_summary` | page title | `{description, fetched_url}` |
| `website_signal` | null | `{hasContactForm, hasMailto, hasTel, socialCount, requested_url, final_url, status_code}` |

**Invariants on every row:** `source='website'`, `blob_ref=null`, `confidence=null`.

### Outreach state behavior
- `outreach_state`: **unchanged**. Phase 4 writes evidence only.
- `transitionOutreachState()`: **not called**. `enriching`/`enriched` transitions wired in Phase 5 (resolver).
- Re-run: prior `source='website'` rows deleted, fresh rows inserted. Other sources untouched.

### Checks run
| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Clean — no errors |
| `npx jest --testPathPatterns="cheerio-extractor"` | ✅ 64/64 pass |
| `npm test` (full suite) | ✅ 153/153 pass — 6 suites, 0 regressions |
| `npm run build` | ✅ Clean — `/api/leads/[id]/enrich` (ƒ dynamic) in route table |
| `.env.local` tracked? | ✅ No — confirmed gitignored |

### Safety guardrails confirmed
- ✅ No raw HTML stored (`blob_ref=null` on every row; confirmed by unit tests)
- ✅ No raw HTML returned to client (summary counts only)
- ✅ No Claude calls
- ✅ No Firecrawl
- ✅ No Playwright
- ✅ No Gmail / sending / unsubscribe
- ✅ No `stage` change
- ✅ No `outreach_state` change (only comments in the code assert the invariant)
- ✅ `.env.local` not tracked by git

### Blockers
None. DB tables `lead_evidence` was created in Phase 2A and is already live on the remote Supabase project.

### Recommended next step
Phase 5 — Deterministic resolver + Context Pack: read `lead_evidence` rows for a lead, apply the confidence ladder (`official_mailto` → `official_visible` → `public_thirdparty` → `markup_only` → `guessed` → `none`), pick `best_email`, write to `lead_resolved`, build the deterministic ~300–400 token Context Pack. Wire `outreach_state` transitions `new→enriching→enriched` here. No Claude calls in happy path.

---

## Phase 1 Report — ✅ COMPLETE

**Completed:** 2026-06-05

### Files touched
- `package.json` / `package-lock.json` — Next.js 16.2.1 → 16.2.9; added `@opennextjs/cloudflare`, `wrangler`, `inngest`
- `next.config.ts` — OpenNext dev initialization hook added
- `.gitignore` — added `.open-next/`, `.wrangler/`, `.dev.vars*` (except `.dev.vars.example`)
- `open-next.config.ts` — minimal Cloudflare adapter config
- `wrangler.jsonc` — Cloudflare Workers deployment config
- `.dev.vars.example` — local dev env template
- `inngest/client.ts` — Inngest client
- `inngest/functions.ts` — helloKayna hello-world function
- `app/api/inngest/route.ts` — Inngest serve route handler
- `.github/workflows/playwright-worker.yml` — GHA Playwright worker template

### Spike results

| Spike | Result | Notes |
|-------|--------|-------|
| Cloudflare/OpenNext build | ✅ Pass | worker.js emitted; Next.js 16.2.x upgrade required |
| Next.js base build | ✅ Pass | No regressions |
| TypeScript check | ✅ Pass | `tsc --noEmit` clean |
| Inngest hello-world | ✅ Pass | Wiring works; Inngest cloud activation is manual |
| GHA Playwright workflow | ✅ Defined | Push + secrets needed in Phase 10 |
| Gmail OAuth | 🟡 Documented | GCP setup manual; Phase 6 |
| Apps Script | 🟡 Documented | Google account access manual; Phase 8 |
| Netlify hard-pause | ✅ Verified | 300 credits, hard-pause confirmed — fallback only |
| Inngest free tier | ✅ Verified | 50k exec/mo, 5 concurrent |
| Cloudflare CPU limit | ✅ Confirmed | 10ms/inv; heavy work → Inngest/GHA |

### Host decision: Cloudflare Pages/Workers + OpenNext
No hard-pause. Free cron. Commercial-friendly. One-time `wrangler login` before first live deploy.

### Manual steps remaining (expected — documented for their phases)
- `wrangler login` — one-time interactive Cloudflare OAuth (before Phase 16 deploy)
- Inngest cloud activation — account + Dev Server tunnel (before Phase 2A testing)
- Gmail OAuth — GCP project + Production consent screen (Phase 6)
- Apps Script — Google account webhook setup (Phase 8)

### Unresolved blockers
None blocking Phase 2A.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| OpenNext/Next.js 16 compatibility | ✅ Resolved by patch upgrade; worker.js confirmed |
| Netlify hard-pause | Avoided by choosing Cloudflare primary; Netlify is fallback |
| Gmail deliverability | Warmup ramp (5→25/day), business-hour jitter, plain text, real signature |
| CAN-SPAM legal | Gate-enforced: `physical_address` + `unsubscribe_configured` must be `true` |
| Apps Script reliability | Best-effort reads, idempotent event handling, manual inbox fallback |
| Supabase 500MB quota | Compact evidence JSON, gzipped blobs, periodic pruning |
| Cloudflare 10ms CPU | Lightweight route surfaces only; heavy work on Inngest/GHA |
| Single sender reputation | Conservative volume, plain text, real identity, warmup ramp |

---

## Non-Negotiable Constraints

1. No password sharing.
2. No browser automation for Gmail.
3. No Claude Gmail connector in production.
4. No Vercel Hobby commercial-use gray area.
5. No raw scraper dumps to Claude.
6. No sending to guessed emails.
7. No sending to suppressed leads.
8. No sending to unsubscribed leads.
9. No sending to bounced leads.
10. No full-auto until manual mode is proven safe.
11. No real cold email until unsubscribe link is configured and tested.
12. No real cold email until physical address is configured.
13. Keep recurring cost $0/near-$0.
14. Keep Claude token usage minimal.

---

## Cost Rule

- V1 must run at **$0/month** outside Claude usage.
- No paid plan, paid add-on, or overage billing without explicit user approval.
- No paid Firecrawl usage.
- No paid Cloudflare usage.
- No paid Supabase usage.
- No paid Inngest usage.
- No paid GitHub Actions overage.
- If a provider requires billing/payment setup, **stop and ask**.
- Add guards/caps so the system fails closed or pauses before creating paid usage.
