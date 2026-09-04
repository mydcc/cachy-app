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
    // Reconciles desired subscriptions against the live connection. Optional
    // so lightweight test doubles for PollingService don't need to implement it.
    resync?: () => void;
    // Called when every provider has been destroyed, so the subscription
    // ledger knows the sockets now hold nothing (FEAT-0227). Paired with
    // `resync` above: this one says "forget", that one says "reconcile".
    // Optional for the same reason.
    forgetSubscriptions?: () => void;
}

// A tab hidden for less than this is ordinary alt-tabbing: WebSocket
// heartbeats survive it, and forcing a reconnect on every glance away would
// tear down and rebuild subscriptions for nothing. Above it, the browser's
// background-timer throttling (Chrome/Firefox/Safari all do this) can have
// starved the ping/watchdog cycle before it noticed the connection was gone —
// matches the 15s threshold bitunixWs's own monitor loop already uses for the
// same staleness question while the tab is visible.
const HIDDEN_RECONNECT_THRESHOLD_MS = 15_000;

export class ConnectionManager {
    private static instanceCount = 0;
    private instanceId = 0;
    private activeProvider: string = "";
    private providers = new Map<string, ManagedService>();
    private pollingService: PollingService | null = null;
    private isDestroying = false;
    private hiddenAt: number | null = null;

    private handleVisibilityChange = () => {
        this.notifyVisibilityChange(document.visibilityState === "visible");
    };

    private handleFocus = () => {
        this.notifyVisibilityChange(true);
    };

    private handleBlur = () => {
        this.notifyVisibilityChange(false);
    };

    constructor() {
        this.instanceId = ++ConnectionManager.instanceCount;
        logger.log("governance", `[ConnectionManager] Instance #${this.instanceId} created.`);

        // `typeof window` guards both listeners at once, mirroring the check
        // bitunixWs already uses for its own `online`/`offline` listeners —
        // in every real environment `window` implies `document` too.
        if (typeof window !== "undefined") {
            document.addEventListener("visibilitychange", this.handleVisibilityChange);

            // `visibilitychange` covers a hidden/backgrounded *tab*, but a
            // Cachy window that stays the frontmost tab while the whole
            // browser window loses OS focus (e.g. working in another
            // application on a second monitor) never fires it — the same
            // background-timer throttling still applies in that case in some
            // browsers, so `focus`/`blur` feed the identical path.
            window.addEventListener("focus", this.handleFocus);
            window.addEventListener("blur", this.handleBlur);
        }
    }

    /**
     * Reacts to the tab's visibility changing. Exposed separately from the
     * `document` listener above so tests can drive it without a real DOM
     * event (BUG-0217).
     *
     * A background tab throttles `setInterval`/`setTimeout` down to roughly
     * once a minute or suspends them outright, so the socket can die silently
     * while nothing is watching. Coming back to a *long-hidden* tab forces a
     * reconnect of whichever provider is active instead of waiting for the
     * user to notice the offline banner and click "Reconnect" by hand.
     */
    public notifyVisibilityChange(visible: boolean) {
        if (!visible) {
            this.hiddenAt = Date.now();
            return;
        }

        const hiddenAt = this.hiddenAt;
        this.hiddenAt = null;
        // Never hidden this session (or already handled) — nothing to do.
        if (hiddenAt === null) return;

        const hiddenForMs = Date.now() - hiddenAt;
        if (hiddenForMs < HIDDEN_RECONNECT_THRESHOLD_MS) return;
        if (!this.activeProvider) return;

        logger.log(
            "governance",
            `[ConnectionManager] Tab refocused after ${Math.round(hiddenForMs / 1000)}s hidden; forcing reconnect of ${this.activeProvider}.`,
        );
        void this.switchProvider(this.activeProvider, { force: true });
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
        // A switch requested while another is tearing down used to be dropped
        // on the floor. Nothing rescheduled it, and the caller had already
        // recorded the new provider as current — so two rapid switches left
        // the socket authenticated to the account the trader had just left,
        // with nothing pending to correct it. FEAT-0026 makes that reachable
        // by hand: switch, change your mind, switch back.
        //
        // Latest wins: an earlier queued request is simply overwritten, since
        // only the most recent one describes where the user wants to be.
        if (this.isDestroying) {
            this.pendingSwitch = { provider: newProvider, options };
            return;
        }

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

        const queued = this.pendingSwitch;
        if (queued) {
            this.pendingSwitch = null;
            await this.switchProvider(queued.provider, queued.options);
        }
    }

    /**
     * The switch requested while this one was tearing down, if any.
     * Latest-wins, drained in `switchProvider`'s tail.
     */
    private pendingSwitch: {
        provider: string;
        options: { force?: boolean };
    } | null = null;

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

        // Every socket is gone, so whatever the ledger believed it had issued
        // is no longer true. Hooked to the teardown rather than to the next
        // connect on purpose: a plain reconnect keeps its subscription buffer
        // (bitunixWs.cleanup deliberately does not clear it), and re-issuing
        // there would drive the venue's own count up on every reconnect
        // without anything ever bringing it back down.
        this.pollingService?.forgetSubscriptions?.();

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

        // Re-sync desired subscriptions immediately. A provider's own
        // subscription buffer does not survive its destroy()/connect() cycle,
        // but the polling service's registered interest does — without this,
        // a reconnect can leave the socket open yet subscribed to nothing.
        this.pollingService?.resync?.();

        // Deliberately NOT stopping the polling fallback here anymore: it
        // would kill the safety net before we know any data actually
        // arrived. The polling service already skips REST calls per-symbol
        // once its own WS data is fresh, so leaving the loop running is a
        // cheap, continuous safety net rather than a one-shot check at
        // connect time.
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

    /**
     * Teardown method to remove window/document event listeners and clean up internal providers.
     */
    public destroy(): void {
        if (typeof window !== "undefined") {
            document.removeEventListener("visibilitychange", this.handleVisibilityChange);
            window.removeEventListener("focus", this.handleFocus);
            window.removeEventListener("blur", this.handleBlur);
        }

        if (this.pollingService) {
            this.pollingService.stopPolling();
            this.pollingService.forgetSubscriptions?.();
            this.pollingService = null;
        }

        for (const [name, service] of this.providers.entries()) {
            try {
                service.destroy();
            } catch (e) {
                logger.error("governance", `[ConnectionManager] Error destroying ${name}`, e);
            }
        }
        this.providers.clear();
        this.activeProvider = "";
        this.hiddenAt = null;
        this.pendingSwitch = null;
    }
}

export const connectionManager = new ConnectionManager();

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        connectionManager.destroy();
    });
}
