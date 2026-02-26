/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

export const ERROR_CODE_MAP: Record<string | number, string> = {
    // Generic
    "400": "error.badRequest",
    "401": "error.unauthorized",
    "403": "error.forbidden",
    "404": "error.notFound",
    "429": "error.tooManyRequests",
    "500": "error.internalError",
    "502": "error.badGateway",

    // Bitunix / Exchange Specific
    "20002": "error.insufficientBalance",
    "20003": "error.orderNotFound",
    "20004": "error.symbolNotFound",
    "20005": "error.invalidOrderType",
    "20006": "error.positionNotFound",
    "20007": "error.leverageError",

    // System
    "SKIP_FRESH": "analyst.skipFresh",
    "MIN_DATA_REQUIRED": "analyst.insufficientData"
};

/**
 * Maps an API error code or message to a localized key.
 * Falls back to the original message if no mapping exists.
 */
export function getLocalizedErrorKey(codeOrMsg: string | number): string {
    const key = String(codeOrMsg);
    // 1. Direct match
    if (ERROR_CODE_MAP[key]) return ERROR_CODE_MAP[key];

    // 2. Contains Check (e.g. "Error 20002: ...")
    for (const [code, i18nKey] of Object.entries(ERROR_CODE_MAP)) {
        if (key.includes(code)) return i18nKey;
    }

    return "error.generic";
}
