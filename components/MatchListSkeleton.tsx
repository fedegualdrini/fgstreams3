const SKELETON_ROWS = 6;

export default function MatchListSkeleton() {
  return (
    <div className="match-skeleton" aria-hidden="true">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className="match-skeleton__row" />
      ))}
    </div>
  );
}
