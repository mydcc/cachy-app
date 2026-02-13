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

import { logger } from "./logger";
import { safeJsonParse } from "../utils/safeJson";
import Decimal from "decimal.js";

export class ApiError extends Error {
    constructor(
        public message: string,
        public code: string | number | undefined,
        public status: number,
        public details?: any
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export class ApiClient {
    // Helper to safely serialize Decimals to strings
    public static serializePayload(payload: any, depth = 0, seen = new WeakSet()): any {
        if (depth > 20) {
            logger.warn("network", "[ApiClient] Serialization depth limit exceeded");
            return "[Serialization Limit]";
        }

        if (!payload) return payload;
        if (payload instanceof Decimal) return payload.toString();

        // Handle generic objects that might be Decimals if constructor name is mangled or instance check fails
        if (typeof payload === 'object' && payload !== null && typeof payload.isZero === 'function' && typeof payload.toFixed === 'function') {
            return payload.toString();
        }

        if (typeof payload === 'object' && payload !== null) {
            if (seen.has(payload)) return "[Circular]";
            seen.add(payload);
        }

        if (Array.isArray(payload)) {
            return payload.map(item => ApiClient.serializePayload(item, depth + 1, seen));
        }

        if (typeof payload === 'object') {
            const newObj: any = {};
            for (const key in payload) {
                if (Object.prototype.hasOwnProperty.call(payload, key)) {
                    newObj[key] = ApiClient.serializePayload(payload[key], depth + 1, seen);
                }
            }
            return newObj;
        }

        return payload;
    }

    public static async request<T>(
        method: string,
        endpoint: string,
        payload: Record<string, any> = {},
        headers: Record<string, string> = {}
    ): Promise<T> {
        // Deep serialize Decimals
        const serializedPayload = this.serializePayload(payload);

        const options: RequestInit = {
            method,
            headers: {
                "Content-Type": "application/json",
                ...headers
            }
        };

        if (method !== "GET" && method !== "HEAD") {
            options.body = JSON.stringify(serializedPayload);
        }

        let response: Response;
        try {
            response = await fetch(endpoint, options);
        } catch (e: any) {
            logger.error("network", `[ApiClient] Network error for ${endpoint}`, e);
            throw new ApiError("Network Error", "NETWORK_ERROR", 0, e);
        }

        const text = await response.text();
        let data: any = {};

        try {
            data = safeJsonParse(text);
        } catch (e) {
            // If response is not JSON (e.g. 502 Bad Gateway HTML, or 429 plain text)
            if (!response.ok) {
                 throw new ApiError(text || response.statusText, "HTTP_ERROR", response.status);
            }
            // If OK but not JSON (rare for this API)
            logger.warn("network", `[ApiClient] Invalid JSON from ${endpoint}`, text);
        }

        // Standardized Error Handling
        // 1. HTTP Level Errors
        if (!response.ok) {
             const msg = data.msg || data.error || response.statusText;
             const code = data.code || "HTTP_ERROR";
             throw new ApiError(msg, code, response.status, data);
        }

        // 2. API Level Errors (Bitunix style: code != 0, but can be string "0")
        if (data.code !== undefined && String(data.code) !== "0") {
            // Use 'msg' or 'error' field
            throw new ApiError(data.msg || data.error || "Unknown API Error", data.code, response.status, data);
        }

        return data as T;
    }
}
