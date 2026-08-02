# Refactoring TODOs

Dieses Dokument listet die anstehenden Refactoring-Aufgaben auf, um die Codebasis zu verbessern.

## 1. Ordnerstruktur optimieren

- [ ] **UI-Komponenten zentralisieren:** Alle UI-Komponenten aus `src/lib/components` nach `src/components` verschieben und die Ordnerstruktur vereinheitlichen (`inputs`, `results`, `shared`, `layout`).
- [ ] **Stores aufteilen:** Die zentrale `src/lib/stores.ts` in einzelne, thematisch getrennte Store-Dateien unter `src/stores/` aufteilen (z.B. `tradeStore.ts`, `uiStore.ts`, `settingsStore.ts`).
- [ ] **Services auslagern:** Alle Service-Dateien (`apiService.ts`, `modalManager.ts`, `markdownLoader.ts`, `uiManager.ts`) in den `src/services/` Ordner verschieben.
- [ ] **Hilfsfunktionen bündeln:** `utils.ts` und `inputUtils.ts` in den Ordner `src/utils/` verschieben und ggf. zusammenführen.
- [ ] **Assets und Anleitungen verschieben:** Assets (`favicon.svg`) nach `src/assets/` und Markdown-Anleitungen nach `src/instructions/` verschieben.
- [ ] **Lokalisierungsdateien ordnen:** Die i18n-Konfiguration und die Sprachdateien in `src/locales/` bündeln.
- [ ] **Imports anpassen:** Nach allen Verschiebungen die Import-Pfade in der gesamten Anwendung korrigieren. Aliase wie `$lib` oder `$app` prüfen und konsistent verwenden.

## 2. Code konsolidieren und modularisieren

- [ ] **Redundante `stores.ts` entfernen:** Die alte `src/lib/stores.ts` nach dem Aufteilen löschen.
- [ ] **`utils.ts` prüfen:** Auf doppelte oder veraltete Funktionen prüfen und diese zusammenführen oder entfernen.
- [ ] **Komponenten-API vereinheitlichen:** Props und Events der UI-Komponenten prüfen und an einheitliche Konventionen anpassen.
- [ ] **Leere/Redundante Dateien löschen:** Die leeren Dateien `src/services/calculator.ts` und `src/services/calculator.test.ts` wurden bereits entfernt.

## 3. Typisierung verbessern

- [ ] **Fehlende Typen ergänzen:** Alle `any`-Typen durch spezifischere TypeScript-Typen ersetzen.
- [ ] **Globale Typen in `app.d.ts` definieren:** Neue globale Typen, die nach dem Refactoring entstehen, hinzufügen.

## 4. Tests erweitern

- [ ] **Unit-Tests für Stores schreiben:** Für jeden neuen Store separate Unit-Tests erstellen.
- [ ] **Unit-Tests für Hilfsfunktionen schreiben:** Die Funktionen in `src/utils/` mit Tests abdecken.
- [ ] **Komponententests ergänzen:** Wichtige UI-Komponenten isoliert testen.

## 5. Dokumentation aktualisieren

- [ ] **`README.md` anpassen:** Die neue Projektstruktur und die wichtigsten Änderungen beschreiben.
- [ ] **`Svelte-Entwickler.md` ergänzen:** Hinweise zu den neuen Konventionen und Best Practices hinzufügen.
