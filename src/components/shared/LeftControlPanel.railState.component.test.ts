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

/**
 * BUG-0715 — a rail toggle has to say the same thing its panel shows.
 *
 * The panel buttons used to light from raw stored preferences while the panels
 * rendered from conditions the rail ignored: technicals needed a second
 * page-local flag, activity needed Pro or exchange keys, sentiment ignored its
 * own flag below xl, and all four did nothing while the sidebar column was off.
 *
 * These cases pin the two states the acceptance criteria name — no usable
 * account, and the column switched off — plus the active class following what
 * the panel actually renders.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../locales/locales/en.json";

function message(key: string): string {
    const value = key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        );
    if (typeof value !== "string") {
        throw new Error(`missing i18n key: ${key}`);
    }
    return value;
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => message(key)),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import LeftControlPanel from "./LeftControlPanel.svelte";
import { settingsState } from "../../stores/settings.svelte";

/** The four panel toggles, by the label the rail renders for them. */
const PANEL_LABELS = {
    technicals: "settings.showTechnicals",
    overview: "settings.toggleMarketTiles",
    activity: "dashboard.marketActivity",
    sentiment: "settings.toggleMarketSentiment",
} as const;

const original = {
    showSidebars: settingsState.showSidebars,
    showTechnicals: settingsState.showTechnicals,
    showMarketOverview: settingsState.showMarketOverview,
    showSidebarActivity: settingsState.showSidebarActivity,
    showMarketSentiment: settingsState.showMarketSentiment,
    accounts: settingsState.accounts,
    activeAccountId: settingsState.activeAccountId,
    apiProvider: settingsState.apiProvider,
    isPro: settingsState.entitlement.isPro,
};

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | null = null;

function render(): void {
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(LeftControlPanel, { target: host });
    flushSync();
}

/** The reason a control gives, read where a screen reader reads it. */
function describedReason(button: HTMLButtonElement): string {
    const id = button.getAttribute("aria-describedby");
    if (!id) return "";
    return host.querySelector(`#${id}`)?.textContent?.trim() ?? "";
}

function railButton(key: keyof typeof PANEL_LABELS): HTMLButtonElement {
    const label = message(PANEL_LABELS[key]);
    const button = Array.from(
        host.querySelectorAll<HTMLButtonElement>(".control-btn"),
    ).find((candidate) =>
        candidate.getAttribute("aria-label")?.startsWith(label),
    );
    if (!button) throw new Error(`no rail button for ${key}`);
    return button;
}

beforeEach(() => {
    localStorage.clear();
    // No account that could fill the activity panel.
    settingsState.accounts = [];
    settingsState.activeAccountId = null;
    settingsState.apiProvider = "bitunix";
    settingsState.showSidebars = true;
    settingsState.showTechnicals = true;
    settingsState.showMarketOverview = true;
    settingsState.showSidebarActivity = true;
    settingsState.showMarketSentiment = true;
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host?.remove();
    Object.assign(settingsState, original);
});

describe("BUG-0715 — the rail matches the panel it names", () => {
    it("disables every panel toggle with a reason while the sidebars are off", () => {
        settingsState.showSidebars = false;
        render();

        const sidebarsReason = message("dashboard.railSidebarsHidden");
        for (const key of ["technicals", "overview", "sentiment"] as const) {
            const button = railButton(key);
            expect(button.getAttribute("aria-disabled"), key).toBe("true");
            expect(describedReason(button), key).toBe(sidebarsReason);
            // Reachable on purpose: a native disabled button is where the
            // reason cannot be read.
            expect(button.disabled, key).toBe(false);
        }

        // Activity names its own blocker, which is also true here: no account
        // can fill the panel and the sidebars that hold it are off.
        const activity = railButton("activity");
        expect(activity.getAttribute("aria-disabled")).toBe("true");
        expect(describedReason(activity)).toBe(
            message("dashboard.railActivityUnavailable"),
        );

        const before = settingsState.showTechnicals;
        railButton("technicals").click();
        flushSync();
        expect(settingsState.showTechnicals).toBe(before);
    });

    it("disables market activity without an account and says what it needs", () => {
        render();

        const activity = railButton("activity");
        expect(activity.getAttribute("aria-disabled")).toBe("true");
        expect(describedReason(activity)).toBe(
            message("dashboard.railActivityUnavailable"),
        );
        // The stored preference is on, but nothing can render the panel, so the
        // button must not claim it is active.
        expect(settingsState.showSidebarActivity).toBe(true);
        expect(activity.classList.contains("active")).toBe(false);

        activity.click();
        flushSync();
        expect(settingsState.showSidebarActivity).toBe(true);

        // The other panel toggles are usable; only the activity gate is closed.
        expect(railButton("technicals").getAttribute("aria-disabled")).toBeNull();
    });

    it("lights market activity once an account can fill the panel", () => {
        settingsState.entitlement.isPro = true;
        render();

        const activity = railButton("activity");
        expect(activity.getAttribute("aria-disabled")).toBeNull();
        expect(activity.hasAttribute("aria-describedby")).toBe(false);
        expect(activity.classList.contains("active")).toBe(true);
    });

    it("keeps the technicals button in step with the panel flag", () => {
        settingsState.showTechnicals = false;
        render();

        const technicals = railButton("technicals");
        expect(technicals.classList.contains("active")).toBe(false);
        expect(technicals.getAttribute("aria-disabled")).toBeNull();

        technicals.click();
        flushSync();

        // One flag for the chevron and the rail: this is the click that used
        // to leave the button lit with the panel hidden.
        expect(settingsState.showTechnicals).toBe(true);
        expect(technicals.classList.contains("active")).toBe(true);
    });
});
