const fs = require('fs');

const file = 'src/services/marketWatcher.ts';
let text = fs.readFileSync(file, 'utf8');

// The error is `ensureHistory` expects `symbol, tf` but returns `Promise<boolean>`.
// However, in `MarketWatcher`, it's defined as:
// `ensureHistory(symbol: string, tf: string) { this.historyFetcher.ensureHistory(symbol, tf); }`
// But `this.historyFetcher.ensureHistory` is probably `async` and returns `Promise<boolean>`. Let's return it.

text = text.replace(
    /ensureHistory\(symbol: string, tf: string\) \{\n        this.historyFetcher.ensureHistory\(symbol, tf\);\n    \}/,
    'async ensureHistory(symbol: string, tf: string) {\n        return this.historyFetcher.ensureHistory(symbol, tf);\n    }'
);
fs.writeFileSync(file, text);
