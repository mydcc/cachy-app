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
  // Fallback to process.env for testing environments where $env might be mocked/missing
  const serverToken = env.APP_ACCESS_TOKEN || process.env.APP_ACCESS_TOKEN;

  // Security: Fail closed if no token is configured on the server.
  // This prevents accidental exposure of the API if the configuration is missing.
  if (!serverToken) {
    return json(
      { error: "Unauthorized: App Access Token not configured on server" },
      { status: 401 }
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
