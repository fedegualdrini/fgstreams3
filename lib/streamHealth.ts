import { StreamStatus, StreamHealth } from '@/types/api';

export class StreamHealthMonitor {
  private healthMap: Map<string, StreamHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  getStatus(streamId: string): StreamHealth {
    return this.healthMap.get(streamId) || {
      streamId,
      status: 'unknown',
      lastChecked: 0,
      errorCount: 0,
    };
  }

  updateStatus(
    streamId: string,
    status: StreamStatus,
    isWorking: boolean = false
  ): void {
    const existing = this.healthMap.get(streamId) || {
      streamId,
      status: 'unknown',
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
      // Simple HEAD request to check if URL is accessible
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'no-cors', // Handle CORS issues
      });

      clearTimeout(timeoutId);
      this.updateStatus(streamId, 'working', true);
      return 'working';
    } catch (error) {
      const existing = this.getStatus(streamId);
      // If it was working before but now failing, mark as unstable
      // If it was already unstable/offline and still failing, mark as offline
      const newStatus: StreamStatus = 
        existing.status === 'working' ? 'unstable' :
        existing.errorCount >= 2 ? 'offline' : 'unstable';
      this.updateStatus(streamId, newStatus, false);
      return newStatus;
    }
  }

  // Check if an offline stream has recovered
  async checkStreamRecovery(url: string, streamId: string): Promise<boolean> {
    const status = await this.checkStreamHealth(url, streamId);
    const health = this.getStatus(streamId);
    
    // If it's now working and was previously offline, it recovered
    if (status === 'working' && health.lastWorkingTime && health.lastWorkingTime < Date.now() - 60000) {
      return true;
    }
    return status === 'working';
  }

  startPeriodicCheck(
    streams: Array<{ id: string; url: string }>,
    intervalMs: number = 30000 // 30 seconds
  ): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      streams.forEach((stream) => {
        this.checkStreamHealth(stream.url, stream.id);
      });
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
