const fs = require('fs');

const file = 'src/services/marketWatcher/historyFetcher.ts';
let text = fs.readFileSync(file, 'utf8');

text = text.replace(/private fillGaps\(/g, 'public fillGaps(');
fs.writeFileSync(file, text);
