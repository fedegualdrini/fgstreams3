interface SectionHeaderProps {
  children: React.ReactNode;
  count?: number;
  live?: boolean;
}

export default function SectionHeader({ children, count, live }: SectionHeaderProps) {
  return (
    <div className="section-header">
      {live && <span className="live-dot section-header__dot" />}
      <h2 className="section-header__title">
        {children}
        {count !== undefined && count > 0 && <span className="section-header__count">{count}</span>}
      </h2>
      <div className="section-header__rule" />
    </div>
  );
}
