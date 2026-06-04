# Screenshots + Sort/Filter Design Spec

## Goal

Add website screenshot thumbnails and sort/filter controls to the Lead Finder results table, giving users a fast visual signal to judge lead quality without clicking out to each site.

## Architecture

Two independent enhancements to the finder flow:

1. **Screenshot extraction** — pull the base64 screenshot already returned by the PageSpeed API response; store on the `Business` type; display as a thumbnail in `LeadRow` that expands on hover.
2. **Sort/filter controls** — client-side state in `FinderShell` that derives a sorted/filtered view of the `businesses` array; rendered as controls above the results table.

No new API calls, no new routes, no schema changes.

---

## Feature 1: Screenshot Thumbnails

### Data flow
- `FinderShell.tsx` already calls the PageSpeed API per business. The response includes `lighthouseResult.audits['final-screenshot'].details.data` — a base64 JPEG data URL.
- Extract it alongside the score and call `setBusinesses` with both `score` and `screenshot`.

### Type change
Add `screenshot?: string | null` to the `Business` interface in `types/index.ts`.

### Display
- `LeadRow.tsx` gets a new rightmost column: **Preview**.
- Before scoring completes: a 40×28px grey shimmer placeholder.
- After scoring: a 40×28px `<img>` thumbnail (rounded corners, border matching brand).
- On hover: a popover (~300px wide, full screenshot) appears above/below the thumbnail using the existing `Tooltip`-style approach (absolute positioned, z-50, fade-in animation).
- No modal, no click required — hover is enough.

### Fallback
If `screenshot` is null (no website, or PageSpeed returned no screenshot), show nothing in the Preview column.

---

## Feature 2: Sort & Filter

### State
Two new state variables in `FinderShell`:
- `sortBy: 'score-asc' | 'score-desc' | 'rating-desc' | 'name-asc'` — default `'score-asc'` (worst sites first = best leads first)
- `filterBy: 'all' | 'score-lt-50' | 'score-lt-70' | 'no-website'` — default `'all'`

Derive `displayedBusinesses` from `businesses` by applying filter then sort. Pass `displayedBusinesses` to `ResultsTable` instead of `businesses`.

### Controls UI
Rendered in a new `SortFilterBar` component, placed between `SearchForm` and `BulkActions` in `FinderShell`. Only shown when `businesses.length > 0`.

- **Sort**: a small styled `<select>` with options: "Score ↑ (worst first)", "Score ↓ (best first)", "Rating ↓", "Name A–Z"
- **Filter**: four pill buttons (like tabs): "All", "Score < 50", "Score < 70", "No website"
- Active filter pill gets teal border/text. Matches existing brand tokens (`var(--accent)`).

### BulkActions scope
`BulkActions` and CSV export should operate on `displayedBusinesses` (the filtered/sorted view), not the full `businesses` array, so "Export CSV" exports only what's visible.

---

## Files Changed

| File | Change |
|------|--------|
| `types/index.ts` | Add `screenshot?: string \| null` to `Business` |
| `components/finder/FinderShell.tsx` | Extract screenshot from PageSpeed response; add sort/filter state + derived `displayedBusinesses`; pass to updated components |
| `components/finder/LeadRow.tsx` | Add Preview column with thumbnail + hover popover |
| `components/finder/ResultsTable.tsx` | Pass through `screenshot` to `LeadRow`; accept `displayedBusinesses` |
| `components/finder/SortFilterBar.tsx` | New component: sort select + filter pills |
| `components/finder/BulkActions.tsx` | Accept displayed businesses for export scope |

---

## Out of Scope

- Persisting sort/filter preference across sessions
- Filtering by category or city
- Screenshots on pipeline cards
