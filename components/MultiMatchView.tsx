'use client';

import { useState } from 'react';
import type { Match } from '@/types/api';
import {
  DEFAULT_MAX_MATCHES,
  matchesAvailableToAdd,
  type MatchLayout,
} from '@/lib/multiMatch';
import ActiveMatchCard from '@/components/multi-match/ActiveMatchCard';
import MatchPickerDialog from '@/components/multi-match/MatchPickerDialog';
import MultiMatchControls from '@/components/multi-match/MultiMatchControls';
import PlayerGrid from '@/components/multi-match/PlayerGrid';
import { useMultiMatch } from '@/components/multi-match/useMultiMatch';

interface MultiMatchViewProps {
  currentMatch: Match;
  maxMatches?: number;
}

export default function MultiMatchView({ currentMatch, maxMatches = DEFAULT_MAX_MATCHES }: MultiMatchViewProps) {
  const wall = useMultiMatch(currentMatch, maxMatches);
  const [layout, setLayout] = useState<MatchLayout>('grid');
  const [pickerOpen, setPickerOpen] = useState(false);

  if (wall.loading) {
    return <div className="multi-status multi-label">Loading matches</div>;
  }

  if (wall.loadError) {
    return (
      <div className="multi-status">
        <p className="multi-status__error">{wall.loadError}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </div>
    );
  }

  const handlePick = async (match: Match) => {
    if (await wall.addMatch(match)) setPickerOpen(false);
  };

  return (
    <div className="multi-view">
      {wall.activeMatches.length === 0 ? (
        <div className="multi-status">
          <p className="multi-label">No matches loaded</p>
          <button type="button" className="btn is-active" onClick={() => setPickerOpen(true)}>
            Add matches
          </button>
        </div>
      ) : (
        <>
          <MultiMatchControls
            layout={layout}
            onLayoutChange={setLayout}
            count={wall.activeMatches.length}
            maxMatches={maxMatches}
            onAdd={() => setPickerOpen(true)}
            onClearExtras={wall.keepOnlyFirst}
          />
          <PlayerGrid count={wall.activeMatches.length}>
            {wall.activeMatches.map((active) => (
              <ActiveMatchCard
                key={active.match.id}
                active={active}
                onToggleMute={wall.toggleMute}
                onRemove={wall.removeMatch}
                onChangeStream={wall.changeStream}
              />
            ))}
          </PlayerGrid>
        </>
      )}

      {pickerOpen && (
        <MatchPickerDialog
          matches={matchesAvailableToAdd(wall.availableMatches, wall.activeMatches)}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
