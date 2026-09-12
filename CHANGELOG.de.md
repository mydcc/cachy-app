# Changelog

Alle nutzerrelevanten Änderungen an Cachy, ab Version 1.0.0 pro Release von
Hand gepflegt. Jeder Eintrag wird gegen den Release-Diff und den aktuellen Code
geprüft; kleinere Fixes ohne Nutzerwirkung entfallen bewusst. Die vollständige
Commit-Historie bleibt in Git erhalten.

## [1.6.0](https://github.com/mydcc/cachy-app/compare/v1.5.0...v1.6.0) (unreleased)

### Hinzugefügt

- Super-Alert: Alerts ziehen in ein Seitenpanel um, angetrieben von einer
  Regel-Engine, die bei jedem Kerzenschluss neu auswertet — der alte Dialog und
  die alte Engine entfallen.
- Alert-Bedingungen lassen sich auf Indikatoren und Candlestick-Mustern bauen,
  nicht nur auf ein einzelnes Kursziel, und direkt aus dem Chart heraus anlegen.
- Regeln kombinieren mehr Operanden — Volumen, Bollinger-Bandbreite und einen
  Fenster-Operanden —, sodass Squeeze- und Divergenz-Setups in eine Bedingung
  passen.
- Alerts erhalten Frequenz, Gültigkeitsdauer und Notiz pro Regel, dazu einen
  Sound-Kanal und konfigurierbare externe Kanäle; Auslösungen werden von einem
  echten Sink angekündigt, gezählt und ausgemustert.
- Benannte Exchange-Konten: mehrere Konten pro Börse, mit jederzeit sichtbarem
  aktivem Konto.
- Offene Positionen verwalten, ohne das Trade-Panel zu verlassen: Position
  aufstocken mit Average-Entry-Vorschau, teilweise schließen und Hebel- oder
  Margin-Modus ändern.
- Bracket-TP/SL auf Pending-Orders und ein Entry mit angehängtem TP/SL, eine
  Break-Even-Linie, eine Warnung bei ungeschützter Position und eine Chart-Linie
  für ruhende (unausgeführte) Limit-Orders.
- Verschiebbare TP/SL-Linien im Chart und ein TP/SL-Bereichsregler mit PnL-,
  ROI- und Change-Modus.
- Maker-/Taker-Gebühren werden aus echten Broker-Fills abgeleitet und sind pro
  Venue editierbar.
- Order-Historie lässt sich nach Zeitraum filtern und blättern; Orders werden
  gegen die Trading-Pair-Metadaten validiert, bevor sie rausgehen.
- Funding-Rate-Historie und 24-Stunden-Haltekosten für Bitunix-Positionen.
- Benachrichtigungen bei Order-Fills, Rejections und Cancels.
- Paper-Trading-Modus, konfigurierbare Risikolimits und ein Kill-Switch für den
  Ausführungspfad.
- Journal-Überarbeitung: fixierte Spalten, Gebührenaufschlüsselung und
  Analytics-Drawer.
- Chart und Indikatoren: Indikator-Panes mit Labels, MFI-Subpane,
  Pivots-Overlay, Ichimoku-Spanne, Chart-Settings-Tab und einklappbare
  Subpanes.
- Automatische lokale Backups via OPFS mit Wiederherstellungsdialog, plus
  regelmäßige Snapshots auf der Festplatte.
- Trading Academy auf Englisch sowie ein interaktiver Onboarding-Rundgang mit
  3D-Enten-Begleiter.
- Eigene Base-URL für jeden AI-Provider.

### Geändert

- Jede Börse liegt hinter einer einheitlichen Adapter-Schnittstelle mit
  Fähigkeitsmodell, sodass eine nicht unterstützte Order abgelehnt wird, bevor
  sie den Client verlässt.
- Order-Platzierung ist durchgängig gehärtet: ein Verifikations-Gate vor dem
  Absenden, native Cancel- und Close-Endpunkte sowie TP/SL, Time-in-Force und
  eine Client-Order-ID bei Bitunix-Orders.
- Layout-Tokens, gemeinsame Komponentenklassen und Core-Utilities steuern jetzt
  das Theming, sodass eine Theme-Änderung an einer Stelle landet.
- Start und Hot-Paths wurden schneller: Chart, Trade Flow und 3D-Hintergründe
  laden lazy, und WASM-Mathe sowie der Market-Store allokieren weniger.

### Behoben

- Exchange-API-Schlüssel werden mit dem Device-Key verschlüsselt abgelegt;
  Backup-Exporte enthalten keine Klartext-Zugangsdaten mehr.
- SSRF-Schutz über die Proxy-Routen gehärtet: gemeinsame URL-Validierung, Schutz
  gegen kodierte Hosts und DNS-Rebinding sowie Ablehnung reservierter IPs.
- Security-Header und eine strengere Content-Security-Policy gelten jetzt
  global, auch für statische Assets.
- AI-Funktionen benötigen ausdrückliche Zustimmung, bevor Trade-Kontext gesendet
  wird, und schlagen im lokalen Modus geschlossen fehl; Telemetrie ist Opt-in.
- Order-Korrektheit: Die Menge wird auf den Symbol-Step begrenzt, der Order-Typ
  erreicht Bitunix, und der Stop-Schutz wird am TP/SL der Position erneut
  versucht.
- Live-Daten sind robuster: Exchange-Sockets reconnecten nicht mehr in Schleifen
  und leaken keine Listener, ein Moduswechsel wird zurückgelesen, bis die Börse
  ihn bestätigt, und überlappende Reads lassen keine veraltete Antwort mehr
  gewinnen.
- Chart-Kerzen-Freezes und die Reload-Schleife der Market Overview sind behoben;
  die App erholt sich von einem veralteten Deployment, statt an fehlenden Chunks
  zu scheitern.

## [1.5.0](https://github.com/mydcc/cachy-app/compare/v1.4.0...v1.5.0) (2026-08-12)

### Behoben

- API-Schlüssel landen bei einem News-Feed-Fehler nicht mehr in den Error-Logs.
- Market-Overview-Icons werden vor dem Rendern bereinigt (DOMPurify).
- Die Symbolsuche springt nicht mehr zurück, wenn sie im fokussierten Zustand
  geleert wird.
- Die Order-Block-Auswertung nutzt wieder die korrekte Mitigationsreihenfolge.

### Geändert

- Das Laden der Marktdaten ist pro Symbol gebündelt, sodass Charts und
  Reparaturen weniger API-Aufrufe auslösen und schneller erholen.
- Security-Policy (`SECURITY.md`) veröffentlicht.

## [1.4.0](https://github.com/mydcc/cachy-app/compare/v1.3.0...v1.4.0) (2026-08-12)

### Hinzugefügt

- Lokale Preis-Alert-Engine: Alerts werden auf dem Gerät ausgewertet.

### Behoben

- Fehlende Security-Header werden wieder ausgeliefert.
- Screenreader-Labels sind übersetzt statt hardcodiert.

### Geändert

- Schnelleres Rendering durch weniger Allokationen in Render-Pfaden.

## [1.3.0](https://github.com/mydcc/cachy-app/compare/v1.2.0...v1.3.0) (2026-08-11)

### Hinzugefügt

- Offene Positionen zeigen Margin-Rate und realisierten PnL.
- Read-only Hebel, Margin-Modus, Symbol- und Tier-Daten für Bitunix.
- Beschreibende Tooltips für die Trade-Flow-Einstellungen.

### Behoben

- Unrealisierter PnL wird aus dem Live-Mark-Preis neu berechnet.
- Der Choppiness-Indikator liest das Feld, das die UI anzeigt.
- Balance-Refreshes löschen keine Wallet-Felder mehr.

## [1.2.0](https://github.com/mydcc/cachy-app/compare/v1.1.1...v1.2.0) (2026-08-09)

### Hinzugefügt

- Trading Academy läuft als eigenes Fenster, mit Mobil- und Quiz-Fixes.
- Assistant-Fenster ersetzt das Seitenpanel; alle schwebenden Oberflächen teilen
  eine Ebenen-Reihenfolge.
- AI-Assistent: neue Trade-Panel-Aktionen, institutionelles Risk-Audit und
  Ollama/OpenRouter-Provider.
- Order-Historie zeigt ReduceOnly-Flags und Gesamtpositionsgröße.

### Geändert

- Positionen, Orders und Konto teilen einen Live-Store, was Cancel-/Close-Fehler
  behebt.

### Behoben

- Positions-Handling überarbeitet: Live-Mark-Preis, HEDGE-Mode-Closes und
  korrekte Funding-Rates (inkl. 100x-Anzeigefehler und REST-Bezug).
- Öffentliche Nutzung ohne geteiltes Secret via selbst ausgegebener
  Client-Tokens.
- Fenster-Drag, Restore und Maximize auf Touch und Desktop.

## [1.1.1](https://github.com/mydcc/cachy-app/compare/v1.1.0...v1.1.1) (2026-08-02)

Keine nutzerrelevanten Änderungen (nur Release-Automatisierung).

## [1.1.0](https://github.com/mydcc/cachy-app/compare/v1.0.2...v1.1.0) (2026-08-02)

### Hinzugefügt

- AI-Assistent entdeckt Modelle live und unterstützt Ollama und OpenRouter.

### Behoben

- Bitget-Echtzeitdaten werden auf das normalisiert, was die Konto-Ansichten
  erwarten.
- Selbst gehostete Deploys: Health-Checks und Startkommando-Handling.

## [1.0.2](https://github.com/mydcc/cachy-app/compare/v1.0.1...v1.0.2) (2026-08-02)

### Behoben

- Signierte API-Anfragen überstehen Unlock-Verzögerungen und vergessene
  Server-Tokens.
- Aktuelle Orders werden nicht mehr von veralteten Daten überschrieben.
- Numerische Preise werden mit voller Dezimalpräzision behandelt.
- Presets akzeptieren ältere Gebührenformate statt an der Validierung zu
  scheitern.

## [1.0.1](https://github.com/mydcc/cachy-app/compare/v1.0.0...v1.0.1) (2026-08-01)

### Behoben

- Market-Tiles bleiben nicht mehr leer bis zum Klick (Startup-Race).
- Marktdaten-Reads nutzen eine kanonische Quelle unabhängig vom Provider.

## 1.0.0 (2026-08-01)

Erstes Stable-Release: Positionsgrößen-Rechner mit Technikals, Trade-Journal mit
Analytics, Trading Academy, AI-Assistent, Bitunix/Bitget-Marktdaten und
installierbare PWA.
