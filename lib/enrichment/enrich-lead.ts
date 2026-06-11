/**
 * enrich-lead.ts — server-side Tier-1 enrichment runner
 *
 * Fetches a lead's website, extracts compact evidence via cheerio-extractor,
 * and persists rows to `lead_evidence`. Never stores or returns raw HTML.
 * Never changes `stage` or `outreach_state`.
 */

import { getSupabaseServer } from '@/lib/supabase'
import { extractEvidence, buildLeadEvidenceRows } from '@/lib/enrichment/cheerio-extractor'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 9_000          // 9 seconds
const MAX_BODY_BYTES   = 1_500_000      // 1.5 MB cap before parsing
const USER_AGENT       = 'KaynaLeadFinder/1.0 (+contact enrichment)'

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface EnrichResult {
  leadId:       string
  website:      string | null
  finalUrl:     string | null
  status:       'ok' | 'skipped' | 'error'
  inserted:     number
  countsByType: Record<string, number>
  warnings:     string[]
}

// ---------------------------------------------------------------------------
// enrichLeadById
// ---------------------------------------------------------------------------

export async function enrichLeadById(leadId: string): Promise<EnrichResult> {
  const supabase = getSupabaseServer()
  const warnings: string[] = []

  // ------------------------------------------------------------------
  // 1. Load lead
  // ------------------------------------------------------------------
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, name, website')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) {
    return {
      leadId,
      website: null,
      finalUrl: null,
      status: 'error',
      inserted: 0,
      countsByType: {},
      warnings: ['Lead not found'],
    }
  }

  // ------------------------------------------------------------------
  // 2. Validate website URL
  // ------------------------------------------------------------------
  const rawWebsite = lead.website?.trim() ?? null
  if (!rawWebsite) {
    return {
      leadId,
      website: null,
      finalUrl: null,
      status: 'skipped',
      inserted: 0,
      countsByType: {},
      warnings: ['No website URL on lead'],
    }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawWebsite)
  } catch {
    return {
      leadId,
      website: rawWebsite,
      finalUrl: null,
      status: 'skipped',
      inserted: 0,
      countsByType: {},
      warnings: [`Website URL is not valid: ${rawWebsite}`],
    }
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      leadId,
      website: rawWebsite,
      finalUrl: null,
      status: 'skipped',
      inserted: 0,
      countsByType: {},
      warnings: [`Non-http(s) URL rejected: ${rawWebsite}`],
    }
  }

  // ------------------------------------------------------------------
  // 3. Fetch with timeout + user-agent
  // ------------------------------------------------------------------
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(rawWebsite, {
      signal:   controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
  } catch (err: unknown) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    return {
      leadId,
      website: rawWebsite,
      finalUrl: null,
      status: 'error',
      inserted: 0,
      countsByType: {},
      warnings: [`Fetch failed: ${msg}`],
    }
  } finally {
    clearTimeout(timer)
  }

  // ------------------------------------------------------------------
  // 4. Guard response: status + content-type + size cap
  // ------------------------------------------------------------------
  const finalUrl = response.url || rawWebsite

  if (!response.ok) {
    warnings.push(`HTTP ${response.status} from ${finalUrl}`)
    return {
      leadId,
      website: rawWebsite,
      finalUrl,
      status: 'error',
      inserted: 0,
      countsByType: {},
      warnings,
    }
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) {
    return {
      leadId,
      website: rawWebsite,
      finalUrl,
      status: 'skipped',
      inserted: 0,
      countsByType: {},
      warnings: [`Non-HTML content-type (${contentType}) — skipping`],
    }
  }

  // Read body with size cap — raw HTML stays in a local variable only
  let html: string
  try {
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const capped = bytes.length > MAX_BODY_BYTES ? bytes.slice(0, MAX_BODY_BYTES) : bytes
    html = new TextDecoder('utf-8', { fatal: false }).decode(capped)
    if (bytes.length > MAX_BODY_BYTES) {
      warnings.push(`Body capped at ${MAX_BODY_BYTES} bytes (was ${bytes.length})`)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      leadId,
      website: rawWebsite,
      finalUrl,
      status: 'error',
      inserted: 0,
      countsByType: {},
      warnings: [`Failed to read body: ${msg}`],
    }
  }

  // ------------------------------------------------------------------
  // 5. Extract evidence (raw HTML consumed here; never returned)
  // ------------------------------------------------------------------
  const extracted = extractEvidence(html, finalUrl)
  // html is no longer referenced after this point
  const rows = buildLeadEvidenceRows(leadId, extracted, {
    requestedUrl: rawWebsite,
    finalUrl,
    statusCode: response.status,
  })

  // ------------------------------------------------------------------
  // 6. Replace Tier-1 website evidence (idempotent re-run)
  //    ONLY deletes source='website' rows — never touches other sources.
  //    No outreach_state change. No stage change.
  // ------------------------------------------------------------------
  const { error: deleteErr } = await supabase
    .from('lead_evidence')
    .delete()
    .eq('lead_id', leadId)
    .eq('source', 'website')

  if (deleteErr) {
    warnings.push(`Failed to delete prior website evidence: ${deleteErr.message}`)
  }

  let inserted = 0
  if (rows.length > 0) {
    const { error: insertErr } = await supabase
      .from('lead_evidence')
      .insert(rows)

    if (insertErr) {
      return {
        leadId,
        website: rawWebsite,
        finalUrl,
        status: 'error',
        inserted: 0,
        countsByType: {},
        warnings: [...warnings, `Insert failed: ${insertErr.message}`],
      }
    }
    inserted = rows.length
  }

  // ------------------------------------------------------------------
  // 7. Build counts-by-type summary (never includes raw HTML)
  // ------------------------------------------------------------------
  const countsByType: Record<string, number> = {}
  for (const row of rows) {
    countsByType[row.evidence_type] = (countsByType[row.evidence_type] ?? 0) + 1
  }

  return {
    leadId,
    website:      rawWebsite,
    finalUrl,
    status:       'ok',
    inserted,
    countsByType,
    warnings,
  }
}
