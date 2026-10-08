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
 *
 * Persistence schema — FEAT-0342 slice E.
 *
 * The field mapping of `SettingsManager` (`toJSON()` + `applyCoreFields()` +
 * `applyDisplayFields()`) used to be three hand-written key lists totalling
 * ~474 lines. A key missing from either direction is silent data loss on the
 * next save or reload, and nothing but discipline kept the three lists in
 * sync. This module is the single key table both directions drive from, so a
 * new setting without a schema row fails the exactness test instead of
 * silently dropping the user's value.
 *
 * Deliberately pure: no I/O, no store reads, no Svelte runes. `$state`
 * snapshots, the entitlement store and the `ensureProviderRegistry` side
 * effect stay in `SettingsManager`, which passes them in through the context
 * facades. Custom mergers that need no runes live here so they are
 * unit-testable without a DOM.
 *
 * Two behaviours are pinned here because a careless extraction would flip
 * them: `toJSON()` redacts credentials through `redactAccounts` /
 * `redactUserProviders` (BUG-0280) while still deep-reading the live keys so
 * the autosave `$effect` keeps tracking credential edits; and the load side
 * keeps the exact `??` vs `||` vs custom semantics per key, including the
 * `chartPriceScaleMode` migration and the `burnChannels` legacy keys.
 */

import { VENUE_DEFAULT_FEE_RATES } from "../../lib/constants";
import { sanitizeAllowedActions } from "../../lib/ai/actionPolicy";
import { normalizeQuality } from "../../lib/three/quality";
import { CREDENTIAL_SCHEMA_VERSION, redactAccounts } from "./accounts";
import { redactUserProviders, sanitizeUserProviders } from "./aiProviders";
import { resolveAnthropicModel, resolveGeminiModel } from "./migrations";
import type {
    GalaxySettings,
    Settings,
    TradeFlowSettings,
} from "./settingsTypes";
import { MAX_FAVORITE_SYMBOLS } from "./settingsTypes";

/** How `toJSON()` serializes one key. */
export type SaveMode = "direct" | "snapshot" | "spread" | "custom";

/** How the load path restores one key. `null` means `load()` assigns it. */
export type LoadMode = "assign" | "coalesce" | "or" | "custom" | null;

/** Which `apply*` driver restores the key. `null` means `load()` owns it. */
export type LoadSection = "core" | "display" | null;

export interface FieldSchema {
    readonly key: keyof Settings;
    readonly save: SaveMode;
    readonly load: LoadMode;
    readonly section: LoadSection;
}

/**
 * The single key table. Save side covers every key `toJSON()` emits
 * (`SETTINGS_KEYS` plus the five storage/encryption exceptions); load side
 * covers every declared setting except the three `load()` assigns directly
 * (`accounts`, `activeAccountId`, `apiProvider` via `_apiProvider`).
 */
export const PERSISTENCE_SCHEMA: readonly FieldSchema[] = [
    { key: "apiProvider", save: "direct", load: null, section: null },
    { key: "appAccessToken", save: "direct", load: "coalesce", section: "core" },
    { key: "marketAnalysisInterval", save: "direct", load: "coalesce", section: "core" },
    { key: "pauseAnalysisOnBlur", save: "direct", load: "coalesce", section: "core" },
    { key: "analysisTimeframes", save: "snapshot", load: "coalesce", section: "core" },
    { key: "autoUpdatePriceInput", save: "direct", load: "assign", section: "core" },
    { key: "autoFetchBalance", save: "direct", load: "assign", section: "core" },
    { key: "showSidebars", save: "direct", load: "assign", section: "core" },
    { key: "showTooltips", save: "direct", load: "coalesce", section: "core" },
    { key: "showTechnicals", save: "direct", load: "assign", section: "core" },
    { key: "showIndicatorParams", save: "direct", load: "assign", section: "core" },
    { key: "technicalsFullHeight", save: "direct", load: "assign", section: "core" },
    { key: "hideUnfilledOrders", save: "direct", load: "assign", section: "core" },
    { key: "journalPaperTrades", save: "direct", load: "coalesce", section: "core" },
    { key: "showStalePriceBadge", save: "direct", load: "coalesce", section: "core" },
    { key: "positionViewMode", save: "direct", load: "assign", section: "core" },
    { key: "pnlViewMode", save: "direct", load: "coalesce", section: "core" },
    { key: "isPro", save: "custom", load: "custom", section: "core" },
    { key: "feePreference", save: "direct", load: "assign", section: "core" },
    { key: "feeRates", save: "snapshot", load: "custom", section: "core" },
    { key: "hotkeyMode", save: "direct", load: "assign", section: "core" },
    { key: "accounts", save: "custom", load: null, section: null },
    { key: "activeAccountId", save: "direct", load: null, section: null },
    { key: "credentialSchemaVersion", save: "custom", load: null, section: null },
    { key: "encryptedAccountKeys", save: "custom", load: null, section: null },
    { key: "encryptedSecrets", save: "custom", load: null, section: null },
    { key: "isEncrypted", save: "direct", load: null, section: null },
    { key: "customHotkeys", save: "snapshot", load: "custom", section: "core" },
    { key: "favoriteTimeframes", save: "snapshot", load: "assign", section: "core" },
    { key: "favoriteSymbols", save: "snapshot", load: "custom", section: "core" },
    { key: "syncRsiTimeframe", save: "direct", load: "assign", section: "core" },
    { key: "imgbbApiKey", save: "direct", load: "assign", section: "core" },
    { key: "imgbbExpiration", save: "direct", load: "assign", section: "core" },
    { key: "isDeepDiveUnlocked", save: "direct", load: "assign", section: "core" },
    { key: "cloudEnabled", save: "direct", load: "assign", section: "core" },
    { key: "cloudHost", save: "direct", load: "assign", section: "core" },
    { key: "cloudDbName", save: "direct", load: "assign", section: "core" },
    { key: "cloudToken", save: "direct", load: "assign", section: "core" },
    { key: "sidePanelMode", save: "direct", load: "assign", section: "core" },
    { key: "chatStyle", save: "direct", load: "assign", section: "core" },
    { key: "maxPrivateNotes", save: "direct", load: "assign", section: "core" },
    { key: "customSystemPrompt", save: "direct", load: "assign", section: "core" },
    { key: "aiProvider", save: "direct", load: "assign", section: "core" },
    { key: "openaiApiKey", save: "direct", load: "assign", section: "core" },
    { key: "openaiModel", save: "direct", load: "assign", section: "core" },
    { key: "openaiBaseUrl", save: "direct", load: "coalesce", section: "core" },
    { key: "geminiApiKey", save: "direct", load: "assign", section: "core" },
    { key: "geminiModel", save: "direct", load: "custom", section: "core" },
    { key: "geminiBaseUrl", save: "direct", load: "coalesce", section: "core" },
    { key: "anthropicApiKey", save: "direct", load: "assign", section: "core" },
    { key: "anthropicModel", save: "direct", load: "custom", section: "core" },
    { key: "anthropicBaseUrl", save: "direct", load: "coalesce", section: "core" },
    { key: "ollamaBaseUrl", save: "direct", load: "or", section: "core" },
    { key: "ollamaModel", save: "direct", load: "coalesce", section: "core" },
    { key: "openrouterApiKey", save: "direct", load: "coalesce", section: "core" },
    { key: "openrouterModel", save: "direct", load: "coalesce", section: "core" },
    { key: "openrouterBaseUrl", save: "direct", load: "coalesce", section: "core" },
    { key: "userProviders", save: "custom", load: "custom", section: "core" },
    { key: "activeProviderId", save: "direct", load: "coalesce", section: "core" },
    { key: "encryptedProviderConfigs", save: "custom", load: null, section: null },
    { key: "analysisDepth", save: "direct", load: "assign", section: "core" },
    { key: "aiConfirmActions", save: "direct", load: "assign", section: "core" },
    { key: "aiAllowSettingsChanges", save: "direct", load: "assign", section: "core" },
    { key: "aiAllowedActions", save: "spread", load: "custom", section: "core" },
    { key: "aiTradeHistoryLimit", save: "direct", load: "assign", section: "core" },
    { key: "aiShareTradeContext", save: "direct", load: "coalesce", section: "core" },
    { key: "aiConfirmClear", save: "direct", load: "assign", section: "core" },
    { key: "aiAnalysisMode", save: "direct", load: "coalesce", section: "core" },
    { key: "showSpinButtons", save: "direct", load: "assign", section: "display" },
    { key: "disclaimerAccepted", save: "direct", load: "assign", section: "display" },
    { key: "useUtcDateParsing", save: "direct", load: "assign", section: "display" },
    { key: "forceEnglishTechnicalTerms", save: "direct", load: "assign", section: "display" },
    { key: "debugMode", save: "direct", load: "assign", section: "display" },
    { key: "syncFavorites", save: "direct", load: "assign", section: "display" },
    { key: "confirmTradeDeletion", save: "direct", load: "assign", section: "display" },
    { key: "confirmBulkDeletion", save: "direct", load: "assign", section: "display" },
    { key: "enableBurningBorders", save: "direct", load: "coalesce", section: "display" },
    { key: "borderEffect", save: "direct", load: "coalesce", section: "display" },
    { key: "borderEffectColorMode", save: "direct", load: "coalesce", section: "display" },
    { key: "borderEffectCustomColor", save: "direct", load: "coalesce", section: "display" },
    { key: "burningBordersIntensity", save: "direct", load: "coalesce", section: "display" },
    { key: "burnCharts", save: "direct", load: "custom", section: "display" },
    { key: "burnModals", save: "direct", load: "custom", section: "display" },
    { key: "burnChannels", save: "direct", load: "custom", section: "display" },
    { key: "burnMarketOverviewTiles", save: "direct", load: "custom", section: "display" },
    { key: "burnFlashCards", save: "direct", load: "custom", section: "display" },
    { key: "burnJournal", save: "direct", load: "custom", section: "display" },
    { key: "enableAmbientTopline", save: "direct", load: "coalesce", section: "display" },
    { key: "ambientToplineMode", save: "direct", load: "or", section: "display" },
    { key: "ambientToplineIntensity", save: "direct", load: "or", section: "display" },
    { key: "ambientToplineBursts", save: "direct", load: "coalesce", section: "display" },
    { key: "visualQuality", save: "direct", load: "custom", section: "display" },
    { key: "fireConfig", save: "snapshot", load: "custom", section: "display" },
    { key: "fontFamily", save: "direct", load: "or", section: "display" },
    { key: "cryptoPanicApiKey", save: "direct", load: "assign", section: "core" },
    { key: "newsApiKey", save: "direct", load: "assign", section: "core" },
    { key: "cryptoPanicPlan", save: "direct", load: "or", section: "core" },
    { key: "cryptoPanicFilter", save: "direct", load: "or", section: "core" },
    { key: "newsOpenBehavior", save: "direct", load: "or", section: "core" },
    { key: "enableNewsAnalysis", save: "direct", load: "assign", section: "core" },
    { key: "cmcApiKey", save: "direct", load: "assign", section: "core" },
    { key: "enableCmcContext", save: "direct", load: "assign", section: "core" },
    { key: "showMarketOverviewLinks", save: "direct", load: "assign", section: "display" },
    { key: "showMarketOverview", save: "direct", load: "coalesce", section: "display" },
    { key: "showMarketActivity", save: "direct", load: "assign", section: "display" },
    { key: "showSidebarActivity", save: "direct", load: "coalesce", section: "display" },
    { key: "showMarketSentiment", save: "direct", load: "assign", section: "display" },
    { key: "showTechnicalsSummary", save: "direct", load: "assign", section: "display" },
    { key: "showTechnicalsConfluence", save: "direct", load: "assign", section: "display" },
    { key: "showTechnicalsVolatility", save: "direct", load: "assign", section: "display" },
    { key: "showTechnicalsOscillators", save: "direct", load: "assign", section: "display" },
    { key: "showTechnicalsMAs", save: "direct", load: "assign", section: "display" },
    { key: "showTechnicalsAdvanced", save: "direct", load: "assign", section: "display" },
    { key: "showTechnicalsSignals", save: "direct", load: "assign", section: "display" },
    { key: "showTechnicalsPivots", save: "direct", load: "coalesce", section: "display" },
    { key: "showTvLink", save: "direct", load: "coalesce", section: "display" },
    { key: "showCgHeatLink", save: "direct", load: "coalesce", section: "display" },
    { key: "heatmapMode", save: "direct", load: "or", section: "display" },
    { key: "showBrokerLink", save: "direct", load: "coalesce", section: "display" },
    { key: "rssFilterBySymbol", save: "direct", load: "coalesce", section: "core" },
    { key: "rssPresets", save: "snapshot", load: "or", section: "display" },
    { key: "customRssFeeds", save: "snapshot", load: "or", section: "display" },
    { key: "isProLicenseActive", save: "custom", load: "custom", section: "display" },
    { key: "glassBlur", save: "direct", load: "coalesce", section: "display" },
    { key: "glassSaturate", save: "direct", load: "coalesce", section: "display" },
    { key: "glassOpacity", save: "direct", load: "coalesce", section: "display" },
    { key: "enableGlassmorphism", save: "direct", load: "coalesce", section: "display" },
    { key: "backgroundType", save: "direct", load: "coalesce", section: "display" },
    { key: "backgroundUrl", save: "direct", load: "coalesce", section: "display" },
    { key: "backgroundOpacity", save: "direct", load: "coalesce", section: "display" },
    { key: "backgroundBlur", save: "direct", load: "coalesce", section: "display" },
    { key: "backgroundAnimationPreset", save: "direct", load: "coalesce", section: "display" },
    { key: "backgroundAnimationIntensity", save: "direct", load: "coalesce", section: "display" },
    { key: "videoPlaybackSpeed", save: "direct", load: "coalesce", section: "display" },
    { key: "galaxySettings", save: "snapshot", load: "custom", section: "display" },
    { key: "tradeFlowSettings", save: "snapshot", load: "custom", section: "display" },
    { key: "enableTelemetry", save: "direct", load: "coalesce", section: "display" },
    { key: "enableNetworkLogs", save: "direct", load: "coalesce", section: "display" },
    { key: "logSettings", save: "snapshot", load: "or", section: "display" },
    { key: "discordBotToken", save: "direct", load: "assign", section: "display" },
    { key: "discordChannels", save: "snapshot", load: "or", section: "display" },
    { key: "marketMode", save: "direct", load: "custom", section: "core" },
    { key: "analyzeAllFavorites", save: "direct", load: "coalesce", section: "core" },
    { key: "marketCacheSize", save: "direct", load: "coalesce", section: "core" },
    { key: "brokenAlertReport", save: "direct", load: "coalesce", section: "core" },
    { key: "technicalsUpdateMode", save: "direct", load: "coalesce", section: "core" },
    { key: "technicalsUpdateInterval", save: "direct", load: "assign", section: "core" },
    { key: "technicalsCacheSize", save: "direct", load: "coalesce", section: "core" },
    { key: "technicalsCacheTTL", save: "direct", load: "coalesce", section: "core" },
    { key: "maxTechnicalsHistory", save: "direct", load: "coalesce", section: "core" },
    { key: "autoTrading", save: "direct", load: "assign", section: "core" },
    { key: "multiAccount", save: "direct", load: "assign", section: "core" },
    { key: "enableIndicatorOptimization", save: "direct", load: "coalesce", section: "core" },
    { key: "chartHistoryLimit", save: "direct", load: "coalesce", section: "core" },
    { key: "chartRenderIntervalMs", save: "direct", load: "coalesce", section: "core" },
    { key: "repairTimeframe", save: "direct", load: "or", section: "core" },
    { key: "chartPriceScaleMode", save: "direct", load: "custom", section: "core" },
    { key: "chartAutoScale", save: "direct", load: "coalesce", section: "core" },
    { key: "chartInvertScale", save: "direct", load: "coalesce", section: "core" },
    { key: "chartDecimalsMode", save: "direct", load: "coalesce", section: "core" },
    { key: "chartFixedDecimals", save: "direct", load: "coalesce", section: "core" },
    { key: "chartShowGrid", save: "direct", load: "coalesce", section: "core" },
    { key: "chartLastValueVisible", save: "direct", load: "coalesce", section: "core" },
    { key: "chartCandleBorders", save: "direct", load: "coalesce", section: "core" },
    { key: "chartWatermark", save: "direct", load: "coalesce", section: "core" },
    { key: "chartCrosshairMode", save: "direct", load: "coalesce", section: "core" },
    { key: "chartCrosshairStyle", save: "direct", load: "coalesce", section: "core" },
    { key: "chartSecondsVisible", save: "direct", load: "coalesce", section: "core" },
    { key: "chartFixEdges", save: "direct", load: "coalesce", section: "core" },
    { key: "chartCountdownEnabled", save: "direct", load: "coalesce", section: "core" },
    { key: "enableDockingCentered", save: "direct", load: "coalesce", section: "display" },
    { key: "dockingPosition", save: "direct", load: "coalesce", section: "display" },
];

/** Keys `load()` assigns directly, so the schema carries no load entry. */
export const LOAD_BODY_KEYS: readonly string[] = [
    "accounts",
    "activeAccountId",
    "apiProvider",
];

/** What the manager reads a field from when serializing. */
export interface SaveSource {
    read<K extends keyof Settings>(key: K): Settings[K];
    snapshot<T>(value: T): T;
    entitlement: { isPro: boolean; isProLicenseActive: boolean };
}

/** Where the load path writes a restored field. */
export interface LoadTarget {
    set(key: string, value: unknown): void;
    entitlement: { isPro: boolean; isProLicenseActive: boolean };
}

/**
 * Custom save values. Everything else is `direct` (scalar read, keeps the
 * autosave `$effect` tracking the field), `snapshot` (`$state.snapshot` for
 * arrays/objects) or `spread` (`aiAllowedActions`).
 */
export function saveCustomValue(
    key: string,
    source: SaveSource,
): unknown {
    switch (key) {
        // BUG-0280: exchange credentials never serialize — placeholders only.
        // The snapshot argument still deep-reads the live keys so the autosave
        // $effect keeps tracking credential edits.
        case "accounts":
            return redactAccounts(source.snapshot(source.read("accounts")));
        case "userProviders":
            return redactUserProviders(source.snapshot(source.read("userProviders")));
        case "credentialSchemaVersion":
            return CREDENTIAL_SCHEMA_VERSION;
        case "encryptedAccountKeys": {
            const blob = source.read("encryptedAccountKeys");
            return blob ? source.snapshot(blob) : undefined;
        }
        case "encryptedSecrets": {
            const blob = source.read("encryptedSecrets");
            return blob ? source.snapshot(blob) : undefined;
        }
        case "encryptedProviderConfigs": {
            const blob = source.read("encryptedProviderConfigs");
            return blob ? source.snapshot(blob) : undefined;
        }
        case "isPro":
            return source.entitlement.isPro;
        case "isProLicenseActive":
            return source.entitlement.isProLicenseActive;
        default:
            throw new Error(`persistence schema: no custom saver for ${key}`);
    }
}

/** Per-venue merge so a partial stored blob never drops a venue or a rate. */
export function mergeFeeRates(
    stored: Settings["feeRates"] | undefined | null,
): Settings["feeRates"] {
    return {
        bitunix: { ...VENUE_DEFAULT_FEE_RATES.bitunix, ...stored?.bitunix },
        bitget: { ...VENUE_DEFAULT_FEE_RATES.bitget, ...stored?.bitget },
    };
}

/** Deep merge so new galaxy fields populate on old storage. */
export function mergeGalaxySettings(
    stored: Partial<GalaxySettings> | undefined | null,
    defaults: GalaxySettings,
): GalaxySettings {
    return { ...defaults, ...(stored || {}) };
}

/**
 * Deep merge for the trade-flow overlay. `galaxyFlow` merges one level
 * deeper: a spread would otherwise hand the live state the very same object
 * as `defaultSettings` whenever storage predates that field.
 */
export function mergeTradeFlowSettings(
    stored: Partial<TradeFlowSettings> | undefined | null,
    defaults: TradeFlowSettings,
): TradeFlowSettings {
    return {
        ...structuredClone(defaults),
        ...(stored || {}),
        galaxyFlow: {
            ...structuredClone(defaults.galaxyFlow),
            ...(stored?.galaxyFlow || {}),
        },
    };
}

/**
 * Migration: the rebasing modes shipped briefly and made absolute price lines
 * unreadable ("%” scale confusion). Fold any stored legacy value back to the
 * previous hard-coded behavior.
 */
export function normalizeStoredPriceScaleMode(
    stored: unknown,
    fallback: Settings["chartPriceScaleMode"],
): Settings["chartPriceScaleMode"] {
    return stored === "linear" || stored === "log" ? stored : fallback;
}

/** Legacy window keys still read on load; see the burn migration. */
export function mergeBurnChannels(
    merged: Partial<Settings>,
    rawParsed: Partial<Settings> | undefined,
    fallback: boolean,
): boolean {
    return (
        rawParsed?.burnChannels ??
        rawParsed?.burnChannelWindows ??
        rawParsed?.burnNewsWindows ??
        merged.burnChannels ??
        fallback
    );
}

/**
 * Custom load values. `defaults` is `defaultSettings`; `rawParsed` is the
 * unmerged stored blob (only the burn keys need it, for the legacy names).
 */
export function loadCustomValue(
    key: string,
    target: LoadTarget,
    merged: Settings,
    defaults: Settings,
    rawParsed?: Partial<Settings>,
): void {
    switch (key) {
        case "isPro":
            target.entitlement.isPro = merged.isPro;
            return;
        case "isProLicenseActive":
            target.entitlement.isProLicenseActive =
                merged.isProLicenseActive ?? defaults.isProLicenseActive;
            return;
        case "feeRates":
            target.set("feeRates", mergeFeeRates(merged.feeRates));
            return;
        case "favoriteSymbols":
            // Strict limit on favorites to prevent memory overflow (max 12).
            target.set(
                "favoriteSymbols",
                (merged.favoriteSymbols || []).slice(0, MAX_FAVORITE_SYMBOLS),
            );
            return;
        case "customHotkeys":
            // Fresh object literal, not the shared default: handing out
            // `defaults.customHotkeys` would let live edits mutate the default.
            target.set("customHotkeys", merged.customHotkeys || {});
            return;
        case "geminiModel":
            target.set("geminiModel", resolveGeminiModel(merged.geminiModel));
            return;
        case "anthropicModel":
            target.set("anthropicModel", resolveAnthropicModel(merged.anthropicModel));
            return;
        case "userProviders":
            target.set("userProviders", sanitizeUserProviders(merged.userProviders));
            return;
        case "aiAllowedActions":
            target.set("aiAllowedActions", sanitizeAllowedActions(merged.aiAllowedActions));
            return;
        case "marketMode":
            // Assigned to the private field directly: load() never fires the
            // `marketMode` setter, so going through it would apply the mode.
            target.set("_marketMode", merged.marketMode || defaults.marketMode);
            return;
        case "chartPriceScaleMode":
            target.set(
                "chartPriceScaleMode",
                normalizeStoredPriceScaleMode(
                    merged.chartPriceScaleMode,
                    defaults.chartPriceScaleMode,
                ),
            );
            return;
        case "galaxySettings":
            target.set(
                "galaxySettings",
                mergeGalaxySettings(merged.galaxySettings, defaults.galaxySettings),
            );
            return;
        case "tradeFlowSettings":
            target.set(
                "tradeFlowSettings",
                mergeTradeFlowSettings(merged.tradeFlowSettings, defaults.tradeFlowSettings),
            );
            return;
        case "fireConfig":
            target.set("fireConfig", {
                ...defaults.fireConfig,
                ...(merged.fireConfig || {}),
            });
            return;
        case "burnCharts":
            target.set(
                "burnCharts",
                rawParsed?.burnCharts ?? merged.burnCharts ?? defaults.burnCharts,
            );
            return;
        case "burnModals":
            target.set(
                "burnModals",
                rawParsed?.burnModals ?? merged.burnModals ?? defaults.burnModals,
            );
            return;
        case "burnChannels":
            target.set(
                "burnChannels",
                mergeBurnChannels(merged, rawParsed, defaults.burnChannels),
            );
            return;
        case "burnMarketOverviewTiles":
            target.set(
                "burnMarketOverviewTiles",
                rawParsed?.burnMarketOverviewTiles ??
                    merged.burnMarketOverviewTiles ??
                    defaults.burnMarketOverviewTiles,
            );
            return;
        case "burnFlashCards":
            target.set(
                "burnFlashCards",
                rawParsed?.burnFlashCards ??
                    merged.burnFlashCards ??
                    defaults.burnFlashCards,
            );
            return;
        case "burnJournal":
            target.set(
                "burnJournal",
                rawParsed?.burnJournal ?? merged.burnJournal ?? defaults.burnJournal,
            );
            return;
        case "visualQuality":
            target.set("visualQuality", normalizeQuality(merged.visualQuality));
            return;
        default:
            throw new Error(`persistence schema: no custom loader for ${key}`);
    }
}

/** Plain (non-custom) load semantics: exact `??` vs `||` vs bare copy. */
export function loadPlainValue(
    field: FieldSchema,
    merged: Settings,
    defaults: Settings,
): unknown {
    const stored: unknown = merged[field.key];
    const fallback: unknown = defaults[field.key];
    switch (field.load) {
        case "assign":
            return stored;
        case "coalesce":
            return stored ?? fallback;
        case "or":
            return stored || fallback;
        default:
            throw new Error(`persistence schema: no plain loader for ${field.key}`);
    }
}

/** Load entries for one `apply*` section, in schema order. */
export function loadSchemaEntries(section: "core" | "display"): FieldSchema[] {
    return PERSISTENCE_SCHEMA.filter(
        (field) => field.section === section && field.load !== null,
    );
}
