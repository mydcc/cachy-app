/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Shared news domain types (FEAT-0539).
 *
 * Leaf module with no imports: `newsService`, `rssParserService`,
 * `discordService` and the news store all depend on these types without
 * importing each other, so the service import graph stays acyclic.
 */
export interface NewsItem {
  title: string;
  url: string;
  source: string;
  published_at: string;
  description?: string;
  currencies?: { code: string; title: string }[];
  id?: string; // Hash für Deduplizierung
}

export interface SentimentAnalysis {
  score: number; // -1 to 1
  regime: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCERTAIN";
  summary: string;
  keyFactors: string[];
}
