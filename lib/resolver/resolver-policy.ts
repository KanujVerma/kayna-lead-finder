/**
 * resolver-policy.ts — pure, deterministic resolver logic.
 *
 * No network, no DB, no LLM calls. All functions are pure and testable in isolation.
 * Raw HTML and evidence rows are never returned to callers.
 *
 * Phase 5 rule: zero LLM calls in the happy path. No guessed emails ever selected.
 */

import { isLegalTransition, isTerminalState } from '@/lib/outreach-state'
import type { OutreachState } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Confidence tiers for email evidence.
 * Tier order: official_mailto < official_visible < public_thirdparty < markup_only < guessed < none
 * Note: 'guessed' is a classification only — never selected or emitted as best_email in V1.
 */
export type EmailConfidence =
  | 'official_mailto'   // 1 — href="mailto:…" on lead's own website
  | 'official_visible'  // 2 — visible in body text on lead's own website
  | 'public_thirdparty' // 3 — reserved for future tier (e.g. Firecrawl, Places)
  | 'markup_only'       // 4 — reserved for future tier
  | 'guessed'           // 5 — V1: classification only, never selected as sendable
  | 'none'              // 6 — no usable email found

const CONFIDENCE_RANK: Record<EmailConfidence, number> = {
  official_mailto:   1,
  official_visible:  2,
  public_thirdparty: 3,
  markup_only:       4,
  guessed:           5,
  none:              6,
}

export interface EmailCandidate {
  email: string
  confidence: EmailConfidence
  domainMatch: boolean
  isNoReply: boolean
  isRoleEmail: boolean
}

export interface PickedEmail {
  email: string
  confidence: EmailConfidence
}

/** Shape stored in lead_resolved.context_pack. Compact (~300–400 tokens). No raw HTML. */
export interface ContextPack {
  business_name: string
  website: string | null
  best_email: string | null
  email_confidence: EmailConfidence
  quality_score: number
  email_summary: {
    mailto_count: number
    visible_count: number
    candidates: Array<{ email: string; confidence: EmailConfidence; domain_match: boolean }>
  }
  phone_summary: {
    tel_count: number
    visible_count: number
    sample: string[]
  }
  links_summary: {
    contact: string[]
    booking: string[]
    about: string[]
    social: Array<{ platform?: string; url: string }>
  }
  page: {
    title: string | null
    description: string | null
  }
  signals: {
    hasContactForm: boolean
    hasMailto: boolean
    hasTel: boolean
    socialCount: number
  }
  warnings: string[]
  recommended_action: string
  approx_tokens: number
}

export interface ResolvedLead {
  best_email: string | null
  email_confidence: EmailConfidence
  quality_score: number
  /** 'qualified' when best_email present AND quality_score >= 50; else 'needs_review'. */
  outcome: 'qualified' | 'needs_review'
  context_pack: ContextPack
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Email normalization & validation
// ---------------------------------------------------------------------------

/** Lowercase + trim an email address. */
export function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim()
}

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

/** Basic structural validity — does not check MX records. */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

const BAD_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net',
  'test.com', 'test.org',
  'domain.com', 'yourdomain.com', 'youremail.com',
  'email.com', 'mail.com',
  'placeholder.com',
  'sentry.io', // sentry DSN fragments occasionally leak
])

const BAD_LOCAL_PARTS = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'postmaster', 'bounce',
])

const ASSET_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|css|js|ts|tsx|woff|woff2|ttf)$/i

/** Drop malformed, dummy/example/asset emails. Never drop noreply — that's deprioritized separately. */
export function isBadEmail(email: string): boolean {
  if (!isValidEmail(email)) return true

  const [local, domain] = email.split('@')
  if (!local || !domain) return true

  // Asset filenames that happen to match email regex (e.g. logo@2x.png)
  if (ASSET_EXTENSIONS.test(local)) return true
  if (ASSET_EXTENSIONS.test(domain)) return true

  // Dummy/test domains
  if (BAD_DOMAINS.has(domain)) return true

  // Very short local parts unlikely to be real
  if (local.length < 2) return true

  return false
}

export function isNoReply(email: string): boolean {
  const local = email.split('@')[0] ?? ''
  return BAD_LOCAL_PARTS.has(local)
}

const ROLE_LOCALS = new Set([
  'info', 'hello', 'contact', 'support', 'help', 'sales', 'team',
  'office', 'admin', 'mail', 'general', 'enquiries', 'inquiries',
  'booking', 'reservations', 'appointments', 'shop', 'store',
])

/** Role/business emails — safe for cold B2B discovery, preferred over unknown personal. */
export function isRoleEmail(email: string): boolean {
  const local = email.split('@')[0] ?? ''
  return ROLE_LOCALS.has(local)
}

// ---------------------------------------------------------------------------
// Domain matching
// ---------------------------------------------------------------------------

/**
 * Registrable domain heuristic: last two labels (e.g. "example.co" from "mail.example.co").
 * V1 limitation: does not handle multi-part eTLDs (e.g. .co.uk). Acceptable for US/Tri-Valley.
 */
export function registrableDomain(host: string): string {
  const labels = host.split('.')
  return labels.slice(-2).join('.').toLowerCase()
}

/** True if the email's domain matches the website's registrable domain. */
export function domainMatches(email: string, websiteUrl: string | null | undefined): boolean {
  if (!websiteUrl) return false
  const emailDomain = email.split('@')[1] ?? ''
  if (!emailDomain) return false
  let websiteHost: string
  try {
    websiteHost = new URL(websiteUrl).hostname
  } catch {
    return false
  }
  return registrableDomain(emailDomain) === registrableDomain(websiteHost)
}

// ---------------------------------------------------------------------------
// Evidence classification
// ---------------------------------------------------------------------------

/** Maps lead_evidence rows to EmailCandidate objects with tier classification. */
export function classifyEmailCandidates(
  evidenceRows: Array<{ evidence_type: string | null; value: string | null }>,
  websiteUrl: string | null | undefined,
): EmailCandidate[] {
  const candidates: EmailCandidate[] = []

  for (const row of evidenceRows) {
    if (!row.value) continue
    const et = row.evidence_type ?? ''
    if (et !== 'email_mailto' && et !== 'email_visible') continue

    const email = normalizeEmail(row.value)
    if (isBadEmail(email)) continue

    const confidence: EmailConfidence =
      et === 'email_mailto' ? 'official_mailto' : 'official_visible'

    candidates.push({
      email,
      confidence,
      domainMatch: domainMatches(email, websiteUrl),
      isNoReply: isNoReply(email),
      isRoleEmail: isRoleEmail(email),
    })
  }

  // Deduplicate by email, keeping highest-tier (lowest rank number) occurrence.
  const seen = new Map<string, EmailCandidate>()
  for (const c of candidates) {
    const existing = seen.get(c.email)
    if (!existing || CONFIDENCE_RANK[c.confidence] < CONFIDENCE_RANK[existing.confidence]) {
      seen.set(c.email, c)
    }
  }

  return [...seen.values()]
}

// ---------------------------------------------------------------------------
// Email selection
// ---------------------------------------------------------------------------

/**
 * Deterministic sort: best → worst.
 * Order: tier rank → domain-match → non-noreply → role/business → alphabetical.
 * Never selects guessed emails (not produced by classifyEmailCandidates in V1).
 */
export function pickBestEmail(
  candidates: EmailCandidate[],
  _websiteUrl?: string | null,
): PickedEmail | null {
  if (candidates.length === 0) return null

  const sorted = [...candidates].sort((a, b) => {
    // 1. Tier rank (lower = better)
    const rankDiff = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]
    if (rankDiff !== 0) return rankDiff

    // 2. Domain-match (true = better)
    if (a.domainMatch !== b.domainMatch) return a.domainMatch ? -1 : 1

    // 3. Not noreply (false = better, i.e. non-noreply wins)
    if (a.isNoReply !== b.isNoReply) return a.isNoReply ? 1 : -1

    // 4. Role/business email preferred (B2B cold outreach safety)
    if (a.isRoleEmail !== b.isRoleEmail) return a.isRoleEmail ? -1 : 1

    // 5. Alphabetical tiebreak
    return a.email.localeCompare(b.email)
  })

  const best = sorted[0]!
  return { email: best.email, confidence: best.confidence }
}

// ---------------------------------------------------------------------------
// Quality score
// ---------------------------------------------------------------------------

interface QualityInputs {
  picked: PickedEmail | null
  hasDomainMatch: boolean
  hasPhone: boolean
  hasContactOrBooking: boolean
  hasAbout: boolean
  hasTitle: boolean
  hasSocial: boolean
}

/**
 * Deterministic quality score 0–100.
 * Higher = more evidence confidence, lower = less or risky.
 */
export function computeQualityScore(inputs: QualityInputs): number {
  let score = 0

  if (inputs.picked) {
    if (inputs.picked.confidence === 'official_mailto') score += 45
    else if (inputs.picked.confidence === 'official_visible') score += 35
    else if (inputs.picked.confidence === 'public_thirdparty') score += 25
    else if (inputs.picked.confidence === 'markup_only') score += 15

    if (inputs.hasDomainMatch) score += 15

    // Penalty: noreply selected as best (if it was the only option)
    if (isNoReply(inputs.picked.email)) score -= 10
  }

  if (inputs.hasPhone) score += 10
  if (inputs.hasContactOrBooking) score += 12
  if (inputs.hasAbout) score += 4
  if (inputs.hasTitle) score += 8
  if (inputs.hasSocial) score += 6

  return Math.max(0, Math.min(100, score))
}

// ---------------------------------------------------------------------------
// Context Pack builder
// ---------------------------------------------------------------------------

// ~1600 chars ≈ 400 tokens
const CONTEXT_PACK_CHAR_BUDGET = 1600

interface ContextPackInputs {
  businessName: string
  website: string | null
  picked: PickedEmail | null
  qualityScore: number
  candidates: EmailCandidate[]
  evidenceRows: Array<{
    evidence_type: string | null
    value: string | null
    detail: Record<string, unknown> | null
  }>
  warnings: string[]
}

function capStr(s: string | null | undefined, max = 200): string | null {
  if (!s) return null
  return s.length > max ? s.slice(0, max) : s
}

export function buildContextPack(inputs: ContextPackInputs): ContextPack {
  const {
    businessName, website, picked, qualityScore, candidates, evidenceRows, warnings,
  } = inputs

  // Collect phone evidence
  const telPhones = evidenceRows
    .filter(r => r.evidence_type === 'phone_tel' && r.value)
    .map(r => r.value!)
  const visiblePhones = evidenceRows
    .filter(r => r.evidence_type === 'phone_visible' && r.value)
    .map(r => r.value!)

  // Collect links by kind
  const contactLinks = evidenceRows
    .filter(r => r.evidence_type === 'link_contact' && r.value)
    .map(r => r.value!)
    .slice(0, 5)
  const bookingLinks = evidenceRows
    .filter(r => r.evidence_type === 'link_booking' && r.value)
    .map(r => r.value!)
    .slice(0, 5)
  const aboutLinks = evidenceRows
    .filter(r => r.evidence_type === 'link_about' && r.value)
    .map(r => r.value!)
    .slice(0, 3)
  const socialRows = evidenceRows
    .filter(r => r.evidence_type === 'link_social' && r.value)
    .slice(0, 6)
    .map(r => ({
      platform: r.detail?.platform as string | undefined,
      url: r.value!,
    }))

  // Page summary
  const pageSummaryRow = evidenceRows.find(r => r.evidence_type === 'page_summary')
  const pageTitle = capStr(pageSummaryRow?.value)
  const pageDescription = capStr(
    (pageSummaryRow?.detail?.description as string | null | undefined) ?? null
  )

  // Website signals
  const signalRow = evidenceRows.find(r => r.evidence_type === 'website_signal')
  const signals = {
    hasContactForm: Boolean(signalRow?.detail?.hasContactForm),
    hasMailto: Boolean(signalRow?.detail?.hasMailto),
    hasTel: Boolean(signalRow?.detail?.hasTel),
    socialCount: (signalRow?.detail?.socialCount as number) ?? 0,
  }

  // mailto/visible counts from all candidates (pre-dedup)
  const mailtoCount = evidenceRows.filter(r =>
    r.evidence_type === 'email_mailto' && r.value && !isBadEmail(normalizeEmail(r.value))
  ).length
  const visibleCount = evidenceRows.filter(r =>
    r.evidence_type === 'email_visible' && r.value && !isBadEmail(normalizeEmail(r.value))
  ).length

  // Email candidates for pack — up to 5, no raw HTML, no secrets
  const packCandidates = candidates.slice(0, 5).map(c => ({
    email: c.email,
    confidence: c.confidence,
    domain_match: c.domainMatch,
  }))

  // Recommended action
  const recommendedAction = picked
    ? qualityScore >= 50
      ? 'Ready for outreach — review context pack and approve send in Phase 6'
      : 'Weak evidence — human review recommended before sending'
    : 'No usable email found — manual lookup or skip recommended'

  const emailConfidence: EmailConfidence = picked?.confidence ?? 'none'

  const pack: ContextPack = {
    business_name: capStr(businessName, 100) ?? businessName,
    website: capStr(website, 200),
    best_email: picked?.email ?? null,
    email_confidence: emailConfidence,
    quality_score: qualityScore,
    email_summary: {
      mailto_count: mailtoCount,
      visible_count: visibleCount,
      candidates: packCandidates,
    },
    phone_summary: {
      tel_count: telPhones.length,
      visible_count: visiblePhones.length,
      sample: [...telPhones, ...visiblePhones].slice(0, 3),
    },
    links_summary: {
      contact: contactLinks,
      booking: bookingLinks,
      about: aboutLinks,
      social: socialRows,
    },
    page: {
      title: pageTitle,
      description: pageDescription,
    },
    signals,
    warnings: warnings.slice(0, 10),
    recommended_action: recommendedAction,
    approx_tokens: 0, // filled below
  }

  // Rough token estimate: chars / 4
  const serialized = JSON.stringify(pack)
  const approxTokens = Math.ceil(serialized.length / 4)
  pack.approx_tokens = approxTokens

  // Trim if over budget: truncate warnings and candidates first, then descriptions
  if (serialized.length > CONTEXT_PACK_CHAR_BUDGET * 1.5) {
    pack.warnings = pack.warnings.slice(0, 3)
    pack.email_summary.candidates = pack.email_summary.candidates.slice(0, 3)
    pack.links_summary.social = pack.links_summary.social.slice(0, 3)
    pack.page.description = capStr(pack.page.description, 120)
    pack.approx_tokens = Math.ceil(JSON.stringify(pack).length / 4)
  }

  return pack
}

// ---------------------------------------------------------------------------
// Transition planning
// ---------------------------------------------------------------------------

/**
 * Plan the outreach_state hops for a resolver run.
 *
 * Conservative policy:
 * - Returns planned hops ONLY if current ∈ {new, enriching, enriched}.
 * - For any other state (needs_review, qualified, approved_to_send+, terminal):
 *   returns empty steps + mismatch message.
 * - Never plans backward or sideways moves.
 * - outcome 'qualified' requires best_email + quality_score ≥ 50.
 */
export function planResolutionTransitions(
  current: OutreachState,
  outcome: 'qualified' | 'needs_review',
): { steps: OutreachState[]; mismatch?: string } {
  const FORWARD_STATES = new Set<OutreachState>(['new', 'enriching', 'enriched'])

  if (isTerminalState(current)) {
    return {
      steps: [],
      mismatch: `Lead is in terminal state '${current}' — no transitions will be attempted`,
    }
  }

  if (!FORWARD_STATES.has(current)) {
    return {
      steps: [],
      mismatch: `Lead is already at '${current}' — resolver data refreshed, no state transitions`,
    }
  }

  // Build the forward walk from current to outcome
  const allSteps: OutreachState[] = []

  if (current === 'new') allSteps.push('enriching')
  if (current === 'new' || current === 'enriching') allSteps.push('enriched')
  allSteps.push(outcome)

  // Validate all hops are legal (should always be true; this is a belt-and-suspenders check)
  let from: OutreachState = current
  const validatedSteps: OutreachState[] = []
  for (const step of allSteps) {
    if (!isLegalTransition(from, step)) {
      // Unexpected graph mismatch — stop planning
      return {
        steps: validatedSteps,
        mismatch: `Unexpected illegal hop ${from} → ${step} in forward walk`,
      }
    }
    validatedSteps.push(step)
    from = step
  }

  return { steps: validatedSteps }
}

// ---------------------------------------------------------------------------
// Orchestrator: buildResolvedLead
// ---------------------------------------------------------------------------

interface LeadInput {
  id: string
  name: string
  website: string | null | undefined
}

type EvidenceRowInput = {
  evidence_type: string | null
  value: string | null
  detail: Record<string, unknown> | null
}

/**
 * Pure orchestrator — no DB, no network.
 * Consumes evidence rows and produces a complete ResolvedLead ready for persistence.
 */
export function buildResolvedLead(
  lead: LeadInput,
  evidenceRows: EvidenceRowInput[],
): ResolvedLead {
  const websiteUrl = lead.website ?? null
  const warnings: string[] = []

  // 1. Classify email candidates
  const candidates = classifyEmailCandidates(evidenceRows, websiteUrl)

  // 2. Pick best email
  const picked = pickBestEmail(candidates, websiteUrl)

  // 3. Derive quality inputs
  const hasDomainMatch = picked ? domainMatches(picked.email, websiteUrl) : false
  const hasPhone = evidenceRows.some(
    r => (r.evidence_type === 'phone_tel' || r.evidence_type === 'phone_visible') && r.value
  )
  const hasContactOrBooking = evidenceRows.some(
    r => (r.evidence_type === 'link_contact' || r.evidence_type === 'link_booking') && r.value
  )
  const hasAbout = evidenceRows.some(r => r.evidence_type === 'link_about' && r.value)
  const hasTitle = evidenceRows.some(
    r => r.evidence_type === 'page_summary' && r.value
  )
  const hasSocial = evidenceRows.some(r => r.evidence_type === 'link_social' && r.value)

  // 4. Quality score
  const qualityScore = computeQualityScore({
    picked,
    hasDomainMatch,
    hasPhone,
    hasContactOrBooking,
    hasAbout,
    hasTitle,
    hasSocial,
  })

  // 5. Warnings
  if (!picked) {
    warnings.push('No usable email found — manual lookup or skip recommended')
  } else if (isNoReply(picked.email)) {
    warnings.push(`Best email '${picked.email}' is a noreply address — verify before sending`)
  }
  if (!hasPhone) {
    warnings.push('No phone number found on website')
  }
  if (!hasDomainMatch && picked) {
    warnings.push(`Email domain does not match website domain`)
  }

  // 6. Outcome routing
  const outcome: 'qualified' | 'needs_review' =
    picked && qualityScore >= 50 ? 'qualified' : 'needs_review'

  // 7. Build context pack
  const contextPack = buildContextPack({
    businessName: lead.name,
    website: websiteUrl,
    picked,
    qualityScore,
    candidates,
    evidenceRows,
    warnings,
  })

  return {
    best_email: picked?.email ?? null,
    email_confidence: picked?.confidence ?? 'none',
    quality_score: qualityScore,
    outcome,
    context_pack: contextPack,
    warnings,
  }
}
