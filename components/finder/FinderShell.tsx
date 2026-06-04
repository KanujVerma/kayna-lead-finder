'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import type { Business } from '@/types'
import { makeKey, readDismissed, writeDismissed, type DismissedEntry } from '@/lib/dismissed'
import SearchForm from './SearchForm'
import ResultsTable from './ResultsTable'
import BulkActions from './BulkActions'
import SortFilterBar, { type SortBy, type FilterBy } from './SortFilterBar'

const STORAGE_KEY = 'kayna_finder_results'

export default function FinderShell() {
  const [businesses, setBusinesses] = useState<Business[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('score-asc')
  const [filterBy, setFilterBy] = useState<FilterBy>('all')
  const [pipelineNames, setPipelineNames] = useState<Set<string>>(new Set())
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

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

  // Persist results across navigation
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(businesses)) } catch {}
  }, [businesses])

  // Load dismissed keys + fetch pipeline on mount
  useEffect(() => {
    const entries = readDismissed()
    setDismissed(new Set(entries.map(e => makeKey(e.name, e.city))))

    fetch('/api/leads')
      .then(r => r.ok ? r.json() : { leads: [] })
      .then(({ leads }) => {
        setPipelineNames(new Set(
          (leads as { name: string; city: string }[]).map(l => makeKey(l.name, l.city))
        ))
      })
      .catch(() => {})
  }, [])

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  const handleSearch = useCallback(async (category: string, city: string) => {
    setSearchLoading(true)
    setError(null)
    setSelected(new Set())
    setSortBy('score-asc')
    setFilterBy('all')

    try {
      const res = await fetch(
        `/api/search?category=${encodeURIComponent(category)}&city=${encodeURIComponent(city)}`
      )
      if (!res.ok) throw new Error('Search failed')

      const { businesses: results } = await res.json()
      setBusinesses(results)
      setSearchLoading(false)

      // Score businesses with websites — call PageSpeed directly from browser (no serverless timeout)
      const toScore = results.filter((b: Business) => b.website)
      if (toScore.length === 0) return

      const CONCURRENCY = 5
      for (let i = 0; i < toScore.length; i += CONCURRENCY) {
        const chunk = toScore.slice(i, i + CONCURRENCY)
        await Promise.all(chunk.map(async (b: Business) => {
          try {
            const apiKey = process.env.NEXT_PUBLIC_PAGESPEED_API_KEY
            const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
              `?url=${encodeURIComponent(b.website!)}&strategy=desktop` +
              (apiKey ? `&key=${apiKey}` : '')
            const res = await fetch(endpoint)
            if (!res.ok) throw new Error('api error')
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
          } catch {
            setBusinesses(prev =>
              prev.map(biz => biz.id === b.id ? { ...biz, score: 'error' } : biz)
            )
          }
        }))
      }
    } catch {
      setError('Search failed. Please try again.')
      setSearchLoading(false)
    }
  }, [])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const addToCRM = async (items: Business[]) => {
    const payload = items.map(b => ({
      name: b.name,
      category: b.category,
      city: b.city,
      phone: b.phone,
      website: b.website,
      rating: b.rating,
      score: typeof b.score === 'number' ? b.score : null,
      stage: 'new',
    }))
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
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
  }

  const handleDismiss = (business: Business) => {
    const key = makeKey(business.name, business.city)
    const lean: DismissedEntry = {
      id: business.id,
      name: business.name,
      category: business.category,
      city: business.city,
      phone: business.phone,
      website: business.website,
      rating: business.rating,
      reviewCount: business.reviewCount,
      score: business.score,
    }
    const current = readDismissed().filter(e => makeKey(e.name, e.city) !== key)
    writeDismissed([...current, lean])
    setDismissed(prev => new Set([...prev, key]))
    setBusinesses(prev => prev.filter(b => makeKey(b.name, b.city) !== key))
    setSelected(prev => { const next = new Set(prev); next.delete(business.id); return next })
  }

  const handleExportCSV = () => {
    const headers = ['Name', 'Category', 'City', 'Phone', 'Website', 'Score', 'Rating']
    const rows = displayedBusinesses.map(b => [
      b.name, b.category, b.city, b.phone,
      b.website ?? '',
      typeof b.score === 'number' ? b.score : '',
      b.rating ?? '',
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="kayna-page" style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh' }}>
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

      <SearchForm onSearch={handleSearch} loading={searchLoading} />

      {error && (
        <p className="text-sm mt-4" style={{ color: '#f87171' }}>{error}</p>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className="kayna-toast fixed bottom-6 left-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium pointer-events-none"
          style={{
            transform: 'translateX(-50%)',
            background: 'var(--color-surface)',
            border: '1px solid rgba(92,225,230,0.35)',
            borderLeft: '3px solid #5ce1e6',
            color: '#e2e8f0',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {toast}
        </div>
      )}

      {businesses.length > 0 && (
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
              style={{ color: 'var(--color-dim)' }}
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
            onDismiss={handleDismiss}
            pipelineNames={pipelineNames}
          />
        </div>
      )}

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
}
