# Sports Streaming Mirror

A clean, reliable sports streaming web application built with Next.js, focusing on stream reliability, mobile-first UX, and automatic stream selection.

**Live:** [fgstreams3.vercel.app](https://fgstreams3.vercel.app)

## Features

- **Match Listing**: View live and upcoming matches with automatic refresh
- **Stream Health Monitoring**: Real-time status indicators (🟢 Working, 🟡 Unstable, 🔴 Offline)
- **Auto-Fallback Player**: Automatically switches to the next best stream on errors
- **Best Stream Selection**: Intelligently selects the optimal stream based on health, language, and quality
- **Mobile-First Design**: Optimized for mobile browsers with touch-friendly controls
- **Stream Recovery**: Periodically re-checks offline streams and re-enables them when available
- **Multi-Match View**: Watch up to 4 different matches simultaneously

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
npm install
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
│   ├── page.tsx            # Home page (match listing)
│   ├── match/[id]/         # Match detail pages
│   └── layout.tsx          # Root layout
├── components/             # React components
│   ├── MatchCard.tsx       # Match card component
│   ├── MatchDetailClient.tsx  # Match detail client component
│   ├── StreamPlayer.tsx    # Video player component
│   ├── StreamList.tsx      # Stream selection list
│   ├── MultiMatchView.tsx  # Multi-stream watch view
│   └── Toast.tsx           # Toast notifications
├── lib/                    # Utility functions
│   ├── api.ts              # API service layer
│   ├── streamHealth.ts     # Stream health monitoring
│   ├── streamSelector.ts   # Best stream selection logic
│   └── matchUtils.ts       # Match ID & normalization
└── types/
    └── api.ts              # API response types
```

## API Integration

This app uses the [Streamed API](https://streamed.pk/api):

- `/api/matches` – List of sports matches
- `/api/stream/{source}/{id}` – Stream URLs for a match
- `/api/sports` – Available sports categories
- `/api/images/{...}` – Team badges and event posters

## License

MIT
