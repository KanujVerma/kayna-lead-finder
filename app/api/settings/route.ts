import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import { sanitizeSettingsUpdate, validateSettingsUpdate } from '@/lib/settings-policy'

export async function GET() {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sanitized = sanitizeSettingsUpdate(body)
  const result = validateSettingsUpdate(sanitized)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  // Force locked fields at the DB write layer — server is authoritative.
  const updatePayload = { ...result.data, auto_mode: false, firecrawl_enabled: false }

  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('settings')
    .update(updatePayload)
    .eq('id', 1)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
