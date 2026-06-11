// Unit tests for lib/gmail/oauth.ts (pure functions only — no network, no live Google calls).
// Tests: buildAuthUrl, parseIdTokenEmail, getOAuthConfig (via config module).

import { buildAuthUrl, parseIdTokenEmail } from '@/lib/gmail/oauth'
import { getOAuthConfig } from '@/lib/gmail/config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake (unsigned) JWT with the given payload for testing parseIdTokenEmail. */
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const header  = encode({ alg: 'RS256', typ: 'JWT' })
  const body    = encode(payload)
  return `${header}.${body}.fake-signature`
}

const TEST_ENV = {
  GOOGLE_CLIENT_ID:     'test-client-id-123',
  GOOGLE_CLIENT_SECRET: 'test-client-secret-xyz',
  APP_BASE_URL:         'http://localhost:3000',
  GMAIL_SENDER_EMAIL:   'test@example.com',
}

// ---------------------------------------------------------------------------
// buildAuthUrl
// ---------------------------------------------------------------------------

describe('buildAuthUrl', () => {
  beforeEach(() => { Object.assign(process.env, TEST_ENV) })
  afterEach(() => { for (const k of Object.keys(TEST_ENV)) delete process.env[k] })

  it('is an HTTPS URL to accounts.google.com', () => {
    const url = buildAuthUrl('state-abc')
    expect(url).toMatch(/^https:\/\/accounts\.google\.com\//)
  })

  it('contains response_type=code', () => {
    expect(buildAuthUrl('s')).toContain('response_type=code')
  })

  it('contains the correct client_id', () => {
    expect(buildAuthUrl('s')).toContain('client_id=test-client-id-123')
  })

  it('contains the derived redirect_uri', () => {
    const url = buildAuthUrl('s')
    expect(url).toContain(encodeURIComponent('http://localhost:3000/api/gmail/oauth/callback'))
  })

  it('requests openid and email scopes only (not gmail.send)', () => {
    const url = buildAuthUrl('s')
    // URLSearchParams encodes space as +
    expect(url).toMatch(/scope=openid(\+|%20)email/)
    // Extract the scope param and verify it contains no Gmail API scopes
    const parsed = new URL(url)
    const scope = parsed.searchParams.get('scope')
    expect(scope).toBe('openid email')
    expect(scope).not.toContain('gmail')
    expect(scope).not.toContain('send')
  })

  it('contains access_type=offline', () => {
    expect(buildAuthUrl('s')).toContain('access_type=offline')
  })

  it('contains prompt=consent', () => {
    expect(buildAuthUrl('s')).toContain('prompt=consent')
  })

  it('echoes the state parameter', () => {
    const url = buildAuthUrl('csrf-state-abc-123')
    expect(url).toContain('state=csrf-state-abc-123')
  })

  it('produces different state embedding for different state values', () => {
    const u1 = buildAuthUrl('state-A')
    const u2 = buildAuthUrl('state-B')
    expect(u1).not.toBe(u2)
  })
})

// ---------------------------------------------------------------------------
// parseIdTokenEmail
// ---------------------------------------------------------------------------

describe('parseIdTokenEmail', () => {
  it('extracts email and email_verified=true from a crafted JWT', () => {
    const token = fakeJwt({ email: 'user@example.com', email_verified: true, sub: '12345' })
    const result = parseIdTokenEmail(token)
    expect(result.email).toBe('user@example.com')
    expect(result.email_verified).toBe(true)
  })

  it('handles email_verified = false', () => {
    const token = fakeJwt({ email: 'user@example.com', email_verified: false })
    expect(parseIdTokenEmail(token).email_verified).toBe(false)
  })

  it('email_verified defaults to false when absent', () => {
    const token = fakeJwt({ email: 'user@example.com' })
    expect(parseIdTokenEmail(token).email_verified).toBe(false)
  })

  it('throws on JWT with wrong number of parts (too few)', () => {
    expect(() => parseIdTokenEmail('only.two')).toThrow('Invalid id_token format')
  })

  it('throws on JWT with wrong number of parts (too many)', () => {
    expect(() => parseIdTokenEmail('a.b.c.d.e')).toThrow('Invalid id_token format')
  })

  it('throws when email claim is missing from payload', () => {
    const token = fakeJwt({ sub: '12345' }) // no email
    expect(() => parseIdTokenEmail(token)).toThrow('missing email claim')
  })

  it('throws when email claim is not a string', () => {
    const token = fakeJwt({ email: 42 })
    expect(() => parseIdTokenEmail(token)).toThrow('missing email claim')
  })

  it('throws on a payload that is not valid base64/JSON', () => {
    // Craft a JWT where the payload part is garbage
    expect(() => parseIdTokenEmail('header.!!!not-base64!!!.sig')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// getOAuthConfig — fail-closed validation
// ---------------------------------------------------------------------------

describe('getOAuthConfig', () => {
  afterEach(() => { for (const k of Object.keys(TEST_ENV)) delete process.env[k] })

  it('returns config when all env vars are set', () => {
    Object.assign(process.env, TEST_ENV)
    const config = getOAuthConfig()
    expect(config.clientId).toBe('test-client-id-123')
    expect(config.clientSecret).toBe('test-client-secret-xyz')
    expect(config.senderEmail).toBe('test@example.com')
    expect(config.redirectUri).toBe('http://localhost:3000/api/gmail/oauth/callback')
  })

  it('throws when GOOGLE_CLIENT_ID is missing', () => {
    Object.assign(process.env, TEST_ENV)
    delete process.env.GOOGLE_CLIENT_ID
    expect(() => getOAuthConfig()).toThrow('GOOGLE_CLIENT_ID')
  })

  it('throws when GOOGLE_CLIENT_SECRET is missing', () => {
    Object.assign(process.env, TEST_ENV)
    delete process.env.GOOGLE_CLIENT_SECRET
    expect(() => getOAuthConfig()).toThrow('GOOGLE_CLIENT_SECRET')
  })

  it('throws when GMAIL_SENDER_EMAIL is missing', () => {
    Object.assign(process.env, TEST_ENV)
    delete process.env.GMAIL_SENDER_EMAIL
    expect(() => getOAuthConfig()).toThrow('GMAIL_SENDER_EMAIL')
  })

  it('throws when APP_BASE_URL is missing', () => {
    Object.assign(process.env, TEST_ENV)
    delete process.env.APP_BASE_URL
    expect(() => getOAuthConfig()).toThrow('APP_BASE_URL')
  })
})
