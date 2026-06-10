# Kayna CRM + Outreach Engine — Build Plan

> **Source of truth** for architecture decisions, phase progress, and blockers.
> Update after every phase: what changed, files touched, passed/failed, next step.

---

## Current Status

| Item | Status |
|------|--------|
| Current phase | Phase 2A (awaiting approval to begin) |
| Completed phases | Phase 0 ✅ · Phase 1 ✅ |
| Next phase | Phase 2A — Minimum DB foundation |
| Host decision | ✅ Cloudflare Pages/Workers + OpenNext (build verified) |
| Real cold outreach | 🔒 LOCKED — physical address + unsubscribe not yet configured |
| Auto-mode | 🔒 LOCKED — Phase 15 |

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
- **Send:** Gmail API (`gmail.send` scope, Production consent, AES-GCM token encryption)
- **Read replies/bounces:** Google Apps Script (best-effort, idempotent webhook, no CASA requirement)
- **Account:** team.kayna Gmail (not personal), unverified-in-Production acceptable for V1 single internal sender

### Background Jobs
- **Engine:** Inngest (free tier: 50k exec/mo, 5 concurrent steps)
- **Browser worker:** GitHub Actions + Playwright (2k min/mo free; ~3–5 min/run = ~20–30 enrichments/month)

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
- Add orthogonal `outreach_state` (automation lifecycle — 21 states).
- Do not merge or replace the current Kanban.

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
outreach_state       text    -- automation lifecycle state (see enum below)
mockup_ready         boolean -- true = safe to claim mockup exists
best_email           text    -- resolver's chosen email
email_confidence     text    -- confidence tier from resolver
resolved_at          timestamptz
quality_score        integer -- 0–100
do_not_contact       boolean default false
```

**New tables:**
- `lead_evidence` — source-level proof records (never raw HTML); blob_ref to Storage
- `lead_resolved` — cached resolver output per lead
- `outreach_messages` — sent/scheduled email records
- `suppression` — deduped by email + domain; opt-out/bounce/complaint records
- `audit_log` — immutable event log
- `gmail_account` — OAuth tokens (AES-GCM encrypted), send settings
- `settings` — singleton row; `physical_address`, `unsubscribe_configured`, `auto_mode`, `warmup_start_date`, daily caps

**Phase 2B (deferred):**
- `scrape_jobs` — enrichment job queue
- Advanced evidence/quality tables

### Outreach States (21)
`new` → `enriching` → `enriched` → `qualified` → `approved_to_send` → `scheduled` → `sent_initial` → `awaiting_response` → `followup_1_scheduled` → `followup_1_sent` → `followup_2_scheduled` → `followup_2_sent` → `positive_reply` → `meeting_requested` → `meeting_booked` → `converted` → `unsubscribed` → `bounced` → `suppressed` → `do_not_contact` → `error`

---

## Email Template: `safe_default_v1`

```
Subject: Quick thought on {{business_name}}'s website

Hi {{first_name_or_team}},

I came across {{business_name}} while looking at {{category}} businesses in {{city}}.
I had some preliminary website direction ideas that I think could help — happy to share
them if that's useful.

{{#if mockup_ready}}
I've actually already put together a quick mockup — no commitment, just wanted to show
what I was thinking.
{{/if}}

Would you be open to a quick chat?

Best,
Krish
Kayna Team · 408-476-6233

---
{{physical_address}}
To unsubscribe: {{unsubscribe_url}}
```

---

## Service Free-Tier Reference

| Service | Free Limit | Hard Pause? | Notes |
|---------|-----------|-------------|-------|
| Cloudflare Workers | 100k req/day | No | 10ms CPU/invocation; heavy work → Inngest/GHA |
| Netlify | 300 credits/mo | Yes | Hard-pause confirmed; fallback only |
| Supabase | 500MB DB, 1GB Storage | Idle pause (7d) | Compact evidence; prune old blobs |
| Inngest | 50k exec/mo, 5 concurrent | No | Free tier verified |
| GitHub Actions | 2k min/mo (private) | No | ~3–5 min/Playwright run = ~20–30/mo |
| Firecrawl | 1k credits/mo | No | Optional; cap at 800 |
| Gmail API | No hard limit | Rate-limited | Warmup ramp required |
| Apps Script | 6 min/execution | No | Best-effort reads only |

---

## Phase Roadmap

| Phase | Name | Status |
|-------|------|--------|
| 0 | Plan file (this document) | ✅ COMPLETE |
| 1 | Feasibility spikes | ✅ COMPLETE — see report below |
| 2A | Minimum DB foundation | ⏳ Next |
| 2B | Advanced DB tables | 🔒 Deferred |
| 3 | Settings page | 🔒 |
| 4 | Cheerio enrichment | 🔒 |
| 5 | Deterministic resolver + Context Pack | 🔒 |
| 6 | Gmail OAuth + send | 🔒 |
| 7 | Unsubscribe + suppression | 🔒 |
| 8 | Apps Script reply reader | 🔒 |
| 9 | Slack webhook alerts | 🔒 |
| 10 | Playwright GHA worker | 🔒 |
| 11 | Follow-up cadence | 🔒 |
| 12 | Manual outreach queue UI | 🔒 |
| 13 | Slack interactive buttons | 🔒 |
| 14 | Firecrawl fallback (optional) | 🔒 |
| 15 | Auto-mode | 🔒 |
| 16 | Production hardening | 🔒 |

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

1. No password sharing across services
2. No raw scraper dumps (HTML, screenshots, markdown) to Claude
3. No guessed emails sent automatically
4. No real cold outreach until `physical_address` + `unsubscribe_configured` are set and tested
5. `physical_address` is always a Settings field — never hardcoded
6. Production sends blocked until both gates flip
7. Test sends only to controlled addresses (never scraped leads)
