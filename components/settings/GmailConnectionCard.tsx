'use client'
import { useState } from 'react'
import type { GmailAccountStatus } from '@/lib/gmail/account'

interface Props {
  initialStatus: GmailAccountStatus
  /** Set from ?gmail= query param server-side to show a one-time banner. */
  banner?: 'connected' | 'error'
  bannerReason?: string
}

export default function GmailConnectionCard({ initialStatus, banner, bannerReason }: Props) {
  const [status, setStatus]           = useState<GmailAccountStatus>(initialStatus)
  const [disconnecting, setDisconnecting] = useState(false)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setDisconnectError(null)
    try {
      const res = await fetch('/api/gmail/disconnect', { method: 'POST' })
      if (res.ok) {
        setStatus({ connected: false, email: null, scopes: null, token_expiry: null, connected_at: null })
      } else {
        const json = await res.json() as { error?: string }
        setDisconnectError(json.error ?? 'Disconnect failed')
      }
    } catch {
      setDisconnectError('Network error — check your connection')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{
        fontFamily:    "'Inter', sans-serif",
        fontSize:      10,
        textTransform: 'uppercase',
        letterSpacing: '0.18em',
        color:         'var(--color-dim)',
        margin:        '0 0 12px 0',
      }}>
        Gmail Connection
      </p>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>

        {/* One-time banner from OAuth redirect */}
        {banner === 'connected' && (
          <div style={{
            padding:      '10px 16px',
            background:   'rgba(74,222,128,0.08)',
            borderBottom: '1px solid var(--color-border)',
            fontFamily:   "'Inter', sans-serif",
            fontSize:     13,
            color:        '#4ade80',
          }}>
            Gmail connected successfully.
          </div>
        )}
        {banner === 'error' && (
          <div style={{
            padding:      '10px 16px',
            background:   'rgba(248,113,113,0.08)',
            borderBottom: '1px solid var(--color-border)',
            fontFamily:   "'Inter', sans-serif",
            fontSize:     13,
            color:        '#f87171',
          }}>
            Gmail connection failed.{bannerReason ? ` (${bannerReason})` : ''}
          </div>
        )}

        {/* Status row */}
        <Row label="Status">
          <span style={{
            display:      'inline-block',
            width:        8,
            height:       8,
            borderRadius: '50%',
            background:   status.connected ? '#4ade80' : '#f87171',
            marginRight:  8,
            flexShrink:   0,
          }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-body)' }}>
            {status.connected ? 'Connected' : 'Disconnected'}
          </span>
        </Row>

        {/* Account row */}
        {status.email && (
          <Row label="Account">
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-body)' }}>
              {status.email}
            </span>
          </Row>
        )}

        {/* Scopes row */}
        {status.scopes && (
          <Row label="Scopes">
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-dim)' }}>
              {status.scopes}
            </span>
          </Row>
        )}

        {/* Token expiry row */}
        {status.token_expiry && (
          <Row label="Access token expiry">
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-dim)' }}>
              {new Date(status.token_expiry).toLocaleString()}
            </span>
          </Row>
        )}

        {/* Actions row */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12 }}>
          <div style={{ width: 240, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            {!status.connected && (
              <a
                href="/api/gmail/oauth/start"
                className="kayna-btn"
                style={{
                  fontFamily:     "'Inter', sans-serif",
                  fontSize:       13,
                  fontWeight:     500,
                  padding:        '7px 16px',
                  background:     'var(--color-accent)',
                  color:          '#080808',
                  border:         'none',
                  borderRadius:   6,
                  textDecoration: 'none',
                  display:        'inline-block',
                  cursor:         'pointer',
                }}
              >
                Connect Gmail
              </a>
            )}
            {status.connected && (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="kayna-btn"
                style={{
                  fontFamily:   "'Inter', sans-serif",
                  fontSize:     13,
                  fontWeight:   500,
                  padding:      '7px 16px',
                  background:   'transparent',
                  color:        '#f87171',
                  border:       '1px solid #f87171',
                  borderRadius: 6,
                  cursor:       disconnecting ? 'not-allowed' : 'pointer',
                  opacity:      disconnecting ? 0.5 : 1,
                }}
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            )}
            {disconnectError && (
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#f87171' }}>
                {disconnectError}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internal layout helpers (match SettingsForm.tsx Row/Field style)
// ---------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      padding:      '12px 16px',
      borderBottom: '1px solid var(--color-border)',
      gap:          16,
    }}>
      <label style={{
        fontFamily: "'Inter', sans-serif",
        fontSize:   13,
        color:      'var(--color-body)',
        width:      240,
        flexShrink: 0,
      }}>
        {label}
      </label>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}
