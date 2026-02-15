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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAppAuth } from "./auth";

// Mutable mock env using vi.hoisted
const mockEnv = vi.hoisted(() => ({
  APP_ACCESS_TOKEN: undefined as string | undefined
}));

vi.mock("$env/dynamic/private", () => ({
  env: mockEnv
}));

describe("checkAppAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_ACCESS_TOKEN = undefined;
  });

  it("should return null if no APP_ACCESS_TOKEN is configured", () => {
    const request = new Request("http://localhost", {
      headers: { "x-app-access-token": "any-token" }
    });

    const result = checkAppAuth(request);
    expect(result).toBeNull();
  });

  it("should return 401 if APP_ACCESS_TOKEN is configured but header is missing", async () => {
    mockEnv.APP_ACCESS_TOKEN = "secret-token";
    const request = new Request("http://localhost");

    const result = checkAppAuth(request);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);

    const body = await result?.json();
    expect(body.error).toContain("Unauthorized");
  });

  it("should return 401 if APP_ACCESS_TOKEN is configured but header is incorrect", async () => {
    mockEnv.APP_ACCESS_TOKEN = "secret-token";
    const request = new Request("http://localhost", {
      headers: { "x-app-access-token": "wrong-token" }
    });

    const result = checkAppAuth(request);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);

    const body = await result?.json();
    expect(body.error).toContain("Unauthorized");
  });

  it("should return null if APP_ACCESS_TOKEN matches the header", () => {
    mockEnv.APP_ACCESS_TOKEN = "secret-token";
    const request = new Request("http://localhost", {
      headers: { "x-app-access-token": "secret-token" }
    });

    const result = checkAppAuth(request);
    expect(result).toBeNull();
  });
});
