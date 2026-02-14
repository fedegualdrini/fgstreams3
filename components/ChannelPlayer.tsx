'use client';

import { useState, useEffect, useRef } from 'react';
import type { Channel, ChannelOption } from '@/types/channels';

interface ChannelPlayerProps {
  channel: Channel;
  initialOptionIndex?: number;
  onOptionChange?: (index: number) => void;
}

export default function ChannelPlayer({ channel, initialOptionIndex = 0, onOptionChange }: ChannelPlayerProps) {
  const validOptions = channel.options.filter(o => o.iframe && o.iframe !== 'undefined');
  const [selectedIndex, setSelectedIndex] = useState(
    Math.min(initialOptionIndex, Math.max(validOptions.length - 1, 0))
  );
  const [isLoading, setIsLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentOption: ChannelOption | undefined = validOptions[selectedIndex];

  // Clear and restart timeout whenever option or reloadKey changes
  useEffect(() => {
    setIsLoading(true);
    setTimedOut(false);

    timeoutRef.current = setTimeout(() => {
      setTimedOut(true);
      setIsLoading(false);
    }, 15000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [selectedIndex, reloadKey]);

  const selectOption = (index: number) => {
    setSelectedIndex(index);
    onOptionChange?.(index);
  };

  const tryNextOption = () => {
    if (validOptions.length < 2) return;
    const nextIndex = (selectedIndex + 1) % validOptions.length;
    selectOption(nextIndex);
  };

  const reloadPlayer = () => {
    setReloadKey(k => k + 1);
  };

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
              onClick={() => selectOption(i)}
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
        {/* Loading overlay */}
        {isLoading && !timedOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-gray-400 z-10">
            Loading stream...
          </div>
        )}

        {/* Timeout overlay */}
        {timedOut && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 gap-4">
            <p className="text-gray-300 font-medium">Stream not responding</p>
            <p className="text-gray-500 text-sm">Try a different option</p>
            {validOptions.length > 1 && (
              <button
                type="button"
                onClick={tryNextOption}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Try next option →
              </button>
            )}
            <button
              type="button"
              onClick={reloadPlayer}
              className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              ↺ Retry this stream
            </button>
          </div>
        )}

        {currentOption && (
          <iframe
            key={`${channel.name}-${selectedIndex}-${reloadKey}`}
            src={currentOption.iframe}
            title={`${channel.name} - ${currentOption.name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-none"
            onLoad={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setIsLoading(false);
              setTimedOut(false);
            }}
          />
        )}
      </div>

      {/* Controls below player */}
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={reloadPlayer}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
        >
          ↺ Reload stream
        </button>
        {validOptions.length > 1 && (
          <button
            type="button"
            onClick={tryNextOption}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            → Try next option
          </button>
        )}
        {currentOption && (
          <span className="text-xs text-gray-600 ml-auto">{currentOption.name}</span>
        )}
      </div>
    </div>
  );
}
