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

/**
 * Checks if the request contains the correct App Access Token if one is configured on the server.
 * Returns null if authorized (or no token configured), or a 401 Response if unauthorized.
 */
export function checkAppAuth(request: Request): Response | null {
  const serverToken = env.APP_ACCESS_TOKEN;

  // If no token is configured on the server, we allow access (legacy/default mode)
  if (!serverToken) {
    return null;
  }

  const clientToken = request.headers.get("x-app-access-token");

  if (!clientToken || clientToken !== serverToken) {
    return json(
      { error: "Unauthorized: Invalid or missing App Access Token" },
      { status: 401 }
    );
  }

  return null;
}
