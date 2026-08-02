# Modulübersicht

Dieses Dokument gibt einen Überblick über die wichtigsten Module in der Anwendung und ihre jeweiligen Aufgaben.

## Kernlogik

- **`src/lib/calculator.ts`**: Enthält die gesamte Geschäftslogik für die Berechnung von Trades, inklusive Positionsgröße, Risiko, Hebel, Gebühren, Take-Profit-Zielen und Performance-Statistiken.

## State Management (Stores)

- **`src/lib/stores.ts`**: Definiert die Svelte-Stores, die den globalen und lokalen Zustand der Anwendung verwalten. Hier werden verschiedene Zustände wie Trade-Parameter, UI-Status und Journaleinträge zentralisiert. (Sollte in einzelne Stores aufgeteilt werden).

## Benutzeroberfläche (UI-Komponenten)

- **`src/lib/components/`**: Beinhaltet eine Sammlung von Svelte-Komponenten, die in der gesamten Anwendung wiederverwendet werden.
  - **`inputs/`**: Komponenten für die Eingabe von Trade-Parametern.
  - **`results/`**: Komponenten zur Anzeige der Berechnungsergebnisse.
  - **`shared/`**: Allgemeine, wiederverwendbare Komponenten wie Buttons, Modals und Tooltips.
- **`src/routes/`**: Definiert die Seitenstruktur der Anwendung mithilfe von SvelteKit-Routing. Jede Datei in diesem Ordner entspricht einer Seite.

## Services

- **`src/lib/apiService.ts`**: Verantwortlich für die Kommunikation mit externen APIs (aktuell ein Platzhalter).
- **`src/lib/modalManager.ts`**: Verwaltet das Öffnen und Schließen von Modals in der Anwendung.
- **`src/lib/markdownLoader.ts`**: Lädt und verarbeitet Markdown-Dateien für die Anzeige von Anleitungen und Changelogs.
- **`src/lib/uiManager.ts`**: Steuert UI-spezifische Logik, die nicht direkt an eine Komponente gebunden ist.

## Hilfsmodule

- **`src/lib/utils.ts`**: Enthält allgemeine Hilfsfunktionen, die an verschiedenen Stellen in der Anwendung genutzt werden.
- **`src/lib/constants.ts`**: Definiert globale Konstanten, wie z.B. Trade-Typen (Long/Short).
- **`src/lib/types/`**: Beinhaltet zentrale TypeScript-Typdefinitionen, die in der gesamten Anwendung verwendet werden.

## Internationalisierung (i18n)

- **`src/lib/i18n.ts`** & **`src/lib/locales/`**: Konfiguration und Sprachdateien für die Mehrsprachigkeit der Anwendung mit `svelte-i18n`.

## Statische Dateien

- **`static/`**: Enthält statische Assets wie Schriftarten und die `robots.txt`.
- **`src/lib/instructions/`**: Markdown-Dateien mit Anleitungen und Changelogs in verschiedenen Sprachen.
