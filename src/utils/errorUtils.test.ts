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
import { getBitunixErrorKey, getErrorMessage, mapApiErrorToLabel } from "./errorUtils";

describe("errorUtils", () => {
  describe("getBitunixErrorKey", () => {
    it("should return the correct key for a known error code", () => {
      expect(getBitunixErrorKey(10001)).toBe("bitunixErrors.10001");
      expect(getBitunixErrorKey("10003")).toBe("bitunixErrors.10003");
      expect(getBitunixErrorKey(30042)).toBe("bitunixErrors.30042");
    });

    it("should return keyed error even for unknown code (dynamic mapping)", () => {
      // Updated to match implementation which returns bitunixErrors.{code}
      expect(getBitunixErrorKey(99999)).toBe("bitunixErrors.99999");
      expect(getBitunixErrorKey("invalid_code")).toBe("bitunixErrors.invalid_code");
    });

    it("should handle number and string inputs correctly", () => {
      expect(getBitunixErrorKey(20001)).toBe("bitunixErrors.20001");
      expect(getBitunixErrorKey("20001")).toBe("bitunixErrors.20001");
    });
  });

  describe("getErrorMessage", () => {
    it("should extract message from Error object", () => {
      const error = new Error("Test error");
      expect(getErrorMessage(error)).toBe("Test error");
    });

    it("should return string if error is a string", () => {
      expect(getErrorMessage("String error")).toBe("String error");
    });

    it("should extract message from object with message property", () => {
      const error = { message: "Object error" };
      expect(getErrorMessage(error)).toBe("Object error");
    });

    it("should return string representation for other types", () => {
      expect(getErrorMessage(123)).toBe("123");
      expect(getErrorMessage(null)).toBe("null");
      expect(getErrorMessage(undefined)).toBe("undefined");
      expect(getErrorMessage({ foo: "bar" })).toBe("[object Object]");
    });
  });

  describe("mapApiErrorToLabel", () => {
    it("should map invalid api key error", () => {
      expect(mapApiErrorToLabel(new Error("Invalid API Key"))).toBe("settings.errors.invalidApiKey");
      expect(mapApiErrorToLabel({ message: "Incorrect Access Key" })).toBe("settings.errors.invalidApiKey");
    });

    it("should map ip not allowed error", () => {
      expect(mapApiErrorToLabel(new Error("IP not allowed"))).toBe("settings.errors.ipNotAllowed");
      expect(mapApiErrorToLabel("Your IP is not in whitelist")).toBe("settings.errors.ipNotAllowed");
    });

    it("should map common http errors", () => {
      expect(mapApiErrorToLabel("Error 429")).toBe("apiErrors.tooManyRequests");
      expect(mapApiErrorToLabel("401 Unauthorized")).toBe("apiErrors.unauthorized");
    });

    it("should return original message if no match", () => {
      expect(mapApiErrorToLabel("Unknown error")).toBe("Unknown error");
    });
  });
});
