const fs = require('fs');

const replaceInFile = (file, search, replace) => {
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(search, replace);
    fs.writeFileSync(file, text);
};

// Fix logger
replaceInFile('src/services/marketWatcher/historyFetcher.ts', /import \{ logger \} from "\.\.\/\.\.\/utils\/logger";/g, 'import { logger } from "../logger";');
replaceInFile('src/services/marketWatcher/subscriptionRegistry.ts', /import \{ logger \} from "\.\.\/\.\.\/utils\/logger";/g, 'import { logger } from "../logger";');
replaceInFile('src/services/marketWatcher.ts', /import \{ logger \} from "\.\.\/utils\/logger";/g, 'import { logger } from "./logger";');

// Fix "no initializer and is not definitely assigned"
replaceInFile('src/services/marketWatcher/historyFetcher.ts', /public registry: SubscriptionRegistry;/g, 'public registry!: SubscriptionRegistry;');
replaceInFile('src/services/marketWatcher/subscriptionRegistry.ts', /public historyFetcher: HistoryFetcher;/g, 'public historyFetcher!: HistoryFetcher;');
replaceInFile('src/services/marketWatcher.ts', /private registry: SubscriptionRegistry;/g, 'private registry!: SubscriptionRegistry;');
replaceInFile('src/services/marketWatcher.ts', /private historyFetcher: HistoryFetcher;/g, 'private historyFetcher!: HistoryFetcher;');
