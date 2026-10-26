/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { getJournalAnalysis } from "../lib/calculators/aggregator";
import type { JournalEntry } from "../stores/types";
import { readAggregatorWorkerMessage } from "./workerMessageGuard";

const ctx = self;

ctx.onmessage = (e: MessageEvent) => {
  const rawId =
    typeof e.data === "object" && e.data !== null && typeof e.data.id === "string"
      ? e.data.id
      : undefined;
  const guarded = readAggregatorWorkerMessage(e.data);
  if (!guarded) {
    // BUG-0725: a malformed message must not reach the destructuring below.
    ctx.postMessage({ error: "Invalid journal data", id: rawId });
    return;
  }
  const { journal, id } = guarded;

  try {
    const start = performance.now();
    // The guard has already proved this is an array within the cap; the entry
    // shape is the caller's contract and the calculator tolerates missing
    // optional fields (BUG-0725).
    const analysis = getJournalAnalysis(journal as JournalEntry[]);
    const duration = performance.now() - start;
    void duration;

    // console.log(`[AggregatorWorker] Analysis took ${duration.toFixed(2)}ms for ${journal.length} trades`);

    ctx.postMessage({ result: analysis, id });
  } catch (error) {
    ctx.postMessage({ error: error instanceof Error ? error.message : "Unknown error in aggregator", id });
  }
};
