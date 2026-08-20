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

/*
 * Order audit trail — FEAT-0015.
 *
 * When an order does something unexpected there was no record of what was
 * actually sent, what came back, or which checks it passed. Reconstruction
 * depended on a console that may not have been open.
 *
 * This records every submission attempt — including the ones the gate
 * refused, which are exactly the ones a console would never have shown,
 * because nothing was sent. Attempts are appended through the FEAT-0011
 * gate's recorder seam, so a call site cannot place an order without
 * appearing here.
 *
 * Class A, and more sensitive than most: it describes what was sent to an
 * exchange and when. It is never attached to a crash report, telemetry or a
 * debug upload. Credentials and signatures are redacted before the record is
 * written, not before it is displayed — what lands on disk is already clean.
 */

import { CONSTANTS } from "../lib/constants";
import { safeJsonParse } from "../utils/safeJson";
import { StorageHelper } from "../utils/storageHelper";
import { redactDeep, redactString } from "../utils/redact";
import { registerAuditRecorder, type OrderAttempt } from "./orderGate";
import { logger } from "./logger";

export type OrderAuditOutcome = "sent" | "refused" | "failed";

export interface OrderAuditEntry {
    id: string;
    /** When the attempt started, epoch ms. */
    at: number;
    /** When it resolved, epoch ms. */
    completedAt: number;
    outcome: OrderAuditOutcome;
    endpoint: string;
    /** The mutating action, e.g. "place-order". */
    action: string;
    kind: string;
    mode: "live" | "paper";
    account: { provider: string; fingerprint: string };
    /** The exact payload, redacted. */
    payload: unknown;
    /** Every field the gate compared. */
    checked: string[];
    /** Present iff the gate refused. */
    refusal?: {
        field: string;
        reason: string;
        messageKey: string;
        values: Record<string, string>;
    };
    /** The exchange's response, redacted. Present iff outcome is "sent". */
    response?: unknown;
    /** Present iff outcome is "failed" — the transport threw. */
    error?: { name: string; message: string };
}

/**
 * Eviction rule, stated as the acceptance criteria require:
 *
 * The log keeps the **most recent 500 attempts**. Writing the 501st drops
 * the oldest. Independently, if the serialised log would exceed **512 KB**,
 * the oldest entries are dropped until it fits — one pathological payload
 * must not be able to consume the whole `localStorage` budget and take the
 * journal down with it.
 *
 * Both bounds drop from the oldest end. Nothing is ever summarised or
 * rewritten: an entry is present in full or absent.
 */
export const MAX_AUDIT_ENTRIES = 500;
export const MAX_AUDIT_BYTES = 512 * 1024;

class OrderAuditService {
    private entries: OrderAuditEntry[] = [];
    private loaded = false;
    private nextId = 1;

    /**
     * Attaches to the gate. Called once at startup; until it runs, nothing is
     * recorded, so there is a test that startup calls it.
     */
    public install(): void {
        registerAuditRecorder((attempt) => this.record(attempt));
        this.load();
    }

    /** Test seam — detaches the recorder. */
    public uninstall(): void {
        registerAuditRecorder(null);
    }

    public getEntries(): readonly OrderAuditEntry[] {
        this.load();
        return this.entries;
    }

    public clear(): void {
        this.entries = [];
        this.persist();
    }

    /**
     * Appends one attempt. Redaction happens here, before the entry exists in
     * memory as a record — so there is no window in which an unredacted copy
     * could be persisted or exported.
     */
    public record(attempt: OrderAttempt): OrderAuditEntry {
        this.load();

        const entry: OrderAuditEntry = {
            id: `audit-${attempt.at}-${this.nextId++}`,
            at: attempt.at,
            completedAt: attempt.completedAt,
            outcome: attempt.outcome,
            endpoint: attempt.endpoint,
            action: attempt.action,
            kind: attempt.kind,
            mode: attempt.paperMode ? "paper" : "live",
            account: {
                provider: attempt.provider,
                fingerprint: attempt.accountFingerprint,
            },
            payload: redactDeep(attempt.payload),
            checked: attempt.checked,
        };

        if (attempt.refusal) entry.refusal = attempt.refusal;
        if (attempt.outcome === "sent") entry.response = redactDeep(attempt.response);
        if (attempt.error) {
            entry.error = {
                name: attempt.error.name,
                // An exchange error message can quote the request that caused
                // it, credentials included.
                message: redactString(attempt.error.message),
            };
        }

        this.entries.push(entry);
        this.enforceBounds();
        this.persist();
        return entry;
    }

    private enforceBounds(): void {
        if (this.entries.length > MAX_AUDIT_ENTRIES) {
            this.entries = this.entries.slice(-MAX_AUDIT_ENTRIES);
        }
        // Byte bound second: the count bound is cheap, so run it first and
        // only measure when it has already trimmed what it can.
        while (this.entries.length > 1) {
            const size = JSON.stringify(this.entries).length;
            if (size <= MAX_AUDIT_BYTES) break;
            this.entries.shift();
        }
    }

    /**
     * The log as a JSON document the user can read and send to support.
     * Already redacted, because the stored entries are.
     */
    public exportJson(): string {
        this.load();
        return JSON.stringify(
            {
                format: "cachy-order-audit",
                version: 1,
                exportedAt: new Date().toISOString(),
                entryCount: this.entries.length,
                entries: this.entries,
            },
            null,
            2,
        );
    }

    /**
     * Hands the export to the user as a file download. Same mechanism
     * `backupService` uses — the file never leaves the machine; the browser
     * writes it locally from a blob URL.
     */
    public downloadExport(): void {
        if (typeof document === "undefined") return;
        const blob = new Blob([this.exportJson()], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const date = new Date().toISOString().replace(/[:.]/g, "-");
        link.download = `cachy-order-audit-${date}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    // -- persistence ---------------------------------------------------------

    private persist(): void {
        if (typeof localStorage === "undefined") return;
        try {
            StorageHelper.safeSave(
                CONSTANTS.LOCAL_STORAGE_ORDER_AUDIT_KEY,
                JSON.stringify({ nextId: this.nextId, entries: this.entries }),
            );
        } catch (e) {
            logger.debug("data", "[Audit] Persist failed", e);
        }
    }

    private load(): void {
        if (this.loaded) return;
        this.loaded = true;
        if (typeof localStorage === "undefined") return;
        try {
            const stored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_ORDER_AUDIT_KEY);
            if (!stored) return;
            const parsed = safeJsonParse(stored) as {
                nextId?: number;
                entries?: OrderAuditEntry[];
            };
            if (Array.isArray(parsed?.entries)) {
                this.entries = parsed.entries.filter(
                    (e) => e && typeof e === "object" && typeof e.at === "number",
                );
            }
            if (typeof parsed?.nextId === "number" && parsed.nextId > 0) {
                this.nextId = parsed.nextId;
            }
        } catch (e) {
            // A corrupt log is not worth failing over — losing history is
            // recoverable, refusing to start is not.
            logger.debug("data", "[Audit] Load failed, starting empty", e);
            this.entries = [];
        }
    }

    /** Test seam: rereads from storage as a fresh session would. */
    public reloadFromStorage(): void {
        this.entries = [];
        this.nextId = 1;
        this.loaded = false;
        this.load();
    }
}

export const orderAuditService = new OrderAuditService();
