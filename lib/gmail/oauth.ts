// Gmail OAuth helpers — plain fetch only (no googleapis SDK; Workers-compatible).
// buildAuthUrl and parseIdTokenEmail are pure and testable without network.
// exchangeCodeForTokens and revokeToken make external HTTPS calls.

import { getOAuthConfig, scopeString } from './config'

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token: string
  scope: string
  token_type: string
}

export interface IdTokenClaims {
  email: string
  email_verified: boolean
}

/**
 * Build the Google authorization URL for the OAuth redirect.
 * Pure function — no network, no side effects, testable.
 * Requests openid + email only (least-privilege, Phase 6A).
 */
export function buildAuthUrl(state: string): string {
  const config = getOAuthConfig()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     config.clientId,
    redirect_uri:  config.redirectUri,
    scope:         scopeString(),
    access_type:   'offline',
    prompt:        'consent', // always show consent to ensure we get a refresh_token
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange an OAuth authorization code for tokens.
 * Called from the callback route only. Throws on non-OK response.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const config = getOAuthConfig()
  const body = new URLSearchParams({
    code,
    client_id:     config.clientId,
    client_secret: config.clientSecret,
    redirect_uri:  config.redirectUri,
    grant_type:    'authorization_code',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    // Log status only — never log body which may contain tokens
    const status = res.status
    throw new Error(`[gmail/oauth] Token exchange failed: HTTP ${status}`)
  }

  return res.json() as Promise<TokenResponse>
}

/**
 * Decode the JWT id_token payload and extract the email claim.
 * Pure — no network, no signature verification (token came from Google over TLS).
 * Throws on malformed JWT or missing email claim.
 */
export function parseIdTokenEmail(idToken: string): IdTokenClaims {
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    throw new Error('[gmail/oauth] Invalid id_token format: expected 3 JWT parts')
  }

  // base64url → base64 (swap chars) then pad to multiple of 4
  const raw = parts[1]
  const padded = raw
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(raw.length + ((4 - (raw.length % 4)) % 4), '=')

  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    throw new Error('[gmail/oauth] Failed to decode id_token payload')
  }

  if (typeof claims.email !== 'string') {
    throw new Error('[gmail/oauth] id_token missing email claim')
  }

  return {
    email:          claims.email,
    email_verified: claims.email_verified === true,
  }
}

/**
 * Revoke a token at Google's revocation endpoint.
 * Best-effort — never throws (errors are swallowed intentionally).
 * Called on disconnect to invalidate the stored token at the provider.
 */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    })
  } catch {
    // Non-fatal: revocation failure does not prevent local disconnect
  }
}
