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

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const CMC_BASE_URL = "https://pro-api.coinmarketcap.com";

export const GET: RequestHandler = async ({ url, request }) => {
  const endpoint = url.searchParams.get("endpoint");
  const cmcApiKey = request.headers.get("x-cmc-api-key");

  if (!endpoint) {
    return json({ error: "Missing endpoint parameter" }, { status: 400 });
  }

  if (!cmcApiKey) {
    return json({ error: "Missing x-cmc-api-key header" }, { status: 401 });
  }

  // Whitelist allowed endpoints to prevent abuse
  const ALLOWED_ENDPOINTS = [
    "/v1/global-metrics/quotes/latest",
    "/v1/cryptocurrency/quotes/latest",
    "/v1/cryptocurrency/map",
    "/v1/cryptocurrency/categories",
    "/v1/cryptocurrency/category",
  ];

  if (!ALLOWED_ENDPOINTS.includes(endpoint)) {
    return json({ error: "Endpoint not allowed" }, { status: 403 });
  }

  // Reconstruct query parameters (forwarding everything except 'endpoint')
  const queryParams = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (key !== "endpoint") {
      queryParams.append(key, value);
    }
  });

  const targetUrl = `${CMC_BASE_URL}${endpoint}?${queryParams.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "X-CMC_PRO_API_KEY": cmcApiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(`[CMC Proxy] Error ${response.status}:`, errorBody);
      return json(
        { error: `CMC API Error: ${response.status}`, details: errorBody },
        { status: response.status },
      );
    }

    const data = await response.json();
    return json(data);
  } catch (error: any) {
    console.error("[CMC Proxy] Exception:", error);
    return json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 },
    );
  }
};
