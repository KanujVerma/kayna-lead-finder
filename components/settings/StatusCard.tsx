interface Props {
  label: string
  status: 'ok' | 'warn' | 'locked' | 'disabled'
  detail: string
}

const STATUS_COLORS: Record<Props['status'], string> = {
  ok:       '#4ade80',
  warn:     '#fbbf24',
  locked:   '#5ce1e6',
  disabled: '#555555',
}

export default function StatusCard({ label, status, detail }: Props) {
  const color = STATUS_COLORS[status]
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: '12px 16px',
      minWidth: 130,
    }}>
      <div style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        marginBottom: 8,
      }} />
      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.16em',
        color: 'var(--color-dim)',
        margin: '0 0 4px 0',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 13,
        color,
        margin: 0,
      }}>
        {detail}
      </p>
    </div>
  )
}
