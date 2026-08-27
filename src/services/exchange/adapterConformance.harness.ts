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

import { bitunixWs } from "../bitunixWs";
import { bitgetWs } from "../bitgetWs";
import type { ExchangeId } from "./types";

/**
 * FEAT-0018 conformance harness.
 *
 * The conformance suite must stay adapter-agnostic: shipping a third exchange
 * must NOT touch `adapterConformance.test.ts`. Every adapter that participates
 * supplies exactly one of these, so the suite drives the transport through the
 * harness instead of branching on `adapter.id`. One map entry per adapter keeps
 * the suite's AC "adding an adapter requires no change to the suite itself".
 */
export interface AdapterTestHarness {
    /** Open the adapter's WebSocket connections — the same path the app uses. */
    connect(force?: boolean): void;
    /** The authenticated socket the suite drives onopen / close against. */
    getPrivateSocket(): WebSocket | null;
    /**
     * Feed the login-success frame the adapter expects so it begins subscribing
     * to private channels. Adapters that log in autonomously leave this a no-op.
     */
    simulateLogin(inject: (raw: string) => void): void;
    /** Timer advance (ms) that guarantees a reconnect has settled. */
    readonly reconnectBackoffMs: number;
}

/** Headroom over the max 30s backoff so a reconnect is guaranteed to fire. */
const RECONNECT_BACKOFF_MS = 35000;

const bitunixHarness: AdapterTestHarness = {
    connect(force?: boolean) {
        // `connect` is public on the service; no visibility bypass required.
        bitunixWs.connect(force);
    },
    getPrivateSocket() {
        // @ts-expect-error bypass private visibility for the conformance suite
        return bitunixWs.wsPrivate as WebSocket | null;
    },
    simulateLogin() {
        // Bitunix opens its private socket and logs in autonomously; the suite
        // injects payloads directly, so no login frame needs to be faked.
    },
    reconnectBackoffMs: RECONNECT_BACKOFF_MS,
};

const bitgetHarness: AdapterTestHarness = {
    connect(force?: boolean) {
        // `connect` is public on the service; no visibility bypass required.
        bitgetWs.connect(force);
    },
    getPrivateSocket() {
        // @ts-expect-error bypass private visibility for the conformance suite
        return bitgetWs.ws as WebSocket | null;
    },
    simulateLogin(inject: (raw: string) => void) {
        inject(JSON.stringify({ event: "login", code: "00000" }));
    },
    reconnectBackoffMs: RECONNECT_BACKOFF_MS,
};

/** One harness per adapter id — the suite reads from this, never the adapters. */
export const adapterTestHarnesses: Record<ExchangeId, AdapterTestHarness> = {
    bitunix: bitunixHarness,
    bitget: bitgetHarness,
};
