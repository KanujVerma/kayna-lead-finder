/**
 * cheerio-extractor unit tests
 *
 * Pure — no network, no Supabase, no filesystem. All functions accept/return
 * plain values. Tests verify extraction correctness AND safety invariants.
 */

import {
  normalizeUrl,
  extractEmails,
  extractPhones,
  extractLinks,
  extractPageSummary,
  extractWebsiteSignals,
  extractEvidence,
  buildLeadEvidenceRows,
} from '@/lib/enrichment/cheerio-extractor'
import * as cheerio from 'cheerio'

const BASE = 'https://example.com'

// Helper: load HTML and pass $ to extractor
function load(html: string) {
  return cheerio.load(html)
}

// ============================================================
// normalizeUrl
// ============================================================
describe('normalizeUrl', () => {
  it('resolves relative URLs against base', () => {
    expect(normalizeUrl('/contact', BASE)).toBe('https://example.com/contact')
  })
  it('preserves absolute http URLs', () => {
    expect(normalizeUrl('http://other.com/page', BASE)).toBe('http://other.com/page')
  })
  it('preserves absolute https URLs', () => {
    expect(normalizeUrl('https://other.com/page', BASE)).toBe('https://other.com/page')
  })
  it('returns null for javascript: links', () => {
    expect(normalizeUrl('javascript:void(0)', BASE)).toBeNull()
  })
  it('returns null for data: URIs', () => {
    expect(normalizeUrl('data:text/html,<h1>hi</h1>', BASE)).toBeNull()
  })
  it('returns null for bare # anchors', () => {
    expect(normalizeUrl('#section', BASE)).toBeNull()
  })
  it('returns null for empty string', () => {
    expect(normalizeUrl('', BASE)).toBeNull()
  })
  it('returns null for null input', () => {
    expect(normalizeUrl(null, BASE)).toBeNull()
  })
  it('returns null for mailto: hrefs', () => {
    expect(normalizeUrl('mailto:info@example.com', BASE)).toBeNull()
  })
  it('returns null for tel: hrefs', () => {
    expect(normalizeUrl('tel:+15551234567', BASE)).toBeNull()
  })
  it('returns null for ftp: URLs', () => {
    expect(normalizeUrl('ftp://files.example.com', BASE)).toBeNull()
  })
  it('returns null for an http URL with no host (incomplete)', () => {
    // 'http://' with no host — new URL('http://') throws in Node
    expect(normalizeUrl('http://', BASE)).toBeNull()
  })

  it('resolves :::bad::: as a relative path (valid JS URL behavior)', () => {
    // new URL(':::bad:::', base) succeeds — it's treated as a relative path component
    const result = normalizeUrl(':::bad:::', BASE)
    // Result is non-null (resolved) — we confirm it starts with https
    expect(result).toMatch(/^https:/)
  })
})

// ============================================================
// extractEmails
// ============================================================
describe('extractEmails', () => {
  it('extracts mailto: emails', () => {
    const $ = load('<a href="mailto:hello@test.com">Email us</a>')
    const { mailto } = extractEmails($)
    expect(mailto).toContain('hello@test.com')
    expect(mailto.length).toBeGreaterThan(0)
  })

  it('extracts visible emails from body text', () => {
    const $ = load('<p>Call us or email info@bakery.com for orders</p>')
    const { visible } = extractEmails($)
    expect(visible).toContain('info@bakery.com')
  })

  it('deduplicates emails case-insensitively', () => {
    const $ = load('<a href="mailto:Info@test.com">E</a><a href="mailto:info@test.com">F</a>')
    const { mailto } = extractEmails($)
    expect(mailto.filter(e => e === 'info@test.com').length).toBe(1)
  })

  it('does not put mailto email into visible list', () => {
    const $ = load('<a href="mailto:contact@shop.com">contact@shop.com</a>')
    const result = extractEmails($)
    expect(result.mailto).toContain('contact@shop.com')
    expect(result.visible).not.toContain('contact@shop.com')
  })

  it('returns empty arrays for HTML with no emails', () => {
    const $ = load('<html><body><p>No contact info here.</p></body></html>')
    const result = extractEmails($)
    expect(result.mailto).toEqual([])
    expect(result.visible).toEqual([])
  })

  it('caps mailto emails at 10', () => {
    const anchors = Array.from({ length: 20 }, (_, i) => `<a href="mailto:a${i}@x.com">E</a>`).join('')
    const $ = load(`<body>${anchors}</body>`)
    expect(extractEmails($).mailto.length).toBeLessThanOrEqual(10)
  })

  it('caps visible emails at 10', () => {
    const texts = Array.from({ length: 20 }, (_, i) => `person${i}@example.com`).join(' ')
    const $ = load(`<body><p>${texts}</p></body>`)
    expect(extractEmails($).visible.length).toBeLessThanOrEqual(10)
  })

  it('normalizes email addresses to lowercase', () => {
    const $ = load('<a href="mailto:Sales@COMPANY.COM">e</a>')
    const { mailto } = extractEmails($)
    expect(mailto[0]).toBe('sales@company.com')
  })
})

// ============================================================
// extractPhones
// ============================================================
describe('extractPhones', () => {
  it('extracts tel: href phones', () => {
    const $ = load('<a href="tel:+14155551234">Call us</a>')
    const { tel } = extractPhones($)
    expect(tel.length).toBeGreaterThan(0)
    expect(tel[0]).toContain('14155551234')
  })

  it('extracts visible phone numbers from body text', () => {
    const $ = load('<p>Call us at (415) 555-1234 today</p>')
    const { visible } = extractPhones($)
    expect(visible.length).toBeGreaterThan(0)
  })

  it('does not duplicate a tel: phone in visible list', () => {
    const $ = load('<a href="tel:4155551234">415-555-1234</a>')
    const result = extractPhones($)
    // The tel: version may be normalized differently; but no exact duplicate
    const telNorm = result.tel[0]
    const visNorm = result.visible.find(v => v === telNorm)
    expect(visNorm).toBeUndefined()
  })

  it('returns empty arrays for HTML with no phones', () => {
    const $ = load('<html><body><p>No phone here.</p></body></html>')
    expect(extractPhones($).tel).toEqual([])
    expect(extractPhones($).visible).toEqual([])
  })

  it('caps tel phones at 10', () => {
    const anchors = Array.from({ length: 20 }, (_, i) => `<a href="tel:555000${String(i).padStart(4,'0')}">N</a>`).join('')
    const $ = load(`<body>${anchors}</body>`)
    expect(extractPhones($).tel.length).toBeLessThanOrEqual(10)
  })
})

// ============================================================
// extractLinks
// ============================================================
describe('extractLinks', () => {
  it('classifies contact links', () => {
    const $ = load('<a href="/contact-us">Contact Us</a>')
    const links = extractLinks($, BASE)
    expect(links.some(l => l.kind === 'contact')).toBe(true)
  })

  it('classifies about links', () => {
    const $ = load('<a href="/about">About</a>')
    const links = extractLinks($, BASE)
    expect(links.some(l => l.kind === 'about')).toBe(true)
  })

  it('classifies booking links', () => {
    const $ = load('<a href="/book-appointment">Book Now</a>')
    const links = extractLinks($, BASE)
    expect(links.some(l => l.kind === 'booking')).toBe(true)
  })

  it('classifies calendly links as booking', () => {
    const $ = load('<a href="https://calendly.com/user/meeting">Schedule</a>')
    const links = extractLinks($, BASE)
    expect(links.some(l => l.kind === 'booking')).toBe(true)
  })

  it('classifies Facebook links as social with platform=facebook', () => {
    const $ = load('<a href="https://www.facebook.com/mybiz">Facebook</a>')
    const links = extractLinks($, BASE)
    const fb = links.find(l => l.platform === 'facebook')
    expect(fb).toBeDefined()
    expect(fb?.kind).toBe('social')
  })

  it('classifies Instagram links as social', () => {
    const $ = load('<a href="https://instagram.com/mybiz">Insta</a>')
    const links = extractLinks($, BASE)
    expect(links.some(l => l.platform === 'instagram')).toBe(true)
  })

  it('classifies LinkedIn links as social', () => {
    const $ = load('<a href="https://linkedin.com/company/test">LinkedIn</a>')
    const links = extractLinks($, BASE)
    expect(links.some(l => l.platform === 'linkedin')).toBe(true)
  })

  it('ignores javascript: links', () => {
    const $ = load('<a href="javascript:void(0)">Click</a>')
    expect(extractLinks($, BASE)).toHaveLength(0)
  })

  it('ignores bare # anchors', () => {
    const $ = load('<a href="#">Top</a>')
    expect(extractLinks($, BASE)).toHaveLength(0)
  })

  it('ignores links that do not classify as contact/about/booking/social', () => {
    const $ = load('<a href="/products">Products</a><a href="/blog">Blog</a>')
    expect(extractLinks($, BASE)).toHaveLength(0)
  })

  it('deduplicates repeated links by URL', () => {
    const $ = load('<a href="/contact">C1</a><a href="/contact">C2</a>')
    const links = extractLinks($, BASE)
    expect(links.filter(l => l.url.includes('/contact')).length).toBe(1)
  })

  it('caps links at 25', () => {
    const anchors = Array.from({ length: 30 }, (_, i) => `<a href="https://instagram.com/user${i}">S</a>`).join('')
    const $ = load(`<body>${anchors}</body>`)
    expect(extractLinks($, BASE).length).toBeLessThanOrEqual(25)
  })
})

// ============================================================
// extractPageSummary
// ============================================================
describe('extractPageSummary', () => {
  it('extracts <title>', () => {
    const $ = load('<html><head><title>Best Bakery in Town</title></head><body/></html>')
    expect(extractPageSummary($).title).toBe('Best Bakery in Town')
  })

  it('extracts meta description', () => {
    const $ = load('<head><meta name="description" content="Freshly baked goods daily."></head>')
    expect(extractPageSummary($).description).toBe('Freshly baked goods daily.')
  })

  it('falls back to og:description', () => {
    const $ = load('<head><meta property="og:description" content="OG desc"></head>')
    expect(extractPageSummary($).description).toBe('OG desc')
  })

  it('returns null title/description for empty document', () => {
    const $ = load('<html><body></body></html>')
    const summary = extractPageSummary($)
    expect(summary.title).toBeNull()
    expect(summary.description).toBeNull()
  })

  it('caps title at 300 characters', () => {
    const long = 'A'.repeat(500)
    const $ = load(`<title>${long}</title>`)
    const title = extractPageSummary($).title
    expect(title).not.toBeNull()
    expect(title!.length).toBeLessThanOrEqual(300)
  })
})

// ============================================================
// extractWebsiteSignals
// ============================================================
describe('extractWebsiteSignals', () => {
  it('detects contact form presence', () => {
    const $ = load('<form><input type="text"/><button>Submit</button></form>')
    expect(extractWebsiteSignals($).hasContactForm).toBe(true)
  })

  it('detects mailto links', () => {
    const $ = load('<a href="mailto:hi@site.com">Email</a>')
    expect(extractWebsiteSignals($).hasMailto).toBe(true)
  })

  it('detects tel links', () => {
    const $ = load('<a href="tel:5555555555">Call</a>')
    expect(extractWebsiteSignals($).hasTel).toBe(true)
  })

  it('counts social links', () => {
    const $ = load('<a href="https://facebook.com/biz">FB</a><a href="https://instagram.com/biz">IG</a>')
    expect(extractWebsiteSignals($).socialCount).toBeGreaterThanOrEqual(2)
  })

  it('returns false/0 for empty document', () => {
    const $ = load('<html><body></body></html>')
    const s = extractWebsiteSignals($)
    expect(s.hasContactForm).toBe(false)
    expect(s.hasMailto).toBe(false)
    expect(s.hasTel).toBe(false)
    expect(s.socialCount).toBe(0)
  })
})

// ============================================================
// extractEvidence — orchestrator (smoke test; raw HTML not returned)
// ============================================================
describe('extractEvidence', () => {
  const html = `
    <html>
    <head>
      <title>Joe's Plumbing</title>
      <meta name="description" content="Local plumber.">
    </head>
    <body>
      <a href="mailto:joe@joesplumbing.com">Email Joe</a>
      <a href="tel:+14085551234">Call us</a>
      <a href="/contact">Contact</a>
      <a href="https://facebook.com/joesplumbing">Facebook</a>
      <form><input><button>Send</button></form>
    </body>
    </html>
  `

  it('returns structured evidence with all sections', () => {
    const ev = extractEvidence(html, BASE)
    expect(ev.emails.mailto).toContain('joe@joesplumbing.com')
    expect(ev.phones.tel.length).toBeGreaterThan(0)
    expect(ev.links.some(l => l.kind === 'contact')).toBe(true)
    expect(ev.links.some(l => l.kind === 'social')).toBe(true)
    expect(ev.summary.title).toBe("Joe's Plumbing")
    expect(ev.signals.hasContactForm).toBe(true)
    expect(ev.signals.hasMailto).toBe(true)
    expect(ev.signals.hasTel).toBe(true)
  })

  it('returns expected shape for minimal HTML', () => {
    const ev = extractEvidence('<html><body></body></html>', BASE)
    expect(ev.emails).toEqual({ mailto: [], visible: [] })
    expect(ev.phones).toEqual({ tel: [], visible: [] })
    expect(ev.links).toEqual([])
    expect(ev.summary.title).toBeNull()
  })

  it('fetchedUrl is stored as-is (not the raw HTML)', () => {
    const ev = extractEvidence(html, BASE)
    expect(ev.fetchedUrl).toBe(BASE)
  })
})

// ============================================================
// buildLeadEvidenceRows — invariants (safety critical)
// ============================================================
describe('buildLeadEvidenceRows', () => {
  const LEAD_ID = 'aaaabbbb-0000-0000-0000-000000000001'
  const FETCH_META = { requestedUrl: BASE, finalUrl: BASE, statusCode: 200 }

  const html = `
    <html>
    <head><title>Test Shop</title></head>
    <body>
      <a href="mailto:shop@test.com">Email</a>
      <a href="tel:+14085559876">Call</a>
      <a href="/about">About</a>
      <a href="https://instagram.com/testshop">IG</a>
    </body>
    </html>
  `

  let rows: ReturnType<typeof buildLeadEvidenceRows>

  beforeAll(() => {
    const ev = extractEvidence(html, BASE)
    rows = buildLeadEvidenceRows(LEAD_ID, ev, FETCH_META)
  })

  it('every row has source = "website"', () => {
    expect(rows.length).toBeGreaterThan(0)
    rows.forEach(r => expect(r.source).toBe('website'))
  })

  it('every row has blob_ref = null (no raw HTML)', () => {
    rows.forEach(r => expect(r.blob_ref).toBeNull())
  })

  it('every row has confidence = null (Phase 5 assigns)', () => {
    rows.forEach(r => expect(r.confidence).toBeNull())
  })

  it('every row has lead_id = supplied leadId', () => {
    rows.forEach(r => expect(r.lead_id).toBe(LEAD_ID))
  })

  it('no value contains raw HTML tags (<)', () => {
    rows.forEach(r => {
      if (r.value) expect(r.value).not.toMatch(/</)
    })
  })

  it('detail jsonb does not contain raw HTML (no < in any string value)', () => {
    rows.forEach(r => {
      if (r.detail) {
        const serialized = JSON.stringify(r.detail)
        expect(serialized).not.toMatch(/<!DOCTYPE|<html|<body|<head|<script/)
      }
    })
  })

  it('includes an email_mailto row for shop@test.com', () => {
    const emailRow = rows.find(r => r.evidence_type === 'email_mailto' && r.value === 'shop@test.com')
    expect(emailRow).toBeDefined()
  })

  it('includes a phone_tel row', () => {
    expect(rows.some(r => r.evidence_type === 'phone_tel')).toBe(true)
  })

  it('includes a link_about row', () => {
    expect(rows.some(r => r.evidence_type === 'link_about')).toBe(true)
  })

  it('includes a link_social row with platform=instagram', () => {
    const social = rows.find(r => r.evidence_type === 'link_social' && r.detail?.platform === 'instagram')
    expect(social).toBeDefined()
  })

  it('includes a page_summary row with title as value', () => {
    const summary = rows.find(r => r.evidence_type === 'page_summary')
    expect(summary).toBeDefined()
    expect(summary?.value).toBe('Test Shop')
  })

  it('includes a website_signal row with detail boolean fields', () => {
    const signal = rows.find(r => r.evidence_type === 'website_signal')
    expect(signal).toBeDefined()
    expect(typeof signal?.detail?.hasContactForm).toBe('boolean')
    expect(typeof signal?.detail?.hasMailto).toBe('boolean')
    expect(typeof signal?.detail?.hasTel).toBe('boolean')
    expect(typeof signal?.detail?.socialCount).toBe('number')
  })

  it('produces rows for empty HTML without throwing', () => {
    const emptyEv = extractEvidence('<html><body></body></html>', BASE)
    const emptyRows = buildLeadEvidenceRows(LEAD_ID, emptyEv, FETCH_META)
    // Should have at least a website_signal row even for empty pages
    expect(emptyRows.some(r => r.evidence_type === 'website_signal')).toBe(true)
    emptyRows.forEach(r => {
      expect(r.source).toBe('website')
      expect(r.blob_ref).toBeNull()
      expect(r.confidence).toBeNull()
    })
  })
})
