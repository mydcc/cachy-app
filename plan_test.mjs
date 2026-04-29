import fs from 'fs';
const data = fs.readFileSync('src/components/inputs/TradeSetupInputs.svelte', 'utf-8');
const lines = data.split('\n');
console.log(lines.slice(350, 365).join('\n'));
