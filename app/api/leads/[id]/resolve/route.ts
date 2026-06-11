import { NextRequest, NextResponse } from 'next/server'
import { resolveLeadById } from '@/lib/resolver/resolve-lead'

// POST /api/leads/[id]/resolve — manual deterministic resolver trigger
// Login-gated by middleware.ts (global matcher). Server-only.
// Returns compact summary only — no raw HTML, no raw evidence, no email sending.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Lead id required' }, { status: 400 })
  }

  const result = await resolveLeadById(id)

  if (result.status === 'error' && result.warnings.includes('Lead not found')) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Return compact summary only — no raw evidence, no sending
  return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 })
}
