/**
 * Validates that an iframe URL is safe to embed.
 *
 * Rules:
 * - Must be a non-empty string (not the literal "undefined")
 * - Must parse as a valid URL
 * - Must use HTTPS protocol — blocks javascript:, data:, http:, and blob: schemes
 */
export function isSafeIframeUrl(url: string | undefined): boolean {
  if (!url || url === 'undefined') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
