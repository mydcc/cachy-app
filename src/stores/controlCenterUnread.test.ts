// @vitest-environment happy-dom
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
 * FEAT-0749 — the unread badge is a count of rule firings since the last look.
 *
 * Session-only by decision: a reload starts a fresh "seen" instant instead of
 * replaying the whole ledger as unread.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true }));
import {
    SHADOW_LEDGER_STORAGE_KEY,
    SHADOW_LEDGER_SCHEMA_VERSION,
} from "../services/alertEngine/shadowLedger";
import { windowManager } from "../lib/windows/WindowManager.svelte";
import { ControlCenterWindow } from "../lib/windows/implementations/ControlCenterWindow.svelte";
import { controlCenterUnread } from "./controlCenterUnread.svelte";


function seed(records: Array<{ id: string; at: number; source?: string }>) {
    localStorage.setItem(
        SHADOW_LEDGER_STORAGE_KEY,
        JSON.stringify({
            schema_version: SHADOW_LEDGER_SCHEMA_VERSION,
            records: records.map((record) => ({
                source: record.source ?? "rule",
                recordedAtMs: record.at,
                symbol: "BTCUSDT",
                id: record.id,
                timeframe: "1m",
                anchorMs: record.at - 60_000,
                verdict: "Triggered",
            })),
        }),
    );
}

describe("FEAT-0749: controlCenterUnread", () => {
    let win: ControlCenterWindow;

    beforeEach(() => {
        localStorage.clear();
        controlCenterUnread.markSeen(1_000);
        win = new ControlCenterWindow({ title: "Alerts & Bots" });
        windowManager.open(win);
        // `open()` focuses the window; these tests are about the unfocused
        // desk unless they say otherwise.
        win.isFocused = false;
    });

    afterEach(() => {
        windowManager.close(win.id);
    });

    it("counts rule firings newer than the last look", () => {
        seed([
            { id: "old", at: 900 },
            { id: "new", at: 2_000 },
            { id: "shadow", at: 3_000, source: "shadow" },
        ]);

        expect(controlCenterUnread.count).toBe(1);
    });

    it("clears when the trader looks", () => {
        seed([{ id: "new", at: 2_000 }]);
        controlCenterUnread.markSeen(2_500);

        expect(controlCenterUnread.count).toBe(0);
    });

    it("is zero while the window is open and focused", () => {
        seed([{ id: "new", at: 2_000 }]);
        win.isFocused = true;

        expect(controlCenterUnread.count).toBe(0);

        win.isFocused = false;
        expect(controlCenterUnread.count).toBe(1);
    });
});
