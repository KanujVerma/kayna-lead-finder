import KanbanBoard from '@/components/pipeline/KanbanBoard'
import { getSupabaseServer } from '@/lib/supabase'
import type { Lead } from '@/types'

export const dynamic = 'force-dynamic'

async function getLeads(): Promise<Lead[]> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('added_at', { ascending: false })
  if (error) {
    console.error('[pipeline] Failed to fetch leads:', error.message)
    return []
  }
  return data ?? []
}

export default async function PipelinePage() {
  const leads = await getLeads()
  const activeCount = leads.filter(l => l.stage !== 'won' && l.stage !== 'lost').length

  return (
    <div>
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
      <KanbanBoard initialLeads={leads} />
    </div>
  )
}
