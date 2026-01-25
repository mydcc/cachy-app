#!/usr/bin/env python3
"""
Detailed translation audit with exact file locations
"""

import json
import os
import re
from pathlib import Path

PROJECT_ROOT = Path('/home/pat/Dokumente/GitHub/cachy-app')
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
    return flat

def find_key_usage_in_code(key_name):
    """Find where a key is used in code"""
    locations = []
    
    patterns = [
        f"\\$t\\(['\\\"]({re.escape(key_name)})['\\\"]\\)",
        f"_\\(['\\\"]({re.escape(key_name)})['\\\"]\\)",
    ]
    
    for root, dirs, files in os.walk(SRC_DIR):
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'build', '.svelte-kit']]
        
        for file in files:
            if file.endswith(('.svelte', '.ts', '.js')):
                filepath = Path(root) / file
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()
                        for line_num, line in enumerate(lines, 1):
                            for pattern in patterns:
                                if re.search(pattern, line):
                                    rel_path = str(filepath.relative_to(PROJECT_ROOT))
                                    locations.append((rel_path, line_num, line.strip()))
                except:
                    pass
    
    return locations

def main():
    de_flat = load_translations(DE_TRANSLATIONS)
    en_flat = load_translations(EN_TRANSLATIONS)
    
    de_keys = set(de_flat.keys())
    en_keys = set(en_flat.keys())
    
    print("=" * 90)
    print("DETAILED TRANSLATION AUDIT - FILE LOCATIONS")
    print("=" * 90)
    print()
    
    # Missing in German
    print("=" * 90)
    print("MISSING IN GERMAN TRANSLATIONS (used in code but not in de.json)")
    print("=" * 90)
    print()
    
    for key in sorted(de_keys.symmetric_difference(en_keys)):
        if key in en_keys and key not in de_keys:
            print(f"\n🔴 KEY: {key}")
            print(f"   EN VALUE: {en_flat[key][:80]}")
            locations = find_key_usage_in_code(key)
            if locations:
                for filepath, line_num, line_content in locations:
                    print(f"   USED IN: {filepath}:{line_num}")
                    print(f"           {line_content[:80]}")
            else:
                print(f"   (No usage found in code)")
    
    # Missing in English
    print("\n" + "=" * 90)
    print("MISSING IN ENGLISH TRANSLATIONS (used in code but not in en.json)")
    print("=" * 90)
    print()
    
    for key in sorted(de_keys.symmetric_difference(en_keys)):
        if key in de_keys and key not in en_keys:
            print(f"\n🔴 KEY: {key}")
            print(f"   DE VALUE: {de_flat[key][:80]}")
            locations = find_key_usage_in_code(key)
            if locations:
                for filepath, line_num, line_content in locations:
                    print(f"   USED IN: {filepath}:{line_num}")
                    print(f"           {line_content[:80]}")
            else:
                print(f"   (No usage found in code)")
    
    # Keys only in German (likely unused)
    print("\n" + "=" * 90)
    print("ONLY IN GERMAN (60 extra keys - may be unused)")
    print("=" * 90)
    print()
    
    only_in_de = de_keys - en_keys
    for key in sorted(only_in_de)[:20]:
        print(f"\n  {key}")
        print(f"  Value: {de_flat[key][:70]}")
    
    if len(only_in_de) > 20:
        print(f"\n  ... and {len(only_in_de) - 20} more keys")
    
    # Keys only in English (likely unused)
    print("\n" + "=" * 90)
    print("ONLY IN ENGLISH (2 extra keys - may be unused)")
    print("=" * 90)
    print()
    
    only_in_en = en_keys - de_keys
    for key in sorted(only_in_en):
        print(f"\n  {key}")
        print(f"  Value: {en_flat[key][:70]}")

if __name__ == '__main__':
    main()
