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
 * BUG-0651 — the shared error surface, and the three properties that make it
 * announce or not.
 *
 * The real `uiState` is used on purpose. `showError`/`hideError` are where the
 * semantics live — a test against a hand-rolled stub would prove nothing about
 * the code that writes here. Only what cannot exist in a test is replaced: the
 * DOM-dependent theme applier, the toast service, the window manager, and the
 * translation lookup (which reads the real `en.json`).
 *
 * The control case comes first. "The text changed" and "the text did not change"
 * are only meaningful as a pair: without the first, the second passes on a
 * component that never renders anything at all. That is the false green
 * BUG-0648's fixture already produced once.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync, tick } from "svelte";
import en from "../../locales/locales/en.json";

vi.mock("$app/env", () => ({ browser: true }));

vi.mock("../../services/toastService.svelte", () => ({
    toastService: {
        error: vi.fn(),
        success: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
        add: vi.fn(),
    },
}));

vi.mock("../../lib/windows/WindowManager.svelte", () => ({
    windowManager: { openWindow: vi.fn(), closeWindow: vi.fn() },
}));

function lookup(key: string): string | undefined {
    return key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        ) as string | undefined;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string, options?: { values?: Record<string, unknown> }) => {
            const template = lookup(key) ?? key;
            if (!options?.values) return template;
            return Object.entries(options.values).reduce(
                (text, [name, value]) =>
                    text.replaceAll(`{${name}}`, String(value)),
                template,
            );
        }),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import { uiState } from "../../stores/ui.svelte";
import ErrorMessage from "./ErrorMessage.svelte";

const GUIDANCE = "dashboard.promptForData";
const GUIDANCE_TEXT = lookup(GUIDANCE);
const REFUSAL_TEXT = lookup("orderEntry.errors.entryRejected");

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

function mountRegion(): HTMLElement {
    component = mount(ErrorMessage, { target: host });
    const region = host.querySelector<HTMLElement>("#error-message");
    if (!region) throw new Error("the live region is not in the DOM");
    return region;
}

beforeEach(() => {
    uiState.hideError();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    uiState.hideError();
});

describe("ErrorMessage", () => {
    // The control. If this fails, nothing below it means anything.
    it("replaces the region's text when a different message arrives", () => {
        const region = mountRegion();

        uiState.showError(GUIDANCE);
        flushSync();
        expect(region.textContent).toBe(GUIDANCE_TEXT);

        uiState.showError("orderEntry.errors.entryRejected");
        flushSync();
        expect(region.textContent).toBe(REFUSAL_TEXT);
        expect(region.textContent).not.toBe(GUIDANCE_TEXT);
    });

    it("keeps the live region in the DOM with no message", () => {
        uiState.hideError();
        const region = mountRegion();

        // Present, empty, and still a live region — the three states the
        // announcement depends on. A region created together with its first
        // message is announced inconsistently at best.
        expect(region.isConnected).toBe(true);
        expect(region.textContent?.trim()).toBe("");
        expect(region.getAttribute("role")).toBe("status");
        expect(region.getAttribute("aria-live")).toBe("polite");

        // No margin while empty. The region is now in the DOM on every load, so
        // a static `mt-4` would leave a permanent 1rem gap above the results —
        // the same hole the region was moved out of the grid to avoid, arriving
        // by a different road.
        expect(region.classList.contains("mt-4")).toBe(false);

        // Not atomic, and stated rather than inherited. `role="status"` carries
        // an implicit `aria-atomic="true"`, so asserting the attribute is
        // *absent* would pass on a region that re-announces everything it holds
        // — the opposite of the guarantee. The value has to be "false".
        expect(region.getAttribute("aria-atomic")).toBe("false");
    });

    it("announces the refusal text when an error is shown", () => {
        const region = mountRegion();

        uiState.showError("orderEntry.errors.entryRejected");
        flushSync();

        expect(region.textContent).toBe(REFUSAL_TEXT);
        // The counterpart to the empty-state assertion above: the margin exists
        // only while there is a message to sit under.
        expect(region.classList.contains("mt-4")).toBe(true);
    });

    /*
     * The invariant the polite region depends on, and the one stated as a
     * comment in `calculatorService.calculateAndDisplay`: every keystroke calls
     * `hideError()` and, for incomplete input, `showError("dashboard.promptForData")`
     * again. Both happen in one synchronous block there, and Svelte collapses
     * them into a single flush — so the region is emptied and refilled within
     * one tick, which is not two mutations.
     *
     * Nothing fails today if someone puts an `await` between those two calls in
     * the service. This case pins the property at this seam, so it fails here
     * first and points at the service comment that says the pair is
     * load-bearing.
     */
    it("does not re-announce when the same guidance is hidden and re-shown in one tick", async () => {
        uiState.showError(GUIDANCE);
        const region = mountRegion();
        await tick();

        const mutations: MutationRecord[] = [];
        const observer = new MutationObserver((records) => mutations.push(...records));
        observer.observe(region, { childList: true, subtree: true, characterData: true });

        uiState.hideError();
        uiState.showError(GUIDANCE); // same tick — what calculatorService does
        await tick();

        observer.disconnect();
        expect(mutations).toHaveLength(0);
        // And the message survived the round trip, so zero mutations means
        // "nothing was written", not "the region went blank".
        expect(region.textContent).toBe(GUIDANCE_TEXT);
    });

    /*
     * Not every writer puts a key in `uiState.errorMessage`: `+layout.svelte`
     * forwards `window.error` and `unhandledrejection` messages verbatim,
     * `PositionsSidebar` puts a cancel-order response in, `JournalContent` puts
     * an upload failure in. This pins that such text reaches the trader as
     * written instead of as a dotted path.
     *
     * It pins the *behaviour*, not the mechanism — svelte-i18n echoes a key it
     * does not know, and that is what makes this hold. A round-trip guard was
     * tried in the component as extra insurance; removing it left this test
     * green, which is how it was found to be a no-op and reverted.
     */
    it("shows third-party text as written rather than as a dotted key", () => {
        const region = mountRegion();

        uiState.showError("Cancel failed: order not found");
        flushSync();

        expect(region.textContent).toBe("Cancel failed: order not found");
    });

    // The property that makes the per-keystroke guidance safe. `clearResults`
    // writes this same string on ordinary typing; if it re-announced, a polite
    // region would still queue near-identical speech several times per sentence.
    //
    // Asserted with a MutationObserver, not node identity: Svelte's `set_text`
    // mutates `nodeValue` on the *same* node, so identity survives whether or
    // not the write was skipped — an identity assertion here would pass on a
    // component that re-announced every keystroke.
    //
    // What this test pins, precisely: after a repeated identical write, nothing
    // in the region was written. What it does *not* pin: that the identical
    // write is skipped rather than performed with the same value. Two attempts
    // to force a contradicting implementation — `{@html}`, and an `$effect`
    // writing `nodeValue` — both stayed green here, because happy-dom's
    // `innerHTML` and the effect's own dependency tracking skip identical
    // values for the same reason Svelte does.
    //
    // The skip is `$state`'s, not the template's: `internal_set` compares the
    // new value with the old and returns early on an equal one, so the effect
    // never re-runs and the text write is never reached. (An earlier version of
    // this comment credited `set_text`; the effect is never called at all.)
    // That is a code-level fact in Svelte's `sources.js`, not a test. In a real
    // browser the same assertions catch an unconditional write, because there an
    // `innerHTML` assignment always mutates. See the item's Known limits.
    it("does not touch the DOM when the same message is written again", async () => {
        uiState.showError(GUIDANCE);
        const region = mountRegion();
        await tick();

        const mutations: MutationRecord[] = [];
        const observer = new MutationObserver((records) =>
            mutations.push(...records),
        );
        observer.observe(region, {
            childList: true,
            characterData: true,
            subtree: true,
        });

        /*
         * Positive control first. An observer that never fires would make every
         * assertion below pass for the wrong reason — and the way that was
         * nearly shipped: an earlier draft of this test compared text *node
         * identity*, which Svelte preserves whether or not it skipped the
         * write, and that version stayed green when the text was re-set.
         *
         * This probe is measured, not assumed: happy-dom does report an
         * identical `nodeValue` assignment as a characterData mutation. So
         * `toHaveLength(0)` below means "nothing was written", not "nothing
         * was seen".
         */
        const probe = document.createTextNode("x");
        host.appendChild(probe);
        observer.observe(probe, { characterData: true });
        probe.nodeValue = "x";
        await tick();
        expect(mutations.length).toBeGreaterThan(0);
        mutations.length = 0;

        uiState.showError(GUIDANCE);
        flushSync();
        await tick();
        expect(mutations).toHaveLength(0);

        // Control, in the same observation window: a different message does
        // mutate, so the zero above is about the identical write specifically.
        uiState.showError("orderEntry.errors.entryRejected");
        flushSync();
        await tick();
        expect(mutations.length).toBeGreaterThan(0);

        observer.disconnect();
    });

    it("clears the text when the error is hidden but keeps the region", () => {
        uiState.showError("orderEntry.errors.entryRejected");
        const region = mountRegion();
        expect(region.textContent).toBe(REFUSAL_TEXT);

        uiState.hideError();
        flushSync();

        expect(region.textContent?.trim()).toBe("");
        expect(region.isConnected).toBe(true);
    });
});