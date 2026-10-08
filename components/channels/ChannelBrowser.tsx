import { useMemo } from 'react';
import type { Channel } from '@/types/channels';
import { filterChannelsByName, getPlayableOptions, pluralize } from '@/lib/channelOptions';
import ChannelTile from './ChannelTile';

interface ChannelBrowserProps {
  channels: Channel[];
  /** Owned by the parent so the query survives opening and closing a channel. */
  search: string;
  onSearchChange: (search: string) => void;
  onSelect: (channel: Channel) => void;
}

/** Searchable grid of every channel. */
export default function ChannelBrowser({ channels, search, onSearchChange, onSelect }: ChannelBrowserProps) {
  const filtered = useMemo(() => filterChannelsByName(channels, search), [channels, search]);
  const isSearching = search.trim() !== '';

  return (
    <div className="page-content channel-browse">
      <div className="channel-toolbar">
        <div className="search-field">
          <span className="search-field__icon">⌕</span>
          <input
            type="text"
            className="search-field__input"
            placeholder="Search channels…"
            aria-label="Search channels"
            autoComplete="off"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <span className="channel-toolbar__count">
          {isSearching
            ? `${filtered.length} of ${channels.length} channels`
            : pluralize(channels.length, 'channel')}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📺</div>
          <div className="empty-state__text">No channels match &ldquo;{search}&rdquo;</div>
          <button type="button" className="empty-state__action" onClick={() => onSearchChange('')}>
            Clear search
          </button>
        </div>
      ) : (
        <div className="channel-grid">
          {filtered.map(channel => (
            <ChannelTile
              key={channel.name}
              channel={channel}
              streamCount={getPlayableOptions(channel).length}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
