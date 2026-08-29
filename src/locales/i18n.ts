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

import {
  _ as i18nStore,
  register,
  init,
  locale as svelteLocale,
} from "svelte-i18n";
import type { TranslationKey } from "./schema";
import { writable, get } from "svelte/store";
import { settingsState } from "../stores/settings.svelte";



// List of keys that should always be English if "Force English Technical Terms" is enabled.
// We use dot notation strings which we will resolve against the English dictionary.
const TECHNICAL_KEYS = [
  // Dashboard & Trading
  "dashboard.type",
  "dashboard.price",
  "dashboard.amount",
  "dashboard.filled",
  "dashboard.takeProfit",
  "dashboard.netProfit",
  "dashboard.generalInputs.longButton",
  "dashboard.generalInputs.shortButton",
  "dashboard.tradeSetupInputs.entryPricePlaceholder",
  "dashboard.summaryResults.breakEvenPriceLabel",
  "dashboard.summaryResults.entryFeeLabel",
  "dashboard.summaryResults.estimatedLiquidationPriceLabel",
  "dashboard.summaryResults.requiredMarginLabel",
  "dashboard.summaryResults.maxNetLossLabel",
  "dashboard.exitFeeLabel",
  "dashboard.visualBar.entry",
  "dashboard.visualBar.netProfitLabel",
  "dashboard.riskRewardRatio",
  "common.apply",
  "common.copy",
  "common.ignore",
  "common.send",
  "connection.offline",
  "settings.performance.tips.title",
  "settings.performance.tips.highAnalysisTime",
  "settings.performance.tips.highApiCalls",
  "settings.performance.tips.highLatency",
  "settings.performance.tips.highMemory",
  "settings.performance.tips.lowCacheHit",
  "settings.performance.tips.optimal",
  "sidePanel.clearHistory",
  "sidePanel.collapse",
  "sidePanel.cycleMode",
  "sidePanel.expand",
  "sidePanel.exportChat",
  "sidePanel.largerFont",
  "sidePanel.quotaExceeded",
  "sidePanel.smallerFont",
  "sidePanel.suggestedChanges",
  "sidePanel.thinking",

  // Journal
  "journal.entry",
  "journal.table.entry",
  "journal.table.exit",
  "journal.table.type",
  "journal.table.sl",
  "journal.stats.winRate",
  "journal.stats.profitFactor",
  "journal.stats.avgRR",
  "journal.stats.maxDrawdown",

  // Deep Dive Charts (Titles)
  "journal.deepDive.charts.titles.equityCurve",
  "journal.deepDive.charts.titles.drawdown",
  "journal.deepDive.charts.titles.winRate",
  "journal.deepDive.charts.titles.longVsShort",
  "journal.deepDive.charts.titles.cumulativeR",
  "journal.deepDive.charts.titles.riskConsistency",
  "journal.deepDive.charts.titles.grossVsNet",
  "journal.deepDive.charts.titles.cumulativeFees",
  "journal.deepDive.charts.titles.feeBreakdown",
  "journal.deepDive.charts.titles.durationVsPnl",
  "journal.deepDive.charts.titles.strategyEvolution",
  "journal.deepDive.charts.titles.mfeVsMae",
  "journal.deepDive.charts.titles.riskRadar",
  "journal.deepDive.charts.titles.atrMatrix",

  // Deep Dive Labels
  "journal.deepDive.charts.labels.winRate",
  "journal.deepDive.charts.labels.profitFactor",
  "journal.deepDive.charts.labels.expectancy",
  "journal.deepDive.charts.labels.drawdown",
  "journal.deepDive.charts.labels.grossProfit",
  "journal.deepDive.charts.labels.grossLoss",
  "journal.deepDive.charts.labels.netResult",
  "journal.deepDive.charts.labels.netPnl",
  "journal.deepDive.charts.labels.equity",

  // Technicals Settings
  "settings.technicals.oscillators",
  "settings.technicals.movingAverages",
  "settings.technicals.pivots",
  "settings.technicals.buy",
  "settings.technicals.sell",
  "settings.technicals.neutral",
  "settings.technicals.strongBuy",
  "settings.technicals.strongSell",
];

// Helper to get nested value from object using dot notation path
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((prev: unknown, curr) => {
    return prev && typeof prev === "object" ? (prev as Record<string, unknown>)[curr] : null;
  }, obj);
}

// Helper to set nested value in object using dot notation path
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    // Last key: set the value
    if (i === keys.length - 1) {
      current[key] = value;
      return;
    }

    // If intermediate key doesn't exist or isn't an object, create it
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }

    current = current[key] as Record<string, unknown>;
  }
}

type BaseLocale = "en" | "de";
type Dict = Record<string, unknown>;
// Lazy loaders: a locale's dictionary JSON is only fetched when that locale is
// actually needed. Vite turns each dynamic import into its own hashed chunk,
// so the startup bundle ships no dictionary bytes at all.
const localeLoaders: Record<BaseLocale, () => Promise<Dict>> = {
  en: () => import("./locales/en.json").then((m) => m.default as Dict),
  de: () => import("./locales/de.json").then((m) => m.default as Dict),
};
const dictCache = new Map<BaseLocale, Dict>();
export async function loadDict(localeKey: BaseLocale): Promise<Dict> {
  const cached = dictCache.get(localeKey);
  if (cached) return cached;
  const dict = await localeLoaders[localeKey]();
  dictCache.set(localeKey, dict);
  return dict;
}
// Pure helper (exported for tests): German base dictionary with the English
// values of TECHNICAL_KEYS overlaid.
export function buildDeTechDict(deDict: Dict, enDict: Dict): Dict {
  const dict = structuredClone(deDict);
  // Overwrite technical keys in the German dict with values from the English one
  TECHNICAL_KEYS.forEach((key) => {
    const enValue = getNestedValue(enDict, key);
    if (enValue) {
      setNestedValue(dict, key, enValue);
    }
  });
  return dict;
}
// Register standard locales — dictionaries resolve lazily through the cache.
// svelte-i18n receives a clone so the shared cache can never be mutated.
register("en", async () => structuredClone(await loadDict("en")));
register("de", async () => structuredClone(await loadDict("de")));
// Create a special "de-tech" locale that is German + English Technical Terms.
// Both dictionaries (de AND en) are only fetched when this locale is used.
register(
  "de-tech",
  async () => buildDeTechDict(await loadDict("de"), await loadDict("en")),
);

const storedLocale =
  typeof localStorage !== "undefined" ? localStorage.getItem("locale") : null;

let initialLocaleValue: string;

if (storedLocale && (storedLocale === "en" || storedLocale === "de")) {
  initialLocaleValue = storedLocale;
} else {
  initialLocaleValue = "en"; // Primary language is now English
}

init({
  fallbackLocale: "en",
  initialLocale: initialLocaleValue,
});

// Resolves once the dictionary of the initially active locale has loaded.
// Exactly one dictionary is fetched at startup (AC: only the active locale).
export const i18nReady: Promise<void> = loadDict(
  initialLocaleValue as BaseLocale,
).then(() => undefined);

export const locale = writable<string | null>(initialLocaleValue);

// Async: awaits the target dictionary before applying it. A sequence token
// makes superseded switches a no-op, so the previously loaded dictionary keeps
// rendering while the new one streams in — no raw $key flashes.
let applySeq = 0;
async function updateEffectiveLocale() {
  if (typeof window === "undefined") return;
  const currentLocale = get(locale);
  const settings = settingsState;

  let target: string | null = currentLocale;
  if (currentLocale === "de" && settings.forceEnglishTechnicalTerms) {
    // If user wants German but with English tech terms, switch to our hybrid locale
    target = "de-tech";
  }
  if (!target) return;

  const seq = ++applySeq;
  if (target === "de-tech") {
    await loadDict("de");
    await loadDict("en");
  } else {
    await loadDict(target as BaseLocale);
  }
  // Superseded while loading — never apply; the newer switch will.
  if (seq !== applySeq) return;
  svelteLocale.set(target);
}

// Subscribe to the public 'locale' store
locale.subscribe((value) => {
  if (value) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("locale", value);
    }
    updateEffectiveLocale();
  }
});

// Use a simple function instead of store subscription for top-level initialization
// to avoid $effect.root issues in module scope.
// The SettingsManager will call this if needed, or we rely on the component mount.
if (typeof window !== "undefined") {
  setTimeout(updateEffectiveLocale, 0);
}

export function setLocale(newLocale: string) {
  locale.set(newLocale);
}

export const _ = i18nStore as unknown as import("svelte/store").Readable<
  (key: TranslationKey, vars?: Record<string, unknown>) => string
>;
