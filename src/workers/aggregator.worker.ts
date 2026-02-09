/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { getJournalAnalysis } from "../lib/calculators/aggregator";

const ctx: Worker = self as any;

ctx.onmessage = (e: MessageEvent) => {
  const { journal, id } = e.data;

  if (!journal || !Array.isArray(journal)) {
      ctx.postMessage({ error: "Invalid journal data", id });
      return;
  }

  try {
    const start = performance.now();
    const analysis = getJournalAnalysis(journal);
    const duration = performance.now() - start;

    // console.log(`[AggregatorWorker] Analysis took ${duration.toFixed(2)}ms for ${journal.length} trades`);

    ctx.postMessage({ result: analysis, id });
  } catch (error: any) {
    ctx.postMessage({ error: error.message || "Unknown error in aggregator", id });
  }
};
