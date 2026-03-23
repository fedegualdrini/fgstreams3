export default function MatchListSkeleton() {
  return (
    <div style={{ padding: '1rem' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{
          height: '72px',
          background: 'var(--surface)',
          borderRadius: '4px',
          marginBottom: '8px',
          animation: 'pulse 1.5s ease-in-out infinite',
          opacity: 0.6,
        }} />
      ))}
    </div>
  );
}
