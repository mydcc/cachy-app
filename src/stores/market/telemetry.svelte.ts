/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
