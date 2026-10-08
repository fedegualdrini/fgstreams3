/**
 * The one place server code writes to the console. Every line reads
 * `scope: message`, with any error or detail object passed through as a
 * trailing argument so the runtime still prints its stack / structure.
 *
 *   const log = createLogger('promiedos');
 *   log.warn('page responded 503', { path });   // promiedos: page responded 503 { path: ... }
 */
export interface Logger {
  /** Degraded but handled: the caller is falling back to something. */
  warn(message: string, ...details: unknown[]): void;
  /** A real failure the caller is swallowing; there is no better data to serve. */
  error(message: string, ...details: unknown[]): void;
}

export function createLogger(scope: string): Logger {
  return {
    warn: (message, ...details) => console.warn(`${scope}: ${message}`, ...details),
    error: (message, ...details) => console.error(`${scope}: ${message}`, ...details),
  };
}
