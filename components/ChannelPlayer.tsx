'use client';

import { useState } from 'react';
import type { Channel, ChannelOption } from '@/types/channels';

interface ChannelPlayerProps {
  channel: Channel;
  initialOptionIndex?: number;
}

export default function ChannelPlayer({ channel, initialOptionIndex = 0 }: ChannelPlayerProps) {
  const validOptions = channel.options.filter(o => o.iframe && o.iframe !== 'undefined');
  const [selectedIndex, setSelectedIndex] = useState(
    Math.min(initialOptionIndex, Math.max(validOptions.length - 1, 0))
  );
  const [isLoading, setIsLoading] = useState(true);

  const currentOption: ChannelOption | undefined = validOptions[selectedIndex];

  if (validOptions.length === 0) {
    return (
      <div className="video-container flex items-center justify-center text-gray-400">
        No streams available for this channel
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Option tabs */}
      {validOptions.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {validOptions.map((option, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSelectedIndex(i);
                setIsLoading(true);
              }}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                i === selectedIndex
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}

      {/* Player */}
      <div className="video-container relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-gray-400 z-10">
            Loading stream...
          </div>
        )}
        {currentOption && (
          <iframe
            key={`${channel.name}-${selectedIndex}`}
            src={currentOption.iframe}
            title={`${channel.name} - ${currentOption.name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-none"
            onLoad={() => setIsLoading(false)}
          />
        )}
      </div>
    </div>
  );
}
