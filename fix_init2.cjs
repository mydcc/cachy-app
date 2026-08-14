const fs = require('fs');

const file = 'src/services/marketWatcher.ts';
let text = fs.readFileSync(file, 'utf8');

// Notice that in `MarketWatcher` class I did NOT include the constructor that wires up the properties in my previous run because it was lost during `getters` replacement or it was never there.
// Ah, looking at `split_market_watcher.cjs`, `mainFile.addClass` constructor had `this.registry = ...`. But ts-morph's `.replaceWithText(mainText)` might have overwritten it?
// Let's explicitly put the constructor back.

const match = text.match(/private maintenanceCycles: number = 0;/);
if (match) {
    const replacement = `private maintenanceCycles: number = 0;

    constructor() {
        this.registry = new SubscriptionRegistry(null as any);
        this.historyFetcher = new HistoryFetcher(this.registry);
        this.registry.historyFetcher = this.historyFetcher;
    }`;
    text = text.replace('private maintenanceCycles: number = 0;', replacement);
    fs.writeFileSync(file, text);
}
