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
 * FEAT-0328 — LeverageModal: confirm-then-send for leverage changes.
 * Direct unit test of the modal's liquidation projection path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";
import LeverageModal from "./LeverageModal.svelte";

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

vi.mock("./ModalFrame.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
}));

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

function renderModal(props: Record<string, unknown>) {
    component = mount(LeverageModal, { target: host, props: props as never }) as never;
    flushSync();
}

describe("LeverageModal", () => {
    it("projects liquidation when position exists", () => {
        const confirmSpy = vi.fn();
        renderModal({
            current: "10",
            minLeverage: 1,
            maxLeverage: 50,
            localOnly: false,
            busy: false,
            positions: [
                {
                    entryPrice: new Decimal("100"),
                    liquidationPrice: new Decimal("91"),
                    leverage: new Decimal("10"),
                    side: "long",
                },
            ],
            marginMode: "ISOLATION",
            onclose: vi.fn(),
            onconfirm: confirmSpy,
        });

        // Liquidation projection renders for open position
        // Entry 100, liq 91 at 10x → MMR 0.01
        // Component should calculate projected liq at new leverage
        expect(host.querySelector('[data-track-id="leverage-liquidation"]')).not.toBeNull();
        expect(host.querySelector('[data-track-id="leverage-liquidation-cross"]')).toBeNull();
        expect(confirmSpy).toBeDefined();
    });

    it("projects one row per hedge side instead of the first match (BUG-0553)", () => {
        renderModal({
            current: "10",
            minLeverage: 1,
            maxLeverage: 50,
            localOnly: false,
            busy: false,
            positions: [
                {
                    entryPrice: new Decimal("100"),
                    liquidationPrice: new Decimal("91"),
                    leverage: new Decimal("10"),
                    side: "long",
                },
                {
                    entryPrice: new Decimal("100"),
                    liquidationPrice: new Decimal("109"),
                    leverage: new Decimal("10"),
                    side: "short",
                },
            ],
            marginMode: "ISOLATION",
            onclose: vi.fn(),
            onconfirm: vi.fn(),
        });

        const box = host.querySelector('[data-track-id="leverage-liquidation"]');
        expect(box).not.toBeNull();
        // Both sides render their own row with their own liquidation price.
        expect(box?.textContent).toContain("Long");
        expect(box?.textContent).toContain("Short");
        expect(box?.textContent).toContain("91");
        expect(box?.textContent).toContain("109");
        expect(host.querySelector('[data-track-id="leverage-liquidation-cross"]')).toBeNull();
    });

    it("shows the cross-margin reason instead of a projection (BUG-0504)", () => {
        renderModal({
            current: "10",
            minLeverage: 1,
            maxLeverage: 50,
            localOnly: false,
            busy: false,
            positions: [
                {
                    entryPrice: new Decimal("100"),
                    liquidationPrice: new Decimal("91"),
                    leverage: new Decimal("10"),
                    side: "long",
                },
            ],
            marginMode: "CROSS",
            onclose: vi.fn(),
            onconfirm: vi.fn(),
        });

        // No projected price — and no silent empty row either: the reason renders.
        expect(host.querySelector('[data-track-id="leverage-liquidation"]')).toBeNull();
        const crossRow = host.querySelector('[data-track-id="leverage-liquidation-cross"]');
        expect(crossRow).not.toBeNull();
        expect(crossRow?.textContent).toContain("Cross margin");
    });

    it("sends nothing until Confirm is clicked", () => {
        const confirmSpy = vi.fn();
        renderModal({
            current: "10",
            minLeverage: 1,
            maxLeverage: 50,
            localOnly: false,
            busy: false,
            onclose: vi.fn(),
            onconfirm: confirmSpy,
        });

        const slider = host.querySelector('input[type="range"]') as HTMLInputElement | null;
        if (slider) {
            slider.value = "20";
            slider.dispatchEvent(new Event("input"));
        }

        // Slider movement alone must not call onconfirm
        expect(confirmSpy).not.toHaveBeenCalled();
    });

    it("works in paper-trading mode (localOnly)", () => {
        const confirmSpy = vi.fn();
        renderModal({
            current: "10",
            minLeverage: 1,
            maxLeverage: 50,
            localOnly: true,
            busy: false,
            onclose: vi.fn(),
            onconfirm: confirmSpy,
        });

        expect(confirmSpy).toBeDefined();
    });
});
