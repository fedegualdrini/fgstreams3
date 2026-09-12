import { readFile } from 'fs/promises';
import path from 'path';
import type { Channel } from '@/types/channels';
import { isValidStreamUrl } from './urlValidation';

let cached: Channel[] | null = null;

/**
 * Visible channels with at least one playable option. Read once per process —
 * the catalog ships with the build, so it cannot change between requests.
 */
export async function getChannelCatalog(): Promise<Channel[]> {
  if (cached) return cached;

  const filePath = path.join(process.cwd(), 'public', 'channels.json');
  const raw = await readFile(filePath, 'utf-8');
  const all: Channel[] = JSON.parse(raw);

  cached = all.filter(
    (channel) => channel.show && channel.options.some((option) => isValidStreamUrl(option.iframe)),
  );
  return cached;
}
