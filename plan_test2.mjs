import fs from 'fs';
const data = fs.readFileSync('src/stores/market.svelte.ts', 'utf-8');
const lines = data.split('\n');
console.log(lines.slice(90, 100).join('\n'));
