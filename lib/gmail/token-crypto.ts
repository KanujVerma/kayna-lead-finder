// AES-256-GCM token encryption/decryption.
// Uses Web Crypto API (crypto.subtle) — works in Cloudflare Workers and Node 20+.
// Never logs plaintext tokens or the encryption key.
// Fail-closed: missing or wrong-length key throws immediately.

const IV_BYTES = 12  // 96-bit IV for AES-GCM (recommended)
const KEY_BYTES = 32 // 256-bit key for AES-256-GCM

function base64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  // Use explicit ArrayBuffer so the result is Uint8Array<ArrayBuffer>
  // (required by crypto.subtle which expects BufferSource = ArrayBufferView<ArrayBuffer>)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function getEncKey(): Promise<CryptoKey> {
  const raw = process.env.GMAIL_TOKEN_ENC_KEY
  if (!raw) throw new Error('[gmail/token-crypto] GMAIL_TOKEN_ENC_KEY is not set')

  const keyBytes = base64ToUint8Array(raw)
  if (keyBytes.byteLength !== KEY_BYTES) {
    throw new Error(
      `[gmail/token-crypto] GMAIL_TOKEN_ENC_KEY must decode to exactly ${KEY_BYTES} bytes` +
      ` (got ${keyBytes.byteLength}). Generate with: openssl rand -base64 32`,
    )
  }

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,             // not extractable
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypt a plaintext token string.
 * Output: base64-encoded IV || ciphertext (IV is prepended so decrypt can recover it).
 * Each call uses a fresh random IV — two encryptions of the same value produce different output.
 */
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncKey()
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)

  // Combine IV + ciphertext into a single buffer then base64-encode.
  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_BYTES)
  return uint8ArrayToBase64(combined)
}

/**
 * Decrypt a token previously encrypted by encryptToken.
 * AES-GCM includes an auth tag — tampered ciphertext will throw (fail closed).
 * Never logs the decrypted value.
 */
export async function decryptToken(enc: string): Promise<string> {
  const key = await getEncKey()
  const combined = base64ToUint8Array(enc)

  if (combined.byteLength <= IV_BYTES) {
    throw new Error('[gmail/token-crypto] Ciphertext too short to contain IV')
  }

  const iv = combined.slice(0, IV_BYTES)
  const ciphertext = combined.slice(IV_BYTES)

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}
