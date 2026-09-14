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
 * FEAT-0346 — DisclaimerModal is deliberately delayed so it does not hit the
 * user mid-task. The tests pin that delay, the accept action against the
 * settings store, and that the body is sanitised before injection.
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
    const { readable } = await import("svelte/store");
    return { _: readable((key: string) => lookup(key) ?? key), locale: readable("en"), setLocale: vi.fn() };
});

const { sanitizeHtml } = vi.hoisted(() => ({ sanitizeHtml: vi.fn((html: string) => html) }));
vi.mock("$lib/utils/sanitizer", () => ({ sanitizeHtml }));

const settingsMock = vi.hoisted(() => ({ disclaimerAccepted: false }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settingsMock }));

import DisclaimerModal from "./DisclaimerModal.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
let originalAnimate: typeof HTMLElement.prototype.animate | undefined;

beforeEach(() => {
    vi.useFakeTimers();
    settingsMock.disclaimerAccepted = false;
    originalAnimate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = (() => ({
        currentTime: 0,
        playState: "finished",
        onfinish: null,
        effect: null,
        finished: Promise.resolve(),
        cancel() {},
        addEventListener() {},
        removeEventListener() {},
    })) as unknown as typeof HTMLElement.prototype.animate;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    vi.useRealTimers();
    if (originalAnimate) {
        HTMLElement.prototype.animate = originalAnimate;
    } else {
        delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    component = mount(DisclaimerModal, { target: host }) as never;
    flushSync();
}

function reveal() {
    vi.advanceTimersByTime(4000);
    flushSync();
}

describe("FEAT-0346 — DisclaimerModal waits, then records acceptance", () => {
    it("stays hidden during the delay", () => {
        render();

        expect(host.querySelector("div.fixed")).toBeNull();
    });

    it("appears once the delay has passed", () => {
        render();
        reveal();

        expect(host.querySelector("div.fixed")).toBeTruthy();
        expect(host.textContent).toContain(lookup("legal.disclaimerTitle"));
    });

    it("records acceptance on the settings store", () => {
        render();
        reveal();

        const accept = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
            (b) => b.textContent?.trim() === lookup("legal.accept"),
        );
        accept?.click();

        expect(settingsMock.disclaimerAccepted).toBe(true);
    });

    it("sanitises the disclaimer body", () => {
        render();
        reveal();

        expect(sanitizeHtml).toHaveBeenCalledWith(lookup("legal.disclaimerBody"));
    });
});
