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

export function getErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object' && 'message' in e) return String((e as any).message);
    return String(e);
}

export function getBitunixErrorKey(code: number | string): string {
    // Map Bitunix error codes to translation keys
    const codeStr = String(code);
    return `bitunixErrors.${codeStr}`;
}

export function mapApiErrorToLabel(error: unknown): string {
    const msg = getErrorMessage(error);
    // Simple mapping for now, can be expanded
    if (msg.includes("429")) return "apiErrors.tooManyRequests";
    if (msg.includes("401")) return "apiErrors.unauthorized";
    return msg;
}
