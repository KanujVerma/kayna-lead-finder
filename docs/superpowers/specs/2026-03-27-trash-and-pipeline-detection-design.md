# Trash & In-Pipeline Detection — Design Spec

**Date:** 2026-03-27
**Project:** kayna-lead-finder

---

## Overview

Two related features to prevent duplicate work in the lead finder:

1. **Trash (dismiss):** Users can dismiss any business from search results. Dismissed businesses are hidden from all future searches. A `/trash` page shows all dismissed businesses with a restore option.
2. **In-pipeline detection:** Businesses already in the CRM pipeline are visually flagged in search results and cannot be re-added.

---

## Types

`Business` is defined in `@/types`:
```ts
interface Business {
  id: string
  name: string
  category: string
  city: string
  phone: string | null
  website: string | null
  rating: number | null
  score: number | 'loading' | 'error' | null
  screenshot?: string | null
}
```
All nullable fields must be handled defensively in the Trash table renderer (display `—` for null).

---

## Architecture

### Trash — localStorage-based persistence

**Storage key:** `kayna_dismissed_leads`
**Format:** JSON array of lean Business objects (screenshot field stripped)

```ts
type DismissedEntry = Omit<Business, 'screenshot'>
type DismissedStore = DismissedEntry[]
```

The `screenshot` field is stripped before saving — it is a base64 JPEG data URL (~20–80KB each) that would fill the 5MB localStorage cap within ~100 dismissals. The Trash page does not display screenshots, so no information is lost.

Match/lookup is by `name|city` composite key (case-insensitive comparison).

**Why localStorage over Supabase:** No schema changes, no API routes, instant reads on mount, sufficient for a single-user tool. Downside is device-specific — acceptable for current scope.

### In-Pipeline Detection — fetched on FinderShell mount

`FinderShell` calls `GET /api/leads` once on mount and builds:

```ts
const pipelineNames = new Set<string>(
  leads.map(l => `${l.name.toLowerCase()}|${l.city.toLowerCase()}`)
)
```

This set is passed down through `ResultsTable` → `LeadRow`. After any "Add to CRM" action, the set is refreshed.

---

## Components Changed

### `FinderShell.tsx`
- On mount: fetch `GET /api/leads`, build `pipelineNames` Set
- On mount: read `localStorage['kayna_dismissed_leads']`, build `dismissed` Set (name|city keys) + store full objects
- `handleDismiss(business)`: adds to localStorage + removes from `businesses` state
- Filter `displayedBusinesses`: exclude any business whose key is in `dismissed` or `pipelineNames`
- Pass `onDismiss` and `pipelineNames` through to `ResultsTable`
- Refresh `pipelineNames` after successful `addToCRM` via a full re-fetch of `GET /api/leads` (server is source of truth; optimistic local insert is not used)
- While the initial pipeline fetch is pending, `pipelineNames` is an empty Set — rows render without the "In CRM" badge. No skeleton is shown; the fetch resolves fast (internal Supabase) and the badge appears once. No flash mitigation required for v1.

### `ResultsTable.tsx`
- Accept `onDismiss: (b: Business) => void` and `pipelineNames: Set<string>` props
- For each row, compute `inPipeline = pipelineNames.has(`${b.name.toLowerCase()}|${b.city.toLowerCase()}`)` and pass the boolean to `LeadRow` (ResultsTable owns the Set lookup, not LeadRow)

### `LeadRow.tsx`
- Accept `onDismiss: () => void` and `inPipeline: boolean` props
- If `inPipeline`: replace "+ CRM" button with dim "In CRM" badge (no action)
- Add trash icon button (SVG, 14×14, `--color-dim`, hover to `#f87171`) in the last column, right of the CRM action

### `app/(app)/trash/page.tsx` (new, under the `(app)` route group)
- Protected by the existing `(app)` layout/middleware auth guard — no additional auth work needed
- `'use client'` — reads `localStorage['kayna_dismissed_leads']` on mount via `useEffect`
- Renders same page heading pattern (Cormorant h1, Inter overline, italic sub)
- Table: Name, Category, City, Website, Score, Restore button
- Restore button removes entry from localStorage and re-renders list
- Empty state: italic Cormorant message "No dismissed leads."

### `components/Sidebar.tsx`
- Add `{ href: '/trash', label: 'Trash' }` as 4th nav item

---

## Data Flow

```
Search results arrive
  → filter out dismissed (localStorage Set)
  → filter out inPipeline (Supabase Set)
  → render LeadRow with inPipeline + onDismiss props

User clicks trash icon
  → onDismiss(business) in FinderShell
  → append to localStorage array
  → remove from businesses state (disappears immediately)

User visits /trash
  → read localStorage
  → display list
  → Restore: remove from localStorage, re-render

User adds to CRM
  → existing flow (POST /api/leads)
  → refresh pipelineNames Set
  → row now shows "In CRM" badge
```

---

## Edge Cases

- **Same business, different city:** Treated as distinct (key is `name|city`)
- **localStorage unavailable (SSR / incognito):** Wrap reads in try/catch, degrade gracefully (no filtering)
- **Pipeline fetch fails:** Log error, `pipelineNames` stays empty — no filtering applied, no crash
- **Trash page on server render:** `'use client'` + `useEffect` for localStorage read avoids SSR mismatch

---

- **localStorage size:** Full Business objects are ~300–500 bytes each. localStorage is capped at ~5MB per origin. At that rate, 10,000+ dismissals would be needed to approach the limit — no pruning needed for v1. Bulk clear in the Trash page is out of scope.
- **Cross-tab consistency:** Dismissals made in one tab won't reflect in another open tab without a page reload. Acceptable for v1 single-user tool.

## Out of Scope

- Cross-device sync for dismissed leads
- Bulk restore / empty trash
- Dismissed leads count badge on sidebar nav item
