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
        logger.log("general", `[ConnectionManager] Instance #${this.instanceId} created.`);
    }

    public registerProvider(name: string, service: ManagedService) {
        this.providers.set(name, service);
        logger.log("general", `[ConnectionManager] Provider registered: ${name}`);
    }

    public registerPolling(service: PollingService) {
        this.pollingService = service;
        logger.log("general", `[ConnectionManager] Polling service registered`);
    }

    /**
     * Performs an atomic switch between providers.
     * Ensures the current one is fully killed before starting the next.
     */
    public async switchProvider(newProvider: string, options: { force?: boolean } = {}) {
        if (this.isDestroying) return;

        const oldProvider = this.activeProvider;
        if (oldProvider === newProvider && !options.force) return;

        logger.log("general", `[ConnectionManager] Switching from ${oldProvider || 'NONE'} to ${newProvider}`);

        this.isDestroying = true;

        try {
            // 1. Kill everything currently running
            await this.killAll();

            // 2. Update active state
            this.activeProvider = newProvider;
            logger.log("general", `[ConnectionManager] Active provider is now: ${this.activeProvider} (Instance #${this.instanceId})`);

            // 3. Start Polling as a safety bridge
            if (this.pollingService) {
                this.pollingService.resumePolling();
            }

            // 4. Initialize NEW Provider
            const service = this.providers.get(newProvider);
            if (service) {
                service.connect(options.force);
            } else {
                logger.warn("general", `[ConnectionManager] Switch failed: Provider ${newProvider} not found`);
            }

        } finally {
            this.isDestroying = false;
        }
    }

    /**
     * Hard kills all connections and timers.
     */
    public async killAll() {
        logger.log("general", `[ConnectionManager] Killing all connections...`);

        // Stop Polling first to prevent it from respawning while we disconnect
        if (this.pollingService) {
            this.pollingService.stopPolling();
        }

        // Destroy all registered providers
        for (const [name, service] of this.providers.entries()) {
            try {
                service.destroy();
            } catch (e) {
                logger.error("general", `[ConnectionManager] Error destroying ${name}`, e);
            }
        }

        marketState.connectionStatus = "disconnected";
    }

    /**
     * Signal from a provider that it is successfully connected.
     */
    public onProviderConnected(name: string) {
        logger.log("general", `[ConnectionManager] ${name} reports SUCCESS. Active is: ${this.activeProvider} (Instance #${this.instanceId})`);
        if (name !== this.activeProvider) {
            logger.warn("general", `[ConnectionManager] Late connection from inactive provider ${name}. Killing it.`);
            this.providers.get(name)?.destroy();
            return;
        }

        logger.log("general", `[ConnectionManager] Provider ${name} is ACTIVE and CONNECTED.`);

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

        logger.warn("general", `[ConnectionManager] Active provider ${name} disconnected. Enabling Fallback-Polling.`);

        // Start Polling as fallback
        if (this.pollingService) {
            this.pollingService.resumePolling();
        }
    }
}

export const connectionManager = new ConnectionManager();
