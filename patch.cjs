const fs = require('fs');

const file = 'src/services/dataRepairService.ts';
let code = fs.readFileSync(file, 'utf-8');

const regex = /    const promises = targets\.map\(\(trade\) => limit\(async \(\) => \{\n(?:[\s\S]*?)    await Promise\.all\(promises\);/g;

const replacement = `    // Helper to parse interval to ms
    const parseIntervalMs = (inv: string) => {
      const unit = inv.slice(-1);
      const val = parseInt(inv.slice(0, -1)) || 1;
      switch(unit) {
        case 'm': return val * 60 * 1000;
        case 'h': return val * 60 * 60 * 1000;
        case 'd': return val * 24 * 60 * 60 * 1000;
        case 'w': return val * 7 * 24 * 60 * 60 * 1000;
        default: return 15 * 60 * 1000; // default 15m for ATR
      }
    };
    const msPerCandle = parseIntervalMs(interval);
    const MAX_SPAN_MS = 900 * msPerCandle;

    // Group by symbol and provider, similar to repairMfeMae
    const chunks: { symbol: string, provider?: "bitunix" | "bitget" | "custom", startTs: number, endTs: number, trades: typeof targets }[] = [];

    const symbolGroups = new Map<string, typeof targets>();
    for (const t of targets) {
      const timeStr = t.entryDate || t.date;
      const timestamp = new Date(timeStr).getTime();
      if (isNaN(timestamp)) {
        logger.warn(
          "journal",
          \`[DataRepair] Invalid date for trade \${t.id}, skipping.\`,
        );
        failed++;
        processed++;
        onProgress(processed, total, \`Skipped \${t.symbol}...\`);
        continue;
      }

      const k = \`\${t.symbol}_\${t.provider || 'default'}\`;
      if (!symbolGroups.has(k)) symbolGroups.set(k, []);
      symbolGroups.get(k)!.push(t);
    }

    for (const groupTrades of symbolGroups.values()) {
      groupTrades.sort((a, b) => {
          const ta = new Date(a.entryDate || a.date).getTime();
          const tb = new Date(b.entryDate || b.date).getTime();
          return ta - tb;
      });

      let currentChunk: typeof chunks[0] | null = null;
      for (const t of groupTrades) {
        const timeStr = t.entryDate || t.date;
        const s = new Date(timeStr).getTime();

        // Ensure we fetch a bit more history to account for missing candles (e.g. gaps/weekends)
        // A generous lookback window for the 25 candles (14 days = 14*24*60*60*1000 ms roughly for 15m)
        // Actually, just fetching up to 1000 candles before the timestamp is safer.
        // We can just fetch 1000 candles leading up to 's' directly, but then we wouldn't batch efficiently
        // if trades are far apart.
        // To batch, let's just make sure the chunk covers the trades' timestamps and goes back far enough.
        // Let's set reqStart to (s - 200 * msPerCandle) to safely cover 25 candles even with gaps.
        const reqStart = s - (200 * msPerCandle);
        const reqEnd = s;

        if (!currentChunk) {
          currentChunk = { symbol: t.symbol, provider: t.provider, startTs: reqStart, endTs: reqEnd, trades: [t] };
        } else {
          const proposedEnd = Math.max(currentChunk.endTs, reqEnd);
          const proposedStart = Math.min(currentChunk.startTs, reqStart);
          if (proposedEnd - proposedStart <= MAX_SPAN_MS) {
            currentChunk.startTs = proposedStart;
            currentChunk.endTs = proposedEnd;
            currentChunk.trades.push(t);
          } else {
            chunks.push(currentChunk);
            currentChunk = { symbol: t.symbol, provider: t.provider, startTs: reqStart, endTs: reqEnd, trades: [t] };
          }
        }
      }
      if (currentChunk) chunks.push(currentChunk);
    }

    const promises = chunks.map((chunk) => limit(async () => {
      try {
        const result = await fetchSmartKlines(
          chunk.symbol,
          interval,
          1000,
          chunk.startTs,
          chunk.endTs,
          chunk.provider
        );

        if (result && result.klines.length > 0) {
          for (const trade of chunk.trades) {
            try {
              const timeStr = trade.entryDate || trade.date;
              const timestamp = new Date(timeStr).getTime();

              const tradeKlines = result.klines.filter(k => Number(k.time) <= timestamp);
              const recentKlines = tradeKlines.slice(-25);

              if (recentKlines.length >= 14) {
                const atr = calculator.calculateATR(recentKlines, 14);

                if (atr && !atr.isNaN()) {
                  journalState.updateEntry({
                    ...trade,
                    atrValue: atr,
                    provider: result.provider,
                  });
                } else {
                  failed++;
                }
              } else {
                failed++;
              }
            } catch (e) {
              failed++;
            } finally {
              processed++;
              onProgress(
                processed,
                total,
                \`Repariere \${trade.symbol} (\${trade.date})...\`,
              );
            }
          }
        } else {
          for (const trade of chunk.trades) {
            failed++;
            processed++;
            onProgress(
              processed,
              total,
              \`Repariere \${trade.symbol} (\${trade.date})...\`,
            );
          }
        }
      } catch (e) {
        logger.error(
          "journal",
          \`[DataRepair] Failed to repair \${chunk.symbol}\`,
          e,
        );
        for (const trade of chunk.trades) {
          failed++;
          processed++;
          onProgress(
            processed,
            total,
            \`Repariere \${trade.symbol} (\${trade.date})...\`,
          );
        }
      }
    }));

    await Promise.all(promises);`;

code = code.replace(regex, replacement);
fs.writeFileSync(file, code);
