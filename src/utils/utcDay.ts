/**
 * Start of the UTC day containing `now`, in epoch ms.
 *
 * The trading day is UTC, not local: the daily-loss gate and the auto-engage
 * suppression both compare against this boundary, and a trader changing
 * timezones must not re-arm or re-open a limit by accident.
 */
export function utcDayStart(now: number): number {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
