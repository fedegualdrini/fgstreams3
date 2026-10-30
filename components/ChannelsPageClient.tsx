'use client';

import { useMemo, useState } from 'react';
import type { Channel } from '@/types/channels';
import ChannelBrowser from '@/components/channels/ChannelBrowser';
import ChannelViewer from '@/components/channels/ChannelViewer';
import { useChannelSelection } from '@/components/channels/useChannelSelection';
import { useLpfChannel } from '@/components/channels/useLpfChannel';

interface ChannelsPageClientProps {
  channels: Channel[];
}

export default function ChannelsPageClient({ channels }: ChannelsPageClientProps) {
  const lpf = useLpfChannel(channels.some(channel => channel.source === 'lpf'));
  const catalog = useMemo(
    () => lpf.snapshot
      ? channels.map(channel => channel.source === 'lpf' ? lpf.snapshot!.channel : channel)
      : channels,
    [channels, lpf.snapshot],
  );
  const { selectedChannel, selectedOptionIndex, toggleChannel, changeOption, closeChannel } =
    useChannelSelection(catalog);
  // Selection keeps the original object; resolve it against the latest snapshot.
  const displayedChannel = selectedChannel
    ? catalog.find(channel => channel.name === selectedChannel.name) ?? selectedChannel
    : null;
  const [search, setSearch] = useState('');

  return (
    <div className="page-fill">
      {displayedChannel ? (
        <ChannelViewer
          channel={displayedChannel}
          optionIndex={selectedOptionIndex}
          onOptionChange={changeOption}
          onClose={closeChannel}
          lpfCheckedAt={lpf.snapshot?.checkedAt}
          lpfError={lpf.error}
          lpfRefreshing={lpf.isRefreshing}
          onRefreshLpf={lpf.refresh}
        />
      ) : (
        <ChannelBrowser
          channels={catalog}
          search={search}
          onSearchChange={setSearch}
          onSelect={toggleChannel}
        />
      )}
    </div>
  );
}
