#!/usr/bin/env node
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Copyright (C) 2026 MYDCT
 * 
 * i18n Lint Script
 * 
 * Scans TypeScript and Svelte files for hardcoded UI strings that should be in i18n keys.
 * Exits with code 1 if violations are found, 0 if clean.
 * 
 * Usage: node scripts/lint-i18n.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directories to scan
const SCAN_DIRS = [
    path.join(__dirname, '../src/components'),
    path.join(__dirname, '../src/routes'),
    path.join(__dirname, '../src/lib')
];

// Individual files to scan (only app.ts which has user-facing modals)
const SCAN_FILES = [
    path.join(__dirname, '../src/services/app.ts')
];

// File extensions to check
const FILE_EXTENSIONS = ['.ts', '.svelte'];

// Minimum string length to consider (reduce false positives)
const MIN_STRING_LENGTH = 10;

// Patterns that indicate a string should likely be in i18n
const UI_STRING_PATTERNS = [
    /["']([A-Z][a-z\s]{10,})["']/g,  // Capitalized UI text
    /["']([a-z\s]{15,})["']/g        // Long lowercase text
];

// Safe contexts where hardcoded strings are allowed
const SAFE_CONTEXTS = [
    /console\./,                // console.log/error
    /logger\./,                 // logger calls
    /import\s+.*from/,          // import statements
    /\$_\(/,                    // Already using i18n
    /get\(locale\)/,            // Already using locale.get()
    /https?:\/\//,              // URLs
    /\.css$/,                   // CSS file references
    /\.svg$/,                   // SVG file references
    /\/api\//,                  // API paths
    /data-testid=/,             // Test IDs
    /aria-label=/,              // ARIA labels using i18n
    /title=/,                   // title attributes (often already localized)
    /throw new Error\(/,        // Error messages
    /Error\(/,                  // Error constructors
    /\.error\(/,                // Error method calls
    /error =/,                  // Local error assignment
    /rel=/,                     // HTML attributes (noopener, noreferrer)
    /addEventListener\(/,       // Event names
    /removeEventListener\(/,    // Event names
    /it\(/,                     // Test descriptions
    /describe\(/,               // Test suite descriptions
    /\|\|.*Error/,              // Fallback error messages
    /alert\(/,                  // Alert calls (should use modal ideally, but temporary)
    /\/\//,                     // Code comments
    /^\s*\*/,                   // JSDoc / Block comments
    /aria-[\w-]+/,              // All aria attributes
    /data-[\w-]+/,              // All data attributes
    /class=/,                   // CSS classes
    /style=/,                   // Inline styles
    /id=/,                      // IDs
    /type=/,                    // Input types
    /href=/,                    // Links
    /src=/,                     // Sources
    /const\s/,                  // Variable declarations
    /let\s/,                    // Variable declarations
    /var\s/,                    // Variable declarations
    /return\s/,                 // Return statements
    /if\s*\(/,                  // Control flow
    /else/,                     // Control flow
    /for\s*\(/,                 // Control flow
    /while\s*\(/,               // Control flow
    /switch\s*\(/,              // Control flow
    /case\s/,                   // Control flow
    /default:/,                 // Control flow
    /export\s/,                 // Exports
    /import\s/,                 // Imports
    /trackCustomEvent/,         // Tracking keys often English
    /console\.(log|error|warn|info|debug)/, // Console methods
    /new\s+Error/,              // Error instantiation
    /className=/,               // React/Similar class usage
    /bind:value/,               // Svelte bindings
    /on:click/,                 // Svelte events
    /onclick=/,                 // Svelte 5 events
    /i18n-ignore/,              // Manual Ignore Comment
];

let violations = [];

/**
 * Check if a line contains a safe context that exempts it from i18n requirements
 */
function isSafeContext(line) {
    return SAFE_CONTEXTS.some(pattern => pattern.test(line));
}

/**
 * Scan a file for hardcoded UI strings
 */
function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
        // Skip safe contexts
        if (isSafeContext(line)) {
            return;
        }

        // Check each UI pattern
        UI_STRING_PATTERNS.forEach(pattern => {
            const matches = line.matchAll(pattern);
            for (const match of matches) {
                const str = match[1];
                if (str.length >= MIN_STRING_LENGTH) {
                    violations.push({
                        file: path.relative(process.cwd(), filePath),
                        line: index + 1,
                        string: str,
                        context: line.trim()
                    });
                }
            }
        });
    });
}

/**
 * Recursively scan a directory
 */
function scanDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip API routes (server-side only)
        if (fullPath.includes(path.join('src', 'routes', 'api'))) {
            continue;
        }

        if (entry.isDirectory()) {
            scanDirectory(fullPath);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            // Skip test files
            if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
                continue;
            }
            if (FILE_EXTENSIONS.includes(ext)) {
                scanFile(fullPath);
            }
        }
    }
}

// Main execution
console.log('🔍 Scanning for hardcoded UI strings...\n');

SCAN_DIRS.forEach(dir => {
    if (fs.existsSync(dir)) {
        scanDirectory(dir);
    }
});

SCAN_FILES.forEach(file => {
    if (fs.existsSync(file)) {
        scanFile(file);
    }
});

if (violations.length > 0) {
    console.error(`❌ Found ${violations.length} potential i18n violations:\n`);
    violations.forEach(v => {
        console.error(`  ${v.file}:${v.line}`);
        console.error(`    String: "${v.string}"`);
        console.error(`    Context: ${v.context}\n`);
    });
    process.exit(1);
} else {
    console.log('✅ No hardcoded UI strings detected');
    process.exit(0);
}
