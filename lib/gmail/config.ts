// Gmail OAuth configuration helpers.
// All env reads are LAZY (inside function bodies only) so tsc/build pass without real credentials.
// Fail-closed: missing env vars throw at request time, never at module load.

export const OAUTH_SCOPES = ['openid', 'email'] as const

/** Space-joined scope string for OAuth URL parameter. */
export function scopeString(): string {
  return OAUTH_SCOPES.join(' ')
}

/** Derive the OAuth callback URI from APP_BASE_URL. Throws if APP_BASE_URL is missing. */
export function buildRedirectUri(): string {
  const base = process.env.APP_BASE_URL
  if (!base) throw new Error('[gmail/config] APP_BASE_URL is not set')
  return `${base}/api/gmail/oauth/callback`
}

export interface OAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  senderEmail: string
}

/**
 * Read and validate all required OAuth env vars.
 * Call only inside route handler bodies — never at module top level.
 * Throws fail-closed if any required var is missing.
 */
export function getOAuthConfig(): OAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const senderEmail = process.env.GMAIL_SENDER_EMAIL

  if (!clientId)     throw new Error('[gmail/config] GOOGLE_CLIENT_ID is not set')
  if (!clientSecret) throw new Error('[gmail/config] GOOGLE_CLIENT_SECRET is not set')
  if (!senderEmail)  throw new Error('[gmail/config] GMAIL_SENDER_EMAIL is not set')

  const redirectUri = buildRedirectUri() // throws if APP_BASE_URL missing

  return { clientId, clientSecret, redirectUri, senderEmail }
}
