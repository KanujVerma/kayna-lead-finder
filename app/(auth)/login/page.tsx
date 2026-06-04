'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      router.push('/finder')
    } else {
      setError('Incorrect password')
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-bg)' }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: '40px 40px',
          width: '100%',
          maxWidth: 360,
        }}
      >
        {/* Logo lockup */}
        <div className="flex items-center gap-3 mb-8">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
            <path
              d="M4 21 L15 9 L26 21"
              stroke="#5ce1e6"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex flex-col">
            <span style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 300,
              fontSize: 22,
              color: 'var(--color-heading)',
              lineHeight: 1,
              letterSpacing: '0.04em',
            }}>
              Kayna
            </span>
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 9,
              color: 'var(--color-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              marginTop: 6,
            }}>
              Lead Finder
            </span>
          </div>
        </div>

        {/* Italic subheadline */}
        <p style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 300,
          fontStyle: 'italic',
          fontSize: 18,
          color: 'var(--color-muted)',
          marginBottom: 24,
        }}>
          enter to continue
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label style={{
              display: 'block',
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--color-dim)',
              marginBottom: 6,
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full focus:outline-none"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 5,
                padding: '9px 13px',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: 'var(--color-body)',
              }}
              placeholder="••••••••"
              autoFocus
            />
          </div>

          {error && (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#f87171' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full kayna-btn disabled:opacity-50"
            style={{
              background: 'var(--color-accent)',
              color: '#080808',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              fontSize: 13,
              padding: '10px 0',
              borderRadius: 5,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Entering…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
