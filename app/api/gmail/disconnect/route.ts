import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import { decryptToken } from '@/lib/gmail/token-crypto'
import { revokeToken } from '@/lib/gmail/oauth'
import { disconnectGmailAccount } from '@/lib/gmail/account'

// POST /api/gmail/disconnect
// Best-effort revokes the stored refresh token at Google, then clears tokens from DB.
// Login-gated by middleware.ts.
// No email sending. No outreach_messages writes. No outreach_state transitions.
export async function POST() {
  try {
    // Best-effort: revoke refresh token at Google before wiping DB
    const senderEmail = process.env.GMAIL_SENDER_EMAIL
    if (senderEmail) {
      const supabase = getSupabaseServer()
      const { data } = await supabase
        .from('gmail_account')
        .select('refresh_token_enc')
        .eq('email', senderEmail)
        .eq('connected', true)
        .maybeSingle()

      if (data?.refresh_token_enc) {
        try {
          const refreshToken = await decryptToken(data.refresh_token_enc as string)
          await revokeToken(refreshToken) // best-effort — non-fatal
        } catch {
          // Revocation failure does not block disconnect
        }
      }
    }

    // Clear tokens and mark disconnected in DB
    await disconnectGmailAccount()

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[gmail/disconnect] Failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Disconnect failed' }, { status: 500 })
  }
}
