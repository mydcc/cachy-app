#!/usr/bin/env python3

import json
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from audit_translations import extract_i18n_keys_from_code, load_translations, SRC_DIR, DE_TRANSLATIONS, EN_TRANSLATIONS

def delete_key(data, key_path):
    """Delete a key from nested dictionary using dot notation"""
    parts = key_path.split('.')
    current = data

    # Navigate to the parent of the target key
    for i, part in enumerate(parts[:-1]):
        if part in current:
            current = current[part]
        else:
            return # Path doesn't exist

    # Remove the target key
    target = parts[-1]
    if target in current:
        del current[target]
        print(f"Deleted: {key_path}")

        # Clean up empty parent dictionaries recursively
        # This is tricky with a single pass.
        # A simpler approach for cleanup is to prune empty dicts after all deletions.

def prune_empty_dicts(data):
    """Recursively remove empty dictionaries"""
    if not isinstance(data, dict):
        return data

    keys_to_delete = []
    for key, value in data.items():
        if isinstance(value, dict):
            prune_empty_dicts(value)
            if not value: # Empty dict
                keys_to_delete.append(key)

    for key in keys_to_delete:
        del data[key]

    return data

def main():
    print("Starting translation pruning...")

    # 1. Identify used keys
    code_keys = extract_i18n_keys_from_code()
    print(f"Found {len(code_keys)} keys used in code.")

    # Add whitelist for dynamic keys (known patterns)
    # E.g. "candlestickPatterns.*"
    # The audit script already misses them, so we must be careful.
    # If the audit script marked them as unused, we might delete them.
    # However, Phase 2 already fixed missing keys.
    # But if code constructs keys like `candlestickPatterns.${id}.name`, the static analyzer won't find `candlestickPatterns.doji.name`.

    # WHITELIST STRATEGY:
    # We will exclude broad categories known to be dynamic from pruning.

    whitelist_prefixes = [
        "candlestickPatterns.",
        "bitunixErrors.",
        "apiErrors.",
        "settings.visuals.", # Often dynamic
        "dashboard.orderHistory.", # Dynamic enum mapping
        "analyst.", # Dynamic
        "journal.deepDive.",
        "journal.days.",
    ]

    # 2. Process Files
    for filepath in [EN_TRANSLATIONS, DE_TRANSLATIONS]:
        print(f"\nProcessing {filepath}...")

        # Load raw data to modify
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Load flattened data to check against code_keys
        flat, _ = load_translations(filepath)
        print(f"Total keys in JSON: {len(flat)}")

        keys_to_remove = []
        for key in flat.keys():
            if key not in code_keys:
                # Check whitelist
                is_whitelisted = False
                for prefix in whitelist_prefixes:
                    if key.startswith(prefix):
                        is_whitelisted = True
                        break

                if not is_whitelisted:
                    keys_to_remove.append(key)

        print(f"Found {len(keys_to_remove)} unused keys to remove.")

        # Remove keys
        for key in keys_to_remove:
            delete_key(data, key)

        # Clean up empty containers
        prune_empty_dicts(data)

        # Save
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print("\nPruning complete.")

if __name__ == "__main__":
    main()
