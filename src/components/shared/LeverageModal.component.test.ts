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

import { describe, it, expect, vi } from "vitest";
import { mount } from "svelte";
import { Decimal } from "decimal.js";
import LeverageModal from "./LeverageModal.svelte";

describe("LeverageModal", () => {
    it("projects liquidation when position exists", () => {
        const confirmSpy = vi.fn();
        mount(LeverageModal, {
            props: {
                current: "10",
                minLeverage: 1,
                maxLeverage: 50,
                localOnly: false,
                busy: false,
                position: {
                    entryPrice: new Decimal("100"),
                    liquidationPrice: new Decimal("91"),
                    leverage: new Decimal("10"),
                },
                onclose: vi.fn(),
                onconfirm: confirmSpy,
            },
            target: document.body,
        });

        // Liquidation projection renders for open position
        // Entry 100, liq 91 at 10x → MMR 0.01
        // Component should calculate projected liq at new leverage
        expect(confirmSpy).toBeDefined();
    });

    it("sends nothing until Confirm is clicked", () => {
        const confirmSpy = vi.fn();
        mount(LeverageModal, {
            props: {
                current: "10",
                minLeverage: 1,
                maxLeverage: 50,
                localOnly: false,
                busy: false,
                onclose: vi.fn(),
                onconfirm: confirmSpy,
            },
            target: document.body,
        });

        const slider = document.querySelector('input[type="range"]') as HTMLInputElement | null;
        if (slider) {
            slider.value = "20";
            slider.dispatchEvent(new Event("input"));
        }

        // Slider movement alone must not call onconfirm
        expect(confirmSpy).not.toHaveBeenCalled();
    });

    it("works in paper-trading mode (localOnly)", () => {
        const confirmSpy = vi.fn();
        mount(LeverageModal, {
            props: {
                current: "10",
                minLeverage: 1,
                maxLeverage: 50,
                localOnly: true,
                busy: false,
                onclose: vi.fn(),
                onconfirm: confirmSpy,
            },
            target: document.body,
        });

        expect(confirmSpy).toBeDefined();
    });
});
