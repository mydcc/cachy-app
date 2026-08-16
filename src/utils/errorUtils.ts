/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { OrderRefusedError, translateRefusal } from "../services/orderGate";
import type { TranslationKey } from "../locales/schema";

/** The shape of svelte-i18n's `$_`, so call sites can pass it unchanged. */
type Translate = (key: TranslationKey, vars?: Record<string, unknown>) => string;

export function getErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message?: unknown }).message);
    return String(e);
}

/**
 * Returns a human-readable message suitable for display in toasts/modals.
 *
 * `BitunixApiError.message` intentionally carries an i18n key such as
 * "apiErrors.generic" for sanitized propagation, with the raw gateway text
 * preserved in `rawMessage`. Callers that surface errors directly to the
 * user must prefer `rawMessage`, falling back to the Error message for
 * non-API errors (e.g. "tradeErrors.positionNotFound").
 */
export function getDisplayMessage(e: unknown, t?: Translate): string {
    // FEAT-0011: a gate refusal already knows which field disagreed and by
    // how much. Its `.message` is an English developer string; the
    // translated form is the one the trader needs, so render it when a
    // translate function is available.
    if (t && e instanceof OrderRefusedError) {
        // The `orderGate.*` message keys are all in the schema; the per-field
        // ones (`orderGate.fields.<field>`) are assembled at runtime and
        // deliberately allowed to miss — translateRefusal falls back to the
        // raw field name. That is the only reason this cast exists.
        return translateRefusal(e.refusal, (key, options) =>
            t(key as TranslationKey, options),
        );
    }
    if (e && typeof e === 'object' && 'rawMessage' in e) {
        const raw = (e as { rawMessage?: unknown }).rawMessage;
        if (typeof raw === 'string' && raw.length > 0) return raw;
    }
    return getErrorMessage(e);
}

export function getBitunixErrorKey(code: number | string): string {
    // Map Bitunix error codes to translation keys
    const codeStr = String(code);
    return `bitunixErrors.${codeStr}`;
}

export function mapApiErrorToLabel(error: unknown): string {
    // Use rawMessage from BitunixApiError for classification if available
    let msg = getErrorMessage(error);
    if (error && typeof error === 'object' && 'rawMessage' in error && typeof (error as { rawMessage?: unknown }).rawMessage === 'string') {
        msg = (error as { rawMessage?: string }).rawMessage || msg;
    }
    const lowerMsg = msg.toLowerCase();

    // Map common authentication errors
    if (lowerMsg.includes("key") && (lowerMsg.includes("invalid") || lowerMsg.includes("incorrect"))) {
        return "settings.errors.invalidApiKey";
    }

    if (lowerMsg.includes("ip") && (lowerMsg.includes("allow") || lowerMsg.includes("whitelist"))) {
        return "settings.errors.ipNotAllowed";
    }

    // Simple mapping for now, can be expanded
    if (msg.includes("429")) return "apiErrors.tooManyRequests";
    if (msg.includes("401")) return "apiErrors.unauthorized";
    return msg;
}
