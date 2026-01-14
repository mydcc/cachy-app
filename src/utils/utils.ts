import { Decimal } from "decimal.js";
import type { JournalEntry } from "../stores/types";

export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  delay: number
) {
  let timeout: ReturnType<typeof setTimeout>;
  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

export function parseDecimal(
  value: string | number | null | undefined
): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0);
  }
  // Convert to string to handle both numbers and strings uniformly
  const stringValue = String(value).replace(",", ".").trim();

  // If the string is empty after trimming, it's a 0.
  if (stringValue === "") {
    return new Decimal(0);
  }

  // Check if the result is a finite number
  const numValue = Number(stringValue);
  if (isNaN(numValue) || !isFinite(numValue)) {
    return new Decimal(0);
  }

  // If all checks pass, create the new Decimal
  try {
    return new Decimal(stringValue);
  } catch (e) {
    return new Decimal(0);
  }
}

export function formatDynamicDecimal(
  value: Decimal | string | number | null | undefined,
  maxPlaces = 4
): string {
  if (value === null || value === undefined) return "-";

  const dec = new Decimal(value);
  if (dec.isNaN()) return "-";

  // Format to a fixed number of decimal places, then remove trailing zeros
  const formatted = dec.toFixed(maxPlaces);

  // If it's a whole number after formatting, return it without decimals.
  if (new Decimal(formatted).isInteger()) {
    return new Decimal(formatted).toFixed(0);
  }

  // Otherwise, remove only the trailing zeros and the decimal point if it's the last char
  return formatted.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Parses a date string which might be in German format (DD.MM.YYYY) into a Date object.
 * @param dateStr Date string (e.g., "23.12.2025" or "2025-12-23")
 * @param timeStr Time string (e.g., "19:40:08")
 * @param useUtc Whether to treat as UTC (adds 'Z' suffix) or local time
 * @returns Date object
 */
export function parseDateString(
  dateStr: string,
  timeStr: string,
  useUtc: boolean = true
): Date {
  if (!dateStr) return new Date();

  let isoDate = dateStr;
  // Check for German format DD.MM.YYYY
  if (dateStr.includes(".")) {
    const parts = dateStr.split(".");
    if (parts.length === 3) {
      // Reassemble to YYYY-MM-DD
      // Assuming DD.MM.YYYY
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2];
      isoDate = `${year}-${month}-${day}`;
    }
  }

  const isoTime = timeStr ? timeStr.trim() : "00:00:00";

  // Attempt to construct ISO string YYYY-MM-DDTHH:mm:ss
  const combined = `${isoDate}T${isoTime}${useUtc ? "Z" : ""}`;
  const d = new Date(combined);

  if (isNaN(d.getTime())) {
    // Fallback for other formats if ISO construction fails
    // Note: JS parsing might fallback to local time here if no zone is provided
    return new Date(`${dateStr} ${timeStr}`);
  }
  return d;
}

/**
 * Robustly parses a timestamp from various formats (seconds, milliseconds, string, ISO, Date).
 * Returns a timestamp in milliseconds.
 * If parsing fails, returns 0.
 *
 * Heuristic: Values < 10,000,000,000 (10 billion) are treated as seconds.
 * This covers dates up to year 2286 for seconds, and avoids confusion with milliseconds (starting 1970).
 */
export function parseTimestamp(
  input: string | number | null | undefined | Date
): number {
  if (input === null || input === undefined) return 0;

  if (typeof input === "number") {
    // Handle NaN explicitly if passed as number type
    if (isNaN(input)) return 0;

    // Check for seconds vs milliseconds
    // 1e10 (10 billion) seconds is year 2286.
    // 1e10 milliseconds is year 1970 (April).
    // Current TS is ~1.7e12 (ms) or ~1.7e9 (sec).
    if (Math.abs(input) < 10000000000) {
      return Math.floor(input * 1000);
    }
    return Math.floor(input);
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return 0;

    // Check if strictly numeric
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const parsed = parseFloat(trimmed);
      if (isNaN(parsed)) return 0;
      return parseTimestamp(parsed); // Recurse to handle seconds logic
    }

    // Try Date.parse for ISO strings etc.
    const dateTs = Date.parse(trimmed);
    if (!isNaN(dateTs)) {
      return dateTs;
    }
  }

  if (input instanceof Date) {
    const time = input.getTime();
    return isNaN(time) ? 0 : time;
  }

  return 0;
}

export function normalizeTimeframeInput(input: string): string {
  if (!input) return "";
  let val = input.trim();

  // Handle German abbreviations first
  // 1T -> 1d, 1S -> 1h
  val = val.replace(/(\d+)\s*[Tt]/, "$1d");
  val = val.replace(/(\d+)\s*[Ss]/, "$1h");

  // Handle number only -> minutes
  if (/^\d+$/.test(val)) {
    val = val + "m";
  }

  // Extract number and unit
  const match = val.match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (match) {
    const num = parseInt(match[1]);
    let unit = match[2].toLowerCase();

    // Normalize unit
    if (unit.startsWith("m") && unit !== "m") unit = "m"; // min -> m
    if (unit.startsWith("h")) unit = "h";
    if (unit.startsWith("d")) unit = "d";
    if (unit.startsWith("w")) unit = "w";

    // Uppercase 'M' for Month if needed, but usually we use lowercase m for minutes.
    // Bitunix/Binance use '1M' for month, '1m' for minute.
    // If user typed '1M' (uppercase), we might assume Month if it's explicitly uppercase?
    // But prompt says "1d, 1D" -> acceptable.
    // Let's assume standard crypto notation: m=minute, h=hour, d=day, w=week, M=month.
    // User prompt: "Gibt der User 240m ein wird es in 4h formatiert".

    // Logic for converting minutes to hours/days
    if (unit === "m") {
      if (num % 1440 === 0 && num !== 0) {
        return num / 1440 + "d";
      }
      if (num % 60 === 0 && num !== 0) {
        return num / 60 + "h";
      }
      return num + "m";
    }

    // Logic for converting hours to days
    if (unit === "h") {
      if (num % 24 === 0 && num !== 0) {
        return num / 24 + "d";
      }
      return num + "h";
    }

    return num + unit;
  }

  return val;
}

/**
 * Converts a timeframe string (e.g., '15m', '1h', '1d') into milliseconds.
 * Defaults to 1 hour (3600000ms) if invalid.
 */
export function getIntervalMs(timeframe: string): number {
  if (!timeframe) return 3600000;

  const match = timeframe.match(/^(\d+)([a-zA-Z]+)$/);
  if (!match) return 3600000;

  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let multiplier = 60 * 1000; // Default to minute
  switch (unit) {
    case "m":
      multiplier = 60 * 1000;
      break;
    case "h":
      multiplier = 60 * 60 * 1000;
      break;
    case "d":
      multiplier = 24 * 60 * 60 * 1000;
      break;
    case "w":
      multiplier = 7 * 24 * 60 * 60 * 1000;
      break;
  }

  // Special handling for Month '1M' if unit became 'm' but we need to distinguish?
  // Given normalized inputs usually use 'm' for minute.
  // Let's rely on standard 'm', 'h', 'd'.

  return num * multiplier;
}

/**
 * Normalizes a plain object into a properly typed JournalEntry with Decimal instances.
 * This is crucial for data loaded from localStorage or imported via CSV.
 */
export function normalizeJournalEntry(trade: any): JournalEntry {
  if (!trade || typeof trade !== "object") {
    // Return a minimal valid dummy if completely malformed
    return {
      id: Date.now(),
      date: new Date().toISOString(),
      symbol: "UNKNOWN",
      tradeType: "long",
      status: "Closed",
      tags: [],
    } as unknown as JournalEntry;
  }
  const newTrade = { ...trade };

  // Numerical fields that must be Decimal
  const decimalFields = [
    "accountSize",
    "riskPercentage",
    "entryPrice",
    "exitPrice",
    "stopLossPrice",
    "leverage",
    "fees",
    "atrValue",
    "atrMultiplier",
    "totalRR",
    "totalNetProfit",
    "netLoss",
    "riskAmount",
    "totalFees",
    "maxPotentialProfit",
    "positionSize",
    "fundingFee",
    "tradingFee",
    "realizedPnl",
    "mae",
    "mfe",
    "efficiency",
  ];

  decimalFields.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(newTrade, key)) {
      newTrade[key] = parseDecimal(newTrade[key]);
    }
  });

  // Handle nested targets array
  if (newTrade.targets && Array.isArray(newTrade.targets)) {
    newTrade.targets = newTrade.targets.map((tp: any) => ({
      ...tp,
      price: parseDecimal(tp.price),
      percent: parseDecimal(tp.percent),
      isLocked: !!tp.isLocked,
    }));
  } else {
    newTrade.targets = [];
  }

  // Handle nested calculatedTpDetails
  if (
    newTrade.calculatedTpDetails &&
    Array.isArray(newTrade.calculatedTpDetails)
  ) {
    newTrade.calculatedTpDetails = newTrade.calculatedTpDetails.map(
      (tp: any) => ({
        ...tp,
        netProfit: parseDecimal(tp.netProfit),
        riskRewardRatio: parseDecimal(tp.riskRewardRatio),
        priceChangePercent: parseDecimal(tp.priceChangePercent),
        returnOnCapital: parseDecimal(tp.returnOnCapital),
        partialVolume: parseDecimal(tp.partialVolume),
        exitFee: parseDecimal(tp.exitFee),
        percentSold: parseDecimal(tp.percentSold),
      })
    );
  } else {
    newTrade.calculatedTpDetails = [];
  }

  // Default flags and arrays
  if (newTrade.isManual === undefined) newTrade.isManual = true;
  if (!Array.isArray(newTrade.tags)) newTrade.tags = [];

  return newTrade as JournalEntry;
}
