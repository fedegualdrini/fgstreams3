import { z } from 'zod';

// Runtime validation of the external API responses. The matching TypeScript
// shapes in types/api.ts are written out by hand rather than derived with
// z.infer: `.passthrough()` (we keep unknown upstream fields) adds a string
// index signature to the inferred type, which would leak into every consumer.

const StreamFreeTeamSchema = z.object({
  name: z.string().optional(),
  logo: z.string().nullish(),
}).passthrough();

const StreamFreeSourceListsSchema = z.object({
  sources: z.array(z.string()),
  live_sources: z.array(z.string()),
}).passthrough();

export const StreamFreeMatchSchema = StreamFreeSourceListsSchema.extend({
  id: z.string().optional(),
  name: z.string(),
  category: z.string(),
  league: z.string().nullish(),
  stream_key: z.string(),
  match_timestamp: z.number().nullish(),
  thumbnail_url: z.string().nullish(),
  team1: StreamFreeTeamSchema.nullish(),
  team2: StreamFreeTeamSchema.nullish(),
});

export const StreamFreeStreamsResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  streams: z.array(StreamFreeMatchSchema),
}).passthrough();

export const StreamFreeSourcesResponseSchema = StreamFreeSourceListsSchema.extend({
  stream_key: z.string(),
});

export const StreamFreeCategoriesResponseSchema = z.object({
  categories: z.array(z.string()),
}).passthrough();

const ChannelOptionSchema = z.object({
  name: z.string(),
  iframe: z.string(),
});


// ─── angulismotv feed ────────────────────────────────────────────────────────

const AngulismoChannelSchema = z.object({
  name: z.string(),
  logo: z.string().optional(),
  options: z.array(ChannelOptionSchema).optional(),
}).passthrough();

const AngulismoEventSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  evento: z.string().optional(),
  fecha: z.string().optional(),
  competencia: z.string().optional(),
  logoUrl: z.string().optional(),
  canales: z.array(AngulismoChannelSchema).optional(),
}).passthrough();

export const AngulismoDataSchema = z.object({
  events: z.array(AngulismoEventSchema).default([]),
  channels: z.array(AngulismoChannelSchema).default([]),
}).passthrough();

export type AngulismoData = z.infer<typeof AngulismoDataSchema>;
