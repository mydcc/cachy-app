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
 * FEAT-0346 — Toggle is the primitive every settings switch is built from.
 * The test pins its accessible contract: a real checkbox with role=switch and
 * a truthful aria-checked, a no-op when disabled, and a callback on change.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

vi.mock("../../utils/utils", () => ({ generateId: () => "test-id-1234" }));

import Toggle from "./Toggle.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown> = {}) {
    component = mount(Toggle, { target: host, props }) as never;
    flushSync();
}

function checkbox(): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!el) throw new Error("checkbox not rendered");
    return el;
}

describe("FEAT-0346 — Toggle keeps its checkbox and ARIA in sync", () => {
    it("renders a switch that starts unchecked", () => {
        render();

        expect(checkbox().checked).toBe(false);
        expect(checkbox().getAttribute("role")).toBe("switch");
        expect(checkbox().getAttribute("aria-checked")).toBe("false");
    });

    it("toggles and reports the change", () => {
        const onchange = vi.fn();
        render({ onchange });

        checkbox().click();
        flushSync();

        expect(checkbox().checked).toBe(true);
        expect(checkbox().getAttribute("aria-checked")).toBe("true");
        expect(onchange).toHaveBeenCalledTimes(1);
    });

    it("cannot be moved while disabled", () => {
        const onchange = vi.fn();
        render({ disabled: true, onchange });

        expect(checkbox().disabled).toBe(true);
        expect(host.querySelector(".toggle-wrapper")?.classList.contains("disabled")).toBe(
            true,
        );

        checkbox().click();
        flushSync();
        expect(checkbox().checked).toBe(false);
        expect(onchange).not.toHaveBeenCalled();
    });

    it("honours an explicit id and a checked prop", () => {
        render({ id: "my-switch", checked: true });

        expect(checkbox().id).toBe("my-switch");
        expect(checkbox().checked).toBe(true);
        expect(checkbox().getAttribute("aria-checked")).toBe("true");
    });
});
