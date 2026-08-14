const fs = require('fs');
const file = 'src/services/marketWatcher.ts';
let text = fs.readFileSync(file, 'utf8');

const replacement = `
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
    public pollSymbolChannel(symbol: string, channel: string, provider: "bitunix" | "bitget") { return this.historyFetcher.pollSymbolChannel(symbol, channel, provider); }
`;

text = text.replace('register(symbol: string, channel: string, requirement: "chart" | "stateless" = "stateless") {', replacement + '\n    register(symbol: string, channel: string, requirement: "chart" | "stateless" = "stateless") {');
fs.writeFileSync(file, text);
