import {
  sanitizeSettingsUpdate,
  validateSettingsUpdate,
  computeReadiness,
  EDITABLE_FIELDS,
} from '@/lib/settings-policy'
import type { Settings } from '@/types'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseSettings: Settings = {
  id: 1,
  auto_mode: false,
  sending_paused: true,
  physical_address: null,
  unsubscribe_configured: false,
  firecrawl_enabled: false,
  warmup_start_date: null,
  daily_cap: 5,
  business_hours_start: '09:30',
  business_hours_end: '16:30',
  allowed_cities: ['Pleasanton', 'Dublin'],
  allowed_categories: null,
  created_at: '2026-06-10T00:00:00Z',
  updated_at: '2026-06-10T00:00:00Z',
}

// ---------------------------------------------------------------------------
// sanitizeSettingsUpdate
// ---------------------------------------------------------------------------

test('sanitize strips unknown keys', () => {
  const out = sanitizeSettingsUpdate({ unknown_key: 'foo', another: 123 })
  expect(out).not.toHaveProperty('unknown_key')
  expect(out).not.toHaveProperty('another')
})

test('sanitize forces auto_mode to false even when true is passed', () => {
  const out = sanitizeSettingsUpdate({ auto_mode: true })
  expect(out['auto_mode']).toBe(false)
})

test('sanitize forces firecrawl_enabled to false even when true is passed', () => {
  const out = sanitizeSettingsUpdate({ firecrawl_enabled: true })
  expect(out['firecrawl_enabled']).toBe(false)
})

test('sanitize forces locked fields to false when mixed with editable fields', () => {
  const out = sanitizeSettingsUpdate({
    auto_mode: true,
    firecrawl_enabled: true,
    daily_cap: 10,
    sending_paused: false,
  })
  expect(out['auto_mode']).toBe(false)
  expect(out['firecrawl_enabled']).toBe(false)
  expect(out['daily_cap']).toBe(10)
  expect(out['sending_paused']).toBe(false)
})

test('sanitize keeps editable fields that are present', () => {
  const out = sanitizeSettingsUpdate({ physical_address: '123 Main St', daily_cap: 7 })
  expect(out['physical_address']).toBe('123 Main St')
  expect(out['daily_cap']).toBe(7)
})

test('sanitize omits editable fields that are absent', () => {
  const out = sanitizeSettingsUpdate({ daily_cap: 7 })
  expect(out).not.toHaveProperty('physical_address')
  expect(out).not.toHaveProperty('unsubscribe_configured')
})

test('sanitize covers all EDITABLE_FIELDS', () => {
  const payload = Object.fromEntries(EDITABLE_FIELDS.map(f => [f, null]))
  const out = sanitizeSettingsUpdate(payload)
  for (const field of EDITABLE_FIELDS) {
    expect(out).toHaveProperty(field)
  }
})

// ---------------------------------------------------------------------------
// validateSettingsUpdate — physical_address
// ---------------------------------------------------------------------------

test('validate physical_address null becomes null', () => {
  const r = validateSettingsUpdate({ physical_address: null })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.physical_address).toBeNull()
})

test('validate physical_address empty string becomes null', () => {
  const r = validateSettingsUpdate({ physical_address: '   ' })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.physical_address).toBeNull()
})

test('validate physical_address is trimmed', () => {
  const r = validateSettingsUpdate({ physical_address: '  123 Main St  ' })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.physical_address).toBe('123 Main St')
})

test('validate physical_address exceeding 500 chars is rejected', () => {
  const r = validateSettingsUpdate({ physical_address: 'x'.repeat(501) })
  expect(r.ok).toBe(false)
})

test('validate physical_address non-string is rejected', () => {
  const r = validateSettingsUpdate({ physical_address: 42 })
  expect(r.ok).toBe(false)
})

// ---------------------------------------------------------------------------
// validateSettingsUpdate — boolean fields
// ---------------------------------------------------------------------------

test('validate unsubscribe_configured true is accepted', () => {
  const r = validateSettingsUpdate({ unsubscribe_configured: true })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.unsubscribe_configured).toBe(true)
})

test('validate sending_paused false is accepted', () => {
  const r = validateSettingsUpdate({ sending_paused: false })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.sending_paused).toBe(false)
})

test('validate unsubscribe_configured non-boolean is rejected', () => {
  const r = validateSettingsUpdate({ unsubscribe_configured: 'yes' })
  expect(r.ok).toBe(false)
})

// ---------------------------------------------------------------------------
// validateSettingsUpdate — daily_cap
// ---------------------------------------------------------------------------

test('validate daily_cap 0 is accepted', () => {
  const r = validateSettingsUpdate({ daily_cap: 0 })
  expect(r.ok).toBe(true)
})

test('validate daily_cap 50 is accepted', () => {
  const r = validateSettingsUpdate({ daily_cap: 50 })
  expect(r.ok).toBe(true)
})

test('validate daily_cap negative is rejected', () => {
  const r = validateSettingsUpdate({ daily_cap: -1 })
  expect(r.ok).toBe(false)
})

test('validate daily_cap over 50 is rejected', () => {
  const r = validateSettingsUpdate({ daily_cap: 51 })
  expect(r.ok).toBe(false)
})

test('validate daily_cap non-integer is rejected', () => {
  const r = validateSettingsUpdate({ daily_cap: 3.5 })
  expect(r.ok).toBe(false)
})

test('validate daily_cap string is rejected', () => {
  const r = validateSettingsUpdate({ daily_cap: '5' })
  expect(r.ok).toBe(false)
})

// ---------------------------------------------------------------------------
// validateSettingsUpdate — business hours
// ---------------------------------------------------------------------------

test('validate business_hours_start valid HH:MM is accepted', () => {
  const r = validateSettingsUpdate({ business_hours_start: '09:30' })
  expect(r.ok).toBe(true)
})

test('validate business_hours_end valid HH:MM is accepted', () => {
  const r = validateSettingsUpdate({ business_hours_end: '17:00' })
  expect(r.ok).toBe(true)
})

test('validate business_hours_start bad format is rejected', () => {
  const r = validateSettingsUpdate({ business_hours_start: '9:30' })
  expect(r.ok).toBe(false)
})

test('validate business_hours_end bad format is rejected', () => {
  const r = validateSettingsUpdate({ business_hours_end: '25:00' })
  expect(r.ok).toBe(false)
})

test('validate business_hours start equal to end is rejected', () => {
  const r = validateSettingsUpdate({ business_hours_start: '09:00', business_hours_end: '09:00' })
  expect(r.ok).toBe(false)
})

test('validate business_hours start after end is rejected', () => {
  const r = validateSettingsUpdate({ business_hours_start: '17:00', business_hours_end: '09:00' })
  expect(r.ok).toBe(false)
})

test('validate business_hours start before end is accepted', () => {
  const r = validateSettingsUpdate({ business_hours_start: '08:00', business_hours_end: '17:00' })
  expect(r.ok).toBe(true)
})

// ---------------------------------------------------------------------------
// validateSettingsUpdate — allowed_cities
// ---------------------------------------------------------------------------

test('validate allowed_cities trims entries', () => {
  const r = validateSettingsUpdate({ allowed_cities: ['  Pleasanton  ', 'Dublin'] })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.allowed_cities).toEqual(['Pleasanton', 'Dublin'])
})

test('validate allowed_cities drops empty strings', () => {
  const r = validateSettingsUpdate({ allowed_cities: ['Pleasanton', '', '  '] })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.allowed_cities).toEqual(['Pleasanton'])
})

test('validate allowed_cities deduplicates', () => {
  const r = validateSettingsUpdate({ allowed_cities: ['Dublin', 'Dublin', 'Pleasanton'] })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.allowed_cities).toEqual(['Dublin', 'Pleasanton'])
})

test('validate allowed_cities null becomes empty array', () => {
  const r = validateSettingsUpdate({ allowed_cities: null })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.allowed_cities).toEqual([])
})

test('validate allowed_cities non-array is rejected', () => {
  const r = validateSettingsUpdate({ allowed_cities: 'Pleasanton' })
  expect(r.ok).toBe(false)
})

// ---------------------------------------------------------------------------
// validateSettingsUpdate — allowed_categories
// ---------------------------------------------------------------------------

test('validate allowed_categories null becomes null', () => {
  const r = validateSettingsUpdate({ allowed_categories: null })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.allowed_categories).toBeNull()
})

test('validate allowed_categories empty array becomes null', () => {
  const r = validateSettingsUpdate({ allowed_categories: [] })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.allowed_categories).toBeNull()
})

test('validate allowed_categories deduplicates and trims', () => {
  const r = validateSettingsUpdate({ allowed_categories: ['  salon  ', 'salon', 'gym'] })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data.allowed_categories).toEqual(['salon', 'gym'])
})

// ---------------------------------------------------------------------------
// validateSettingsUpdate — locked fields not in output
// ---------------------------------------------------------------------------

test('validate auto_mode key in input is not in output data', () => {
  const r = validateSettingsUpdate({ auto_mode: false, daily_cap: 5 })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data).not.toHaveProperty('auto_mode')
})

test('validate firecrawl_enabled key in input is not in output data', () => {
  const r = validateSettingsUpdate({ firecrawl_enabled: false, daily_cap: 5 })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.data).not.toHaveProperty('firecrawl_enabled')
})

// ---------------------------------------------------------------------------
// computeReadiness
// ---------------------------------------------------------------------------

test('computeReadiness CAN-SPAM not ready when address null', () => {
  const r = computeReadiness({ ...baseSettings, physical_address: null, unsubscribe_configured: true })
  expect(r.canSpamReady).toBe(false)
  expect(r.physicalAddressConfigured).toBe(false)
})

test('computeReadiness CAN-SPAM not ready when unsubscribe false', () => {
  const r = computeReadiness({ ...baseSettings, physical_address: '123 Main St', unsubscribe_configured: false })
  expect(r.canSpamReady).toBe(false)
  expect(r.unsubscribeConfigured).toBe(false)
})

test('computeReadiness CAN-SPAM ready when address set and unsubscribe true', () => {
  const r = computeReadiness({ ...baseSettings, physical_address: '123 Main St', unsubscribe_configured: true })
  expect(r.canSpamReady).toBe(true)
  expect(r.physicalAddressConfigured).toBe(true)
  expect(r.unsubscribeConfigured).toBe(true)
})

test('computeReadiness sendingPaused mirrors setting', () => {
  expect(computeReadiness({ ...baseSettings, sending_paused: true }).sendingPaused).toBe(true)
  expect(computeReadiness({ ...baseSettings, sending_paused: false }).sendingPaused).toBe(false)
})

test('computeReadiness autoModeLocked is always true', () => {
  expect(computeReadiness(baseSettings).autoModeLocked).toBe(true)
})

test('computeReadiness firecrawlDisabled is always true', () => {
  expect(computeReadiness(baseSettings).firecrawlDisabled).toBe(true)
})

test('computeReadiness physicalAddressConfigured false for whitespace-only address', () => {
  const r = computeReadiness({ ...baseSettings, physical_address: '   ' })
  expect(r.physicalAddressConfigured).toBe(false)
})
