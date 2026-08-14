const fs = require('fs');

const file = 'src/services/marketWatcher.ts';
let text = fs.readFileSync(file, 'utf8');

// The CI output showed:
// 2026-08-14T17:20:41.5489681Z ##[error]   18:58  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
// 2026-08-14T17:20:41.5497721Z ##[error]  212:29  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
// Both were fixed.
// The current CI failure does NOT list an ESLint failure. It only shows `Process completed with exit code 1.` for `github-advanced-security` check.
// Wait, looking at the second check run details: "github-advanced-security Conclusion: failure URL: ...".
// The exact same internal error happened inside `autofind.js`: "CAPIError: 400 The requested model is not supported."
// This means the GitHub Copilot / github-advanced-security action itself crashed because `claude-opus-4.6` is not supported.
// This is not a failure in my code.
// I'll check my ESLint run to be absolutely sure.
