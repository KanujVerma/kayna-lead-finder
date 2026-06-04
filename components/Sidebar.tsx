'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/finder',   label: 'Lead Finder' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/stats',    label: 'Stats' },
  { href: '/trash',    label: 'Trash' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col"
      style={{ width: 210, background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-5"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
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

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
              style={{
                fontFamily: "'Inter', sans-serif",
                color: active ? 'var(--color-accent)' : 'var(--color-muted)',
                background: active ? 'rgba(92,225,230,0.06)' : 'transparent',
                transition: 'color 0.15s, background 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--color-body)'
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--color-muted)'
              }}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                  style={{ width: 2, height: 14, background: 'var(--color-accent)' }}
                />
              )}
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
