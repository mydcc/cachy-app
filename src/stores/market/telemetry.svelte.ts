import { browser } from "$app/environment";

export class MarketTelemetry {
  metrics = $state({
    apiLatency: 0,
    wsLatency: 0,
    activeConnections: 0,
    apiCallsLastMinute: 0,
    lastCalcDuration: 0,
    cacheHitRate: 100,
  });

  private telemetryIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (browser) {
      this.telemetryIntervalId = setInterval(() => {
        this.metrics.apiCallsLastMinute = 0;
      }, 60000);
    }
  }

  update(partial: Partial<typeof this.metrics>) {
    this.metrics = { ...this.metrics, ...partial };
  }

  recordApiCall() {
    this.metrics.apiCallsLastMinute++;
  }

  destroy() {
    if (this.telemetryIntervalId) {
      clearInterval(this.telemetryIntervalId);
      this.telemetryIntervalId = null;
    }
  }
}
