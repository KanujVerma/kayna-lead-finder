# Design Refresh — Kayna Lead Finder

**Date:** 2026-03-27
**Status:** Approved

---

## Goal

Apply the Kayna Design System to the lead-finder app so it matches the aesthetic of kayna-site.vercel.app. The app should feel like a premium dark tool, not a generic SaaS dashboard.

---

## Design Tokens

Replacing existing CSS variables in `app/globals.css`:

| Token | Value | Usage |
|---|---|---|
| `--color-bg` | `#080808` | Page background |
| `--color-surface` | `#0f0f0f` | Cards, sidebar, inputs |
| `--color-border` | `#1a1a1a` | All borders and dividers |
| `--color-heading` | `#ffffff` | H1–H6, lead names |
| `--color-body` | `#b8b8b8` | Table cell text |
| `--color-muted` | `#909090` | Secondary labels, nav links |
| `--color-dim` | `#555555` | Tertiary text, category labels, placeholders |
| `--color-accent` | `#5ce1e6` | CTA buttons, active states, links, score-hot pill |

---

## Typography

Two fonts loaded via Google Fonts in `app/layout.tsx`:

- **Cormorant Garamond** weight 300 (regular + italic) — page headings, logo wordmark
- **Inter** weight 400 + 500 — all body, nav, labels, buttons, table cells

### Usage rules

| Element | Font | Size | Weight | Color |
|---|---|---|---|---|
| Page h1 (Lead Finder, Pipeline, Stats) | Cormorant | 40px | 300 | `--color-heading` |
| Italic subheadline | Cormorant italic | 17px | 300 | `--color-muted` |
| Overline labels | Inter | 10px, uppercase, tracking 0.18em | 400 | `--color-accent` |
| Small dim labels (categories, col headers) | Inter | 10–11px, uppercase, tracking 0.08–0.14em | 400 | `--color-dim` |
| Body / table cells | Inter | 13px | 400 | `--color-body` |
| Logo wordmark "Kayna" | Cormorant | 22px | 300 | `--color-heading` |
| Logo sub "Lead Finder" | Inter | 9px, uppercase, tracking 0.2em | 400 | `--color-dim` |

---

## Components

### Sidebar (`components/Sidebar.tsx`)

- Background: `--color-surface`, right border: `--color-border`
- **Logo area** (row layout, left-aligned):
  - Left: chevron SVG (single upward `^`, stroke `#5ce1e6`, stroke-width 5.5, rounded caps) — 30×30px
  - Right column: "Kayna" in Cormorant 300 22px + "LEAD FINDER" in Inter 9px `--color-dim` with `margin-top: 6px`
  - No sign-out button — app has no user accounts
- **Nav links**: Inter 13px, inactive `--color-muted`, active `--color-accent` with `rgba(92,225,230,0.06)` bg and 2px cyan left-bar indicator
- Remove old `font-bold` / `system-ui` references

### Page heading block (used in FinderShell, pipeline page, stats page)

```
[overline: "Prospecting" / "Pipeline" / "Stats" — accent, uppercase, tracking]
[h1: page name — Cormorant 300, 40px, white]
[italic sub: short description — Cormorant italic, 17px, muted]
```

### Search form inputs (`components/finder/SearchForm.tsx`)

- Background: `--color-surface`, border: `--color-border`, text: `--color-body`, placeholder: `--color-dim`
- Border-radius: 5px, padding: 9px 13px
- Submit button: `--color-accent` bg, black text, Inter 500 13px

### Filter pills (`components/finder/SortFilterBar.tsx`)

- Inactive: `--color-border` border, `--color-muted` text
- Active: `rgba(92,225,230,0.3)` border, `--color-accent` text, `rgba(92,225,230,0.05)` bg

### Results table (`components/finder/ResultsTable.tsx`, `LeadRow.tsx`)

- Column headers: Inter 10px uppercase tracking-widest, `--color-dim`, no bold
- Lead name: `--color-heading`, 13px
- Category sub-label: Inter 10px uppercase `--color-dim`
- All other cells: `--color-body`
- Row hover: `rgba(255,255,255,0.016)`
- Row divider: `--color-border`

### Score pills

| State | Background | Text |
|---|---|---|
| Hot (no website) | `rgba(92,225,230,0.1)` | `#5ce1e6` |
| Red (< 50) | `rgba(248,113,113,0.1)` | `#f87171` |
| Yellow (50–74) | `rgba(251,191,36,0.1)` | `#fbbf24` |
| Green (75+) | `rgba(74,222,128,0.1)` | `#4ade80` |

### Buttons

- **Primary (Search, login submit):** `--color-accent` bg, `#080808` text, Inter 500, 9px 22px padding, border-radius 5px
- **Ghost (+ CRM, filter pills, bulk actions):** transparent bg, `--color-border` border, `--color-muted` text; hover: border tints cyan, text goes accent

### Decorative wordmark

- Absolute positioned bottom-right of main content area
- Cormorant 300, ~170px, `rgba(255,255,255,0.028)`
- CSS mask: `linear-gradient(to bottom, transparent 0%, black 100%)` — fades from invisible at top to solid at bottom
- `pointer-events: none`, `aria-hidden="true"`

### Login page (`app/(auth)/login/page.tsx`)

- Same bg `#080808`, centered card on `--color-surface` with `--color-border` border
- Logo lockup (same as sidebar): chevron SVG + Cormorant wordmark + Inter sub
- "Access" or "Enter" as italic Cormorant subheadline above the form
- Input: same styles as search form
- Submit button: primary button style

---

## Files to modify

1. `app/globals.css` — replace color variables, add Google Fonts `@import`, update body font
2. `app/layout.tsx` — add `<link>` preconnect + Google Fonts stylesheet
3. `components/Sidebar.tsx` — new logo lockup, new nav styles, remove sign-out
4. `components/finder/FinderShell.tsx` — add overline + Cormorant h1 + italic sub, update heading styles
5. `components/finder/SearchForm.tsx` — update input + button styles
6. `components/finder/LeadRow.tsx` — update name/category/cell colors, score pill colors
7. `components/finder/SortFilterBar.tsx` — update filter pill styles
8. `components/finder/BulkActions.tsx` — update button styles
9. `components/pipeline/KanbanBoard.tsx` / `KanbanColumn.tsx` / `LeadCard.tsx` — update colors to use new tokens
10. `app/(auth)/login/page.tsx` — new logo lockup, Cormorant subheadline, updated input/button
11. `public/chevron.png` — already copied from Downloads

---

## Out of scope

- No new animations beyond existing `fadeUp` / `slideUp` (already in globals.css)
- No Framer Motion additions (not installed)
- No layout restructuring — sidebar width, column order, routing all stay the same
- No changes to API routes or data logic
