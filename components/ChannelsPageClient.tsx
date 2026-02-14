'use client';

import { useState, useMemo } from 'react';
import type { Channel } from '@/types/channels';
import ChannelPlayer from './ChannelPlayer';

interface ChannelsPageClientProps {
  channels: Channel[];
}

export default function ChannelsPageClient({ channels }: ChannelsPageClientProps) {
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return channels;
    const q = search.toLowerCase();
    return channels.filter(c => c.name.toLowerCase().includes(q));
  }, [channels, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
      {/* Player area - shows when a channel is selected */}
      {selectedChannel && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            {selectedChannel.logo && (
              <img
                src={selectedChannel.logo}
                alt=""
                className="w-8 h-8 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <h2 className="text-xl font-bold">{selectedChannel.name}</h2>
            <button
              type="button"
              onClick={() => setSelectedChannel(null)}
              className="ml-auto text-gray-400 hover:text-white text-sm px-3 py-1 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
            >
              ✕ Close
            </button>
          </div>
          <div className="w-full max-w-4xl">
            <ChannelPlayer channel={selectedChannel} />
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <input
          type="search"
          placeholder="Search channels..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
        <p className="text-gray-500 text-sm mt-2">
          {filtered.length} channel{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Channel grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filtered.map(channel => {
          const validCount = channel.options.filter(o => o.iframe && o.iframe !== 'undefined').length;
          const isSelected = selectedChannel?.name === channel.name;

          return (
            <button
              key={channel.name}
              type="button"
              onClick={() => setSelectedChannel(isSelected ? null : channel)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors text-center ${
                isSelected
                  ? 'border-blue-500 bg-blue-600/10 text-white'
                  : 'border-gray-800 bg-gray-900 hover:border-gray-600 hover:bg-gray-800 text-gray-300'
              }`}
            >
              {channel.logo ? (
                <img
                  src={channel.logo}
                  alt=""
                  className="w-10 h-10 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-10 h-10 bg-gray-700 rounded flex items-center justify-center text-lg">
                  📺
                </div>
              )}
              <span className="text-xs font-medium leading-tight">{channel.name}</span>
              <span className="text-xs text-gray-500">{validCount} stream{validCount !== 1 ? 's' : ''}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          No channels found for &ldquo;{search}&rdquo;
        </div>
      )}
    </div>
  );
}
