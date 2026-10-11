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
 * FEAT-0026 / BUG-0667 — the account switch and its confirmation.
 *
 * The claim under test: clicking "Make active" on a second account
 * must open the confirmation dialog (the default policy requires it
 * for `account-switch`) and must not switch anything until the human
 * confirms. The real confirmation policy store decides whether the
 * dialog opens — a test that stubbed the policy away could not
 * catch a gate that stopped asking.
 *
 * `ModalFrame` is replaced with the passthrough helper so the dialog
 * renders where it is declared: the real frame registers a window
 * with the shared WindowManager, which a component test cannot see.
 * What that window does once registered is an integration question —
 * BUG-0667 reports it never becomes visible in the settings view.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

const locale = vi.hoisted(() => ({ current: "en" as "en" | "de" }));

vi.mock("../../locales/i18n", async () => {
    const enBundle = (await import("../../locales/locales/en.json")).default;
    const deBundle = (await import("../../locales/locales/de.json")).default;
    /**
     * svelte-i18n's signature: `$(key, { values })`. Placeholders are
     * interpolated here too, so an assertion can match the copy a user reads.
     */
    const resolve = (key: string, options?: { values?: Record<string, string> }) => {
        const bundle = locale.current === "de" ? deBundle : enBundle;
        const value = key
            .split(".")
            .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
        if (typeof value !== "string") return key;
        const values = options?.values;
        if (!values) return value;
        return value.replace(/\{(\w+)\}/g, (whole, name: string) =>
            name in values ? values[name] : whole,
        );
    };
    return {
        _: {
            subscribe: (run: (value: typeof resolve) => void) => {
                run(resolve);
                return () => {};
            },
        },
    };
});

const settings = vi.hoisted(() => ({
    apiProvider: "bitunix",
    accounts: [
        { id: "acc-1", name: "Main", exchange: "bitunix", keys: {} },
        { id: "acc-2", name: "Second", exchange: "bitunix", keys: {} },
    ],
    activeAccountId: "acc-1",
    setActiveAccount: vi.fn(),
    renameAccount: vi.fn(),
    addAccount: vi.fn(),
    removeAccount: vi.fn(),
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

const modalState = vi.hoisted(() => ({ show: vi.fn(async () => false) }));
vi.mock("../../stores/modal.svelte", () => ({ modalState }));

const accountVerification = vi.hoisted(() => ({
    statusFor: vi.fn(() => "unconfigured"),
    recordFor: vi.fn(() => undefined),
}));
vi.mock("../../stores/accountVerification.svelte", () => ({
    accountVerification,
}));

vi.mock("../shared/ModalFrame.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte"))
        .default,
}));

import AccountList from "./AccountList.svelte";
import { confirmationPolicyStore } from "../../stores/confirmationPolicy.svelte";

let host: HTMLDivElement;
let component: Record<string, unknown> | null = null;

function render(): void {
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(AccountList, { target: host });
    flushSync();
}

/** Every "Make active" control, in row order. */
function makeActiveButtons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).filter(
        (button) => button.textContent?.includes("Make active"),
    );
}

/**
 * The open dialog's title, or null when none is open. The passthrough stub
 * carries the frame title as its `aria-label` rather than as text, so this
 * throws instead of answering "" — a missing dialog must not read as a
 * dialog without a heading.
 */
function dialogHeading(): string {
    const stub = host.querySelector('[data-testid="modal-frame-stub"]');
    if (!stub) throw new Error("no dialog is open");
    return stub.getAttribute("aria-label") ?? "";
}

function buttonLabelled(label: string): HTMLButtonElement {
    const button = Array.from(host.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === label,
    );
    if (!button) throw new Error(`no button labelled "${label}"`);
    return button;
}

beforeEach(() => {
    locale.current = "en";
    localStorage.clear();
    confirmationPolicyStore.reset();
    settings.activeAccountId = "acc-1";
    for (const fn of [
        settings.setActiveAccount,
        settings.renameAccount,
        settings.addAccount,
        settings.removeAccount,
    ]) {
        fn.mockClear();
    }
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host?.remove();
    localStorage.clear();
});

describe("AccountList", () => {
    it("renders one switch control per account and disables the active row's", () => {
        render();

        const buttons = makeActiveButtons();
        expect(buttons).toHaveLength(2);
        expect(buttons[0].disabled).toBe(true);
        expect(buttons[1].disabled).toBe(false);
    });

    it("opens the confirmation dialog before switching anything (BUG-0667)", () => {
        render();
        makeActiveButtons()[1].click();
        flushSync();

        // The dialog names both sides of the switch...
        expect(dialogHeading()).toContain("Switch account");
        expect(host.textContent).toContain("Current account");
        expect(host.textContent).toContain("Main");
        expect(host.textContent).toContain("Switching to");
        expect(host.textContent).toContain("Second");
        // ...and nothing has travelled yet.
        expect(settings.setActiveAccount).not.toHaveBeenCalled();
    });

    it("switches only once the human has confirmed", () => {
        render();
        makeActiveButtons()[1].click();
        flushSync();
        buttonLabelled("Confirm").click();
        flushSync();

        expect(settings.setActiveAccount).toHaveBeenCalledTimes(1);
        expect(settings.setActiveAccount).toHaveBeenCalledWith(
            "acc-2",
            expect.objectContaining({ confirmedAt: expect.any(Number) }),
        );
    });

    it("keeps the current account when the dialog is cancelled", () => {
        render();
        makeActiveButtons()[1].click();
        flushSync();
        buttonLabelled("Cancel").click();
        flushSync();

        expect(settings.setActiveAccount).not.toHaveBeenCalled();
        expect(host.textContent).not.toContain("Switching to");
    });

    it("switches without the dialog when the policy allows it", () => {
        confirmationPolicyStore.setRequired("account-switch", false);
        render();
        makeActiveButtons()[1].click();
        flushSync();

        expect(settings.setActiveAccount).toHaveBeenCalledWith(
            "acc-2",
            expect.objectContaining({ confirmedAt: null }),
        );
        expect(host.querySelector('[data-testid="modal-frame-stub"]')).toBeNull();
    });
});
