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
 * BUG-0619 — the Bitunix half of BUG-0604.
 *
 * Bitunix answers `{code, msg, data}` with `code: 0` on success, and pairs a
 * business failure with a non-2xx status. Every call site tested `response.ok`
 * before reading the envelope, so the venue's own `code` and `msg` were
 * discarded and the client received an opaque HTTP 500 — the same defect
 * BUG-0604 fixed on the Bitget half, with the same `assertXxxOk` shape.
 *
 * The bodies below use the envelope shape Bitunix documents (`code` as a
 * number, `"0"` as success), not captured live responses. What the test pins
 * is the reading order — envelope before status — and the fields the error
 * carries, not any particular venue code.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bitunixVenue } from "./bitunix";
import type { PresignedEnvelope } from "../presignedEnvelope";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

/** A minimal envelope: the venue never inspects these in these cases. */
const envelope: PresignedEnvelope = {
  apiKey: "test-key",
  signature: "test-signature",
  timestamp: "1791034226097",
  // Bitunix requires a nonce where Bitget does not — without it
  // `bitunixCallHeaders` throws before any fetch happens.
  nonce: "test-nonce",
  query: "marginCoin=USDT",
};

/** A venue answer that pairs a business code with a failing HTTP status. */
function rejection(status: number, body: unknown) {
  return { ok: false, status, text: async () => JSON.stringify(body) };
}

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

describe("Bitunix refusals keep the venue's own diagnosis (BUG-0619)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("surfaces the venue code rather than a generic string", async () => {
    fetchMock.mockResolvedValueOnce(
      rejection(400, { code: 10003, msg: "Invalid API key", data: null }),
    );

    const error = await rejectionFrom(bitunixVenue.fetchPositions(envelope));

    expect(error.venueCode).toBe("10003");
    expect(error.venueMessage).toBe("Invalid API key");
  });

  it("answers the client with 502 rather than relaying the venue's own status", async () => {
    fetchMock.mockResolvedValueOnce(
      rejection(400, { code: 10003, msg: "Invalid API key", data: null }),
    );

    const error = await rejectionFrom(bitunixVenue.fetchPositions(envelope));

    // Relaying Bitunix's 400 would tell a browser its request was malformed —
    // it was Cachy that sent the failing call. The venue's real status stays
    // available for diagnosis.
    expect(error.status).toBe(502);
    expect(error.venueHttpStatus).toBe(400);
  });

  it("reads a string success code the same as a numeric one", async () => {
    // Bitunix sends `code` as a number and as a string across endpoints; both
    // mean success and neither may reject.
    fetchMock.mockResolvedValueOnce(ok({ code: "0", msg: "Success", data: [] }));

    await expect(bitunixVenue.fetchPositions(envelope)).resolves.toEqual([]);
  });

  it("reads the envelope on a 200 that carries a business code", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ code: 20001, msg: "Order does not exist", data: null }),
    );

    const error = await rejectionFrom(bitunixVenue.fetchPositions(envelope));

    expect(error.venueCode).toBe("20001");
    expect(error.venueMessage).toBe("Order does not exist");
  });

  it("applies the same reading to the account path, not just positions", async () => {
    fetchMock.mockResolvedValueOnce(
      rejection(401, { code: 10004, msg: "Signature error", data: null }),
    );

    const error = await rejectionFrom(bitunixVenue.fetchAccount(envelope));

    expect(error.venueCode).toBe("10004");
    expect(error.status).toBe(502);
  });

  it("still rejects when the venue sends no readable envelope at all", async () => {
    // The status check stays as the fallback, so a truncated or non-JSON body
    // fails loudly instead of parsing to `undefined` and reading as empty.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "<html>bad gateway</html>",
    });

    const error = await rejectionFrom(bitunixVenue.fetchPositions(envelope));

    expect(error.venueCode).toBe("502");
    expect(error.venueHttpStatus).toBe(502);
  });

  it("does not reject on a well-formed success", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ code: 0, msg: "Success", data: [] }),
    );

    await expect(bitunixVenue.fetchPositions(envelope)).resolves.toEqual([]);
  });
});