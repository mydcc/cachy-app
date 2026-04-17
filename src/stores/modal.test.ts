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

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the environment so we can toggle `browser`
vi.mock("$app/environment", () => {
    let _browser = true;
    return {
        get browser() { return _browser; },
        set browser(val: boolean) { _browser = val; }
    };
});

import { modalState } from "./modal.svelte";
import { windowManager } from "../lib/windows/WindowManager.svelte";
import { SymbolPickerWindow } from "../lib/windows/implementations/SymbolPickerWindow.svelte";
import { DialogWindow } from "../lib/windows/implementations/DialogWindow.svelte";

// Mock windowManager.open
vi.spyOn(windowManager, "open").mockImplementation(() => {});

describe("ModalManager", () => {
    let env: any;
    let originalBrowser: boolean;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Mock console.warn to suppress output during SSR tests
        consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        env = await import("$app/environment");
        originalBrowser = env.browser;
        env.browser = true; // Default to browser environment
    });

    afterEach(() => {
        consoleWarnSpy.mockRestore();
        env.browser = originalBrowser;
    });

    it("should resolve to false in SSR environment", async () => {
        env.browser = false;

        const result = await modalState.show("Title", "Message", "alert");

        expect(result).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith("Modal cannot be shown in SSR environment.");
        expect(windowManager.open).not.toHaveBeenCalled();
    });

    it("should open SymbolPickerWindow when type is symbolPicker", async () => {
        // Let it run synchronously and check if `open` was called
        modalState.show("Select Symbol", "Please select a symbol", "symbolPicker");

        expect(windowManager.open).toHaveBeenCalled();

        const callArgs = (windowManager.open as any).mock.calls[(windowManager.open as any).mock.calls.length - 1][0];
        expect(callArgs).toBeInstanceOf(SymbolPickerWindow);
        expect(callArgs.windowType).toBe("symbolpicker");
    });

    it("should open DialogWindow with correct arguments for alert type", async () => {
        modalState.show("Alert Title", "Alert Message", "alert");

        expect(windowManager.open).toHaveBeenCalled();

        const callArgs = (windowManager.open as any).mock.calls[(windowManager.open as any).mock.calls.length - 1][0];
        expect(callArgs).toBeInstanceOf(DialogWindow);
        expect(callArgs.title).toBe("Alert Title");
        expect(callArgs.message).toBe("Alert Message");
        expect(callArgs.type).toBe("alert");
        expect(callArgs.defaultValue).toBe("");
    });

    it("should open DialogWindow with correct arguments for confirm type", async () => {
        modalState.show("Confirm Title", "Confirm Message", "confirm");

        expect(windowManager.open).toHaveBeenCalled();

        const callArgs = (windowManager.open as any).mock.calls[(windowManager.open as any).mock.calls.length - 1][0];
        expect(callArgs).toBeInstanceOf(DialogWindow);
        expect(callArgs.title).toBe("Confirm Title");
        expect(callArgs.message).toBe("Confirm Message");
        expect(callArgs.type).toBe("confirm");
        expect(callArgs.defaultValue).toBe("");
    });

    it("should open DialogWindow with correct arguments for prompt type with default value", async () => {
        modalState.show("Prompt Title", "Prompt Message", "prompt", "Default Value");

        expect(windowManager.open).toHaveBeenCalled();

        const callArgs = (windowManager.open as any).mock.calls[(windowManager.open as any).mock.calls.length - 1][0];
        expect(callArgs).toBeInstanceOf(DialogWindow);
        expect(callArgs.title).toBe("Prompt Title");
        expect(callArgs.message).toBe("Prompt Message");
        expect(callArgs.type).toBe("prompt");
        expect(callArgs.defaultValue).toBe("Default Value");
    });
});
