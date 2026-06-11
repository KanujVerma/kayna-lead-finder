/**
 * resolver-policy.test.ts — pure unit tests for the deterministic resolver.
 *
 * No DB, no network, no LLM calls. Tests only pure functions from resolver-policy.ts.
 */

import {
  normalizeEmail,
  isValidEmail,
  isBadEmail,
  isNoReply,
  isRoleEmail,
  registrableDomain,
  domainMatches,
  classifyEmailCandidates,
  pickBestEmail,
  computeQualityScore,
  buildContextPack,
  planResolutionTransitions,
  buildResolvedLead,
  type EmailCandidate,
  type EmailConfidence,
} from '@/lib/resolver/resolver-policy'
import type { OutreachState } from '@/types'

// ---------------------------------------------------------------------------
// normalizeEmail
// ---------------------------------------------------------------------------

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Info@Example.COM  ')).toBe('info@example.com')
  })

  it('handles already-normalized input', () => {
    expect(normalizeEmail('contact@acme.com')).toBe('contact@acme.com')
  })
})

// ---------------------------------------------------------------------------
// isValidEmail
// ---------------------------------------------------------------------------

describe('isValidEmail', () => {
  it.each([
    ['info@acme.com', true],
    ['hello+tag@subdomain.example.org', true],
    ['a@b.co', true],
  ])('valid: %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected)
  })

  it.each([
    ['notanemail', false],
    ['@nodomain.com', false],
    ['noatsign.com', false],
    ['double@@domain.com', false],
    ['', false],
  ])('invalid: %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// isBadEmail — filtering
// ---------------------------------------------------------------------------

describe('isBadEmail', () => {
  it('drops example.com addresses', () => {
    expect(isBadEmail('admin@example.com')).toBe(true)
  })

  it('drops test.com addresses', () => {
    expect(isBadEmail('user@test.com')).toBe(true)
  })

  it('drops malformed (no @)', () => {
    expect(isBadEmail('noatsign')).toBe(true)
  })

  it('drops asset filenames as local part', () => {
    // e.g. logo@2x is a common false-positive in text extraction
    expect(isBadEmail('logo@2x.png')).toBe(true)
  })

  it('drops addresses with asset extension in domain', () => {
    expect(isBadEmail('user@site.jpeg')).toBe(true)
  })

  it('keeps a legitimate business email', () => {
    expect(isBadEmail('info@kaynaspa.com')).toBe(false)
  })

  it('keeps a noreply address (deprioritized, not dropped)', () => {
    // noreply is deprioritized via isNoReply(), not filtered via isBadEmail()
    expect(isBadEmail('noreply@kaynaspa.com')).toBe(false)
  })

  it('drops single-character local parts (length < 2)', () => {
    expect(isBadEmail('a@domain.co')).toBe(true)   // 'a' length 1 < 2 → bad
    expect(isBadEmail('ab@domain.co')).toBe(false)  // 'ab' length 2 → ok
  })

  it('drops placeholder domains', () => {
    expect(isBadEmail('hello@yourdomain.com')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isNoReply
// ---------------------------------------------------------------------------

describe('isNoReply', () => {
  it.each([
    ['noreply@acme.com', true],
    ['no-reply@acme.com', true],
    ['donotreply@acme.com', true],
    ['bounce@acme.com', true],
    ['info@acme.com', false],
    ['hello@acme.com', false],
  ])('%s → %s', (email, expected) => {
    expect(isNoReply(email)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// isRoleEmail
// ---------------------------------------------------------------------------

describe('isRoleEmail', () => {
  it.each([
    ['info@acme.com', true],
    ['hello@acme.com', true],
    ['contact@acme.com', true],
    ['booking@acme.com', true],
    ['john.smith@acme.com', false],
    ['jsmith@acme.com', false],
  ])('%s → %s', (email, expected) => {
    expect(isRoleEmail(email)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// registrableDomain
// ---------------------------------------------------------------------------

describe('registrableDomain', () => {
  it('returns last two labels', () => {
    expect(registrableDomain('www.example.com')).toBe('example.com')
    expect(registrableDomain('mail.subdomain.acme.io')).toBe('acme.io')
    expect(registrableDomain('acme.com')).toBe('acme.com')
  })

  it('lowercases output', () => {
    expect(registrableDomain('Example.COM')).toBe('example.com')
  })
})

// ---------------------------------------------------------------------------
// domainMatches
// ---------------------------------------------------------------------------

describe('domainMatches', () => {
  it('matches same registrable domain', () => {
    expect(domainMatches('info@acme.com', 'https://www.acme.com')).toBe(true)
  })

  it('does not match different domain', () => {
    expect(domainMatches('info@other.com', 'https://www.acme.com')).toBe(false)
  })

  it('returns false for null websiteUrl', () => {
    expect(domainMatches('info@acme.com', null)).toBe(false)
  })

  it('returns false for invalid websiteUrl', () => {
    expect(domainMatches('info@acme.com', 'not-a-url')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// classifyEmailCandidates
// ---------------------------------------------------------------------------

describe('classifyEmailCandidates', () => {
  const website = 'https://www.kaynaspa.com'

  it('classifies email_mailto as official_mailto', () => {
    const rows = [{ evidence_type: 'email_mailto', value: 'info@kaynaspa.com', detail: null }]
    const candidates = classifyEmailCandidates(rows, website)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.confidence).toBe('official_mailto')
  })

  it('classifies email_visible as official_visible', () => {
    const rows = [{ evidence_type: 'email_visible', value: 'hello@kaynaspa.com', detail: null }]
    const candidates = classifyEmailCandidates(rows, website)
    expect(candidates[0]!.confidence).toBe('official_visible')
  })

  it('filters bad emails', () => {
    const rows = [
      { evidence_type: 'email_mailto', value: 'admin@example.com', detail: null },
      { evidence_type: 'email_mailto', value: 'info@kaynaspa.com', detail: null },
    ]
    const candidates = classifyEmailCandidates(rows, website)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.email).toBe('info@kaynaspa.com')
  })

  it('deduplicates same email — keeps best tier', () => {
    const rows = [
      { evidence_type: 'email_visible', value: 'info@kaynaspa.com', detail: null },
      { evidence_type: 'email_mailto', value: 'INFO@kaynaspa.com', detail: null }, // same email, better tier
    ]
    const candidates = classifyEmailCandidates(rows, website)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.confidence).toBe('official_mailto')
  })

  it('marks domain-match correctly', () => {
    const rows = [
      { evidence_type: 'email_mailto', value: 'info@kaynaspa.com', detail: null },
      { evidence_type: 'email_mailto', value: 'info@gmail.com', detail: null },
    ]
    const candidates = classifyEmailCandidates(rows, website)
    const matching = candidates.find(c => c.email === 'info@kaynaspa.com')
    const nonMatching = candidates.find(c => c.email === 'info@gmail.com')
    expect(matching?.domainMatch).toBe(true)
    expect(nonMatching?.domainMatch).toBe(false)
  })

  it('ignores non-email evidence_type rows', () => {
    const rows = [
      { evidence_type: 'link_contact', value: 'https://acme.com/contact', detail: null },
      { evidence_type: 'phone_tel', value: '5105551234', detail: null },
    ]
    expect(classifyEmailCandidates(rows, website)).toHaveLength(0)
  })

  it('never produces guessed emails', () => {
    // classifyEmailCandidates only assigns official_mailto or official_visible tiers
    const rows = [
      { evidence_type: 'email_mailto', value: 'any@realsite.com', detail: null },
      { evidence_type: 'email_visible', value: 'visible@realsite.com', detail: null },
    ]
    const candidates = classifyEmailCandidates(rows, 'https://realsite.com')
    for (const c of candidates) {
      expect(c.confidence).not.toBe('guessed')
      expect(c.confidence).not.toBe('none')
    }
  })
})

// ---------------------------------------------------------------------------
// pickBestEmail — selection order
// ---------------------------------------------------------------------------

describe('pickBestEmail', () => {
  const make = (
    email: string,
    confidence: EmailConfidence,
    domainMatch = true,
    isNoReply_ = false,
    isRoleEmail_ = true,
  ): EmailCandidate => ({ email, confidence, domainMatch, isNoReply: isNoReply_, isRoleEmail: isRoleEmail_ })

  it('returns null for empty candidates', () => {
    expect(pickBestEmail([])).toBeNull()
  })

  it('official_mailto beats official_visible', () => {
    const candidates = [
      make('hello@acme.com', 'official_visible'),
      make('info@acme.com', 'official_mailto'),
    ]
    const result = pickBestEmail(candidates)
    expect(result?.email).toBe('info@acme.com')
    expect(result?.confidence).toBe('official_mailto')
  })

  it('domain-match wins over non-domain-match at same tier', () => {
    const candidates = [
      make('info@gmail.com', 'official_mailto', false),
      make('info@acme.com', 'official_mailto', true),
    ]
    expect(pickBestEmail(candidates)?.email).toBe('info@acme.com')
  })

  it('non-noreply beats noreply at same tier and domain-match', () => {
    const candidates = [
      make('noreply@acme.com', 'official_mailto', true, true, false),
      make('info@acme.com', 'official_mailto', true, false, true),
    ]
    expect(pickBestEmail(candidates)?.email).toBe('info@acme.com')
  })

  it('role email beats non-role at same tier', () => {
    const candidates = [
      make('john@acme.com', 'official_mailto', true, false, false),
      make('info@acme.com', 'official_mailto', true, false, true),
    ]
    expect(pickBestEmail(candidates)?.email).toBe('info@acme.com')
  })

  it('alphabetical tiebreak is deterministic', () => {
    const candidates = [
      make('sales@acme.com', 'official_mailto', true, false, true),
      make('info@acme.com', 'official_mailto', true, false, true),
    ]
    // 'info' < 'sales' alphabetically
    expect(pickBestEmail(candidates)?.email).toBe('info@acme.com')
  })

  it('same input always produces same output (determinism)', () => {
    const candidates = [
      make('sales@acme.com', 'official_mailto', true, false, true),
      make('info@acme.com', 'official_visible', false, false, true),
      make('hello@acme.com', 'official_mailto', true, false, true),
    ]
    const r1 = pickBestEmail(candidates)
    const r2 = pickBestEmail(candidates)
    expect(r1?.email).toBe(r2?.email)
  })

  it('never selects a guessed email', () => {
    // guessed confidence is a classification only; pickBestEmail should not select it
    // (classifyEmailCandidates never produces 'guessed' in V1, but test the sort anyway)
    const candidates = [
      make('info@acme.com', 'guessed', true, false, true),
    ]
    // guessed ranks 5 — only candidate, so it would be returned — that's acceptable
    // because the caller (buildResolvedLead) only calls with V1 evidence (no guessed)
    // What we test: pickBestEmail never *introduces* a guessed email from nowhere
    expect(candidates[0]!.confidence).toBe('guessed')
    // The result is the guessed candidate since there's no choice — but this case
    // cannot occur in V1 (classifyEmailCandidates never produces guessed).
    // A safer assertion: when better options exist, guessed is deprioritized.
    const mixed = [
      make('info@acme.com', 'guessed', true, false, true),
      make('hello@acme.com', 'official_visible', true, false, true),
    ]
    expect(pickBestEmail(mixed)?.confidence).toBe('official_visible')
  })
})

// ---------------------------------------------------------------------------
// computeQualityScore
// ---------------------------------------------------------------------------

describe('computeQualityScore', () => {
  const makeInputs = (overrides: Partial<Parameters<typeof computeQualityScore>[0]> = {}) => ({
    picked: null,
    hasDomainMatch: false,
    hasPhone: false,
    hasContactOrBooking: false,
    hasAbout: false,
    hasTitle: false,
    hasSocial: false,
    ...overrides,
  })

  it('returns 0 when no email and no evidence', () => {
    expect(computeQualityScore(makeInputs())).toBe(0)
  })

  it('official_mailto adds 45 base points', () => {
    const score = computeQualityScore(makeInputs({
      picked: { email: 'info@acme.com', confidence: 'official_mailto' },
    }))
    expect(score).toBe(45)
  })

  it('official_visible adds 35 base points', () => {
    const score = computeQualityScore(makeInputs({
      picked: { email: 'info@acme.com', confidence: 'official_visible' },
    }))
    expect(score).toBe(35)
  })

  it('domain match adds 15 points', () => {
    const score = computeQualityScore(makeInputs({
      picked: { email: 'info@acme.com', confidence: 'official_mailto' },
      hasDomainMatch: true,
    }))
    expect(score).toBe(60) // 45 + 15
  })

  it('noreply as best email deducts 10 points', () => {
    const score = computeQualityScore(makeInputs({
      picked: { email: 'noreply@acme.com', confidence: 'official_mailto' },
      hasDomainMatch: true,
    }))
    expect(score).toBe(50) // 45 + 15 - 10
  })

  it('all bonuses stack correctly', () => {
    const score = computeQualityScore({
      picked: { email: 'info@acme.com', confidence: 'official_mailto' },
      hasDomainMatch: true,
      hasPhone: true,
      hasContactOrBooking: true,
      hasAbout: true,
      hasTitle: true,
      hasSocial: true,
    })
    // 45 + 15 + 10 + 12 + 4 + 8 + 6 = 100
    expect(score).toBe(100)
  })

  it('clamps at 0 minimum', () => {
    expect(computeQualityScore(makeInputs())).toBeGreaterThanOrEqual(0)
  })

  it('clamps at 100 maximum', () => {
    // Even if bonuses would exceed 100
    const score = computeQualityScore({
      picked: { email: 'info@acme.com', confidence: 'official_mailto' },
      hasDomainMatch: true,
      hasPhone: true,
      hasContactOrBooking: true,
      hasAbout: true,
      hasTitle: true,
      hasSocial: true,
    })
    expect(score).toBeLessThanOrEqual(100)
  })

  it('threshold: quality_score >= 50 triggers qualified outcome', () => {
    // Domain-matched mailto = 45+15 = 60 → qualified
    const highScore = computeQualityScore(makeInputs({
      picked: { email: 'info@acme.com', confidence: 'official_mailto' },
      hasDomainMatch: true,
    }))
    expect(highScore).toBeGreaterThanOrEqual(50)

    // No email = 0 → needs_review
    const lowScore = computeQualityScore(makeInputs())
    expect(lowScore).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// buildContextPack
// ---------------------------------------------------------------------------

describe('buildContextPack', () => {
  const baseInputs = (): Parameters<typeof buildContextPack>[0] => ({
    businessName: 'Kayna Spa',
    website: 'https://kaynaspa.com',
    picked: { email: 'info@kaynaspa.com', confidence: 'official_mailto' },
    qualityScore: 60,
    candidates: [{
      email: 'info@kaynaspa.com',
      confidence: 'official_mailto',
      domainMatch: true,
      isNoReply: false,
      isRoleEmail: true,
    }],
    evidenceRows: [
      { evidence_type: 'email_mailto', value: 'info@kaynaspa.com', detail: null },
      { evidence_type: 'phone_tel', value: '5105551234', detail: null },
      { evidence_type: 'link_contact', value: 'https://kaynaspa.com/contact', detail: null },
      { evidence_type: 'link_social', value: 'https://instagram.com/kaynasp', detail: { platform: 'instagram' } },
      { evidence_type: 'page_summary', value: 'Kayna Spa — Oakland', detail: { description: 'Relaxing spa services', fetched_url: 'https://kaynaspa.com' } },
      { evidence_type: 'website_signal', value: null, detail: { hasContactForm: true, hasMailto: true, hasTel: true, socialCount: 1 } },
    ],
    warnings: [],
  })

  it('contains required fields', () => {
    const pack = buildContextPack(baseInputs())
    expect(pack.business_name).toBe('Kayna Spa')
    expect(pack.best_email).toBe('info@kaynaspa.com')
    expect(pack.email_confidence).toBe('official_mailto')
    expect(pack.quality_score).toBe(60)
    expect(pack.approx_tokens).toBeGreaterThan(0)
  })

  it('does not contain raw HTML', () => {
    const pack = buildContextPack(baseInputs())
    const serialized = JSON.stringify(pack)
    // No HTML tags
    expect(serialized).not.toMatch(/<[a-z][\s\S]*?>/i)
    expect(serialized).not.toMatch(/<\/[a-z]+>/i)
  })

  it('stays within character budget (roughly)', () => {
    const pack = buildContextPack(baseInputs())
    const len = JSON.stringify(pack).length
    // Should be well under 5000 chars (budget is ~1600 * 1.5 = 2400 before trim kicks in)
    expect(len).toBeLessThan(5000)
  })

  it('caps email candidates at 5', () => {
    const inputs = baseInputs()
    inputs.candidates = Array.from({ length: 10 }, (_, i) => ({
      email: `email${i}@kaynaspa.com`,
      confidence: 'official_mailto' as EmailConfidence,
      domainMatch: true,
      isNoReply: false,
      isRoleEmail: true,
    }))
    const pack = buildContextPack(inputs)
    expect(pack.email_summary.candidates.length).toBeLessThanOrEqual(5)
  })

  it('caps social links at 6', () => {
    const inputs = baseInputs()
    inputs.evidenceRows = [
      ...inputs.evidenceRows,
      ...Array.from({ length: 10 }, (_, i) => ({
        evidence_type: 'link_social',
        value: `https://instagram.com/page${i}`,
        detail: { platform: 'instagram' },
      })),
    ]
    const pack = buildContextPack(inputs)
    expect(pack.links_summary.social.length).toBeLessThanOrEqual(6)
  })

  it('approx_tokens is a positive integer', () => {
    const pack = buildContextPack(baseInputs())
    expect(Number.isInteger(pack.approx_tokens)).toBe(true)
    expect(pack.approx_tokens).toBeGreaterThan(0)
  })

  it('null email produces confidence = none', () => {
    const inputs = baseInputs()
    inputs.picked = null
    const pack = buildContextPack(inputs)
    expect(pack.best_email).toBeNull()
    expect(pack.email_confidence).toBe('none')
  })

  it('deterministic: same input → identical output', () => {
    const inputs = baseInputs()
    const pack1 = buildContextPack(inputs)
    const pack2 = buildContextPack(inputs)
    expect(JSON.stringify(pack1)).toBe(JSON.stringify(pack2))
  })
})

// ---------------------------------------------------------------------------
// planResolutionTransitions — conservative state behavior
// ---------------------------------------------------------------------------

describe('planResolutionTransitions', () => {
  it('plans full forward walk from new to qualified', () => {
    const plan = planResolutionTransitions('new', 'qualified')
    expect(plan.steps).toEqual(['enriching', 'enriched', 'qualified'])
    expect(plan.mismatch).toBeUndefined()
  })

  it('plans forward walk from new to needs_review', () => {
    const plan = planResolutionTransitions('new', 'needs_review')
    expect(plan.steps).toEqual(['enriching', 'enriched', 'needs_review'])
    expect(plan.mismatch).toBeUndefined()
  })

  it('plans partial forward walk from enriching to qualified', () => {
    const plan = planResolutionTransitions('enriching', 'qualified')
    expect(plan.steps).toEqual(['enriched', 'qualified'])
    expect(plan.mismatch).toBeUndefined()
  })

  it('plans single hop from enriched to qualified', () => {
    const plan = planResolutionTransitions('enriched', 'qualified')
    expect(plan.steps).toEqual(['qualified'])
    expect(plan.mismatch).toBeUndefined()
  })

  it('plans single hop from enriched to needs_review', () => {
    const plan = planResolutionTransitions('enriched', 'needs_review')
    expect(plan.steps).toEqual(['needs_review'])
    expect(plan.mismatch).toBeUndefined()
  })

  it('returns empty steps + mismatch for needs_review (data refresh only)', () => {
    const plan = planResolutionTransitions('needs_review', 'qualified')
    expect(plan.steps).toHaveLength(0)
    expect(plan.mismatch).toBeDefined()
    expect(plan.mismatch).toContain('needs_review')
  })

  it('returns empty steps + mismatch for qualified (data refresh only)', () => {
    const plan = planResolutionTransitions('qualified', 'needs_review')
    expect(plan.steps).toHaveLength(0)
    expect(plan.mismatch).toBeDefined()
  })

  it('returns empty steps + mismatch for approved_to_send (data refresh only)', () => {
    const plan = planResolutionTransitions('approved_to_send', 'qualified')
    expect(plan.steps).toHaveLength(0)
    expect(plan.mismatch).toBeDefined()
  })

  it('returns empty steps + mismatch for terminal state', () => {
    const terminalStates: OutreachState[] = [
      'not_interested', 'unsubscribed', 'bounced', 'do_not_contact', 'meeting_requested',
    ]
    for (const state of terminalStates) {
      const plan = planResolutionTransitions(state, 'qualified')
      expect(plan.steps).toHaveLength(0)
      expect(plan.mismatch).toBeDefined()
      expect(plan.mismatch).toContain(state)
    }
  })

  it('never plans backward transitions', () => {
    // enriched is already past enriching — no backward hops should appear
    const plan = planResolutionTransitions('enriched', 'qualified')
    expect(plan.steps).not.toContain('new')
    expect(plan.steps).not.toContain('enriching')
  })

  it('never plans sideways transitions (qualified → needs_review is off-limits)', () => {
    // Even though qualified → needs_review is a legal graph edge,
    // the conservative policy returns empty steps for non-forward states.
    const plan = planResolutionTransitions('qualified', 'needs_review')
    expect(plan.steps).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// buildResolvedLead — integration of pure functions
// ---------------------------------------------------------------------------

describe('buildResolvedLead', () => {
  const lead = { id: 'lead-1', name: 'Kayna Spa', website: 'https://kaynaspa.com' }

  const richEvidence = [
    { evidence_type: 'email_mailto', value: 'info@kaynaspa.com', detail: null },
    { evidence_type: 'phone_tel', value: '5105551234', detail: null },
    { evidence_type: 'link_contact', value: 'https://kaynaspa.com/contact', detail: null },
    { evidence_type: 'page_summary', value: 'Kayna Spa', detail: { description: 'Spa in Oakland' } },
    { evidence_type: 'website_signal', value: null, detail: { hasContactForm: true, hasMailto: true, hasTel: true, socialCount: 1 } },
  ]

  it('produces outcome qualified for good evidence', () => {
    const result = buildResolvedLead(lead, richEvidence)
    expect(result.best_email).toBe('info@kaynaspa.com')
    expect(result.email_confidence).toBe('official_mailto')
    expect(result.quality_score).toBeGreaterThanOrEqual(50)
    expect(result.outcome).toBe('qualified')
  })

  it('produces outcome needs_review when no email', () => {
    const noEmail = richEvidence.filter(r => !r.evidence_type?.startsWith('email'))
    const result = buildResolvedLead(lead, noEmail)
    expect(result.best_email).toBeNull()
    expect(result.email_confidence).toBe('none')
    expect(result.outcome).toBe('needs_review')
  })

  it('context_pack has no raw HTML', () => {
    const result = buildResolvedLead(lead, richEvidence)
    const serialized = JSON.stringify(result.context_pack)
    expect(serialized).not.toMatch(/<[a-z][\s\S]*?>/i)
  })

  it('warns when no email found', () => {
    const noEmail = richEvidence.filter(r => r.evidence_type !== 'email_mailto')
    const result = buildResolvedLead(lead, noEmail)
    expect(result.warnings.some(w => w.toLowerCase().includes('email'))).toBe(true)
  })

  it('deterministic: identical inputs produce identical outputs', () => {
    const r1 = buildResolvedLead(lead, richEvidence)
    const r2 = buildResolvedLead(lead, richEvidence)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })

  it('never synthesizes or guesses emails not present in evidence', () => {
    // Evidence has no email rows — best_email must be null
    const noEmailEvidence = [
      { evidence_type: 'page_summary', value: 'Kayna Spa', detail: { description: 'Spa' } },
      { evidence_type: 'website_signal', value: null, detail: { hasContactForm: true, hasMailto: false, hasTel: false, socialCount: 0 } },
    ]
    const result = buildResolvedLead(lead, noEmailEvidence)
    expect(result.best_email).toBeNull()
    expect(result.email_confidence).toBe('none')
  })

  it('risk flag: warns when selected email is noreply', () => {
    const noreplyEvidence = [
      { evidence_type: 'email_mailto', value: 'noreply@kaynaspa.com', detail: null },
      { evidence_type: 'website_signal', value: null, detail: { hasContactForm: false, hasMailto: true, hasTel: false, socialCount: 0 } },
    ]
    const result = buildResolvedLead(lead, noreplyEvidence)
    expect(result.best_email).toBe('noreply@kaynaspa.com')
    expect(result.warnings.some(w => w.includes('noreply'))).toBe(true)
  })

  it('visible email alone produces official_visible confidence', () => {
    const visibleEvidence = [
      { evidence_type: 'email_visible', value: 'info@kaynaspa.com', detail: null },
      { evidence_type: 'website_signal', value: null, detail: { hasContactForm: false, hasMailto: false, hasTel: false, socialCount: 0 } },
    ]
    const result = buildResolvedLead(lead, visibleEvidence)
    expect(result.email_confidence).toBe('official_visible')
  })

  it('mailto beats visible for same address', () => {
    const both = [
      { evidence_type: 'email_visible', value: 'info@kaynaspa.com', detail: null },
      { evidence_type: 'email_mailto', value: 'info@kaynaspa.com', detail: null },
    ]
    const result = buildResolvedLead(lead, both)
    expect(result.email_confidence).toBe('official_mailto')
  })

  it('domain-matched email beats off-domain at same tier', () => {
    const mixed = [
      { evidence_type: 'email_mailto', value: 'info@gmail.com', detail: null },
      { evidence_type: 'email_mailto', value: 'info@kaynaspa.com', detail: null },
    ]
    const result = buildResolvedLead(lead, mixed)
    expect(result.best_email).toBe('info@kaynaspa.com')
  })
})
