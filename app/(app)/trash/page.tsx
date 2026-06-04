'use client'
import { useState, useEffect } from 'react'
import { DISMISSED_KEY, makeKey, writeDismissed, type DismissedEntry } from '@/lib/dismissed'

export default function TrashPage() {
  const [dismissed, setDismissed] = useState<DismissedEntry[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY)
      setDismissed(raw ? JSON.parse(raw) : [])
    } catch { setDismissed([]) }
  }, [])

  function restore(entry: DismissedEntry) {
    const key = makeKey(entry.name, entry.city)
    const updated = dismissed.filter(d => makeKey(d.name, d.city) !== key)
    writeDismissed(updated)
    setDismissed(updated)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          color: 'var(--color-accent)',
          marginBottom: 5,
        }}>
          Dismissed
        </p>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 300,
          fontSize: 40,
          color: 'var(--color-heading)',
          lineHeight: 1.05,
          marginBottom: 3,
        }}>
          Trash
        </h1>
        <p style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 300,
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--color-muted)',
        }}>
          businesses you&apos;ve dismissed from search results
        </p>
      </div>

      {dismissed.length === 0 ? (
        <p style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 300,
          fontStyle: 'italic',
          fontSize: 17,
          color: 'var(--color-dim)',
          marginTop: 40,
        }}>
          No dismissed leads.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: 'var(--color-surface)' }}>
                {['Business', 'Category', 'City', 'Website', 'Score', ''].map((h, i) => (
                  <th
                    key={i}
                    className="py-2.5 px-3 text-left first:pl-4 last:pr-4"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 10,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.14em',
                      color: 'var(--color-dim)',
                      fontWeight: 400,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dismissed.map(b => (
                <tr
                  key={makeKey(b.name, b.city)}
                  className="kayna-row"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <td className="py-3 pl-4 px-3">
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-heading)' }}>
                      {b.name}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-sm" style={{ color: 'var(--color-dim)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>
                    {b.category}
                  </td>
                  <td className="py-3 px-3 text-sm" style={{ color: 'var(--color-muted)' }}>
                    {b.city}
                  </td>
                  <td className="py-3 px-3 text-sm" style={{ maxWidth: 200 }}>
                    {b.website ? (
                      <a href={b.website} target="_blank" rel="noopener noreferrer" className="underline truncate block" style={{ color: 'var(--color-accent)', maxWidth: 180 }}>
                        {b.website.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--color-dim)' }}>—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-sm" style={{ color: 'var(--color-muted)' }}>
                    {typeof b.score === 'number' ? b.score : <span style={{ color: 'var(--color-dim)' }}>—</span>}
                  </td>
                  <td className="py-3 px-3 pr-4">
                    <button
                      onClick={() => restore(b)}
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11,
                        color: 'var(--color-muted)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 4,
                        padding: '4px 10px',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-body)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
