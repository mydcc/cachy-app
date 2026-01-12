# Cachy Technisches Whitepaper
**Version:** 0.98.0
**Datum:** Januar 2026

---

## Executive Summary

Cachy ist ein hochleistungsfähiger, datenschutzorientierter Krypto-Trading-Begleiter, der entwickelt wurde, um die Lücke zwischen professionellen Trading-Terminals und benutzerfreundlichen Portfolio-Trackern zu schließen. Im Gegensatz zu herkömmlichen Cloud-basierten Plattformen, die sensible Benutzerdaten (API-Schlüssel, Handelshistorie) auf zentralen Servern speichern, setzt Cachy auf eine **Local-First**-Architektur. Dies stellt sicher, dass der Benutzer die absolute Kontrolle über seine Daten behält, während er von Analysen auf institutionellem Niveau, Echtzeit-Risikomanagement und nahtloser Börsenintegration profitiert.

Die Plattform basiert auf einem modernen, reaktiven Tech-Stack (SvelteKit, TailwindCSS, WebSocket), um ein "Desktop-Klasse"-Erlebnis im Browser zu bieten. Sie priorisiert **Kapitalschutz ("Money First")**, **Benutzererfahrung ("User First")** und **Datensouveränität ("Community First")**.

Dieses Dokument dient als umfassendes technisches Handbuch für Entwickler, Investoren und Stakeholder und beschreibt die Systemarchitektur, den mathematischen Kern, die Sicherheitsprotokolle und die zukünftige Skalierbarkeits-Roadmap.

---

## Inhaltsverzeichnis

1. [Produktphilosophie & Grundwerte](#1-produktphilosophie--grundwerte)
2. [Systemarchitektur](#2-systemarchitektur)
3. [Kernlogik & Mathematik ("Das Herzstück")](#3-kernlogik--mathematik-das-herzstück)
4. [Der Trade-Lebenszyklus ("Das Nervensystem")](#4-der-trade-lebenszyklus-das-nervensystem)
5. [Externe Integrationen & Datenfeeds](#5-externe-integrationen--datenfeeds)
6. [Sicherheits- & Datenschutzmodell](#6-sicherheits--datenschutzmodell)
7. [Skalierbarkeit & Zukunfts-Roadmap](#7-skalierbarkeit--zukunfts-roadmap)
8. [Entwickler-Leitfaden](#8-entwickler-leitfaden)

---

## 1. Produktphilosophie & Grundwerte

Cachy wurde nicht als einfach nur ein weiteres Trading-Terminal gebaut; es wurde architektonisch entworfen, um spezifische Schmerzpunkte im Arbeitsablauf von Retail-Tradern zu lösen: Latenz, Komplexität und mangelnde echte Datenhoheit.

### User First: Die "Gedankengeschwindigkeit"-Schnittstelle
Trading-Entscheidungen fallen in Millisekunden. Die Benutzeroberfläche von Cachy ist darauf ausgelegt, die "Time-to-Action" zu reduzieren.
- **Zero-Latency-Interaktion**: Durch die Nutzung der Compile-Time-Reaktivität von Svelte geschehen UI-Updates (z. B. Umschalten eines Charts, Filtern einer Tabelle) sofort ohne Virtual-DOM-Overhead.
- **Kontextsensitive Eingaben**: Das "Trade Setup"-Modul lauscht automatisch über WebSocket auf den Preis des aktiven Symbols und füllt Einstiegspreise vor und berechnet Stop-Losses basierend auf der Echtzeit-Volatilität (ATR).
- **Progressive Web App (PWA)**: Die Anwendung lässt sich nativ auf Desktop und Mobilgeräten installieren und bietet ein "App-ähnliches" Gefühl mit Offline-Funktionen und ohne Browser-Rahmen.

### Money First: Risikomanagement als Bürger erster Klasse
Die meisten Terminals konzentrieren sich auf die *Ausführung* (Kaufen/Verkaufen). Cachy konzentriert sich auf den *Erhalt*.
- **Risikozentrierte Eingabe**: Benutzer geben nicht "Menge zu kaufen" ein. Sie geben "Risikobetrag ($)" ein. Das System berechnet mathematisch rückwärts die korrekte Positionsgröße basierend auf dem Stop-Loss-Abstand.
- **Visualisierte Exponierung**: Chance-Risiko-Verhältnisse werden dynamisch berechnet. Wenn ein Trade das Risikoprofil des Benutzers verletzt (z. B. >3% Risiko), warnt die UI den Benutzer visuell (Rot/Gefahrenzustände).
- **Gebührentransparenz**: Finanzierungsraten und Handelsgebühren sind keine versteckten Fußnoten; sie sind in die Netto-PnL-Berechnungen integriert, um die *wahren* Kosten eines Trades zu zeigen.

### Community First: Das Datenschutz-Manifest
In einer Ära von Datenlecks bezieht Cachy eine radikale Position: **Wir wollen deine Daten nicht.**
- **Keine Benutzerdatenbank**: Es gibt kein "Registrieren"-Formular. Keine E-Mail-Sammlung. Keine Passwortdatenbank, die gehackt werden kann.
- **Lokaler Speicher**: Alle Einstellungen, Handelsjournale und API-Schlüssel werden verschlüsselt oder roh (nach Wahl des Benutzers) im \`localStorage\` des Browsers gespeichert.
- **Transparenter Code**: Die Codebasis ist zur Inspektion offen, was sicherstellt, dass keine "Phone Home"-Telemetrie existiert, die über standardmäßige, nicht-intrusive Analysen (falls aktiviert) hinausgeht.

---

## 2. Systemarchitektur

### Überblick

Cachy operiert als **Monolithisches Frontend mit einem dünnen Proxy-Backend**.

- **Frontend**: Eine umfangreiche Single Page Application (SPA), angetrieben von SvelteKit. Sie handhabt 95% der Logik, einschließlich Datenverarbeitung, Chart-Rendering und Zustandsverwaltung.
- **Backend (Serverless/Node)**: Eine leichtgewichtige API-Proxy-Schicht innerhalb von SvelteKit (\`src/routes/api/\`). Ihr Hauptzweck ist es, Anfragen für Börsen (Bitunix/Binance) sicher zu signieren, ohne API-Geheimnisse an den Client preiszugeben, und KI-gestützte Diagnosen durchzuführen.

### Technologie-Stack

| Schicht | Technologie | Begründung |
|-------|------------|---------------|
| **Framework** | **SvelteKit** | Bietet SSR/CSR-Hybrid, dateibasiertes Routing und überlegene Leistung im Vergleich zu React/Next.js aufgrund des fehlenden Virtual DOM. |
| **Sprache** | **TypeScript** | Strenge Typisierung ist für Finanzanwendungen nicht verhandelbar, um Gleitkommafehler und \`undefined\`-Zustände zu vermeiden. |
| **Styling** | **TailwindCSS** | Utility-First CSS ermöglicht schnelle UI-Iteration und konsistentes Theming (Dunkel/Hell/VIP-Modi). |
| **Zustand** | **Svelte Stores** | Natives, leichtgewichtiges Zustandsmanagement, das gut für Echtzeit-Frequenzdaten skaliert. |
| **Mathe** | **Decimal.js** | IEEE 754 Gleitkomma-Arithmetik (Standard-JS-Zahlen) ist für Finanzen unsicher (z. B. \`0.1 + 0.2 !== 0.3\`). Decimal.js gewährleistet beliebige Genauigkeit. |
| **Charts** | **Chart.js** | Canvas-basiertes Rendering für hochperformante Visualisierungen (Equity-Kurven, Streudiagramme), die Tausende von Datenpunkten verarbeiten können. |
| **Analyse** | **TechnicalIndicators** | Modulare Bibliothek zur clientseitigen Berechnung komplexer Indikatoren (RSI, MACD, ADX). |
| **Testing** | **Vitest** | Blitzschnelles Unit-Testing-Framework, das die Konfiguration mit Vite teilt. |

### Client-seitiges Zustandsmanagement (Das Store-Muster)

Cachy verzichtet auf komplexen Redux/Context-Boilerplate zugunsten von Sveltes reaktiven Stores (\`writable\`, \`derived\`). Der Zustand ist in domänenspezifische Module in \`src/stores/\` unterteilt:

1.  **\`accountStore.ts\`**: Die "Single Source of Truth" für das Wallet des Benutzers.
    -   *Verfolgt*: Offene Positionen, Aktive Orders, Wallet-Guthaben.
    -   *Update-Mechanismus*: Empfängt atomare Updates von WebSockets (\`updatePositionFromWs\`).
2.  **\`marketStore.ts\`**: Hochfrequenz-Marktdaten.
    -   *Verfolgt*: Preise, Finanzierungsraten, Orderbuch-Tiefe.
    -   *Optimierung*: Verwendet eine Dictionary-Map \`Record<string, MarketData>\` für O(1) Zugriffskomplexität bei Preisaktualisierungen.
3.  **\`tradeStore.ts\`**: Das "Reißbrett".
    -   *Verfolgt*: Benutzereingaben für einen *potenziellen* Trade (Einstieg, SL, TP) vor der Ausführung.
    -   *Persistenz*: Synchronisiert automatisch mit \`localStorage\`, sodass Benutzer ihre Arbeit beim Neuladen nicht verlieren.
4.  **\`journalStore.ts\`**: Die Historische Aufzeichnung.
    -   *Verfolgt*: Array von \`JournalEntry\`-Objekten (geschlossene Trades).
    -   *Analytik*: Dient als Rohdatensatz für die \`calculator.ts\` Analyse-Engine.

### KI-gestützte Telemetrie (Jules Service)

Cachy implementiert eine intelligente Diagnoseschicht, bekannt als **Jules API**.

- **Zweck**: Bereitstellung von kontextbezogener Fehleranalyse in Echtzeit, ohne die Privatsphäre der Benutzer zu gefährden.
- **Ablauf**:
    1. Wenn ein kritischer Fehler auftritt (oder bei manueller Meldung), erfasst \`julesService.ts\` einen **System-Snapshot**.
    2. **Bereinigung**: Alle API-Geheimnisse und sensiblen Schlüssel werden auf der Client-Seite vor der Übertragung geschwärzt.
    3. **Analyse**: Der Snapshot wird an das Backend (\`/api/jules\`) gesendet, das den Kontext an ein Large Language Model (Gemini) weiterleitet.
    4. **Ergebnis**: Die KI analysiert den Zustand (z. B. "WebSocket getrennt, während Order ausstehend war") und gibt eine natürlichsprachliche Diagnose an den Benutzer zurück.

### Backend-for-Frontend (BFF) & Proxy-Schicht

Diese Schicht befindet sich in \`src/routes/api/\` und fungiert als Sicherheits-Gateway.

**Das Problem**: Börsen-APIs (Bitunix) erfordern, dass Anfragen mit einem \`API_SECRET\` signiert werden. Wenn wir diese Anfragen vom Browser aus stellen, müssten wir das Geheimnis den DevTools des Benutzers preisgeben.

**Die Lösung**:
1.  Der Client sendet eine Anfrage an \`GET /api/sync/orders\`.
2.  Der Client fügt \`API_KEY\` und \`API_SECRET\` in benutzerdefinierten Headern hinzu (übertragen via HTTPS).
3.  Der Server (Node.js-Kontext) empfängt die Header.
4.  Der Server konstruiert die Payload und generiert die SHA256-Signatur mit dem Geheimnis.
5.  Der Server ruft die Bitunix-API auf.
6.  Der Server gibt das JSON-Ergebnis an den Client zurück.

*Hinweis: Während Geheimnisse vom Client zum Server reisen, ist der Server zustandslos und protokolliert oder speichert sie nicht.*

---

## 3. Kernlogik & Mathematik ("Das Herzstück")

Das mathematische Herz von Cachy befindet sich in \`src/lib/calculator.ts\`. Diese Bibliothek ist dafür verantwortlich, dass jeder auf dem Bildschirm angezeigte Dollar auf den Cent genau ist, unabhängig von Hebelwirkung oder Gebührenstrukturen.

### Präzisionsfinanzwesen (Decimal.js Integration)
In traditionellem JavaScript ergibt \`0.1 + 0.2\` gleich \`0.30000000000000004\`. Dieser "Gleitkomma-Drift" ist im Finanzwesen inakzeptabel. Cachy verwendet die \`Decimal.js\`-Bibliothek, um Zahlen als Objekte mit beliebiger Genauigkeit zu behandeln.

**Die Pipeline**:
\`\`\`typescript
// Jede Eingabe wird sofort konvertiert
const risk = new Decimal(values.accountSize).times(values.riskPercentage).div(100);
// Operationen sind verkettete Methoden
const positionSize = risk.div(entry.minus(sl).abs());
\`\`\`

### Die Risiko-Engine: Ein Konkretes Beispiel

Die meisten Trading-Oberflächen arbeiten vorwärts: *Kaufe 1 BTC -> Was ist mein Risiko?*
Cachy arbeitet rückwärts: *Ich möchte 100 $ riskieren -> Wie viel BTC sollte ich kaufen?*

**Szenario**:
- **Kontogröße**: 10.000 $
- **Risiko pro Trade**: 1% (100 $)
- **Einstiegspreis**: 50.000 $
- **Stop Loss**: 49.000 $ (2% Abstand)

**Berechnungsschritte**:
1.  **Abstand Bestimmen**:
    $$ \Delta = | 50.000 - 49.000 | = 1.000 $$
2.  **Menge Berechnen (Größe)**:
    $$ Qty = \frac{Risiko}{\Delta} = \frac{100}{1.000} = 0,1 \text{ BTC} $$
3.  **Validierung**:
    Wenn der Preis 49.000 $ erreicht, beträgt der Verlust 0,1 \times 1.000 = 100 $. **Die Mathematik stimmt.**
4.  **Hebel-Check**:
    Wert der Position ist 0,1 \times 50.000 = 5.000 $.
    Wenn der Benutzer 10x Hebel hat, Erforderliche Margin = 500 $.
    *Das System validiert, dass 500 $ < Verfügbares Guthaben.*

### Deep Dive Analytik: Trader-Psychologie

Cachy analysiert den \`journalStore\`, um Verhaltensmuster zu finden.

#### 1. Multi-Timeframe ATR Scanning
*Ziel: Was ist die wahre Marktvolatilität gerade jetzt?*
Cachy berechnet nicht nur einen ATR. Es führt einen **Parallelen Scan** der favorisierten Zeitrahmen des Benutzers durch (z. B. 5m, 15m, 1h, 4h).
- **Architektur**: Es verwendet \`Promise.all\`, um Kerzen (Klines) für alle Zeitrahmen gleichzeitig abzurufen und den ATR für jeden zu berechnen.
- **Nutzen**: Der Benutzer sieht eine "Volatilitäts-Matrix" im Trade Setup, die es ihm ermöglicht, einen Stop Loss basierend auf kurzfristigem Rauschen (5m) oder Trendumkehr (4h) zu wählen.

#### 2. Technische Analyse-Engine
*Ziel: Bereitstellung von Standardindikatoren ohne externe Charting-Bibliotheken.*
Der \`technicalsService.ts\` nutzt die \`technicalindicators\`-Bibliothek zur Berechnung von:
- **Oszillatoren**: RSI, Stochastic, CCI, Awesome Oscillator, ADX.
- **Trend**: SMA, EMA, MACD.
- **Pivot Points**: Manuell berechnet aus den High/Low/Close-Werten des Vortages.
Diese Daten werden im **Technicals Panel** visualisiert, einem dedizierten Overlay für schnelle Marktbewertungen.

#### 3. Chronobiologische Analyse (Timing)
*Ziel: Tradest du besser vor dem Mittagessen?*
Das System iteriert durch jeden geschlossenen Trade und gruppiert die PnL nach Tageszeit (Stunde 0-23) und Wochentag (0-6).
- **Implementierung**:
  \`\`\`typescript
  hourlyNetPnl[date.getHours()].plus(trade.pnl);
  \`\`\`
- **Ergebnis**: Eine Heatmap, die "Gefahrenzonen" (z. B. Freitagnachmittage) zeigt, in denen der Trader historisch Geld verliert.

---

## 4. Der Trade-Lebenszyklus ("Das Nervensystem")

Um zu verstehen, wie Cachy funktioniert, verfolgen wir den Lebenszyklus eines einzelnen Trades von der **Idee** bis zur **Historie**.

### Phase 1: Ideation (Die Eingabeschicht)
*Komponente: \`TradeSetupInputs.svelte\`*
1.  **Benutzereingabe**: Benutzer tippt "BTC".
2.  **Unified Analysis Fetch**: Die Komponente ruft \`app.fetchAllAnalysisData()\` auf, was eine koordinierte Datenernte auslöst.
3.  **Parallele Ausführung**:
    - **WebSocket**: Verbindet sich mit dem \`ticker\`-Kanal für Echtzeitpreise.
    - **REST API (Preis)**: Ruft den neuesten Preis-Snapshot ab.
    - **REST API (ATR)**: Ruft 1440 Minuten Kerzenhistorie für den *primären* Zeitrahmen ab.
    - **Multi-ATR Scan**: Ruft gleichzeitig Kerzen für *sekundäre* Zeitrahmen (1h, 4h) im Hintergrund ab.
4.  **Auto-Fill**: Das System verwendet den primären ATR, um einen "sicheren" Stop-Loss-Preis vorzuschlagen (z. B. $Einstieg - 1,5 \times ATR$).

### Phase 2: Ausführung (Die Proxy-Schicht)
*Komponente: \`TradeSetupInputs.svelte\` -> \`apiService.ts\`*
1.  **Benutzeraktion**: Klickt auf "Long".
2.  **Payload-Konstruktion**: Die App bündelt Einstieg, SL, TP und Größe in ein standardisiertes JSON.
3.  **Proxy-Aufruf**: \`POST /api/orders\`.
4.  **Signierung**: Der Node.js-Server signiert die Anfrage mit dem API-Geheimnis des Benutzers.
5.  **Börsenbestätigung**: Bitunix gibt eine Order-ID zurück.

### Phase 3: Überwachung (Die Store-Schicht)
*Komponente: \`PositionsSidebar.svelte\`*
1.  **Socket-Event**: Bitunix sendet ein \`ORDER_UPDATE\` über WebSocket.
2.  **Store-Update**: \`accountStore\` empfängt das Ereignis. Es sieht Status \`FILLED\`.
3.  **Atomare Zustandsänderung**:
    - Die "Pending Order" wird aus \`openOrders\` entfernt.
    - Eine neue "Position" wird in \`positions\` erstellt.
4.  **UI-Render**: Die Seitenleiste animiert die neue Position sofort in den Sichtbereich.

### Phase 4: Schließen & Journalisieren (Die Sync-Schicht)
*Komponente: \`app.ts\` (Sync-Logik)*
1.  **Schließung**: Benutzer klickt auf "Schließen" oder SL wird getroffen.
2.  **Historien-Abruf**: Die App pollt \`get_history_positions\` (für geschlossene Trades) und \`get_pending_positions\` (für Status-Updates).
3.  **Der "Safe Swap"**:
    - Das System erkennt eine Positions-ID in der Historie, die mit einer aktiven ID im \`accountStore\` übereinstimmt.
    - Es "hydratisiert" den Trade mit finalen Daten (Realisierte PnL, Gebühren, Finanzierung).
    - Es verschiebt das Objekt vom \`accountStore\` (Aktiv) in den \`journalStore\` (Historie).
    - Es speichert den neuen Journaleintrag im \`localStorage\`.

---

## 5. Externe Integrationen & Datenfeeds

Cachy zielt darauf ab, börsenunabhängig zu sein, optimiert aber derzeit für **Bitunix** (primär) und **Binance** (sekundär).

### Börsen-Konnektivität

Die Konnektivität wird über die Abstraktionsschicht \`src/services/apiService.ts\` gehandhabt. Dies ermöglicht der UI, \`fetchTicker('BTCUSDT')\` anzufordern, ohne zu wissen, *welche* Börse die Daten liefert.

**Normalisierungsstrategie**:
- Börsen formatieren Daten unterschiedlich (z. B. Bitunix verwendet \`lastPrice`, Binance verwendet \`price`).
- Die Service-Schicht normalisiert alle Antworten in eine Standard-\`Ticker24h\`- oder \`Kline\`-Schnittstelle, bevor Daten an die UI übergeben werden.
- *Spezielle Handhabung*: Bitunix-Futures-Symbole enden oft auf \`.P\` oder \`USDTP\`. Der Normalisierer entfernt diese Suffixe strikt, um saubere UI-Symbole zu erhalten (z. B. \`BTCUSDT\`).

### Hybride Datenstrategie: REST-Polling vs. WebSocket-Streams

Um **Reaktionsfähigkeit** vs. **Ratenbegrenzungen** auszubalancieren, verwendet Cachy einen hybriden Ansatz:

1.  **Initiales Laden (REST)**:
    - Ruft die vollständige Orderhistorie ab (Paginierung unterstützt).
    - Ruft 1440 Minuten Kerzenhistorie ab (für RSI/ATR-Berechnung).
2.  **Echtzeit (WebSocket)**:
    - **Öffentliche Kanäle**: \`ticker\`, \`depth\`, \`trade\`. Verwendet für Charting und Preisaktualisierungen.
    - **Private Kanäle**: \`order\`, \`position\`, \`wallet\`. Verwendet zur Aktualisierung des Benutzer-Dashboards.
    - *Heartbeat-Logik*: Ein "Watchdog"-Timer im \`BitunixWebSocketService\` beendet und startet die Verbindung neu, wenn innerhalb von 20 Sekunden kein "Pong" empfangen wird, was 99,9% Betriebszeit gewährleistet.

### Das "Safe Swap" Synchronisations-Protokoll

Eine kritische Herausforderung bei der Synchronisierung des lokalen Zustands mit dem entfernten API-Zustand besteht darin, Updates ohne "Flackern" oder Datenverlust zu handhaben.

**Die Logik (\`src/services/app.ts\`)**:
1.  **Neue Daten abrufen**: Die App ruft die vollständige Liste der offenen Positionen von der API ab.
2.  **Diffing**: Sie vergleicht die neue Liste mit dem \`accountStore\`.
3.  **Atomarer Tausch**:
    - Wenn eine Position im Store existiert, aber NICHT in der API -> Sie wurde geschlossen. Verschiebe ins Journal.
    - Wenn eine Position in der API existiert, aber NICHT im Store -> Sie wurde remote geöffnet. Füge zum Store hinzu.
    - Wenn in BEIDEN -> Aktualisiere PnL/Margin-Metriken.
    - *Entscheidend*: Dies geschieht in einem \`try/catch\`-Block. Wenn der API-Abruf fehlschlägt, bleibt der lokale Zustand **erhalten** (nicht gelöscht), was den bei anderen Apps üblichen "Null-Guthaben-Schreck" verhindert.

---

## 6. Sicherheits- & Datenschutzmodell

Cachy operiert auf einer **"Trust No One"**-Architektur.

### Local-First Datenspeicherung
- **Mechanismus**: Daten werden im \`localStorage\` gespeichert unter Verwendung der Schlüssel \`cachy_trade_store\` (Entwürfe), \`tradeJournal\` (Historie) und \`cryptoCalculatorSettings\` (Konfiguration).
- **Vorteil**: Selbst wenn der Cachy-Hosting-Server kompromittiert wird oder offline geht, bleiben die Daten des Benutzers sicher auf seinem Gerät.
- **Portabilität**: Benutzer können ihre gesamte Datenbank als JSON/CSV-Datei über die "Backup"-Funktion in den Einstellungen exportieren.

### Zweisprachige Datenportabilität (CSV Import/Export)
Um das "Community First"-Prinzip zu unterstützen, stellt Cachy sicher, dass Benutzerdaten niemals eingeschlossen sind.
- **Universeller Export**: Benutzer können ihr Journal jederzeit als CSV exportieren.
- **Intelligenter Import**: Der \`importFromCSV\`-Service enthält eine zweisprachige Übersetzungsschicht. Er erkennt deutsche Header (z. B. \`Gewinn\`, \`Datum\`) oder englische Header (z. B. \`Profit\`, \`Date\`) und normalisiert sie in die interne Datenstruktur.
- **Medienunterstützung**: Screenshot-URLs und Tags bleiben während des Import/Export-Zyklus erhalten, was sicherstellt, dass keine "weichen Daten" verloren gehen.

### API-Schlüssel-Handhabung & Proxy-Sicherheit
Cachy fungiert als Durchgangsinstanz.
- **Client-seitig**: API-Schlüssel werden im Browser gespeichert. Sie werden *niemals* zur Speicherung an den Cachy-Server gesendet.
- **Übertragung**: Schlüssel werden nur in den HTTP-Headern spezifischer API-Anfragen gesendet.
- **Server-seitig**: Der Node.js-Proxy empfängt die Anfrage, signiert sie mit dem Geheimnis, leitet sie an Bitunix weiter und verwirft die Anmeldeinformationen sofort aus dem Speicher. Es werden keine Protokolle geführt.

### Datenbanklose Architektur
Durch das Entfernen der Datenbank:
1.  **Eliminierung von Angriffsvektoren**: SQL-Injection und Datenbank-Lecks sind unmöglich.
2.  **DSGVO/CCPA-Konformität**: Wir verarbeiten keine Benutzerdaten, daher ist die Konformität per Design automatisch gegeben.

---

## 7. Skalierbarkeit & Zukunfts-Roadmap

Während das aktuelle Local-First-Modell für einzelne Trader robust ist, umfasst die Roadmap die Skalierung zur Unterstützung von Teams und institutionellen Anforderungen.

### Phase 1: Von Local-First zu Sync-Enabled (Optional Cloud)
*Ziel: Benutzern ermöglichen, Daten zwischen Desktop und Mobilgerät zu synchronisieren.*
- **Plan**: Implementierung eines *optionalen* End-to-End-verschlüsselten (E2EE) Cloud-Relays.
- **Tech**: Verwendung einer CRDT (Conflict-free Replicated Data Type) Bibliothek wie Yjs oder Automerge. Der Server würde verschlüsselte Blobs speichern, ohne die Schlüssel zur Entschlüsselung zu haben.

### Phase 2: Mobile Native Adaption
*Ziel: Push in den App Store/Play Store.*
- **Plan**: Wrapping der bestehenden PWA in Capacitor.js.
- **Vorteil**: Zugriff auf native Biometrie (FaceID) zum Entsperren der App und Push-Benachrichtigungen für Preisalarme.

### Phase 3: Institutionelle Funktionen
- **Multi-Account-Management**: Wechseln zwischen Unterkonten.
- **Read-Only-Investorenansicht**: Generierung eines öffentlichen "Nur-Lese"-Links für ein bestimmtes Portfolio (erfordert einen Wechsel zu einer DB-gestützten Architektur für diese spezifischen Benutzer).

---

## 8. Entwickler-Leitfaden

### Einrichtung & Installation
\`\`\`bash
# Repository klonen
git clone https://github.com/mydcc/cachy-app.git

# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten (Localhost:5173)
npm run dev
\`\`\`

### Teststrategie
Cachy verwendet eine rigorose Testsuite mit **Vitest**.
- **Unit-Tests**: Fokus auf \`calculator.ts\`, um mathematische Genauigkeit sicherzustellen.
  \`npm run test:unit\`
- **Verifizierung**: Playwright-Skripte (Python) werden verwendet, um UI-Abläufe auf der Live-Staging-Umgebung zu verifizieren.
  \`python3 verify_pagination.py\`

### Deployment-Pipeline
Der Produktions-Build ist ein Node.js-Adapter-Output.
1.  **Build**: \`npm run build\` (Kompiliert SvelteKit nach \`build/\`)
2.  **Run**: \`node build/index.js\` oder via PM2: \`pm2 start server.js --name "cachy-app"\`
3.  **Reverse Proxy**: Nginx wird empfohlen, um SSL-Terminierung zu handhaben und Traffic an Port 3000 weiterzuleiten.

---

**Ende des Dokuments**
