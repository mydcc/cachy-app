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
 * I18n Validator
 *
 * Checks that all keys in en.json exist in de.json.
 * Type generation is handled separately by scripts/generate-i18n-types.js.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EN_PATH = path.join(__dirname, '../src/locales/locales/en.json');
const DE_PATH = path.join(__dirname, '../src/locales/locales/de.json');

function flattenKeys(obj, prefix = '') {
    let keys = [];
    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            keys = keys.concat(flattenKeys(obj[key], prefix + key + '.'));
        } else {
            keys.push(prefix + key);
        }
    }
    return keys;
}

try {
    console.log('📖 Reading locales...');
    const enContent = fs.readFileSync(EN_PATH, 'utf-8');
    const deContent = fs.readFileSync(DE_PATH, 'utf-8');

    const enJson = JSON.parse(enContent);
    const deJson = JSON.parse(deContent);

    const enKeys = flattenKeys(enJson);
    const deKeys = flattenKeys(deJson);

    console.log('🔍 Validating keys...');
    const missingInDe = enKeys.filter(k => !deKeys.includes(k));

    if (missingInDe.length > 0) {
        console.error('❌ Missing keys in German translation:');
        missingInDe.forEach(k => console.error(`  - ${k}`));
        process.exit(1);
    }

    console.log('✅ All keys present in German translation.');

} catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
}
