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
 * FEAT-0024's first and last acceptance criteria, proved at the surface the
 * user actually touches: every action toggles independently, and both
 * languages carry the strings.
 *
 * The store's own behaviour is covered by `orderGate.confirmation.test.ts`.
 * What only a mounted component can show is the wiring — that row N's switch
 * reaches action N's policy entry and nothing else. An off-by-one in the
 * `{#each}` key would pass every service-level test and silently arm the wrong
 * action, which is the failure this test exists to catch.
 *
 * Translation is looked up in the real `en.json` and `de.json` rather than
 * stubbed, so a missing key fails here instead of rendering as a raw key in
 * production.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
import de from "../../locales/locales/de.json";

/** Resolves a dotted key against a locale bundle, as `$_` would. */
function lookup(bundle: unknown, key: string): string {
    const value = key
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
    return typeof value === "string" ? value : key;
}

const locale = vi.hoisted(() => ({ current: "en" as "en" | "de" }));

vi.mock("../../locales/i18n", async () => {
    const enBundle = (await import("../../locales/locales/en.json")).default;
    const deBundle = (await import("../../locales/locales/de.json")).default;
    const resolve = (key: string) => {
        const bundle = locale.current === "de" ? deBundle : enBundle;
        const value = key
            .split(".")
            .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
        return typeof value === "string" ? value : key;
    };
    return {
        _: {
            subscribe: (run: (value: (key: string) => string) => void) => {
                run(resolve);
                return () => {};
            },
        },
    };
});

import ConfirmationSettings from "./ConfirmationSettings.svelte";
import { confirmationPolicyStore } from "../../stores/confirmationPolicy.svelte";
import { CONFIRMABLE_ACTIONS, DEFAULT_CONFIRMATION_POLICY } from "../../lib/confirmationPolicy";

let host: HTMLDivElement;
let component: Record<string, unknown> | null = null;

function render(): void {
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(ConfirmationSettings, { target: host });
    flushSync();
}

/** The switch for one action, addressed by the id the label points at. */
function switchFor(action: string): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>(`#confirm-${action}`);
    if (!input) throw new Error(`no switch rendered for "${action}"`);
    return input;
}

beforeEach(() => {
    locale.current = "en";
    localStorage.clear();
    confirmationPolicyStore.reset();
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host?.remove();
    localStorage.clear();
});

describe("ConfirmationSettings", () => {
    it("renders one switch per confirmable action", () => {
        render();

        for (const action of CONFIRMABLE_ACTIONS) {
            expect(switchFor(action)).toBeTruthy();
        }
    });

    it("reflects the current policy on first paint", () => {
        render();

        expect(switchFor("flash-close-position").checked).toBe(true);
        expect(switchFor("place-order").checked).toBe(false);
    });

    it("toggles one action without touching any other", () => {
        // The acceptance criterion: independence. A shared reference or a bad
        // `{#each}` key would show up here and nowhere else.
        render();
        const before = { ...confirmationPolicyStore.policy };

        const target = switchFor("place-order");
        target.checked = true;
        target.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();

        expect(confirmationPolicyStore.policy["place-order"]).toBe(true);
        for (const action of CONFIRMABLE_ACTIONS) {
            if (action === "place-order") continue;
            expect(confirmationPolicyStore.policy[action]).toBe(before[action]);
        }
    });

    it("switches a default-on action off", () => {
        render();

        const target = switchFor("flash-close-position");
        target.checked = false;
        target.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();

        expect(confirmationPolicyStore.policy["flash-close-position"]).toBe(false);
    });

    it("restores the defaults", () => {
        render();
        confirmationPolicyStore.setRequired("flash-close-position", false);
        flushSync();

        const reset = host.querySelector("button");
        reset?.click();
        flushSync();

        expect(confirmationPolicyStore.policy).toEqual(DEFAULT_CONFIRMATION_POLICY);
    });

    it("says that a disabled confirmation keeps the verification", () => {
        // The distinction FEAT-0024 exists to keep visible. If this copy ever
        // disappears, a user can switch prompts off believing they switched
        // the order checks off too.
        render();

        expect(host.textContent).toContain(lookup(en, "settings.confirmations.verificationNote"));
    });
});

describe("ConfirmationSettings translations", () => {
    it("carries a label and a hint for every action, in both languages", () => {
        for (const bundle of [en, de]) {
            for (const action of CONFIRMABLE_ACTIONS) {
                const label = lookup(bundle, `settings.confirmations.actions.${action}.label`);
                const hint = lookup(bundle, `settings.confirmations.actions.${action}.hint`);

                expect(label).not.toContain("settings.confirmations");
                expect(hint).not.toContain("settings.confirmations");
            }
        }
    });

    it("renders German when German is selected", () => {
        locale.current = "de";
        render();

        expect(host.textContent).toContain(lookup(de, "settings.confirmations.title"));
        expect(host.textContent).toContain(
            lookup(de, "settings.confirmations.actions.flash-close-position.hint"),
        );
    });
});
