/**
 * Single source of truth for the match page's keyboard shortcuts: the key
 * handler matches against it and the help dialog renders from it.
 */
export const SHORTCUTS = [
  { id: 'nextStream', key: 'n', label: 'N', description: 'Next stream' },
  { id: 'fullscreen', key: 'f', label: 'F', description: 'Toggle fullscreen' },
  { id: 'toggleHelp', key: '?', label: '?', description: 'Show/hide shortcuts' },
  { id: 'closeHelp', key: 'escape', label: 'Esc', description: 'Close this panel' },
] as const;

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];
export type ShortcutHandlers = Record<ShortcutId, () => void>;

const PLAYER_SELECTOR = '.detail-player';

export function toggleFullscreen(): void {
  const player = document.querySelector<HTMLElement>(PLAYER_SELECTOR);
  if (!player) return;
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    player.requestFullscreen?.();
  }
}
