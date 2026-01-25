#!/usr/bin/env python3
"""
Audit script for translation keys in cachy-app
Checks for:
1. Missing translations in German (de.json)
2. Missing translations in English (en.json)
3. Unused translation keys
4. Unresolved translation keys in code
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict

# Auto-detect project root or use provided path
if len(sys.argv) > 1:
    PROJECT_ROOT = Path(sys.argv[1]).resolve()
else:
    # Use script location to find project root
    PROJECT_ROOT = Path(__file__).parent.resolve()

SRC_DIR = PROJECT_ROOT / 'src'
DE_TRANSLATIONS = SRC_DIR / 'locales/locales/de.json'
EN_TRANSLATIONS = SRC_DIR / 'locales/locales/en.json'

def load_translations(filepath):
    """Load and flatten translation JSON"""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    flat = {}
    
    def flatten(obj, prefix=''):
        if isinstance(obj, dict):
            for key, value in obj.items():
                new_key = f"{prefix}.{key}" if prefix else key
                if isinstance(value, dict):
                    flatten(value, new_key)
                else:
                    flat[new_key] = value
        
    flatten(data)
    return flat, data

def extract_i18n_keys_from_code():
    """Extract all $t() calls from code files"""
    keys = set()
    
    # Pattern for $t('key') or $t("key")
    patterns = [
        r"\$t\(['\"]([^'\"]+)['\"]\)",  # $t('key') or $t("key")
        r"_\(['\"]([^'\"]+)['\"]\)",    # _('key') - alternative pattern
    ]
    
    # Search in svelte, ts, js files
    for root, dirs, files in os.walk(SRC_DIR):
        # Skip node_modules, build, etc.
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'build', '.svelte-kit']]
        
        for file in files:
            if file.endswith(('.svelte', '.ts', '.js')):
                filepath = Path(root) / file
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        for pattern in patterns:
                            matches = re.findall(pattern, content)
                            for match in matches:
                                keys.add(match)
                except:
                    pass
    
    return keys

def compare_flat_dicts(de_flat, en_flat):
    """Compare flattened translation dictionaries"""
    de_keys = set(de_flat.keys())
    en_keys = set(en_flat.keys())
    
    only_in_de = de_keys - en_keys
    only_in_en = en_keys - de_keys
    
    return {
        'only_in_de': sorted(only_in_de),
        'only_in_en': sorted(only_in_en),
    }

def find_missing_values(flat_dict):
    """Find keys with missing or empty values"""
    missing = {}
    for key, value in flat_dict.items():
        if not value or str(value).strip() == '':
            missing[key] = value
    return missing

def main():
    print("=" * 80)
    print("TRANSLATION AUDIT REPORT - CACHY APP")
    print("=" * 80)
    print()
    
    # Load translations
    de_flat, de_struct = load_translations(DE_TRANSLATIONS)
    en_flat, en_struct = load_translations(EN_TRANSLATIONS)
    
    print(f"✓ Loaded German translations: {len(de_flat)} keys")
    print(f"✓ Loaded English translations: {len(en_flat)} keys")
    print()
    
    # Extract keys from code
    code_keys = extract_i18n_keys_from_code()
    print(f"✓ Found {len(code_keys)} translation keys in code")
    print()
    
    # 1. Compare dictionaries
    print("=" * 80)
    print("1. DICTIONARY COMPARISON")
    print("=" * 80)
    comparison = compare_flat_dicts(de_flat, en_flat)
    
    if comparison['only_in_de']:
        print(f"\n❌ ONLY IN GERMAN ({len(comparison['only_in_de'])} keys):")
        for key in comparison['only_in_de'][:20]:
            print(f"   - {key}: {de_flat.get(key, 'N/A')[:60]}")
        if len(comparison['only_in_de']) > 20:
            print(f"   ... and {len(comparison['only_in_de']) - 20} more")
    else:
        print("\n✓ No keys only in German")
    
    if comparison['only_in_en']:
        print(f"\n❌ ONLY IN ENGLISH ({len(comparison['only_in_en'])} keys):")
        for key in comparison['only_in_en'][:20]:
            print(f"   - {key}: {en_flat.get(key, 'N/A')[:60]}")
        if len(comparison['only_in_en']) > 20:
            print(f"   ... and {len(comparison['only_in_en']) - 20} more")
    else:
        print("\n✓ No keys only in English")
    
    # 2. Check for missing/empty values
    print("\n" + "=" * 80)
    print("2. MISSING OR EMPTY VALUES")
    print("=" * 80)
    
    de_missing = find_missing_values(de_flat)
    en_missing = find_missing_values(en_flat)
    
    if de_missing:
        print(f"\n❌ GERMAN - Empty/missing values ({len(de_missing)} keys):")
        for key in sorted(de_missing.keys())[:10]:
            print(f"   - {key}: '{de_missing[key]}'")
        if len(de_missing) > 10:
            print(f"   ... and {len(de_missing) - 10} more")
    else:
        print("\n✓ No empty values in German")
    
    if en_missing:
        print(f"\n❌ ENGLISH - Empty/missing values ({len(en_missing)} keys):")
        for key in sorted(en_missing.keys())[:10]:
            print(f"   - {key}: '{en_missing[key]}'")
        if len(en_missing) > 10:
            print(f"   ... and {len(en_missing) - 10} more")
    else:
        print("\n✓ No empty values in English")
    
    # 3. Check code references
    print("\n" + "=" * 80)
    print("3. TRANSLATION KEYS IN CODE")
    print("=" * 80)
    
    missing_in_de = []
    missing_in_en = []
    
    for code_key in sorted(code_keys):
        if code_key not in de_flat:
            missing_in_de.append(code_key)
        if code_key not in en_flat:
            missing_in_en.append(code_key)
    
    if missing_in_de:
        print(f"\n❌ REFERENCED IN CODE BUT MISSING IN GERMAN ({len(missing_in_de)} keys):")
        for key in missing_in_de[:15]:
            print(f"   - {key}")
        if len(missing_in_de) > 15:
            print(f"   ... and {len(missing_in_de) - 15} more")
    else:
        print("\n✓ All code references found in German")
    
    if missing_in_en:
        print(f"\n❌ REFERENCED IN CODE BUT MISSING IN ENGLISH ({len(missing_in_en)} keys):")
        for key in missing_in_en[:15]:
            print(f"   - {key}")
        if len(missing_in_en) > 15:
            print(f"   ... and {len(missing_in_en) - 15} more")
    else:
        print("\n✓ All code references found in English")
    
    # 4. Unused keys
    print("\n" + "=" * 80)
    print("4. UNUSED KEYS")
    print("=" * 80)
    
    unused_de = set(de_flat.keys()) - code_keys
    unused_en = set(en_flat.keys()) - code_keys
    
    if unused_de:
        print(f"\n⚠️ GERMAN - Possibly unused keys ({len(unused_de)} keys):")
        for key in sorted(unused_de)[:15]:
            print(f"   - {key}")
        if len(unused_de) > 15:
            print(f"   ... and {len(unused_de) - 15} more")
    else:
        print("\n✓ All German keys are used")
    
    if unused_en:
        print(f"\n⚠️ ENGLISH - Possibly unused keys ({len(unused_en)} keys):")
        for key in sorted(unused_en)[:15]:
            print(f"   - {key}")
        if len(unused_en) > 15:
            print(f"   ... and {len(unused_en) - 15} more")
    else:
        print("\n✓ All English keys are used")
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    issues = []
    issues.extend([(f"Only in DE: {len(comparison['only_in_de'])}", len(comparison['only_in_de']))])
    issues.extend([(f"Only in EN: {len(comparison['only_in_en'])}", len(comparison['only_in_en']))])
    issues.extend([(f"Empty values in DE: {len(de_missing)}", len(de_missing))])
    issues.extend([(f"Empty values in EN: {len(en_missing)}", len(en_missing))])
    issues.extend([(f"Missing in DE (code ref): {len(missing_in_de)}", len(missing_in_de))])
    issues.extend([(f"Missing in EN (code ref): {len(missing_in_en)}", len(missing_in_en))])
    issues.extend([(f"Unused in DE: {len(unused_de)}", len(unused_de))])
    issues.extend([(f"Unused in EN: {len(unused_en)}", len(unused_en))])
    
    total_issues = sum(count for _, count in issues)
    
    for desc, count in issues:
        if count > 0:
            print(f"❌ {desc}")
        else:
            print(f"✓ {desc}")
    
    print(f"\nTotal Issues Found: {total_issues}")
    print()

if __name__ == '__main__':
    main()
