'use client'
import { useState } from 'react'
import type { Settings } from '@/types'
import { computeReadiness } from '@/lib/settings-policy'
import StatusCard from './StatusCard'

interface Props {
  initialSettings: Settings
}

interface FormState {
  physical_address: string
  unsubscribe_configured: boolean
  sending_paused: boolean
  daily_cap: number
  business_hours_start: string
  business_hours_end: string
  allowed_cities: string    // comma-separated for editing
  allowed_categories: string // comma-separated for editing
}

function arrayToString(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return ''
  return arr.join(', ')
}

function stringToArray(s: string): string[] {
  return [...new Set(s.split(',').map(x => x.trim()).filter(x => x.length > 0))]
}

function settingsToForm(s: Settings): FormState {
  return {
    physical_address:      s.physical_address ?? '',
    unsubscribe_configured: s.unsubscribe_configured,
    sending_paused:        s.sending_paused,
    daily_cap:             s.daily_cap,
    business_hours_start:  s.business_hours_start,
    business_hours_end:    s.business_hours_end,
    allowed_cities:        arrayToString(s.allowed_cities),
    allowed_categories:    arrayToString(s.allowed_categories ?? []),
  }
}

export default function SettingsForm({ initialSettings }: Props) {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [form, setForm]         = useState<FormState>(() => settingsToForm(initialSettings))
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError]   = useState<string | null>(null)

  const readiness = computeReadiness(settings)

  const handleSave = async () => {
    setSaveStatus('saving')
    setSaveError(null)

    const payload = {
      physical_address:       form.physical_address.trim() || null,
      unsubscribe_configured: form.unsubscribe_configured,
      sending_paused:         form.sending_paused,
      daily_cap:              form.daily_cap,
      business_hours_start:   form.business_hours_start,
      business_hours_end:     form.business_hours_end,
      allowed_cities:         stringToArray(form.allowed_cities),
      allowed_categories:     form.allowed_categories.trim()
                                ? stringToArray(form.allowed_categories)
                                : null,
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setSaveStatus('error')
        setSaveError(json.error ?? 'Save failed')
      } else {
        setSettings(json.settings)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch {
      setSaveStatus('error')
      setSaveError('Network error — check your connection')
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Status cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 40 }}>
        <StatusCard
          label="CAN-SPAM"
          status={readiness.canSpamReady ? 'ok' : 'warn'}
          detail={readiness.canSpamReady ? 'Ready' : 'Not ready'}
        />
        <StatusCard
          label="Physical Address"
          status={readiness.physicalAddressConfigured ? 'ok' : 'warn'}
          detail={readiness.physicalAddressConfigured ? 'Configured' : 'Not configured'}
        />
        <StatusCard
          label="Unsubscribe"
          status={readiness.unsubscribeConfigured ? 'ok' : 'warn'}
          detail={readiness.unsubscribeConfigured ? 'Configured' : 'Not configured'}
        />
        <StatusCard
          label="Sending"
          status={readiness.sendingPaused ? 'warn' : 'ok'}
          detail={readiness.sendingPaused ? 'Paused' : 'Active'}
        />
        <StatusCard label="Auto-mode"  status="locked"   detail="Locked" />
        <StatusCard label="Firecrawl"  status="disabled" detail="Disabled" />
      </div>

      {/* Safety & Compliance */}
      <Section title="Safety & Compliance">
        <Field label="Physical address (CAN-SPAM footer)">
          <input
            type="text"
            value={form.physical_address}
            onChange={e => setForm(f => ({ ...f, physical_address: e.target.value }))}
            placeholder="e.g. 123 Main St, Pleasanton, CA 94566"
            style={inputStyle}
          />
        </Field>
        <Field label="Unsubscribe configured">
          <Toggle
            value={form.unsubscribe_configured}
            onChange={v => setForm(f => ({ ...f, unsubscribe_configured: v }))}
          />
        </Field>
        <Field label="Sending paused">
          <Toggle
            value={form.sending_paused}
            onChange={v => setForm(f => ({ ...f, sending_paused: v }))}
          />
        </Field>
      </Section>

      {/* Sending Controls */}
      <Section title="Sending Controls">
        <Field label="Daily cap (emails/day, 0–50)">
          <input
            type="number"
            value={form.daily_cap}
            onChange={e => {
              const n = parseInt(e.target.value, 10)
              setForm(f => ({ ...f, daily_cap: isNaN(n) ? 0 : Math.max(0, Math.min(50, n)) }))
            }}
            min={0}
            max={50}
            style={{ ...inputStyle, width: 90 }}
          />
        </Field>
        <Field label="Business hours start (HH:MM)">
          <input
            type="text"
            value={form.business_hours_start}
            onChange={e => setForm(f => ({ ...f, business_hours_start: e.target.value }))}
            placeholder="09:30"
            style={{ ...inputStyle, width: 110 }}
          />
        </Field>
        <Field label="Business hours end (HH:MM)">
          <input
            type="text"
            value={form.business_hours_end}
            onChange={e => setForm(f => ({ ...f, business_hours_end: e.target.value }))}
            placeholder="16:30"
            style={{ ...inputStyle, width: 110 }}
          />
        </Field>
      </Section>

      {/* Targeting */}
      <Section title="Targeting">
        <Field label="Allowed cities (comma-separated)">
          <input
            type="text"
            value={form.allowed_cities}
            onChange={e => setForm(f => ({ ...f, allowed_cities: e.target.value }))}
            placeholder="Pleasanton, Dublin, Livermore, San Ramon"
            style={inputStyle}
          />
        </Field>
        <Field label="Allowed categories (optional, comma-separated)">
          <input
            type="text"
            value={form.allowed_categories}
            onChange={e => setForm(f => ({ ...f, allowed_categories: e.target.value }))}
            placeholder="restaurant, salon, gym"
            style={inputStyle}
          />
        </Field>
      </Section>

      {/* Advanced — Locked */}
      <Section title="Advanced (Locked)">
        <Field label="Auto-mode">
          <LockedToggle badge="Locked — Phase 15" />
        </Field>
        <Field label="Firecrawl">
          <LockedToggle badge="Disabled" />
        </Field>
      </Section>

      {/* Save row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 32 }}>
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="kayna-btn"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            padding: '8px 20px',
            background: saveStatus === 'saving' ? 'var(--color-dim)' : 'var(--color-accent)',
            color: '#080808',
            border: 'none',
            borderRadius: 6,
            cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
          }}
        >
          {saveStatus === 'saving' ? 'Saving…' : 'Save Settings'}
        </button>

        {saveStatus === 'saved' && (
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#4ade80' }}>
            Saved
          </span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#f87171' }}>
            {saveError}
          </span>
        )}
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  color: 'var(--color-body)',
  padding: '6px 10px',
  outline: 'none',
  width: '100%',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.18em',
        color: 'var(--color-dim)',
        margin: '0 0 12px 0',
      }}>
        {title}
      </p>
      <div style={{
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: '1px solid var(--color-border)',
      gap: 16,
    }}>
      <label style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 13,
        color: 'var(--color-body)',
        width: 240,
        flexShrink: 0,
      }}>
        {label}
      </label>
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="kayna-btn"
      aria-pressed={value}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        background: value ? 'var(--color-accent)' : 'var(--color-border)',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: value ? 23 : 3,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: value ? '#080808' : 'var(--color-dim)',
        transition: 'left 0.15s',
      }} />
    </button>
  )
}

function LockedToggle({ badge }: { badge: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        type="button"
        disabled
        aria-disabled
        aria-pressed={false}
        style={{
          position: 'relative',
          width: 44,
          height: 24,
          borderRadius: 12,
          border: 'none',
          background: 'var(--color-border)',
          cursor: 'not-allowed',
          padding: 0,
          flexShrink: 0,
          opacity: 0.45,
        }}
      >
        <span style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'var(--color-dim)',
        }} />
      </button>
      <span style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.14em',
        color: 'var(--color-dim)',
      }}>
        {badge}
      </span>
    </div>
  )
}
