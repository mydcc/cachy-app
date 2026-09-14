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
 * FEAT-0346 — the summary panel is the last thing a trader reads before
 * sending an order, so its numbers must be exactly the props it was handed
 * and the two controls must call back rather than act on their own.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string) => key),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

vi.mock("../../services/trackingService", () => ({ trackCustomEvent: vi.fn() }));

// Tooltip reads this store; it is not otherwise part of the summary panel.
vi.mock("../../stores/settings.svelte", () => ({
    settingsState: { showTooltips: false },
}));

import SummaryResults from "./SummaryResults.svelte";

const writeText = vi.fn(async () => undefined);

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

const BASE_PROPS = {
    isPositionSizeLocked: false,
    showCopyFeedback: false,
    positionSize: "1.234",
    netLoss: "-250.00",
    requiredMargin: "300.00",
    entryFee: "12.50",
    liquidationPrice: "41 000",
    breakEvenPrice: "52 000",
};

function render(overrides: Partial<typeof BASE_PROPS> & Record<string, unknown> = {}) {
    component = mount(SummaryResults, {
        target: host,
        props: { ...BASE_PROPS, ...overrides },
    }) as never;
    flushSync();
}

function byId(id: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`#${id}`);
}

beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("FEAT-0346 — SummaryResults renders the values it was given", () => {
    it("shows every result exactly as passed in", () => {
        render();

        expect(byId("positionSize")?.textContent?.trim()).toBe("1.234");
        expect(byId("netLoss")?.textContent?.trim()).toBe("-250.00");
        expect(byId("requiredMargin")?.textContent?.trim()).toBe("300.00");
        expect(byId("entryFee")?.textContent?.trim()).toBe("12.50");
        expect(byId("liquidationPrice")?.textContent?.trim()).toBe("41 000");
        expect(byId("breakEvenPrice")?.textContent?.trim()).toBe("52 000");
    });

    it("copies the position size and reports the copy back", () => {
        const oncopy = vi.fn();
        render({ oncopy });

        byId("copy-btn")?.click();

        expect(writeText).toHaveBeenCalledWith("1.234");
        expect(oncopy).toHaveBeenCalledTimes(1);
    });

    it("toggles the lock through its callback instead of flipping locally", () => {
        const ontogglelock = vi.fn();
        render({ ontogglelock });

        byId("lock-position-size-btn")?.click();

        expect(ontogglelock).toHaveBeenCalledTimes(1);
        // The prop is the single source of truth: without a re-render the
        // button must still show the unlocked icon.
        expect(byId("lock-position-size-btn")?.innerHTML).toContain("M12 17");
    });

    it("warns when the required margin exceeds the balance", () => {
        render({ isMarginExceeded: true });

        expect(host.textContent).toContain("dashboard.summaryResults.insufficientBalance");
        expect(byId("positionSize")?.getAttribute("style")).toContain("--danger-color");
        expect(byId("requiredMargin")?.getAttribute("style")).toContain("--danger-color");
    });

    it("shows the copied feedback only while the flag is set", () => {
        render({ showCopyFeedback: true });
        expect(byId("copy-feedback")?.textContent?.trim()).toBe(
            "dashboard.summaryResults.copiedFeedback",
        );

        unmount(component as never);
        component = null;
        host.innerHTML = "";
        render({ showCopyFeedback: false });
        expect(byId("copy-feedback")).toBeNull();
    });
});
