import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Channel } from '@/types/channels';
import { resolveChannelDeepLink } from '@/lib/channelOptions';

/**
 * Which channel (and option) is open, mirrored into the `?c=&o=` query string
 * so a link opens straight to a stream. Escape closes the open channel.
 */
export function useChannelSelection(channels: Channel[]) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const initializedRef = useRef(false);

  // Deep link: applied once, on first render only.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const link = resolveChannelDeepLink(channels, searchParams.get('c'), searchParams.get('o'));
    if (!link) return;
    setSelectedChannel(link.channel);
    setSelectedOptionIndex(link.optionIndex);
  }, [channels, searchParams]);

  const syncUrl = useCallback((channelName: string | null, optionIndex: number) => {
    const params = new URLSearchParams();
    if (channelName) {
      params.set('c', channelName);
      params.set('o', String(optionIndex));
    }
    const newUrl = params.size > 0 ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [router]);

  const closeChannel = useCallback(() => {
    setSelectedChannel(null);
    setSelectedOptionIndex(0);
    syncUrl(null, 0);
  }, [syncUrl]);

  const toggleChannel = (channel: Channel) => {
    if (selectedChannel?.name === channel.name) {
      closeChannel();
      return;
    }
    setSelectedChannel(channel);
    setSelectedOptionIndex(0);
    syncUrl(channel.name, 0);
  };

  const changeOption = (index: number) => {
    setSelectedOptionIndex(index);
    if (selectedChannel) syncUrl(selectedChannel.name, index);
  };

  const isOpen = selectedChannel !== null;
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeChannel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeChannel]);

  return { selectedChannel, selectedOptionIndex, toggleChannel, changeOption, closeChannel };
}
