/**
 * cheerio-extractor.ts — pure Tier-1 enrichment extraction
 *
 * All functions are pure (no network, no DB, no side-effects).
 * Raw HTML is accepted as a parameter but NEVER returned or stored.
 * Callers receive only compact structured evidence.
 */

import * as cheerio from 'cheerio'

// ---------------------------------------------------------------------------
// Caps / constants
// ---------------------------------------------------------------------------

const MAX_EMAILS = 10
const MAX_PHONES = 10
const MAX_LINKS  = 25
const MAX_STR    = 300 // max chars for title / description

const SOCIAL_HOSTS: Record<string, string> = {
  'facebook.com':  'facebook',
  'instagram.com': 'instagram',
  'linkedin.com':  'linkedin',
  'twitter.com':   'twitter',
  'x.com':         'twitter',
  'youtube.com':   'youtube',
  'tiktok.com':    'tiktok',
  'yelp.com':      'yelp',
}

// keywords that classify a link href/path as contact / about / booking
const CONTACT_KEYWORDS  = ['contact', 'contact-us', 'contactus', 'reach']
const ABOUT_KEYWORDS    = ['about', 'about-us', 'aboutus', 'our-story', 'team']
const BOOKING_KEYWORDS  = ['book', 'booking', 'appointment', 'schedule', 'reserve']

// Hostnames whose presence alone signals a booking link
const BOOKING_HOSTS = ['calendly.com', 'acuityscheduling.com', 'square.site', 'squareup.com']

// Very permissive email regex — Phase 5 resolver validates properly
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g

// Digits/separators that look like a North-American or international phone
const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?:\s?(?:ext|x)\.?\s?\d{1,6})?/g

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExtractedEmails {
  mailto:  string[]
  visible: string[]
}

export interface ExtractedPhones {
  tel:     string[]
  visible: string[]
}

export type LinkKind = 'contact' | 'about' | 'booking' | 'social'

export interface ExtractedLink {
  url:       string
  kind:      LinkKind
  platform?: string  // social only
  text?:     string
}

export interface PageSummary {
  title:       string | null
  description: string | null
}

export interface WebsiteSignals {
  hasContactForm: boolean
  hasMailto:      boolean
  hasTel:         boolean
  socialCount:    number
}

export interface ExtractedEvidence {
  emails:   ExtractedEmails
  phones:   ExtractedPhones
  links:    ExtractedLink[]
  summary:  PageSummary
  signals:  WebsiteSignals
  fetchedUrl: string
}

export interface EvidenceRow {
  lead_id:       string
  source:        'website'     // ALWAYS 'website' — never raw HTML, never other tiers
  evidence_type: string
  value:         string | null
  confidence:    null          // Phase 5 resolver assigns confidence
  blob_ref:      null          // NEVER raw HTML
  detail:        Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// normalizeUrl
// ---------------------------------------------------------------------------

/**
 * Resolve `href` against `base` and return the absolute URL, or null if:
 * - non-http(s) scheme (javascript:, data:, ftp:, …)
 * - bare anchor (#)
 * - mailto: or tel: (extracted separately)
 * - malformed / unparseable
 */
export function normalizeUrl(href: string | undefined | null, base: string): string | null {
  if (!href) return null
  const trimmed = href.trim()
  if (!trimmed || trimmed === '#' || trimmed.startsWith('#')) return null
  if (/^(mailto:|tel:|javascript:|data:|ftp:)/i.test(trimmed)) return null
  try {
    const url = new URL(trimmed, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// extractEmails
// ---------------------------------------------------------------------------

function cleanEmail(raw: string): string {
  return raw.toLowerCase().trim()
}

export function extractEmails($: cheerio.CheerioAPI): ExtractedEmails {
  const mailtoSet = new Set<string>()
  const visibleSet = new Set<string>()

  // mailto: hrefs
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    if (/^mailto:/i.test(href)) {
      const addr = href.slice(7).split('?')[0].trim()
      const matches = addr.match(EMAIL_RE)
      if (matches) matches.forEach(m => mailtoSet.add(cleanEmail(m)))
    }
  })

  // visible text email-like patterns (skip elements already captured as mailto)
  const bodyText = $('body').text()
  const matches = bodyText.match(EMAIL_RE)
  if (matches) {
    for (const m of matches) {
      const email = cleanEmail(m)
      if (!mailtoSet.has(email)) visibleSet.add(email)
    }
  }

  return {
    mailto:  [...mailtoSet].slice(0, MAX_EMAILS),
    visible: [...visibleSet].slice(0, MAX_EMAILS),
  }
}

// ---------------------------------------------------------------------------
// extractPhones
// ---------------------------------------------------------------------------

function normalizePhone(raw: string): string {
  // Strip everything except digits, +, and extension markers
  return raw.trim().replace(/[^\d+x]/g, '')
}

export function extractPhones($: cheerio.CheerioAPI): ExtractedPhones {
  const telSet     = new Set<string>()
  const visibleSet = new Set<string>()

  // tel: hrefs
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    if (/^tel:/i.test(href)) {
      const digits = normalizePhone(href.slice(4))
      if (digits.length >= 7) telSet.add(digits)
    }
  })

  // visible phone-like patterns
  const bodyText = $('body').text()
  const matches = bodyText.match(PHONE_RE)
  if (matches) {
    for (const m of matches) {
      const normalized = normalizePhone(m)
      if (normalized.length >= 7 && !telSet.has(normalized)) {
        visibleSet.add(normalized)
      }
    }
  }

  return {
    tel:     [...telSet].slice(0, MAX_PHONES),
    visible: [...visibleSet].slice(0, MAX_PHONES),
  }
}

// ---------------------------------------------------------------------------
// extractLinks
// ---------------------------------------------------------------------------

function getSocialPlatform(hostname: string): string | undefined {
  for (const [host, platform] of Object.entries(SOCIAL_HOSTS)) {
    if (hostname === host || hostname.endsWith('.' + host)) return platform
  }
  return undefined
}

function classifyLink(url: URL): LinkKind | null {
  const platform = getSocialPlatform(url.hostname)
  if (platform) return 'social'

  // Booking service hostnames take priority over path keywords
  for (const host of BOOKING_HOSTS) {
    if (url.hostname === host || url.hostname.endsWith('.' + host)) return 'booking'
  }

  const path = url.pathname.toLowerCase()
  const segments = path.split('/').filter(Boolean)
  const pathStr = segments.join('/')

  for (const kw of BOOKING_KEYWORDS) {
    if (pathStr.includes(kw)) return 'booking'
  }
  for (const kw of CONTACT_KEYWORDS) {
    if (pathStr.includes(kw)) return 'contact'
  }
  for (const kw of ABOUT_KEYWORDS) {
    if (pathStr.includes(kw)) return 'about'
  }
  return null
}

export function extractLinks($: cheerio.CheerioAPI, base: string): ExtractedLink[] {
  const seen = new Set<string>()
  const results: ExtractedLink[] = []

  $('a[href]').each((_, el) => {
    if (results.length >= MAX_LINKS) return false // stop iterating

    const normalized = normalizeUrl($(el).attr('href'), base)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)

    let url: URL
    try { url = new URL(normalized) } catch { return }

    const kind = classifyLink(url)
    if (!kind) return

    const platform = kind === 'social' ? getSocialPlatform(url.hostname) : undefined
    const rawText  = $(el).text().trim().slice(0, 80) || undefined

    results.push({ url: normalized, kind, ...(platform ? { platform } : {}), ...(rawText ? { text: rawText } : {}) })
  })

  return results
}

// ---------------------------------------------------------------------------
// extractPageSummary
// ---------------------------------------------------------------------------

function cap(s: string | undefined | null): string | null {
  if (!s) return null
  const t = s.trim()
  return t.length > MAX_STR ? t.slice(0, MAX_STR) : t || null
}

export function extractPageSummary($: cheerio.CheerioAPI): PageSummary {
  const title = cap($('title').first().text())
  const description =
    cap($('meta[name="description"]').attr('content')) ??
    cap($('meta[property="og:description"]').attr('content'))
  return { title, description }
}

// ---------------------------------------------------------------------------
// extractWebsiteSignals
// ---------------------------------------------------------------------------

export function extractWebsiteSignals($: cheerio.CheerioAPI): WebsiteSignals {
  const hasContactForm = $('form').length > 0
  const hasMailto      = $('a[href^="mailto:"]').length > 0
  const hasTel         = $('a[href^="tel:"]').length > 0
  const socialCount    = Object.keys(SOCIAL_HOSTS).reduce((n, host) => {
    return n + $(`a[href*="${host}"]`).length
  }, 0)

  return { hasContactForm, hasMailto, hasTel, socialCount }
}

// ---------------------------------------------------------------------------
// extractEvidence — orchestrator
// ---------------------------------------------------------------------------

/**
 * Parse `html` (already read, capped by the caller) and return compact evidence.
 * Raw HTML is consumed here and never returned to callers.
 */
export function extractEvidence(html: string, fetchedUrl: string): ExtractedEvidence {
  const $ = cheerio.load(html)
  return {
    emails:     extractEmails($),
    phones:     extractPhones($),
    links:      extractLinks($, fetchedUrl),
    summary:    extractPageSummary($),
    signals:    extractWebsiteSignals($),
    fetchedUrl,
  }
}

// ---------------------------------------------------------------------------
// buildLeadEvidenceRows
// ---------------------------------------------------------------------------

export interface FetchMeta {
  requestedUrl: string
  finalUrl:     string
  statusCode:   number
}

/**
 * Map extracted evidence to `lead_evidence` insert rows.
 *
 * Invariants (enforced here, tested in unit tests):
 * - source   = 'website'  ALWAYS
 * - blob_ref = null       ALWAYS (never raw HTML)
 * - confidence = null     ALWAYS (Phase 5 resolver assigns)
 * - detail is compact jsonb only — no HTML, no large arrays
 */
export function buildLeadEvidenceRows(
  leadId: string,
  evidence: ExtractedEvidence,
  fetchMeta: FetchMeta,
): EvidenceRow[] {
  const rows: EvidenceRow[] = []

  const base: Pick<EvidenceRow, 'lead_id' | 'source' | 'confidence' | 'blob_ref'> = {
    lead_id:    leadId,
    source:     'website',
    confidence: null,
    blob_ref:   null,
  }

  // emails — mailto
  for (const email of evidence.emails.mailto) {
    rows.push({ ...base, evidence_type: 'email_mailto', value: email, detail: null })
  }

  // emails — visible
  for (const email of evidence.emails.visible) {
    rows.push({ ...base, evidence_type: 'email_visible', value: email, detail: null })
  }

  // phones — tel:
  for (const phone of evidence.phones.tel) {
    rows.push({ ...base, evidence_type: 'phone_tel', value: phone, detail: null })
  }

  // phones — visible
  for (const phone of evidence.phones.visible) {
    rows.push({ ...base, evidence_type: 'phone_visible', value: phone, detail: null })
  }

  // links
  for (const link of evidence.links) {
    const linkType: string = `link_${link.kind}`
    const detail: Record<string, unknown> = {}
    if (link.platform) detail.platform = link.platform
    if (link.text)     detail.text     = link.text
    rows.push({
      ...base,
      evidence_type: linkType,
      value: link.url,
      detail: Object.keys(detail).length > 0 ? detail : null,
    })
  }

  // page summary (one row; title = value, description in detail)
  if (evidence.summary.title || evidence.summary.description) {
    rows.push({
      ...base,
      evidence_type: 'page_summary',
      value: evidence.summary.title,
      detail: {
        description: evidence.summary.description,
        fetched_url: fetchMeta.finalUrl,
      },
    })
  }

  // website signals (one row)
  rows.push({
    ...base,
    evidence_type: 'website_signal',
    value: null,
    detail: {
      hasContactForm: evidence.signals.hasContactForm,
      hasMailto:      evidence.signals.hasMailto,
      hasTel:         evidence.signals.hasTel,
      socialCount:    evidence.signals.socialCount,
      requested_url:  fetchMeta.requestedUrl,
      final_url:      fetchMeta.finalUrl,
      status_code:    fetchMeta.statusCode,
    },
  })

  return rows
}
