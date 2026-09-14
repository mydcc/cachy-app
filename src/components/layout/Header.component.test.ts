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
 * FEAT-0346 — Header is where the two states that must never be misread live:
 * whether market data is connected, and whether paper trading is on
 * (FEAT-0012). The tests pin both, including the loud offline banner.
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

const marketMock = vi.hoisted(() => ({ connectionStatus: "connected" }));
vi.mock("../../stores/market.svelte", () => ({ marketState: marketMock }));

const paperMock = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: paperMock }));

import Header from "./Header.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
let originalAnimate: typeof HTMLElement.prototype.animate | undefined;

beforeEach(() => {
    marketMock.connectionStatus = "connected";
    paperMock.enabled = false;
    // The offline banner carries transition:fade; happy-dom rejects the
    // aborted animation on unmount (see TimeframeSelector's test for detail).
    originalAnimate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = (() => ({
        currentTime: 0,
        playState: "finished",
        onfinish: null,
        effect: null,
        finished: Promise.resolve(),
        cancel() {},
        addEventListener() {},
        removeEventListener() {},
    })) as unknown as typeof HTMLElement.prototype.animate;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (originalAnimate) {
        HTMLElement.prototype.animate = originalAnimate;
    } else {
        delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    component = mount(Header, { target: host }) as never;
    flushSync();
}

function indicator(): HTMLElement | null {
    return host.querySelector<HTMLElement>(".w-indicator");
}

describe("FEAT-0346 — Header shows connection and paper state", () => {
    it("shows no banner and a success indicator while connected", () => {
        render();

        expect(host.textContent).not.toContain(lookup("connection.offline"));
        expect(host.textContent).toContain(lookup("app.title"));
        expect(indicator()?.classList.contains("bg-success")).toBe(true);
    });

    it("raises the offline banner when disconnected", () => {
        marketMock.connectionStatus = "disconnected";
        render();

        expect(host.textContent).toContain(lookup("connection.offline"));
        expect(indicator()?.classList.contains("bg-danger")).toBe(true);
    });

    it("shows the reconnecting banner while reconnecting", () => {
        marketMock.connectionStatus = "reconnecting";
        render();

        expect(host.textContent).toContain(lookup("connection.reconnecting"));
        expect(indicator()?.classList.contains("bg-warning")).toBe(true);
    });

    it("badges paper mode persistently while it is on", () => {
        paperMock.enabled = true;
        render();

        const badge = host.querySelector(".paper-mode-badge");
        expect(badge?.textContent?.trim()).toBe(lookup("header.paperMode.badge"));
        expect(badge?.getAttribute("title")).toBe(lookup("header.paperMode.tooltip"));
    });

    it("hides the paper badge while paper mode is off", () => {
        render();

        expect(host.querySelector(".paper-mode-badge")).toBeNull();
    });
});
