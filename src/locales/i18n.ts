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
  _,
  register,
  init,
  getLocaleFromNavigator,
  locale as svelteLocale,
  dictionary,
  getLocaleFromHostname,
} from "svelte-i18n";
import { writable, get } from "svelte/store";
import { settingsState } from "../stores/settings.svelte";

import * as en from "./locales/en.json";
import * as de from "./locales/de.json";

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

  // Journal
  "journal.entry",
  "journal.table.entry",
  "journal.table.exit",
  "journal.table.type",
  "journal.table.sl",

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
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((prev, curr) => {
    return prev ? prev[curr] : null;
  }, obj);
}

// Helper to set nested value in object using dot notation path
function setNestedValue(obj: any, path: string, value: any) {
  const keys = path.split(".");
  let current = obj;

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

    current = current[key];
  }
}

// Prepare the base dictionaries (we might need to clone them to avoid mutating imports if they are frozen)
const enDict = JSON.parse(JSON.stringify(en));
const deDict = JSON.parse(JSON.stringify(de));

// Register standard locales
register("en", () => Promise.resolve(enDict));
register("de", () => Promise.resolve(deDict));

// Create a special "de-tech" locale that is German + English Technical Terms
const deTechDict = JSON.parse(JSON.stringify(deDict));

// Overwrite technical keys in deTechDict with values from enDict
TECHNICAL_KEYS.forEach((key) => {
  const enValue = getNestedValue(enDict, key);
  if (enValue) {
    setNestedValue(deTechDict, key, enValue);
  }
});

register("de-tech", () => Promise.resolve(deTechDict));

function getSafeLocale(
  getter: () => string | undefined | null,
): string | undefined | null {
  try {
    return getter();
  } catch (e) {
    console.error("Error getting locale:", e);
    return undefined;
  }
}

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

export const locale = writable<string | null>(initialLocaleValue);

// Logic to determine the effective locale based on user preference and settings
function updateEffectiveLocale() {
  if (typeof window === "undefined") return;
  const currentLocale = get(locale);
  const settings = settingsState;

  if (currentLocale === "de" && settings.forceEnglishTechnicalTerms) {
    // If user wants German but with English tech terms, switch to our hybrid locale
    svelteLocale.set("de-tech");
  } else {
    // Otherwise just use the selected locale (en or de)
    if (currentLocale) {
      svelteLocale.set(currentLocale);
    }
  }
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

export { _ };
