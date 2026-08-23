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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { imgbbService } from "./imgbbService";
import { settingsState } from "../stores/settings.svelte";

describe("imgbbService", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    settingsState.imgbbApiKey = "";
    settingsState.imgbbExpiration = 0;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws error if API key is not configured", async () => {
    settingsState.imgbbApiKey = "";
    const fakeFile = new File(["dummy content"], "test.png", { type: "image/png" });

    await expect(imgbbService.uploadToImgbb(fakeFile)).rejects.toThrow(
      "Please configure your ImgBB API Key in Settings > API first.",
    );
  });

  it("sends key and image in FormData and not in URL query string", async () => {
    settingsState.imgbbApiKey = "test-secret-key-12345";
    settingsState.imgbbExpiration = 0;

    let calledUrl = "";
    let calledOptions: RequestInit | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (url, options) => {
      calledUrl = url.toString();
      calledOptions = options;
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            url: "https://i.ibb.co/xyz/test.png",
          },
        }),
      } as Response;
    });

    const fakeFile = new File(["dummy content"], "test.png", { type: "image/png" });
    const resultUrl = await imgbbService.uploadToImgbb(fakeFile);

    expect(resultUrl).toBe("https://i.ibb.co/xyz/test.png");
    // URL must be clean without any query params (no ?key=...)
    expect(calledUrl).toBe("https://api.imgbb.com/1/upload");
    expect(calledUrl).not.toContain("test-secret-key-12345");
    expect(calledUrl).not.toContain("key=");

    // Form data must contain key and image
    expect(calledOptions?.method).toBe("POST");
    const body = calledOptions?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("key")).toBe("test-secret-key-12345");
    expect(body.get("image")).toBe(fakeFile);
    expect(body.get("expiration")).toBeNull();
  });

  it("appends expiration to FormData when specified", async () => {
    settingsState.imgbbApiKey = "test-secret-key-12345";
    settingsState.imgbbExpiration = 3600;

    let calledUrl = "";
    let calledOptions: RequestInit | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (url, options) => {
      calledUrl = url.toString();
      calledOptions = options;
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            url: "https://i.ibb.co/xyz/test.png",
          },
        }),
      } as Response;
    });

    const fakeFile = new File(["dummy content"], "test.png", { type: "image/png" });
    await imgbbService.uploadToImgbb(fakeFile);

    expect(calledUrl).toBe("https://api.imgbb.com/1/upload");
    const body = calledOptions?.body as FormData;
    expect(body.get("expiration")).toBe("3600");
  });

  it("handles API error response properly", async () => {
    settingsState.imgbbApiKey = "invalid-key";

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: "Invalid API key",
          },
        }),
      } as Response;
    });

    const fakeFile = new File(["dummy content"], "test.png", { type: "image/png" });
    await expect(imgbbService.uploadToImgbb(fakeFile)).rejects.toThrow("Invalid API key");
  });
});
