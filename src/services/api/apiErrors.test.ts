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

/**
 * Contract for the API error shape (FEAT-0342 slice 1).
 *
 * Small but load-bearing: the request manager's retry logic branches on
 * `e instanceof ApiStatusError && e.status === 404`, so the class must
 * survive as an `Error` with its status attached — a plain `Error` with a
 * status property assigned after the fact would pass `instanceof Error`
 * but fail the `instanceof ApiStatusError` check.
 */

import { describe, expect, it } from "vitest";
import { ApiStatusError } from "./apiErrors";

describe("ApiStatusError", () => {
    it("carries message, name and status", () => {
        const error = new ApiStatusError("Not Found", 404);
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ApiStatusError);
        expect(error.name).toBe("ApiStatusError");
        expect(error.message).toBe("Not Found");
        expect(error.status).toBe(404);
    });

    it("leaves status undefined when the venue gives none", () => {
        const error = new ApiStatusError("boom");
        expect(error.status).toBeUndefined();
        expect(error).toBeInstanceOf(ApiStatusError);
    });

    it("is distinguishable from a plain error with an assigned status", () => {
        const plain = new Error("Not Found") as Error & { status?: number };
        plain.status = 404;
        expect(plain).not.toBeInstanceOf(ApiStatusError);
    });
});
