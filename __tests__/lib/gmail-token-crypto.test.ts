// Unit tests for lib/gmail/token-crypto.ts
// All tests are pure — no network, no DB, no live Google calls.
// Uses Node's built-in Web Crypto (available from Node 18+; jest-environment-node).

import { encryptToken, decryptToken } from '@/lib/gmail/token-crypto'

// 32-byte all-zeros key (valid AES-256-GCM key for testing)
const TEST_KEY_32 = Buffer.alloc(32, 0).toString('base64')
// 16-byte key (invalid — must be 32 bytes)
const TEST_KEY_16 = Buffer.alloc(16, 0).toString('base64')

describe('encryptToken', () => {
  beforeEach(() => { process.env.GMAIL_TOKEN_ENC_KEY = TEST_KEY_32 })
  afterEach(() => { delete process.env.GMAIL_TOKEN_ENC_KEY })

  it('returns a non-empty base64 string', async () => {
    const enc = await encryptToken('access-token-abc')
    expect(typeof enc).toBe('string')
    expect(enc.length).toBeGreaterThan(0)
    // Must be valid base64
    expect(() => Buffer.from(enc, 'base64')).not.toThrow()
  })

  it('produces different ciphertext each call (random IV)', async () => {
    const enc1 = await encryptToken('same-plaintext')
    const enc2 = await encryptToken('same-plaintext')
    expect(enc1).not.toBe(enc2)
  })

  it('throws when GMAIL_TOKEN_ENC_KEY is absent (fail closed)', async () => {
    delete process.env.GMAIL_TOKEN_ENC_KEY
    await expect(encryptToken('x')).rejects.toThrow('GMAIL_TOKEN_ENC_KEY')
  })

  it('throws when key decodes to wrong byte length', async () => {
    process.env.GMAIL_TOKEN_ENC_KEY = TEST_KEY_16 // 16 bytes — invalid for AES-256
    await expect(encryptToken('x')).rejects.toThrow()
  })
})

describe('decryptToken', () => {
  beforeEach(() => { process.env.GMAIL_TOKEN_ENC_KEY = TEST_KEY_32 })
  afterEach(() => { delete process.env.GMAIL_TOKEN_ENC_KEY })

  it('round-trips a short plaintext', async () => {
    const plain = 'ya29.access-token-value'
    const enc   = await encryptToken(plain)
    expect(await decryptToken(enc)).toBe(plain)
  })

  it('round-trips a long plaintext (refresh token)', async () => {
    const plain = '1//0g-long-refresh-token-'.repeat(10)
    const enc   = await encryptToken(plain)
    expect(await decryptToken(enc)).toBe(plain)
  })

  it('round-trips unicode content', async () => {
    const plain = 'token-with-emoji-🔑'
    expect(await decryptToken(await encryptToken(plain))).toBe(plain)
  })

  it('throws on tampered ciphertext (GCM auth tag failure)', async () => {
    const enc   = await encryptToken('refresh-token')
    const bytes = Buffer.from(enc, 'base64')
    // Flip a byte in the ciphertext portion (after the 12-byte IV)
    bytes[16] ^= 0xff
    const tampered = bytes.toString('base64')
    await expect(decryptToken(tampered)).rejects.toThrow()
  })

  it('throws on input that is too short to contain IV', async () => {
    // base64 of fewer than 12 bytes
    const tooShort = Buffer.alloc(8, 0).toString('base64')
    await expect(decryptToken(tooShort)).rejects.toThrow()
  })

  it('throws when GMAIL_TOKEN_ENC_KEY is absent (fail closed)', async () => {
    delete process.env.GMAIL_TOKEN_ENC_KEY
    // Need a syntactically valid ciphertext — encrypt first with key set, then remove key
    process.env.GMAIL_TOKEN_ENC_KEY = TEST_KEY_32
    const enc = await encryptToken('x')
    delete process.env.GMAIL_TOKEN_ENC_KEY
    await expect(decryptToken(enc)).rejects.toThrow('GMAIL_TOKEN_ENC_KEY')
  })
})
