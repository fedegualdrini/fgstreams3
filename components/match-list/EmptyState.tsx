interface EmptyStateProps {
  children: React.ReactNode;
  icon?: string;
  hint?: string;
}

export default function EmptyState({ children, icon, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state__icon">{icon}</div>}
      <div className="empty-state__title">{children}</div>
      {hint && <div className="empty-state__hint">{hint}</div>}
    </div>
  );
}
