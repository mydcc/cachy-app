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

// @vitest-environment happy-dom

/*
 * BUG-0557 at the surface the user actually types into.
 *
 * The store's own rules are covered by `rmsService_riskLimits.test.ts`.
 * What only a mounted component can show is the wiring around them: that
 * clearing the field really stores "no limit" instead of zero, that junk is
 * refused inline while the previously stored ceiling survives, and that a
 * rejected field keeps its own error until that field — and only that field —
 * is edited again.
 *
 * Translation is looked up in the real `en.json`, so a missing key fails here
 * instead of rendering as a raw key in production.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
import de from "../../locales/locales/de.json";
import { CONSTANTS } from "../../lib/constants";

/** Resolves a dotted key against a locale bundle, as `$_` would. */
function lookup(
    bundle: unknown,
    key: string,
    values: Record<string, string | number> = {},
): string {
    const value = key
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
    if (typeof value !== "string") return key;
    return Object.entries(values).reduce(
        (text, [name, replacement]) => text.split(`{${name}}`).join(String(replacement)),
        value,
    );
}

const locale = vi.hoisted(() => ({ current: "en" as "en" | "de" }));

vi.mock("../../locales/i18n", async () => {
    const enBundle = (await import("../../locales/locales/en.json")).default;
    const deBundle = (await import("../../locales/locales/de.json")).default;
    const resolve = (
        key: string,
        options?: { values?: Record<string, string | number> },
    ) => {
        const bundle = locale.current === "de" ? deBundle : enBundle;
        const value = key
            .split(".")
            .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
        if (typeof value !== "string") return key;
        return Object.entries(options?.values ?? {}).reduce(
            (text, [name, replacement]) => text.split(`{${name}}`).join(String(replacement)),
            value,
        );
    };

    return {
        _: {
            subscribe: (run: (value: (key: string) => string) => void) => {
                run(resolve);
                return () => {};
            },
        },
        locale: {
            subscribe: (run: (value: string) => void) => {
                run(locale.current);
                return () => {};
            },
        },
        setLocale: vi.fn(),
    };
});

// The heavy window/toast layer behind these stores is irrelevant here and
// drags half the app into a component test; the form only calls `show` on
// confirm and `showError` when persisting fails.
vi.mock("../../stores/ui.svelte", () => ({
    uiState: { showError: vi.fn(), showFeedback: vi.fn() },
}));
vi.mock("../../stores/modal.svelte", () => ({
    modalState: { show: vi.fn(async () => false) },
}));
vi.mock("../../stores/journal.svelte", () => ({
    journalState: { entries: [] },
}));
vi.mock("../../stores/closeAllFlow", () => ({
    confirmAndCloseAllPositions: vi.fn(async () => {}),
}));

// Mutable so the status-line branches are reachable: a fixed `complete: true,
// loss: 0` assessment could only ever render "armed".
const dailyLoss = vi.hoisted(() => ({
    loss: "0",
    complete: true,
    cause: null as "no-amount" | "no-exit-date" | "unknown-status" | "stale-sync" | null,
}));

vi.mock("../../services/rmsService", async () => {
    const { Decimal } = await import("decimal.js");
    const { riskState: store } = await import("../../stores/riskLimits.svelte");
    return {
        rmsService: {
            realizedPnlToday: () => new Decimal(dailyLoss.loss),
            assessDailyLoss: () => ({
                loss: new Decimal(dailyLoss.loss),
                complete: dailyLoss.complete,
                cause: dailyLoss.cause,
            }),
            maybeAutoEngageKillSwitch: vi.fn(),
            killSwitchScope: () => {
                const config = store.killSwitchConfig;
                return {
                    addsBlocked: config.blockAdds,
                    nonTpSlModifiesBlocked: config.blockNonTpSlModifies,
                };
            },
        },
        // The real boundary, not `(now) => now`: the suppression flag is
        // compared against a UTC day start, so an identity stub could never
        // satisfy the comparison.
        utcDayStart: (now: number) => {
            const date = new Date(now);
            return Date.UTC(
                date.getUTCFullYear(),
                date.getUTCMonth(),
                date.getUTCDate(),
            );
        },
    };
});

import RiskLimitsSettings from "./RiskLimitsSettings.svelte";
import { riskState } from "../../stores/riskLimits.svelte";
import { modalState } from "../../stores/modal.svelte";
import { rmsService } from "../../services/rmsService";

let host: HTMLDivElement;
let component: Record<string, unknown> | null = null;

function input(id: string): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>(`#${id}`);
    if (!el) throw new Error(`#${id} not rendered`);
    return el;
}

function typeInto(el: HTMLInputElement, value: string): void {
    el.dispatchEvent(new Event("focus"));
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

/** Blur/Enter — the threshold field commits on `change`, not on `input`. */
function commit(el: HTMLInputElement, value?: string): void {
    if (value !== undefined) el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
}

function errorVisible(bundle: "en" | "de" = "en", key?: string): boolean {
    const translations = bundle === "de" ? de : en;
    const text = host.textContent ?? "";
    if (key) return text.includes(lookup(translations, key));
    return text.includes(lookup(translations, "settings.risk.invalidValue")) ||
        text.includes(lookup(translations, "settings.risk.invalidMaxOpenPositions"));
}

function button(label: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === label,
    );
    if (!match) throw new Error(`Button not found: ${label}`);
    return match;
}

/**
 * Re-render after mutating the mocked assessment. The component derives the
 * figure from the journal's length, and this test's mock journal is a plain
 * array — nothing would invalidate the derivation otherwise.
 */
function remount(): void {
    if (component) unmount(component as never);
    component = mount(RiskLimitsSettings, { target: host }) as Record<string, unknown>;
    flushSync();
}

function maxPositions(): HTMLInputElement {
    return input("risk-maxOpenPositions");
}

beforeEach(() => {
    locale.current = "en";
    localStorage.clear();
    riskState.reloadFromStorage();
    riskState.resetLimits();
    vi.clearAllMocks();
    riskState.setKillSwitchOption("blockAdds", true);
    riskState.setKillSwitchOption("blockNonTpSlModifies", true);
    riskState.setKillSwitchOption("confirmEngage", true);
    riskState.setKillSwitchOption("autoEngageDailyLossUsdt", null);
    dailyLoss.loss = "0";
    dailyLoss.complete = true;
    dailyLoss.cause = null;
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(RiskLimitsSettings, { target: host }) as Record<string, unknown>;
    flushSync();
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    localStorage.clear();
});

describe("BUG-0557 — RiskLimitsSettings keeps no-limit and zero apart", () => {
    it("stores a positive integer and shows no error", () => {
        typeInto(maxPositions(), "3");

        expect(riskState.maxOpenPositions).toBe(3);
        expect(errorVisible()).toBe(false);
        expect(maxPositions().classList.contains("border-danger")).toBe(false);
    });

    it("clears the stored limit when the field is emptied", () => {
        riskState.setLimit("maxOpenPositions", 2);
        flushSync();
        expect(maxPositions().value).toBe("2");

        typeInto(maxPositions(), "");

        expect(riskState.maxOpenPositions).toBe(null);
        expect(maxPositions().placeholder).toBe(
            lookup(en, "settings.risk.notConfigured"),
        );
        expect(errorVisible()).toBe(false);
    });

    it("clears the stored limit when only whitespace is typed", () => {
        riskState.setLimit("maxOpenPositions", 2);
        flushSync();

        typeInto(maxPositions(), "   ");

        expect(riskState.maxOpenPositions).toBe(null);
        expect(errorVisible()).toBe(false);
    });

    it.each(["2.5", "abc", "1,5"])(
        "rejects %s inline without changing the stored limit",
        (bad) => {
            riskState.setLimit("maxOpenPositions", 2);
            flushSync();

            typeInto(maxPositions(), bad);

            expect(riskState.maxOpenPositions).toBe(2);
            expect(errorVisible()).toBe(true);
            expect(maxPositions().value).toBe(bad);
            expect(maxPositions().classList.contains("border-danger")).toBe(true);
        },
    );

    it("rejects a count string the store refuses instead of parsing it itself", () => {
        riskState.setLimit("maxOpenPositions", 2);
        flushSync();

        // "1e3" is a valid number but not a count of positions: the form used
        // to parseInt it into 1000 before the store could refuse it.
        typeInto(maxPositions(), "1e3");

        expect(riskState.maxOpenPositions).toBe(2);
        expect(errorVisible()).toBe(true);
    });

    it("keeps a rejected field's error when a different field is edited", () => {
        riskState.setLimit("maxOpenPositions", 2);
        flushSync();
        typeInto(maxPositions(), "2.5");
        expect(errorVisible()).toBe(true);

        typeInto(input("risk-maxLeverage"), "5");

        expect(riskState.limits.maxLeverage).toBe("5");
        expect(riskState.maxOpenPositions).toBe(2);
        expect(errorVisible()).toBe(true);
        expect(maxPositions().classList.contains("border-danger")).toBe(true);
        expect(maxPositions().value).toBe("2.5");
    });

    it("keeps separate field errors simultaneously visible", () => {
        typeInto(input("risk-maxLeverage"), "-1");
        typeInto(maxPositions(), "2.5");

        expect(input("risk-maxLeverage").classList.contains("border-danger")).toBe(true);
        expect(maxPositions().classList.contains("border-danger")).toBe(true);
        expect(errorVisible("en", "settings.risk.invalidValue")).toBe(true);
        expect(errorVisible("en", "settings.risk.invalidMaxOpenPositions")).toBe(true);
    });

    it("clears every field error after a confirmed reset", async () => {
        typeInto(input("risk-maxLeverage"), "-1");
        typeInto(maxPositions(), "2.5");
        expect(errorVisible()).toBe(true);

        vi.mocked(modalState.show).mockResolvedValueOnce(true);
        button(lookup(en, "settings.risk.resetLimits")).click();
        await vi.waitFor(() => {
            expect(errorVisible()).toBe(false);
        });

        expect(input("risk-maxLeverage").classList.contains("border-danger")).toBe(false);
        expect(maxPositions().classList.contains("border-danger")).toBe(false);
    });

    it("renders the integer-specific max-position error in German", () => {
        locale.current = "de";
        unmount(component!);
        component = mount(RiskLimitsSettings, { target: host }) as Record<string, unknown>;
        flushSync();

        typeInto(maxPositions(), "2.5");

        expect(errorVisible("de", "settings.risk.invalidMaxOpenPositions")).toBe(true);
        expect(lookup(de, "settings.risk.invalidMaxOpenPositions")).toBe(
            "Dieser Wert wurde nicht gespeichert. Das Limit für gleichzeitig offene Positionen muss eine ganze, nicht negative Zahl sein.",
        );
    });

    it("uses exact whole non-negative integer copy in both locales", () => {
        expect(lookup(en, "settings.risk.invalidMaxOpenPositions")).toBe(
            "That value was not stored. Max concurrent open positions must be a whole non-negative integer.",
        );
        expect(lookup(de, "settings.risk.invalidMaxOpenPositions")).toBe(
            "Dieser Wert wurde nicht gespeichert. Das Limit für gleichzeitig offene Positionen muss eine ganze, nicht negative Zahl sein.",
        );
    });

    it("surfaces an unreadable stored ceiling as a repairable invalid state", () => {
        unmount(component!);
        localStorage.setItem(
            CONSTANTS.LOCAL_STORAGE_RISK_KEY,
            JSON.stringify({ limits: { maxOpenPositions: "2.5" } }),
        );
        riskState.reloadFromStorage();
        component = mount(RiskLimitsSettings, { target: host }) as Record<string, unknown>;
        flushSync();

        expect(riskState.hasInvalidMaxOpenPositions).toBe(true);
        expect(errorVisible("en", "settings.risk.invalidStoredMaxOpenPositions")).toBe(true);
        expect(maxPositions().value).toBe("2.5");
        expect(maxPositions().getAttribute("aria-invalid")).toBe("true");
        expect(maxPositions().getAttribute("aria-describedby")).toBe(
            "risk-maxOpenPositions-stored-error",
        );
    });

    it("clears the error once the same field holds a valid value", () => {
        riskState.setLimit("maxOpenPositions", 2);
        flushSync();
        typeInto(maxPositions(), "2.5");
        expect(errorVisible()).toBe(true);

        typeInto(maxPositions(), "3");

        expect(riskState.maxOpenPositions).toBe(3);
        expect(errorVisible()).toBe(false);
        expect(maxPositions().classList.contains("border-danger")).toBe(false);
    });

    it("renders the count as a text input with a numeric keypad", () => {
        // type="number" silently clears the field when the user pastes "1,000"
        // or types an intermediate "2.", so the raw text has to survive.
        expect(maxPositions().type).toBe("text");
        expect(maxPositions().getAttribute("inputmode")).toBe("numeric");
        expect(maxPositions().hasAttribute("min")).toBe(false);
        expect(maxPositions().hasAttribute("step")).toBe(false);
    });
});

function toggleSwitch(id: string, checked: boolean): void {
    const el = host.querySelector<HTMLInputElement>(`#${id}`);
    if (!el) throw new Error(`#${id} not rendered`);
    el.checked = checked;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
}

describe("FEAT-0526 — kill switch explanation and configuration", () => {
    it("asks before engaging by default", async () => {
        button(lookup(en, "settings.risk.killSwitch.engage")).click();

        await vi.waitFor(() => expect(modalState.show).toHaveBeenCalledTimes(1));
        expect(riskState.isKillSwitchEngaged).toBe(false);
    });

    it("engages when the confirmation is accepted", async () => {
        vi.mocked(modalState.show).mockResolvedValueOnce(true);

        button(lookup(en, "settings.risk.killSwitch.engage")).click();

        await vi.waitFor(() => expect(riskState.isKillSwitchEngaged).toBe(true));
        expect(modalState.show).toHaveBeenCalledTimes(1);
    });

    it("engages immediately when the confirmation is off", async () => {
        riskState.setKillSwitchOption("confirmEngage", false);
        flushSync();

        button(lookup(en, "settings.risk.killSwitch.engage")).click();
        await vi.waitFor(() => expect(riskState.isKillSwitchEngaged).toBe(true));
        expect(modalState.show).not.toHaveBeenCalled();
    });

    it("reflects an add-scope change in the explanation", () => {
        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.scope.addsBlocked"),
        );

        toggleSwitch("kill-switch-block-adds", false);

        expect(riskState.killSwitchConfig.blockAdds).toBe(false);
        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.scope.addsPermitted"),
        );
        expect(host.textContent).not.toContain(
            lookup(en, "settings.risk.killSwitch.scope.addsBlocked"),
        );
    });

    it("reflects a modify-scope change in the explanation", () => {
        toggleSwitch("kill-switch-block-modifies", false);

        expect(riskState.killSwitchConfig.blockNonTpSlModifies).toBe(false);
        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.scope.modifiesPermitted"),
        );
    });

    it("commits the auto-engage threshold on change, not on every keystroke", () => {
        const field = input("kill-switch-auto-engage");
        vi.mocked(rmsService.maybeAutoEngageKillSwitch).mockClear();

        // Typing "1000" passes through "1": a threshold of 1 is below a real
        // loss, so committing per keystroke would arm the switch mid-typing.
        for (const partial of ["1", "10", "100", "1000"]) {
            typeInto(field, partial);
            expect(riskState.killSwitchConfig.autoEngageDailyLossUsdt).toBeNull();
        }
        expect(rmsService.maybeAutoEngageKillSwitch).not.toHaveBeenCalled();

        commit(field);

        expect(riskState.killSwitchConfig.autoEngageDailyLossUsdt).toBe("1000");
        expect(rmsService.maybeAutoEngageKillSwitch).toHaveBeenCalledTimes(1);
    });

    it("stores the auto-engage threshold and rejects a zero", () => {
        const field = input("kill-switch-auto-engage");
        typeInto(field, "250");
        commit(field);
        expect(riskState.killSwitchConfig.autoEngageDailyLossUsdt).toBe("250");

        typeInto(field, "0");
        commit(field);

        expect(riskState.killSwitchConfig.autoEngageDailyLossUsdt).toBe("250");
        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.autoEngage.invalid"),
        );
    });

    it("shows a stored threshold that cannot be interpreted instead of hiding it", () => {
        // A hand-edited or corrupted blob: the schema keeps the raw text, and
        // the form must not present it as "off".
        localStorage.setItem(
            CONSTANTS.LOCAL_STORAGE_RISK_KEY,
            JSON.stringify({ limits: {}, killSwitch: { autoEngageDailyLossUsdt: "-5" } }),
        );
        riskState.reloadFromStorage();
        remount();

        expect(riskState.hasInvalidAutoEngageThreshold).toBe(true);
        expect(input("kill-switch-auto-engage").value).toBe("-5");
        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.autoEngage.invalid"),
        );
    });

    it("renders the armed status with the threshold", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "250");
        flushSync();

        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.autoEngage.armed", {
                threshold: "250.00",
                loss: "0.00",
            }),
        );
    });

    it("says the threshold is already reached instead of claiming it is armed", () => {
        dailyLoss.loss = "-300";
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "250");
        remount();

        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.autoEngage.reached", {
                threshold: "250.00",
                loss: "300.00",
            }),
        );
    });

    it("says the switch is engaged rather than describing a future engagement", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "250");
        riskState.engageKillSwitch();
        flushSync();

        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.autoEngage.engaged"),
        );
    });

    it("says auto-engage is suppressed for the rest of the UTC day", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "250");
        riskState.engageKillSwitch();
        riskState.releaseKillSwitch({ confirmed: true });
        flushSync();

        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.autoEngage.suppressedToday"),
        );
    });

    it("names the cause when today cannot be measured", () => {
        dailyLoss.complete = false;
        dailyLoss.cause = "no-exit-date";
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "250");
        remount();

        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.autoEngage.unmeasurable", {
                cause: lookup(en, "settings.risk.killSwitch.autoEngage.cause.no-exit-date"),
            }),
        );
    });

    it("renders the off state when no threshold is set", () => {
        expect(host.textContent).toContain(
            lookup(en, "settings.risk.killSwitch.autoEngage.off"),
        );
    });

    it("evaluates auto-engage when the panel opens", () => {
        // A threshold saved before today's loss crossed must arm on open.
        expect(rmsService.maybeAutoEngageKillSwitch).toHaveBeenCalled();
    });

    it("associates each toggle with its visible label", () => {
        const labels: Array<[string, string]> = [
            ["kill-switch-block-adds", "settings.risk.killSwitch.blockAdds.label"],
            ["kill-switch-block-modifies", "settings.risk.killSwitch.blockModifies.label"],
            ["kill-switch-confirm-engage", "settings.risk.killSwitch.confirmEngage.label"],
        ];
        for (const [id, key] of labels) {
            const label = Array.from(host.querySelectorAll("label")).find(
                (candidate) => candidate.getAttribute("for") === id,
            );
            expect(label, `no label for ${id}`).toBeTruthy();
            expect(label?.textContent).toContain(lookup(en, key));
        }
    });
});
