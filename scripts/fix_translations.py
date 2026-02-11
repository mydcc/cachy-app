import json
import os

EN_PATH = "src/locales/locales/en.json"
DE_PATH = "src/locales/locales/de.json"

EN_ADDITIONS = {
    "settings.performance.tips.title": "Optimization Tips",
    "settings.performance.tipsTitle": "Optimization Tips"
}

DE_ADDITIONS = {
    "settings.performance.tips.title": "Optimierungstipps",
    "settings.performance.tipsTitle": "Optimierungstipps"
}

def update_json(filepath, additions):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    for key, value in additions.items():
        parts = key.split('.')
        current = data
        for i, part in enumerate(parts[:-1]):
            if part not in current:
                current[part] = {}
            current = current[part]
            if not isinstance(current, dict):
                print(f"Conflict at {part} for key {key}. Skipping.")
                break

        last_part = parts[-1]
        if last_part not in current:
            current[last_part] = value
            print(f"Added {key}")

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

print("Updating EN translations...")
update_json(EN_PATH, EN_ADDITIONS)

print("\nUpdating DE translations...")
update_json(DE_PATH, DE_ADDITIONS)
