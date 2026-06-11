/**
 * resolve-lead.ts — server-side runner for the deterministic resolver.
 *
 * DB layer: reads lead + lead_evidence, upserts lead_resolved, updates leads mirror fields,
 * and walks outreach_state forward via transitionOutreachState() only.
 *
 * Phase 5 rules:
 * - Zero LLM calls.
 * - No raw HTML returned.
 * - No Gmail / sending / outreach_messages / suppression writes.
 * - leads.stage never touched.
 * - outreach_state changed ONLY via transitionOutreachState() — illegal hops fail closed.
 * - Terminal leads: skip entirely (no writes, no transitions).
 * - Already needs_review/qualified/approved_to_send+: refresh data only, no transitions.
 */

import { getSupabaseServer } from '@/lib/supabase'
import { isTerminalState, transitionOutreachState } from '@/lib/outreach-state'
import { buildResolvedLead, planResolutionTransitions } from '@/lib/resolver/resolver-policy'
import type { OutreachState } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransitionRecord {
  from: OutreachState
  to: OutreachState
  ok: boolean
  reason?: string
}

export interface ResolveResult {
  status: 'resolved' | 'skipped' | 'error'
  leadId: string
  name: string
  website: string | null
  best_email: string | null
  email_confidence: string
  quality_score: number
  outcome: 'qualified' | 'needs_review' | null
  transitions: TransitionRecord[]
  stateMismatch?: string
  warnings: string[]
  /** Compact context pack — never raw evidence, never raw HTML. */
  contextPack: Record<string, unknown> | null
  /** Human-readable note on why work was skipped (if status = 'skipped'). */
  note?: string
  /** Error message (if status = 'error'). */
  error?: string
}

// ---------------------------------------------------------------------------
// resolveLeadById
// ---------------------------------------------------------------------------

export async function resolveLeadById(leadId: string): Promise<ResolveResult> {
  const supabase = getSupabaseServer()

  // -------------------------------------------------------------------------
  // 1. Read lead
  // -------------------------------------------------------------------------
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, name, website, outreach_state')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    return {
      status: 'error',
      leadId,
      name: '',
      website: null,
      best_email: null,
      email_confidence: 'none',
      quality_score: 0,
      outcome: null,
      transitions: [],
      warnings: ['Lead not found'],
      contextPack: null,
      error: leadError?.message ?? 'Lead not found',
    }
  }

  const currentState = lead.outreach_state as OutreachState

  // -------------------------------------------------------------------------
  // 2. Terminal check — skip with no writes, no transitions
  // -------------------------------------------------------------------------
  if (isTerminalState(currentState)) {
    return {
      status: 'skipped',
      leadId,
      name: lead.name,
      website: lead.website ?? null,
      best_email: null,
      email_confidence: 'none',
      quality_score: 0,
      outcome: null,
      transitions: [],
      warnings: [],
      contextPack: null,
      note: `Lead is in terminal state '${currentState}' — no writes or transitions performed`,
    }
  }

  // -------------------------------------------------------------------------
  // 3. Read lead_evidence rows
  // -------------------------------------------------------------------------
  const { data: evidenceRows, error: evidenceError } = await supabase
    .from('lead_evidence')
    .select('evidence_type, value, detail')
    .eq('lead_id', leadId)

  if (evidenceError) {
    return {
      status: 'error',
      leadId,
      name: lead.name,
      website: lead.website ?? null,
      best_email: null,
      email_confidence: 'none',
      quality_score: 0,
      outcome: null,
      transitions: [],
      warnings: [],
      contextPack: null,
      error: `Failed to read lead_evidence: ${evidenceError.message}`,
    }
  }

  // -------------------------------------------------------------------------
  // 4. No evidence — skip with no writes, no transitions
  // -------------------------------------------------------------------------
  if (!evidenceRows || evidenceRows.length === 0) {
    return {
      status: 'skipped',
      leadId,
      name: lead.name,
      website: lead.website ?? null,
      best_email: null,
      email_confidence: 'none',
      quality_score: 0,
      outcome: null,
      transitions: [],
      warnings: ['No evidence rows found — run Enrich first'],
      contextPack: null,
      note: 'No lead_evidence rows — run website enrichment before resolving',
    }
  }

  // -------------------------------------------------------------------------
  // 5. Build resolved lead (pure — no network, no DB)
  // -------------------------------------------------------------------------
  const resolved = buildResolvedLead(
    { id: lead.id, name: lead.name, website: lead.website ?? null },
    evidenceRows as Array<{
      evidence_type: string | null
      value: string | null
      detail: Record<string, unknown> | null
    }>,
  )

  // -------------------------------------------------------------------------
  // 6. Upsert lead_resolved
  // -------------------------------------------------------------------------
  const now = new Date().toISOString()

  const { error: upsertError } = await supabase
    .from('lead_resolved')
    .upsert(
      {
        lead_id: leadId,
        best_email: resolved.best_email,
        email_confidence: resolved.email_confidence,
        context_pack: resolved.context_pack as unknown as Record<string, unknown>,
        resolved_at: now,
      },
      { onConflict: 'lead_id' }
    )

  if (upsertError) {
    return {
      status: 'error',
      leadId,
      name: lead.name,
      website: lead.website ?? null,
      best_email: resolved.best_email,
      email_confidence: resolved.email_confidence,
      quality_score: resolved.quality_score,
      outcome: resolved.outcome,
      transitions: [],
      warnings: resolved.warnings,
      contextPack: null,
      error: `Failed to upsert lead_resolved: ${upsertError.message}`,
    }
  }

  // -------------------------------------------------------------------------
  // 7. Update leads mirror fields (never touches leads.stage)
  // -------------------------------------------------------------------------
  const { error: mirrorError } = await supabase
    .from('leads')
    .update({
      best_email: resolved.best_email,
      email_confidence: resolved.email_confidence,
      resolved_at: now,
      quality_score: resolved.quality_score,
    })
    .eq('id', leadId)

  if (mirrorError) {
    // Non-fatal — lead_resolved was already written. Log and continue.
    console.error('[resolve-lead] leads mirror update failed:', mirrorError.message)
    resolved.warnings.push(`Mirror update failed: ${mirrorError.message}`)
  }

  // -------------------------------------------------------------------------
  // 8. Conservative outreach_state walk
  // -------------------------------------------------------------------------
  const plan = planResolutionTransitions(currentState, resolved.outcome)
  const transitions: TransitionRecord[] = []

  if (plan.steps.length > 0) {
    // Execute each hop via transitionOutreachState() only
    let currentHopState: OutreachState = currentState
    for (const targetState of plan.steps) {
      const result = await transitionOutreachState(
        leadId,
        targetState,
        'manual:resolve',
        {
          resolver_outcome: resolved.outcome,
          quality_score: resolved.quality_score,
          best_email: resolved.best_email ?? null,
        },
      )
      transitions.push({
        from: currentHopState,
        to: targetState,
        ok: result.ok,
        reason: result.ok ? undefined : result.reason,
      })
      if (!result.ok) {
        // Failed hop — stop walking (later hops depend on prior state being correct)
        break
      }
      currentHopState = targetState
    }
  }

  // -------------------------------------------------------------------------
  // 9. Return compact summary — NEVER raw evidence, NEVER raw HTML
  // -------------------------------------------------------------------------
  return {
    status: 'resolved',
    leadId,
    name: lead.name,
    website: lead.website ?? null,
    best_email: resolved.best_email,
    email_confidence: resolved.email_confidence,
    quality_score: resolved.quality_score,
    outcome: resolved.outcome,
    transitions,
    stateMismatch: plan.mismatch,
    warnings: resolved.warnings,
    // context_pack is compact, derived, no raw HTML — safe to return
    contextPack: resolved.context_pack as unknown as Record<string, unknown>,
  }
}
