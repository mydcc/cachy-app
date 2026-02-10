import json
import os

files = {
    "src/locales/locales/en.json": {
        "header": "Trade Targets",
        "entry": "Entry",
        "sl": "SL",
        "tp": "TP",
        "riskUnit": "R"
    },
    "src/locales/locales/de.json": {
        "header": "Handelsziele",
        "entry": "Einstieg",
        "sl": "SL",
        "tp": "TP",
        "riskUnit": "R"
    }
}

for filepath, values in files.items():
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        continue

    with open(filepath, 'r') as f:
        data = json.load(f)

    if "dashboard" not in data:
        data["dashboard"] = {}

    if "visualBar" not in data["dashboard"]:
        data["dashboard"]["visualBar"] = {}

    # Update keys
    for k, v in values.items():
        data["dashboard"]["visualBar"][k] = v

    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Updated {filepath}")
