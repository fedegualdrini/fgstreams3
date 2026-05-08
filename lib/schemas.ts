import { z } from 'zod';

// Zod schemas mirror the TypeScript interfaces in types/api.ts and types/channels.ts,
// providing runtime validation of external API responses.

export const RawStreamSchema = z.object({
  url: z.string().optional(),
  embedUrl: z.string().optional(),
  language: z.string().optional(),
  hd: z.boolean().optional(),
  quality: z.string().optional(),
  source: z.string().optional(),
}).passthrough();

export const RawMatchSourceSchema = z.object({
  source: z.string(),
  id: z.string(),
});

const TeamInfoSchema = z.object({
  name: z.string().optional(),
  badge: z.string().optional(),
}).passthrough();

export const RawMatchSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  category: z.string().optional(),
  date: z.union([z.number(), z.string()]).optional(),
  time: z.string().optional(),
  teams: z.object({
    home: TeamInfoSchema.optional(),
    away: TeamInfoSchema.optional(),
  }).optional(),
  sources: z.array(RawMatchSourceSchema).optional(),
  sport: z.string().optional(),
  league: z.string().optional(),
  tournament: z.string().optional(),
  competition: z.string().optional(),
  team1: z.string().optional(),
  team2: z.string().optional(),
  startTime: z.string().optional(),
  start_time: z.string().optional(),
  isLive: z.boolean().optional(),
  is_live: z.boolean().optional(),
  live: z.boolean().optional(),
  image1: z.string().optional(),
  image2: z.string().optional(),
  homeImage: z.string().optional(),
  awayImage: z.string().optional(),
  team1Image: z.string().optional(),
  team2Image: z.string().optional(),
  poster: z.string().optional(),
  posterImage: z.string().optional(),
  posterUrl: z.string().optional(),
}).passthrough();

export const ChannelOptionSchema = z.object({
  name: z.string(),
  iframe: z.string(),
});

export const ChannelSchema = z.object({
  name: z.string(),
  logo: z.string(),
  options: z.array(ChannelOptionSchema),
  show: z.boolean(),
});

export const SportSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),  // not always present in the API response
}).passthrough();

export const RawStreamArraySchema = z.array(RawStreamSchema);
export const RawMatchArraySchema = z.array(RawMatchSchema);
export const SportArraySchema = z.array(SportSchema);
export const ChannelArraySchema = z.array(ChannelSchema);
