const fs = require('fs');

// We need to add getters to MarketWatcher so the tests using internals (`marketWatcherInternals.requests`) can still access them.
// The tests cast `marketWatcher as unknown as MarketWatcherInternals` and access `requests`, `fillGaps`, etc.
// The backlog item explicitly says: "The five existing marketWatcher* test files pass without being modified".
// So we MUST expose the properties on the `MarketWatcher` class, even if they delegate to the registry/fetcher.

const file = 'src/services/marketWatcher.ts';
let text = fs.readFileSync(file, 'utf8');

const getters = `
    // Public API delegation
    public get requests() { return this.registry.requests; }
    public get _subscriptionsDirty() { return this.registry._subscriptionsDirty; }
    public set _subscriptionsDirty(v) { this.registry._subscriptionsDirty = v; }
    public get pendingRequests() { return this.historyFetcher.pendingRequests; }
    public get historyLocks() { return this.historyFetcher.historyLocks; }
    public get exhaustedHistory() { return this.historyFetcher.exhaustedHistory; }
    public get inFlight() { return this.historyFetcher.inFlight; }
    public set inFlight(v) { this.historyFetcher.inFlight = v; }
    public get requestStartTimes() { return this.historyFetcher.requestStartTimes; }

    // Test specific delegations
    public fillGaps(klines: any, intervalMs: number) { return this.historyFetcher.fillGaps(klines, intervalMs); }
    public syncSubscriptions() { return this.registry.syncSubscriptions(); }
    public pruneZombieRequests() { return this.registry.pruneZombieRequests(); }
`;

text = text.replace('// Public API delegation', getters);
fs.writeFileSync(file, text);
