/*
 * Copyright (C) 2026 MYDCT
 *
 * Network Monitor
 * Detects connection quality and latency to throttle data intensive operations
 * on poor connections (e.g. Mobile Hotspot).
 */

import { browser } from "$app/environment";

export type ConnectionQuality = "4g" | "3g" | "2g" | "slow-2g";

class NetworkMonitor {
    private connection: any; // Navigator.connection (experimental)

    constructor() {
        if (browser && "connection" in navigator) {
            this.connection = (navigator as any).connection;
            this.connection.addEventListener("change", this.handleChange.bind(this));
        }
    }

    private handleChange() {
        // Dispatch event or just expose properties?
        // For now, poll based access is fine.
    }

    get isLowEndConnection(): boolean {
        if (!this.connection) return false;
        return this.connection.saveData ||
            this.connection.effectiveType === "2g" ||
            this.connection.effectiveType === "slow-2g";
    }

    get estimatedRtt(): number {
        return this.connection ? this.connection.rtt : 0;
    }

    /**
     * returns a multiplier for update intervals based on connection quality.
     * 1.0 = fast/normal
     * 2.0 = 3g
     * 4.0 = 2g
     */
    getThrottleMultiplier(): number {
        if (!this.connection) return 1.0;

        const type = this.connection.effectiveType;
        if (type === "slow-2g") return 4.0;
        if (type === "2g") return 3.0;
        if (type === "3g") return 1.5;

        if (this.connection.saveData) return 2.0;

        return 1.0;
    }
}

export const networkMonitor = new NetworkMonitor();
