/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Berechnet die relative Zeitangabe zwischen einem Datum und jetzt
 * @param dateString ISO-8601 Datum-String (z.B. "2026-01-19T23:00:00Z")
 * @param locale Sprache ("de" oder "en", default: "de")
 * @returns Relative Zeitangabe (z.B. "vor 2 Tagen" / "2 days ago")
 */
export function getRelativeTimeString(
  dateString: string,
  locale: "de" | "en" = "de",
): string {
  try {
    const publishedDate = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - publishedDate.getTime();

    // Negative Differenz = Zukunft (sollte nicht vorkommen, aber Fallback)
    if (diffMs < 0) {
      return locale === "de" ? "gerade eben" : "just now";
    }

    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (locale === "de") {
      // Deutsche Ausgabe
      if (diffYears > 0) {
        return diffYears === 1 ? "vor 1 Jahr" : `vor ${diffYears} Jahren`;
      }
      if (diffMonths > 0) {
        return diffMonths === 1 ? "vor 1 Monat" : `vor ${diffMonths} Monaten`;
      }
      if (diffWeeks > 0) {
        return diffWeeks === 1 ? "vor 1 Woche" : `vor ${diffWeeks} Wochen`;
      }
      if (diffDays > 0) {
        return diffDays === 1 ? "vor 1 Tag" : `vor ${diffDays} Tagen`;
      }
      if (diffHours > 0) {
        return diffHours === 1 ? "vor 1 Stunde" : `vor ${diffHours} Stunden`;
      }
      if (diffMinutes > 0) {
        return diffMinutes === 1
          ? "vor 1 Minute"
          : `vor ${diffMinutes} Minuten`;
      }
      if (diffSeconds > 0) {
        return diffSeconds === 1
          ? "vor 1 Sekunde"
          : `vor ${diffSeconds} Sekunden`;
      }
      return "gerade eben";
    } else {
      // Englische Ausgabe
      if (diffYears > 0) {
        return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
      }
      if (diffMonths > 0) {
        return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
      }
      if (diffWeeks > 0) {
        return diffWeeks === 1 ? "1 week ago" : `${diffWeeks} weeks ago`;
      }
      if (diffDays > 0) {
        return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
      }
      if (diffHours > 0) {
        return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
      }
      if (diffMinutes > 0) {
        return diffMinutes === 1
          ? "1 minute ago"
          : `${diffMinutes} minutes ago`;
      }
      if (diffSeconds > 0) {
        return diffSeconds === 1
          ? "1 second ago"
          : `${diffSeconds} seconds ago`;
      }
      return "just now";
    }
  } catch (e) {
    console.error("Failed to parse date:", dateString, e);
    return locale === "de" ? "unbekannt" : "unknown";
  }
}

/**
 * Formatiert ein Datum im deutschen Format
 * @param dateString ISO-8601 Datum-String
 * @returns Formatiertes Datum (z.B. "19.01.2026, 23:00")
 */
export function formatGermanDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    console.error("Failed to format date:", dateString, e);
    return dateString;
  }
}
