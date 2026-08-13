import { performance } from 'perf_hooks';

console.log("Measuring...");
// IndexedDB is not available in node.js natively without a polyfill.
// I will measure loadKeyFromDB in a vitest setup if needed, but I should look at the code first.
