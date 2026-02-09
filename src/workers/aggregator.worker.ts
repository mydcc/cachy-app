import { getJournalAnalysis } from "../lib/calculators/aggregator";

self.onmessage = (e: MessageEvent) => {
  const { id, journal } = e.data;

  try {
    const analysis = getJournalAnalysis(journal);
    self.postMessage({ id, success: true, data: analysis });
  } catch (error: any) {
    self.postMessage({
      id,
      success: false,
      error: error?.message || "Unknown error during aggregation"
    });
  }
};
