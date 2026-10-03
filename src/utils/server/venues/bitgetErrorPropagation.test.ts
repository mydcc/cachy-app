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
 * BUG-0604 — a Bitget refusal must reach the client as a refusal.
 *
 * Bitget pairs a business failure with a non-2xx status. Verified live against
 * `api.bitget.com` on 2026-10-03, signed, from a UTA account:
 *
 *   GET /api/mix/v1/position/allPosition?productType=USDT-FUTURES&marginCoin=USDT
 *     -> HTTP 400 {"code":"30032",
 *                  "msg":"The V1 API has been decommissioned. Please migrate
 *                        to a newer version.","requestTime":…,"data":null}
 *
 *   GET /api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT
 *     -> HTTP 400 {"code":"40085","msg":"You are in Unified Account mode, and
 *                  the Classic Account API is not supported at this time",…}
 *
 * Both arrived at the caller as the string "Bitget API Error" and then as an
 * opaque HTTP 500, because the venue read `response.ok` before the envelope.
 * The distinction that matters to a user — "Bitget retired this endpoint",
 * "your account is on the other API family", "your key is wrong" — was
 * destroyed at the first check and never recovered.
 *
 * The bodies above are the ones asserted below, so the test fails for the
 * reason this item exists rather than for a shape invented here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bitgetVenue } from "./bitget";
import type { PresignedEnvelope } from "../presignedEnvelope";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

/** A minimal envelope: the venue never inspects these in these cases. */
const envelope: PresignedEnvelope = {
  apiKey: "test-key",
  signature: "test-signature",
  timestamp: "1791034226097",
  query: "productType=USDT-FUTURES&marginCoin=USDT",
  passphrase: "test-passphrase",
};

/** A venue answer that pairs a business code with a failing HTTP status. */
function rejection(status: number, body: unknown) {
  return { ok: false, status, text: async () => JSON.stringify(body) };
}

const V1_DECOMMISSIONED = {
  code: "30032",
  msg: "The V1 API has been decommissioned. Please migrate to a newer version.",
  requestTime: 1791034226097,
  data: null,
};

const UTA_GATE = {
  code: "40085",
  msg: "You are in Unified Account mode, and the Classic Account API is not supported at this time",
  requestTime: 1791034226408,
  data: null,
};

function ok(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

/** The `ExchangeError` fields a caller needs to diagnose the refusal. */
async function rejectionFrom(call: Promise<unknown>) {
  try {
    await call;
  } catch (e) {
    return e as {
      venueCode?: string;
      venueMessage?: string;
      venueHttpStatus?: number;
      status?: number;
    };
  }
  throw new Error("expected the venue call to reject");
}

describe("Bitget refusals keep the venue's own diagnosis (BUG-0604)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("surfaces 30032 rather than a generic string when the endpoint is decommissioned", async () => {
    fetchMock.mockResolvedValueOnce(rejection(400, V1_DECOMMISSIONED));

    const error = await rejectionFrom(bitgetVenue.fetchPositions(envelope));

    expect(error.venueCode).toBe("30032");
    expect(error.venueMessage).toMatch(/V1 API has been decommissioned/);
  });

  it("answers the client with 502 rather than relaying Bitget's own 400", async () => {
    fetchMock.mockResolvedValueOnce(rejection(400, V1_DECOMMISSIONED));

    const error = await rejectionFrom(bitgetVenue.fetchPositions(envelope));

    // Relaying Bitget's 400 would tell a browser its request was malformed —
    // it was Cachy that sent the wrong path. And because Bitget also reports
    // business errors on a 200, relaying blindly can answer 200 with an error
    // body. The venue's real status stays available for diagnosis.
    expect(error.status).toBe(502);
    expect(error.venueHttpStatus).toBe(400);
  });

  it("distinguishes the account-family refusal from the decommissioned endpoint", async () => {
    fetchMock.mockResolvedValueOnce(rejection(400, UTA_GATE));

    const error = await rejectionFrom(bitgetVenue.fetchPositions(envelope));

    expect(error.venueCode).toBe("40085");
    expect(error.venueMessage).toMatch(/Unified Account mode/);
  });

  it("applies the same reading to the account path, not just positions", async () => {
    fetchMock.mockResolvedValueOnce(rejection(400, V1_DECOMMISSIONED));

    const error = await rejectionFrom(bitgetVenue.fetchAccount(envelope));

    expect(error.venueCode).toBe("30032");
  });

  it("reads the envelope on a 200 that carries a business code", async () => {
    // Bitget also answers 200 with a non-zero code. Judging only the status
    // would pass this through as a success and then fail on undefined data.
    fetchMock.mockResolvedValueOnce(
      ok({ code: "40001", msg: "Invalid Request", data: null }),
    );

    const error = await rejectionFrom(bitgetVenue.fetchPositions(envelope));

    expect(error.venueCode).toBe("40001");
    expect(error.venueMessage).toBe("Invalid Request");
  });

  it("still rejects when the venue sends no readable envelope at all", async () => {
    // The status check stays as the fallback, so a truncated or non-JSON body
    // fails loudly instead of parsing to `undefined` and reading as empty.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "<html>bad gateway</html>",
    });

    const error = await rejectionFrom(bitgetVenue.fetchPositions(envelope));

    expect(error.venueCode).toBe("502");
    expect(error.venueHttpStatus).toBe(502);
  });

  it("does not reject on a well-formed success", async () => {
    fetchMock.mockResolvedValueOnce(ok({ code: "00000", msg: "success", data: [] }));

    await expect(bitgetVenue.fetchPositions(envelope)).resolves.toEqual([]);
  });
});