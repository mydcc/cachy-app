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
 * BUG-0513 — the positions list offers a close-all button when its parent
 * wires `oncloseAll`, and none when it does not. The confirmation and the
 * run are the caller's job; this only announces the intent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";

import type { OMSPosition } from "../../services/omsTypes";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({
    positionViewMode: "detailed",
    pnlViewMode: "value",
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("../../stores/tpsl.svelte", () => ({
    tpSlState: { hasPlansFor: () => false, plansFor: () => [] },
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

function position(symbol: string): OMSPosition {
    return {
        symbol,
        side: "long",
        amount: new Decimal(1),
        entryPrice: new Decimal(50000),
        unrealizedPnl: new Decimal(100),
        leverage: new Decimal(10),
        marginMode: "cross",
        margin: new Decimal(5000),
        markPrice: new Decimal(50100),
        positionId: `${symbol}-long`,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

async function settle(rounds = 6) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

describe("BUG-0513 — PositionsList close-all button", () => {
    it("announces the intent when wired", async () => {
        const oncloseAll = vi.fn();
        component = mount(PositionsList, {
            target: host,
            props: { positions: [position("BTCUSDT")], oncloseAll },
        }) as never;
        await settle();

        const button = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent?.trim() === lookup("positionsList.closeAll"),
        );
        expect(button).toBeDefined();
        button!.click();
        await settle();
        expect(oncloseAll).toHaveBeenCalledTimes(1);
    });

    it("shows no button when not wired", async () => {
        component = mount(PositionsList, {
            target: host,
            props: { positions: [position("BTCUSDT")] },
        }) as never;
        await settle();

        expect(host.textContent).not.toContain(lookup("positionsList.closeAll"));
    });

    it("shows no button on an empty book", async () => {
        const oncloseAll = vi.fn();
        component = mount(PositionsList, {
            target: host,
            props: { positions: [], oncloseAll },
        }) as never;
        await settle();

        expect(host.textContent).not.toContain(lookup("positionsList.closeAll"));
        expect(oncloseAll).not.toHaveBeenCalled();
    });
});
