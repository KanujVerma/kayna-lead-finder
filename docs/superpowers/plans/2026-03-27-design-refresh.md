# Design Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Kayna Design System (dark premium aesthetic, Cormorant Garamond + Inter typography, updated color tokens) across all pages of the lead-finder app.

**Architecture:** Pure visual layer changes — replace CSS variables, swap fonts, update inline styles and classNames in components. No logic, routing, or data changes. All color references migrate from the old 6-token set (`--bg`, `--sidebar`, `--card`, `--border`, `--accent`, `--text`, `--muted`) to the new 8-token set (`--color-bg`, `--color-surface`, `--color-border`, `--color-heading`, `--color-body`, `--color-muted`, `--color-dim`, `--color-accent`).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Google Fonts (Cormorant Garamond + Inter)

**Spec:** `docs/superpowers/specs/2026-03-27-design-refresh-design.md`

---

## Chunk 1: Foundation — tokens, fonts, globals

### Task 1: Update CSS variables and load fonts

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Read both files before editing**

  Confirm current variable names (`--bg`, `--sidebar`, `--card`, `--border`, `--accent`, `--text`, `--muted`) and the existing `<html>` structure in layout.

- [ ] **Step 2: Update `app/globals.css`**

  Replace the entire `:root` block and `body` declaration:

  ```css
  @import "tailwindcss";

  :root {
    --color-bg:      #080808;
    --color-surface: #0f0f0f;
    --color-border:  #1a1a1a;
    --color-heading: #ffffff;
    --color-body:    #b8b8b8;
    --color-muted:   #909090;
    --color-dim:     #555555;
    --color-accent:  #5ce1e6;
  }

  * { box-sizing: border-box; }

  body {
    background: var(--color-bg);
    color: var(--color-body);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    margin: 0;
  }
  ```

  Keep all existing `@keyframes` and utility classes (`.kayna-page`, `.kayna-toast`, etc.) — do not remove them.

- [ ] **Step 3: Add Google Fonts to `app/layout.tsx`**

  Add preconnect links and the stylesheet `<link>` inside `<head>`:

  ```tsx
  import type { Metadata } from 'next'
  import './globals.css'

  export const metadata: Metadata = {
    title: 'Kayna Lead Finder',
    description: 'Find and track local business leads',
  }

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300&family=Inter:wght@400;500&display=swap"
            rel="stylesheet"
          />
        </head>
        <body>{children}</body>
      </html>
    )
  }
  ```

- [ ] **Step 4: Verify dev server starts without errors**

  ```bash
  cd /Users/kanuj/kayna-lead-finder && npm run dev
  ```

  Expected: Server starts on localhost:3000, no build errors in terminal. Body background should now be `#080808`.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/kanuj/kayna-lead-finder
  git add app/globals.css app/layout.tsx
  git commit -m "feat: apply Kayna design tokens and load Cormorant+Inter fonts"
  ```

---

## Chunk 2: Sidebar

### Task 2: Restyle Sidebar with new logo lockup and nav tokens

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Read the file**

  ```
  Read: components/Sidebar.tsx
  ```

- [ ] **Step 2: Replace the entire file contents**

  The key changes:
  - Logo area: chevron SVG (upward `^`, stroke `#5ce1e6`, stroke-width 5.5, rounded) left; "Kayna" in Cormorant 300 right; "LEAD FINDER" sub with `marginTop: 6`
  - Remove the `<Image>` import (no longer needed)
  - Remove sign-out / footer area entirely
  - Nav links: new token names, same active indicator logic

  ```tsx
  'use client'
  import Link from 'next/link'
  import { usePathname } from 'next/navigation'

  const nav = [
    { href: '/finder',   label: 'Lead Finder' },
    { href: '/pipeline', label: 'Pipeline' },
    { href: '/stats',    label: 'Stats' },
  ]

  export default function Sidebar() {
    const pathname = usePathname()

    return (
      <aside
        className="fixed left-0 top-0 h-full flex flex-col"
        style={{ width: 210, background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
            <path
              d="M4 21 L15 9 L26 21"
              stroke="#5ce1e6"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex flex-col">
            <span style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 300,
              fontSize: 22,
              color: 'var(--color-heading)',
              lineHeight: 1,
              letterSpacing: '0.04em',
            }}>
              Kayna
            </span>
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 9,
              color: 'var(--color-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              marginTop: 6,
            }}>
              Lead Finder
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map(({ href, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  color: active ? 'var(--color-accent)' : 'var(--color-muted)',
                  background: active ? 'rgba(92,225,230,0.06)' : 'transparent',
                  transition: 'color 0.15s, background 0.15s',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--color-body)'
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--color-muted)'
                }}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                    style={{ width: 2, height: 14, background: 'var(--color-accent)' }}
                  />
                )}
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>
    )
  }
  ```

- [ ] **Step 3: Check in browser**

  Visit localhost:3000/finder. Sidebar should show the cyan chevron, "Kayna" in a serif font, "LEAD FINDER" in small caps below it, and nav links in muted gray with cyan active state.

- [ ] **Step 4: Commit**

  ```bash
  git add components/Sidebar.tsx
  git commit -m "feat: sidebar — new chevron logo lockup, Cormorant wordmark, updated nav tokens"
  ```

---

## Chunk 3: Finder page — heading, search form, filter bar, bulk actions

### Task 3: Update FinderShell heading block

**Files:**
- Modify: `components/finder/FinderShell.tsx`

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Replace the heading block**

  Find:
  ```tsx
  <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text)' }}>
    Lead Finder
  </h1>
  ```

  Replace with:
  ```tsx
  <div style={{ marginBottom: 28 }}>
    <p style={{
      fontFamily: "'Inter', sans-serif",
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: 'var(--color-accent)',
      marginBottom: 5,
    }}>
      Prospecting
    </p>
    <h1 style={{
      fontFamily: "'Cormorant Garamond', serif",
      fontWeight: 300,
      fontSize: 40,
      color: 'var(--color-heading)',
      lineHeight: 1.05,
      marginBottom: 3,
    }}>
      Lead Finder
    </h1>
    <p style={{
      fontFamily: "'Cormorant Garamond', serif",
      fontWeight: 300,
      fontStyle: 'italic',
      fontSize: 17,
      color: 'var(--color-muted)',
    }}>
      discover businesses that need your services
    </p>
  </div>
  ```

  Update the toast to use new tokens:
  ```tsx
  // old
  background: '#111',
  // new
  background: 'var(--color-surface)',
  ```

  Update the "Clear results" button (line ~232):
  ```tsx
  // old
  style={{ color: 'var(--muted)' }}
  // new
  style={{ color: 'var(--color-dim)' }}
  ```

- [ ] **Step 3: Verify heading renders correctly**

  Reload localhost:3000/finder — should see cyan overline, large Cormorant heading, italic muted subtitle.

- [ ] **Step 4: Commit**

  ```bash
  git add components/finder/FinderShell.tsx
  git commit -m "feat: finder page heading — Cormorant h1, cyan overline, italic sub"
  ```

---

### Task 4: Update SearchForm inputs and button

**Files:**
- Modify: `components/finder/SearchForm.tsx`

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Update input and button styles**

  The `<Combobox>` components receive no inline styles directly — their styling comes from `components/ui/Combobox.tsx`. Update the submit button:

  Find:
  ```tsx
  className="kayna-btn font-semibold px-6 py-2.5 rounded-lg disabled:opacity-50"
  style={{ background: 'var(--accent)', color: '#0a0a0a', borderRadius: 8 }}
  ```

  Replace with:
  ```tsx
  className="kayna-btn disabled:opacity-50"
  style={{
    background: 'var(--color-accent)',
    color: '#080808',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
    fontSize: 13,
    padding: '9px 22px',
    borderRadius: 5,
    border: 'none',
    cursor: 'pointer',
  }}
  ```

- [ ] **Step 3: Update Combobox styles**

  Read `components/ui/Combobox.tsx` and update all color references from old tokens to new:
  - `var(--bg)` → `var(--color-bg)`
  - `var(--sidebar)` or `var(--card)` → `var(--color-surface)`
  - `var(--border)` → `var(--color-border)`
  - `var(--text)` → `var(--color-body)`
  - `var(--muted)` → `var(--color-muted)`
  - `var(--accent)` → `var(--color-accent)`
  - Any hardcoded `#111`, `#0a0a0a` dark backgrounds → `var(--color-surface)` or `var(--color-bg)`
  - Placeholder color → `var(--color-dim)`

- [ ] **Step 4: Verify in browser**

  Search form inputs and dropdowns should have dark surface background, dim placeholder text, and cyan primary button.

- [ ] **Step 5: Commit**

  ```bash
  git add components/finder/SearchForm.tsx components/ui/Combobox.tsx
  git commit -m "feat: search form — updated input and button to new design tokens"
  ```

---

### Task 5: Update SortFilterBar and BulkActions

**Files:**
- Modify: `components/finder/SortFilterBar.tsx`
- Modify: `components/finder/BulkActions.tsx`

- [ ] **Step 1: Read both files**

- [ ] **Step 2: Update SortFilterBar**

  Replace all old token references:

  The `<select>` element:
  ```tsx
  style={{
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-muted)',
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    borderRadius: 5,
    padding: '5px 10px',
  }}
  ```

  The filter pill buttons — inactive:
  ```tsx
  style={{
    border: `1px solid ${filterBy === opt.value ? 'rgba(92,225,230,0.3)' : 'var(--color-border)'}`,
    color: filterBy === opt.value ? 'var(--color-accent)' : 'var(--color-muted)',
    background: filterBy === opt.value ? 'rgba(92,225,230,0.05)' : 'transparent',
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    borderRadius: 4,
    padding: '3px 10px',
    cursor: 'pointer',
  }}
  ```

  The count indicator:
  ```tsx
  style={{ color: 'var(--color-dim)', fontFamily: "'Inter', sans-serif", fontSize: 11 }}
  ```

  Remove `rounded-full` from filter pill className (use `rounded` instead to match spec's `border-radius: 4px`).

- [ ] **Step 3: Update BulkActions**

  Replace token references:

  Count label:
  ```tsx
  style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--color-muted)' }}
  ```

  Select All / Deselect All link:
  ```tsx
  style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--color-accent)' }}
  ```

  Export CSV button:
  ```tsx
  style={{
    border: '1px solid var(--color-border)',
    color: 'var(--color-muted)',
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    borderRadius: 4,
    padding: '4px 11px',
    background: 'transparent',
  }}
  ```

  Add to CRM button (primary — 11px intentional here, compact bar context):
  ```tsx
  className="kayna-btn disabled:opacity-50"
  style={{
    background: 'var(--color-accent)',
    color: '#080808',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
    fontSize: 11,
    borderRadius: 4,
    padding: '4px 11px',
    border: 'none',
    cursor: 'pointer',
  }}
  ```

- [ ] **Step 4: Verify in browser**

  Run a search. Filter pills, sort dropdown, and bulk action buttons should all use the new tokens.

- [ ] **Step 5: Commit**

  ```bash
  git add components/finder/SortFilterBar.tsx components/finder/BulkActions.tsx
  git commit -m "feat: filter bar and bulk actions — new design tokens"
  ```

---

## Chunk 4: Results table

### Task 6: Update ResultsTable headers

**Files:**
- Modify: `components/finder/ResultsTable.tsx`

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Update outer wrapper, thead row, and `<th>` styles**

  Outer wrapper `<div>` — replace old token:
  ```tsx
  // old
  style={{ border: '1px solid var(--border)' }}
  // new
  style={{ border: '1px solid var(--color-border)' }}
  ```

  `<thead>` row — replace hardcoded background:
  ```tsx
  // old
  <tr style={{ background: '#0d0d0d' }}>
  // new
  <tr style={{ background: 'var(--color-surface)' }}>
  ```

  All `<th>` elements — replace className and style:
  ```tsx
  // old className: "py-2.5 px-3 text-left text-xs font-medium first:pl-4 last:pr-4"
  // new className: "py-2.5 px-3 text-left first:pl-4 last:pr-4"
  style={{
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.14em',
    color: 'var(--color-dim)',
    fontWeight: 400,
  }}
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add components/finder/ResultsTable.tsx
  git commit -m "feat: results table headers — dim uppercase Inter, no bold"
  ```

---

### Task 7: Update LeadRow cells and score pills

**Files:**
- Modify: `components/finder/LeadRow.tsx`

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Update row and cell styles**

  Row `<tr>`:
  ```tsx
  // borderBottom stays: '1px solid var(--border)' → '1px solid var(--color-border)'
  style={{ borderBottom: '1px solid var(--color-border)' }}
  ```

  Lead name cell:
  ```tsx
  <div style={{
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    color: 'var(--color-heading)',
  }}>
    {name}
  </div>
  <div style={{
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    color: 'var(--color-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginTop: 2,
  }}>
    {category}
  </div>
  ```

  Phone, rating cells: `color: 'var(--color-body)'` for phone, `color: 'var(--color-muted)'` for rating.

  Website link: `color: 'var(--color-accent)'`

  "—" placeholders: `color: 'var(--color-dim)'`

- [ ] **Step 3: Update ScorePill colors and border-radius**

  Hot pill — update to consistent opacity level (was `0.12`):
  ```tsx
  // old
  style={{ background: 'rgba(92,225,230,0.12)', color: '#5ce1e6' }}
  // new
  style={{ background: 'rgba(92,225,230,0.1)', color: '#5ce1e6' }}
  ```

  Score-based pills use `${color}20` (hex opacity shorthand) — these already render the correct visual result and don't need changing.

  Remove `rounded-full` className from ALL score pills. Add `borderRadius: 3` to the inline `style` instead:
  ```tsx
  // old className: "text-xs font-bold px-2 py-0.5 rounded-full cursor-help"
  // new className: "text-xs font-bold px-2 py-0.5 cursor-help"
  // add to style: borderRadius: 3
  ```

- [ ] **Step 4: Update checkbox and ScreenshotPreview tokens**

  Checkbox (line ~141 in LeadRow):
  ```tsx
  // old
  style={{ accentColor: 'var(--accent)' }}
  // new
  style={{ accentColor: 'var(--color-accent)' }}
  ```

  ScreenshotPreview loading skeleton (inside the component):
  ```tsx
  // old
  style={{ width: 48, height: 32, background: 'var(--border)' }}
  // new
  style={{ width: 48, height: 32, background: 'var(--color-border)' }}
  ```

  ScreenshotPreview `—` fallback:
  ```tsx
  // old
  return <span style={{ color: 'var(--muted)' }}>—</span>
  // new
  return <span style={{ color: 'var(--color-dim)' }}>—</span>
  ```

  Screenshot popover border (the large preview):
  ```tsx
  // old
  border: '1px solid rgba(92,225,230,0.25)',
  // no change needed — this is a direct hex value, not a token
  ```

- [ ] **Step 5: Update "Add to CRM" ghost button**

  Find (line ~176–182):
  ```tsx
  <button
    onClick={onAddToCRM}
    className="text-xs px-3 py-1 rounded-lg transition-colors"
    style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}
  >
    Add to CRM
  </button>
  ```

  Replace with:
  ```tsx
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
  ```

- [ ] **Step 6: Verify in browser**

  Run a search. Lead names should be white, categories dim uppercase, cells gray. Score pills should match the color-coded spec.

- [ ] **Step 7: Commit**

  ```bash
  git add components/finder/LeadRow.tsx
  git commit -m "feat: lead rows — heading/dim/body color tokens, score pill borders"
  ```

---

### Task 8: Add decorative wordmark to FinderShell

**Files:**
- Modify: `components/finder/FinderShell.tsx`

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Wrap return in relative container and add wordmark**

  The outer `<div className="kayna-page">` needs `position: relative` and `overflow: hidden`. Add the wordmark as the last child:

  ```tsx
  return (
    <div className="kayna-page" style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh' }}>
      {/* ... all existing content ... */}

      {/* Decorative wordmark */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: -30,
          right: -12,
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 300,
          fontSize: 170,
          color: 'rgba(255,255,255,0.028)',
          pointerEvents: 'none',
          userSelect: 'none',
          lineHeight: 1,
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 100%)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 100%)',
          zIndex: 0,
        }}
      >
        kayna
      </div>
    </div>
  )
  ```

- [ ] **Step 3: Verify in browser**

  Faint "kayna" wordmark should be barely visible at the bottom right, fading from nothing to slightly visible.

- [ ] **Step 4: Commit**

  ```bash
  git add components/finder/FinderShell.tsx
  git commit -m "feat: finder — decorative Cormorant wordmark bottom-right"
  ```

---

## Chunk 5: Pipeline, Stats, Login

### Task 9: Update Pipeline page heading

**Files:**
- Modify: `app/(app)/pipeline/page.tsx`

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Replace the heading block — keep `<KanbanBoard>` untouched**

  Find and replace only the heading `<div>` below; leave `<KanbanBoard initialLeads={leads} />` intact:

  Find:
  ```tsx
  <div className="flex items-center gap-4 mb-6">
    <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Pipeline</h1>
    <span className="text-sm" style={{ color: 'var(--muted)' }}>
      {activeCount} active lead{activeCount !== 1 ? 's' : ''}
    </span>
  </div>
  ```

  Replace with:
  ```tsx
  <div style={{ marginBottom: 28 }}>
    <p style={{
      fontFamily: "'Inter', sans-serif",
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: 'var(--color-accent)',
      marginBottom: 5,
    }}>
      Pipeline
    </p>
    <h1 style={{
      fontFamily: "'Cormorant Garamond', serif",
      fontWeight: 300,
      fontSize: 40,
      color: 'var(--color-heading)',
      lineHeight: 1.05,
      marginBottom: 3,
    }}>
      Pipeline
    </h1>
    <p style={{
      fontFamily: "'Cormorant Garamond', serif",
      fontWeight: 300,
      fontStyle: 'italic',
      fontSize: 17,
      color: 'var(--color-muted)',
    }}>
      {activeCount} active lead{activeCount !== 1 ? 's' : ''} in progress
    </p>
  </div>
  ```

- [ ] **Step 3: Verify in browser**

  Visit localhost:3000/pipeline. Cormorant heading, cyan "Pipeline" overline, italic active-count subheadline. Kanban board unchanged below.

- [ ] **Step 4: Commit**

  ```bash
  git add app/(app)/pipeline/page.tsx
  git commit -m "feat: pipeline page heading — Cormorant h1, cyan overline"
  ```

---

### Task 10: Update KanbanColumn and LeadCard

**Files:**
- Modify: `components/pipeline/KanbanColumn.tsx`
- Modify: `components/pipeline/LeadCard.tsx`

- [ ] **Step 1: Read both files**

- [ ] **Step 2: Update KanbanColumn tokens**

  Column container background: `var(--sidebar)` → `var(--color-surface)`

  Column header border: `var(--border)` → `var(--color-border)`

  Drag-over border: `var(--accent)` → `var(--color-accent)`

  Label count badge background: hardcoded `#1a1a1a` → `var(--color-border)`, text: `var(--muted)` → `var(--color-dim)`

  Column label `<span>` — keep the `color` prop from the STAGES array (it's used for semantic color-coding by stage, not a design token).

  Column label: remove `font-medium` className, add Inter font style.

- [ ] **Step 3: Update LeadCard tokens**

  Card background: `var(--bg)` → `var(--color-bg)`

  Card border: `var(--border)` → `var(--color-border)`

  Lead name: `var(--text)` → `var(--color-heading)`

  Phone, notes toggle: `var(--muted)` → `var(--color-muted)`

  Website link: `var(--accent)` → `var(--color-accent)`

  Move button hover: `var(--accent)` → `var(--color-accent)`

  Notes textarea background: hardcoded `#1a1a1a` → `var(--color-surface)`, border: `var(--border)` → `var(--color-border)`, text: `var(--text)` → `var(--color-body)`

  ScorePill in LeadCard: same token updates as LeadRow — `rgba(92,225,230,0.12)` → `rgba(92,225,230,0.1)`, text already correct.

  Remove `font-medium` from lead name `<span>`.

- [ ] **Step 4: Verify in browser**

  Visit localhost:3000/pipeline. Kanban columns should have surface background, dim count badges, and lead cards with correct token colors.

- [ ] **Step 5: Commit**

  ```bash
  git add components/pipeline/KanbanColumn.tsx components/pipeline/LeadCard.tsx
  git commit -m "feat: kanban — updated all color tokens to new design system"
  ```

---

### Task 11: Update Stats page

**Files:**
- Modify: `app/(app)/stats/page.tsx`

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Replace entire file contents** (current file uses a centered emoji layout; the replacement restructures it to match the page heading pattern)

  ```tsx
  export default function StatsPage() {
    return (
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <p style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          color: 'var(--color-accent)',
          marginBottom: 5,
        }}>
          Stats
        </p>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 300,
          fontSize: 40,
          color: 'var(--color-heading)',
          lineHeight: 1.05,
          marginBottom: 3,
        }}>
          Stats
        </h1>
        <p style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 300,
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--color-muted)',
          marginBottom: 40,
        }}>
          deal insights, conversion rates, and revenue tracking
        </p>
        <p style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: 'var(--color-dim)',
        }}>
          Coming soon.
        </p>
      </div>
    )
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add app/(app)/stats/page.tsx
  git commit -m "feat: stats page heading — Cormorant h1, consistent with other pages"
  ```

---

### Task 12: Update Login page

**Files:**
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Replace entire file contents** (removes `import Image from 'next/image'` and the `<Image>` component — no longer needed; the chevron is now an inline SVG)

  ```tsx
  'use client'
  import { useState, FormEvent } from 'react'
  import { useRouter } from 'next/navigation'

  export default function LoginPage() {
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    async function handleSubmit(e: FormEvent) {
      e.preventDefault()
      setLoading(true)
      setError('')
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.push('/finder')
      } else {
        setError('Incorrect password')
        setLoading(false)
      }
    }

    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg)' }}
      >
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: '40px 40px',
            width: '100%',
            maxWidth: 360,
          }}
        >
          {/* Logo lockup */}
          <div className="flex items-center gap-3 mb-8">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <path
                d="M4 21 L15 9 L26 21"
                stroke="#5ce1e6"
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex flex-col">
              <span style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 300,
                fontSize: 22,
                color: 'var(--color-heading)',
                lineHeight: 1,
                letterSpacing: '0.04em',
              }}>
                Kayna
              </span>
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 9,
                color: 'var(--color-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                marginTop: 6,
              }}>
                Lead Finder
              </span>
            </div>
          </div>

          {/* Italic subheadline */}
          <p style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--color-muted)',
            marginBottom: 24,
          }}>
            enter to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label style={{
                display: 'block',
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--color-dim)',
                marginBottom: 6,
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full focus:outline-none"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 5,
                  padding: '9px 13px',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: 'var(--color-body)',
                }}
                placeholder="••••••••"
                autoFocus
              />
            </div>

            {error && (
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#f87171' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full kayna-btn disabled:opacity-50"
              style={{
                background: 'var(--color-accent)',
                color: '#080808',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: 13,
                padding: '10px 0',
                borderRadius: 5,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {loading ? 'Entering…' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3: Verify in browser**

  Visit localhost:3000/login (or log out). Should see the dark card, chevron logo, Cormorant italic subheadline, and styled input/button.

- [ ] **Step 4: Commit**

  ```bash
  git add app/(auth)/login/page.tsx
  git commit -m "feat: login page — new logo lockup, Cormorant subheadline, updated inputs"
  ```

---

## Chunk 6: Final cleanup and verification

### Task 13: Verify no old token references remain

**Files:**
- Search all component/app files

- [ ] **Step 1: Grep for old token names**

  ```bash
  cd /Users/kanuj/kayna-lead-finder
  grep -r "var(--bg)\|var(--sidebar)\|var(--card)\|var(--text)\|var(--muted)\|var(--border)\|var(--accent)" \
    --include="*.tsx" --include="*.ts" --include="*.css" \
    app/ components/ lib/ 2>/dev/null
  ```

  Expected: No matches (or only in node_modules, which isn't searched).

- [ ] **Step 2: Fix any remaining old references**

  For each match, replace with the corresponding new token:

  | Old | New |
  |-----|-----|
  | `var(--bg)` | `var(--color-bg)` |
  | `var(--sidebar)` | `var(--color-surface)` |
  | `var(--card)` | `var(--color-surface)` |
  | `var(--text)` | `var(--color-body)` or `var(--color-heading)` (use heading for titles, body for body text) |
  | `var(--muted)` | `var(--color-muted)` |
  | `var(--border)` | `var(--color-border)` |
  | `var(--accent)` | `var(--color-accent)` |

- [ ] **Step 3: Run a full build to catch TypeScript errors**

  ```bash
  cd /Users/kanuj/kayna-lead-finder && npm run build
  ```

  Expected: Build completes with 0 errors.

- [ ] **Step 4: Commit only the files changed in Step 2**

  Stage only the specific files identified by the grep — do not use `git add -A`:

  ```bash
  # Example — replace with actual files from grep output:
  git add components/finder/FinderShell.tsx components/pipeline/LeadCard.tsx
  git commit -m "fix: replace remaining old CSS token references"
  ```

- [ ] **Step 5: Visual spot-check across all pages**

  - localhost:3000/login — dark card, chevron logo, Cormorant italic
  - localhost:3000/finder — cyan overline, Cormorant h1, search form, table
  - localhost:3000/pipeline — Cormorant heading, kanban columns with surface bg
  - localhost:3000/stats — consistent heading block

