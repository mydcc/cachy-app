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

/*
 * FEAT-0398's first acceptance criterion, proved at the surface the user
 * actually touches: opening the panel during chart operation shows live
 * Calls/Avg per engine, the result cache apart from engine stats, and an
 * honest empty hint before the first uncached calculation.
 *
 * Service-level tests (`calculationStrategy.test.ts`) prove the numbers.
 * What only a mounted component can show is the wiring — that recorded
 * metrics reach the stats table and cache hits never leak into engine Avg.
 * Each test re-imports the strategy module so the singleton starts at zero;
 * without that, one test's metrics would bleed into the next. The `svelte`
 * runtime is re-imported alongside it: mixing the pre-reset `mount` with a
 * post-reset component creates a second runtime and Svelte throws
 * `effect_orphan`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Component } from "svelte";

const locale = vi.hoisted(() => ({ current: "en" as "en" | "de" }));

/** Minimal `{name}` interpolation, as svelte-i18n would apply `values`. */
function format(template: string, values?: Record<string, unknown>): string {
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

vi.mock("../../locales/i18n", async () => {
    const enBundle = (await import("../../locales/locales/en.json")).default;
    const deBundle = (await import("../../locales/locales/de.json")).default;
    const translate = (key: string, options?: { values?: Record<string, unknown> }) => {
        const bundle = locale.current === "de" ? deBundle : enBundle;
        const value = key
            .split(".")
            .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
        return typeof value === "string" ? format(value, options?.values) : key;
    };
    return {
        _: {
            subscribe: (run: (value: typeof translate) => void) => {
                run(translate);
                return () => {};
            },
        },
    };
});

vi.mock("../../services/toastService.svelte", () => ({
    toastService: { error: vi.fn(), warning: vi.fn() },
}));

interface StrategyProbe {
    recordMetrics: (engine: "ts" | "wasm" | "gpu", duration: number, success: boolean, candleCount?: number) => void;
    recordCacheHit: () => void;
    recordCacheMiss: () => void;
}

let host: HTMLDivElement | null = null;
let component: Record<string, unknown> | null = null;
let svelteApi: typeof import("svelte") | null = null;
let Panel: Component | null = null;

function teardown(): void {
    if (component && svelteApi) svelteApi.unmount(component);
    component = null;
    Panel = null;
    svelteApi = null;
    host?.remove();
    host = null;
}

/** Fresh runtime + strategy singleton + panel module, so metrics never leak between tests. */
async function renderFresh(): Promise<StrategyProbe> {
    teardown();
    vi.resetModules();
    svelteApi = await import("svelte");
    const { calculationStrategy } = await import("../../services/calculationStrategy");
    ({ default: Panel } = await import("./EngineDebugPanel.svelte"));
    host = document.createElement("div");
    document.body.appendChild(host);
    component = svelteApi.mount(Panel, { target: host }) as unknown as Record<string, unknown>;
    svelteApi.flushSync();
    return calculationStrategy as StrategyProbe;
}

/** Re-mount from the same modules: the panel snapshots telemetry on mount. */
function remount(): void {
    if (!svelteApi || !Panel || !host) throw new Error("renderFresh() first");
    svelteApi.unmount(component);
    component = null;
    host.remove();
    host = document.createElement("div");
    document.body.appendChild(host);
    component = svelteApi.mount(Panel, { target: host }) as unknown as Record<string, unknown>;
    svelteApi.flushSync();
}

function text(): string {
    return host?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

beforeEach(() => {
    locale.current = "en";
});

afterEach(() => {
    teardown();
    vi.resetModules();
});

describe("EngineDebugPanel", () => {
    it("shows the empty hint before the first uncached calculation", async () => {
        await renderFresh();

        expect(text()).toContain("No uncached calculations yet");
    });

    it("shows live Calls/Avg per engine after metrics are recorded", async () => {
        const strategy = await renderFresh();
        // The panel snapshots on mount: record first, then mount the live view.
        strategy.recordMetrics("ts", 40, true, 500);
        strategy.recordMetrics("wasm", 60, true, 500);
        remount();

        expect(text()).toContain("40.0ms");
        expect(text()).toContain("60.0ms");
        expect(text()).not.toContain("No uncached calculations yet");
    });

    it("shows the result cache apart from engine stats", async () => {
        const strategy = await renderFresh();
        strategy.recordCacheHit();
        strategy.recordCacheHit();
        strategy.recordCacheMiss();
        remount();

        expect(text()).toContain("Hits 2 · Misses 1 · 67% hit rate");
        // Cache hits are not engine calls: the empty-stats hint still applies.
        expect(text()).toContain("No uncached calculations yet");
    });

    it("carries the strings in German", async () => {
        locale.current = "de";
        await renderFresh();

        expect(text()).toContain("Noch keine Berechnung außerhalb des Caches");
    });
});
