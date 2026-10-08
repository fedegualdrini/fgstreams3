// Kept as literal strings (not built from the count) so Tailwind can see them.
function columnClasses(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 md:grid-cols-2';
  if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
}

export default function PlayerGrid({ count, children }: { count: number; children: React.ReactNode }) {
  return <div className={`grid gap-3 ${columnClasses(count)}`}>{children}</div>;
}
