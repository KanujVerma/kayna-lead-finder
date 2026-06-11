import { NextRequest, NextResponse } from 'next/server'
import { buildAuthUrl } from '@/lib/gmail/oauth'

// GET /api/gmail/oauth/start
// Initiates the Gmail OAuth flow. Login-gated by middleware.ts.
// Sets a short-lived httpOnly CSRF-state cookie then redirects to Google.
// No email sending, no token reads, no DB writes.
export async function GET(request: NextRequest) {
  try {
    // Generate CSRF state token
    const state = crypto.randomUUID()

    // buildAuthUrl calls getOAuthConfig() internally — throws fail-closed if env missing
    const authUrl = buildAuthUrl(state)

    // Redirect to Google + set state cookie for CSRF verification in callback
    const response = NextResponse.redirect(authUrl)
    response.cookies.set('gmail_oauth_state', state, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   600, // 10 minutes — enough for consent flow
      path:     '/',
    })
    return response
  } catch (err) {
    console.error('[gmail/oauth/start] Failed to initiate OAuth:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(
      new URL('/settings?gmail=error&reason=config', request.url),
    )
  }
}
