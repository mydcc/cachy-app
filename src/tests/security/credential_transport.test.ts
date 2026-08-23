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
import fs from "node:fs";
import path from "node:path";
import type { RequestEvent } from "@sveltejs/kit";
import { logger } from "$lib/server/logger";

// Mock client token check to pass
vi.mock("$lib/server/clientToken", () => ({
  checkClientToken: vi.fn(() => null),
}));
vi.mock("../../../lib/server/clientToken", () => ({
  checkClientToken: vi.fn(() => null),
}));
vi.mock("../../../../lib/server/clientToken", () => ({
  checkClientToken: vi.fn(() => null),
}));

describe("Credential Transport & Schema Validation Security (BUG-0272)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no UI component should send apiSecret in request bodies", () => {
    const srcDir = path.resolve(__dirname, "../../");
    const checkDirs = [
      path.join(srcDir, "components"),
      path.join(srcDir, "lib/windows"),
      path.join(srcDir, "services"),
    ];

    const findFiles = (dir: string): string[] => {
      let results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(findFiles(fullPath));
        } else if (file.endsWith(".svelte") || (file.endsWith(".ts") && !file.endsWith(".test.ts"))) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const files = checkDirs.flatMap(findFiles);
    const violatingFiles: string[] = [];

    // Check for patterns where apiSecret is placed in a body JSON payload
    const bodySecretRegex = /body:\s*JSON\.stringify\(\s*\{[^}]*apiSecret\s*:/;

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      if (bodySecretRegex.test(content)) {
        violatingFiles.push(path.relative(srcDir, file));
      }
    }

    expect(violatingFiles).toEqual([]);
  });

  it("POST /api/balance should reject schema-invalid requests with 400", async () => {
    const { POST } = await import("../../routes/api/balance/+server");
    const request = new Request("http://localhost/api/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalidField: "bad" }),
    });

    const response = await POST({
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as RequestEvent);

    expect(response.status).toBe(400);
  });

  it("POST /api/balance should accept credentials via headers and validate schema", async () => {
    const { POST } = await import("../../routes/api/balance/+server");
    const request = new Request("http://localhost/api/balance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": "test-key-12345",
        "X-Api-Secret": "test-secret-12345",
      },
      body: JSON.stringify({ exchange: "bitunix" }),
    });

    // Mock fetch for Bitunix balance
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ code: 0, msg: "Success", data: { available: "1000.5" } }),
      }),
    );

    const response = await POST({
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as RequestEvent);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.balance).toBe("1000.5");
  });

  it("POST /api/balance should redact sensitive secrets in error logs when upstream throws", async () => {
    const loggerSpy = vi.spyOn(logger, "error");
    const { POST } = await import("../../routes/api/balance/+server");
    const request = new Request("http://localhost/api/balance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": "super-secret-key-123",
        "X-Api-Secret": "super-secret-secret-456",
      },
      body: JSON.stringify({ exchange: "bitunix" }),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Upstream failed at api-key=super-secret-key-123 with sign=abcdef12345")),
    );

    const response = await POST({
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as RequestEvent);

    expect(response.status).toBe(500);
    expect(loggerSpy).toHaveBeenCalled();
    const loggedMessage = loggerSpy.mock.calls[0]?.[0] || "";
    expect(loggedMessage).not.toContain("super-secret-key-123");
    expect(loggedMessage).not.toContain("abcdef12345");
  });

  it("POST /api/positions should reject schema-invalid requests with 400", async () => {
    const { POST } = await import("../../routes/api/positions/+server");
    const request = new Request("http://localhost/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: "unknown-exchange" }),
    });

    const response = await POST({
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as RequestEvent);

    expect(response.status).toBe(400);
  });

  it("POST /api/positions should accept credentials via headers", async () => {
    const { POST } = await import("../../routes/api/positions/+server");
    const request = new Request("http://localhost/api/positions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": "test-key-12345",
        "X-Api-Secret": "test-secret-12345",
      },
      body: JSON.stringify({ exchange: "bitunix" }),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ code: 0, msg: "Success", data: { positionList: [] } }),
      }),
    );

    const response = await POST({
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as RequestEvent);

    expect(response.status).toBe(200);
  });

  it("POST /api/sync should accept credentials via headers", async () => {
    const { POST } = await import("../../routes/api/sync/+server");
    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": "test-key-12345",
        "X-Api-Secret": "test-secret-12345",
      },
      body: JSON.stringify({ limit: 50 }),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ code: 0, msg: "Success", data: [] }),
      }),
    );

    const response = await POST({
      request,
      getClientAddress: () => "127.0.0.1",
    } as unknown as RequestEvent);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data).toEqual([]);
  });
});
