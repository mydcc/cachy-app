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
