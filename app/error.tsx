'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '50vh', gap: '1rem',
      padding: '2rem', fontFamily: 'var(--font-body)',
    }}>
      <p style={{ color: 'var(--text)', fontSize: '1rem', fontWeight: 600 }}>
        Something went wrong
      </p>
      <p style={{ color: 'var(--muted)', fontSize: '0.875rem', maxWidth: '400px', textAlign: 'center' }}>
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
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
    </div>
  );
}
