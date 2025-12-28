# Sports Streaming Mirror

A clean, reliable sports streaming web application built with Next.js, focusing on stream reliability, mobile-first UX, and automatic stream selection.

## Features

- **Match Listing**: View live and upcoming matches with automatic refresh
- **Stream Health Monitoring**: Real-time status indicators (🟢 Working, 🟡 Unstable, 🔴 Offline)
- **Auto-Fallback Player**: Automatically switches to the next best stream on errors
- **Best Stream Selection**: Intelligently selects the optimal stream based on health, language, and quality
- **Mobile-First Design**: Optimized for mobile browsers with touch-friendly controls
- **Stream Recovery**: Periodically re-checks offline streams and re-enables them when available

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Streamed API** (https://streamed.pk/api)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Home page (match listing)
│   ├── match/[id]/        # Match detail pages
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── MatchCard.tsx      # Match card component
│   ├── MatchDetailClient.tsx  # Match detail client component
│   ├── StreamPlayer.tsx   # Video player component
│   └── StreamList.tsx     # Stream selection list
├── lib/                   # Utility functions
│   ├── api.ts            # API service layer
│   ├── streamHealth.ts   # Stream health monitoring
│   └── streamSelector.ts # Best stream selection logic
└── types/                # TypeScript type definitions
    └── api.ts            # API response types
```

## API Integration

This app uses the Streamed API (https://streamed.pk/api) which provides:
- `/api/matches` - List of sports matches
- `/api/stream/{source}/{id}` - Stream URLs for a match
- `/api/sports` - Available sports categories
- `/api/images/{...}` - Team badges and event posters

## Features in Detail

### Stream Health Monitoring

The app tracks stream health by:
- Periodically checking stream availability
- Tracking last successful playback time
- Monitoring error counts
- Categorizing streams as Working, Unstable, or Offline

### Auto-Fallback System

When a stream fails:
1. Automatically detects the error
2. Switches to the next best available stream
3. Notifies the user (console log, can be enhanced with toast notifications)
4. Continues playback without page reload

### Best Stream Selection

Streams are ranked by:
1. Health status (Working > Unstable > Unknown > Offline)
2. Language preference (English preferred)
3. Quality (HD > SD > lower qualities)
4. Source reliability

## Development Notes

- The app uses Next.js Server Components for initial data fetching
- Client components handle interactive features (player, stream selection)
- Stream health monitoring runs in the browser
- API responses are cached and revalidated periodically

## Future Enhancements

- Filtering and sorting by sport, league, team
- Favorites and personalization
- Multi-stream view for advanced users
- Live match statistics overlay
- Toast notifications for stream switches
- Full-screen playback optimizations

## License

MIT
