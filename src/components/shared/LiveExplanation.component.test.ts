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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0678 — the control's own promises, not the transport's.
 *
 * Four of the item's acceptance criteria live here: nothing is sent before the
 * button is pressed (AC 5), the recipient is named before the request exists
 * (AC 7), a missing provider disables the control without breaking the lesson
 * (AC 8), and the answer renders as streamed text (AC 9). The egress boundary
 * is asserted in `lib/academy/liveExplanation.test.ts`, where it can be read as
 * an allowlist instead of inferred from a mock.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

import en from "../../locales/locales/en.json";
import type { CatalogueEntry } from "../../lib/alerts/indicatorCatalogue";
import type { LessonSeries } from "../../lib/academy/indicatorLessonSeries";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        ) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    const translate = (key: string, vars?: { values?: Record<string, unknown> }) => {
        const template = lookup(key) ?? key;
        if (!vars?.values) return template;
        return template.replace(/\{(\w+)\}/g, (_, name: string) =>
            String(vars.values?.[name] ?? ""),
        );
    };
    return {
        _: readable(translate),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

const mocks = vi.hoisted(() => ({
    askOnce: vi.fn(),
    providerStatus: vi.fn(),
}));

vi.mock("../../stores/ai.svelte", () => ({
    aiState: {
        askOnce: mocks.askOnce,
        providerStatus: mocks.providerStatus,
    },
}));

vi.mock("../../stores/trade.svelte", () => ({
    tradeState: { symbol: "BTCUSDT" },
}));

import LiveExplanation from "./LiveExplanation.svelte";

const entry = {
    id: "rsi",
    group: "oscillators",
    params: [],
    outputs: [{ name: "value", dimension: "oscillator" }],
    placement: "pane",
} as unknown as CatalogueEntry;

const series: LessonSeries = {
    lines: [{ name: "value", values: ["61.2", "60.4"] }],
    refused: [],
};

function mountControl() {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const instance = mount(LiveExplanation, {
        target: host,
        props: { entry, params: {}, field: "close", timeframe: "1h", series },
    });
    flushSync();
    return { host, instance };
}

function button(host: HTMLElement): HTMLButtonElement {
    const found = host.querySelector("[aria-labelledby] button");
    if (!found) throw new Error("the explanation control rendered no button");
    return found as HTMLButtonElement;
}

describe("LiveExplanation (FEAT-0678)", () => {
    beforeEach(() => {
        mocks.askOnce.mockReset();
        mocks.providerStatus.mockReset();
        mocks.providerStatus.mockReturnValue({ ready: true, label: "Gemini" });
        document.body.innerHTML = "";
    });

    it("issues no request on mount", () => {
        const { host, instance } = mountControl();

        expect(mocks.askOnce).not.toHaveBeenCalled();
        expect(host.textContent).toContain("Live reading");

        unmount(instance);
    });

    it("names the provider before the request exists", () => {
        const { host, instance } = mountControl();

        expect(button(host).textContent).toContain("Gemini");

        unmount(instance);
    });

    it("disables the control, keeps the lesson, and sends nothing without a provider", () => {
        mocks.providerStatus.mockReturnValue({ ready: false, label: "Gemini" });
        const { host, instance } = mountControl();

        const control = button(host);
        expect(control.disabled).toBe(true);
        expect(host.textContent).toContain(
            lookup("academy.liveExplain.noProvider"),
        );

        control.click();
        flushSync();
        expect(mocks.askOnce).not.toHaveBeenCalled();

        unmount(instance);
    });

    it("renders the streamed answer with the values it was read at", async () => {
        mocks.askOnce.mockImplementation(async (_messages, options) => {
            options.onDelta("RSI is 61.2 and rising.");
            return { content: "RSI is 61.2 and rising.", usage: {}, toolCallBuffer: "" };
        });
        const { host, instance } = mountControl();

        button(host).click();
        // One macrotask: the hook awaits the provider promise, then marks the
        // answer done and the frozen header appears.
        await new Promise((resolve) => setTimeout(resolve, 0));
        flushSync();

        expect(mocks.askOnce).toHaveBeenCalledTimes(1);
        expect(host.textContent).toContain("RSI is 61.2 and rising.");
        expect(host.textContent).toContain("BTCUSDT");
        expect(host.textContent).toContain("1h");

        unmount(instance);
    });

    it("shows a provider failure instead of swallowing it", async () => {
        mocks.askOnce.mockRejectedValue(new Error("HTTP 401: bad key"));
        const { host, instance } = mountControl();

        button(host).click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        flushSync();

        expect(host.textContent).toContain("HTTP 401: bad key");

        unmount(instance);
    });
});
