'use client'
import { useDroppable } from '@dnd-kit/core'
import type { Lead, Stage } from '@/types'
import LeadCard from './LeadCard'

interface Props {
  stage: Stage
  label: string
  color: string
  leads: Lead[]
  onStageChange: (id: string, stage: Stage) => void
  onNotesChange: (id: string, notes: string) => void
}

export default function KanbanColumn({
  stage, label, color, leads, onStageChange, onNotesChange,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })

  return (
    <div
      ref={setNodeRef}
      className="flex-shrink-0 rounded-xl transition-colors"
      style={{
        width: 240,
        border: `1px solid ${isOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
        background: 'var(--color-surface)',
      }}
    >
      {/* Column header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color }}>{label}</span>
        <span
          className="ml-auto text-xs rounded-full px-2"
          style={{ background: 'var(--color-border)', color: 'var(--color-dim)' }}
        >
          {leads.length}
        </span>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2" style={{ minHeight: 200 }}>
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onStageChange={onStageChange}
            onNotesChange={onNotesChange}
          />
        ))}
      </div>
    </div>
  )
}
