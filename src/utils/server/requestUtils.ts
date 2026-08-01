/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

export interface ApiCredentials {
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;
}

/**
 * Extracts API credentials from Request headers (primary) or Body (fallback).
 * Headers are expected to be:
 * - X-Api-Key
 * - X-Api-Secret
 * - X-Api-Passphrase
 *
 * @param request SvelteKit Request object
 * @param body Optional parsed JSON body
 * @returns Object containing credentials
 */
export function extractApiCredentials(request: Request, body?: unknown): ApiCredentials {
    const headers = request.headers;

    // 1. Try Headers (Case-insensitive get)
    let apiKey = headers.get("x-api-key") || undefined;
    let apiSecret = headers.get("x-api-secret") || undefined;
    let passphrase = headers.get("x-api-passphrase") || undefined;

    // 2. Fallback to Body (if provided)
    const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined;
    if (!apiKey && b?.apiKey) apiKey = String(b.apiKey);
    if (!apiSecret && b?.apiSecret) apiSecret = String(b.apiSecret);
    if (!passphrase && b?.passphrase) passphrase = String(b.passphrase);

    return { apiKey, apiSecret, passphrase };
}
