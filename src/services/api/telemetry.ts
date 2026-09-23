/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Injection ports for the api/* modules (FEAT-0342).
 *
 * Services must not import stores (see the boundary block in
 * eslint.config.js — the allowlist is burn-down only and new paths are
 * never added). The request stack instead reads store state through these
 * ports; the store layer (wired in ../apiService.ts, which predates the
 * rule) supplies the implementations.
 */
export interface RequestTelemetrySink {
  recordApiCall(): void;
  updateTelemetry(telemetry: { apiLatency: number }): void;
}

let telemetrySink: RequestTelemetrySink | null = null;

/** Store layer installs the telemetry sink once at startup (null resets). */
export function setRequestTelemetrySink(
  sink: RequestTelemetrySink | null,
): void {
  telemetrySink = sink;
}

export function getRequestTelemetrySink(): RequestTelemetrySink | null {
  return telemetrySink;
}

let networkLogProvider: () => boolean = () => false;

/** Store layer installs the network-log flag reader once at startup. */
export function setNetworkLogProvider(provider: () => boolean): void {
  networkLogProvider = provider;
}

export function isNetworkLoggingEnabled(): boolean {
  try {
    return networkLogProvider();
  } catch {
    return false;
  }
}
