/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { env } from "$env/dynamic/private";
import { json } from "@sveltejs/kit";
import crypto from "node:crypto";

/**
 * Checks if the request contains the correct App Access Token.
 * Returns null if authorized, or a 401 Response if unauthorized (including if no token is configured).
 */
export function checkAppAuth(request: Request): Response | null {
  const serverToken = env.APP_ACCESS_TOKEN;

  // Security: fail CLOSED when no token is configured. See ADR-0002.
  //
  // This previously failed open so the app would run without a .env file. But
  // checkAppAuth guards 17 routes including /api/orders, /api/tpsl, /api/balance
  // and the three AI proxies — on a public deployment an unset token turned those
  // into an open relay, with AI calls billed to the operator. An unconfigured
  // secret is a misconfiguration, not a permission grant.
  if (!serverToken) {
    // The operator learns about the misconfiguration from the server log. The
    // response is deliberately identical to the invalid-token case below: telling
    // an unauthenticated caller "the server has no token configured" would hand
    // them a useful fact about the deployment.
    console.error(
      "APP_ACCESS_TOKEN is not configured. Denying all authenticated API requests. " +
        "Set it in your environment — see .env.example.",
    );
    return json(
      { error: "Unauthorized: Invalid or missing App Access Token" },
      { status: 401 },
    );
  }

  const clientToken = request.headers.get("x-app-access-token") || "";

  // Use timingSafeEqual on hashes to prevent timing attacks and length leaks.
  const serverHash = crypto.createHash("sha256").update(serverToken).digest();
  const clientHash = crypto.createHash("sha256").update(clientToken).digest();

  // crypto.timingSafeEqual throws if lengths differ, but SHA256 hashes are always 32 bytes.
  if (!crypto.timingSafeEqual(clientHash, serverHash)) {
    return json(
      { error: "Unauthorized: Invalid or missing App Access Token" },
      { status: 401 }
    );
  }

  return null;
}
