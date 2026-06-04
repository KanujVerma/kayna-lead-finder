# Screenshots + Sort/Filter Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add website screenshot thumbnails (extracted from the existing PageSpeed API response) and sort/filter controls to the Lead Finder results table.

**Architecture:** No new API calls or routes needed. Screenshots live in the `Business` type and are extracted client-side. Sort/filter is pure client-side state in `FinderShell` that derives a `displayedBusinesses` view. A new `SortFilterBar` component renders the controls.

**Tech Stack:** React 19, Next.js 16 App Router, TypeScript 5, Tailwind CSS 4, existing brand CSS variables (`var(--accent)`, `var(--border)`, `var(--muted)`, `var(--text)`)

---

## File Map

| File | Change |
|------|--------|
| `types/index.ts` | Add `screenshot?: string \| null` to `Business` |
| `components/finder/FinderShell.tsx` | Extract screenshot from PageSpeed; add sort/filter state + `displayedBusinesses` |
| `components/finder/SortFilterBar.tsx` | **New** — sort select + filter pills |
| `components/finder/ResultsTable.tsx` | Add "Preview" header column; pass `screenshot` to `LeadRow` |
| `components/finder/LeadRow.tsx` | Add Preview column with thumbnail + hover popover |
| `components/finder/BulkActions.tsx` | No change needed (receives whatever array FinderShell passes) |

---

## Task 1: Add `screenshot` to the `Business` type

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add field to interface**

In `types/index.ts`, change:
```typescript
export interface Business {
  id: string
  name: string
  category: string
  city: string
  phone: string
  website: string | null
  rating: number | null
  reviewCount: number | null
  score: number | null | 'loading' | 'error'
}
```
To:
```typescript
export interface Business {
  id: string
  name: string
  category: string
  city: string
  phone: string
  website: string | null
  rating: number | null
  reviewCount: number | null
  score: number | null | 'loading' | 'error'
  screenshot?: string | null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/kanuj/kayna-lead-finder && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors (the field is optional so no downstream breakage).

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add screenshot field to Business type"
```

---

## Task 2: Extract screenshot from PageSpeed response in FinderShell

**Files:**
- Modify: `components/finder/FinderShell.tsx` (lines 50–74, the scoring loop)

The current scoring loop in `FinderShell.tsx`:
```typescript
const data = await res.json()
const rawScore = data?.lighthouseResult?.categories?.performance?.score
const score = rawScore != null ? Math.round(rawScore * 100) : null
setBusinesses(prev =>
  prev.map(biz => biz.id === b.id ? { ...biz, score: score != null ? score : 'error' } : biz)
)
```

- [ ] **Step 1: Extract screenshot alongside score**

Replace the scoring update block (inside the `try` inside the `Promise.all` map) with:
```typescript
const data = await res.json()
const rawScore = data?.lighthouseResult?.categories?.performance?.score
const score = rawScore != null ? Math.round(rawScore * 100) : null
const screenshot: string | null =
  data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data ?? null
setBusinesses(prev =>
  prev.map(biz => biz.id === b.id
    ? { ...biz, score: score != null ? score : 'error', screenshot }
    : biz
  )
)
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/kanuj/kayna-lead-finder && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Verify screenshot is populated (quick test)**

Open the browser dev tools after triggering a search. After scoring completes, run in console:
```javascript
JSON.parse(sessionStorage.getItem('kayna_finder_results'))[0].screenshot?.slice(0, 50)
```
Expected: `"data:image/jpeg;base64,/9j/..."` (base64 JPEG prefix)

- [ ] **Step 4: Commit**

```bash
git add components/finder/FinderShell.tsx
git commit -m "feat: extract PageSpeed screenshot into Business state"
```

---

## Task 3: Create SortFilterBar component

**Files:**
- Create: `components/finder/SortFilterBar.tsx`

This component receives the current sort/filter values and callbacks. It renders a row with a sort dropdown on the left and filter pills on the right.

- [ ] **Step 1: Create the file**

```typescript
'use client'

export type SortBy = 'score-asc' | 'score-desc' | 'rating-desc' | 'name-asc'
export type FilterBy = 'all' | 'score-lt-50' | 'score-lt-70' | 'no-website'

interface Props {
  sortBy: SortBy
  filterBy: FilterBy
  onSort: (v: SortBy) => void
  onFilter: (v: FilterBy) => void
  totalCount: number
  filteredCount: number
}

const FILTER_OPTIONS: { value: FilterBy; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'score-lt-50', label: 'Score < 50' },
  { value: 'score-lt-70', label: 'Score < 70' },
  { value: 'no-website', label: 'No website' },
]

export default function SortFilterBar({
  sortBy, filterBy, onSort, onFilter, totalCount, filteredCount,
}: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap py-1">
      {/* Sort */}
      <select
        value={sortBy}
        onChange={e => onSort(e.target.value as SortBy)}
        className="text-xs rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer"
        style={{
          background: '#111',
          border: '1px solid var(--border)',
          color: 'var(--muted)',
        }}
      >
        <option value="score-asc">Score ↑ (worst first)</option>
        <option value="score-desc">Score ↓ (best first)</option>
        <option value="rating-desc">Rating ↓</option>
        <option value="name-asc">Name A–Z</option>
      </select>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onFilter(opt.value)}
            className="text-xs px-3 py-1 rounded-full transition-colors"
            style={{
              border: filterBy === opt.value
                ? '1px solid var(--accent)'
                : '1px solid var(--border)',
              color: filterBy === opt.value ? 'var(--accent)' : 'var(--muted)',
              background: 'transparent',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Count indicator when filtered */}
      {filterBy !== 'all' && (
        <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>
          {filteredCount} of {totalCount}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/kanuj/kayna-lead-finder && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/finder/SortFilterBar.tsx
git commit -m "feat: add SortFilterBar component with sort select and filter pills"
```

---

## Task 4: Wire sort/filter into FinderShell

**Files:**
- Modify: `components/finder/FinderShell.tsx`

- [ ] **Step 1: Import SortFilterBar and its types**

At the top of `FinderShell.tsx`, add:
```typescript
import SortFilterBar, { type SortBy, type FilterBy } from './SortFilterBar'
```

- [ ] **Step 2: Add sort/filter state**

Inside the `FinderShell` component, after the existing state declarations, add:
```typescript
const [sortBy, setSortBy] = useState<SortBy>('score-asc')
const [filterBy, setFilterBy] = useState<FilterBy>('all')
```

- [ ] **Step 3: Derive displayedBusinesses**

After the state declarations, add this derived value (no useMemo needed — it's fast):
```typescript
const displayedBusinesses = businesses
  .filter(b => {
    if (filterBy === 'score-lt-50') return typeof b.score === 'number' && b.score < 50
    if (filterBy === 'score-lt-70') return typeof b.score === 'number' && b.score < 70
    if (filterBy === 'no-website') return b.website === null
    return true
  })
  .sort((a, b) => {
    if (sortBy === 'score-asc') {
      const sa = typeof a.score === 'number' ? a.score : 999
      const sb = typeof b.score === 'number' ? b.score : 999
      return sa - sb
    }
    if (sortBy === 'score-desc') {
      const sa = typeof a.score === 'number' ? a.score : -1
      const sb = typeof b.score === 'number' ? b.score : -1
      return sb - sa
    }
    if (sortBy === 'rating-desc') {
      return (b.rating ?? 0) - (a.rating ?? 0)
    }
    // name-asc
    return a.name.localeCompare(b.name)
  })
```

- [ ] **Step 4: Reset sort/filter on new search**

In `handleSearch`, after `setSelected(new Set())`, add:
```typescript
setSortBy('score-asc')
setFilterBy('all')
```

- [ ] **Step 5: Add SortFilterBar to the JSX**

In the JSX, find the section that renders when `businesses.length > 0`. Add `SortFilterBar` between the `BulkActions` row and `ResultsTable`. Also update `BulkActions` and `ResultsTable` to use `displayedBusinesses`:

Change:
```tsx
<div className="mt-6 space-y-2">
  <div className="flex items-center justify-between">
    <BulkActions
      businesses={businesses}
      selected={selected}
      onSelectAll={() => setSelected(new Set(businesses.map(b => b.id)))}
      onClearAll={() => setSelected(new Set())}
      onAddToCRM={() => addToCRM(businesses.filter(b => selected.has(b.id)))}
      onExportCSV={handleExportCSV}
    />
    <button
      onClick={() => { setBusinesses([]); setSelected(new Set()) }}
      className="text-xs ml-4 hover:underline flex-shrink-0"
      style={{ color: 'var(--muted)' }}
    >
      Clear results
    </button>
  </div>
  <ResultsTable
    businesses={businesses}
    selected={selected}
    onToggle={toggleSelect}
    onAddOne={b => addToCRM([b])}
  />
</div>
```

To:
```tsx
<div className="mt-6 space-y-2">
  <div className="flex items-center justify-between">
    <BulkActions
      businesses={displayedBusinesses}
      selected={selected}
      onSelectAll={() => setSelected(new Set(displayedBusinesses.map(b => b.id)))}
      onClearAll={() => setSelected(new Set())}
      onAddToCRM={() => addToCRM(displayedBusinesses.filter(b => selected.has(b.id)))}
      onExportCSV={handleExportCSV}
    />
    <button
      onClick={() => { setBusinesses([]); setSelected(new Set()) }}
      className="text-xs ml-4 hover:underline flex-shrink-0"
      style={{ color: 'var(--muted)' }}
    >
      Clear results
    </button>
  </div>
  <SortFilterBar
    sortBy={sortBy}
    filterBy={filterBy}
    onSort={setSortBy}
    onFilter={setFilterBy}
    totalCount={businesses.length}
    filteredCount={displayedBusinesses.length}
  />
  <ResultsTable
    businesses={displayedBusinesses}
    selected={selected}
    onToggle={toggleSelect}
    onAddOne={b => addToCRM([b])}
  />
</div>
```

- [ ] **Step 6: Update handleExportCSV to use displayedBusinesses**

The current `handleExportCSV` references `businesses` directly. Change it to use `displayedBusinesses`:
```typescript
const handleExportCSV = () => {
  const headers = ['Name', 'Category', 'City', 'Phone', 'Website', 'Score', 'Rating']
  const rows = displayedBusinesses.map(b => [
    b.name, b.category, b.city, b.phone,
    b.website ?? '',
    typeof b.score === 'number' ? b.score : '',
    b.rating ?? '',
  ])
  // ... rest unchanged
```

Note: `displayedBusinesses` is declared above `handleExportCSV` so this works without any closure issues. If TypeScript complains about referencing it before declaration, move `handleExportCSV` below the `displayedBusinesses` derivation.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /Users/kanuj/kayna-lead-finder && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add components/finder/FinderShell.tsx
git commit -m "feat: wire sort/filter state and displayedBusinesses into FinderShell"
```

---

## Task 5: Add screenshot thumbnail to LeadRow

**Files:**
- Modify: `components/finder/LeadRow.tsx`
- Modify: `components/finder/ResultsTable.tsx`

### ResultsTable: add "Preview" header

- [ ] **Step 1: Add Preview header column**

In `ResultsTable.tsx`, change:
```typescript
const HEADERS = ['', 'Business', 'Phone', 'Rating', 'Website', 'Score', '']
```
To:
```typescript
const HEADERS = ['', 'Business', 'Phone', 'Rating', 'Website', 'Score', 'Preview', '']
```

### LeadRow: add screenshot thumbnail with hover popover

- [ ] **Step 2: Accept screenshot in LeadRow props**

In `LeadRow.tsx`, update the Props interface:
```typescript
interface Props {
  business: Business
  checked: boolean
  onToggle: () => void
  onAddToCRM: () => void
}
```
No change needed — `business` already contains `screenshot` via the `Business` type.

- [ ] **Step 3: Add ScreenshotPreview component inside LeadRow.tsx**

Add this component above the `LeadRow` default export:
```typescript
function ScreenshotPreview({ screenshot, score }: { screenshot?: string | null; score: Business['score'] }) {
  const [hovered, setHovered] = useState(false)

  // Only show if scoring is done (not loading) and screenshot exists
  if (score === 'loading') {
    return (
      <div
        className="animate-pulse rounded"
        style={{ width: 48, height: 32, background: 'var(--border)' }}
      />
    )
  }

  if (!screenshot) return <span style={{ color: 'var(--muted)' }}>—</span>

  return (
    <span
      className="relative inline-block cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <img
        src={screenshot}
        alt="Site preview"
        style={{
          width: 48,
          height: 32,
          objectFit: 'cover',
          objectPosition: 'top',
          borderRadius: 4,
          border: '1px solid var(--border)',
          display: 'block',
        }}
      />
      {/* Hover popover */}
      {hovered && (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 pointer-events-none"
          style={{
            animation: 'fadeIn 0.15s ease',
            filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.7))',
          }}
        >
          <img
            src={screenshot}
            alt="Site preview large"
            style={{
              width: 300,
              borderRadius: 8,
              border: '1px solid rgba(92,225,230,0.25)',
              display: 'block',
            }}
          />
        </div>
      )}
    </span>
  )
}
```

Also add `useState` to the import at the top:
```typescript
'use client'
import { useState } from 'react'
import type { Business } from '@/types'
import Tooltip from '@/components/ui/Tooltip'
```

- [ ] **Step 4: Add Preview column to the table row**

In the `LeadRow` return, add a new `<td>` before the "Add to CRM" button `<td>`:
```tsx
<td className="py-3 px-3">
  <ScreenshotPreview screenshot={business.screenshot} score={score} />
</td>
```

The full row order will be: checkbox | Business | Phone | Rating | Website | Score | Preview | Add to CRM

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/kanuj/kayna-lead-finder && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/finder/LeadRow.tsx components/finder/ResultsTable.tsx
git commit -m "feat: add screenshot thumbnail with hover popover to results table"
```

---

## Task 6: Deploy and verify

- [ ] **Step 1: Final build check**

```bash
cd /Users/kanuj/kayna-lead-finder && npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully`

- [ ] **Step 2: Deploy**

```bash
vercel --prod 2>&1 | tail -8
```

- [ ] **Step 3: Manual smoke test**

1. Search for "Dentist" in "Pleasanton, CA"
2. Verify scores populate 5 at a time
3. Verify screenshot thumbnails appear once scoring is done
4. Hover a thumbnail — popover should expand to 300px width
5. Change sort to "Score ↓" — best sites surface first
6. Filter to "Score < 50" — only poor sites show, count badge appears
7. Export CSV — only visible (filtered) rows export

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: post-deploy adjustments for screenshots and sort/filter"
```
