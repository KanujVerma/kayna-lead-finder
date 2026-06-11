// Gmail account DB layer — reads and writes gmail_account + audit_log via Supabase.
// Never returns encrypted token columns to callers.
// Server-side only (uses getSupabaseServer).

import { getSupabaseServer } from '@/lib/supabase'

/** Safe public view of gmail_account — token columns never included. */
export interface GmailAccountStatus {
  connected: boolean
  email: string | null
  scopes: string | null
  token_expiry: string | null
  /** Mapped from created_at (first connect timestamp). */
  connected_at: string | null
}

/** Fetch connection status. Returns disconnected shape on error or no row. */
export async function getGmailAccountStatus(): Promise<GmailAccountStatus> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('gmail_account')
    .select('connected, email, scopes, token_expiry, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[gmail/account] Failed to read status:', error.message)
    return { connected: false, email: null, scopes: null, token_expiry: null, connected_at: null }
  }

  if (!data) {
    return { connected: false, email: null, scopes: null, token_expiry: null, connected_at: null }
  }

  return {
    connected:   data.connected,
    email:       (data.email as string | null) ?? null,
    scopes:      (data.scopes as string | null) ?? null,
    token_expiry: (data.token_expiry as string | null) ?? null,
    connected_at: (data.created_at as string | null) ?? null,
  }
}

export interface ConnectParams {
  email: string
  accessTokenEnc: string
  refreshTokenEnc: string
  tokenExpiry: string
  scopes: string
}

/**
 * Upsert the gmail_account row on connect.
 * Sets connected=true, stores encrypted tokens, records audit event (no token values in detail).
 */
export async function connectGmailAccount(params: ConnectParams): Promise<void> {
  const supabase = getSupabaseServer()
  const { email, accessTokenEnc, refreshTokenEnc, tokenExpiry, scopes } = params

  const { error } = await supabase
    .from('gmail_account')
    .upsert(
      {
        email,
        access_token_enc:  accessTokenEnc,
        refresh_token_enc: refreshTokenEnc,
        token_expiry:      tokenExpiry,
        scopes,
        connected:         true,
      },
      { onConflict: 'email' },
    )

  if (error) {
    throw new Error(`[gmail/account] Failed to save gmail_account: ${error.message}`)
  }

  // Audit log — non-fatal; no token values in detail
  try {
    await supabase.from('audit_log').insert({
      event_type: 'gmail_connected',
      actor:      'manual',
      detail:     { email, scopes },
    })
  } catch {
    // non-fatal
  }
}

/**
 * Mark the account disconnected and null out encrypted token columns.
 * Requires GMAIL_SENDER_EMAIL env var to target the correct row (fail-closed).
 */
export async function disconnectGmailAccount(): Promise<void> {
  const supabase = getSupabaseServer()
  const senderEmail = process.env.GMAIL_SENDER_EMAIL

  if (!senderEmail) {
    throw new Error('[gmail/account] GMAIL_SENDER_EMAIL is not set — cannot disconnect')
  }

  const { error } = await supabase
    .from('gmail_account')
    .update({
      connected:         false,
      access_token_enc:  null,
      refresh_token_enc: null,
    })
    .eq('email', senderEmail)

  if (error) {
    throw new Error(`[gmail/account] Failed to disconnect: ${error.message}`)
  }

  // Audit log — non-fatal
  try {
    await supabase.from('audit_log').insert({
      event_type: 'gmail_disconnected',
      actor:      'manual',
      detail:     { email: senderEmail },
    })
  } catch {
    // non-fatal
  }
}
