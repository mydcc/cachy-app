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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";
import type { OMSPosition } from "../../services/omsTypes";

const settings = vi.hoisted(() => ({
    positionViewMode: "detailed" as "detailed" | "focus",
    pnlViewMode: "value" as "value" | "percent" | "bar",
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("../../stores/tpsl.svelte", () => ({
    tpSlState: {
        hasPlansFor: vi.fn(() => false),
        plansFor: vi.fn(() => ({})),
    },
}));

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string, options?: { values?: Record<string, unknown> }) => {
            const template = lookup(key) ?? key;
            if (!options?.values) return template;
            return Object.entries(options.values).reduce(
                (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
                template,
            );
        }),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import PositionsList from "./PositionsList.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    settings.positionViewMode = "detailed";
    settings.pnlViewMode = "value";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

async function settle(rounds = 4) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

describe("BUG-0211 — Position details rendered inline without hover delay", () => {
    const SAMPLE_POSITION: OMSPosition = {
        symbol: "BTCUSDT",
        side: "long",
        amount: new Decimal("0.5"),
        entryPrice: new Decimal("64000"),
        markPrice: new Decimal("65000"),
        unrealizedPnl: new Decimal("500"),
        leverage: new Decimal("10"),
        marginMode: "cross",
        liquidationPrice: new Decimal("58000"),
        margin: new Decimal("3200"),
        marginRate: new Decimal("0.025"),
        realizedPnl: new Decimal("25"),
    };

    it("renders margin mode, liquidation price, size and prices directly in the card", async () => {
        component = mount(PositionsList, {
            target: host,
            props: { positions: [SAMPLE_POSITION] },
        }) as never;
        await settle();

        const text = host.textContent || "";

        // Symbol, side/leverage, margin mode badge
        expect(text).toContain("BTCUSDT");
        expect(text).toContain("10x");
        expect(text).toContain("cross");

        // Financial details visible inline without hovering
        expect(text).toContain("0.5"); // size
        expect(text).toContain("64000"); // entry
        expect(text).toContain("65000"); // mark
        expect(text).toContain("3200"); // margin
        expect(text).toContain("58000"); // liquidation price
        expect(text).toContain("2.5%"); // margin rate
        expect(text).toContain("+25"); // realized pnl
    });

    it("displays '-' when liquidation price is missing or zero", async () => {
        const posWithoutLiq: OMSPosition = {
            ...SAMPLE_POSITION,
            liquidationPrice: undefined,
        };

        component = mount(PositionsList, {
            target: host,
            props: { positions: [posWithoutLiq] },
        }) as never;
        await settle();

        const text = host.textContent || "";
        expect(text).toContain("Liq.:");
        expect(text).toContain("-");
    });
});
