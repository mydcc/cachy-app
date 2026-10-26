/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./+server";
import * as clientToken from "../../../lib/server/clientToken";
import { signedEnvelopeRequest } from "../../../tests/helpers/signedEnvelopeRequest";
import { buildOrdersHistoryQueryParams } from "../../../utils/exchange/venueQueries";
import { ORDER_ERRORS } from "../../../utils/exchange/orderErrors";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getClientAddress = () => "127.0.0.1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
});

describe("POST /api/orders — Bitget passphrase boundary", () => {
  it("answers 400, not 500, when a Bitget request carries no passphrase", async () => {
    const payload = { exchange: "bitget", type: "history", limit: 10 };
    const { request, url } = await signedEnvelopeRequest(
      "/api/orders?action=history",
      payload,
      buildOrdersHistoryQueryParams("bitget", payload),
      "bitget",
    );
    // The client refuses to sign this shape, so the header can only go missing
    // through a hand-built request or a bug. The route must still answer it as
    // a validation error instead of letting `executeOrder` throw.
    request.headers.delete("x-api-passphrase");

    const response = await POST({
      request,
      url,
      getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe(ORDER_ERRORS.PASSPHRASE_REQUIRED);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
