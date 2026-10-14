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
 * The TP row header: the first target is the one the venue receives, and
 * that meaning lives on the "TP 1" label — as a tooltip and as text the
 * accessibility tree always carries. The former "Exchange Order TP" badge
 * is gone, so its wording must not reappear, and the later targets keep
 * their "Partial Target" hint.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

const settingsStateMock = vi.hoisted(() => ({ showTooltips: true }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settingsStateMock }));

const tradeStateMock = vi.hoisted(() => ({ targets: [] as unknown[], update: vi.fn() }));
vi.mock("../../stores/trade.svelte", () => ({ tradeState: tradeStateMock }));

vi.mock("../../services/app", () => ({ app: { adjustTpPercentages: vi.fn() } }));
vi.mock("../../services/trackingService", () => ({ trackCustomEvent: vi.fn() }));
vi.mock("../../actions/tracking", () => ({ trackClick: () => ({ destroy() {} }) }));
vi.mock("../../lib/actions/inputEnhancements", () => ({
    enhancedInput: () => ({ destroy() {} }),
}));

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string) => lookup(key) ?? key),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import TakeProfitRow from "./TakeProfitRow.svelte";

const FIRST_TARGET_EXPLANATION = en.orderEntry.notes.firstTargetOnly;
const RETIRED_BADGE = "Exchange Order TP";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

function render(index: number) {
    component = mount(TakeProfitRow, {
        target: host,
        props: { index, price: "70000", percent: "30", isLocked: false },
    }) as unknown as Record<string, unknown>;
    flushSync();
}

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

describe("TakeProfitRow header", () => {
    it("carries the first-target explanation on the TP 1 label for assistive tech", () => {
        render(0);

        expect(host.textContent).toContain("TP 1");
        const srOnly = host.querySelector(".sr-only");
        expect(srOnly?.textContent).toContain(FIRST_TARGET_EXPLANATION);
    });

    it("no longer renders the retired exchange-order badge", () => {
        render(0);

        expect(host.textContent).not.toContain(RETIRED_BADGE);
    });

    it("keeps the partial-target hint and drops the explanation on later rows", () => {
        render(1);

        expect(host.textContent).toContain("TP 2");
        expect(host.textContent).toContain("Partial Target");
        expect(host.textContent).not.toContain(FIRST_TARGET_EXPLANATION);
    });
});
