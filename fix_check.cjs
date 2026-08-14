const fs = require('fs');

const replaceInFile = (file, search, replace) => {
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(search, replace);
    fs.writeFileSync(file, text);
};

// Fix logger import paths
replaceInFile('src/services/marketWatcher/historyFetcher.ts', /import \{ logger \} from "\.\.\/\.\.\/utils\/logger";/g, 'import { logger } from "../../utils/logger";');
// The correct path from src/services/marketWatcher is ../../utils/logger. Wait, src/utils/logger.ts. So it is ../../utils/logger. That is correct. Let's check if logger is in src/utils/logger.ts. Yes. Wait, why did it say "Cannot find module"?
// Let's check the path: src/utils/logger.ts -> from src/services/marketWatcher/historyFetcher.ts, it's `../../utils/logger`. That is correct. Oh, wait, marketWatcher.ts is in src/services. So utils is `../utils/logger`.

replaceInFile('src/services/marketWatcher/historyFetcher.ts', /import \{ logger \} from "\.\.\/\.\.\/utils\/logger";/g, 'import { logger } from "../../utils/logger";');
replaceInFile('src/services/marketWatcher/subscriptionRegistry.ts', /import \{ logger \} from "\.\.\/\.\.\/utils\/logger";/g, 'import { logger } from "../../utils/logger";');
replaceInFile('src/services/marketWatcher.ts', /import \{ logger \} from "\.\.\/utils\/logger";/g, 'import { logger } from "../utils/logger";');

// Wait, the error is: Cannot find module '../../utils/logger'
// In src/services/marketWatcher/historyFetcher.ts
// `src/services/marketWatcher/historyFetcher.ts` -> `../../utils/logger` -> `src/utils/logger`
