'use client'
import { useState } from 'react'
import type { Business } from '@/types'
import Tooltip from '@/components/ui/Tooltip'

function ScorePill({ score, website }: { score: Business['score']; website: string | null }) {
  if (website === null) {
    return (
      <Tooltip content="No website detected — high opportunity lead. This business likely needs web services.">
        <span
          className="text-xs font-bold px-2 py-0.5 cursor-help"
          style={{ background: 'rgba(92,225,230,0.1)', color: '#5ce1e6', borderRadius: 3 }}
        >
          🔥 Hot
        </span>
      </Tooltip>
    )
  }
  if (score === 'loading') {
    return <span className="text-xs animate-pulse" style={{ color: 'var(--color-dim)' }}>Scoring…</span>
  }
  if (score === 'error' || score === null) {
    return (
      <Tooltip content="PageSpeed couldn't score this site. It may be blocking automated checks, loading too slowly, or using an unsupported protocol.">
        <span className="text-xs cursor-help" style={{ color: '#f87171' }}>Error</span>
      </Tooltip>
    )
  }
  const num = score as number
  const color = num < 50 ? '#f87171' : num < 75 ? '#fbbf24' : '#4ade80'
  const explanation = num < 50
    ? 'Poor web performance (0–49)\nSite is likely losing customers due to slow load times. Strong upsell opportunity.'
    : num < 75
    ? 'Average web performance (50–74)\nNoticeable room for improvement. Good prospect for optimization services.'
    : 'Good web performance (75–100)\nStrong web presence. May be harder to sell web services to.'
  return (
    <Tooltip content={`PageSpeed score: ${num}/100\n\n${explanation}`}>
      <span
        className="text-xs font-bold px-2 py-0.5 cursor-help"
        style={{ background: `${color}20`, color, borderRadius: 3 }}
      >
        {num}
      </span>
    </Tooltip>
  )
}

function ScreenshotPreview({ screenshot, score }: { screenshot?: string | null; score: Business['score'] }) {
  const [hovered, setHovered] = useState(false)

  if (score === 'loading') {
    return (
      <div
        className="animate-pulse rounded"
        style={{ width: 48, height: 32, background: 'var(--color-border)' }}
      />
    )
  }

  if (!screenshot) return <span style={{ color: 'var(--color-dim)' }}>—</span>

  return (
    <span
      className="relative inline-block cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={screenshot}
        alt="Site preview"
        style={{
          width: 48,
          height: 32,
          objectFit: 'cover',
          objectPosition: 'top',
          borderRadius: 4,
          border: '1px solid var(--color-border)',
          display: 'block',
        }}
      />
      {hovered && (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 pointer-events-none"
          style={{
            animation: 'fadeIn 0.15s ease',
            filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.7))',
          }}
        >
          <img
            src={screenshot}
            alt="Site preview large"
            style={{
              width: 300,
              borderRadius: 8,
              border: '1px solid rgba(92,225,230,0.25)',
              display: 'block',
            }}
          />
        </div>
      )}
    </span>
  )
}

interface Props {
  business: Business
  checked: boolean
  onToggle: () => void
  onAddToCRM: () => void
  onDismiss: () => void
  inPipeline: boolean
}

export default function LeadRow({ business, checked, onToggle, onAddToCRM, onDismiss, inPipeline }: Props) {
  const { name, category, phone, rating, website, score } = business

  return (
    <tr className="kayna-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <td className="py-3 pl-4 pr-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          style={{ accentColor: 'var(--color-accent)' }}
        />
      </td>
      <td className="py-3 px-3">
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: 'var(--color-heading)',
        }}>
          {name}
        </div>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          color: 'var(--color-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginTop: 2,
        }}>
          {category}
        </div>
      </td>
      <td className="py-3 px-3 text-sm" style={{ color: 'var(--color-body)' }}>
        {phone || <span style={{ color: 'var(--color-dim)' }}>—</span>}
      </td>
      <td className="py-3 px-3 text-sm" style={{ color: 'var(--color-muted)' }}>
        {rating != null ? `★ ${rating}` : <span style={{ color: 'var(--color-dim)' }}>—</span>}
      </td>
      <td className="py-3 px-3 text-sm" style={{ maxWidth: 200 }}>
        {website ? (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="underline truncate block"
            style={{ color: 'var(--color-accent)', maxWidth: 180 }}
          >
            {website.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span style={{ color: 'var(--color-dim)' }}>—</span>
        )}
      </td>
      <td className="py-3 px-3">
        <ScorePill score={score} website={website} />
      </td>
      <td className="py-3 px-3">
        <ScreenshotPreview screenshot={business.screenshot} score={score} />
      </td>
      <td className="py-3 px-3 pr-4">
        <div className="flex items-center gap-2">
          {inPipeline ? (
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              color: 'var(--color-dim)',
              padding: '4px 10px',
            }}>
              In CRM
            </span>
          ) : (
            <button
              onClick={onAddToCRM}
              className="text-xs transition-colors"
              style={{
                border: '1px solid var(--color-border)',
                color: 'var(--color-muted)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                borderRadius: 4,
                padding: '4px 10px',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              + CRM
            </button>
          )}
          <button
            onClick={onDismiss}
            title="Dismiss"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              color: 'var(--color-dim)',
              lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-dim)')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Dismiss">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  )
}
