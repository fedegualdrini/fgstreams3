'use client';

export default function MatchError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '50vh', gap: '1rem',
      padding: '2rem', fontFamily: 'var(--font-body)',
    }}>
      <p style={{ color: 'var(--text)', fontSize: '1rem', fontWeight: 600 }}>
        Failed to load match
      </p>
      <p style={{ color: 'var(--muted)', fontSize: '0.875rem', maxWidth: '400px', textAlign: 'center' }}>
        {error.message || 'Could not load match details. The match may no longer be available.'}
      </p>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '0.5rem 1.25rem', background: 'var(--accent)', color: '#000',
            border: 'none', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            padding: '0.5rem 1.25rem', background: 'var(--bg-2)', color: 'var(--text-dim)',
            border: '1px solid var(--line)', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center',
          }}
        >
          Back to matches
        </a>
      </div>
    </div>
  );
}
