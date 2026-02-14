# Channels Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/channels` route with a nav button in the header, displaying TV channels from `channels.json` with a stream player — and fix the player width bug on the match detail page.

**Architecture:** Copy `channels.json` to `public/` for static serving. Create a shared `SiteHeader` component used across all pages. Add `/channels` page with a client-side channel list + stream player using the existing `StreamPlayer` component via a channel-compatible `Stream` adapter.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS

---

## Task 1: Fix Player Width Bug

**Problem:** In `MatchDetailClient.tsx`, the `<section>` wrapping `<StreamPlayer>` has no width constraint. On wide screens `video-container` expands to full viewport. Also, the mobile CSS rule in `globals.css` (`margin: 0 -1rem; width: calc(100% + 2rem)`) bleeds out of the page layout.

**Files:**
- Modify: `app/globals.css`
- Modify: `components/MatchDetailClient.tsx`

**Step 1: Fix `globals.css` mobile rule**

The mobile video-container rule should not apply when the container is already constrained. Remove the negative margin bleed — it causes the full-width issue.

In `app/globals.css`, replace the `@media (max-width: 768px)` block:

```css
/* Mobile optimizations */
@media (max-width: 768px) {
  button, a {
    min-height: 44px;
    min-width: 44px;
  }
}
```

(Remove the `.video-container` mobile override entirely — the `width: 100%` and `padding-bottom: 56.25%` already handle responsiveness correctly within a constrained container.)

**Step 2: Constrain the player section in `MatchDetailClient.tsx`**

On line 136, the `<section className="mb-6">` wrapping `<StreamPlayer>` has no max-width. Change it to:

```tsx
<section className="mb-6 w-full max-w-4xl">
```

This ensures the player never exceeds 896px width (max-w-4xl) and stays proportional.

**Step 3: Verify in browser**

Navigate to any match page at `http://localhost:3000/match/[id]`. The player should be contained and not stretch to full screen width.

**Step 4: Commit**

```bash
git add app/globals.css components/MatchDetailClient.tsx
git commit -m "fix: constrain video player width on match detail page"
```

---

## Task 2: Copy channels.json to public/

The channels page will read the JSON at build/request time from a server component. Placing it in `public/` allows both static serving and easy `fs.readFile` or `fetch('/channels.json')` access.

**Files:**
- Create: `public/channels.json` (copy of `D:\fgstreams3\channels.json`)

**Step 1: Copy the file**

```bash
cp D:/fgstreams3/channels.json public/channels.json
```

**Step 2: Verify**

```bash
ls public/channels.json
```

Expected: file exists with size > 0.

**Step 3: Commit**

```bash
git add public/channels.json
git commit -m "feat: add channels.json to public directory"
```

---

## Task 3: Create SiteHeader shared component

Currently the header is duplicated inline in `app/page.tsx` and `app/match/[id]/page.tsx` (via `MatchDetailClient.tsx`). Extract it into a shared component with nav links for **Matches** and **Channels**.

**Files:**
- Create: `components/SiteHeader.tsx`
- Modify: `app/page.tsx`
- Modify: `components/MatchDetailClient.tsx`

**Step 1: Create `components/SiteHeader.tsx`**

```tsx
import Link from 'next/link';

interface SiteHeaderProps {
  activeSection?: 'matches' | 'channels';
}

export default function SiteHeader({ activeSection }: SiteHeaderProps) {
  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sports Streaming Mirror</h1>
          <p className="text-sm text-gray-400 mt-1">Clean, reliable sports streaming</p>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === 'matches'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-800'
            }`}
          >
            Matches
          </Link>
          <Link
            href="/channels"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === 'channels'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-800'
            }`}
          >
            📺 Channels
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

**Step 2: Update `app/page.tsx` to use SiteHeader**

Replace the inline `<header>` block (lines 25-30) with:

```tsx
import SiteHeader from '@/components/SiteHeader';
// ...
<SiteHeader activeSection="matches" />
```

Full updated file:

```tsx
import { fetchMatches, fetchSports } from '@/lib/api';
import MatchListWithSearch from '@/components/MatchListWithSearch';
import SiteHeader from '@/components/SiteHeader';

export const revalidate = 30;

export default async function Home() {
  const [matches, sports] = await Promise.all([
    fetchMatches(),
    fetchSports(),
  ]);

  const sortedMatches = [...matches].sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
    return aTime - bTime;
  });

  const liveMatches = sortedMatches.filter(m => m.isLive);
  const upcomingMatches = sortedMatches.filter(m => !m.isLive);

  return (
    <>
      <SiteHeader activeSection="matches" />

      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <MatchListWithSearch
          liveMatches={liveMatches}
          upcomingMatches={upcomingMatches}
        />
      </main>

      <footer className="bg-gray-900 border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <p className="text-sm text-gray-400 text-center">
            Streams sourced from publicly available sources via Streamed API
          </p>
        </div>
      </footer>
    </>
  );
}
```

**Step 3: Update `MatchDetailClient.tsx` back button**

The match detail page has its own inline header with a back link. Keep it as-is (it's a detail page, not a main nav context) but add the SiteHeader above it so the nav is always present.

In `components/MatchDetailClient.tsx`, add SiteHeader import and render it at the top of `<main>`, before the existing `<header>`:

```tsx
import SiteHeader from './SiteHeader';

// Inside return, replace <main ...> opening and add SiteHeader before <header>:
return (
  <>
    <SiteHeader activeSection="matches" />
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-6">
      {/* ... rest unchanged ... */}
    </main>
  </>
);
```

**Step 4: Commit**

```bash
git add components/SiteHeader.tsx app/page.tsx components/MatchDetailClient.tsx
git commit -m "feat: add shared SiteHeader with Matches and Channels nav"
```

---

## Task 4: Create Channel types

Define TypeScript types for the channel data structure from `channels.json`.

**Files:**
- Create: `types/channels.ts`

**Step 1: Create `types/channels.ts`**

```ts
export interface ChannelOption {
  name: string;
  iframe: string;
}

export interface Channel {
  name: string;
  logo: string;
  options: ChannelOption[];
  show: boolean;
}
```

**Step 2: Commit**

```bash
git add types/channels.ts
git commit -m "feat: add Channel TypeScript types"
```

---

## Task 5: Create ChannelPlayer client component

This component takes a channel and its options, lets the user pick an option tab, and renders the stream in an iframe using the same approach as `StreamPlayer` but without the `Stream` type dependency (channels use `iframe` URL directly).

**Files:**
- Create: `components/ChannelPlayer.tsx`

**Step 1: Create `components/ChannelPlayer.tsx`**

```tsx
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
    Math.min(initialOptionIndex, validOptions.length - 1)
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
```

**Step 2: Commit**

```bash
git add components/ChannelPlayer.tsx
git commit -m "feat: add ChannelPlayer component with option tabs"
```

---

## Task 6: Create ChannelsPageClient component

The channels page needs client-side interactivity (search, channel selection). This client component handles state, while the server page passes the pre-filtered channel data as props.

**Files:**
- Create: `components/ChannelsPageClient.tsx`

**Step 1: Create `components/ChannelsPageClient.tsx`**

```tsx
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
          No channels found for "{search}"
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/ChannelsPageClient.tsx
git commit -m "feat: add ChannelsPageClient with search and channel grid"
```

---

## Task 7: Create /channels server page

The server component reads and filters `channels.json`, then passes clean data to `ChannelsPageClient`.

**Files:**
- Create: `app/channels/page.tsx`

**Step 1: Create `app/channels/page.tsx`**

```tsx
import { readFile } from 'fs/promises';
import path from 'path';
import type { Metadata } from 'next';
import type { Channel } from '@/types/channels';
import SiteHeader from '@/components/SiteHeader';
import ChannelsPageClient from '@/components/ChannelsPageClient';

export const metadata: Metadata = {
  title: 'Channels | Sports Streaming Mirror',
  description: 'Watch live TV channels',
};

async function getChannels(): Promise<Channel[]> {
  const filePath = path.join(process.cwd(), 'public', 'channels.json');
  const raw = await readFile(filePath, 'utf-8');
  const all: Channel[] = JSON.parse(raw);

  // Filter: only show:true channels with at least one valid (non-"undefined") iframe
  return all.filter(
    c => c.show && c.options.some(o => o.iframe && o.iframe !== 'undefined')
  );
}

export default async function ChannelsPage() {
  const channels = await getChannels();

  return (
    <>
      <SiteHeader activeSection="channels" />
      <main className="flex-1 bg-[var(--background)] text-[var(--foreground)]">
        <ChannelsPageClient channels={channels} />
      </main>
      <footer className="bg-gray-900 border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <p className="text-sm text-gray-400 text-center">
            Streams sourced from publicly available sources
          </p>
        </div>
      </footer>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add app/channels/page.tsx
git commit -m "feat: add /channels server page with channel data loading"
```

---

## Task 8: Verify everything works

**Step 1: Check dev server is running**

The server should already be running at `http://localhost:3000`. If not:
```bash
npm run dev
```

**Step 2: Check home page**

Visit `http://localhost:3000` — verify the SiteHeader shows "Matches" and "Channels" nav buttons. "Matches" should be highlighted blue.

**Step 3: Check channels page**

Visit `http://localhost:3000/channels` — verify:
- "Channels" nav button is highlighted blue
- Channel grid loads with logos and names
- Search input filters channels
- Clicking a channel opens the player above the grid
- Option tabs appear when a channel has multiple streams
- Clicking a tab loads the corresponding iframe

**Step 4: Check match detail page**

Visit any match → verify player is constrained (not full-width), and SiteHeader is visible with nav.

**Step 5: Commit if any last fixes applied**

```bash
git add -A
git commit -m "fix: post-verification cleanup"
```
