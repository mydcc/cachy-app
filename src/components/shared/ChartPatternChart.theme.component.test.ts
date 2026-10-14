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
 * ChartPatternChart resolves its palette at draw time, so a dark↔light
 * switch must redraw the diagram — otherwise it keeps the old theme's
 * colors and looks hardcoded. This mounts the real component and proves a
 * theme-class change on documentElement triggers another draw.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string) => {
            const hit = key
                .split(".")
                .reduce<unknown>(
                    (acc, part) => (acc as Record<string, unknown>)?.[part],
                    en,
                );
            return typeof hit === "string" ? hit : key;
        }),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import ChartPatternChart from "./ChartPatternChart.svelte";
import type { ChartPatternDefinition } from "../../services/chartPatterns";

function fakeCtx() {
    return {
        setTransform: vi.fn(),
        scale: vi.fn(),
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 1,
        globalAlpha: 1,
        font: "",
        textAlign: "",
    };
}

class FiringResizeObserver {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
    }
    observe() {
        this.callback(
            [{ contentRect: { width: 320 } } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver,
        );
    }
    unobserve() {}
    disconnect() {}
}

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
let drawFunction: ReturnType<typeof vi.fn>;
const realGetContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", FiringResizeObserver);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx()) as unknown as typeof realGetContext;
    drawFunction = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    vi.unstubAllGlobals();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    document.documentElement.removeAttribute("class");
});

function testPattern() {
    return { id: "test-pattern", drawFunction } as unknown as ChartPatternDefinition;
}

describe("ChartPatternChart theme redraw", () => {
    it("redraws the pattern when the theme class on documentElement changes", async () => {
        component = mount(ChartPatternChart, {
            target: host,
            props: { pattern: testPattern() },
        }) as unknown as Record<string, unknown>;
        flushSync();
        expect(drawFunction).toHaveBeenCalledTimes(1);

        // A dark↔light switch only flips the class — nothing else in the
        // component's reactive graph moves, so without the theme observer
        // this second draw would never happen.
        drawFunction.mockClear();
        document.documentElement.setAttribute("class", "theme-light");
        await new Promise((resolve) => setTimeout(resolve, 0));
        flushSync();

        expect(drawFunction).toHaveBeenCalled();
    });
});
