/**
 * Supabase permission diagnostic — prints ONLY counts/errors/booleans.
 * Never prints key values.  Run with:
 *   npx ts-node --skip-project scripts/diag-supabase.ts
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Safe .env.local parser — strips quotes, skips comments
// ---------------------------------------------------------------------------
function loadEnvFile(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const key = t.slice(0, eq).trim()
      const raw = t.slice(eq + 1)
      vars[key] = raw.replace(/^(['"])(.*)\1$/, '$2').trim()
    }
    return vars
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Safely decode the JWT role claim
// ---------------------------------------------------------------------------
function jwtInfo(jwt: string): Record<string, unknown> {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return { error: 'NOT_A_JWT', parts: parts.length }
    const padding = (4 - (parts[1].length % 4)) % 4
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padding)
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')) as Record<string, unknown>
    return {
      role: payload.role,
      iss:  String(payload.iss ?? '').slice(-20),   // last 20 chars of issuer
      exp:  payload.exp ? new Date((payload.exp as number) * 1000).toISOString() : 'none',
    }
  } catch (e) {
    return { error: String(e) }
  }
}

// ---------------------------------------------------------------------------
// Raw HTTP fetch test (bypasses Supabase JS client entirely)
// ---------------------------------------------------------------------------
async function rawFetch(url: string, key: string, table: string) {
  const endpoint = `${url}/rest/v1/${table}?select=count`
  try {
    const res = await fetch(endpoint, {
      headers: {
        apikey:          key,
        Authorization:   `Bearer ${key}`,
        'Content-Type':  'application/json',
        Accept:          'application/json',
        Prefer:          'count=exact',
      },
    })
    const body = await res.text()
    // Only print status + first 200 chars of body (no key echoed in body)
    const safe = body.slice(0, 200)
    console.log(`  raw ${table.padEnd(14)}: HTTP ${res.status}  body=${safe}`)
  } catch (e) {
    console.log(`  raw ${table.padEnd(14)}: FETCH_ERROR ${e instanceof Error ? e.message : e}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const env = loadEnvFile('.env.local')

  const url        = env.NEXT_PUBLIC_SUPABASE_URL        ?? process.env.NEXT_PUBLIC_SUPABASE_URL        ?? ''
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY       ?? process.env.SUPABASE_SERVICE_ROLE_KEY       ?? ''
  const anonKey    = env.NEXT_PUBLIC_SUPABASE_ANON_KEY   ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY   ?? ''

  console.log('\n── env ──────────────────────────────────────────────')
  console.log('  url present        :', url.length > 0, '|', url.slice(-30))
  console.log('  serviceKey present :', serviceKey.length > 0, '| len', serviceKey.length)
  console.log('  anonKey present    :', anonKey.length > 0, '| len', anonKey.length)
  console.log('  sameAsAnon         :', serviceKey === anonKey && serviceKey.length > 0)
  console.log('  serviceKey JWT info:', JSON.stringify(serviceKey ? jwtInfo(serviceKey) : null))
  console.log('  anonKey    JWT info:', JSON.stringify(anonKey   ? jwtInfo(anonKey)    : null))

  if (!url || !serviceKey) {
    console.error('\n[diag] ABORT — missing url or service key')
    process.exit(1)
  }

  // ── Raw HTTP (no Supabase JS layer) ──────────────────────────────────────
  console.log('\n── raw HTTP (no Supabase JS, serviceKey) ────────────')
  await rawFetch(url, serviceKey, 'settings')
  await rawFetch(url, serviceKey, 'leads')
  await rawFetch(url, serviceKey, 'gmail_account')

  if (anonKey && anonKey !== serviceKey) {
    console.log('\n── raw HTTP (no Supabase JS, anonKey) ───────────────')
    await rawFetch(url, anonKey, 'settings')
    await rawFetch(url, anonKey, 'leads')
  }

  // ── Supabase JS client (same config as getSupabaseServer) ────────────────
  console.log('\n── Supabase JS client (getSupabaseServer config) ────')
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const tables = ['settings', 'leads', 'gmail_account'] as const
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
    if (error) {
      // Print full error object shape (no token data in error objects)
      console.log(`  ${table.padEnd(16)}: ❌  code=${JSON.stringify(error.code)}  msg=${JSON.stringify(error.message)}  details=${JSON.stringify(error.details)}  hint=${JSON.stringify(error.hint)}`)
    } else {
      console.log(`  ${table.padEnd(16)}: ✅  rows=${count}`)
    }
  }

  console.log()
}

main().catch(err => {
  console.error('[diag] Fatal:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
