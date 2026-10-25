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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import VisualsDuck from "./VisualsDuck.svelte";
import { settingsState } from "../../../stores/settings.svelte";
import { DUCK_STATE_STORAGE_KEY } from "../../../lib/pets/duckState";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

function settle() {
    flushSync();
}

function toggle(id: string): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`missing toggle #${id}`);
    return input;
}

beforeEach(() => {
    settingsState.showDuck = true;
    settingsState.duckNotifications = true;
    settingsState.duckReactToTrades = true;
    localStorage.removeItem(DUCK_STATE_STORAGE_KEY);
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    vi.unstubAllGlobals();
});

describe("VisualsDuck — settings wiring", () => {
    it("binds the master switch to the settings store", () => {
        component = mount(VisualsDuck, { target: host });
        settle();

        const show = toggle("duck-show-toggle");
        expect(show.checked).toBe(true);

        show.click();
        settle();

        expect(settingsState.showDuck).toBe(false);
    });

    it("disables the dependent switches while the duck is hidden", () => {
        settingsState.showDuck = false;
        component = mount(VisualsDuck, { target: host });
        settle();

        expect(toggle("duck-notifications-toggle").disabled).toBe(true);
        expect(toggle("duck-trades-toggle").disabled).toBe(true);

        settingsState.showDuck = true;
        settle();

        expect(toggle("duck-notifications-toggle").disabled).toBe(false);
        expect(toggle("duck-trades-toggle").disabled).toBe(false);
    });

    it("binds notifications and trade reactions independently", () => {
        component = mount(VisualsDuck, { target: host });
        settle();

        toggle("duck-notifications-toggle").click();
        toggle("duck-trades-toggle").click();
        settle();

        expect(settingsState.duckNotifications).toBe(false);
        expect(settingsState.duckReactToTrades).toBe(false);
    });

    it("clears only the duck key after confirmation", () => {
        localStorage.setItem(DUCK_STATE_STORAGE_KEY, '{"xp":120,"level":3}');
        const confirm = vi.fn(() => true);
        vi.stubGlobal("confirm", confirm);

        component = mount(VisualsDuck, { target: host });
        settle();

        host.querySelector<HTMLButtonElement>("#duck-reset-button")?.click();
        settle();

        expect(confirm).toHaveBeenCalledOnce();
        expect(localStorage.getItem(DUCK_STATE_STORAGE_KEY)).toBeNull();
    });

    it("leaves the duck key alone when confirmation is declined", () => {
        localStorage.setItem(DUCK_STATE_STORAGE_KEY, '{"xp":120,"level":3}');
        const confirm = vi.fn(() => false);
        vi.stubGlobal("confirm", confirm);

        component = mount(VisualsDuck, { target: host });
        settle();

        const button = host.querySelector<HTMLButtonElement>(
            "#duck-reset-button",
        );
        expect(button).not.toBeNull();
        button!.click();
        settle();

        expect(confirm).toHaveBeenCalledOnce();
        expect(localStorage.getItem(DUCK_STATE_STORAGE_KEY)).not.toBeNull();
    });
});
