#!/usr/bin/env python3

# Copyright (C) 2026 MYDCT
# Cleanup script for removing unused translation keys.
# Safety: Scans for ALL string literals that match translation keys, not just $t() calls.

import json
import os
import re
import sys
from pathlib import Path

# Setup paths
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
SRC_DIR = PROJECT_ROOT / 'src'
DE_TRANSLATIONS = SRC_DIR / 'locales/locales/de.json'
EN_TRANSLATIONS = SRC_DIR / 'locales/locales/en.json'

def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n') # EOF newline

def flatten_keys(obj, prefix=''):
    keys = set()
    if isinstance(obj, dict):
        for key, value in obj.items():
            new_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                keys.update(flatten_keys(value, new_key))
            else:
                keys.add(new_key)
    return keys

def extract_all_strings_from_code():
    """Aggressively extract anything that looks like a string literal from source code"""
    strings = set()

    # Regex for single and double quoted strings
    # Captures content between quotes
    regex = re.compile(r"['\"](.*?)['\"]")

    for root, dirs, files in os.walk(SRC_DIR):
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'build', '.svelte-kit']]

        for file in files:
            # Exclude schema definitions and translation files themselves
            if 'schema.d.ts' in file or 'locales' in root:
                continue

            if file.endswith(('.svelte', '.ts', '.js')):
                filepath = Path(root) / file
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        matches = regex.findall(content)
                        for match in matches:
                            strings.add(match)
                except Exception as e:
                    print(f"Error reading {filepath}: {e}")

    return strings

def prune_dictionary(data, used_keys, prefix=''):
    """
    Recursively remove keys from dictionary if they are not in used_keys.
    Returns: (cleaned_data, count_removed)
    """
    if not isinstance(data, dict):
        return data, 0

    cleaned = {}
    removed_count = 0

    for key, value in data.items():
        full_key = f"{prefix}.{key}" if prefix else key

        if isinstance(value, dict):
            # Recurse
            child_clean, child_removed = prune_dictionary(value, used_keys, full_key)
            # Only keep parent if it has children left
            if child_clean:
                cleaned[key] = child_clean
            removed_count += child_removed
        else:
            # Leaf node: Check if used
            # We check if the exact key is used OR if it's part of a dynamic construction?
            # For safety, we only keep exact matches found in code.
            # Dynamic keys (e.g. `errors.${code}`) are hard.
            # HEURISTIC: If the key is NOT found, we assume it's unused.
            if full_key in used_keys:
                cleaned[key] = value
            else:
                # print(f"Removing: {full_key}")
                removed_count += 1

    return cleaned, removed_count

def main():
    print("--- Translation Cleanup Tool ---")

    # 1. Load keys
    de_data = load_json(DE_TRANSLATIONS)
    en_data = load_json(EN_TRANSLATIONS)

    all_known_keys = flatten_keys(de_data) | flatten_keys(en_data)
    print(f"Total defined keys: {len(all_known_keys)}")

    # 2. Scan code
    found_strings = extract_all_strings_from_code()
    print(f"Found {len(found_strings)} string literals in code.")

    # 3. Intersect
    # We filter found strings to only those that are actual translation keys
    used_keys = all_known_keys.intersection(found_strings)
    print(f"Confirmed active keys (direct match): {len(used_keys)}")

    # 4. Handle Dynamic Keys (Heuristic)
    # Whitelist prefixes that are known to be constructed dynamically
    WHITELIST_PREFIXES = [
        "candlestickPatterns.",
        "settings.profile.subtabs.",
        "journal.deepDive.", # Often iterated
        "marketOverview.", # e.g. "marketOverview.tooltips."
        "bitunixErrors.", # API error codes
        "symbolPicker.volFilter.", # Dynamic keys
        "settings.workspace.",
        "tradeErrors.",
        "apiErrors.",
        "calculator.errors.",
        "journal.days.",
        "settings.visuals.",
        "settings.appearance.",
    ]

    def is_whitelisted(key):
        for prefix in WHITELIST_PREFIXES:
            if key.startswith(prefix):
                return True
        return False

    # Filter unused_keys against whitelist
    unused_keys = {k for k in (all_known_keys - used_keys) if not is_whitelisted(k)}

    # Update used_keys to include whitelisted ones so prune_dictionary keeps them
    effective_used_keys = used_keys | {k for k in all_known_keys if is_whitelisted(k)}

    print(f"Potentially unused keys (after whitelist): {len(unused_keys)}")

    if len(unused_keys) > 0:
        print("\nExamples of unused keys:")
        for k in list(unused_keys)[:10]:
            print(f" - {k}")

    # 5. Execute Cleanup
    print("\nCleaning up...")

    de_clean, de_removed = prune_dictionary(de_data, effective_used_keys)
    en_clean, en_removed = prune_dictionary(en_data, effective_used_keys)

    print(f"Removed {de_removed} keys from DE.")
    print(f"Removed {en_removed} keys from EN.")

    save_json(DE_TRANSLATIONS, de_clean)
    save_json(EN_TRANSLATIONS, en_clean)

    print("\nDone. Please verify manually and run tests!")

if __name__ == '__main__':
    main()
