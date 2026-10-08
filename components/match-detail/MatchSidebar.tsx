import type { ReactNode } from 'react';
import type { FlashscoreDetail } from '@/types/api';
import MatchStatsPanel from '@/components/MatchStatsPanel';

export type SidebarTab = 'streams' | 'stats';

const TABS: ReadonlyArray<{ id: SidebarTab; label: string }> = [
  { id: 'streams', label: 'Streams' },
  { id: 'stats', label: 'Stats' },
];

interface MatchSidebarProps {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  stats: FlashscoreDetail | null;
  /** The stream/channel picker, shown on the "Streams" tab. */
  streamList: ReactNode;
}

export default function MatchSidebar({ tab, onTabChange, stats, streamList }: MatchSidebarProps) {
  return (
    <div className="detail-sidebar">
      <div className="sidebar-tabs">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="sidebar-tab"
            aria-pressed={tab === id}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="sidebar-body">
        {tab === 'streams' ? streamList : <StatsTab stats={stats} />}
      </div>
    </div>
  );
}

function StatsTab({ stats }: { stats: FlashscoreDetail | null }) {
  if (!stats) return <div className="sidebar-empty">Stats unavailable</div>;
  return <MatchStatsPanel detail={stats} />;
}
