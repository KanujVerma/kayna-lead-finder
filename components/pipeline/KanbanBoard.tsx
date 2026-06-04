'use client'
import { useState } from 'react'
import {
  DndContext, DragEndEvent,
  MouseSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import type { Lead, Stage } from '@/types'
import KanbanColumn from './KanbanColumn'

const STAGES: { stage: Stage; label: string; color: string }[] = [
  { stage: 'new',       label: 'New Lead',      color: '#64748b' },
  { stage: 'called',    label: 'Called',         color: '#60a5fa' },
  { stage: 'follow_up', label: 'Follow Up',      color: '#a78bfa' },
  { stage: 'meeting',   label: 'Meeting Set',    color: '#34d399' },
  { stage: 'proposal',  label: 'Proposal Sent',  color: '#fbbf24' },
  { stage: 'won',       label: 'Closed Won',     color: '#4ade80' },
  { stage: 'lost',      label: 'Closed Lost',    color: '#f87171' },
]

interface Props {
  initialLeads: Lead[]
}

export default function KanbanBoard({ initialLeads }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const updateStage = async (id: string, stage: Stage) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l))
    await fetch(`/api/leads?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
  }

  const updateNotes = async (id: string, notes: string) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, notes } : l))
    await fetch(`/api/leads?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const newStage = over.id as Stage
    const lead = leads.find(l => l.id === active.id)
    if (lead && lead.stage !== newStage) {
      updateStage(String(active.id), newStage)
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(({ stage, label, color }) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            label={label}
            color={color}
            leads={leads.filter(l => l.stage === stage)}
            onStageChange={updateStage}
            onNotesChange={updateNotes}
          />
        ))}
      </div>
    </DndContext>
  )
}
