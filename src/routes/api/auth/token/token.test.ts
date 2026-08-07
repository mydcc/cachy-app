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

import { describe, it, expect, beforeEach } from "vitest";
import { POST, _issuanceLimiter } from "./+server";

function eventFromIp(ip: string): Parameters<typeof POST>[0] {
  return { getClientAddress: () => ip } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/auth/token", () => {
  beforeEach(() => {
    _issuanceLimiter.clear();
  });

  it("issues a token", async () => {
    const response = await POST(eventFromIp("1.1.1.1"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(20);
  });

  it("rejects a second request from the same IP within the window", async () => {
    const first = await POST(eventFromIp("2.2.2.2"));
    expect(first.status).toBe(200);

    const second = await POST(eventFromIp("2.2.2.2"));
    expect(second.status).toBe(429);
  });

  it("does not rate-limit a different IP", async () => {
    const first = await POST(eventFromIp("3.3.3.3"));
    expect(first.status).toBe(200);

    const second = await POST(eventFromIp("4.4.4.4"));
    expect(second.status).toBe(200);
  });
});
