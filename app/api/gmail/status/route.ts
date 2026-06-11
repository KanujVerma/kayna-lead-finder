import { NextResponse } from 'next/server'
import { getGmailAccountStatus } from '@/lib/gmail/account'

// GET /api/gmail/status
// Returns connection status only — never returns token columns.
// Login-gated by middleware.ts.
export async function GET() {
  const status = await getGmailAccountStatus()
  return NextResponse.json({ status })
}
