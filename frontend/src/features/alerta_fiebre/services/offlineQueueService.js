const QUEUE_KEY = 'bovinotech_offline_telemetry_queue';

export const offlineQueueService = {
  getQueue() {
    try {
      const data = localStorage.getItem(QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  enqueue(telemetry) {
    const queue = this.getQueue();
    const item = {
      ...telemetry,
      queued_at: new Date().toISOString(),
      client_event_id: telemetry.client_event_id || crypto.randomUUID(),
    };
    queue.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return item;
  },

  clear() {
    localStorage.removeItem(QUEUE_KEY);
  },

  async syncQueue(sendTelemetryFn) {
    const queue = this.getQueue();
    if (queue.length === 0) return { synced: 0, failed: 0 };

    const remaining = [];
    let synced = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        await sendTelemetryFn(item);
        synced++;
      } catch {
        remaining.push(item);
        failed++;
      }
    }

    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return { synced, failed, remaining: remaining.length };
  },
};

export default offlineQueueService;
