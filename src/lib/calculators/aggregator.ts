/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { JournalEntry } from "../../stores/types";
import type { JournalContext } from "./types";
import { sortByDateAsc } from "./core";
import {
  calculateJournalStats,
  calculatePerformanceStats,
} from "./stats";

export function getJournalContext(journal: JournalEntry[]): JournalContext {
  // 1. Single Pass Filtering & Sorting
  const closedTrades: JournalEntry[] = [];
  const openTrades: JournalEntry[] = [];

  // Filter pass
  for (const t of journal) {
    if (t.status === "Won" || t.status === "Lost") {
      closedTrades.push(t);
    } else if (t.status === "Open") {
      openTrades.push(t);
    }
    // Ignore others? (e.g. Cancelled, BreakEven if not Won/Lost)
  }

  // Sort closed trades by date once
  const sortedClosedTrades = sortByDateAsc(closedTrades);

  // 2. Initialize Context with Pre-calculated Stats
  // We construct the context partially first
  const context: JournalContext = {
    closedTrades: sortedClosedTrades,
    openTrades,
  };

  // Pre-calculate heaviest stats to cache them
  // calculateJournalStats iterates closedTrades.
  context.journalStats = calculateJournalStats(journal, context);

  // calculatePerformanceStats iterates closedTrades multiple times (sorts, filters won/lost, etc)
  // Our refactored version uses context.closedTrades (sorted), so it skips sort!
  context.performanceStats = calculatePerformanceStats(journal, context) || undefined;

  return context;
}
