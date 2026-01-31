/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Copyright (C) 2026 MYDCT
 *
 * Connection Manager
 * Central orchestrator for all data providers and fallback mechanisms.
 */

import { logger } from "./logger";
import { marketState } from "../stores/market.svelte";

export interface ManagedService {
    connect: (force?: boolean) => void;
    destroy: () => void;
}

export interface PollingService {
    stopPolling: () => void;
    resumePolling: () => void;
}

class ConnectionManager {
    private static instanceCount = 0;
    private instanceId = 0;
    private activeProvider: string = "";
    private providers = new Map<string, ManagedService>();
    private pollingService: PollingService | null = null;
    private isDestroying = false;

    constructor() {
        this.instanceId = ++ConnectionManager.instanceCount;
        logger.log("governance", `[ConnectionManager] Instance #${this.instanceId} created.`);
    }

    public registerProvider(name: string, service: ManagedService) {
        this.providers.set(name, service);
        logger.log("governance", `[ConnectionManager] Provider registered: ${name}`);
    }

    public registerPolling(service: PollingService) {
        this.pollingService = service;
        logger.log("governance", `[ConnectionManager] Polling service registered`);
    }

    /**
     * Performs an atomic switch between providers.
     * Ensures the current one is fully killed before starting the next.
     */
    public async switchProvider(newProvider: string, options: { force?: boolean } = {}) {
        if (this.isDestroying) return;

        const oldProvider = this.activeProvider;
        if (oldProvider === newProvider && !options.force) return;

        logger.log("governance", `[ConnectionManager] Switching from ${oldProvider || 'NONE'} to ${newProvider}`);

        this.isDestroying = true;

        try {
            // 1. Kill everything currently running
            await this.killAll();

            // 2. Update active state
            this.activeProvider = newProvider;
            logger.log("governance", `[ConnectionManager] Active provider is now: ${this.activeProvider} (Instance #${this.instanceId})`);

            // 3. Start Polling as a safety bridge
            if (this.pollingService) {
                this.pollingService.resumePolling();
            }

            // 4. Initialize NEW Provider
            const service = this.providers.get(newProvider);
            if (service) {
                service.connect(options.force);
            } else {
                logger.warn("governance", `[ConnectionManager] Switch failed: Provider ${newProvider} not found`);
            }

        } finally {
            this.isDestroying = false;
        }
    }

    /**
     * Hard kills all connections and timers.
     */
    public async killAll() {
        logger.log("governance", `[ConnectionManager] Killing all connections...`);

        // Stop Polling first to prevent it from respawning while we disconnect
        if (this.pollingService) {
            this.pollingService.stopPolling();
        }

        // Destroy all registered providers
        for (const [name, service] of this.providers.entries()) {
            try {
                service.destroy();
            } catch (e) {
                logger.error("governance", `[ConnectionManager] Error destroying ${name}`, e);
            }
        }

        marketState.connectionStatus = "disconnected";
    }

    /**
     * Signal from a provider that it is successfully connected.
     */
    public onProviderConnected(name: string) {
        logger.log("governance", `[ConnectionManager] ${name} reports SUCCESS. Active is: ${this.activeProvider} (Instance #${this.instanceId})`);
        if (name !== this.activeProvider) {
            logger.warn("governance", `[ConnectionManager] Late connection from inactive provider ${name}. Killing it.`);
            this.providers.get(name)?.destroy();
            return;
        }

        logger.log("governance", `[ConnectionManager] Provider ${name} is ACTIVE and CONNECTED.`);

        // Successfully connected? Stop Polling redundant data.
        if (this.pollingService) {
            this.pollingService.stopPolling();
        }
    }

    /**
     * Signal from a provider that it lost connection.
     */
    public onProviderDisconnected(name: string) {
        if (name !== this.activeProvider) return;

        logger.warn("governance", `[ConnectionManager] Active provider ${name} disconnected. Enabling Fallback-Polling.`);

        // Start Polling as fallback
        if (this.pollingService) {
            this.pollingService.resumePolling();
        }
    }
}

export const connectionManager = new ConnectionManager();
