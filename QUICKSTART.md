# Quick Start Guide

## Installation & Setup

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000)

## Project Status

### ✅ Completed Features

1. **Project Structure**: Next.js 14 with TypeScript and Tailwind CSS
2. **API Integration**: Complete service layer for Streamed API
3. **Match Listing Page**: 
   - Displays live and upcoming matches
   - Separates matches by status
   - Shows team logos, league info, and match times
4. **Match Detail Page**:
   - Video player with iframe embedding
   - Stream list with health indicators
   - Team information display
5. **Stream Health Monitoring**:
   - Real-time status tracking (Working/Unstable/Offline)
   - Periodic health checks every 30 seconds
6. **Auto-Fallback Player**:
   - Automatically switches to next best stream on error
   - Toast notifications for stream switches
7. **Best Stream Selection**:
   - Intelligent ranking by health, language, quality
   - Prefers English streams and HD quality
8. **Stream Recovery System**:
   - Periodically re-checks offline streams
   - Automatically re-enables recovered streams
9. **Mobile-First Design**:
   - Responsive layout
   - Touch-friendly controls
   - Optimized video player for mobile

### 🚧 Remaining Features (Optional)

- Filtering and sorting by sport, league, team
- Favorites and personalization
- Multi-stream view
- Live match statistics overlay

## Key Files

- `app/page.tsx` - Home page with match listings
- `app/match/[id]/page.tsx` - Match detail page (server component)
- `components/MatchDetailClient.tsx` - Match detail client component
- `components/StreamPlayer.tsx` - Video player with auto-fallback
- `lib/api.ts` - API service layer
- `lib/streamHealth.ts` - Stream health monitoring
- `lib/streamSelector.ts` - Best stream selection logic

## API Integration Notes

The app integrates with Streamed API (https://streamed.pk/api):
- `/api/matches` - Fetches all matches
- `/api/stream/{source}/{id}` - Fetches streams for a match
- `/api/sports` - Available sports (not yet used in UI)

**Note**: The actual API response structure may differ. You may need to adjust the type definitions in `types/api.ts` based on the real API responses.

## Testing

1. Start the dev server: `npm run dev`
2. Navigate to http://localhost:3000
3. Click on a match to view streams
4. Test stream switching and auto-fallback

## Build for Production

```bash
npm run build
npm start
```

## Troubleshooting

- If matches don't load: Check API endpoint availability
- If streams don't play: Verify iframe embedding permissions
- Type errors: May need to adjust API response types in `types/api.ts`
