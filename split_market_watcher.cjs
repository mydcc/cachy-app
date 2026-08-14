const fs = require('fs');
const { Project } = require('ts-morph');

const project = new Project();
project.addSourceFileAtPath('src/services/marketWatcher.ts');

if (!fs.existsSync('src/services/marketWatcher')) {
    fs.mkdirSync('src/services/marketWatcher');
}

const sourceFile = project.getSourceFile('src/services/marketWatcher.ts');
const mwClass = sourceFile.getClass('MarketWatcher');

// Store structures before doing any modifications so we don't invalidate AST nodes
const methodsToExtract = {
    register: mwClass.getMethod('register').getStructure(),
    unregister: mwClass.getMethod('unregister').getStructure(),
    syncChannelSubscription: mwClass.getMethod('syncChannelSubscription').getStructure(),
    syncSubscriptions: mwClass.getMethod('syncSubscriptions').getStructure(),
    pruneZombieRequests: mwClass.getMethod('pruneZombieRequests').getStructure(),
    pruneOrphanedSubscriptions: mwClass.getMethod('pruneOrphanedSubscriptions').getStructure(),
    ensureShallowHistory: mwClass.getMethod('ensureShallowHistory').getStructure(),
    ensureHistory: mwClass.getMethod('ensureHistory').getStructure(),
    fillGaps: mwClass.getMethod('fillGaps').getStructure(),
    loadMoreHistory: mwClass.getMethod('loadMoreHistory').getStructure(),
    pollSymbolChannel: mwClass.getMethod('pollSymbolChannel').getStructure(),

    startPolling: mwClass.getMethod('startPolling').getStructure(),
    resumePolling: mwClass.getMethod('resumePolling').getStructure(),
    resync: mwClass.getMethod('resync').getStructure(),
    runPollingLoop: mwClass.getMethod('runPollingLoop').getStructure(),
    stopPolling: mwClass.getMethod('stopPolling').getStructure(),
    performPollingCycle: mwClass.getMethod('performPollingCycle').getStructure(),
    refreshActiveHistory: mwClass.getMethod('refreshActiveHistory').getStructure(),
    getActiveSymbols: mwClass.getMethod('getActiveSymbols').getStructure(),
    isBackfilling: mwClass.getMethod('isBackfilling').getStructure(),
    forceCleanup: mwClass.getMethod('forceCleanup').getStructure(),
    destroy: mwClass.getMethod('destroy').getStructure(),
};

const registryFile = project.createSourceFile('src/services/marketWatcher/subscriptionRegistry.ts', '', { overwrite: true });
const historyFile = project.createSourceFile('src/services/marketWatcher/historyFetcher.ts', '', { overwrite: true });
const mainFile = project.createSourceFile('src/services/marketWatcher.ts', '', { overwrite: true });

registryFile.addStatements([
    `import { untrack } from "svelte";`,
    `import { bitunixWs } from "../bitunixWs";`,
    `import { settingsState } from "../../stores/settings.svelte";`,
    `import { normalizeSymbol } from "../../utils/symbolUtils";`,
    `import { browser } from "$app/environment";`,
    `import { logger } from "../../utils/logger";`,
    `import { getChannelsForRequirement } from "../../types/dataRequirements";`,
    `import { type HistoryFetcher } from "./historyFetcher";`
]);

registryFile.addClass({
    name: 'SubscriptionRegistry',
    isExported: true,
    properties: [
        { name: 'historyFetcher', type: 'HistoryFetcher', scope: 'public' },
        { name: 'requests', type: 'Map<string, Map<string, Map<string, number>>>', initializer: 'new Map()', scope: 'public' },
        { name: '_subscriptionsDirty', type: 'boolean', initializer: 'false', scope: 'public' },
        { name: 'prunedRequestIds', type: 'Map<string, number>', initializer: 'new Map()', scope: 'public' },
    ],
    constructors: [
        {
            parameters: [{ name: 'historyFetcher', type: 'HistoryFetcher', scope: 'public' }],
            statements: ['this.historyFetcher = historyFetcher;']
        }
    ]
});

const regClass = registryFile.getClass('SubscriptionRegistry');
regClass.addMethod(methodsToExtract.register);
regClass.addMethod(methodsToExtract.unregister);
regClass.addMethod(methodsToExtract.syncChannelSubscription);
regClass.addMethod(methodsToExtract.syncSubscriptions);
regClass.addMethod(methodsToExtract.pruneZombieRequests);
regClass.addMethod(methodsToExtract.pruneOrphanedSubscriptions);

let regText = regClass.getText()
    .replace(/this\.ensureHistory/g, 'this.historyFetcher.ensureHistory')
    .replace(/this\.ensureShallowHistory/g, 'this.historyFetcher.ensureShallowHistory')
    .replace(/this\.pendingRequests/g, 'this.historyFetcher.pendingRequests')
    .replace(/this\.requestStartTimes/g, 'this.historyFetcher.requestStartTimes')
    .replace(/this\.inFlight/g, 'this.historyFetcher.inFlight')
    .replace(/this\.exhaustedHistory/g, 'this.historyFetcher.exhaustedHistory');

registryFile.getClass('SubscriptionRegistry').replaceWithText(regText);


historyFile.addStatements([
    `import { apiService } from "../apiService";`,
    `import { marketState } from "../../stores/market.svelte";`,
    `import { normalizeSymbol } from "../../utils/symbolUtils";`,
    `import { tradeState } from "../../stores/trade.svelte";`,
    `import { RequestDeduplicator } from "../../utils/requestDeduplicator";`,
    `import { logger } from "../../utils/logger";`,
    `import { storageService } from "../storageService";`,
    `import { activeTechnicalsManager } from "../activeTechnicalsManager.svelte";`,
    `import { safeTfToMs } from "../../utils/timeUtils";`,
    `import { Decimal } from "decimal.js";`,
    `import { type Kline } from "../technicalsTypes";`,
    `import { settingsState } from "../../stores/settings.svelte";`,
    `import { type SubscriptionRegistry } from "./subscriptionRegistry";`
]);

historyFile.addClass({
    name: 'HistoryFetcher',
    isExported: true,
    properties: [
        { name: 'registry', type: 'SubscriptionRegistry', scope: 'public' },
        { name: 'pendingRequests', initializer: 'new RequestDeduplicator<void>()', scope: 'public' },
        { name: 'requestStartTimes', initializer: 'new Map<string, number>()', scope: 'public' },
        { name: 'exhaustedHistory', initializer: 'new Set<string>()', scope: 'public' },
        { name: 'historyLocks', initializer: 'new Set<string>()', scope: 'public' },
        { name: 'inFlight', type: 'number', initializer: '0', scope: 'public' },
        { name: 'lastErrorLog', type: 'number', initializer: '0', scope: 'private' },
        { name: 'errorLogIntervalMs', type: 'number', initializer: '30000', isReadonly: true, scope: 'private' }
    ],
    constructors: [
        {
            parameters: [{ name: 'registry', type: 'SubscriptionRegistry', scope: 'public' }],
            statements: ['this.registry = registry;']
        }
    ]
});

const histClass = historyFile.getClass('HistoryFetcher');
histClass.addMethod(methodsToExtract.ensureShallowHistory);
histClass.addMethod(methodsToExtract.ensureHistory);
histClass.addMethod(methodsToExtract.fillGaps);
histClass.addMethod(methodsToExtract.loadMoreHistory);
histClass.addMethod(methodsToExtract.pollSymbolChannel);

let histText = histClass.getText()
    .replace(/MarketWatcher\.ZERO_VOL/g, 'new Decimal(0)')
    .replace(/this\.prunedRequestIds/g, 'this.registry.prunedRequestIds');

historyFile.getClass('HistoryFetcher').replaceWithText(histText);


// Main class setup
mainFile.addStatements([
    `import { SubscriptionRegistry } from "./marketWatcher/subscriptionRegistry";`,
    `import { HistoryFetcher } from "./marketWatcher/historyFetcher";`,
    `import { settingsState } from "../stores/settings.svelte";`,
    `import { marketState } from "../stores/market.svelte";`,
    `import { logger } from "../utils/logger";`
]);

mainFile.addClass({
    name: 'MarketWatcher',
    isExported: true,
    properties: [
        { name: 'registry', type: 'SubscriptionRegistry', scope: 'private' },
        { name: 'historyFetcher', type: 'HistoryFetcher', scope: 'private' },
        { name: 'isPolling', type: 'boolean', initializer: 'false', scope: 'private' },
        { name: 'pollingTimeout', type: 'ReturnType<typeof setTimeout> | null', initializer: 'null', scope: 'private' },
        { name: 'startTimeout', type: 'ReturnType<typeof setTimeout> | null', initializer: 'null', scope: 'private' },
        { name: 'staggerTimeouts', type: 'Set<ReturnType<typeof setTimeout>>', initializer: 'new Set()', scope: 'private' },
        { name: 'maxConcurrentPolls', type: 'number', initializer: '6', scope: 'private' },
        { name: 'maintenanceCycles', type: 'number', initializer: '0', scope: 'private' },
    ],
    constructors: [
        {
            statements: [
                `this.registry = new SubscriptionRegistry(null as any);`,
                `this.historyFetcher = new HistoryFetcher(this.registry);`,
                `this.registry.historyFetcher = this.historyFetcher;`
            ]
        }
    ]
});

const mainClass = mainFile.getClass('MarketWatcher');
mainClass.addMethod(methodsToExtract.startPolling);
mainClass.addMethod(methodsToExtract.resumePolling);
mainClass.addMethod(methodsToExtract.resync);
mainClass.addMethod(methodsToExtract.runPollingLoop);
mainClass.addMethod(methodsToExtract.stopPolling);
mainClass.addMethod(methodsToExtract.performPollingCycle);
mainClass.addMethod(methodsToExtract.refreshActiveHistory);
mainClass.addMethod(methodsToExtract.getActiveSymbols);
mainClass.addMethod(methodsToExtract.isBackfilling);
mainClass.addMethod(methodsToExtract.forceCleanup);
mainClass.addMethod(methodsToExtract.destroy);

// Public API delegation
mainClass.addMethod({
    name: 'register',
    parameters: [{name: 'symbol', type: 'string'}, {name: 'channel', type: 'string'}, {name: 'requirement', type: '"chart" | "stateless"', initializer: '"stateless"'}],
    statements: ['this.registry.register(symbol, channel, requirement);']
});
mainClass.addMethod({
    name: 'unregister',
    parameters: [{name: 'symbol', type: 'string'}, {name: 'channel', type: 'string'}, {name: 'requirement', type: '"chart" | "stateless"', initializer: '"stateless"'}],
    statements: ['this.registry.unregister(symbol, channel, requirement);']
});
mainClass.addMethod({
    name: 'ensureHistory',
    parameters: [{name: 'symbol', type: 'string'}, {name: 'tf', type: 'string'}],
    statements: ['this.historyFetcher.ensureHistory(symbol, tf);']
});
mainClass.addMethod({
    name: 'loadMoreHistory',
    isAsync: true,
    parameters: [{name: 'symbol', type: 'string'}, {name: 'tf', type: 'string'}],
    returnType: 'Promise<boolean>',
    statements: ['return this.historyFetcher.loadMoreHistory(symbol, tf);']
});

let mainText = mainClass.getText()
    .replace(/this\.requests/g, 'this.registry.requests')
    .replace(/this\._subscriptionsDirty/g, 'this.registry._subscriptionsDirty')
    .replace(/this\.prunedRequestIds/g, 'this.registry.prunedRequestIds')
    .replace(/this\.syncSubscriptions/g, 'this.registry.syncSubscriptions')
    .replace(/this\.pruneZombieRequests/g, 'this.registry.pruneZombieRequests')
    .replace(/this\.pruneOrphanedSubscriptions/g, 'this.registry.pruneOrphanedSubscriptions')
    .replace(/this\.pollSymbolChannel/g, 'this.historyFetcher.pollSymbolChannel')
    .replace(/this\.inFlight/g, 'this.historyFetcher.inFlight')
    .replace(/this\.exhaustedHistory/g, 'this.historyFetcher.exhaustedHistory')
    .replace(/this\.historyLocks/g, 'this.historyFetcher.historyLocks')
    .replace(/this\.pendingRequests/g, 'this.historyFetcher.pendingRequests')
    .replace(/this\.requestStartTimes/g, 'this.historyFetcher.requestStartTimes');

mainFile.getClass('MarketWatcher').replaceWithText(mainText);

mainFile.addStatements([
    `export const marketWatcher = new MarketWatcher();`,
    `if (import.meta.hot) {`,
    `  import.meta.hot.dispose(() => marketWatcher.destroy());`,
    `}`
]);

project.saveSync();
