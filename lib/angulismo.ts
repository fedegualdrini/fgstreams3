import type { AngulismoEvent, AngulismoSnapshot } from '@/types/api';
import type { Channel, ChannelOption } from '@/types/channels';
import { AngulismoDataSchema } from './schemas';
import { isValidStreamUrl } from './urlValidation';
import { ANGULISMO_TIMEOUT_MS, REVALIDATE_ANGULISMO } from './constants';

/**
 * angulismotv.pages.dev is driven entirely by one JSON file, which it fetches
 * from a public repository. That file is the useful part: it pairs each fixture
 * with the channels carrying it *and* the iframe URLs that actually play them.
 *
 * It matters for two reasons:
 *  - `channels` keeps our own catalog from rotting. public/channels.json was
 *    snapshotted from this same feed and its mirrors have since moved, so the
 *    live copy is merged over it at runtime.
 *  - `events` gives a broadcaster mapping that already includes playable URLs,
 *    where Promiedos only gives a name we then have to resolve ourselves.
 *
 * It is someone else's repository, so every failure degrades to "no extra
 * data" and never to a broken page.
 */

const DATA_URL =
  'https://raw.githubusercontent.com/tadeoallende/repos-web/refs/heads/main/datos.json';

/**
 * Fixture times are published as Argentina local wall-clock. Unlike Promiedos
 * this is a static file served byte-identically everywhere, so the offset is a
 * property of the data rather than of the viewer.
 */
const ARGENTINA_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "2026-09-12 20:00:00" → epoch ms. */
export function parseAngulismoDate(value: string | undefined): number {
  if (!value) return NaN;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return NaN;
  const [, year, month, day, hour, minute, second] = m;
  return (
    Date.UTC(
      Number(year), Number(month) - 1, Number(day),
      Number(hour), Number(minute), Number(second ?? 0),
    ) + ARGENTINA_UTC_OFFSET_MS
  );
}

/**
 * Split "Liga Profesional: Talleres Córdoba vs. Unión Santa Fe" into its two
 * teams. The competition prefix is dropped — it is already a separate field,
 * and leaving it in would pollute the team tokens used for matching.
 */
export function parseEventTitle(title: string): { home: string; away: string } | null {
  const withoutCompetition = title.replace(/^[^:]{1,40}:\s*/, '').trim();
  const parts = withoutCompetition.split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) return null;

  const home = parts[0].trim();
  const away = parts[1].trim();
  return home && away ? { home, away } : null;
}

function toChannel(raw: { name: string; logo?: string; options?: ChannelOption[] }): Channel | null {
  const options = (raw.options ?? []).filter(option => isValidStreamUrl(option.iframe));
  if (options.length === 0) return null;
  return { name: raw.name, logo: raw.logo ?? '', options, show: true };
}

/** Parse the raw feed. Exported for tests; `fetchAngulismoData` is the entry point. */
export function parseAngulismoData(payload: unknown): Omit<AngulismoSnapshot, 'ok' | 'stale'> {
  const result = AngulismoDataSchema.safeParse(payload);
  if (!result.success) {
    console.warn('angulismo: unexpected response shape:', result.error.issues.slice(0, 3));
    return { events: [], channels: [] };
  }

  const channels = result.data.channels
    .map(toChannel)
    .filter((channel): channel is Channel => channel !== null);

  const events: AngulismoEvent[] = [];
  for (const raw of result.data.events) {
    const teams = parseEventTitle(raw.evento ?? '');
    // Non-fixture entries (a race, a fight card) have no two teams to match on.
    if (!teams) continue;

    const startTimeMs = parseAngulismoDate(raw.fecha);
    if (!Number.isFinite(startTimeMs)) continue;

    const eventChannels = (raw.canales ?? [])
      .map(canal => toChannel({ name: canal.name, logo: raw.logoUrl, options: canal.options }))
      .filter((channel): channel is Channel => channel !== null);
    if (eventChannels.length === 0) continue;

    events.push({
      id: String(raw.id ?? `${teams.home}-${teams.away}-${startTimeMs}`),
      title: raw.evento ?? '',
      competition: raw.competencia ?? '',
      homeTeam: teams.home,
      awayTeam: teams.away,
      startTimeMs,
      channels: eventChannels,
    });
  }

  return { events, channels };
}

// Last good payload, reused when a refresh fails so one bad response cannot
// blank the feed on a warm instance.
let lastGood: Omit<AngulismoSnapshot, 'ok' | 'stale'> | null = null;

export async function fetchAngulismoData(): Promise<AngulismoSnapshot> {
  try {
    const response = await fetch(DATA_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(ANGULISMO_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_ANGULISMO },
    });
    if (!response.ok) throw new Error(`responded ${response.status}`);

    const parsed = parseAngulismoData(await response.json());
    // A structurally valid but empty payload means the shape moved under us;
    // the previous copy is better than nothing.
    if (parsed.events.length === 0 && parsed.channels.length === 0) {
      throw new Error('payload contained no usable events or channels');
    }

    lastGood = parsed;
    return { ...parsed, ok: true, stale: false };
  } catch (error) {
    console.error('angulismo: failed to load feed:', error);
    if (lastGood) return { ...lastGood, ok: true, stale: true };
    return { events: [], channels: [], ok: false, stale: false };
  }
}
