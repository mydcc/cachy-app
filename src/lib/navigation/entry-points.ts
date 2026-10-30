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
 * Entry-point registry — FEAT-0707, step 1 of FEAT-0618.
 *
 * Data and pure functions only. This module deliberately imports no Svelte
 * rune store, window manager or router: the surfaces are migrated later, and
 * their side-effectful `openEntry` adapter is a separate concern. Tests can
 * therefore validate the registry and every condition without mounting UI.
 */

import type { TranslationKey } from "../../locales/schema";
import type { Settings } from "../../stores/settings/settingsTypes";
import type { WindowType } from "../windows/types";
import { controlCenterUnreadCount } from "../../stores/controlCenterUnread.svelte";

export type EntryId = string;
export type SurfaceId = "rail" | "header" | "journal-tabs" | "settings-rail";
export type GroupId = string;
export type IconKey = string;
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

export type ToggleTarget =
    | "market-dashboard"
    | "alerts"
    | "assistant"
    | "technicals"
    | "market-overview"
    | "market-activity"
    | "market-sentiment";

export type DerivedFlagKey =
    | "isTechnicalsVisible"
    | "effectiveShowSidebarActivity"
    | "journalFetching"
    | "multipleAccounts"
    | "rssFeedCapacityAvailable";

export type WindowState = "open" | "minimized" | "closed";

export type Opener =
    | { kind: "window"; windowType: WindowType; instance?: string }
    | { kind: "toggle"; target: ToggleTarget }
    | { kind: "tab"; tabId: string }
    | { kind: "route"; path: string };

export type Condition =
    | { kind: "always" }
    | { kind: "all"; conditions: Condition[] }
    | { kind: "any"; conditions: Condition[] }
    | { kind: "not"; condition: Condition }
    | { kind: "setting"; key: keyof Settings; equals?: JsonValue }
    | { kind: "entitlement"; feature: "pro" }
    | {
          kind: "account";
          accountId?: string;
          exchange?: string;
          active?: boolean;
      }
    | { kind: "window"; id: EntryId; state: WindowState }
    | { kind: "viewport"; minWidth: number }
    | {
          kind: "state";
          key: string;
          equals?: JsonValue;
          notEquals?: JsonValue;
          present?: boolean;
          nonEmpty?: boolean;
      }
    | { kind: "derived"; key: DerivedFlagKey; truthy?: boolean }
    | { kind: "data"; key: string; present?: boolean };

export type KeyboardRoute =
    | { kind: "shortcut"; keys: string; scope: "global" | SurfaceId }
    | { kind: "tab-order"; surface: SurfaceId }
    | { kind: "none"; reason: string; bug: string };

export interface Placement {
    surface: SurfaceId;
    group: GroupId;
    order: number;
    keyboard: KeyboardRoute;
    visibleWhen?: Condition;
    enabledWhen?: Condition;
    /** Visual selected state (a toggle that is on, a panel that is open). */
    activeWhen?: Condition;
}

export interface Entry {
    id: EntryId;
    labels: {
        label: TranslationKey;
        title?: TranslationKey;
        description?: TranslationKey;
    };
    icon: IconKey;
    opener: Opener;
    shortcut?: string;
    parent?: EntryId;
    telemetryName?: string;
    /**
     * Optional live count rendered on the rail entry — FEAT-0749.
     *
     * A function rather than a number so the surface re-reads it when the
     * underlying store changes; entries without one render as before.
     */
    countProvider?: () => number;
    /** How the counted state is announced; `{label}` and `{count}` are filled. */
    countLabel?: TranslationKey;
    placements: Placement[];
}

export interface EntryContext {
    settings: Partial<Settings>;
    entitlement: { pro: boolean };
    accounts: {
        activeId: string | null;
        activeExchange: string | null;
        count: number;
    };
    windows: Partial<Record<EntryId, WindowState>>;
    viewportWidth: number;
    ui: Record<string, unknown>;
    derived: Partial<Record<DerivedFlagKey, boolean>>;
    data: Record<string, boolean>;
}

/**
 * Context for surfaces whose placements are condition-free by contract: the
 * header and the journal tab strip. `entry-points.test.ts` pins both, so a
 * condition added to one of those surfaces fails there before it can silently
 * evaluate against these zeroed values. Every other surface builds its own
 * context from the stores.
 */
export const STATIC_ENTRY_CONTEXT: EntryContext = {
    settings: {},
    entitlement: { pro: false },
    accounts: { activeId: null, activeExchange: null, count: 0 },
    windows: {},
    viewportWidth: 0,
    ui: {},
    derived: {},
    data: {},
};

export interface SurfaceEntry {
    entry: Entry;
    placement: Placement;
    enabled: boolean;
    active: boolean;
}

function valuesEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (
        left === null ||
        right === null ||
        typeof left !== "object" ||
        typeof right !== "object"
    ) {
        return false;
    }
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

/**
 * Pure condition evaluator. The context is supplied by the surface adapter;
 * this module never reads a store. Every token in the FEAT-0618 contract is
 * covered here, so adding a token without an evaluator is a compile error.
 */
export function evaluateCondition(
    condition: Condition,
    context: EntryContext,
): boolean {
    switch (condition.kind) {
        case "always":
            return true;
        case "all":
            return condition.conditions.every((entry) =>
                evaluateCondition(entry, context),
            );
        case "any":
            return condition.conditions.some((entry) =>
                evaluateCondition(entry, context),
            );
        case "not":
            return !evaluateCondition(condition.condition, context);
        case "setting": {
            const value = context.settings[condition.key];
            return "equals" in condition
                ? valuesEqual(value, condition.equals)
                : Boolean(value);
        }
        case "entitlement":
            return condition.feature === "pro" && context.entitlement.pro;
        case "account": {
            // The context exposes the active account, not the account list:
            // `active: false` therefore means "a different account is active"
            // (or none is), not "this identity does not exist".
            const active =
                context.accounts.count > 0 &&
                (condition.accountId === undefined ||
                    context.accounts.activeId === condition.accountId) &&
                (condition.exchange === undefined ||
                    context.accounts.activeExchange === condition.exchange);
            return condition.active === undefined || condition.active === active;
        }
        case "window":
            return (context.windows[condition.id] ?? "closed") === condition.state;
        case "viewport":
            return context.viewportWidth >= condition.minWidth;
        case "state": {
            const value = context.ui[condition.key];
            const present = value !== undefined && value !== null;
            if (
                condition.present !== undefined &&
                present !== condition.present
            ) {
                return false;
            }
            if (condition.nonEmpty) {
                if (
                    (typeof value === "string" && value.length === 0) ||
                    (Array.isArray(value) && value.length === 0) ||
                    value === undefined ||
                    value === null
                ) {
                    return false;
                }
            }
            if (
                "equals" in condition &&
                !valuesEqual(value, condition.equals)
            ) {
                return false;
            }
            if (
                "notEquals" in condition &&
                valuesEqual(value, condition.notEquals)
            ) {
                return false;
            }
            return true;
        }
        case "derived":
            return (
                Boolean(context.derived[condition.key]) ===
                (condition.truthy ?? true)
            );
        case "data":
            return (
                Boolean(context.data[condition.key]) ===
                (condition.present ?? true)
            );
    }
}

/**
 * Visible entries for one surface, sorted by their explicit placement order.
 * Callers must not sort by label: locale changes must not move buttons.
 */
export function getSurfaceEntries(
    surface: SurfaceId,
    context: EntryContext,
): SurfaceEntry[] {
    const resolved: SurfaceEntry[] = [];

    for (const entry of ENTRY_POINTS) {
        for (const placement of entry.placements) {
            if (placement.surface !== surface) continue;
            const visible = evaluateCondition(
                placement.visibleWhen ?? { kind: "always" },
                context,
            );
            if (!visible) continue;
            resolved.push({
                entry,
                placement,
                enabled: evaluateCondition(
                    placement.enabledWhen ?? { kind: "always" },
                    context,
                ),
                active: placement.activeWhen
                    ? evaluateCondition(placement.activeWhen, context)
                    : false,
            });
        }
    }

    return resolved.sort(
        (left, right) =>
            left.placement.order - right.placement.order ||
            left.entry.id.localeCompare(right.entry.id),
    );
}

const always: Condition = { kind: "always" };

function rail(
    order: number,
    group: "destinations" | "panels",
    extra: Partial<Placement> = {},
): Placement {
    return {
        surface: "rail",
        group,
        order,
        keyboard: { kind: "tab-order", surface: "rail" },
        ...extra,
    };
}

function header(order: number): Placement {
    return {
        surface: "header",
        group: "primary",
        order,
        keyboard: { kind: "tab-order", surface: "header" },
        visibleWhen: always,
    };
}

function tabPlacement(
    surface: "journal-tabs" | "settings-rail",
    group: GroupId,
    order: number,
): Placement {
    return {
        surface,
        group,
        order,
        keyboard: { kind: "tab-order", surface },
        visibleWhen: always,
        enabledWhen: always,
    };
}

const GLOBAL_DESTINATIONS: Entry[] = [
    {
        id: "journal",
        labels: {
            label: "app.journalButton",
            title: "app.journalButtonTitle",
        },
        icon: "icons.book",
        opener: { kind: "window", windowType: "journal", instance: "journal" },
        placements: [
            header(10),
            rail(60, "destinations", {
                visibleWhen: { kind: "window", id: "journal", state: "minimized" },
                activeWhen: { kind: "window", id: "journal", state: "minimized" },
            }),
        ],
    },
    {
        id: "settings",
        telemetryName: "OpenSettings",
        labels: { label: "settings.title" },
        icon: "icons.settings",
        opener: {
            kind: "window",
            windowType: "settings",
            instance: "settings",
        },
        placements: [rail(20, "destinations")],
    },
    {
        id: "dashboard",
        telemetryName: "OpenMarketDashboard",
        labels: { label: "app.marketDashboard.buttonTitle" },
        icon: "rail-dashboard",
        opener: { kind: "toggle", target: "market-dashboard" },
        placements: [rail(10, "destinations")],
    },
    {
        id: "alerts",
        telemetryName: "OpenAlerts",
        labels: {
            label: "dashboard.controlCenter.title",
            title: "dashboard.controlCenter.title",
            description: "dashboard.controlCenter.description",
        },
        icon: "rail-alerts",
        // FEAT-0749 — the bell opens the operating desk, not the builder. The
        // builder is one click away through "New alert" inside it.
        opener: { kind: "window", windowType: "controlcenter" },
        countProvider: controlCenterUnreadCount,
        countLabel: "dashboard.controlCenter.unreadAria",
        placements: [rail(30, "destinations")],
    },
    {
        id: "academy",
        telemetryName: "OpenAcademy",
        labels: { label: "academy.title" },
        icon: "rail-academy",
        opener: { kind: "window", windowType: "academy" },
        placements: [rail(40, "destinations")],
    },
    {
        id: "assistant",
        telemetryName: "OpenAssistant",
        labels: { label: "sidePanel.aiAssistant" },
        icon: "rail-assistant",
        opener: { kind: "toggle", target: "assistant" },
        placements: [
            rail(50, "destinations", {
                activeWhen: {
                    kind: "state",
                    key: "showAssistant",
                    equals: true,
                },
            }),
        ],
    },
    {
        id: "technicals",
        labels: { label: "settings.showTechnicals" },
        icon: "icons.chart",
        opener: { kind: "toggle", target: "technicals" },
        placements: [
            rail(70, "panels", {
                enabledWhen: {
                    kind: "derived",
                    key: "isTechnicalsVisible",
                },
                activeWhen: {
                    kind: "setting",
                    key: "showTechnicals",
                    equals: true,
                },
            }),
        ],
    },
    {
        id: "market-overview",
        labels: { label: "settings.toggleMarketTiles" },
        icon: "rail-market-overview",
        opener: { kind: "toggle", target: "market-overview" },
        placements: [
            rail(80, "panels", {
                enabledWhen: {
                    kind: "all",
                    conditions: [
                        { kind: "setting", key: "showSidebars" },
                        { kind: "viewport", minWidth: 1280 },
                    ],
                },
                activeWhen: {
                    kind: "setting",
                    key: "showMarketOverview",
                    equals: true,
                },
            }),
        ],
    },
    {
        id: "market-activity",
        labels: { label: "dashboard.marketActivity" },
        icon: "rail-market-activity",
        opener: { kind: "toggle", target: "market-activity" },
        placements: [
            rail(90, "panels", {
                enabledWhen: {
                    kind: "derived",
                    key: "effectiveShowSidebarActivity",
                },
                activeWhen: {
                    kind: "setting",
                    key: "showSidebarActivity",
                    equals: true,
                },
            }),
        ],
    },
    {
        id: "market-sentiment",
        labels: { label: "settings.toggleMarketSentiment" },
        icon: "rail-market-sentiment",
        opener: { kind: "toggle", target: "market-sentiment" },
        placements: [
            rail(100, "panels", {
                enabledWhen: { kind: "viewport", minWidth: 1280 },
                activeWhen: {
                    kind: "setting",
                    key: "showMarketSentiment",
                    equals: true,
                },
            }),
        ],
    },
];

const JOURNAL_TABS: Entry[] = [
    {
        id: "journal.performance",
        parent: "journal",
        labels: { label: "journal.deepDive.performance" },
        icon: "icons.chart",
        opener: { kind: "tab", tabId: "performance" },
        placements: [tabPlacement("journal-tabs", "journal", 10)],
    },
    {
        id: "journal.quality",
        parent: "journal",
        labels: { label: "journal.deepDive.systemQuality" },
        icon: "icons.check",
        opener: { kind: "tab", tabId: "quality" },
        placements: [tabPlacement("journal-tabs", "journal", 20)],
    },
    {
        id: "journal.direction",
        parent: "journal",
        labels: { label: "journal.deepDive.charts.labels.trends" },
        icon: "icons.exchange",
        opener: { kind: "tab", tabId: "direction" },
        placements: [tabPlacement("journal-tabs", "journal", 30)],
    },
    {
        id: "journal.discipline",
        parent: "journal",
        labels: { label: "journal.deepDive.behavior" },
        icon: "icons.lockClosed",
        opener: { kind: "tab", tabId: "discipline" },
        placements: [tabPlacement("journal-tabs", "journal", 40)],
    },
    {
        id: "journal.costs",
        parent: "journal",
        labels: { label: "journal.deepDive.charts.labels.fees" },
        icon: "icons.settings",
        opener: { kind: "tab", tabId: "costs" },
        placements: [tabPlacement("journal-tabs", "journal", 50)],
    },
];

const SETTINGS_TABS: Entry[] = [
    {
        id: "settings.trading",
        parent: "settings",
        labels: { label: "settings.tabs.trading" },
        icon: "settings-trading",
        opener: { kind: "tab", tabId: "trading" },
        placements: [tabPlacement("settings-rail", "settings", 10)],
    },
    {
        id: "settings.automation",
        parent: "settings",
        labels: { label: "settings.tabs.automation" },
        icon: "settings-automation",
        opener: { kind: "tab", tabId: "automation" },
        placements: [tabPlacement("settings-rail", "settings", 20)],
    },
    {
        id: "settings.chart",
        parent: "settings",
        labels: { label: "settings.tabs.chart" },
        icon: "settings-chart",
        opener: { kind: "tab", tabId: "chart" },
        placements: [tabPlacement("settings-rail", "settings", 30)],
    },
    {
        id: "settings.visuals",
        parent: "settings",
        labels: { label: "settings.tabs.visuals" },
        icon: "settings-visuals",
        opener: { kind: "tab", tabId: "visuals" },
        placements: [tabPlacement("settings-rail", "settings", 40)],
    },
    {
        id: "settings.ai",
        parent: "settings",
        labels: { label: "settings.tabs.ai" },
        icon: "settings-ai",
        opener: { kind: "tab", tabId: "ai" },
        placements: [tabPlacement("settings-rail", "settings", 50)],
    },
    {
        id: "settings.connections",
        parent: "settings",
        labels: { label: "settings.tabs.connections" },
        icon: "settings-connections",
        opener: { kind: "tab", tabId: "connections" },
        placements: [tabPlacement("settings-rail", "settings", 60)],
    },
    {
        id: "settings.system",
        parent: "settings",
        labels: { label: "settings.tabs.system" },
        icon: "settings-system",
        opener: { kind: "tab", tabId: "system" },
        placements: [tabPlacement("settings-rail", "settings", 70)],
    },
    {
        id: "settings.cloud",
        parent: "settings",
        labels: { label: "settings.tabs.cloud" },
        icon: "settings-cloud",
        opener: { kind: "tab", tabId: "cloud" },
        placements: [tabPlacement("settings-rail", "settings", 80)],
    },
];

export const ENTRY_POINTS: Entry[] = [
    ...GLOBAL_DESTINATIONS,
    ...JOURNAL_TABS,
    ...SETTINGS_TABS,
];
