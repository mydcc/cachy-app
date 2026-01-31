_<feedback@cachy.app>_

bc1qgrm2kvs27rfkpwtgp5u7w0rlzkgwrxqtls2q4f

---

# Changelog

### Inhaltsverzeichnis

1. [Version 0.94.3](#v0.94.3)
2. [Version 0.94.2](#v0.94.2)
3. [Version 0.94.1](#v0.94.1)
4. [Version 0.94.0](#v0.94.0)
5. [Version 0.93.0](#v0.93.0)
6. [Version 0.92.2](#v0.92.2)
7. [Version 0.92.1](#v0.92.1)
8. [Version 0.92.0](#v0.92.0)

---

## <a name="v0.94.3"></a>Version 0.94.3 (Januar 2026)

- **RSS-Feed-Integration**: Benutzer können nun bis zu 5 eigene RSS-URLs hinzufügen und aus kuratierten Krypto-News-Quellen (CoinDesk, Cointelegraph, etc.) wählen, um den KI-Kontext zu erweitern.
- **Strikte Symbol-Filterung**: Neue Einstellung zum Filtern von RSS-News basierend auf dem aktiven Chart-Symbol (z.B. nur XRP/Ripple-News anzeigen, wenn XRP ausgewählt ist).
- **Automatische Cache-Leerung**: Änderungen an den RSS-Einstellungen löschen automatisch den News-Cache für sofortige Aktualisierungen.
- **Barrierefreiheit**: Verbesserte Interaktion und Beschriftung im Reiter "Integrationen".

---

## <a name="v0.94.2"></a>Version 0.94.2 (Januar 2026)

- **Kontext-Aware KI**: Der KI-Assistent hat jetzt Zugriff auf Echtzeit-Marktkontext:
  - **News Integration**: Ruft Sentiment von CryptoPanic und NewsAPI über einen sicheren Proxy ab.
  - **CoinMarketCap**: Greift auf fundamentale Daten (Marktkapitalisierung, Volumen) für bessere Analysen zu.
  - **Trade Historie**: Kann deine letzten Trades überprüfen, um Verhaltens-Coaching zu geben.
- **UI/Lokalisierung**: Fehlende Übersetzungsschlüssel für Backup-Passwortabfragen und Integrationseinstellungen behoben.
- **Performance**: Blockierende WASM-Initialisierung für technische Indikatoren entfernt und auf eine leichtgewichtige JS-Implementierung umgestellt.
- **Architektur:** **Globales Subscription-Management**: Einführung des `MarketWatcher` Dienstes zur Zentralisierung aller WebSocket-Abonnements.
- **System:** **Reference Counting**: Intelligente Zählung von Daten-Anfragen zur Vermeidung von Verbindungsabbrüchen bei mehreren gleichzeitig geöffneten Panels.
- **Robustheit:** **Symbol-Normalisierung**: Konsistente Handhabung von Symbol-Suffixen (`.P`, `:USDT`) für stabilere Datenzuordnung zwischen API und UI.
- **Fix:** **Technicals-Stabilität**: Behebung von Einfrier-Problemen beim schnellen Wechsel zwischen Trading-Paaren im Technicals Panel.
- **Neu:** **Einstellung "Debug-Modus"**: Zuschaltbare detaillierte System-Logs in der Browser-Konsole für verbesserte Fehlerdiagnose.
- **Verbesserung:** **Echtzeit-Indikatoren**: Direkte Anbindung der RSI- und Technik-Berechnungen an den internen Markt-Store für schnellere Updates.

## <a name="v0.94.1"></a>Version 0.94.1 (Januar 2026)

- **Neu:** **Technicals Panel**: Erweitertes Chart-Overlay mit RSI, MACD, Stochastic und Auto-Pivots.
- **Neu:** **Chat / Side Panel**: Einklappbare Seitenleiste für private Notizen oder globalen Chat (erfordert API).

---

## <a name="v0.94.0"></a>Version 0.94.0 (Januar 2026)

- **Neu:** Websocket-Integration für Bitunix (Echtzeit-Preise, Orderbuch, Ticker).
- **Neu:** Performance Tracking: Erweiterte Diagramme und Deep Dive Analysen im Journal.
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
- **Neu:** Automatisches Abrufen des Preises beim Start (aktivierbar in den Einstellungen).
- **Neu:** Automatisches Abrufen der ATR beim Start (aktivierbar in den Einstellungen).
- **Neu:** Automatisches Update des Preises bei Eingabe (optional).
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
