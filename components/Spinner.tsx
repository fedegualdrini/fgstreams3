interface SpinnerProps {
  size?: number;
  label?: string;
}

export default function Spinner({ size = 32, label = 'Loading…' }: SpinnerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{
        width: `${size}px`,
        height: `${size}px`,
        border: '2px solid var(--line)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      {label && <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>{label}</span>}
    </div>
  );
}
