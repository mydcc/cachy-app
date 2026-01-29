
import fs from 'fs';

const en = JSON.parse(fs.readFileSync('src/locales/locales/en.json', 'utf8'));
const de = JSON.parse(fs.readFileSync('src/locales/locales/de.json', 'utf8'));

function merge(target, source, prefix = '') {
    for (const key in source) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof source[key] === 'object' && source[key] !== null) {
            if (!target[key]) {
                target[key] = {};
            }
            merge(target[key], source[key], fullKey);
        } else {
            if (target[key] === undefined) {
                console.log(`Adding missing key: ${fullKey}`);
                target[key] = `[DE] ${source[key]}`;
            }
        }
    }
}

merge(de, en);

fs.writeFileSync('src/locales/locales/de.json', JSON.stringify(de, null, 2), 'utf8');
console.log('Merged missing keys into de.json');
