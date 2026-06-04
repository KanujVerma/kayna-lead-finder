export default function StatsPage() {
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.18em',
        color: 'var(--color-accent)',
        marginBottom: 5,
      }}>
        Stats
      </p>
      <h1 style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontWeight: 300,
        fontSize: 40,
        color: 'var(--color-heading)',
        lineHeight: 1.05,
        marginBottom: 3,
      }}>
        Stats
      </h1>
      <p style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontWeight: 300,
        fontStyle: 'italic',
        fontSize: 17,
        color: 'var(--color-muted)',
        marginBottom: 40,
      }}>
        deal insights, conversion rates, and revenue tracking
      </p>
      <p style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 13,
        color: 'var(--color-dim)',
      }}>
        Coming soon.
      </p>
    </div>
  )
}
