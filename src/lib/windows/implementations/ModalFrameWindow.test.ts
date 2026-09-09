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
import { ModalFrameWindow } from "./ModalFrameWindow.svelte";

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

describe("ModalFrameWindow compact dialogs (BUG-0411)", () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    beforeEach(() => {
        localStorage.clear();
        setViewport(1280, 900);
    });

    afterEach(() => {
        setViewport(originalInnerWidth, originalInnerHeight);
    });

    it("keeps the caller's explicit size and centers on desktop", () => {
        const win = new ModalFrameWindow({
            title: "Test",
            width: 440,
            height: 400,
            compact: true,
        });

        expect(win.width).toBe(440);
        expect(win.height).toBe(400);
        expect(win.isMaximized).toBe(false);
        expect(win.x).toBe((1280 - 440) / 2);
        expect(win.y).toBe((900 - 400) / 2);
    });

    it("still auto-maximizes a non-compact modal below the breakpoint", () => {
        setViewport(390, 844);
        const win = new ModalFrameWindow({ title: "Test" });

        expect(win.isResponsive).toBe(true);
        expect(win.isMaximized).toBe(true);
    });

    it("stays floating at its explicit size below the breakpoint when compact", () => {
        setViewport(390, 844);
        const win = new ModalFrameWindow({
            title: "Test",
            width: 440,
            height: 400,
            compact: true,
        });

        // 440px does not fit a 390px viewport, so it clamps -- but it
        // stays a floating centered dialog, never fullscreen.
        expect(win.isMaximized).toBe(false);
        expect(win.width).toBe(390 - 16);
        expect(win.height).toBe(400);
    });

    it("clamps an oversized compact dialog to the viewport with a margin", () => {
        setViewport(500, 700);
        const win = new ModalFrameWindow({
            title: "Test",
            width: 800,
            height: 900,
            compact: true,
        });

        expect(win.isMaximized).toBe(false);
        expect(win.width).toBe(500 - 16);
        expect(win.height).toBe(700 - 16);
        expect(win.x).toBeGreaterThanOrEqual(0);
        expect(win.y).toBeGreaterThanOrEqual(0);
    });

    it("re-clamps a compact dialog when the viewport shrinks later", () => {
        const win = new ModalFrameWindow({
            title: "Test",
            width: 440,
            height: 400,
            compact: true,
        });
        expect(win.width).toBe(440);

        setViewport(300, 700);
        win.handleViewportResize();

        expect(win.width).toBe(300 - 16);
        expect(win.height).toBe(400);
    });

    it("leaves a non-compact window's size alone on viewport resize", () => {
        setViewport(1280, 900);
        const win = new ModalFrameWindow({
            title: "Test",
            width: 440,
            height: 400,
        });
        setViewport(1000, 800);
        win.handleViewportResize();

        expect(win.width).toBe(440);
        expect(win.height).toBe(400);
    });

    it("opts compact dialogs into the one-shot content fit", () => {
        const compact = new ModalFrameWindow({
            title: "Test",
            width: 440,
            height: 400,
            compact: true,
        });
        expect(compact.fitContentOnce).toBe(true);

        const regular = new ModalFrameWindow({ title: "Test" });
        expect(regular.fitContentOnce).toBe(false);
    });
});
