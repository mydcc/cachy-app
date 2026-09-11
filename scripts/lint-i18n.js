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
 * i18n Lint Script
 *
 * Scans Svelte and TypeScript source for user-facing strings that should be
 * resolved through svelte-i18n instead of being hardcoded.
 *
 * It deliberately targets the high-signal cases (no generic "any quoted
 * string" heuristic, which produced more noise than findings):
 *
 *   1. svelte-text      literal text nodes in markup: `>Save<`
 *   2. svelte-attr      literal placeholder/title/aria-label/alt values
 *   3. object-label     `label:` / `title:` / `description:` values in
 *                       user-facing config files (see objectLabelFiles)
 *   4. user-call        literal toast/alert/confirm/prompt messages
 *   5. interpolation    `$_("key", { symbol })` without the `values` wrapper
 *
 * Escape hatch: add `i18n-ignore` on the same line (or the line above) for a
 * deliberate exception, or extend scripts/i18n-lint.config.json for recurring
 * proper nouns / technical identifiers.
 *
 * Usage: node scripts/lint-i18n.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const CONFIG_PATH = path.join(__dirname, 'i18n-lint.config.json');
const FILE_EXTENSIONS = ['.ts', '.svelte'];

let config;
try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
} catch (err) {
    console.error(`❌ Could not read ${path.relative(process.cwd(), CONFIG_PATH)}: ${err.message}`);
    process.exit(2);
}

const EXCLUDE = (config.exclude ?? []).map((p) => path.join(ROOT, p));
const OBJECT_LABEL_FILES = new Set(
    (config.objectLabelFiles ?? []).map((p) => path.join(ROOT, p)),
);
const ALLOW = {
    textNodes: new Set(config.allowlist?.textNodes ?? []),
    attributes: new Set(config.allowlist?.attributes ?? []),
    objectLabels: new Set(config.allowlist?.objectLabels ?? []),
    matches: (config.allowlist?.matches ?? []).map((r) => new RegExp(r)),
};

const violations = [];
const interpolationViolations = [];

const HAS_LETTER = /[A-Za-zÄÖÜäöüß]/;
// A real word, not a fragment left over between two `{…}` expressions
// (units like "x", "px", "MB", or punctuation like "—", "(%").
const HAS_WORD = /[A-Za-zÄÖÜäöüß]{3,}/;
const TRANSLATION_KEY = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

function rel(p) {
    return path.relative(process.cwd(), p);
}

function isExcluded(filePath) {
    if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('.bench.')) {
        return true;
    }
    return EXCLUDE.some((dir) => filePath === dir || filePath.startsWith(dir + path.sep));
}

function isAllowed(rule, value) {
    const trimmed = value.trim();
    if (ALLOW[rule]?.has(trimmed)) return true;
    return ALLOW.matches.some((re) => re.test(trimmed));
}

function hasIgnore(lines, index) {
    return ignoredLines.has(index);
}

/**
 * `i18n-ignore` on a line (or the line above) exempts a single match;
 * `i18n-ignore-start` … `i18n-ignore-end` exempts a block (mock content,
 * generated data).
 */
function computeIgnoredLines(lines) {
    const ignored = new Set();
    let block = false;
    lines.forEach((line, i) => {
        if (line.includes('i18n-ignore-end')) {
            ignored.add(i);
            block = false;
            return;
        }
        if (block) {
            ignored.add(i);
            return;
        }
        if (line.includes('i18n-ignore-start')) {
            block = true;
            ignored.add(i);
            return;
        }
        if (line.includes('i18n-ignore')) {
            ignored.add(i);
            ignored.add(i + 1);
        }
    });
    return ignored;
}

let ignoredLines = new Set();

function add(rule, filePath, line, value, context) {
    violations.push({ rule, file: rel(filePath), line, value: value.trim(), context: context.trim() });
}

/**
 * svelte-i18n takes interpolation values under a `values` key:
 *
 *     $_("positionsList.confirmClose", { values: { symbol } })
 *
 * Passing the variables directly — `{ symbol }` — is silently ignored. No type
 * error, no runtime error: the placeholder is simply rendered as literal
 * "{symbol}" to the user. That has now reached production three times, so it
 * is checked here rather than found by whoever reads the dialog next.
 */
function checkInterpolation(content, filePath) {
    const call = /\$_\(\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[\w.[\]]+(?:\s+as\s+[\w.]+)?)\s*,\s*\{/g;
    for (const match of content.matchAll(call)) {
        const after = content.slice(match.index + match[0].length);
        if (/^\s*values\s*:/.test(after)) continue;
        if (/^\s*\}/.test(after)) continue;
        interpolationViolations.push({
            file: rel(filePath),
            line: content.slice(0, match.index).split('\n').length,
            context: content.slice(match.index, match.index + 90).split('\n')[0].trim(),
        });
    }
}

/**
 * Reduce a Svelte component to markup-only text, preserving line count:
 * drops <script>/<style> blocks, HTML comments, and balanced `{…}`
 * expressions. Without this, comparison operators (`avgRsi > 30 && x < 70`)
 * and arrow functions read as `>text<` and drown the real findings.
 */
function toMarkupLines(content) {
    const lines = content.split('\n');
    let mode = null; // null | 'script' | 'style' | 'comment'
    let braces = 0;
    const out = [];

    for (const line of lines) {
        let kept = '';
        let i = 0;
        while (i < line.length) {
            const rest = line.slice(i);

            if (mode === 'comment') {
                const end = rest.indexOf('-->');
                if (end === -1) { i = line.length; break; }
                i += end + 3;
                mode = null;
                continue;
            }
            if (mode === 'script' || mode === 'style') {
                const tag = mode === 'script' ? '</script>' : '</style>';
                const end = rest.indexOf(tag);
                if (end === -1) { i = line.length; break; }
                i += end + tag.length;
                mode = null;
                continue;
            }

            if (rest.startsWith('<!--')) { mode = 'comment'; i += 4; continue; }
            if (/^<script[\s>]/.test(rest)) { mode = 'script'; i += rest.indexOf('>') + 1; continue; }
            if (/^<style[\s>]/.test(rest)) { mode = 'style'; i += rest.indexOf('>') + 1; continue; }

            const ch = line[i];
            if (ch === '{') { braces++; i++; continue; }
            if (ch === '}') { if (braces > 0) braces--; i++; continue; }
            if (braces === 0) kept += ch;
            i++;
        }
        out.push(kept);
    }
    return out;
}

function scanTextNodes(lines, filePath) {
    const markup = toMarkupLines(lines.join('\n'));
    markup.forEach((line, index) => {
        if (hasIgnore(lines, index)) return;
        const re = />([^<>{}]+)</g;
        for (const match of line.matchAll(re)) {
            const text = match[1].trim();
            if (text.length < 2) continue;
            if (!HAS_WORD.test(text)) continue;
            if (isAllowed('textNodes', text)) continue;
            add('svelte-text', filePath, index + 1, text, lines[index] ?? '');
        }
    });
}

function scanAttributes(lines, filePath) {
    const re = /\b(placeholder|aria-label|title|alt)\s*=\s*(?:"([^"{}]*)"|'([^'{}]*)')/g;
    lines.forEach((line, index) => {
        if (hasIgnore(lines, index)) return;
        for (const match of line.matchAll(re)) {
            const value = (match[2] ?? match[3] ?? '').trim();
            if (value.length < 3 || !HAS_LETTER.test(value)) continue;
            if (/^(https?:|data:|#)/.test(value)) continue;
            if (isAllowed('attributes', value)) continue;
            add('svelte-attr', filePath, index + 1, value, line);
        }
    });
}

function scanObjectLabels(lines, filePath) {
    if (!OBJECT_LABEL_FILES.has(path.resolve(filePath))) return;
    const re = /\b(label|title|description)\s*:\s*(?:"([^"{}]*)"|'([^'{}]*)')/g;
    lines.forEach((line, index) => {
        if (hasIgnore(lines, index)) return;
        if (line.includes('$_(')) return;
        for (const match of line.matchAll(re)) {
            const value = (match[2] ?? match[3] ?? '').trim();
            if (value.length < 3 || !HAS_LETTER.test(value)) continue;
            if (TRANSLATION_KEY.test(value)) continue;
            if (isAllowed('objectLabels', value)) continue;
            add('object-label', filePath, index + 1, value, line);
        }
    });
}

function scanUserCalls(lines, filePath) {
    const toastRe = /\b(?:toastService|toast|\$toast)\.(?:error|success|info|warning|show)\s*\(\s*[`"']/;
    const nativeRe = /(?<![.\w])(?:alert|confirm|prompt)\s*\(\s*[`"']/;
    lines.forEach((line, index) => {
        if (hasIgnore(lines, index)) return;
        if (line.includes('$_(')) return;
        if (toastRe.test(line)) add('user-call', filePath, index + 1, '', line);
        else if (nativeRe.test(line)) add('user-call', filePath, index + 1, '', line);
    });
}

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    ignoredLines = computeIgnoredLines(lines);
    checkInterpolation(content, filePath);

    if (filePath.endsWith('.svelte')) {
        scanTextNodes(lines, filePath);
        scanAttributes(lines, filePath);
    }
    scanObjectLabels(lines, filePath);
    scanUserCalls(lines, filePath);
}

function walk(dirPath, out) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);
        if (isExcluded(fullPath)) continue;
        if (entry.isDirectory()) walk(fullPath, out);
        else if (entry.isFile() && FILE_EXTENSIONS.includes(path.extname(entry.name))) out.push(fullPath);
    }
}

const files = [];
walk(path.join(ROOT, 'src'), files);

console.log(`🔍 Scanning ${files.length} files for hardcoded UI strings...\n`);
for (const file of files) scanFile(file);

let failed = false;

if (violations.length > 0) {
    failed = true;
    const byRule = violations.reduce((acc, v) => {
        (acc[v.rule] ??= []).push(v);
        return acc;
    }, {});
    console.error(`❌ Found ${violations.length} hardcoded UI string(s):\n`);
    for (const [rule, list] of Object.entries(byRule)) {
        console.error(`  [${rule}] ${list.length}`);
        for (const v of list) {
            console.error(
                `    ${v.file}:${v.line}${v.value ? `  "${v.value}"` : ''}`,
            );
            console.error(`      ${v.context}`);
        }
        console.error('');
    }
} else {
    console.log('✅ No hardcoded UI strings detected');
}

if (interpolationViolations.length > 0) {
    failed = true;
    console.error(
        `\n❌ Found ${interpolationViolations.length} $_() call(s) passing interpolation values without the \`values\` wrapper.`,
    );
    console.error('   svelte-i18n ignores them and renders the raw {placeholder} to the user.\n');
    interpolationViolations.forEach((v) => {
        console.error(`  ${v.file}:${v.line}`);
        console.error(`    Context: ${v.context}`);
        console.error(`    Fix:     $_("key", { values: { … } })\n`);
    });
} else {
    console.log('✅ All $_() interpolations pass their values correctly');
}

process.exit(failed ? 1 : 0);
