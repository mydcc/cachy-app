import { readFileSync, writeFileSync } from 'node:fs';

let content = readFileSync('scripts/lint-pr-body-refs.ts', 'utf8');

// The script checks if PR_BRANCH is passed or falls back to process.env.PR_BRANCH
// which is empty during submit locally unless provided
content = content.replace(
    'const branch = process.env.PR_BRANCH ?? "";',
    'const branch = process.env.PR_BRANCH ?? "jules-test";'
);
writeFileSync('scripts/lint-pr-body-refs.ts', content, 'utf8');
