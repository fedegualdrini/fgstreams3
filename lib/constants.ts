// API revalidation windows (seconds)
export const REVALIDATE_MATCHES = 30;
export const REVALIDATE_STREAMS = 60;
export const REVALIDATE_SPORTS = 3600;

// Stream health thresholds
export const HEALTH_CHECK_INTERVAL_MS = 30_000;
export const HEALTH_RECOVERY_INTERVAL_MS = 60_000;
export const HEALTH_OFFLINE_ERROR_THRESHOLD = 2;

// Stream status display config
export const STREAM_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  working:  { color: '#22c55e', label: 'Live'     },
  unstable: { color: '#f59e0b', label: 'Unstable' },
  offline:  { color: '#ef4444', label: 'Offline'  },
  unknown:  { color: '#6b7280', label: 'Unknown'  },
};
