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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DialogWindow } from "./DialogWindow.svelte";

function setViewport(width: number, height: number) {
    Object.defineProperty(window, "innerWidth", {
        value: width,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
        value: height,
        writable: true,
        configurable: true,
    });
}

const noop = () => {};

describe("DialogWindow content-sized dialogs (BUG-0411)", () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    beforeEach(() => {
        localStorage.clear();
        setViewport(1280, 900);
    });

    afterEach(() => {
        setViewport(originalInnerWidth, originalInnerHeight);
    });

    it("keeps the dialog registry size as the fallback", () => {
        const win = new DialogWindow("Title", "Message", "confirm", "", noop);

        expect(win.width).toBe(450);
        expect(win.height).toBe(250);
    });

    it("opts every dialog into the one-shot content fit", () => {
        const win = new DialogWindow("Title", "Message", "confirm", "", noop);

        expect(win.fitContentOnce).toBe(true);
        expect(win.isResponsive).toBe(false);
    });

    it("stays floating below the breakpoint instead of going fullscreen", () => {
        setViewport(390, 844);
        const win = new DialogWindow("Title", "Message", "confirm", "", noop);

        expect(win.isMaximized).toBe(false);
        expect(win.width).toBe(390 - 16);
        expect(win.height).toBe(250);
    });

    it("clamps an explicit size to the viewport with a margin", () => {
        setViewport(500, 700);
        const win = new DialogWindow("Title", "Message", "alert", "", noop, "", {
            width: 800,
            height: 900,
        });

        expect(win.isMaximized).toBe(false);
        expect(win.width).toBe(500 - 16);
        expect(win.height).toBe(700 - 16);
    });

    it("re-clamps the dialog when the viewport shrinks later", () => {
        const win = new DialogWindow("Title", "Message", "alert", "", noop);
        expect(win.width).toBe(450);

        setViewport(300, 700);
        win.handleViewportResize();

        expect(win.width).toBe(300 - 16);
        expect(win.height).toBe(250);
    });

    it("still threads extraClasses through to the rendered root", () => {
        const win = new DialogWindow("Title", "Message", "alert", "", noop, "custom-class");

        expect(win.extraClasses).toBe("custom-class");
        expect(win.fitContentOnce).toBe(true);
    });
});
