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

import { describe, it, expect, beforeEach } from "vitest";
import { AcademyWindow } from "./AcademyWindow.svelte";

describe("AcademyWindow (FEAT-0045)", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("defaults to the 'Trading Academy' title", () => {
        const win = new AcademyWindow();
        expect(win.title).toBe("Trading Academy");
    });

    it("accepts a custom title", () => {
        const win = new AcademyWindow("Custom Title");
        expect(win.title).toBe("Custom Title");
    });

    it("is windowType 'academy'", () => {
        const win = new AcademyWindow();
        expect(win.windowType).toBe("academy");
    });

    it("gets a fixed 'academy' id, like other single-instance window types", () => {
        const win = new AcademyWindow();
        expect(win.id).toBe("academy");
        expect(win.allowMultipleInstances).toBe(false);
    });

    it("can minimize to the dock, unlike a 'modal'-type window", () => {
        const win = new AcademyWindow();
        expect(win.allowMinimize).toBe(true);
        expect(win.canMinimizeToPanel).toBe(true);
    });

    it("persists its geometry across reloads, unlike the old ModalFrame overlay", () => {
        const win = new AcademyWindow();
        expect(win.persistent).toBe(true);
    });

    it("auto-maximizes below the mobile breakpoint, same as BUG-0047 relied on", () => {
        const win = new AcademyWindow();
        expect(win.isResponsive).toBe(true);
        expect(win.edgeToEdgeBreakpoint).toBe(768);
    });

    it("does not show a modal-style backdrop or close on background click", () => {
        // The whole point of FEAT-0045 is that Academy behaves like a real
        // window (coexists with other windows, can be minimized) rather
        // than a blocking modal.
        const win = new AcademyWindow();
        expect(win.showBackdrop).toBe(false);
        expect(win.closeOnBlur).toBe(false);
    });
});
