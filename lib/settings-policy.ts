import type { Settings } from '@/types'

export const EDITABLE_FIELDS = [
  'physical_address',
  'unsubscribe_configured',
  'sending_paused',
  'daily_cap',
  'business_hours_start',
  'business_hours_end',
  'allowed_cities',
  'allowed_categories',
] as const

export type EditableField = typeof EDITABLE_FIELDS[number]

export type SettingsUpdate = Partial<Pick<Settings, EditableField>>

export type ValidationResult =
  | { ok: true; data: SettingsUpdate }
  | { ok: false; error: string }

export type Readiness = {
  canSpamReady: boolean
  physicalAddressConfigured: boolean
  unsubscribeConfigured: boolean
  sendingPaused: boolean
  autoModeLocked: true
  firecrawlDisabled: true
}

/**
 * Strips all keys not in EDITABLE_FIELDS.
 * Forces auto_mode=false and firecrawl_enabled=false regardless of client input.
 * The returned object includes only editable keys (present in raw) + the two forced locks.
 */
export function sanitizeSettingsUpdate(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) {
      out[field] = raw[field]
    }
  }
  out['auto_mode'] = false
  out['firecrawl_enabled'] = false
  return out
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Validates editable fields. auto_mode/firecrawl_enabled in input are ignored (not in output). */
export function validateSettingsUpdate(data: Record<string, unknown>): ValidationResult {
  const out: SettingsUpdate = {}

  if (Object.prototype.hasOwnProperty.call(data, 'physical_address')) {
    const v = data['physical_address']
    if (v === null || v === undefined) {
      out.physical_address = null
    } else if (typeof v !== 'string') {
      return { ok: false, error: 'physical_address must be a string or null' }
    } else {
      const trimmed = v.trim()
      if (trimmed.length > 500) return { ok: false, error: 'physical_address exceeds 500 characters' }
      out.physical_address = trimmed === '' ? null : trimmed
    }
  }

  for (const field of ['unsubscribe_configured', 'sending_paused'] as const) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      if (typeof data[field] !== 'boolean') return { ok: false, error: `${field} must be a boolean` }
      out[field] = data[field] as boolean
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, 'daily_cap')) {
    const v = data['daily_cap']
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      return { ok: false, error: 'daily_cap must be an integer' }
    }
    if (v < 0 || v > 50) return { ok: false, error: 'daily_cap must be between 0 and 50' }
    out.daily_cap = v
  }

  for (const field of ['business_hours_start', 'business_hours_end'] as const) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      const v = data[field]
      if (typeof v !== 'string' || !HH_MM.test(v)) {
        return { ok: false, error: `${field} must be in HH:MM format` }
      }
      out[field] = v
    }
  }

  if (out.business_hours_start !== undefined && out.business_hours_end !== undefined) {
    if (out.business_hours_start >= out.business_hours_end) {
      return { ok: false, error: 'business_hours_start must be before business_hours_end' }
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, 'allowed_cities')) {
    const v = data['allowed_cities']
    if (v === null || v === undefined) {
      out.allowed_cities = []
    } else if (!Array.isArray(v)) {
      return { ok: false, error: 'allowed_cities must be an array' }
    } else {
      out.allowed_cities = [
        ...new Set(
          (v as unknown[])
            .filter((s): s is string => typeof s === 'string')
            .map(s => s.trim())
            .filter(s => s.length > 0)
        ),
      ]
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, 'allowed_categories')) {
    const v = data['allowed_categories']
    if (v === null || v === undefined) {
      out.allowed_categories = null
    } else if (!Array.isArray(v)) {
      return { ok: false, error: 'allowed_categories must be an array or null' }
    } else {
      const cleaned = [
        ...new Set(
          (v as unknown[])
            .filter((s): s is string => typeof s === 'string')
            .map(s => s.trim())
            .filter(s => s.length > 0)
        ),
      ]
      out.allowed_categories = cleaned.length === 0 ? null : cleaned
    }
  }

  return { ok: true, data: out }
}

export function computeReadiness(settings: Settings): Readiness {
  const physicalAddressConfigured =
    typeof settings.physical_address === 'string' && settings.physical_address.trim().length > 0
  return {
    canSpamReady: physicalAddressConfigured && settings.unsubscribe_configured,
    physicalAddressConfigured,
    unsubscribeConfigured: settings.unsubscribe_configured,
    sendingPaused: settings.sending_paused,
    autoModeLocked: true,
    firecrawlDisabled: true,
  }
}
