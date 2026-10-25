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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DUCK_PROGRESS_RESET_EVENT,
    DUCK_STATE_STORAGE_KEY,
    resetDuckProgress,
} from "./duckState";

afterEach(() => {
    localStorage.removeItem(DUCK_STATE_STORAGE_KEY);
    localStorage.removeItem("other-local-key");
});

describe("resetDuckProgress", () => {
    it("removes only the duck key and notifies the scene owner", () => {
        localStorage.setItem(DUCK_STATE_STORAGE_KEY, '{"xp":120,"level":3}');
        localStorage.setItem("other-local-key", "keep me");
        const onReset = vi.fn();
        window.addEventListener(DUCK_PROGRESS_RESET_EVENT, onReset);

        resetDuckProgress();

        window.removeEventListener(DUCK_PROGRESS_RESET_EVENT, onReset);
        expect(onReset).toHaveBeenCalledOnce();
        expect(localStorage.getItem(DUCK_STATE_STORAGE_KEY)).toBeNull();
        expect(localStorage.getItem("other-local-key")).toBe("keep me");
    });
});
