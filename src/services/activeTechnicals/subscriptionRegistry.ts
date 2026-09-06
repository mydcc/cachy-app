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

/**
 * Reference-counts symbol/timeframe subscriptions for ActiveTechnicalsManager.
 * Decides only *when* monitoring for a key should start or stop; the actual
 * start/stop work (marketWatcher registration, the $effect.root) stays with
 * the caller via the two constructor callbacks, since that logic needs
 * fields (activeEffects, workerState) that belong to the scheduling/execution
 * responsibilities, not to ref-counting.
 */
export class SubscriptionRegistry {
    public readonly subscribers = new Map<string, number>();

    constructor(
        private readonly onFirstRegister: (symbol: string, timeframe: string) => void,
        private readonly onLastUnregister: (symbol: string, timeframe: string) => void,
    ) {}

    register(symbol: string, timeframe: string) {
        if (!symbol || !timeframe) return;

        const key = `${symbol}:${timeframe}`;
        const count = this.subscribers.get(key) || 0;
        this.subscribers.set(key, count + 1);

        if (count === 0) {
            this.onFirstRegister(symbol, timeframe);
        }
    }

    unregister(symbol: string, timeframe: string) {
        if (!symbol || !timeframe) return;

        const key = `${symbol}:${timeframe}`;
        const count = this.subscribers.get(key);

        if (count && count > 0) {
            if (count === 1) {
                this.subscribers.delete(key);
                this.onLastUnregister(symbol, timeframe);
            } else {
                this.subscribers.set(key, count - 1);
            }
        }
    }

    /**
     * Drops all subscriber counts without invoking onLastUnregister —
     * for full teardown where the monitoring effects are torn down anyway
     * and per-key shutdown would only fight the same cleanup.
     */
    clear() {
        this.subscribers.clear();
    }
}
