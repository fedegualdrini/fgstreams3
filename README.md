# Sports Streaming Mirror

A Next.js sports streaming app with match listings, match detail playback, live scores, match statistics, channel playback, movie and TV search, watch history, multi-match viewing, and stream fallback on playback failures.

**Live:** [fgstreams3.vercel.app](https://fgstreams3.vercel.app)

## Features

- **Matches**: Lists live and upcoming matches from the Streamed API, grouped with live matches first and upcoming matches by start time.
- **Match Search and Sport Filter**: Filters matches by team, league, or sport, with quick sport buttons for common categories.
- **Match Detail Playback**: Fetches all stream sources for a match and starts with the preferred stream based on language, quality, and original source order.
- **Stream Fallback**: If a match stream fails to load, the player rotates to the next untried stream. When all streams fail, the UI shows a Try Again action that refetches streams.
- **Multi-Match View**: Lets a user watch up to four matches from one match page, choose grid or side-by-side layout, mute individual streams, remove matches, and switch each match's selected stream.
- **Live Scores**: Polls live score data for active matches and displays matched score/minute data on match cards.
- **Match Statistics**: Shows Flashscore-backed match detail data on match pages when available, including score, events, statistics, and lineups.
- **Watch History**: Stores recently watched matches in local browser storage and shows them on the home page.
- **Channels**: Loads visible channels from `public/channels.json`, validates stream URLs, supports channel search, remembers the selected channel/source in the URL, and provides retry/next-option controls.
- **Movies and Series**: Searches TMDB-backed movie and TV metadata, embeds selected media, and supports season/episode selection for TV shows.

## Tech Stack

- **Next.js 14** with App Router
- **React 18**
- **TypeScript**
- **Tailwind CSS**
- **Vitest**
- **hls.js** for HLS channel playback
- **Zod** for API response validation

## External Data Sources

- **Streamed API** (`https://streamed.pk/api`) for sports, matches, streams, and Streamed-hosted images.
- **Flashscore mobile pages** through local API routes for live scores and match detail data.
- **TMDB API** for movie and TV search metadata. Set `TMDB_API_KEY` before using the Movies page search routes.
- **Local channel catalog** from `public/channels.json`.

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Environment

Create a local environment file when using movie or TV search:

```bash
TMDB_API_KEY=your_tmdb_api_key
```

Sports matches and channels do not require this key.

## Commands

```bash
npm run dev        # Start the Next.js development server
npm run test       # Run the Vitest test suite once
npm run test:watch # Run Vitest in watch mode
npm run lint       # Run Next.js linting
npm run build      # Build the production app
npm start          # Start the built production app
```

Open [http://localhost:3000](http://localhost:3000) after starting the development server.

## Project Structure

```text
app/
  page.tsx                         Home page with match list/search
  layout.tsx                       Root layout and metadata
  error.tsx                        Root error boundary
  sitemap.ts                       Sitemap generation
  channels/
    page.tsx                       Channels page
    error.tsx                      Channels error boundary
  movies/
    page.tsx                       Movies and series page
    error.tsx                      Movies error boundary
  match/[id]/
    page.tsx                       Match detail page and metadata
    error.tsx                      Match detail error boundary
  api/
    hls-proxy/route.ts             HTTP HLS proxy for selected channel streams
    media/search/route.ts          TMDB movie/TV search endpoint
    media/tv/[id]/route.ts         TMDB TV season metadata endpoint
    scores/[sport]/route.ts        Live score endpoint
    scores/match/[flashscoreId]/route.ts
                                    Match detail/statistics endpoint
    streams/[source]/[id]/route.ts Stream proxy endpoint for Streamed sources

components/
  AdBlockBanner.tsx                Ad-block notice
  ChannelPlayer.tsx                Channel iframe/HLS player
  ChannelsPageClient.tsx           Channel browser and player layout
  ErrorBoundary.tsx                Client error boundary
  HLSVideoPlayer.tsx               hls.js video player
  MatchCard.tsx                    Match card display
  MatchDetailClient.tsx            Match playback, fallback, stats, and multi-match UI
  MatchJsonLd.tsx                  Match structured data
  MatchListSkeleton.tsx            Loading skeleton for match lists
  MatchListWithSearch.tsx          Home page search, filters, scores, and watch history
  MatchStatsPanel.tsx              Match statistics/events/lineups panel
  MoviesPageClient.tsx             Movie/TV search and embed UI
  MultiMatchView.tsx               Up-to-four match viewing mode
  SiteHeader.tsx                   Top navigation
  Spinner.tsx                      Loading indicator
  StreamList.tsx                   Match stream selector
  StreamPlayer.tsx                 Match iframe player with load-timeout fallback
  Toast.tsx                        Toast notifications

lib/
  api.ts                           Streamed API fetch helpers
  constants.ts                     Cache and timeout constants
  dateUtils.ts                     Client-safe date formatting helpers
  flashscore.ts                    Flashscore scraping/parsing helpers
  matchUtils.ts                    Match normalization helpers
  scoreAliases.ts                  Team alias data for score matching
  scoreUtils.ts                    Score matching helpers
  schemas.ts                       Zod schemas for external API data
  sportMap.ts                      Sport name mapping
  streamSelector.ts                Preferred stream selection
  styles.ts                        Shared inline style helpers
  urlValidation.ts                 Stream URL validation helpers
  useLiveScores.ts                 Live score polling hook
  useMatchStats.ts                 Match detail polling hook
  watchHistory.ts                  Local storage watch history helpers

types/
  api.ts                           Sports, stream, score, and match types
  channels.ts                      Channel catalog types
  movies.ts                        Movie and TV metadata types

public/
  channels.json                    Channel catalog
  noise.svg                        Background texture asset

docs/plans/
  2025-01-01-channels-feature.md   Channels feature planning notes

vitest.config.ts                   Vitest configuration
vitest.setup.ts                    Vitest setup
```

## Testing

Unit tests currently cover stream selection, match normalization, score matching, and Flashscore parsing helpers.

## License

MIT
