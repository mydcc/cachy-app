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
 * FEAT-0227 — subscription reference counting, in one place, above the
 * adapters.
 *
 * It used to live inside each venue's WebSocket service, where the same
 * `Map<subKey, count>` was written twice (bitunixWs, bitgetWs) and read from
 * the outside by `subscriptionRegistry`, which therefore had to know that
 * Bitunix was the special one. FIX, nautilus_trader and CCXT Pro all put the
 * wire half in the venue adapter and the counting half above it, for the
 * reason this file exists: "who wants BTCUSDT" is a consumer question, "how
 * this venue is told to subscribe" is a venue question.
 *
 * The ledger holds no channel names of its own. It is handed whatever
 * vocabulary the active adapter uses and counts strings.
 */

/** `${channel}:${symbol}` — the key both venues already used. */
export function subscriptionKey(symbol: string, channel: string): string {
    return `${channel}:${symbol}`;
}

/** One venue channel wanted for one symbol. */
export interface SubscriptionTarget {
    symbol: string;
    channel: string;
}

/** What a reconcile decided the socket must be told. */
export interface SubscriptionDelta {
    subscribe: SubscriptionTarget[];
    unsubscribe: SubscriptionTarget[];
}

function splitKey(key: string): SubscriptionTarget {
    // Channels never contain ":"; symbols are not guaranteed to be so kind.
    const separator = key.indexOf(":");
    return { channel: key.slice(0, separator), symbol: key.slice(separator + 1) };
}

export class SubscriptionLedger {
    /** How many requirement-expansions want each venue channel. */
    private wanted = new Map<string, number>();

    /**
     * What the *current* socket has been told. Separate from `wanted` because
     * a provider restart empties the socket without changing what consumers
     * want — that gap is the whole reason `resync` exists.
     */
    private issued = new Set<string>();

    /**
     * Replaces what is wanted and reports what the socket must be told.
     *
     * Reconciling wholesale rather than incrementally is deliberate: the
     * previous design tracked deltas and reconstructed the desired set by
     * reading the venue socket's own map, which is how `subscriptionRegistry`
     * ended up knowing that Bitunix was the special one.
     */
    reconcile(intended: Iterable<SubscriptionTarget>): SubscriptionDelta {
        const next = new Map<string, number>();
        for (const target of intended) {
            const key = subscriptionKey(target.symbol, target.channel);
            next.set(key, (next.get(key) ?? 0) + 1);
        }

        const delta: SubscriptionDelta = { subscribe: [], unsubscribe: [] };

        // Issued but no longer wanted by anyone.
        for (const key of this.issued) {
            if (!next.has(key)) {
                delta.unsubscribe.push(splitKey(key));
            }
        }
        for (const target of delta.unsubscribe) {
            this.issued.delete(subscriptionKey(target.symbol, target.channel));
        }

        // Wanted but not currently issued — either newly registered, or the
        // socket was torn down and forgot (see `forgetIssued`).
        for (const key of next.keys()) {
            if (!this.issued.has(key)) {
                this.issued.add(key);
                delta.subscribe.push(splitKey(key));
            }
        }

        this.wanted = next;
        return delta;
    }

    /**
     * Declares that the socket no longer holds anything — called when a
     * provider reconnects or the active venue changes. The counts survive;
     * only the record of what was sent is dropped, so the next reconcile
     * re-issues every wanted channel.
     */
    forgetIssued(): void {
        this.issued.clear();
    }

    /** How many requirement-expansions want this channel. */
    count(symbol: string, channel: string): number {
        return this.wanted.get(subscriptionKey(symbol, channel)) ?? 0;
    }

    /** Whether the current socket has been told about this channel. */
    isIssued(symbol: string, channel: string): boolean {
        return this.issued.has(subscriptionKey(symbol, channel));
    }

    /** Every channel currently issued to the socket. */
    issuedTargets(): SubscriptionTarget[] {
        return Array.from(this.issued, splitKey);
    }

    get wantedSize(): number {
        return this.wanted.size;
    }

    get issuedSize(): number {
        return this.issued.size;
    }

    clear(): void {
        this.wanted.clear();
        this.issued.clear();
    }
}
