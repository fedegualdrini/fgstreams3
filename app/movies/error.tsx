'use client';

export default function MoviesError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div style={{ padding: '4rem 1rem', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
      <p style={{ color: 'var(--subtle)', marginBottom: '1rem', fontSize: '0.875rem' }}>
        {error.message || 'Something went wrong'}
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          padding: '0.5rem 1rem', background: 'var(--accent)', color: '#000',
          border: 'none', borderRadius: '4px', cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600,
        }}
      >
        Try again
      </button>
    </div>
  );
}
