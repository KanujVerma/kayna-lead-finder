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
        className="focus:outline-none cursor-pointer"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-muted)',
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          borderRadius: 5,
          padding: '5px 10px',
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
            className="transition-colors"
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
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Count indicator when filtered */}
      {filterBy !== 'all' && (
        <span className="ml-1" style={{ color: 'var(--color-dim)', fontFamily: "'Inter', sans-serif", fontSize: 11 }}>
          {filteredCount} of {totalCount}
        </span>
      )}
    </div>
  )
}
