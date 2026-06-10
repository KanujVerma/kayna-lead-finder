import { getSupabaseServer } from '@/lib/supabase'
import type { Settings } from '@/types'
import SettingsForm from '@/components/settings/SettingsForm'

export const dynamic = 'force-dynamic'

async function getSettings(): Promise<Settings | null> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) {
    console.error('[settings] Failed to fetch settings:', error.message)
    return null
  }
  return data as Settings
}

export default async function SettingsPage() {
  const settings = await getSettings()

  return (
    <div>
      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.18em',
        color: 'var(--color-accent)',
        marginBottom: 5,
      }}>
        Settings
      </p>
      <h1 style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontWeight: 300,
        fontSize: 40,
        color: 'var(--color-heading)',
        lineHeight: 1.05,
        marginBottom: 3,
      }}>
        Settings
      </h1>
      <p style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontWeight: 300,
        fontStyle: 'italic',
        fontSize: 17,
        color: 'var(--color-muted)',
        marginBottom: 40,
      }}>
        safety, compliance, and sending controls
      </p>

      {settings ? (
        <SettingsForm initialSettings={settings} />
      ) : (
        <p style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: 'var(--color-dim)',
        }}>
          Could not load settings. Check your database connection.
        </p>
      )}
    </div>
  )
}
