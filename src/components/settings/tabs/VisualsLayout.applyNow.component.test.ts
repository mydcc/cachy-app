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
 * FEAT-0772 — the "Apply now" state must follow the window manager while the
 * editor is already mounted. The sibling `VisualsLayout.component.test.ts`
 * replaces the manager with a plain object and sets its value before mounting,
 * so it can prove only the state at mount. The transition is what the user
 * depends on: the settings window is open, the user focuses a chart, and the
 * button has to become usable at that moment.
 *
 * So this file deliberately does not mock `lib/windows/WindowManager.svelte`.
 * The settings, i18n and ui modules stay mocked: rule persistence is not the
 * subject, the reactive link is.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return { _: readable((key: string) => lookup(key) ?? key), locale: readable("en"), setLocale: vi.fn() };
});

const settingsMock = vi.hoisted(() => ({
    newsOpenBehavior: "smart",
    showSidebars: false,
    enableDockingCentered: true,
    dockingPosition: "top",
    focusFollowsMouse: false,
    windowRules: [] as Array<Record<string, unknown>>,
    favoriteSymbols: ["BTCUSDT", "ETHUSDT"],
}));
vi.mock("../../../stores/settings.svelte", () => ({ settingsState: settingsMock }));

const uiMock = vi.hoisted(() => ({ showAssistant: false, toggleAssistant: vi.fn() }));
vi.mock("../../../stores/ui.svelte", () => ({ uiState: uiMock }));

import { windowManager } from "../../../lib/windows/WindowManager.svelte";
import { WindowBase } from "../../../lib/windows/WindowBase.svelte";
import VisualsLayout from "./VisualsLayout.svelte";

/**
 * A real `WindowBase` subclass: the manager's reactive field only ever holds
 * one of these, so a plain object would test a shape production never sees.
 */
class TestWindow extends WindowBase {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get component(): any {
        return null;
    }
}

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
let opened: string[] = [];
let nextId = 0;

beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.windowRules = [];
    settingsMock.favoriteSymbols = ["BTCUSDT", "ETHUSDT"];
    uiMock.showAssistant = false;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    for (const id of opened) windowManager.close(id);
    opened = [];
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    component = mount(VisualsLayout, { target: host }) as never;
    flushSync();
}

function openWindow(windowType: "journal" | "chart", symbol?: string): TestWindow {
    const win = new TestWindow({
        windowType,
        id: `feat0772-${windowType}-${nextId++}`,
        ...(symbol ? { symbol } : {}),
    });
    windowManager.open(win);
    opened.push(win.id);
    flushSync();
    return win;
}

function applyButton(type: string): HTMLButtonElement {
    const el = host.querySelector<HTMLButtonElement>(`#window-rule-${type}-apply`);
    if (!el) throw new Error(`apply button for "${type}" not rendered`);
    return el;
}

/** The reason span is rendered only while the action is refused. */
function reasonId(type: string): string {
    return `window-rule-${type}-apply-reason`;
}

describe("FEAT-0772 — Apply now follows a window focused after mount", () => {
    it("starts disabled with the no-target reason", () => {
        // A rule with no field to apply is refused on its own ("nothing to
        // apply"); the geometry keeps the subject the target link.
        settingsMock.windowRules = [{ windowType: "journal", enabled: true, x: 120 }];
        render();

        const apply = applyButton("journal");

        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expect(apply.getAttribute("aria-describedby")).toBe(reasonId("journal"));
        expect(host.textContent).toContain(
            lookup("settings.windowRulesApplyNoTarget"),
        );
    });

    it("enables the action when a matching window opens after the editor rendered", () => {
        // A rule with no field to apply is refused on its own ("nothing to
        // apply"); the geometry keeps the subject the target link.
        settingsMock.windowRules = [{ windowType: "journal", enabled: true, x: 120 }];
        render();
        expect(applyButton("journal").getAttribute("aria-disabled")).toBe("true");

        openWindow("journal");

        const apply = applyButton("journal");
        expect(apply.getAttribute("aria-disabled")).not.toBe("true");
        // No reason is rendered at all while the action is usable.
        expect(apply.getAttribute("aria-describedby")).toBeNull();
        expect(host.textContent).not.toContain(
            lookup("settings.windowRulesApplyNoTarget"),
        );
    });

    it("switches to the no-match reason when another type takes focus", () => {
        // A rule with no field to apply is refused on its own ("nothing to
        // apply"); the geometry keeps the subject the target link.
        settingsMock.windowRules = [{ windowType: "journal", enabled: true, x: 120 }];
        render();
        openWindow("journal");
        expect(applyButton("journal").getAttribute("aria-disabled")).not.toBe("true");

        openWindow("chart", "BTCUSDT");

        const apply = applyButton("journal");
        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expect(host.textContent).toContain(
            lookup("settings.windowRulesApplyNoMatch"),
        );
    });

    it("goes back to disabled with the no-target reason when the matching window closes", () => {
        // A rule with no field to apply is refused on its own ("nothing to
        // apply"); the geometry keeps the subject the target link.
        settingsMock.windowRules = [{ windowType: "journal", enabled: true, x: 120 }];
        render();
        const win = openWindow("journal");
        expect(applyButton("journal").getAttribute("aria-disabled")).not.toBe("true");

        windowManager.close(win.id);
        opened = opened.filter((id) => id !== win.id);
        flushSync();

        const apply = applyButton("journal");
        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expect(apply.getAttribute("aria-describedby")).toBe(reasonId("journal"));
        expect(host.textContent).toContain(
            lookup("settings.windowRulesApplyNoTarget"),
        );
    });
});
