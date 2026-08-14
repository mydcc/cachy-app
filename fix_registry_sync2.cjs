const fs = require('fs');
const file = 'src/services/marketWatcher.ts';
let text = fs.readFileSync(file, 'utf8');

// The delegation of `syncSubscriptions` in MarketWatcher is returning `this.syncSubscriptions()` which causes infinite recursion.
// It needs to be `return this.registry.syncSubscriptions()`.
text = text.replace('public syncSubscriptions() { return this.syncSubscriptions(); }', 'public syncSubscriptions() { return this.registry.syncSubscriptions(); }');
fs.writeFileSync(file, text);
