import fs from 'fs';
const data = fs.readFileSync('src/services/apiService.ts', 'utf-8');
const lines = data.split('\n');
console.log(lines.slice(395, 420).join('\n'));
