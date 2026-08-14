const fs = require('fs');

const fixConstructor = (file, param, type, assignment) => {
    let text = fs.readFileSync(file, 'utf8');
    const classMatch = text.match(/export class \w+ \{/);
    if (classMatch) {
        const constructorCode = `
    constructor(${param}: ${type}) {
        ${assignment}
    }`;
        text = text.replace(/export class \w+ \{/, classMatch[0] + constructorCode);
        fs.writeFileSync(file, text);
    }
}

fixConstructor('src/services/marketWatcher/subscriptionRegistry.ts', 'historyFetcher', 'HistoryFetcher', 'this.historyFetcher = historyFetcher;');
fixConstructor('src/services/marketWatcher/historyFetcher.ts', 'registry', 'SubscriptionRegistry', 'this.registry = registry;');
