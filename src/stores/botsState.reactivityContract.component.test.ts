// @vitest-environment happy-dom
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
 * FEAT-0807 — the projection under a live subscription.
 *
 * `botsState.test.ts` drives the projection from plain code, where an
 * unowned `$derived` re-evaluates on every read and a missing signal
 * dependency is invisible (measured: removing the version-counter reads
 * from `states` left that file green). The sidebar (FEAT-0808) reads the
 * projection inside a mounted component, where the derived is owned and
 * cached until a signal changes — that is the language this file speaks.
 *
 * **This must be a `.component.test.ts`.** Only the `components` Vitest
 * project sets `resolve.conditions: ["browser"]` (`vite.config.ts`), where
 * mounting and effects actually run; the same reads through the server
 * entry never subscribe to anything.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

import { Decimal } from "decimal.js";

import type { RuleDocument } from "../lib/rules/types";
import { RULES_STORAGE_KEY } from "../services/alertEngine/migrateAlertsToRules";
import { recordRuleFiring } from "../services/alertEngine/ruleStateStore";
import { paperExchange, setPaperPriceFeed } from "../services/paperExchange";
import BotsStateProbe from "./botsState.probe.svelte";
import { alertState } from "./alerts.svelte";
import { botsState } from "./botsState.svelte";
import { paperState } from "./paperTrading.svelte";

const HASH = "ab".repeat(32);

function botDocument(id: string, overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 2,
        id,
        name: `bot ${id}`,
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "50000" },
            timeframe: "1h",
        },
        action: { consequence_level: "simulate", order: { side: "buy", size_basis: "percent_of_equity", size: "1" } },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
        ...overrides,
    };
}

function seedBots(...documents: RuleDocument[]): void {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(documents));
    alertState.rulesVersion += 1;
}

/** A bot-stamped market entry into the simulated book (FEAT-0806's stamp). */
async function openAs(botId: string): Promise<void> {
    await paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty: "0.02",
        origin: "bot",
        botId,
        ruleId: botId,
        strategyHash: HASH,
    });
}

let host: HTMLElement;
let probe: ReturnType<typeof mount<BotsStateProbe>>;

function probeText(): string {
    return host.textContent?.trim() ?? "";
}

beforeEach(() => {
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("failureMode", "none");
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("startingBalance", "10000");
    paperState.resetBook();
    paperState.setEnabled(true);
    setPaperPriceFeed(() => new Decimal(50000));

    alertState.unevaluableReport = [];
    botsState.setSubmitting(new Set());

    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    unmount(probe);
    host.remove();
});

describe("FEAT-0807 — the projection under a live subscription", () => {
    it("updates the mounted view when the rule set changes (rulesVersion)", () => {
        seedBots(botDocument("bot-1"));
        probe = mount(BotsStateProbe, { target: host });
        flushSync();
        expect(probeText()).toContain("bot-1:armed:false");

        seedBots(botDocument("bot-1", { enabled: false }));
        flushSync();
        expect(probeText()).toContain("bot-1:paused:false");
    });

    it("updates the mounted view when a firing lands (firingsVersion)", () => {
        seedBots(botDocument("bot-1"));
        probe = mount(BotsStateProbe, { target: host });
        flushSync();
        expect(probeText()).toContain("bot-1:armed:false");

        recordRuleFiring("bot-1", 1);
        alertState.firingsVersion += 1;
        flushSync();
        expect(probeText()).toContain("bot-1:closed:false");
    });

    it("updates the mounted view when the paper book changes — no version bump at all", async () => {
        seedBots(botDocument("bot-1"));
        probe = mount(BotsStateProbe, { target: host });
        flushSync();
        expect(probeText()).toContain("bot-1:armed:false");

        await openAs("bot-1");
        flushSync();
        expect(probeText()).toContain("bot-1:in_position:true");
    });

    it("updates the mounted view when the unevaluable report or the in-flight snapshot changes", () => {
        seedBots(botDocument("bot-1"));
        probe = mount(BotsStateProbe, { target: host });
        flushSync();

        alertState.unevaluableReport = [
            { ruleId: "bot-1", name: "bot bot-1", symbol: "BTCUSDT", reason: "warmup" },
        ];
        flushSync();
        expect(probeText()).toContain("bot-1:blocked:false");

        alertState.unevaluableReport = [];
        botsState.setSubmitting(new Set(["bot-1"]));
        flushSync();
        expect(probeText()).toContain("bot-1:submitting:false");
    });

    it("renders nothing for a book with no bots and stays empty across a book change", async () => {
        probe = mount(BotsStateProbe, { target: host });
        flushSync();
        expect(probeText()).toBe("");

        await openAs("bot-orphan");
        flushSync();
        // The row's owner is not a rule the store lists — the slot index,
        // not the state map, answers "who owns this" (pinned in the unit
        // file). The mounted view stays honest about what it can name.
        expect(probeText()).toBe("");
    });
});
