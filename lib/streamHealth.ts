import type { StreamStatus, StreamHealth } from '@/types/api';
import { HEALTH_OFFLINE_ERROR_THRESHOLD, HEALTH_CHECK_INTERVAL_MS } from './constants';

export class StreamHealthMonitor {
  private healthMap: Map<string, StreamHealth> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  getStatus(streamId: string): StreamHealth {
    return this.healthMap.get(streamId) || {
      streamId,
      status: 'unknown',
      lastChecked: 0,
      errorCount: 0,
    };
  }

  updateStatus(streamId: string, status: StreamStatus, isWorking = false): void {
    const existing = this.healthMap.get(streamId) || {
      streamId,
      status: 'unknown' as StreamStatus,
      lastChecked: 0,
      errorCount: 0,
    };
    this.healthMap.set(streamId, {
      ...existing,
      status,
      lastChecked: Date.now(),
      lastWorkingTime: isWorking ? Date.now() : existing.lastWorkingTime,
      errorCount: isWorking ? 0 : existing.errorCount + 1,
    });
  }

  async checkStreamHealth(url: string, streamId: string): Promise<StreamStatus> {
    if (!url) {
      this.updateStatus(streamId, 'offline', false);
      return 'offline';
    }
    // no-cors fetch cannot reliably detect server availability — it always "succeeds"
    // with an opaque response even when the server is down. Instead, mark as "working"
    // only when the iframe successfully fires onLoad. Here we check if it worked recently.
    const existing = this.getStatus(streamId);
    const recentlyWorked = existing.lastWorkingTime && (Date.now() - existing.lastWorkingTime) < 5 * 60_000;
    if (recentlyWorked) return existing.status;
    return existing.status === 'unknown' ? 'unknown' : existing.status;
  }

  async checkStreamRecovery(url: string, streamId: string): Promise<boolean> {
    const status = await this.checkStreamHealth(url, streamId);
    const health = this.getStatus(streamId);
    if (status === 'working' && health.lastWorkingTime && health.lastWorkingTime < Date.now() - 60000) {
      return true;
    }
    return status === 'working';
  }

  clearHealthEntry(streamId: string): void {
    this.healthMap.delete(streamId);
  }

  clearAllEntries(): void {
    this.healthMap.clear();
  }

  startPeriodicCheck(streams: Array<{ id: string; url: string }>, intervalMs = HEALTH_CHECK_INTERVAL_MS): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      streams.forEach(({ id, url }) => this.checkStreamHealth(url, id));
    }, intervalMs);
  }

  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const streamHealthMonitor = new StreamHealthMonitor();
