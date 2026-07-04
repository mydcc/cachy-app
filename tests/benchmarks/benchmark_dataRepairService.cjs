const { performance } = require('perf_hooks');

async function benchmark() {
    console.log("Benchmarking repairMfeMae...");
    const targets = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        symbol: `SYM${i}`,
        status: "Won",
        entryDate: "2024-01-01T10:00:00Z",
        exitDate: "2024-01-01T11:00:00Z",
        entryPrice: 100,
        tradeType: "Long",
        provider: "bitunix"
    }));

    // Mock dependencies
    const journalState = {
        entries: targets,
        updateEntry: (entry) => {}
    };

    const logger = { error: () => {}, warn: () => {} };
    const settingsState = { repairTimeframe: "5m" };

    const fetchSmartKlines = async (symbol) => {
        await new Promise(r => setTimeout(r, 50)); // Simulating network request
        return {
            provider: "bitunix",
            klines: [
                { high: "105", low: "95" },
                { high: "102", low: "98" }
            ]
        };
    };

    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(5);
    const Decimal = (await import("decimal.js")).default;

    const start = performance.now();

    let processed = 0;
    let failed = 0;

    // Original loop logic

    for (const trade of targets) {
        processed++;
        try {
            const startTs = new Date(trade.entryDate).getTime();
            const endTs = new Date(trade.exitDate).getTime();
            const result = await fetchSmartKlines(trade.symbol);
            if (result && result.klines.length > 0) {
                let highest = new Decimal(0);
                let lowest = new Decimal(result.klines[0].low);
                for (const k of result.klines) {
                    const h = new Decimal(k.high);
                    const l = new Decimal(k.low);
                    if (h.gt(highest)) highest = h;
                    if (l.lt(lowest)) lowest = l;
                    if (new Decimal(lowest).eq(0)) lowest = l;
                }
            }
        } catch(e) {}
        await new Promise((r) => setTimeout(r, 500));
    }


    /*
    // Optimized loop logic (already mostly in place based on my inspection)
    const promises = targets.map((trade) => limit(async () => {
        try {
            const startTs = new Date(trade.entryDate).getTime();
            const endTs = new Date(trade.exitDate).getTime();
            const result = await fetchSmartKlines(trade.symbol);
            if (result && result.klines.length > 0) {
                let highest = new Decimal(0);
                let lowest = new Decimal(result.klines[0].low);
                for (const k of result.klines) {
                    const h = new Decimal(k.high);
                    const l = new Decimal(k.low);
                    if (h.gt(highest)) highest = h;
                    if (l.lt(lowest)) lowest = l;
                    if (new Decimal(lowest).eq(0)) lowest = l;
                }
            }
        } catch(e) {}
    }));
    await Promise.all(promises);
    */

    const end = performance.now();
    console.log(`Execution time: ${end - start} ms`);
}

benchmark().catch(console.error);
