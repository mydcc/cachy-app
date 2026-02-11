import json
import os

EN_PATH = "src/locales/locales/en.json"
DE_PATH = "src/locales/locales/de.json"

EN_ADDITIONS = {
    "settings.performance.monitor": "Performance Monitor",
    "settings.performance.lastUpdate": "Last update",
    "settings.performance.tips.title": "Optimization Tips",
    "settings.performance.tips.highAnalysisTime": "High analysis time detected. Consider switching to Light or Balanced profile.",
    "settings.performance.tips.highMemory": "High memory usage. Try reducing cache size or closing unused tabs.",
    "settings.performance.tips.highApiCalls": "API rate limit approaching. Consider increasing intervals or disabling news analysis.",
    "settings.performance.tips.lowCacheHit": "Low cache hit rate. Increase market cache size for better performance.",
    "settings.performance.tips.highLatency": "High network latency detected. Check your internet connection.",
    "settings.performance.tips.optimal": "Performance is optimal. You can enable more features or switch to Pro profile.",
    "connection.reconnecting": "Reconnecting...",
    "connection.offline": "OFFLINE - CHECK CONNECTION",
    "sidePanel.cycleMode": "Cycle Mode",
    "sidePanel.smallerFont": "Smaller Font",
    "sidePanel.largerFont": "Larger Font",
    "sidePanel.exportChat": "Export Chat",
    "sidePanel.collapse": "Collapse Panel",
    "sidePanel.expand": "Expand Panel",
    "sidePanel.clearConfirm": "Clear history?",
    "sidePanel.clearHistory": "Clear History",
    "sidePanel.suggestedChanges": "Suggested Changes",
    "sidePanel.thinking": "Thinking...",
    "sidePanel.quotaExceeded": "Generative AI Quota exceeded. Please try again later or check API settings.",
    "common.close": "Close",
    "common.copy": "Copy Content",
    "common.apply": "Apply",
    "common.ignore": "Ignore",
    "common.send": "Send message",
    "cloud.placeholder": "Ask AI..."
}

DE_ADDITIONS = {
    "settings.performance.monitor": "Leistungsüberwachung",
    "settings.performance.lastUpdate": "Letzte Aktualisierung",
    "settings.performance.tips.title": "Optimierungstipps",
    "settings.performance.tips.highAnalysisTime": "Hohe Analysezeit erkannt. Erwägen Sie den Wechsel zum Light- oder Balanced-Profil.",
    "settings.performance.tips.highMemory": "Hoher Speicherverbrauch. Versuchen Sie, die Cache-Größe zu reduzieren oder ungenutzte Tabs zu schließen.",
    "settings.performance.tips.highApiCalls": "API-Ratenlimit nähert sich. Erwägen Sie, Intervalle zu erhöhen oder die Nachrichtenanalyse zu deaktivieren.",
    "settings.performance.tips.lowCacheHit": "Niedrige Cache-Trefferquote. Erhöhen Sie die Markt-Cache-Größe für bessere Leistung.",
    "settings.performance.tips.highLatency": "Hohe Netzwerklatenz erkannt. Überprüfen Sie Ihre Internetverbindung.",
    "settings.performance.tips.optimal": "Leistung ist optimal. Sie können weitere Funktionen aktivieren oder zum Pro-Profil wechseln.",
    "connection.reconnecting": "Verbinde neu...",
    "connection.offline": "OFFLINE - VERBINDUNG PRÜFEN",
    "sidePanel.cycleMode": "Modus wechseln",
    "sidePanel.smallerFont": "Kleinere Schriftart",
    "sidePanel.largerFont": "Größere Schriftart",
    "sidePanel.exportChat": "Chat exportieren",
    "sidePanel.collapse": "Panel einklappen",
    "sidePanel.expand": "Panel ausklappen",
    "sidePanel.clearConfirm": "Verlauf löschen?",
    "sidePanel.clearHistory": "Verlauf löschen",
    "sidePanel.suggestedChanges": "Vorgeschlagene Änderungen",
    "sidePanel.thinking": "Denkt nach...",
    "sidePanel.quotaExceeded": "Generative AI Quota überschritten. Bitte versuchen Sie es später erneut oder überprüfen Sie die API-Einstellungen.",
    "common.close": "Schließen",
    "common.copy": "Inhalt kopieren",
    "common.apply": "Anwenden",
    "common.ignore": "Ignorieren",
    "common.send": "Nachricht senden",
    "cloud.placeholder": "Frage die KI..."
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

            # Special handling: if current[part] is a string, convert to dict with "title"
            if isinstance(current[part], str):
                print(f"Converting string key '{part}' ('{current[part]}') to dict with 'title'")
                current[part] = {"title": current[part]}

            current = current[part]

            if not isinstance(current, dict):
                print(f"Conflict at {part} for key {key} (type {type(current)}). Skipping.")
                break

        last_part = parts[-1]
        if last_part not in current:
            current[last_part] = value
            print(f"Added {key}")
        # else:
            # print(f"Key {key} already exists. Skipping.")

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

print("Updating EN translations...")
update_json(EN_PATH, EN_ADDITIONS)

print("\nUpdating DE translations...")
update_json(DE_PATH, DE_ADDITIONS)
