/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, fetch }) => {
  try {
    const { source, apiKey, params } = await request.json();

    if (!apiKey) {
      return json({ error: "Missing API Key" }, { status: 400 });
    }

    let url = "";
    if (source === "cryptopanic") {
      // https://cryptopanic.com/api/v1/posts/?auth_token=...
      const query = new URLSearchParams(params).toString();
      url = `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&${query}`;
    } else if (source === "newsapi") {
      // https://newsapi.org/v2/everything?apiKey=...
      const query = new URLSearchParams(params).toString();
      url = `https://newsapi.org/v2/everything?apiKey=${apiKey}&${query}`;
    } else {
      return json({ error: "Invalid source" }, { status: 400 });
    }

    const response = await fetch(url);
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[NewsProxy] ${source} error:`, errorText);
        return json({ error: `Upstream error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    return json(data);

  } catch (err: any) {
    console.error("[NewsProxy] Error:", err);
    return json({ error: err.message || "Internal Proxy Error" }, { status: 500 });
  }
};
