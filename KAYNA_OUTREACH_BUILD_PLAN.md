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
| 2A | Minimum DB foundation | ⏳ Next |
| 2B | Advanced DB tables (deferred) | 🔒 |
| 3 | Settings page | 🔒 |
| 4 | Cheerio enrichment | 🔒 |
| 5 | Deterministic resolver + Context Pack | 🔒 |
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
