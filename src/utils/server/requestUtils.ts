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
export function extractApiCredentials(request: Request, body?: any): ApiCredentials {
    const headers = request.headers;

    // 1. Try Headers (Case-insensitive get)
    let apiKey = headers.get("x-api-key") || undefined;
    let apiSecret = headers.get("x-api-secret") || undefined;
    let passphrase = headers.get("x-api-passphrase") || undefined;

    // 2. Fallback to Body (if provided)
    if (!apiKey && body && typeof body === 'object') {
        if (body.apiKey) apiKey = String(body.apiKey);
    }
    if (!apiSecret && body && typeof body === 'object') {
        if (body.apiSecret) apiSecret = String(body.apiSecret);
    }
    if (!passphrase && body && typeof body === 'object') {
        if (body.passphrase) passphrase = String(body.passphrase);
    }

    return { apiKey, apiSecret, passphrase };
}
