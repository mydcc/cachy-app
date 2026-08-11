/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toastService } from "./toastService.svelte";

describe("ToastService", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        toastService.toasts = [];
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it("caps the array at the maximum, dropping the oldest first", () => {
        for (let i = 0; i < 8; i++) {
            toastService.add(`toast ${i}`, "info", 0);
        }

        expect(toastService.toasts.length).toBe(5);
        expect(toastService.toasts.map(t => t.message)).toEqual([
            "toast 3", "toast 4", "toast 5", "toast 6", "toast 7"
        ]);
    });

    it("clears the timer of a dropped toast instead of leaving it to fire later", () => {
        const clearSpy = vi.spyOn(globalThis, "clearTimeout");

        const droppedId = toastService.add("will be evicted", "info", 5000);
        for (let i = 0; i < 5; i++) {
            toastService.add(`toast ${i}`, "info", 5000);
        }

        expect(toastService.toasts.some(t => t.id === droppedId)).toBe(false);
        expect(clearSpy).toHaveBeenCalled();

        // The evicted toast's timer must be gone, not merely orphaned — advancing
        // past its original duration should not throw or touch an unrelated toast.
        expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
        expect(toastService.toasts.length).toBe(0);
    });

    it("still removes a toast via its own expiry timeout", () => {
        const id = toastService.add("expires normally", "info", 1000);
        expect(toastService.toasts.some(t => t.id === id)).toBe(true);

        vi.advanceTimersByTime(1000);

        expect(toastService.toasts.some(t => t.id === id)).toBe(false);
    });
});
