'use client'
import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Lead, Stage } from '@/types'

const STAGE_ORDER: Stage[] = ['new', 'called', 'follow_up', 'meeting', 'proposal', 'won', 'lost']
const NEXT_STAGE_LABEL: Record<Stage, string> = {
  new: 'Called', called: 'Follow Up', follow_up: 'Meeting Set',
  meeting: 'Proposal Sent', proposal: 'Closed Won', won: 'Closed Lost', lost: 'Closed Lost',
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="text-xs px-2 py-0.5"
        style={{ background: 'rgba(92,225,230,0.1)', color: '#5ce1e6', borderRadius: 3 }}>
        No site
      </span>
    )
  }
  const color = score < 50 ? '#f87171' : score < 75 ? '#fbbf24' : '#4ade80'
  return (
    <span className="text-xs font-bold px-2 py-0.5"
      style={{ background: `${color}20`, color, borderRadius: 3 }}>
      {score}
    </span>
  )
}

interface Props {
  lead: Lead
  onStageChange: (id: string, stage: Stage) => void
  onNotesChange: (id: string, notes: string) => void
}

export default function LeadCard({ lead, onStageChange, onNotesChange }: Props) {
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState(lead.notes ?? '')

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { stage: lead.stage },
  })

  const stageIdx = STAGE_ORDER.indexOf(lead.stage as Stage)
  const nextStage = stageIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[stageIdx + 1] : null

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: 0.85, zIndex: 999 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 12,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      {...listeners}
      {...attributes}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-heading)' }}>
          {lead.name}
        </span>
        <ScorePill score={lead.score} />
      </div>

      {lead.phone && (
        <div className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>{lead.phone}</div>
      )}

      {/* Quick move button */}
      {nextStage && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onStageChange(lead.id, nextStage) }}
          className="w-full text-left text-xs transition-colors mb-1"
          style={{ color: 'var(--color-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
        >
          Move &rarr; {NEXT_STAGE_LABEL[nextStage]}
        </button>
      )}

      {/* Notes toggle */}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setShowNotes(!showNotes) }}
        className="text-xs"
        style={{ color: 'var(--color-muted)' }}
      >
        {showNotes ? 'Hide notes ▲' : 'Notes ▼'}
      </button>

      {showNotes && (
        <textarea
          onPointerDown={e => e.stopPropagation()}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => onNotesChange(lead.id, notes)}
          placeholder="Add notes…"
          rows={3}
          className="w-full mt-2 text-xs resize-none focus:outline-none"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            color: 'var(--color-body)',
            padding: 8,
          }}
        />
      )}
    </div>
  )
}
