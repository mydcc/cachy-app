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
 * FEAT-0346 — VisualBar places entry, stop and take-profits on one axis. The
 * geometry is direction-aware: for a long, a target below entry is not a
 * target and must not appear or stretch the scale. The tests pin the split at
 * entry and the handling of a target on the wrong side.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return { _: r((key: string) => lookup(key) ?? key), locale: r("en"), setLocale: vi.fn() };
});

vi.mock("../../utils/utils", () => ({
    parseDecimal: (value: string) => ({ toNumber: () => Number(value) }),
}));

const tradeMock = vi.hoisted(() => ({ tradeType: "long" as "long" | "short" }));
vi.mock("../../stores/trade.svelte", () => ({ tradeState: tradeMock }));

import VisualBar from "./VisualBar.svelte";

function baseProps(overrides: Record<string, unknown> = {}) {
    return {
        entryPrice: "100",
        stopLossPrice: "90",
        targets: [{ price: "120", percent: "50", isLocked: false }],
        calculatedTpDetails: [{ index: 0, riskRewardRatio: { toFixed: () => "3.0" } }],
        ...overrides,
    };
}

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    tradeMock.tradeType = "long";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown> = {}) {
    component = mount(VisualBar, { target: host, props: baseProps(props) }) as never;
    flushSync();
}

function fillWidth(selector: string): string {
    return host.querySelector<HTMLElement>(selector)?.style.width ?? "";
}

describe("FEAT-0346 — VisualBar places targets in the trade's direction", () => {
    it("splits the bar at the entry price", () => {
        render();

        // entry 100, stop 90, furthest target 120 -> entry sits at a third.
        expect(fillWidth(".bar-fill.risk").startsWith("33.3")).toBe(true);
        expect(fillWidth(".bar-fill.profit").startsWith("66.6")).toBe(true);
    });

    it("labels a take-profit with its index and R multiple", () => {
        render();

        expect(host.querySelector(".tp-name")?.textContent).toBe("TP1");
        expect(host.querySelector(".tp-rr")?.textContent).toContain("3.0");
    });

    it("ignores a target on the wrong side of entry", () => {
        render({ targets: [{ price: "80", percent: "50", isLocked: false }] });

        expect(host.querySelectorAll(".tp-label")).toHaveLength(0);
        // With no valid target the scale collapses to entry itself.
        expect(fillWidth(".bar-fill.risk")).toBe("100%");
    });

    it("renders nothing until an entry and a stop exist", () => {
        render({ entryPrice: null });

        expect(host.querySelector(".bar-section")).toBeNull();
        expect(host.querySelector(".visual-bar-card")?.textContent?.trim()).toBe("");
    });
});
