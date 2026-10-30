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

/**
 * FEAT-0749 — firings the trader has not looked at yet.
 *
 * Session-only on purpose. Persisting the "last seen" instant would keep a
 * durable record of when someone looked at their alarms — Class A metadata
 * nobody asked for — and would greet every reload with the whole ledger marked
 * unread. "Unread" therefore means "since this session last opened or focused
 * the control center".
 *
 * The ledger is the count's source because it is the only record of an
 * announcement: a repeating rule fires without touching the rule store.
 */

import { readShadowLedger } from "../services/alertEngine/shadowLedger";
import { windowManager } from "../lib/windows/WindowManager.svelte";
import { alertState } from "./alerts.svelte";

const CONTROL_CENTER_TYPE = "controlcenter";

class ControlCenterUnread {
    private _lastSeenMs = $state(Date.now());

    public get lastSeenMs(): number {
        return this._lastSeenMs;
    }

    /**
     * How many rule firings are newer than the last look.
     *
     * Zero while the window is open and focused: the trader is looking at the
     * live list, and a badge that counts what is on screen is noise. Reading
     * `firingsVersion` is what makes a new announcement re-evaluate this.
     */
    public get count(): number {
        void alertState.firingsVersion;
        if (this.isOpenAndFocused()) return 0;

        const cutoff = this._lastSeenMs;
        return readShadowLedger().records.filter(
            (record) => record.source === "rule" && record.recordedAtMs > cutoff,
        ).length;
    }

    /**
     * The trader is looking: everything up to `atMs` has been seen.
     *
     * The instant is injectable so a test can place "seen" before or after a
     * ledger record without waiting on the clock.
     */
    public markSeen(atMs: number = Date.now()): void {
        this._lastSeenMs = atMs;
    }

    private isOpenAndFocused(): boolean {
        const win = windowManager.windows.find(
            (candidate) => candidate.windowType === CONTROL_CENTER_TYPE,
        );
        return win !== undefined && !win.isMinimized && win.isFocused;
    }
}

export const controlCenterUnread = new ControlCenterUnread();

/** The registry's count provider. Kept here so the entry stays data. */
export function controlCenterUnreadCount(): number {
    return controlCenterUnread.count;
}
