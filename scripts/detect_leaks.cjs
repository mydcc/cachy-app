const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../src');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const suspiciousPatterns = [];

walkDir(ROOT_DIR, (filepath) => {
    if (!filepath.endsWith('.svelte') && !filepath.endsWith('.ts')) return;

    const content = fs.readFileSync(filepath, 'utf8');

    // Simple regex to find blocks. This is not a full parser, so it has limitations.
    // We look for $effect(() => { ... setInterval ... }) where return is missing.

    // Check for setInterval usage
    if (content.includes('setInterval')) {
        // Naive check: Does the file contain "clearInterval"?
        if (!content.includes('clearInterval')) {
            suspiciousPatterns.push({
                file: filepath,
                issue: "Uses setInterval but no clearInterval found in file."
            });
        }
    }

    // Check for $effect with timers
    // This is hard to regex perfectly, but we can look for proximity.
    // Strategy: Split by lines.
});

console.log("Scanning for potential memory leaks (Timer cleanup checks)...");

let cleanupsFound = 0;
let filesWithTimers = 0;

walkDir(ROOT_DIR, (filepath) => {
    if (!filepath.endsWith('.svelte')) return; // Mostly Svelte components issue

    const content = fs.readFileSync(filepath, 'utf8');
    const relativePath = path.relative(ROOT_DIR, filepath);

    if (content.includes('setInterval')) {
        filesWithTimers++;
        // Check if there is a return statement inside an effect or onMount
        const hasCleanup = content.includes('clearInterval') && (content.includes('return () =>') || content.includes('return cleanup'));

        if (!hasCleanup) {
             // Exception: maybe it's using a variable that is cleared elsewhere?
             // But usually in Svelte 5, you want the return cleanup.
             console.warn(`[WARNING] ${relativePath}: Uses setInterval. Verify cleanup (missing 'return () => clearInterval'?).`);
        } else {
            cleanupsFound++;
        }
    }
});

console.log(`\nScanned files. Found ${filesWithTimers} files using setInterval.`);
console.log(`Verified cleanup in ${cleanupsFound} files.`);
if (filesWithTimers > cleanupsFound) {
    console.log("Please manually review the warnings above.");
} else {
    console.log("All timer usages seem to have cleanup logic.");
}
