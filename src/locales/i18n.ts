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
import { settingsStore } from "../stores/settingsStore";

import * as en from "./locales/en.json";
import * as de from "./locales/de.json";

// List of keys that should always be English if "Force English Technical Terms" is enabled.
// We use dot notation strings which we will resolve against the English dictionary.
const TECHNICAL_KEYS = [
  // Dashboard & Trading
  "dashboard.entry",
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
  "dashboard.visualBar.entry",

  // Journal
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
  return path.split('.').reduce((prev, curr) => {
    return prev ? prev[curr] : null;
  }, obj);
}

// Helper to set nested value in object using dot notation path
function setNestedValue(obj: any, path: string, value: any) {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    // Last key: set the value
    if (i === keys.length - 1) {
      current[key] = value;
      return;
    }

    // If intermediate key doesn't exist or isn't an object, create it
    if (!current[key] || typeof current[key] !== 'object') {
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
  getter: () => string | undefined | null
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
  const currentLocale = get(locale);
  const settings = get(settingsStore);

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

// Subscribe to settings to react to the toggle
settingsStore.subscribe(() => {
  updateEffectiveLocale();
});


export function setLocale(newLocale: string) {
  locale.set(newLocale);
}

export { _ };
