/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Bitunix WebSocket Diagnostic Tool
 * 
 * This tool provides comprehensive diagnostics for the Bitunix WebSocket data pipeline
 * to identify "Silent Failure" scenarios where data flow halts despite an established connection.
 * 
 * Usage: Open browser console and run `diagnoseCachy()`
 * 
 * The tool monitors three critical stages:
 * 1. Network Ingress - Raw WebSocket packet reception
 * 2. Validation/Parsing - Zod schema validation and Fast Path processing
 * 3. State Reactivity - MarketManager flush and state updates
 */

import { marketState } from "../stores/market.svelte";
import { settingsState } from "../stores/settings.svelte";

interface DiagnosticStats {
  networkPacketsReceived: number;
  lastPacketTime: number;
  lastPacketSize: number;
  wsReadyState: number | null;
  marketConnectionStatus: string;
  throttleHits: number;
  throttlePasses: number;
  validationErrors: number;
  lastValidationError: string | null;
  flushExecutions: number;
  lastFlushTime: number;
  pendingUpdatesSize: number;
  lastUpdateTimestamp: number;
  apiKeyPresent: boolean;
  apiSecretPresent: boolean;
}

class BitunixDiagnostics {
  private stats: DiagnosticStats = {
    networkPacketsReceived: 0,
    lastPacketTime: 0,
    lastPacketSize: 0,
    wsReadyState: null,
    marketConnectionStatus: "unknown",
    throttleHits: 0,
    throttlePasses: 0,
    validationErrors: 0,
    lastValidationError: null,
    flushExecutions: 0,
    lastFlushTime: 0,
    pendingUpdatesSize: 0,
    lastUpdateTimestamp: 0,
    apiKeyPresent: false,
    apiSecretPresent: false,
  };

  private originalOnMessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
  private isMonkeyPatched = false;

  constructor() {
    this.checkApiCredentials();
  }

  /**
   * Start monitoring the WebSocket data pipeline
   */
  start() {
    console.log("[DIAGNOSTIC] Starting Bitunix WebSocket diagnostics...");
    this.monkeyPatchWebSocket();
    this.attachMarketStateMonitor();
    console.log("[DIAGNOSTIC] Diagnostics active. Run diagnoseCachy() to view results.");
  }

  /**
   * Stop monitoring and restore original WebSocket behavior
   */
  stop() {
    console.log("[DIAGNOSTIC] Stopping diagnostics...");
    this.restoreWebSocket();
  }

  /**
   * Monkey-patch WebSocket.prototype.onmessage to intercept raw network packets
   */
  private monkeyPatchWebSocket() {
    if (this.isMonkeyPatched) {
      console.warn("[DIAGNOSTIC] WebSocket already patched, skipping.");
      return;
    }

    const self = this;
    const OriginalWebSocket = WebSocket;
    const originalSend = WebSocket.prototype.send;

    // Store original descriptor
    const onmessageDescriptor = Object.getOwnPropertyDescriptor(
      WebSocket.prototype,
      "onmessage"
    );

    // Intercept WebSocket creation to track instances
    const wsInstances = new WeakSet<WebSocket>();

    // Wrap send to track active sockets
    WebSocket.prototype.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      wsInstances.add(this);
      return originalSend.call(this, data);
    };

    // Intercept onmessage setter
    Object.defineProperty(WebSocket.prototype, "onmessage", {
      get() {
        return this._diagnosticOnMessage || null;
      },
      set(handler: ((this: WebSocket, ev: MessageEvent) => any) | null) {
        this._diagnosticOnMessage = handler;

        // Wrap the handler to intercept messages
        this._actualOnMessage = function (event: MessageEvent) {
          // Only track Bitunix WebSocket (check URL)
          if (this.url && this.url.includes("bitunix.com")) {
            self.stats.networkPacketsReceived++;
            self.stats.lastPacketTime = Date.now();
            self.stats.lastPacketSize = event.data?.length || 0;
            self.stats.wsReadyState = this.readyState;

            console.debug(
              `[DIAGNOSTIC] Network packet received: ${self.stats.lastPacketSize} bytes, readyState=${this.readyState}`
            );
          }

          // Call original handler
          if (handler) {
            handler.call(this, event);
          }
        };

        // Set the wrapped handler
        this.addEventListener("message", this._actualOnMessage);
      },
      configurable: true,
    });

    this.isMonkeyPatched = true;
    console.log("[DIAGNOSTIC] WebSocket monkey-patched successfully.");
  }

  /**
   * Restore original WebSocket behavior
   */
  private restoreWebSocket() {
    if (!this.isMonkeyPatched) return;

    // Note: Full restoration requires page reload due to prototype modifications
    console.warn(
      "[DIAGNOSTIC] WebSocket monkey-patch cannot be fully removed without page reload."
    );
    console.warn("[DIAGNOSTIC] Please reload the page to restore original behavior.");
  }

  /**
   * Attach monitors to MarketManager state
   */
  private attachMarketStateMonitor() {
    // Monitor connection status
    const checkStatus = () => {
      this.stats.marketConnectionStatus = marketState.connectionStatus;
    };

    setInterval(checkStatus, 1000);
    checkStatus();
  }

  /**
   * Check if API credentials are present
   */
  private checkApiCredentials() {
    try {
      const apiKey = settingsState.apiKeys?.bitunix?.key;
      const apiSecret = settingsState.apiKeys?.bitunix?.secret;

      this.stats.apiKeyPresent = !!(apiKey && apiKey.length > 0);
      this.stats.apiSecretPresent = !!(apiSecret && apiSecret.length > 0);
    } catch (e) {
      console.error("[DIAGNOSTIC] Error checking API credentials:", e);
    }
  }

  /**
   * Update throttle statistics (called from instrumented code)
   */
  recordThrottle(passed: boolean) {
    if (passed) {
      this.stats.throttlePasses++;
    } else {
      this.stats.throttleHits++;
    }
  }

  /**
   * Record validation error (called from instrumented code)
   */
  recordValidationError(error: string) {
    this.stats.validationErrors++;
    this.stats.lastValidationError = error;
  }

  /**
   * Record flush execution (called from instrumented code)
   */
  recordFlush(pendingSize: number) {
    this.stats.flushExecutions++;
    this.stats.lastFlushTime = Date.now();
    this.stats.pendingUpdatesSize = pendingSize;
  }

  /**
   * Record state update (called from instrumented code)
   */
  recordUpdate(timestamp: number) {
    this.stats.lastUpdateTimestamp = timestamp;
  }

  /**
   * Generate diagnostic report
   */
  generateReport(): string {
    const now = Date.now();
    const timeSinceLastPacket = this.stats.lastPacketTime
      ? now - this.stats.lastPacketTime
      : Infinity;
    const timeSinceLastFlush = this.stats.lastFlushTime
      ? now - this.stats.lastFlushTime
      : Infinity;

    const report = `
╔═══════════════════════════════════════════════════════════════════════════╗
║                    BITUNIX WEBSOCKET DIAGNOSTICS                          ║
╚═══════════════════════════════════════════════════════════════════════════╝

┌─ NETWORK INGRESS ─────────────────────────────────────────────────────────┐
│ Packets Received:        ${this.stats.networkPacketsReceived.toString().padStart(8)}                                      │
│ Last Packet Size:        ${this.stats.lastPacketSize.toString().padStart(8)} bytes                                 │
│ Time Since Last Packet: ${this.formatDuration(timeSinceLastPacket).padStart(8)}                                 │
│ WebSocket readyState:    ${this.formatReadyState(this.stats.wsReadyState).padStart(8)}                                 │
│ Market Status:           ${this.stats.marketConnectionStatus.padStart(8)}                                 │
└───────────────────────────────────────────────────────────────────────────┘

┌─ VALIDATION & PARSING ────────────────────────────────────────────────────┐
│ Throttle Passes:         ${this.stats.throttlePasses.toString().padStart(8)}                                      │
│ Throttle Hits:           ${this.stats.throttleHits.toString().padStart(8)}                                      │
│ Throttle Rate:           ${this.calculateThrottleRate().padStart(8)}                                 │
│ Validation Errors:       ${this.stats.validationErrors.toString().padStart(8)}                                      │
│ Last Validation Error:   ${this.truncate(this.stats.lastValidationError || "None", 40).padEnd(40)} │
└───────────────────────────────────────────────────────────────────────────┘

┌─ STATE REACTIVITY ────────────────────────────────────────────────────────┐
│ Flush Executions:        ${this.stats.flushExecutions.toString().padStart(8)}                                      │
│ Time Since Last Flush:   ${this.formatDuration(timeSinceLastFlush).padStart(8)}                                 │
│ Pending Updates Size:    ${this.stats.pendingUpdatesSize.toString().padStart(8)}                                      │
│ Last Update Timestamp:   ${this.formatTimestamp(this.stats.lastUpdateTimestamp).padEnd(40)} │
└───────────────────────────────────────────────────────────────────────────┘

┌─ AUTHENTICATION ──────────────────────────────────────────────────────────┐
│ API Key Present:         ${(this.stats.apiKeyPresent ? "✓ Yes" : "✗ No").padStart(8)}                                      │
│ API Secret Present:      ${(this.stats.apiSecretPresent ? "✓ Yes" : "✗ No").padStart(8)}                                      │
└───────────────────────────────────────────────────────────────────────────┘

┌─ DIAGNOSIS ───────────────────────────────────────────────────────────────┐
${this.generateDiagnosis()}
└───────────────────────────────────────────────────────────────────────────┘

Run diagnoseCachy() again to refresh this report.
`;

    return report;
  }

  /**
   * Generate diagnosis based on collected stats
   */
  private generateDiagnosis(): string {
    const issues: string[] = [];
    const now = Date.now();

    // Check network ingress
    if (this.stats.networkPacketsReceived === 0) {
      issues.push("│ ⚠ NO NETWORK PACKETS RECEIVED                                            │");
      issues.push("│   → Check WebSocket connection to wss://fapi.bitunix.com                │");
      issues.push("│   → Verify network connectivity and firewall settings                   │");
    } else if (now - this.stats.lastPacketTime > 30000) {
      issues.push("│ ⚠ NO RECENT NETWORK PACKETS (>30s)                                       │");
      issues.push("│   → WebSocket may be stale or disconnected                              │");
    }

    // Check WebSocket state mismatch
    if (
      this.stats.wsReadyState !== null &&
      this.stats.wsReadyState !== WebSocket.OPEN &&
      this.stats.marketConnectionStatus === "connected"
    ) {
      issues.push("│ ⚠ CONNECTION STATUS MISMATCH                                             │");
      issues.push(`│   → Market shows '${this.stats.marketConnectionStatus}' but WebSocket readyState=${this.stats.wsReadyState}     │`);
    }

    // Check throttling
    const throttleRate = this.stats.throttleHits / Math.max(1, this.stats.throttleHits + this.stats.throttlePasses);
    if (throttleRate > 0.95 && this.stats.throttleHits > 100) {
      issues.push("│ ⚠ AGGRESSIVE THROTTLING DETECTED (>95%)                                  │");
      issues.push("│   → Most updates are being blocked by shouldThrottle()                  │");
      issues.push("│   → Check UPDATE_INTERVAL setting in bitunixWs.ts                       │");
    }

    // Check validation errors
    if (this.stats.validationErrors > 10) {
      issues.push("│ ⚠ MULTIPLE VALIDATION ERRORS DETECTED                                    │");
      issues.push("│   → Zod schema may not match current API response format                │");
      issues.push("│   → Check console for [DIAGNOSTIC] Zod error details                    │");
      issues.push("│   → Update bitunixValidation.ts schemas if needed                       │");
    }

    // Check flush mechanism
    if (this.stats.flushExecutions === 0 && this.stats.networkPacketsReceived > 0) {
      issues.push("│ ⚠ FLUSH NEVER EXECUTED                                                   │");
      issues.push("│   → flushIntervalId may be stopped or cleared                           │");
      issues.push("│   → Check MarketManager constructor and destroy() calls                 │");
    } else if (now - this.stats.lastFlushTime > 5000 && this.stats.lastFlushTime > 0) {
      issues.push("│ ⚠ FLUSH STALLED (>5s since last flush)                                   │");
      issues.push("│   → flushIntervalId may have been cleared                               │");
    }

    // Check pending updates
    if (this.stats.pendingUpdatesSize > 100) {
      issues.push("│ ⚠ LARGE PENDING UPDATES QUEUE                                            │");
      issues.push("│   → Updates are accumulating but not being flushed                      │");
      issues.push("│   → Check flushUpdates() execution                                      │");
    }

    // Check authentication
    if (!this.stats.apiKeyPresent || !this.stats.apiSecretPresent) {
      issues.push("│ ⚠ API CREDENTIALS MISSING                                                │");
      issues.push("│   → Private WebSocket cannot authenticate                               │");
      issues.push("│   → Add API key/secret in settings                                      │");
    }

    // All clear
    if (issues.length === 0) {
      issues.push("│ ✓ All systems operational                                                │");
      issues.push("│   → Network packets are being received                                  │");
      issues.push("│   → Validation is passing                                               │");
      issues.push("│   → State updates are flushing regularly                                │");
    }

    return issues.join("\n");
  }

  /**
   * Format duration in human-readable form
   */
  private formatDuration(ms: number): string {
    if (ms === Infinity || ms < 0) return "Never";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  /**
   * Format WebSocket readyState
   */
  private formatReadyState(state: number | null): string {
    if (state === null) return "Unknown";
    switch (state) {
      case WebSocket.CONNECTING:
        return "CONNECTING(0)";
      case WebSocket.OPEN:
        return "OPEN(1)";
      case WebSocket.CLOSING:
        return "CLOSING(2)";
      case WebSocket.CLOSED:
        return "CLOSED(3)";
      default:
        return `Unknown(${state})`;
    }
  }

  /**
   * Format timestamp
   */
  private formatTimestamp(ts: number): string {
    if (!ts) return "Never";
    return new Date(ts).toLocaleTimeString();
  }

  /**
   * Calculate throttle rate as percentage
   */
  private calculateThrottleRate(): string {
    const total = this.stats.throttleHits + this.stats.throttlePasses;
    if (total === 0) return "N/A";
    const rate = (this.stats.throttleHits / total) * 100;
    return `${rate.toFixed(1)}%`;
  }

  /**
   * Truncate string to max length
   */
  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + "...";
  }
}

// Global singleton instance
let diagnosticInstance: BitunixDiagnostics | null = null;

/**
 * Main diagnostic function exposed to browser console
 */
export function diagnoseCachy() {
  if (!diagnosticInstance) {
    diagnosticInstance = new BitunixDiagnostics();
    diagnosticInstance.start();
  }

  const report = diagnosticInstance.generateReport();
  console.log(report);
  return report;
}

/**
 * Stop diagnostics
 */
export function stopDiagnostics() {
  if (diagnosticInstance) {
    diagnosticInstance.stop();
    diagnosticInstance = null;
  }
}

/**
 * Export for instrumented code to call
 */
export function getDiagnosticInstance(): BitunixDiagnostics | null {
  return diagnosticInstance;
}

// Expose to window for browser console access
if (typeof window !== "undefined") {
  (window as any).diagnoseCachy = diagnoseCachy;
  (window as any).stopDiagnostics = stopDiagnostics;
}
