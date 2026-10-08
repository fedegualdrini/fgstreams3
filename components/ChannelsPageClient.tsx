'use client';

import { useState } from 'react';
import type { Channel } from '@/types/channels';
import ChannelBrowser from '@/components/channels/ChannelBrowser';
import ChannelViewer from '@/components/channels/ChannelViewer';
import { useChannelSelection } from '@/components/channels/useChannelSelection';

interface ChannelsPageClientProps {
  channels: Channel[];
}

export default function ChannelsPageClient({ channels }: ChannelsPageClientProps) {
  const { selectedChannel, selectedOptionIndex, toggleChannel, changeOption, closeChannel } =
    useChannelSelection(channels);
  const [search, setSearch] = useState('');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {selectedChannel ? (
        <ChannelViewer
          channel={selectedChannel}
          optionIndex={selectedOptionIndex}
          onOptionChange={changeOption}
          onClose={closeChannel}
        />
      ) : (
        <ChannelBrowser
          channels={channels}
          search={search}
          onSearchChange={setSearch}
          onSelect={toggleChannel}
        />
      )}
    </div>
  );
}
