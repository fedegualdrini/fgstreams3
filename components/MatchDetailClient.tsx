'use client';

import { useState } from 'react';
import type { BroadcastChannel, Match, Stream } from '@/types/api';
import { useToast } from '@/components/Toast';
import { useMatchStats } from '@/lib/useMatchStats';
import StreamList from './StreamList';
import MultiMatchView from './MultiMatchView';
import SiteHeader from './SiteHeader';
import MatchJsonLd from './MatchJsonLd';
import MatchActions from './match-detail/MatchActions';
import MatchPlayerPane from './match-detail/MatchPlayerPane';
import MatchSidebar, { type SidebarTab } from './match-detail/MatchSidebar';
import MatchSubHeader from './match-detail/MatchSubHeader';
import ShortcutsDialog from './match-detail/ShortcutsDialog';
import { toggleFullscreen } from './match-detail/shortcuts';
import { useKeyboardShortcuts } from './match-detail/useKeyboardShortcuts';
import { useShare } from './match-detail/useShare';
import { useStreamPlayback } from './match-detail/useStreamPlayback';

interface MatchDetailClientProps {
  match: Match;
  /**
   * Streams resolved on the server. When present the player and the source
   * list are populated on first paint; the client only refetches on retry.
   */
  initialStreams?: Stream[];
  /**
   * True when `initialStreams` is the server's final answer — an empty array
   * then means "this match has no playable stream", not "not looked up yet",
   * so the client neither shows a spinner nor refetches.
   */
  streamsResolved?: boolean;
  /** Channels from the local catalog that are carrying this match. */
  broadcasts?: BroadcastChannel[];
}

export default function MatchDetailClient({
  match,
  initialStreams,
  streamsResolved = false,
  broadcasts,
}: MatchDetailClientProps) {
  const { showToast, ToastComponent } = useToast();
  const playback = useStreamPlayback({
    match,
    initialStreams,
    streamsResolved,
    broadcasts,
    notify: showToast,
  });
  const stats = useMatchStats(match);
  const share = useShare(
    `${match.team1} vs ${match.team2} - Live Stream`,
    () => showToast('Link copied to clipboard', 'success'),
  );

  const [multiStreamMode, setMultiStreamMode] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('streams');
  const [showShortcuts, setShowShortcuts] = useState(false);

  const canSkipStream = !multiStreamMode && playback.streams.length > 0 && !playback.allStreamsFailed;
  useKeyboardShortcuts({
    nextStream: () => { if (canSkipStream) playback.rotate(); },
    fullscreen: toggleFullscreen,
    toggleHelp: () => setShowShortcuts(open => !open),
    closeHelp: () => setShowShortcuts(false),
  });

  return (
    <>
      <MatchJsonLd match={match} />
      <SiteHeader activeSection="matches" />

      <main className="match-detail">
        <MatchSubHeader
          match={match}
          stats={stats}
          actions={
            <MatchActions
              shareCopied={share.copied}
              onShare={share.share}
              shortcutsOpen={showShortcuts}
              onToggleShortcuts={() => setShowShortcuts(open => !open)}
              multiStreamMode={multiStreamMode}
              onToggleMultiStream={() => setMultiStreamMode(on => !on)}
            />
          }
        >
          {multiStreamMode && (
            <div className="page-content match-subheader__multi">
              <MultiMatchView currentMatch={match} />
            </div>
          )}
        </MatchSubHeader>

        {!multiStreamMode && (
          <div className="detail-layout">
            <MatchPlayerPane
              channel={playback.selectedChannel}
              stream={playback.currentStream}
              hasStreams={playback.streams.length > 0}
              allStreamsFailed={playback.allStreamsFailed}
              onStreamError={playback.rotate}
              onRetry={playback.retry}
            />
            <MatchSidebar
              tab={sidebarTab}
              onTabChange={setSidebarTab}
              stats={stats}
              streamList={
                <StreamList
                  streams={playback.streams}
                  currentStreamIndex={playback.currentIndex}
                  onSelectStream={playback.selectStream}
                  broadcasts={broadcasts}
                  selectedChannel={playback.selectedChannel?.channel ?? null}
                  onSelectChannel={playback.selectChannel}
                  isLoading={playback.isResolvingStreams}
                />
              }
            />
          </div>
        )}
      </main>

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {ToastComponent}
    </>
  );
}
