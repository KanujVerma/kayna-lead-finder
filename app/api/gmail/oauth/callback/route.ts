import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, parseIdTokenEmail, revokeToken } from '@/lib/gmail/oauth'
import { encryptToken } from '@/lib/gmail/token-crypto'
import { connectGmailAccount } from '@/lib/gmail/account'
import { getOAuthConfig } from '@/lib/gmail/config'

// GET /api/gmail/oauth/callback
// Handles the OAuth callback from Google. Login-gated by middleware.ts.
// Verifies CSRF state → exchanges code → guards sender email → encrypts tokens → persists.
// NEVER logs tokens. NEVER returns tokens to client. Redirects to /settings on all outcomes.
// No email sending. No outreach_messages writes. No outreach_state transitions.
export async function GET(request: NextRequest) {
  // Helper: redirect to /settings with error params and clear state cookie
  const errorRedirect = (reason: string): NextResponse => {
    const url = new URL('/settings', request.url)
    url.searchParams.set('gmail', 'error')
    url.searchParams.set('reason', reason)
    const resp = NextResponse.redirect(url)
    resp.cookies.set('gmail_oauth_state', '', { maxAge: 0, path: '/' })
    return resp
  }

  try {
    const { searchParams } = request.nextUrl
    const code       = searchParams.get('code')
    const stateParam = searchParams.get('state')
    const oauthError = searchParams.get('error') // Google may return e.g. 'access_denied'

    // Google returned an error (user cancelled, etc.)
    if (oauthError) return errorRedirect(oauthError)
    if (!code)       return errorRedirect('no_code')
    if (!stateParam) return errorRedirect('no_state')

    // CSRF: verify state matches the cookie set in /start
    const cookieState = request.cookies.get('gmail_oauth_state')?.value
    if (!cookieState || cookieState !== stateParam) {
      return errorRedirect('state_mismatch')
    }

    // Exchange authorization code for tokens
    const config = getOAuthConfig()
    const tokens = await exchangeCodeForTokens(code)

    // Identify the account via id_token (no extra API call; token came from Google over TLS)
    const claims = parseIdTokenEmail(tokens.id_token)

    // Account guard: reject any account that is not the expected sender
    if (claims.email.toLowerCase() !== config.senderEmail.toLowerCase()) {
      // Immediately revoke the token so it cannot be used
      if (tokens.access_token) await revokeToken(tokens.access_token)
      return errorRedirect('wrong_account')
    }

    // Encrypt tokens before touching the DB — never store plaintext
    const accessTokenEnc  = await encryptToken(tokens.access_token)
    const refreshTokenEnc = tokens.refresh_token ? await encryptToken(tokens.refresh_token) : ''
    const tokenExpiry     = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Persist to gmail_account (upsert on email)
    await connectGmailAccount({
      email:          claims.email,
      accessTokenEnc,
      refreshTokenEnc,
      tokenExpiry,
      scopes:         tokens.scope ?? 'openid email',
    })

    // Success — redirect to settings with connected banner
    const successUrl = new URL('/settings', request.url)
    successUrl.searchParams.set('gmail', 'connected')
    const resp = NextResponse.redirect(successUrl)
    resp.cookies.set('gmail_oauth_state', '', { maxAge: 0, path: '/' }) // clear state cookie
    return resp

  } catch (err) {
    console.error('[gmail/oauth/callback] Unexpected error:', err instanceof Error ? err.message : err)
    return errorRedirect('internal')
  }
}
