// @vitest-environment node
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

import { describe, it, expect } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
    it("returns the first non-null result without retrying", () => {
        let calls = 0;
        const result = withRetry(() => {
            calls++;
            return "ok";
        }, 1);
        expect(result).toBe("ok");
        expect(calls).toBe(1);
    });

    it("retries a failing lookup until it succeeds", () => {
        let calls = 0;
        const result = withRetry(() => {
            calls++;
            return calls < 2 ? null : "ok";
        }, 2);
        expect(result).toBe("ok");
        expect(calls).toBe(2);
    });

    it("returns null when every attempt fails", () => {
        let calls = 0;
        const result = withRetry(() => {
            calls++;
            return null;
        }, 1);
        expect(result).toBe(null);
        expect(calls).toBe(1);
    });

    it("treats an empty string as success, not failure", () => {
        let calls = 0;
        const result = withRetry(() => {
            calls++;
            return "";
        }, 1);
        expect(result).toBe("");
        expect(calls).toBe(1);
    });
});
