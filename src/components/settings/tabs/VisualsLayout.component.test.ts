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
 * FEAT-0346 — VisualsLayout wires the visuals settings to their stores. Each
 * control must write the store it is bound to; the component owns no state of
 * its own to drift from.
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

/**
 * FEAT-0770 — the apply target comes from the window manager, whose real
 * singleton would need a live window graph. The editor only reads
 * `lastActiveWindow`, so the mock is the whole contract.
 */
const windowManagerMock = vi.hoisted(() => ({
    lastActiveWindow: null as null | {
        id: string;
        windowType: string;
        symbol: string;
        isKeepAbove?: boolean;
        closeOnBlur?: boolean;
        allowMaximize?: boolean;
        applyRuleNow: (rule: unknown) => boolean;
    },
    restack: vi.fn(),
}));
vi.mock("../../../lib/windows/WindowManager.svelte", () => ({
    windowManager: windowManagerMock,
}));

import { WINDOW_RULE_TYPES } from "../../../lib/windows/windowRules";
import VisualsLayout from "./VisualsLayout.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.newsOpenBehavior = "smart";
    settingsMock.showSidebars = false;
    settingsMock.enableDockingCentered = true;
    settingsMock.dockingPosition = "top";
    settingsMock.focusFollowsMouse = false;
    settingsMock.windowRules = [];
    settingsMock.favoriteSymbols = ["BTCUSDT", "ETHUSDT"];
    uiMock.showAssistant = false;
    windowManagerMock.lastActiveWindow = null;
    windowManagerMock.restack.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    component = mount(VisualsLayout, { target: host }) as never;
    flushSync();
}

function buttonContaining(text: string): HTMLButtonElement {
    const el = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
        b.textContent?.includes(text),
    );
    if (!el) throw new Error(`button containing "${text}" not rendered`);
    return el;
}

describe("FEAT-0346 — VisualsLayout writes through to the stores", () => {
    it("records the chosen news open behaviour", () => {
        render();

        buttonContaining(lookup("settings.newsOpenBehaviorNewTab")).click();

        expect(settingsMock.newsOpenBehavior).toBe("new_tab");
    });

    it("renders the news open behaviour under its own group heading", () => {
        render();

        const heading = [...host.querySelectorAll("h4")].find(
            (h) => h.textContent?.trim() === lookup("settings.newsArticlesTitle"),
        );
        if (!heading) throw new Error("news article display heading not rendered");

        const group = heading.closest("div");
        if (!group) throw new Error("heading has no group container");

        expect(group.className).toContain("border-t");
        for (const key of [
            "settings.newsOpenBehaviorSmart",
            "settings.newsOpenBehaviorReader",
            "settings.newsOpenBehaviorNewTab",
            "settings.newsOpenBehaviorWindow",
        ]) {
            expect(
                group.contains(buttonContaining(lookup(key))),
                `${key} is outside the news group`,
            ).toBe(true);
        }
    });

    it("binds the sidebars toggle to the settings store", () => {
        render();

        host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].click();

        expect(settingsMock.showSidebars).toBe(true);
    });

    it("routes the assistant toggle through the ui store", () => {
        render();

        host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click();

        expect(uiMock.toggleAssistant).toHaveBeenCalledWith(true);
    });

    it("renders the docking controls and binds the centered toggle", () => {
        render();

        const centered = host.querySelector<HTMLInputElement>("#docking-centered");
        if (!centered) throw new Error("docking centered toggle not rendered");
        centered.click();
        expect(settingsMock.enableDockingCentered).toBe(false);

        const select = host.querySelector<HTMLSelectElement>("#docking-position");
        if (!select) throw new Error("docking position select not rendered");
        // happy-dom does not resolve :checked for options, so Svelte's select
        // write-through cannot be exercised here; the option set is what a
        // component test can pin without a real browser.
        expect([...select.options].map((option) => option.value)).toEqual([
            "top",
            "bottom",
        ]);
    });

    it("binds the focus-follows-mouse toggle", () => {
        render();

        const focus = host.querySelector<HTMLInputElement>(
            "#focus-follows-mouse",
        );
        if (!focus) throw new Error("focus-follows toggle not rendered");
        focus.click();
        expect(settingsMock.focusFollowsMouse).toBe(true);
    });
});

describe("FEAT-0743 — window rules section", () => {
    it("adds a rule for the first free type with one click", () => {
        render();

        const add = host.querySelector<HTMLButtonElement>("#window-rule-add");
        if (!add) throw new Error("add rule button not rendered");
        expect(add.disabled).toBe(false);
        add.click();

        expect(settingsMock.windowRules).toEqual([
            { windowType: "journal", enabled: true },
        ]);
    });

    it("offers only window types that have no rule yet", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true }];
        render();

        const select = host.querySelector<HTMLSelectElement>(
            "#window-rule-add-type",
        );
        if (!select) throw new Error("rule type select not rendered");
        const values = [...select.options].map((option) => option.value);
        expect(values).not.toContain("journal");
        expect(values).toContain("chart");
    });

    it("removes a rule", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true }];
        render();

        const remove = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-remove",
        );
        if (!remove) throw new Error("remove rule button not rendered");
        expect(remove.getAttribute("aria-label")).toContain(
            lookup("settings.windowRulesRemove"),
        );
        remove.click();

        expect(settingsMock.windowRules).toEqual([]);
    });

    it("does not offer keep-above for a close-on-blur type", () => {
        settingsMock.windowRules = [{ windowType: "settings", enabled: true }];
        render();

        expect(host.textContent).not.toContain(
            lookup("settings.windowRulesKeepAboveOn"),
        );
        expect(host.textContent).toContain(
            lookup("settings.windowRulesKeepAboveUnavailable"),
        );
    });

    it("offers keep-above for a normal window type", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true }];
        render();

        expect(host.textContent).toContain(lookup("settings.windowRulesKeepAboveOn"));
    });

    it("writes the enable switch, a geometry field and a select through the rule", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true }];
        render();

        const enable = host.querySelector<HTMLInputElement>(
            "#window-rule-journal-enabled",
        );
        if (!enable) throw new Error("rule enable switch not rendered");
        enable.click();
        expect(settingsMock.windowRules[0].enabled).toBe(false);

        const x = host.querySelector<HTMLInputElement>("#window-rule-journal-x");
        if (!x) throw new Error("rule X input not rendered");
        x.value = "240";
        x.dispatchEvent(new Event("input", { bubbles: true }));
        expect(settingsMock.windowRules[0].x).toBe(240);

        const maximize = host.querySelector<HTMLSelectElement>(
            "#window-rule-journal-maximized",
        );
        if (!maximize) throw new Error("rule maximize select not rendered");
        maximize.value = "on";
        maximize.dispatchEvent(new Event("change", { bubbles: true }));
        expect(settingsMock.windowRules[0].isMaximized).toBe(true);
    });

    it("clears a geometry field to undefined instead of null", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true, x: 120 }];
        render();

        const x = host.querySelector<HTMLInputElement>("#window-rule-journal-x");
        if (!x) throw new Error("rule X input not rendered");
        x.value = "";
        x.dispatchEvent(new Event("input", { bubbles: true }));

        expect("x" in settingsMock.windowRules[0]).toBe(false);
    });

    it("hides the height field for an aspect-locked type", () => {
        settingsMock.windowRules = [{ windowType: "chart", enabled: true }];
        render();

        expect(host.querySelector("#window-rule-chart-height")).toBeNull();
        expect(host.textContent).toContain(
            lookup("settings.windowRulesAspectHint"),
        );
    });
});

/**
 * FEAT-0769 — a chart rule can be narrowed to one symbol from the add row.
 * Every type except chart is seeded so the picker's first free type *is*
 * chart; happy-dom does not drive `<select>` bindings, so selecting it in the
 * test would prove nothing about the component.
 */
const everyTypeButChart = () =>
    WINDOW_RULE_TYPES.filter((type) => type !== "chart").map((type) => ({
        windowType: type,
        enabled: true,
    }));

function typeInto(selector: string, value: string) {
    const input = host.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`${selector} not rendered`);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    return input;
}

function changeField(selector: string, value: string) {
    const input = host.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`${selector} not rendered`);
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    return input;
}

describe("FEAT-0769 — per-instance chart rules", () => {
    it("adds a chart rule scoped to the typed symbol", () => {
        settingsMock.windowRules = everyTypeButChart();
        render();

        typeInto("#window-rule-add-symbol", "btcusdt");
        const add = host.querySelector<HTMLButtonElement>("#window-rule-add");
        if (!add) throw new Error("add rule button not rendered");
        add.click();

        expect(settingsMock.windowRules).toContainEqual({
            windowType: "chart",
            match: { kind: "symbol", value: "BTCUSDT" },
            enabled: true,
        });
    });

    it("adds a type-wide chart rule when the symbol stays empty", () => {
        settingsMock.windowRules = everyTypeButChart();
        render();

        const symbol = host.querySelector<HTMLInputElement>(
            "#window-rule-add-symbol",
        );
        if (!symbol) throw new Error("symbol field not rendered");
        expect(symbol.value).toBe("");

        const add = host.querySelector<HTMLButtonElement>("#window-rule-add");
        if (!add) throw new Error("add rule button not rendered");
        add.click();

        expect(settingsMock.windowRules).toContainEqual({
            windowType: "chart",
            enabled: true,
        });
    });

    it("refuses a symbol that already has a rule and says why", () => {
        settingsMock.windowRules = [
            ...everyTypeButChart(),
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
        ];
        render();

        typeInto("#window-rule-add-symbol", "btcusdt");

        const add = host.querySelector<HTMLButtonElement>("#window-rule-add");
        if (!add) throw new Error("add rule button not rendered");
        expect(add.disabled).toBe(true);
        expect(
            host.querySelector("#window-rule-add-symbol-error")?.textContent,
        ).toContain(lookup("settings.windowRulesDuplicateSymbol"));
    });

    it("rejects a symbol the stored shape does not allow", () => {
        settingsMock.windowRules = everyTypeButChart();
        render();

        typeInto("#window-rule-add-symbol", "BTC USDT");

        const add = host.querySelector<HTMLButtonElement>("#window-rule-add");
        if (!add) throw new Error("add rule button not rendered");
        expect(add.disabled).toBe(true);
        expect(
            host.querySelector("#window-rule-add-symbol-error")?.textContent,
        ).toContain(lookup("settings.windowRulesSymbolInvalid"));
    });

    it("keeps chart selectable after a chart rule exists", () => {
        settingsMock.windowRules = [{ windowType: "chart", enabled: true }];
        render();

        const select = host.querySelector<HTMLSelectElement>(
            "#window-rule-add-type",
        );
        if (!select) throw new Error("rule type select not rendered");
        expect([...select.options].map((option) => option.value)).toContain(
            "chart",
        );
    });

    it("gives a type-wide and a symbol rule their own field ids", () => {
        settingsMock.windowRules = [
            { windowType: "chart", enabled: true },
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
        ];
        render();

        expect(host.querySelector("#window-rule-chart-x")).not.toBeNull();
        expect(host.querySelector("#window-rule-chart-BTCUSDT-x")).not.toBeNull();
    });

    it("renders the symbol of a scoped chart rule", () => {
        settingsMock.windowRules = [
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
        ];
        render();

        const input = host.querySelector<HTMLInputElement>(
            "#window-rule-chart-BTCUSDT-symbol",
        );
        if (!input) throw new Error("scoped chart rule symbol field not rendered");
        expect(input.value).toBe("BTCUSDT");
        expect(host.textContent).toContain(
            `${lookup("settings.windowRulesTypes.chart")} · BTCUSDT`,
        );
    });

    it("shows the type-wide caption for a chart rule without a scope", () => {
        settingsMock.windowRules = [{ windowType: "chart", enabled: true }];
        render();

        expect(host.querySelector("#window-rule-chart-symbol")).toBeNull();
        expect(host.textContent).toContain(lookup("settings.windowRulesScopeAll"));
    });

    it("renames a scoped chart rule", () => {
        settingsMock.windowRules = [
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
        ];
        render();

        changeField("#window-rule-chart-BTCUSDT-symbol", "ethusdt");

        expect(settingsMock.windowRules[0].match).toEqual({
            kind: "symbol",
            value: "ETHUSDT",
        });
    });

    it("refuses to rename onto a symbol that already has a rule", () => {
        settingsMock.windowRules = [
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "ETHUSDT" },
            },
        ];
        render();

        const input = changeField("#window-rule-chart-BTCUSDT-symbol", "ETHUSDT");

        expect(settingsMock.windowRules[0].match).toEqual({
            kind: "symbol",
            value: "BTCUSDT",
        });
        expect(input.value).toBe("BTCUSDT");
        // A silent revert reads as a broken field; the reason has to be there.
        expect(
            host.querySelector("#window-rule-chart-BTCUSDT-symbol-error")
                ?.textContent,
        ).toContain(lookup("settings.windowRulesDuplicateSymbol"));
        expect(input.getAttribute("aria-invalid")).toBe("true");
    });

    it("says why a malformed rename was refused", () => {
        settingsMock.windowRules = [
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
        ];
        render();

        changeField("#window-rule-chart-BTCUSDT-symbol", "BTC USDT");

        expect(
            host.querySelector("#window-rule-chart-BTCUSDT-symbol-error")
                ?.textContent,
        ).toContain(lookup("settings.windowRulesSymbolInvalid"));
    });

    it("shows the canonical form after a case-only rename", () => {
        settingsMock.windowRules = [
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
        ];
        render();

        const input = changeField("#window-rule-chart-BTCUSDT-symbol", "btcusdt");

        expect(settingsMock.windowRules[0].match).toEqual({
            kind: "symbol",
            value: "BTCUSDT",
        });
        // The field must show what is stored, not what was typed.
        expect(input.value).toBe("BTCUSDT");
    });

    it("explains why Add is disabled when a type-wide chart rule exists", () => {
        settingsMock.windowRules = [
            ...everyTypeButChart(),
            { windowType: "chart", enabled: true },
        ];
        render();

        const add = host.querySelector<HTMLButtonElement>("#window-rule-add");
        if (!add) throw new Error("add rule button not rendered");
        expect(add.disabled).toBe(true);
        expect(
            host.querySelector("#window-rule-add-symbol-error")?.textContent,
        ).toContain(lookup("settings.windowRulesTypeWideExists"));
    });

    it("offers the symbol field only for a type that has instances", () => {
        settingsMock.windowRules = [
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
            { windowType: "journal", enabled: true },
        ];
        render();

        expect(
            host.querySelector("#window-rule-chart-BTCUSDT-symbol"),
        ).not.toBeNull();
        expect(host.querySelector("#window-rule-journal-symbol")).toBeNull();
    });
});

describe("FEAT-0770 — Apply now", () => {
    it("is disabled with a reason while no other window has been focused", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true }];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-apply",
        );
        if (!apply) throw new Error("apply button not rendered");

        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expect(host.textContent).toContain(
            lookup("settings.windowRulesApplyNoTarget"),
        );
    });

    it("is disabled when the remembered window has another type", () => {
        windowManagerMock.lastActiveWindow = {
            id: "chart-target",
            windowType: "chart",
            symbol: "BTCUSDT",
            applyRuleNow: vi.fn(() => true),
        };
        settingsMock.windowRules = [{ windowType: "journal", enabled: true }];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-apply",
        );
        if (!apply) throw new Error("apply button not rendered");

        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expect(host.textContent).toContain(
            lookup("settings.windowRulesApplyNoMatch"),
        );
    });

    it("applies the rule to the remembered window", () => {
        const applyRuleNow = vi.fn(() => true);
        windowManagerMock.lastActiveWindow = {
            id: "apply-target",
            windowType: "journal",
            symbol: "",
            applyRuleNow,
        };
        settingsMock.windowRules = [
            { windowType: "journal", enabled: true, x: 120, y: 90 },
        ];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-apply",
        );
        if (!apply) throw new Error("apply button not rendered");
        expect(apply.getAttribute("aria-disabled")).not.toBe("true");

        apply.click();

        expect(applyRuleNow).toHaveBeenCalledTimes(1);
        expect(applyRuleNow.mock.calls[0][0]).toMatchObject({
            windowType: "journal",
            x: 120,
            y: 90,
        });
    });

    it("requires the scoped symbol to match the remembered window", () => {
        windowManagerMock.lastActiveWindow = {
            id: "chart-target",
            windowType: "chart",
            symbol: "ETHUSDT",
            applyRuleNow: vi.fn(() => true),
        };
        settingsMock.windowRules = [
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
            },
        ];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-chart-BTCUSDT-apply",
        );
        if (!apply) throw new Error("apply button not rendered");

        expect(apply.getAttribute("aria-disabled")).toBe("true");
    });
});

describe("FEAT-0770 — refusals the button must report", () => {
    it("refuses to apply a disabled rule and says why", () => {
        windowManagerMock.lastActiveWindow = {
            id: "apply-target",
            windowType: "journal",
            symbol: "",
            applyRuleNow: vi.fn(() => true),
        };
        settingsMock.windowRules = [
            { windowType: "journal", enabled: false, x: 120 },
        ];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-apply",
        );
        if (!apply) throw new Error("apply button not rendered");

        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expect(host.textContent).toContain(
            lookup("settings.windowRulesApplyEnableFirst"),
        );
    });

    it("refuses a maximize rule for a type that cannot maximize", () => {
        windowManagerMock.lastActiveWindow = {
            id: "alert-target",
            windowType: "alertpanel",
            symbol: "",
            allowMaximize: false,
            applyRuleNow: vi.fn(() => true),
        };
        settingsMock.windowRules = [
            { windowType: "alertpanel", enabled: true, isMaximized: true },
        ];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-alertpanel-apply",
        );
        if (!apply) throw new Error("apply button not rendered");

        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expect(host.textContent).toContain(
            lookup("settings.windowRulesApplyNoMaximize"),
        );
    });

    it("points the disabled button at its reason", () => {
        settingsMock.windowRules = [{ windowType: "journal", enabled: true }];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-apply",
        );
        if (!apply) throw new Error("apply button not rendered");

        const describedBy = apply.getAttribute("aria-describedby");
        expect(describedBy).toBe("window-rule-journal-apply-reason");
        expect(host.querySelector(`#${describedBy}`)?.textContent).toContain(
            lookup("settings.windowRulesApplyNoTarget"),
        );
        // The name has to distinguish the cards, like the remove/enable ones.
        expect(apply.getAttribute("aria-label")).toContain(
            lookup("settings.windowRulesTypes.journal"),
        );
    });
});

describe("FEAT-0770 — keep-above re-stacking", () => {
    it("re-bands the window when applying actually changed the flag", () => {
        const target = {
            id: "restack-target",
            windowType: "journal",
            symbol: "",
            isKeepAbove: false,
            applyRuleNow: vi.fn(() => {
                target.isKeepAbove = true;
                return true;
            }),
        };
        windowManagerMock.lastActiveWindow = target;
        settingsMock.windowRules = [
            { windowType: "journal", enabled: true, isKeepAbove: true },
        ];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-apply",
        );
        if (!apply) throw new Error("apply button not rendered");
        apply.click();

        // The flag alone never moves a window between bands (FEAT-0742).
        expect(windowManagerMock.restack).toHaveBeenCalledWith("restack-target");
    });

    it("re-bands the window when the rule turns keep-above off", () => {
        const target = {
            id: "restack-target",
            windowType: "journal",
            symbol: "",
            isKeepAbove: true,
            applyRuleNow: vi.fn(() => {
                target.isKeepAbove = false;
                return true;
            }),
        };
        windowManagerMock.lastActiveWindow = target;
        settingsMock.windowRules = [
            { windowType: "journal", enabled: true, isKeepAbove: false },
        ];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-apply",
        );
        if (!apply) throw new Error("apply button not rendered");
        apply.click();

        expect(windowManagerMock.restack).toHaveBeenCalledWith("restack-target");
    });

    it("does not re-stack when the band did not change", () => {
        windowManagerMock.lastActiveWindow = {
            id: "restack-target",
            windowType: "journal",
            symbol: "",
            isKeepAbove: false,
            applyRuleNow: vi.fn(() => true),
        };
        settingsMock.windowRules = [
            { windowType: "journal", enabled: true, isKeepAbove: false },
        ];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-apply",
        );
        if (!apply) throw new Error("apply button not rendered");
        apply.click();

        expect(windowManagerMock.restack).not.toHaveBeenCalled();
    });
});

describe("FEAT-0770 — the button cannot be bypassed", () => {
    it("does nothing when a disabled-looking button is clicked anyway", () => {
        const applyRuleNow = vi.fn(() => true);
        windowManagerMock.lastActiveWindow = {
            id: "chart-target",
            windowType: "chart",
            symbol: "ETHUSDT",
            applyRuleNow,
        };
        settingsMock.windowRules = [
            {
                windowType: "chart",
                enabled: true,
                match: { kind: "symbol", value: "BTCUSDT" },
                x: 100,
            },
        ];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-chart-BTCUSDT-apply",
        );
        if (!apply) throw new Error("apply button not rendered");
        expect(apply.getAttribute("aria-disabled")).toBe("true");

        apply.click();

        expect(applyRuleNow).not.toHaveBeenCalled();
    });

    it("refuses a rule that has nothing to apply and says why", () => {
        windowManagerMock.lastActiveWindow = {
            id: "apply-target",
            windowType: "journal",
            symbol: "",
            applyRuleNow: vi.fn(() => true),
        };
        settingsMock.windowRules = [{ windowType: "journal", enabled: true }];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-apply",
        );
        if (!apply) throw new Error("apply button not rendered");

        expect(apply.getAttribute("aria-disabled")).toBe("true");
        expect(host.textContent).toContain(
            lookup("settings.windowRulesApplyNothing"),
        );
    });

    it("shows the window's refusal when it rejects an otherwise valid rule", () => {
        windowManagerMock.lastActiveWindow = {
            id: "refusing-target",
            windowType: "journal",
            symbol: "",
            applyRuleNow: vi.fn(() => false),
        };
        settingsMock.windowRules = [
            { windowType: "journal", enabled: true, x: 120 },
        ];
        render();

        const apply = host.querySelector<HTMLButtonElement>(
            "#window-rule-journal-apply",
        );
        if (!apply) throw new Error("apply button not rendered");
        expect(apply.getAttribute("aria-disabled")).not.toBe("true");

        apply.click();
        flushSync();

        expect(host.textContent).toContain(
            lookup("settings.windowRulesApplyRefused"),
        );
        expect(windowManagerMock.restack).not.toHaveBeenCalled();
    });
});
