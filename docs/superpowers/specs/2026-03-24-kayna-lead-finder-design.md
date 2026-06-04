# Kayna Lead Finder — Design Spec
**Date:** 2026-03-24
**Status:** Approved
**Scope:** Private internal tool for 2 users (Kayna team)

---

## Overview

Kayna Lead Finder is a private web app that automates finding local business leads for a web design agency. It searches Google Places for businesses in a given city and category, scores each business's website using PageSpeed Insights, and provides a built-in CRM pipeline to track outreach from first contact to close.

**Primary users:** 2 people (shared password access, no individual accounts)
**Deployment:** Vercel
**Auth:** Single shared password gate (middleware-based)

---

## Architecture

**Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Supabase (Postgres)
**Auth:** Password stored as env var, checked via Next.js middleware on all routes
**Lead scoring:** Progressive — Google Places results return immediately, PageSpeed scores stream in per-business as they complete
**Drag-and-drop:** `@dnd-kit/core` for Kanban board

### Data Flow

```
User searches [category] + [city]
  → API route calls Google Places API (server-side, key hidden)
  → Returns list of businesses immediately (name, phone, rating, website URL)
  → Client opens SSE stream to /api/score
  → For each business with a website: calls PageSpeed Insights API
  → Scores stream back and fill in the results table progressively
      - On PageSpeed error (timeout, rate limit, unreachable): score cell shows "Error" — no retry in v1
  → User selects leads → clicks "Add to CRM" → saved to Supabase (upsert on name+city — duplicates silently update, not re-inserted)
```

### Key APIs
- **Google Places API** — business discovery (name, address, phone, website, rating, review count); first page only (up to 20 results per search — no pagination in v1)
- **Google PageSpeed Insights API** — website quality score (0–100, mobile performance)
- Both called server-side to keep API keys out of the client

---

## Pages & Routes

| Route | Description |
|-------|-------------|
| `/` | Redirects to `/finder` |
| `/finder` | Lead search + results table |
| `/pipeline` | Kanban CRM board |
| `/stats` | Renders a "coming soon" placeholder in v1 — no data yet |
| `/api/search` | Calls Google Places, returns businesses |
| `/api/score` | SSE stream — scores one website per event |
| `/api/leads` | CRUD (create, read, update stage/notes) for CRM leads — no delete in v1; use "Closed Lost" as terminal state |

---

## UI Layout

**Sidebar navigation** (fixed left, 210px wide, dark `#111`)
- Logo area: `arrows.svg` icon + "kayna" / "lead finder" label
- Nav items: Lead Finder, Pipeline, Stats
- No user accounts or footer

**Color system:**
- Background: `#0a0a0a`
- Sidebar / cards: `#111111`
- Borders: `#1f1f1f`
- Accent / teal: `#5ce1e6`
- Text primary: `#e2e8f0`
- Text muted: `#64748b`

---

## Feature: Lead Finder

**Inputs:** Business category (text) + City (text) → Search button
**Output:** Results table with progressive website scoring

### Results Table Columns
| Column | Source | Notes |
|--------|--------|-------|
| Checkbox | — | Multi-select for bulk CRM add |
| Business name + category | Google Places | |
| Phone | Google Places | Primary outreach channel |
| Rating | Google Places | ★ out of 5 |
| Website URL | Google Places | Empty = "No website" |
| Score | PageSpeed API | 0–100, streams in; "No website" = 🔥 Hot lead |
| Action | — | "Add to CRM" button per row |

### Lead Scoring Labels
- **No website** → `🔥 Hot` badge (teal) — highest priority
- **0–49** → red score pill — poor website, strong pitch opportunity
- **50–74** → yellow score pill — mediocre website
- **75–100** → green score pill — decent website, lower priority

### Bulk Actions (top bar)
- Checkbox count indicator ("3 of 12 selected")
- "Select All" button
- "Add to CRM" button (adds all selected)
- "Export CSV" button

---

## Feature: CRM Pipeline (Kanban)

**7 stages** displayed as Kanban columns with `@dnd-kit` drag-and-drop:

| Stage | Color |
|-------|-------|
| New Lead | Gray `#64748b` |
| Called | Blue `#60a5fa` |
| Follow Up | Purple `#a78bfa` |
| Meeting Set | Green `#34d399` |
| Proposal Sent | Yellow `#fbbf24` |
| Closed Won | Bright green `#4ade80` |
| Closed Lost | Red `#f87171` |

### Lead Card Contents
- Business name
- Phone number
- Tags: website score pill, "No website" badge, notes tag
- "Move → [next stage]" quick-action button (alternative to drag)
- Notes are added/edited via an inline text field that appears on card click (no separate modal)

### Top Bar Actions
- Lead count ("8 active leads")
- Filter button (future)
- "+ Add Lead" button (manual entry)

---

## Database Schema (Supabase)

### `leads` table
```sql
id          uuid primary key
name        text not null
category    text
city        text
phone       text
website     text
score       integer        -- PageSpeed score, null if no website
stage       text not null  -- 'new' | 'called' | 'follow_up' | 'meeting' | 'proposal' | 'won' | 'lost'
notes       text
deal_value  integer        -- estimated project value in dollars
added_at    timestamptz default now()
updated_at  timestamptz default now()
```

---

## Auth

Simple middleware password gate:
- `SITE_PASSWORD` env var (set in Vercel dashboard)
- Login page at `/login` — single password input, no username
- On success: sets a signed cookie via `iron-session` (valid 7 days; requires `SESSION_SECRET` env var ≥32 chars)
- Middleware checks cookie on every request, redirects to `/login` if missing/invalid
- No user accounts, no sessions stored in DB

---

## Environment Variables (Vercel)

| Variable | Purpose |
|----------|---------|
| `SITE_PASSWORD` | Shared password for the password gate |
| `SESSION_SECRET` | iron-session signing key (≥32 chars) |
| `GOOGLE_PLACES_API_KEY` | Google Places API key (server-side only) |
| `PAGESPEED_API_KEY` | PageSpeed Insights API key (server-side only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for server-side writes) |

**Note:** Vercel serverless functions time out at 30s — the SSE score stream should process businesses in small batches to avoid mid-stream kills on large result sets.

---

## Out of Scope (v1)

- Email finding / Hunter.io integration
- Instantly.ai / outreach automation
- SMS integration
- Multi-user accounts
- Mobile app
- GoHighLevel integration (listed in brand files, future consideration)

---

## Future Considerations

- Instantly.ai API integration for bulk email sequences once pipeline has clients
- Stats page: deals won per month, conversion rate per stage, revenue tracked
- GoHighLevel CRM sync (seen in brand assets — potential future integration)
