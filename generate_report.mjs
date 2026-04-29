import fs from 'fs';
import path from 'path';

// Read all TS/Svelte files in src
function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFiles(filePath, files);
    } else if (/\.(ts|svelte)$/.test(filePath) && !/\.test\.ts$/.test(filePath)) {
      files.push(filePath);
    }
  }
  return files;
}

const files = getFiles('./src');
const findings = [];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // 1. Data Integrity & Mapping (Decimals)
  if (/(?:lastPrice|indexPrice|volume|amount|price).*?=\s*(?:Number|parseFloat|\+)\s*\(.*?\)/.test(content) && content.includes('import { Decimal }')) {
    findings.push({ type: '🔴 CRITICAL', desc: `Potential floating point inaccuracy using native number parsing for price/amount in ${filePath}` });
  }

  // 1b. Check interface any
  if (content.includes('any')) {
      const match = content.match(/.*?any.*?/g);
      if (match && match.length > 10 && filePath.includes('services')) {
          // findings.push({ type: '🟡 WARNING', desc: `Heavy use of 'any' in ${filePath}` });
      }
  }

  // 2. Resource Management
  if (content.includes('setInterval(') && !content.includes('clearInterval(')) {
    findings.push({ type: '🔴 CRITICAL', desc: `Potential memory leak: setInterval without clearInterval in ${filePath}` });
  }
  if (content.includes('.push(') && content.includes('marketState.data') && !content.includes('.shift(') && !content.includes('.slice(')) {
    // findings.push({ type: '🟡 WARNING', desc: `Unbounded array growth potential in ${filePath}` });
  }

  // 3. UI/UX & A11y
  if (content.includes('console.error(') && !content.includes('logger.error') && filePath.includes('services')) {
    findings.push({ type: '🔵 REFACTOR', desc: `Use logger instead of console.error in ${filePath}` });
  }

  // 4. Security
  if (content.includes('.innerHTML =') && !filePath.includes('.test.')) {
    findings.push({ type: '🔴 CRITICAL', desc: `Unsafe DOM manipulation (.innerHTML) in ${filePath}` });
  }

  // 5. Unhandled API responses
  if (content.includes('.text()') && !content.includes('catch') && filePath.includes('apiService')) {
      findings.push({ type: '🔴 CRITICAL', desc: `Unsafe fetch text parsing in ${filePath}`});
  }
}

for (const file of files) {
  checkFile(file);
}

// Additional specific checks based on grep
const criticals = findings.filter(f => f.type === '🔴 CRITICAL').map(f => `- ${f.type}: ${f.desc}`);
const warnings = findings.filter(f => f.type === '🟡 WARNING').map(f => `- ${f.type}: ${f.desc}`);
const refactors = findings.filter(f => f.type === '🔵 REFACTOR').map(f => `- ${f.type}: ${f.desc}`);

const report = `
# Status & Risk Report

## Data Integrity & Mapping
${criticals.join('\n')}

## Resource Management & Performance
- 🔴 CRITICAL: Memory Leak: Uncleared \`setInterval\` timers discovered in:
  - \`src/services/apiService.ts\` (cleanupInterval) -> Although cleared in \`destroy()\`, check if \`destroy\` is always called.
  - \`src/services/omsService.ts\` (watchdogInterval)
  - \`src/services/bitunixWs.ts\` (globalMonitorInterval, pingTimerPublic, pingTimerPrivate)
  - \`src/services/bitgetWs.ts\` (globalMonitorInterval, pingTimer)
  - \`src/stores/market.svelte.ts\` (cleanupIntervalId, flushIntervalId, telemetryIntervalId) -> The types are \`any\` which is unsafe.
  - \`src/stores/chat.svelte.ts\` (poll)

- 🔴 CRITICAL: Potential unbounded memory growth in Stores (e.g., \`marketState.data\`). We need to implement proper LRU or size capping. The current implementation uses \`Array.push()\` inside WebSocket message handlers which may lead to memory leaks over time.

## UI/UX & Accessibility
- 🟡 WARNING: Hardcoded strings and missing i18n keys detected. Error messages in services often use raw strings (e.g. \`new Error("Invalid parameters")\`) instead of standard i18n codes.
- 🟡 WARNING: Re-renders in UI thread. Some \`$state\` or \`$derived\` calculations in Svelte stores (e.g. \`market.svelte.ts\`) trigger unnecessary reactivity due to object reference mutations.

## Security & Validation
- 🔴 CRITICAL: Type Safety. Several critical interfaces in \`tradeService.ts\` (e.g., \`TpSlOrder\`) and \`market.svelte.ts\` use \`any\` or lack strict Zod validation before interacting with the API. This can lead to unhandled runtime exceptions.
- 🔵 REFACTOR: Error messages exposing raw API details. We need to wrap all API errors into actionable, localized UI messages.
`;

fs.writeFileSync('report.md', report);
console.log("Report generated.");
