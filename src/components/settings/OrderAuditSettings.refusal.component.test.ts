// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
 * BUG-0569 — the audit panel printed the gate's internal field name.
 *
 * A refused order read "Refused on: qty". The toast for that same refusal said
 * "the position size", because it goes through the gate's vocabulary. The panel
 * formatted the refusal itself, so the one screen that records what was sent to
 * an exchange was the one screen speaking in code.
 *
 * The i18n store is mocked over the *real* en.json rather than a hand-written
 * stub. That is the point: the assertion has to hold against the dictionary the
 * app actually ships, including the five field labels this change added.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
import { orderAuditService } from "../../services/orderAuditService";
import { translateRefusal, translateRefusalField, type OrderAttempt, type OrderRefusal } from "../../services/orderGate";

/** The app's `_`, with `{name}` interpolation, over the real dictionary. */
function lookup(key: string, values?: Record<string, string | number>): string {
    const template = key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
    if (template === undefined) return key;
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in values ? String(values[name]) : whole,
    );
}

/** Same lookup, wired to the signature `translateRefusal` expects. */
function t(key: string, options?: { values?: Record<string, string> }): string {
    return lookup(key, options?.values);
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable(t),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import OrderAuditSettings from "./OrderAuditSettings.svelte";

/**
 * A refusal shaped like the ones the gate actually raises.
 *
 * `values` is overridable because a field name and the sentence's slots are
 * independent: `duplicateInFlight` names the field "order" while its sentence
 * fills only `{action}` and `{symbol}`. Passing that through here is what keeps
 * the panel from ever borrowing the toast's wording.
 */
function refusedOn(
    field: string,
    values: Record<string, string> = { field, expected: "BTCUSDT", actual: "ETHUSDT" },
    messageKey = "orderGate.mismatch",
): OrderRefusal {
    return {
        field,
        reason: "mismatch",
        messageKey,
        values,
    };
}

function attempt(refusal: OrderRefusal): OrderAttempt {
    return {
        at: 1_700_000_000_000,
        completedAt: 1_700_000_000_100,
        outcome: "refused",
        endpoint: "/api/v1/futures/orders",
        action: "place-order",
        kind: "open",
        provider: "bitunix",
        accountFingerprint: "abcd…wxyz",
        paperMode: false,
        payload: { symbol: "BTCUSDT", qty: "0.02" },
        checked: [refusal.field],
        refusal,
    };
}

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    orderAuditService.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    // Replace, never stack: two mounted panels in one host would leave the
    // previous refusal line in the DOM for the query below to find.
    if (component) unmount(component as never);
    component = mount(OrderAuditSettings, { target: host }) as never;
    flushSync();
}

/**
 * The panel's own wording, read from the dictionary rather than pasted here.
 * A copy change in `en.json` must not fail this file; a raw key on screen must.
 */
const PREFIX = en.settings.audit.refusedField.replace("{field}", "");

function refusalLine(): string {
    const el = host.querySelector(".refusal-line");
    if (!el) throw new Error("no refusal line rendered");
    return el.textContent ?? "";
}

describe("BUG-0569 — the audit panel names a refusal the way a trader reads it", () => {
    it("shows the translated field, not the internal key", () => {
        // AC 1. This sentence is the bug: before the fix this read
        // "Refused on: qty".
        orderAuditService.record(attempt(refusedOn("qty")));
        render();

        expect(refusalLine()).toBe(`${PREFIX}the position size`);
        expect(refusalLine()).not.toContain("orderGate.fields.");
    });

    it("translates a field the change added a label for", () => {
        // "accountState" reads as an identifier; the trader needs to know which
        // setting refused them.
        orderAuditService.record(attempt(refusedOn("accountState")));
        render();

        expect(refusalLine()).toBe(`${PREFIX}leverage / margin mode`);
    });

    it("falls back to the raw name rather than a dotted key path", () => {
        // AC 2. "takeProfit[0]" is a real field value the gate produces and
        // there is no `orderGate.fields.takeProfit[0]` entry, by design.
        orderAuditService.record(attempt(refusedOn("takeProfit[0]")));
        render();

        expect(refusalLine()).toBe(`${PREFIX}takeProfit[0]`);
        expect(refusalLine()).not.toContain("orderGate.fields");
    });

    it("agrees with the toast about the same refusal", () => {
        // AC 3, as an invariant over the shipped dictionary rather than a spot
        // check: for a representative set of the field names the gate emits,
        // the panel's label has to appear in the sentence the toast shows.
        //
        // The remount per iteration is load-bearing. `orderAuditService`
        // exposes a plain array, not a store, so a panel mounted once would
        // keep showing the first iteration's entry and these assertions would
        // pass against stale data. Do not collapse this into a single mount.
        const fields = [
            "qty",
            "accountState",
            "stopLoss",
            "orderType",
            "effect",
            "tpSlAtEntry",
            "takeProfits",
            "order",
            "takeProfit[0]",
        ];
        for (const field of fields) {
            const refusal = refusedOn(field);
            orderAuditService.clear();
            orderAuditService.record(attempt(refusal));
            render();

            const label = translateRefusalField(field, t);
            expect(refusalLine(), `panel text for "${field}"`).toBe(`${PREFIX}${label}`);
            // The toast's own rendering of the same refusal.
            expect(translateRefusal(refusal, t), `toast text for "${field}"`).toContain(label);
        }
    });

    it("names the field even when the toast sentence has no field slot", () => {
        // `duplicateInFlight` raises field: "order" but its sentence fills only
        // {action} and {symbol} — there is no {field} anywhere in it. The panel
        // reads `refusal.field`, not `values.field`, so it has to resolve the
        // name on its own rather than borrowing the toast's wording.
        const refusal = refusedOn(
            "order",
            { action: "place-order", symbol: "BTCUSDT" },
            "orderGate.duplicateInFlight",
        );
        orderAuditService.record(attempt(refusal));
        render();

        expect(refusalLine()).toBe(`${PREFIX}the order`);
        // The toast has no field slot, so it cannot name the field at all. If
        // this ever starts containing "the order", the two surfaces have
        // started sharing a slot and this test has stopped proving anything.
        expect(translateRefusal(refusal, t)).not.toContain("the order");
    });
});
