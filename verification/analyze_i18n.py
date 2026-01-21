#!/usr/bin/env python3
"""
Analyse-Skript für i18n-Keys in der Cachy-App.
Vergleicht en.json und de.json und findet fehlende Keys sowie ungenutzte Keys.
"""
import json
import os
import re
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent

def flatten_keys(obj, prefix=''):
    """Flatten nested dictionary keys with dot notation."""
    keys = []
    for k, v in obj.items():
        full_key = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            keys.extend(flatten_keys(v, full_key))
        else:
            keys.append(full_key)
    return keys

def find_used_keys():
    """Find all translation keys used in source files."""
    src_dir = BASE_DIR / 'src'
    used_keys = set()
    
    # Pattern to match $_('key') or $_("key")
    pattern = re.compile(r'\$_\([\'"]([^\'"]+)[\'"]\)')
    
    for ext in ['*.svelte', '*.ts', '*.js']:
        for file_path in src_dir.rglob(ext):
            try:
                content = file_path.read_text(encoding='utf-8')
                matches = pattern.findall(content)
                used_keys.update(matches)
            except Exception as e:
                print(f'Error reading {file_path}: {e}')
    
    return used_keys

def main():
    # Load translation files
    en_path = BASE_DIR / 'src' / 'locales' / 'locales' / 'en.json'
    de_path = BASE_DIR / 'src' / 'locales' / 'locales' / 'de.json'
    
    with open(en_path, 'r', encoding='utf-8') as f:
        en = json.load(f)
    with open(de_path, 'r', encoding='utf-8') as f:
        de = json.load(f)
    
    en_keys = set(flatten_keys(en))
    de_keys = set(flatten_keys(de))
    used_keys = find_used_keys()
    
    print('=' * 60)
    print('CACHY APP - ÜBERSETZUNGS-ANALYSE')
    print('=' * 60)
    print()
    
    print('=== STATISTIK ===')
    print(f'EN Keys gesamt:      {len(en_keys)}')
    print(f'DE Keys gesamt:      {len(de_keys)}')
    print(f'Im Code verwendete:  {len(used_keys)}')
    print()
    
    # Keys in EN but not in DE
    only_en = sorted(en_keys - de_keys)
    print(f'=== KEYS NUR IN EN ({len(only_en)}) ===')
    for k in only_en:
        print(f'  - {k}')
    print()
    
    # Keys in DE but not in EN
    only_de = sorted(de_keys - en_keys)
    print(f'=== KEYS NUR IN DE ({len(only_de)}) ===')
    for k in only_de:
        print(f'  - {k}')
    print()
    
    # Keys used in code but not defined
    missing_en = sorted(used_keys - en_keys)
    print(f'=== IM CODE VERWENDET ABER FEHLEND IN EN ({len(missing_en)}) ===')
    for k in missing_en:
        print(f'  - {k}')
    print()
    
    missing_de = sorted(used_keys - de_keys)
    print(f'=== IM CODE VERWENDET ABER FEHLEND IN DE ({len(missing_de)}) ===')
    for k in missing_de:
        print(f'  - {k}')
    print()
    
    # Keys defined but not used (potential orphans)
    unused_en = sorted(en_keys - used_keys)
    print(f'=== IN EN DEFINIERT ABER NICHT GEFUNDEN IM CODE ({len(unused_en)}) ===')
    for k in unused_en[:50]:  # Limit output
        print(f'  - {k}')
    if len(unused_en) > 50:
        print(f'  ... und {len(unused_en) - 50} weitere')
    
if __name__ == '__main__':
    main()
