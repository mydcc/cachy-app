_<feedback@cachy.app>_

bc1qgrm2kvs27rfkpwtgp5u7w0rlzkgwrxqtls2q4f

---

# Changelog

### Inhaltsverzeichnis

1. [Version 0.94.2](#v0.94.2)
2. [Version 0.94.1](#v0.94.1)
3. [Version 0.94.0](#v0.94.0)
4. [Version 0.93.0](#v0.93.0)
5. [Version 0.92.2](#v0.92.2)
6. [Version 0.92.1](#v0.92.1)
7. [Version 0.92.0](#v0.92.0)

---

## <a name="v0.94.2"></a>Version 0.94.2 (Januar 2026)

- **Architektur:** **Globales Subscription-Management**: Einführung des `MarketWatcher` Dienstes zur Zentralisierung aller WebSocket-Abonnements.
- **System:** **Reference Counting**: Intelligente Zählung von Daten-Anfragen zur Vermeidung von Verbindungsabbrüchen bei mehreren gleichzeitig geöffneten Panels.
- **Robustheit:** **Symbol-Normalisierung**: Konsistente Handhabung von Symbol-Suffixen (`.P`, `:USDT`) für stabilere Datenzuordnung zwischen API und UI.
- **Fix:** **Technicals-Stabilität**: Behebung von Einfrier-Problemen beim schnellen Wechsel zwischen Trading-Paaren im Technicals Panel.
- **Neu:** **Einstellung "Debug-Modus"**: Zuschaltbare detaillierte System-Logs in der Browser-Konsole für verbesserte Fehlerdiagnose.
- **Verbesserung:** **Echtzeit-Indikatoren**: Direkte Anbindung der RSI- und Technik-Berechnungen an den internen Markt-Store für schnellere Updates.

## <a name="v0.94.1"></a>Version 0.94.1 (Januar 2026)

- **Neu:** **Jules API**: Intelligentes KI-gestütztes Fehleranalyse- und Berichtssystem für sofortige Diagnosen.
- **Neu:** **Technicals Panel**: Erweitertes Chart-Overlay mit RSI, MACD, Stochastic und Auto-Pivots.
- **Upgrade:** **Präzisere Indikatorberechnungen**: Migration zu `talib-web` (WebAssembly) für exakte Übereinstimmung mit TradingView. Alle technischen Indikatoren (RSI, Stochastic, CCI, ADX, MACD, Momentum, EMA) verwenden jetzt die gleichen Algorithmen wie professionelle Trading-Plattformen.
- **Neu:** **Chat / Side Panel**: Einklappbare Seitenleiste für private Notizen oder globalen Chat (erfordert experimentelle API).
- **Architektur:** Verbesserter "Jules Service" für sichere System-Snapshots und Telemetrie ohne Beeinträchtigung der Privatsphäre.

---

## <a name="v0.94.0"></a>Version 0.94.0 (Januar 2026)

- **Neu:** Websocket-Integration für Bitunix (Echtzeit-Preise, Orderbuch, Ticker).
- **Neu:** Performance Tracking (Pro): Erweiterte Diagramme und Deep Dive Analysen im Journal.
- **Neu:** Marktübersicht & Sidebar: Verbessertes Layout mit Echtzeitdaten und Favoriten.
- **Neu:** Einstellung "Side Panel" unter Einstellungen -> Sidebar. Wähle zwischen "Privaten Notizen" (nur lokaler Speicher) oder "Globaler Chat".
- **Verbesserungen:** Allgemeine Stabilitätsupdates und Anpassungen der Benutzeroberfläche.

---

## <a name="v0.93.0"></a>Version 0.93.0 (21. Dezember 2025)

- **Neu:** Einstellung "Seitenleisten anzeigen": Blende die Seitenleiste (Favoriten) und Marktübersicht aus, um Platz zu sparen (Desktop & Mobil).
- **Verbesserung:** Optimiertes mobiles Layout mit integrierter Positionsansicht.
- **Fix:** Korrektur bei der Berechnung "Offener Positionen" für Bitunix (Fehlerbehebung beim 'Side'-Parameter).
- **System:** Verbesserte interne Datenstruktur für Einstellungen und API-Keys.
- **Neu:** Backup & Wiederherstellung: Erstelle Backups deiner Daten (Einstellungen, Journal, Presets) und stelle sie bei Bedarf wieder her.
- **Verbesserung:** Eingabe für "Risiko/Trade" unterstützt jetzt bis zu 2 Nachkommastellen.
- **Verbesserung:** Allgemeine Stabilitätsverbesserungen.
- **Neu:** Favoriten-Funktion: Speichere bis zu 4 Symbole durch Klick auf das Stern-Symbol in der Marktübersicht. Favoriten werden in der Sidebar (Desktop) oder mobil unter der Hauptkarte angezeigt.
- **Neu:** Automatisches Abrufen des Kontostands beim Start (aktivierbar in den Einstellungen, erfordert API-Keys).
- **Neu:** Automatische Preisaktualisierung im Eingabefeld (optional).
- **Fix:** Behebung von Deployment-Problemen (502 Fehler) und verbesserte Stabilität.

---

## <a name="v0.92.2"></a>Version 0.92.2 (11. Dezember 2025)

- **Neu:** "Marktübersicht" (Market Overview) zeigt 24h-Daten (Preis, Volumen, Änderung) für das aktuelle Symbol an.
- **Neu:** Einstellungen erweitert: Auswahl des API-Anbieters (Bitunix/Binance) und Intervall für Marktdaten-Updates (1s, 1m, 10m).

---

## <a name="v0.92.1"></a>Version 0.92.1 (04. September 2025)

- **Neu:** Automatischer ATR-Abruf von der Binance-API mit wählbarem Zeitrahmen (5m, 15m, 1h, 4h, 1d). Der abgerufene Wert kann manuell angepasst werden.
- **Neu:** Erweiterte Sperr-Funktionen: Der Risikobetrag in Währung kann jetzt gesperrt werden, um die Positionsgröße und das Risiko in % zu berechnen.
- **Neu:** Tastaturkürzel (`Alt+L/S/R/J`) für schnellere Bedienung hinzugefügt.
- **Neu:** Modalfenster können jetzt mit der `Escape`-Taste oder per Klick auf den Hintergrund geschlossen werden.

---

## <a name="v0.92.0"></a>Version 0.92.0 (22. August 2025)

- **Verbesserung:** Eingabefeld für Symbol akzeptiert jetzt Buchstaben und Zahlen.
- **Behoben:** Rand der Tooltips ist jetzt themenabhängig und das Problem des doppelten Randes wurde behoben.
- **Verbesserung:** Buttons "Trade zum Journal hinzufügen" und "Anleitung anzeigen" sind jetzt themenabhängig.
