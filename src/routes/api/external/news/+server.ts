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
    const { source, apiKey, params, plan } = await request.json();

    if (!apiKey) {
      return json({ error: "Missing API Key" }, { status: 400 });
    }

    if (source === "cryptopanic") {
      const query = new URLSearchParams(params).toString();
      const plans: ("developer" | "growth" | "enterprise")[] = [
        "developer",
        "growth",
        "enterprise",
      ];

      // If a specific plan is requested, try it first
      if (plan && plans.includes(plan)) {
        const idx = plans.indexOf(plan);
        plans.splice(idx, 1);
        plans.unshift(plan);
      }

      let lastError = "";
      for (const p of plans) {
        // Correct structure: https://cryptopanic.com/api/<plan>/v2/posts/?auth_token=...
        const url = `https://cryptopanic.com/api/${p}/v2/posts/?auth_token=${apiKey}&${query}`;

        try {
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            return json(data);
          }
          if (response.status === 404) {
            lastError = `404 Not Found for plan: ${p}`;
            continue; // Try next plan
          }
          const errorText = await response.text();
          return json(
            {
              error: `Upstream error (${p}): ${response.status}`,
              details: errorText,
            },
            { status: response.status },
          );
        } catch (e: any) {
          lastError = e.message;
          continue;
        }
      }
      return json(
        { error: "Could not find valid CryptoPanic endpoint", lastError },
        { status: 404 },
      );
    } else if (source === "newsapi") {
      const query = new URLSearchParams(params).toString();
      const url = `https://newsapi.org/v2/everything?apiKey=${apiKey}&${query}`;
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        return json(
          { error: `Upstream error: ${response.status}` },
          { status: response.status },
        );
      }
      const data = await response.json();
      return json(data);
    } else {
      return json({ error: "Invalid source" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[NewsProxy] Error:", err);
    return json(
      { error: err.message || "Internal Proxy Error" },
      { status: 500 },
    );
  }
};
