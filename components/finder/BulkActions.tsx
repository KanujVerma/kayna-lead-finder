'use client'
import type { Business } from '@/types'

interface Props {
  businesses: Business[]
  selected: Set<string>
  onSelectAll: () => void
  onClearAll: () => void
  onAddToCRM: () => void
  onExportCSV: () => void
}

export default function BulkActions({
  businesses, selected, onSelectAll, onClearAll, onAddToCRM, onExportCSV,
}: Props) {
  const count = selected.size
  const total = businesses.length
  const allSelected = count === total && total > 0

  return (
    <div className="flex items-center gap-4 py-2">
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--color-muted)' }}>
        {count} of {total} selected
      </span>
      <button
        onClick={allSelected ? onClearAll : onSelectAll}
        className="hover:underline"
        style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--color-accent)' }}
      >
        {allSelected ? 'Deselect All' : 'Select All'}
      </button>

      <div className="flex-1" />

      <button
        onClick={onExportCSV}
        disabled={total === 0}
        className="transition-colors disabled:opacity-40"
        style={{
          border: '1px solid var(--color-border)',
          color: 'var(--color-muted)',
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          borderRadius: 4,
          padding: '4px 11px',
          background: 'transparent',
        }}
      >
        Export CSV
      </button>
      <button
        onClick={onAddToCRM}
        disabled={count === 0}
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
      >
        Add {count > 0 ? `${count} ` : ''}to CRM
      </button>
    </div>
  )
}
