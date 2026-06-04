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
