create extension if not exists "uuid-ossp";

create table if not exists leads (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  category    text,
  city        text,
  phone       text,
  website     text,
  score       integer,
  stage       text not null default 'new'
                check (stage in ('new', 'called', 'follow_up', 'meeting', 'proposal', 'won', 'lost')),
  notes       text,
  deal_value  integer,
  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name, city)
);

create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at_column();
