import { NextRequest, NextResponse } from 'next/server'
import { enrichLeadById } from '@/lib/enrichment/enrich-lead'

// POST /api/leads/[id]/enrich — manual Tier-1 website enrichment trigger
// Login-gated by middleware.ts (global matcher). Server-only.
// Never returns raw HTML.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Lead id required' }, { status: 400 })
  }

  const result = await enrichLeadById(id)

  if (result.status === 'error' && result.warnings.includes('Lead not found')) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Return compact summary only — no raw HTML, no scraped content
  return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 })
}
