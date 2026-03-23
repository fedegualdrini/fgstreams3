import type { StreamStatus, StreamHealth } from '@/types/api';
import { HEALTH_OFFLINE_ERROR_THRESHOLD } from './constants';

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
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch(url, { method: 'HEAD', signal: controller.signal, mode: 'no-cors' });
      clearTimeout(timeoutId);
      this.updateStatus(streamId, 'working', true);
      return 'working';
    } catch {
      const existing = this.getStatus(streamId);
      const newStatus: StreamStatus =
        existing.status === 'working' ? 'unstable' : existing.errorCount >= HEALTH_OFFLINE_ERROR_THRESHOLD ? 'offline' : 'unstable';
      this.updateStatus(streamId, newStatus, false);
      return newStatus;
    }
  }

  async checkStreamRecovery(url: string, streamId: string): Promise<boolean> {
    const status = await this.checkStreamHealth(url, streamId);
    const health = this.getStatus(streamId);
    if (status === 'working' && health.lastWorkingTime && health.lastWorkingTime < Date.now() - 60000) {
      return true;
    }
    return status === 'working';
  }

  startPeriodicCheck(streams: Array<{ id: string; url: string }>, intervalMs = 30000): void {
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
