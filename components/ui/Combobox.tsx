'use client'
import { useState } from 'react'

interface Props {
  options: string[]
  value: string
  onChange: (v: string) => void
  placeholder: string
}

export default function Combobox({ options, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)

  const filtered = value
    ? options.filter(o => o.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : options.slice(0, 8)

  return (
    <div className="relative" style={{ width: 220 }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setFocused(true); setOpen(true) }}
        onBlur={() => { setFocused(false); setTimeout(() => setOpen(false), 150) }}
        style={{
          background: 'var(--color-bg)',
          border: `1px solid ${focused ? 'var(--color-accent)' : 'var(--color-border)'}`,
          color: 'var(--color-body)',
          borderRadius: 8,
          padding: '10px 16px',
          width: '100%',
          outline: 'none',
        }}
      />
      {open && filtered.length > 0 && (
        <div
          className="kayna-dropdown absolute top-full left-0 mt-1 w-full z-50 rounded-lg overflow-auto"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            maxHeight: 240,
          }}
        >
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={() => { onChange(opt); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm"
              style={{ color: 'var(--color-body)', background: 'transparent', display: 'block' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(92,225,230,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
