import {
  _,
  register,
  init,
  getLocaleFromNavigator,
  locale as svelteLocale,
} from "svelte-i18n";
import { writable } from "svelte/store";

import * as en from "./locales/en.json";
import * as de from "./locales/de.json";

register("en", () => Promise.resolve(en));
register("de", () => Promise.resolve(de));

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
  const browserLocale = getSafeLocale(getLocaleFromNavigator);
  if (browserLocale && browserLocale.startsWith("de")) {
    initialLocaleValue = "de";
  } else if (browserLocale && browserLocale.startsWith("en")) {
    initialLocaleValue = "en";
  } else {
    initialLocaleValue = "en"; // Fallback to English
  }
}

init({
  fallbackLocale: "en",
  initialLocale: initialLocaleValue,
});

export const locale = writable<string | null>(initialLocaleValue);

locale.subscribe((value) => {
  if (value) {
    svelteLocale.set(value);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("locale", value);
    }
  }
});

export function setLocale(newLocale: string) {
  locale.set(newLocale);
}

export { _ };
