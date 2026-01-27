
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');

const suspiciousPatterns = [
  { pattern: /\.push\(/, label: 'Unbounded Array Push' },
  { pattern: /setInterval\(/, label: 'SetInterval Usage' },
  { pattern: /addEventListener\(/, label: 'Event Listener' },
  { pattern: /new Map\(/, label: 'Map Creation' },
  { pattern: /new Set\(/, label: 'Set Creation' },
  { pattern: /subscribe\(/, label: 'Subscription' },
];

function scanFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const results: any[] = [];

  lines.forEach((line, index) => {
    suspiciousPatterns.forEach(({ pattern, label }) => {
      if (pattern.test(line)) {
        // Simple heuristic: check if there is a corresponding 'cleanup' logic nearby or in the file
        // This is very primitive, but helps to spot hotspots.
        results.push({
          file: path.relative(ROOT_DIR, filePath),
          line: index + 1,
          content: line.trim(),
          label
        });
      }
    });
  });

  return results;
}

function walkDir(dir: string, fileList: string[] = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, fileList);
    } else {
      if (file.endsWith('.ts') || file.endsWith('.svelte') || file.endsWith('.js')) {
        fileList.push(filePath);
      }
    }
  });
  return fileList;
}

const files = walkDir(SRC_DIR);
console.log(`Scanning ${files.length} files...`);

const findings = files.flatMap(scanFile);

// Filter findings: We are looking for GLOBAL variables that grow.
// This requires a bit of AST analysis, but for now we look for array pushes in services/stores.
const dangerousPushes = findings.filter(f =>
  f.label === 'Unbounded Array Push' &&
  (f.file.includes('services/') || f.file.includes('stores/'))
);

console.log('--- POTENTIAL UNBOUNDED ARRAYS IN SERVICES/STORES ---');
dangerousPushes.forEach(f => {
  console.log(`[${f.label}] ${f.file}:${f.line} -> ${f.content}`);
});

console.log('\n--- SET INTERVALS (Check for Zombie Guards) ---');
const intervals = findings.filter(f => f.label === 'SetInterval Usage');
intervals.forEach(f => {
    // Filter out common "good" usages if possible, or just list all
    console.log(`[${f.label}] ${f.file}:${f.line} -> ${f.content}`);
});
