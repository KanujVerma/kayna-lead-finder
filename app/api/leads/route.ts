import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import type { Stage } from '@/types'

// GET /api/leads — all leads ordered by added_at desc
export async function GET() {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('added_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data })
}

// POST /api/leads — upsert one or many leads (by name+city unique constraint)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const leads = Array.isArray(body) ? body : [body]
  const supabase = getSupabaseServer()

  const { data, error } = await supabase
    .from('leads')
    .upsert(leads, { onConflict: 'name,city', ignoreDuplicates: false })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data }, { status: 201 })
}

// PATCH /api/leads?id=<uuid> — update stage, notes, or deal_value
export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await request.json()
  const ALLOWED = ['stage', 'notes', 'deal_value'] as const
  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED.includes(k as typeof ALLOWED[number]))
  ) as { stage?: Stage; notes?: string; deal_value?: number }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = getSupabaseServer()

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}
