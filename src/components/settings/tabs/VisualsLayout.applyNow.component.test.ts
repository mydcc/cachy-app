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
    density: "default",
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
    get component() {
        return null;
    }
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;
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
    if (component) unmount(component);
    component = null;
    host.remove();
});

function render() {
    component = mount(VisualsLayout, { target: host });
    flushSync();
}

function openWindow(windowType: "journal" | "chart", symbol?: string): TestWindow {
    const win = new TestWindow({
        windowType,
        id: `feat0772-${windowType}-${nextId++}`,
        symbol,
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

/** The referenced reason must exist and carry the expected refusal. */
function expectReason(apply: HTMLButtonElement, key: string): void {
    const id = apply.getAttribute("aria-describedby");
    if (!id) throw new Error("apply button has no reason reference");
    expect(host.querySelector(`#${id}`)?.textContent ?? "").toContain(
        lookup(key),
    );
}

/*
 * Every rule below carries one appliable field (`x`). Without it the editor
 * refuses the action with its own "nothing to apply" reason as soon as a
 * target exists, and the assertion would be about that earlier refusal rather
 * than about the target link this file exists to pin.
 */
describe("FEAT-0772 — Apply now follows a window focused after mount", () => {
    it("starts disabled with the no-target reason", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true, x: 120 }];
        render();

        const apply = applyButton("journal");

        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expectReason(apply, "settings.windowRulesApplyNoTarget");
    });

    it("enables the action when a matching window opens after the editor rendered", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true, x: 120 }];
        render();
        expect(applyButton("journal").getAttribute("aria-disabled")).toBe("true");

        openWindow("journal");

        const apply = applyButton("journal");
        expect(apply.getAttribute("aria-disabled")).toBe("false");
        // No reason element at all while the action is usable.
        expect(host.querySelector('[id$="-apply-reason"]')).toBeNull();
    });

    it("switches to the no-match reason when another type takes focus", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true, x: 120 }];
        render();
        openWindow("journal");
        expect(applyButton("journal").getAttribute("aria-disabled")).toBe("false");

        openWindow("chart", "BTCUSDT");

        const apply = applyButton("journal");
        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expectReason(apply, "settings.windowRulesApplyNoMatch");
    });

    it("leaves a symbol-scoped chart rule disabled for another symbol", () => {
        settingsMock.windowRules = [
            {
                windowType: "chart",
                enabled: true,
                x: 120,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
        ];
        render();
        expect(applyButton("chart-BTCUSDT").getAttribute("aria-disabled")).toBe(
            "true",
        );

        openWindow("chart", "ETHUSDT");

        const apply = applyButton("chart-BTCUSDT");
        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expectReason(apply, "settings.windowRulesApplyNoMatch");
    });

    it("re-enables when focus returns to the matching window without a new open", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true, x: 120 }];
        render();
        const journal = openWindow("journal");
        openWindow("chart", "BTCUSDT");
        expect(applyButton("journal").getAttribute("aria-disabled")).toBe("true");

        windowManager.bringToFront(journal.id);
        flushSync();

        expect(applyButton("journal").getAttribute("aria-disabled")).toBe("false");
    });

    it("goes back to disabled with the no-target reason when the matching window closes", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true, x: 120 }];
        render();
        const win = openWindow("journal");
        expect(applyButton("journal").getAttribute("aria-disabled")).toBe("false");

        windowManager.close(win.id);
        opened = opened.filter((id) => id !== win.id);
        flushSync();

        const apply = applyButton("journal");
        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expectReason(apply, "settings.windowRulesApplyNoTarget");
    });
});
