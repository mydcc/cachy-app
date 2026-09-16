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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { POST as syncPositionsPending } from "./sync/positions-pending/+server";
import { POST as syncPositionsHistory } from "./sync/positions-history/+server";
import * as clientToken from "../../lib/server/clientToken";
import { signedEnvelopeRequest } from "../../tests/helpers/signedEnvelopeRequest";

/**
 * FEAT-0405 A3 — the acceptance evidence for the seven Bitunix-only routes.
 *
 * The absence of a thing is what this asserts, and absence is not observable
 * from behaviour: a handler that quietly still read `X-Api-Secret` would pass
 * every behavioural test in this repository. So the source is read directly.
 * Each file drops out of this list as it is migrated; when the list is empty
 * the migration is done, which is the point.
 */
const MIGRATED_BITUNIX_ONLY_ROUTES = [
  "tpsl/+server.ts",
  "leverage-margin-mode/+server.ts",
  "sync/+server.ts",
  "sync/orders/+server.ts",
  "sync/order-detail/+server.ts",
  "sync/positions-history/+server.ts",
  "sync/positions-pending/+server.ts",
] as const;

const ROUTE_DIR = resolve(process.cwd(), "src/routes/api");

const sourceOf = (relative: string) => readFileSync(resolve(ROUTE_DIR, relative), "utf8");

describe("FEAT-0405 A3 — the Bitunix-only routes take no secret", () => {
  it.each(MIGRATED_BITUNIX_ONLY_ROUTES)("%s never reads X-Api-Secret", (relative) => {
    const source = sourceOf(relative);

    expect(source).not.toMatch(/x-api-secret/i);
    // The helper it used to read the secret with. Its absence is the real
    // property: a route could rename the header and still consult this.
    expect(source).not.toContain("extractApiCredentials");
  });

  it.each(MIGRATED_BITUNIX_ONLY_ROUTES)("%s reads the envelope instead", (relative) => {
    expect(sourceOf(relative)).toContain("checkPresignedRequest");
  });
});

describe("FEAT-0405 A3 — the guard's rules on a live route", () => {
  const getClientAddress = () => "127.0.0.1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ code: 0, data: { positionList: [] } }),
      }),
    );
  });

  it("refuses a passphrase on a route Bitunix-only in the plan table", async () => {
    // The passphrase is the Bitget credential. Bitunix never asks for it, so a
    // request carrying one is either a client that mixed up its venues or a
    // credential being smuggled past the table — and the venue cannot tell the
    // difference either.
    const { request } = await signedEnvelopeRequest(
      "/api/sync/positions-history",
      { limit: 10 },
      { limit: "10" },
    );
    const withPassphrase = new Request(request.url, {
      method: "POST",
      headers: new Headers({
        ...Object.fromEntries(request.headers.entries()),
        "x-api-passphrase": "should-not-be-here",
      }),
      body: await request.text(),
    });

    const response = await syncPositionsHistory({
      request: withPassphrase,
      getClientAddress,
    } as unknown as Parameters<typeof syncPositionsHistory>[0]);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("PRESIGNED_UNEXPECTED_PASSPHRASE");
  });

  it("accepts a route whose signed query is empty", async () => {
    // `/api/sync/positions-pending` signs no parameters at all, so its query
    // string is the empty string — which is only representable because
    // `x-api-query` is read as present-or-absent rather than as truthy. A
    // regression to a truthy read makes this route unmigratable, and this is
    // the test that says so.
    const { request } = await signedEnvelopeRequest(
      "/api/sync/positions-pending",
      {},
      {},
    );

    expect(request.headers.get("x-api-query")).toBe("");

    const response = await syncPositionsPending({
      request,
      getClientAddress,
    } as unknown as Parameters<typeof syncPositionsPending>[0]);

    expect(response.status).toBe(200);
  });
});
