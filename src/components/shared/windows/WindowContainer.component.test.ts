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
 * FEAT-0742 — the dimming backdrop is rendered one z-index below its window.
 * A reserved-band window must keep that relation even when the responsive
 * rule maximizes it; otherwise the modal or dialog renders behind its own
 * backdrop.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";

import WindowContainer from "./WindowContainer.svelte";
import { WindowBase } from "../../../lib/windows/WindowBase.svelte";
import { windowManager } from "../../../lib/windows/WindowManager.svelte";
import EmptyStub from "../../../tests/helpers/EmptyStub.svelte";

class BackdropWindow extends WindowBase {
    constructor(windowType: "modal" | "dialog" | "symbolpicker" = "modal") {
        super({
            id: `backdrop-test-${windowType}`,
            title: "Backdrop test",
            windowType,
        });
        this.showBackdrop = true;
    }

    get component() {
        return EmptyStub;
    }
}

let host: HTMLElement | null = null;
let component: Record<string, unknown> | null = null;

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host?.remove();
    host = null;
    for (const win of [...windowManager.windows]) {
        windowManager.close(win.id);
    }
});

describe("WindowContainer backdrop stacking (FEAT-0742)", () => {
    it.each(["modal", "dialog", "symbolpicker"] as const)(
        "keeps the backdrop below a maximized %s window",
        (windowType) => {
            const win = new BackdropWindow(windowType);
            windowManager.open(win);
            win.maximize();
            flushSync();

            host = document.createElement("div");
            document.body.appendChild(host);
            component = mount(WindowContainer, { target: host }) as never;
            flushSync();

            const backdrop =
                host.querySelector<HTMLElement>(".window-backdrop");
            const frame = host.querySelector<HTMLElement>(".window-frame");
            if (!backdrop)
                throw new Error("the container rendered no backdrop");
            if (!frame) throw new Error("the container rendered no frame");

            expect(Number(frame.style.zIndex)).toBeGreaterThan(
                Number(backdrop.style.zIndex),
            );
        },
    );
});
