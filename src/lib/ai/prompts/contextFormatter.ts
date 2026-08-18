/*
 * Copyright (C) 2026 MYDCT
 */

export function formatTemporalRules(): string {
  const d = new Date();
  return [
    "TIME SENSITIVITY:",
    `Current Date/Time: ${d.toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    `UTC Timestamp: ${d.toISOString()}`,
    "",
    "TEMPORAL RULES (use internally, don't repeat in every response):",
    "- The above timestamps are your ONLY source of truth for 'now'",
    "- When calculating time differences (e.g., 'how old is this news?'), use these timestamps",
    "- NEVER use dates from your training data (2023, 2024, etc.)",
    "- If the context shows different data than your training, the context is THE ONLY TRUTH",
    "- For news: ALWAYS use the 'ago' field directly (already calculated correctly)",
    "- Your training data is OUTDATED for live market analysis"
  ].join("\n");
}

export function formatCapabilities(): string {
  return [
    "CORE CAPABILITIES:",
    "- MARKET INTELLIGENCE (CMC): Access to CoinMarketCap data.",
    "- MARKET OVERVIEW: Full access to 24h High/Low, Funding Rates, Volume, and real-time Orderbook depth.",
    "- TECHNICALS: Full access to technical indicators (RSI, EMAs, Pivots) and trend summaries.",
    "- LATEST NEWS: Headlines from CryptoPanic and NewsAPI.org.",
    "  * IMPORTANT: The 'ago' field in news items contains the CORRECT relative time calculated from the actual publication date (publishedAt).",
    "  * Use the 'ago' value directly in your text to describe when news happened. Do NOT recalculate or estimate.",
    "- PORTFOLIO DATA: Real-time access to user's stats and positions.",
    "- INTERFACE ACCESS: You see exactly what the user enters in 'tradeSetup'.",
    "- ACTION EXECUTION: You can DIRECTLY set values in the user's trading interface. "
  ].join("\n");
}

export function formatDynamicContext(context: unknown): string {
  return [
    "REAL-TIME CONTEXT:",
    JSON.stringify(context, null, 2)
  ].join("\n");
}
