# Trash & In-Pipeline Detection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a trash/dismiss flow so businesses are hidden from future searches, show "In CRM" badge for pipeline leads, and provide a `/trash` page to restore dismissed entries.

**Architecture:** All state lives client-side. Shared helpers (`makeKey`, `readDismissed`, `writeDismissed`) live in `lib/dismissed.ts` and are imported by both `FinderShell` and the Trash page. `FinderShell` fetches the pipeline once on mount and reads localStorage for dismissed entries, then filters both sets out of displayed results before applying sort/filter. A new `/trash` page reads the same key and allows restoration.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, localStorage (no new API routes or DB changes)

**Spec:** `docs/superpowers/specs/2026-03-27-trash-and-pipeline-detection-design.md`

---

## Chunk 1: Shared utility + FinderShell logic

### Task 1: Create shared dismissed utility

**Files:**
- Create: `lib/dismissed.ts`

- [ ] **Step 1: Create `lib/dismissed.ts`**

  ```ts
  import type { Business } from '@/types'

  export const DISMISSED_KEY = 'kayna_dismissed_leads'

  /** Case-insensitive composite key used for dedup across the app. */
  export function makeKey(name: string, city: string): string {
    return `${name.toLowerCase()}|${city.toLowerCase()}`
  }

  export type DismissedEntry = Omit<Business, 'screenshot'>

  export function readDismissed(): DismissedEntry[] {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  export function writeDismissed(entries: DismissedEntry[]): void {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(entries))
    } catch {}
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles the new file**

  ```bash
  cd /Users/kanuj/kayna-lead-finder && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no new errors from `lib/dismissed.ts`.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/dismissed.ts
  git commit -m "feat: add shared dismissed-leads utility (makeKey, read/write)"
  ```

---

### Task 2: Update FinderShell with pipeline fetch and dismiss logic

**Files:**
- Modify: `components/finder/FinderShell.tsx`

- [ ] **Step 1: Read the file**

  Confirm current imports, state declarations, the `displayedBusinesses` computed chain (lines 27–49), `addToCRM` function, and `<ResultsTable>` usage.

- [ ] **Step 2: Add imports at top of file**

  After the existing imports, add:

  ```ts
  import { DISMISSED_KEY, makeKey, readDismissed, writeDismissed, type DismissedEntry } from '@/lib/dismissed'
  ```

- [ ] **Step 3: Add `pipelineNames` and `dismissed` state**

  After the existing `const [filterBy, ...]` line, add:

  ```ts
  const [pipelineNames, setPipelineNames] = useState<Set<string>>(new Set())
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  ```

- [ ] **Step 4: Add mount effect for dismissed + pipeline fetch**

  After the existing `useEffect` that persists results to sessionStorage, add:

  ```ts
  useEffect(() => {
    // Load dismissed keys from localStorage
    const entries = readDismissed()
    setDismissed(new Set(entries.map(e => makeKey(e.name, e.city))))

    // Fetch pipeline to build dedup set
    fetch('/api/leads')
      .then(r => r.ok ? r.json() : { leads: [] })
      .then(({ leads }) => {
        setPipelineNames(new Set(
          (leads as { name: string; city: string }[]).map(l => makeKey(l.name, l.city))
        ))
      })
      .catch(() => {}) // degrade gracefully — pipelineNames stays empty Set
  }, [])
  ```

- [ ] **Step 5: Replace `displayedBusinesses` with two-stage filter chain**

  Find the entire `const displayedBusinesses = businesses.filter(...).sort(...)` block and replace it so dismissed/pipeline filtering runs **first**, before filterBy:

  ```ts
  const displayedBusinesses = businesses
    .filter(b => {
      const key = makeKey(b.name, b.city)
      if (dismissed.has(key)) return false
      if (pipelineNames.has(key)) return false
      return true
    })
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
      return a.name.localeCompare(b.name)
    })
  ```

- [ ] **Step 6: Add `handleDismiss` function**

  After `handleExportCSV`, add:

  ```ts
  const handleDismiss = (business: Business) => {
    const key = makeKey(business.name, business.city)
    // Build lean entry — explicitly exclude screenshot to avoid filling localStorage
    const lean: DismissedEntry = {
      id: business.id,
      name: business.name,
      category: business.category,
      city: business.city,
      phone: business.phone,
      website: business.website,
      rating: business.rating,
      score: business.score,
    }
    const current = readDismissed().filter(e => makeKey(e.name, e.city) !== key)
    writeDismissed([...current, lean])
    setDismissed(prev => new Set([...prev, key]))
    setBusinesses(prev => prev.filter(b => makeKey(b.name, b.city) !== key))
    setSelected(prev => { const next = new Set(prev); next.delete(business.id); return next })
  }
  ```

- [ ] **Step 7: Refresh `pipelineNames` after `addToCRM` succeeds**

  Find the `addToCRM` function. After `showToast(...)`, add a re-fetch:

  ```ts
  if (res.ok) {
    const label = items.length === 1 ? items[0].name : `${items.length} leads`
    showToast(`${label} added to CRM`)
    fetch('/api/leads')
      .then(r => r.ok ? r.json() : { leads: [] })
      .then(({ leads }) => {
        setPipelineNames(new Set(
          (leads as { name: string; city: string }[]).map(l => makeKey(l.name, l.city))
        ))
      })
      .catch(() => {})
  }
  ```

- [ ] **Step 8: Pass new props to `<ResultsTable>`**

  Find the `<ResultsTable>` JSX and add two props:

  ```tsx
  <ResultsTable
    businesses={displayedBusinesses}
    selected={selected}
    onToggle={toggleSelect}
    onAddOne={b => addToCRM([b])}
    onDismiss={handleDismiss}
    pipelineNames={pipelineNames}
  />
  ```

- [ ] **Step 9: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no new errors. If `ResultsTable` Props don't yet include `onDismiss`/`pipelineNames` you'll see type errors — that's fine, they'll be fixed in Task 3.

- [ ] **Step 10: Commit**

  ```bash
  git add components/finder/FinderShell.tsx
  git commit -m "feat: finder shell — pipeline dedup, dismiss to localStorage, filter excluded leads"
  ```

---

## Chunk 2: ResultsTable + LeadRow

### Task 3: Thread `onDismiss` and `pipelineNames` through ResultsTable

**Files:**
- Modify: `components/finder/ResultsTable.tsx`

- [ ] **Step 1: Read the file**

  Confirm the `Props` interface and the `businesses.map(b => <LeadRow ...>)` block.

- [ ] **Step 2: Replace entire file**

  ```tsx
  'use client'
  import type { Business } from '@/types'
  import { makeKey } from '@/lib/dismissed'
  import LeadRow from './LeadRow'

  const HEADERS = ['', 'Business', 'Phone', 'Rating', 'Website', 'Score', 'Preview', '']

  interface Props {
    businesses: Business[]
    selected: Set<string>
    onToggle: (id: string) => void
    onAddOne: (business: Business) => void
    onDismiss: (business: Business) => void
    pipelineNames: Set<string>
  }

  export default function ResultsTable({ businesses, selected, onToggle, onAddOne, onDismiss, pipelineNames }: Props) {
    if (businesses.length === 0) return null

    return (
      <div
        className="overflow-hidden rounded-xl"
        style={{ border: '1px solid var(--color-border)' }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ background: 'var(--color-surface)' }}>
              {HEADERS.map((h, i) => (
                <th
                  key={i}
                  className="py-2.5 px-3 text-left first:pl-4 last:pr-4"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 10,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.14em',
                    color: 'var(--color-dim)',
                    fontWeight: 400,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {businesses.map(b => (
              <LeadRow
                key={b.id}
                business={b}
                checked={selected.has(b.id)}
                onToggle={() => onToggle(b.id)}
                onAddToCRM={() => onAddOne(b)}
                onDismiss={() => onDismiss(b)}
                inPipeline={pipelineNames.has(makeKey(b.name, b.city))}
              />
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add components/finder/ResultsTable.tsx
  git commit -m "feat: results table — thread onDismiss and inPipeline to LeadRow"
  ```

---

### Task 4: Add trash icon and "In CRM" badge to LeadRow

**Files:**
- Modify: `components/finder/LeadRow.tsx`

- [ ] **Step 1: Read the file**

  Focus on the `Props` interface (~lines 105–110) and the last `<td>` with the "+ CRM" button (~lines 171–188).

- [ ] **Step 2: Extend `Props` and destructure**

  Replace the existing `Props` interface and function signature:

  ```ts
  interface Props {
    business: Business
    checked: boolean
    onToggle: () => void
    onAddToCRM: () => void
    onDismiss: () => void
    inPipeline: boolean
  }

  export default function LeadRow({ business, checked, onToggle, onAddToCRM, onDismiss, inPipeline }: Props) {
  ```

- [ ] **Step 3: Replace the last `<td>` (the CRM button cell)**

  Find:
  ```tsx
  <td className="py-3 px-3 pr-4">
    <button
      onClick={onAddToCRM}
      className="text-xs transition-colors"
      style={{
        border: '1px solid var(--color-border)',
        color: 'var(--color-muted)',
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        borderRadius: 4,
        padding: '4px 10px',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      + CRM
    </button>
  </td>
  ```

  Replace with:
  ```tsx
  <td className="py-3 px-3 pr-4">
    <div className="flex items-center gap-2">
      {inPipeline ? (
        <span style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          color: 'var(--color-dim)',
          padding: '4px 10px',
        }}>
          In CRM
        </span>
      ) : (
        <button
          onClick={onAddToCRM}
          className="text-xs transition-colors"
          style={{
            border: '1px solid var(--color-border)',
            color: 'var(--color-muted)',
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            borderRadius: 4,
            padding: '4px 10px',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          + CRM
        </button>
      )}
      <button
        onClick={onDismiss}
        title="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          color: 'var(--color-dim)',
          lineHeight: 1,
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-dim)')}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Dismiss">
          <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  </td>
  ```

- [ ] **Step 4: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add components/finder/LeadRow.tsx
  git commit -m "feat: lead row — dismiss icon button, In CRM badge"
  ```

---

## Chunk 3: Trash page + Sidebar

### Task 5: Create the Trash page

**Files:**
- Create: `app/(app)/trash/page.tsx`

- [ ] **Step 1: Confirm the `(app)` directory exists**

  ```bash
  ls /Users/kanuj/kayna-lead-finder/app/\(app\)/
  ```

  Expected: `finder/`, `pipeline/`, `stats/` visible. The new `trash/` page inherits the `(app)` layout's auth guard.

- [ ] **Step 2: Create `app/(app)/trash/page.tsx`**

  ```tsx
  'use client'
  import { useState, useEffect } from 'react'
  import type { Business } from '@/types'
  import { DISMISSED_KEY, makeKey, writeDismissed, type DismissedEntry } from '@/lib/dismissed'

  export default function TrashPage() {
    const [dismissed, setDismissed] = useState<DismissedEntry[]>([])

    useEffect(() => {
      try {
        const raw = localStorage.getItem(DISMISSED_KEY)
        setDismissed(raw ? JSON.parse(raw) : [])
      } catch { setDismissed([]) }
    }, [])

    function restore(entry: DismissedEntry) {
      const key = makeKey(entry.name, entry.city)
      const updated = dismissed.filter(d => makeKey(d.name, d.city) !== key)
      writeDismissed(updated)
      setDismissed(updated)
    }

    return (
      <div style={{ position: 'relative' }}>
        {/* Page heading */}
        <div style={{ marginBottom: 28 }}>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: 'var(--color-accent)',
            marginBottom: 5,
          }}>
            Dismissed
          </p>
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            fontSize: 40,
            color: 'var(--color-heading)',
            lineHeight: 1.05,
            marginBottom: 3,
          }}>
            Trash
          </h1>
          <p style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            fontStyle: 'italic',
            fontSize: 17,
            color: 'var(--color-muted)',
          }}>
            businesses you&apos;ve dismissed from search results
          </p>
        </div>

        {dismissed.length === 0 ? (
          <p style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            fontStyle: 'italic',
            fontSize: 17,
            color: 'var(--color-dim)',
            marginTop: 40,
          }}>
            No dismissed leads.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: 'var(--color-surface)' }}>
                  {['Business', 'Category', 'City', 'Website', 'Score', ''].map((h, i) => (
                    <th
                      key={i}
                      className="py-2.5 px-3 text-left first:pl-4 last:pr-4"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 10,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.14em',
                        color: 'var(--color-dim)',
                        fontWeight: 400,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dismissed.map(b => (
                  <tr
                    key={makeKey(b.name, b.city)}
                    className="kayna-row"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <td className="py-3 pl-4 px-3">
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-heading)' }}>
                        {b.name}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-sm" style={{ color: 'var(--color-dim)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>
                      {b.category}
                    </td>
                    <td className="py-3 px-3 text-sm" style={{ color: 'var(--color-muted)' }}>
                      {b.city}
                    </td>
                    <td className="py-3 px-3 text-sm" style={{ maxWidth: 200 }}>
                      {b.website ? (
                        <a href={b.website} target="_blank" rel="noopener noreferrer" className="underline truncate block" style={{ color: 'var(--color-accent)', maxWidth: 180 }}>
                          {b.website.replace(/^https?:\/\//, '')}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--color-dim)' }}>—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-sm" style={{ color: 'var(--color-muted)' }}>
                      {typeof b.score === 'number' ? b.score : <span style={{ color: 'var(--color-dim)' }}>—</span>}
                    </td>
                    <td className="py-3 px-3 pr-4">
                      <button
                        onClick={() => restore(b)}
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 11,
                          color: 'var(--color-muted)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 4,
                          padding: '4px 10px',
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-body)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add "app/(app)/trash/page.tsx"
  git commit -m "feat: trash page — view and restore dismissed leads"
  ```

---

### Task 6: Add Trash to Sidebar nav

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Read the file**

  Confirm the `nav` array (currently 3 items).

- [ ] **Step 2: Add Trash nav item**

  Find:
  ```ts
  const nav = [
    { href: '/finder',   label: 'Lead Finder' },
    { href: '/pipeline', label: 'Pipeline' },
    { href: '/stats',    label: 'Stats' },
  ]
  ```

  Replace with:
  ```ts
  const nav = [
    { href: '/finder',   label: 'Lead Finder' },
    { href: '/pipeline', label: 'Pipeline' },
    { href: '/stats',    label: 'Stats' },
    { href: '/trash',    label: 'Trash' },
  ]
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add components/Sidebar.tsx
  git commit -m "feat: sidebar — add Trash nav item"
  ```

---

## Chunk 4: Build verification and deploy

### Task 7: Build check, smoke test, and deploy

- [ ] **Step 1: Run production build**

  ```bash
  cd /Users/kanuj/kayna-lead-finder && npm run build 2>&1 | tail -25
  ```

  Expected: route table includes `/trash`, no TypeScript or build errors.

- [ ] **Step 2: Fix any build errors**

  Common issues:
  - TypeScript error on `onDismiss`/`inPipeline` — check all three files (`FinderShell`, `ResultsTable`, `LeadRow`) have matching prop types
  - `DismissedEntry` import missing from trash page — confirm `lib/dismissed.ts` exports it
  - `makeKey` not found in `ResultsTable` — confirm it imports from `@/lib/dismissed`

- [ ] **Step 3: Manual smoke test**

  - Visit `/finder`, run a search
  - Click the × icon on a result — it should disappear immediately
  - Re-run the same search — the dismissed business should not appear
  - Visit `/trash` via sidebar — the dismissed business should appear in the table
  - Click Restore — it should disappear from trash
  - Re-run the original search — the business should reappear
  - Add a business to CRM via "+ CRM" — after the toast, that business's row should show "In CRM" on the next search

- [ ] **Step 4: Deploy**

  ```bash
  vercel --prod 2>&1 | tail -10
  ```

  Expected: `Aliased: https://kayna-lead-finder.vercel.app`
