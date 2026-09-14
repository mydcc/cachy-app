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
 * FEAT-0346 — AnalyticsButton is the header's entry point to the market
 * dashboard. One click, one action: it must ask the UI store to open the
 * dashboard and nothing else.
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

const uiMock = vi.hoisted(() => ({ toggleMarketDashboardModal: vi.fn() }));
vi.mock("../../stores/ui.svelte", () => ({ uiState: uiMock }));

vi.mock("../../actions/tracking", () => ({ trackClick: () => ({ destroy() {} }) }));

import AnalyticsButton from "./AnalyticsButton.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("FEAT-0346 — AnalyticsButton opens the market dashboard", () => {
    it("asks the UI store to show the dashboard on click", () => {
        component = mount(AnalyticsButton, { target: host }) as never;
        flushSync();

        host.querySelector<HTMLButtonElement>("#market-dashboard-btn")?.click();

        expect(uiMock.toggleMarketDashboardModal).toHaveBeenCalledWith(true);
    });

    it("carries a translated title for the tooltip", () => {
        component = mount(AnalyticsButton, { target: host }) as never;
        flushSync();

        expect(host.querySelector("button")?.getAttribute("title")).toBe(
            lookup("app.marketDashboard.buttonTitle"),
        );
    });
});
