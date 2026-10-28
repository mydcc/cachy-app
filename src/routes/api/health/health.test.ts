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
import { GET } from "./+server";

describe("GET /api/health", () => {
  it("reports status, version and build id without disclosing the environment (BUG-0727)", async () => {
    const response = await GET({
      locals: { buildId: "test-build" },
    } as unknown as Parameters<typeof GET>[0]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.version).toBeDefined();
    // Comes from the hook, i.e. the build this process started from.
    expect(body.buildId).toBe("test-build");
    expect(body).not.toHaveProperty("environment");
  });
});
