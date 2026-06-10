/**
 * Outreach state machine — pure logic + thin DB layer.
 *
 * Pure exports (no Supabase import, fully testable):
 *   OUTREACH_STATES, ALLOWED_TRANSITIONS, TERMINAL_STATES
 *   isLegalTransition(), isTerminalState(), buildTransitionAudit()
 *
 * DB export (requires Supabase env vars at runtime):
 *   transitionOutreachState()
 */

import type { OutreachState } from '@/types'

// ---------------------------------------------------------------------------
// Canonical state list (22 values — mirrors the CHECK constraint in 002_outreach_foundation.sql)
// ---------------------------------------------------------------------------
export const OUTREACH_STATES: readonly OutreachState[] = [
  'new',
  'enriching',
  'enriched',
  'qualified',
  'needs_review',
  'approved_to_send',
  'scheduled',
  'sent_initial',
  'awaiting_response',
  'followup_1_scheduled',
  'followup_1_sent',
  'followup_2_scheduled',
  'followup_2_sent',
  'positive_reply',
  'meeting_requested',
  'manual_outreach',
  'manual_contacted',
  'not_interested',
  'unsubscribed',
  'bounced',
  'do_not_contact',
  'error',
] as const

// ---------------------------------------------------------------------------
// Terminal states — no transitions allowed out.
// ---------------------------------------------------------------------------
export const TERMINAL_STATES = new Set<OutreachState>([
  'meeting_requested',
  'not_interested',
  'unsubscribed',
  'bounced',
  'do_not_contact',
])

// ---------------------------------------------------------------------------
// Allowed transitions (strict lifecycle graph).
// Every reachable (from, to) pair must appear here; everything else is illegal.
// ---------------------------------------------------------------------------
export const ALLOWED_TRANSITIONS: Record<OutreachState, readonly OutreachState[]> = {
  new:                  ['enriching', 'manual_outreach', 'do_not_contact', 'error'],
  enriching:            ['enriched', 'needs_review', 'error'],
  enriched:             ['qualified', 'not_interested', 'needs_review', 'error'],
  qualified:            ['needs_review', 'approved_to_send', 'manual_outreach', 'error'],
  needs_review:         ['approved_to_send', 'manual_outreach', 'not_interested', 'do_not_contact', 'error'],
  approved_to_send:     ['scheduled', 'needs_review', 'error'],
  scheduled:            ['sent_initial', 'needs_review', 'error'],
  sent_initial:         ['awaiting_response', 'bounced', 'error'],
  awaiting_response:    ['positive_reply', 'followup_1_scheduled', 'not_interested', 'unsubscribed', 'bounced', 'meeting_requested', 'error'],
  followup_1_scheduled: ['followup_1_sent', 'awaiting_response', 'error'],
  followup_1_sent:      ['awaiting_response', 'positive_reply', 'followup_2_scheduled', 'not_interested', 'unsubscribed', 'bounced', 'meeting_requested', 'error'],
  followup_2_scheduled: ['followup_2_sent', 'awaiting_response', 'error'],
  followup_2_sent:      ['awaiting_response', 'positive_reply', 'not_interested', 'unsubscribed', 'bounced', 'meeting_requested', 'error'],
  positive_reply:       ['meeting_requested', 'manual_contacted', 'not_interested', 'do_not_contact', 'error'],
  manual_outreach:      ['manual_contacted', 'not_interested', 'do_not_contact', 'error'],
  manual_contacted:     ['positive_reply', 'meeting_requested', 'not_interested', 'unsubscribed', 'do_not_contact', 'error'],
  // terminal states — empty arrays enforce no-exit
  meeting_requested:    [],
  not_interested:       [],
  unsubscribed:         [],
  bounced:              [],
  do_not_contact:       [],
  // error can recover
  error:                ['needs_review', 'do_not_contact'],
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function isLegalTransition(from: OutreachState, to: OutreachState): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly OutreachState[]).includes(to)
}

export function isTerminalState(state: OutreachState): boolean {
  return TERMINAL_STATES.has(state)
}

/** Builds the audit_log payload for a transition. Pure — no side effects. */
export function buildTransitionAudit(
  leadId: string,
  from: OutreachState,
  to: OutreachState,
  actor: string,
  detail?: Record<string, unknown>
) {
  return {
    lead_id: leadId,
    event_type: 'outreach_state_transition' as const,
    from_state: from,
    to_state: to,
    actor,
    detail: detail ?? null,
    created_at: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// DB layer — thin Supabase wrapper (fails closed on illegal transition)
// ---------------------------------------------------------------------------

export type TransitionResult =
  | { ok: true; newState: OutreachState }
  | { ok: false; reason: string }

/**
 * Reads current state, validates the transition, then writes sequentially:
 * (1) updates the leads row, (2) inserts an audit_log entry.
 * The audit insert is non-fatal on failure. This is not wrapped in a transaction,
 * so if the audit insert fails, the state update can still remain committed.
 * Fails closed: if the transition is illegal, or if the current state cannot be
 * read, no writes occur and `ok: false` is returned.
 *
 * Does NOT implement the send gate, email sending, or any follow-up scheduling.
 */
export async function transitionOutreachState(
  leadId: string,
  to: OutreachState,
  actor: string,
  detail?: Record<string, unknown>
): Promise<TransitionResult> {
  // Lazy import so this module is pure at the top level (testable without env vars).
  const { getSupabaseServer } = await import('@/lib/supabase')
  const supabase = getSupabaseServer()

  // 1. Read current state.
  const { data: lead, error: readError } = await supabase
    .from('leads')
    .select('outreach_state')
    .eq('id', leadId)
    .single()

  if (readError || !lead) {
    return { ok: false, reason: `Could not read lead ${leadId}: ${readError?.message ?? 'not found'}` }
  }

  const from = lead.outreach_state as OutreachState

  // 2. Validate transition.
  if (!isLegalTransition(from, to)) {
    return { ok: false, reason: `Illegal transition: ${from} → ${to}` }
  }

  // 3. Update leads row.
  const { error: updateError } = await supabase
    .from('leads')
    .update({ outreach_state: to })
    .eq('id', leadId)

  if (updateError) {
    return { ok: false, reason: `Failed to update outreach_state: ${updateError.message}` }
  }

  // 4. Write audit_log entry.
  const auditPayload = buildTransitionAudit(leadId, from, to, actor, detail)
  const { error: auditError } = await supabase
    .from('audit_log')
    .insert(auditPayload)

  if (auditError) {
    // Non-fatal: the state was already updated. Log but don't fail the caller.
    console.error('[outreach-state] audit_log insert failed:', auditError.message)
  }

  return { ok: true, newState: to }
}
