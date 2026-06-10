import {
  OUTREACH_STATES,
  ALLOWED_TRANSITIONS,
  TERMINAL_STATES,
  isLegalTransition,
  isTerminalState,
  buildTransitionAudit,
} from '@/lib/outreach-state'
import type { OutreachState } from '@/types'

// ---------------------------------------------------------------------------
// State list / count
// ---------------------------------------------------------------------------

test('OUTREACH_STATES contains exactly 22 values', () => {
  expect(OUTREACH_STATES).toHaveLength(22)
})

test('OUTREACH_STATES contains every approved value', () => {
  const expected: OutreachState[] = [
    'new', 'enriching', 'enriched', 'qualified', 'needs_review',
    'approved_to_send', 'scheduled', 'sent_initial', 'awaiting_response',
    'followup_1_scheduled', 'followup_1_sent', 'followup_2_scheduled',
    'followup_2_sent', 'positive_reply', 'meeting_requested',
    'manual_outreach', 'manual_contacted', 'not_interested',
    'unsubscribed', 'bounced', 'do_not_contact', 'error',
  ]
  expect([...OUTREACH_STATES].sort()).toEqual([...expected].sort())
})

test('ALLOWED_TRANSITIONS has an entry for every state', () => {
  for (const state of OUTREACH_STATES) {
    expect(ALLOWED_TRANSITIONS).toHaveProperty(state)
  }
})

// ---------------------------------------------------------------------------
// Terminal states
// ---------------------------------------------------------------------------

test('TERMINAL_STATES contains exactly the 5 terminal values', () => {
  expect(TERMINAL_STATES.size).toBe(5)
  for (const t of ['meeting_requested', 'not_interested', 'unsubscribed', 'bounced', 'do_not_contact'] as OutreachState[]) {
    expect(TERMINAL_STATES.has(t)).toBe(true)
  }
})

test('isTerminalState returns true for all 5 terminal states', () => {
  expect(isTerminalState('meeting_requested')).toBe(true)
  expect(isTerminalState('not_interested')).toBe(true)
  expect(isTerminalState('unsubscribed')).toBe(true)
  expect(isTerminalState('bounced')).toBe(true)
  expect(isTerminalState('do_not_contact')).toBe(true)
})

test('isTerminalState returns false for non-terminal states', () => {
  expect(isTerminalState('new')).toBe(false)
  expect(isTerminalState('enriching')).toBe(false)
  expect(isTerminalState('awaiting_response')).toBe(false)
  expect(isTerminalState('error')).toBe(false)
})

test('terminal states have no allowed transitions (fail closed)', () => {
  for (const t of TERMINAL_STATES) {
    expect(ALLOWED_TRANSITIONS[t]).toHaveLength(0)
  }
})

// ---------------------------------------------------------------------------
// Legal transitions — forward-lifecycle examples
// ---------------------------------------------------------------------------

test('new -> enriching is legal', () => {
  expect(isLegalTransition('new', 'enriching')).toBe(true)
})

test('new -> manual_outreach is legal (manual fast-path)', () => {
  expect(isLegalTransition('new', 'manual_outreach')).toBe(true)
})

test('enriching -> enriched is legal', () => {
  expect(isLegalTransition('enriching', 'enriched')).toBe(true)
})

test('enriching -> needs_review is legal (enrichment flagged)', () => {
  expect(isLegalTransition('enriching', 'needs_review')).toBe(true)
})

test('qualified -> approved_to_send is legal', () => {
  expect(isLegalTransition('qualified', 'approved_to_send')).toBe(true)
})

test('approved_to_send -> scheduled is legal', () => {
  expect(isLegalTransition('approved_to_send', 'scheduled')).toBe(true)
})

test('scheduled -> sent_initial is legal', () => {
  expect(isLegalTransition('scheduled', 'sent_initial')).toBe(true)
})

test('sent_initial -> awaiting_response is legal', () => {
  expect(isLegalTransition('sent_initial', 'awaiting_response')).toBe(true)
})

test('awaiting_response -> followup_1_scheduled is legal', () => {
  expect(isLegalTransition('awaiting_response', 'followup_1_scheduled')).toBe(true)
})

test('awaiting_response -> meeting_requested is legal (direct positive reply)', () => {
  expect(isLegalTransition('awaiting_response', 'meeting_requested')).toBe(true)
})

test('followup_2_sent -> positive_reply is legal', () => {
  expect(isLegalTransition('followup_2_sent', 'positive_reply')).toBe(true)
})

test('positive_reply -> meeting_requested is legal', () => {
  expect(isLegalTransition('positive_reply', 'meeting_requested')).toBe(true)
})

test('manual_outreach -> manual_contacted is legal', () => {
  expect(isLegalTransition('manual_outreach', 'manual_contacted')).toBe(true)
})

test('error -> needs_review is legal (recovery)', () => {
  expect(isLegalTransition('error', 'needs_review')).toBe(true)
})

test('error -> do_not_contact is legal (permanent block)', () => {
  expect(isLegalTransition('error', 'do_not_contact')).toBe(true)
})

// Any active state -> error is legal
test('any active state -> error is legal', () => {
  const active: OutreachState[] = [
    'new', 'enriching', 'enriched', 'qualified', 'needs_review',
    'approved_to_send', 'scheduled', 'sent_initial', 'awaiting_response',
    'followup_1_scheduled', 'followup_1_sent', 'followup_2_scheduled',
    'followup_2_sent', 'positive_reply', 'manual_outreach', 'manual_contacted',
  ]
  for (const state of active) {
    expect(isLegalTransition(state, 'error')).toBe(true)
  }
})

// ---------------------------------------------------------------------------
// Illegal transitions — out-of-order and terminal-exit attempts
// ---------------------------------------------------------------------------

test('new -> sent_initial is illegal (skips enrichment)', () => {
  expect(isLegalTransition('new', 'sent_initial')).toBe(false)
})

test('new -> approved_to_send is illegal (skips qualification)', () => {
  expect(isLegalTransition('new', 'approved_to_send')).toBe(false)
})

test('enriched -> sent_initial is illegal (skips approval)', () => {
  expect(isLegalTransition('enriched', 'sent_initial')).toBe(false)
})

test('sent_initial -> scheduled is illegal (backwards)', () => {
  expect(isLegalTransition('sent_initial', 'scheduled')).toBe(false)
})

test('meeting_requested -> new is illegal (terminal, no exit)', () => {
  expect(isLegalTransition('meeting_requested', 'new')).toBe(false)
})

test('meeting_requested -> error is illegal (terminal, no exit)', () => {
  expect(isLegalTransition('meeting_requested', 'error')).toBe(false)
})

test('unsubscribed -> new is illegal (terminal, no exit)', () => {
  expect(isLegalTransition('unsubscribed', 'new')).toBe(false)
})

test('bounced -> awaiting_response is illegal (terminal, no exit)', () => {
  expect(isLegalTransition('bounced', 'awaiting_response')).toBe(false)
})

test('do_not_contact -> any state is illegal', () => {
  for (const state of OUTREACH_STATES) {
    expect(isLegalTransition('do_not_contact', state)).toBe(false)
  }
})

test('not_interested -> any state is illegal', () => {
  for (const state of OUTREACH_STATES) {
    expect(isLegalTransition('not_interested', state)).toBe(false)
  }
})

test('awaiting_response -> new is illegal (backwards)', () => {
  expect(isLegalTransition('awaiting_response', 'new')).toBe(false)
})

// ---------------------------------------------------------------------------
// buildTransitionAudit — payload shape (pure, no DB)
// ---------------------------------------------------------------------------

test('buildTransitionAudit returns correct shape with no extra detail', () => {
  const payload = buildTransitionAudit('lead-123', 'new', 'enriching', 'system')
  expect(payload.lead_id).toBe('lead-123')
  expect(payload.event_type).toBe('outreach_state_transition')
  expect(payload.from_state).toBe('new')
  expect(payload.to_state).toBe('enriching')
  expect(payload.actor).toBe('system')
  expect(payload.detail).toBeNull()
  expect(typeof payload.created_at).toBe('string')
  // created_at should be a valid ISO string
  expect(new Date(payload.created_at).getTime()).not.toBeNaN()
})

test('buildTransitionAudit includes detail when provided', () => {
  const detail = { source: 'webhook', attempt: 1 }
  const payload = buildTransitionAudit('lead-abc', 'awaiting_response', 'bounced', 'system', detail)
  expect(payload.detail).toEqual({ source: 'webhook', attempt: 1 })
})

test('buildTransitionAudit does not mutate detail object', () => {
  const detail = { source: 'manual' }
  buildTransitionAudit('lead-xyz', 'new', 'manual_outreach', 'user:krish', detail)
  expect(detail).toEqual({ source: 'manual' })
})
