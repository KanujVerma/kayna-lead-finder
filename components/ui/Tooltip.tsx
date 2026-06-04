'use client'
import { useState } from 'react'

interface Props {
  content: string
  children: React.ReactNode
}

export default function Tooltip({ content, children }: Props) {
  const [visible, setVisible] = useState(false)

  // Split into title + body if separated by double newline
  const [title, ...rest] = content.split('\n\n')
  const body = rest.join('\n\n')

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className="kayna-tooltip absolute bottom-full right-0 z-50 mb-2 w-60 pointer-events-none"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid rgba(92,225,230,0.25)',
            borderLeft: '3px solid #5ce1e6',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}
        >
          <div className="px-3 py-2.5">
            <div
              className="text-xs font-semibold mb-1 leading-snug"
              style={{ color: '#5ce1e6' }}
            >
              {title}
            </div>
            {body && (
              <div
                className="text-xs leading-relaxed"
                style={{ color: 'var(--color-muted)', whiteSpace: 'pre-line' }}
              >
                {body}
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  )
}
