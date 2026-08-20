---
id: IDEA-0199
title: Bitunix UI-Analyse & Umfangs-Beschreibung
type: idea
status: done
priority: P3
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [IDEA-0191]
start_date: 2026-08-15
target_date: 2026-08-15
size: S
estimate: 2
---


# Bitunix UI-Analyse & Umfangs-Beschreibung

Diese Übersicht fasst alle Datenfelder, Wörter, Einstellmöglichkeiten und UI-Elemente zusammen, die aus den Bitunix Referenz-Screenshots extrahiert wurden. Sie dient als Grundlage für die Planung des eigenen UIs, um sicherzustellen, dass alle relevanten Informationen und Funktionen abgedeckt sind.

## 1. Trade Panel (Haupt-Trading-Interface)

Das Trade Panel ist das Herzstück zur Order-Eingabe und bietet vielfältige Ordertypen und Parameter.

### 1.1 Ordertypen (Tabs / Dropdown-Menüs)
- **Limit**
- **Market**
- **Trigger** (Oft unterteilt in Trigger Limit / Trigger Market)
- **Post-Only** (Garantiert, dass die Order ins Orderbuch geht und nicht sofort ausführt)
- **Scaled Order** (Gestaffelte Orders)
- **Trailing Stop**
- **Fixed-Risk** (Risikobasierte Order-Berechnung)
- **Grid** (Future Grid Trading / Bot-Trading)

### 1.2 Order-Eingabefelder & Steuerung
- **Price**: Eingabefeld für den Preis (z. B. in USDT).
- **Qty / Size / Value**: Menge, Größe oder Wert. Oft begleitet von einem Prozent-Slider (z. B. 0%, 25%, 50%, 75%, 100%).
- **TP/SL (Take Profit / Stop Loss)**:
  - Checkbox zur Aktivierung.
  - **TP Price** / **SL Price** Eingabefelder.
  - Dropdown für Trigger-Typ: **Mark** (Marktpreis), **Index** (Indexpreis), **Last** (Letzter gehandelter Preis).
- **Reduce-Only**: Checkbox (Nur Reduzierung der aktuellen Position).
- **Margin Mode**: Toggle zwischen **Cross** und **Isolated** Margin.
- **Leverage (Hebel)**: Slider oder Eingabe (z. B. von 1x bis 125x).
- **Available Balance**: Anzeige des verfügbaren Guthabens (z. B. in USDT).

### 1.3 Aktions-Buttons
- **Buy / Long** (Grün): Beinhaltet oft den Zusatztext für "Cost" (Kosten in USDT).
- **Sell / Short** (Rot): Beinhaltet ebenfalls den Zusatztext für "Cost".

---

## 2. Positionen & Historie (Unterer Bildschirmbereich)

Dieser Bereich listet aktive Trades und historische Daten auf.

### 2.1 Tab-Navigation
- **Positions** (Aktive Positionen)
- **Open Orders** (Offene / Ausstehende Orders)
- **Order History** (Order-Historie)
- **Trade History** (Trade-Historie)
- **Transaction History** (Transaktions-Historie)
- **Assets** (Übersicht der Vermögenswerte)

### 2.2 Datenfelder & Spalten (Tab: Positions)
- **Symbol**: Z. B. "BTCUSDT 125x".
- **Size**: Positionsgröße.
- **Entry Price**: Durchschnittlicher Einstiegspreis.
- **Mark Price**: Aktueller Marktpreis.
- **Liq. Price (Liquidation Price)**: Geschätzter Liquidationspreis.
- **Margin Ratio**: Auslastung der Margin (in Prozent).
- **Margin**: Eingesetzte Margin (mit "+ / -" Buttons zum Hinzufügen oder Reduzieren).
- **PNL (ROE%)**: Unrealisierter Gewinn/Verlust (Profit and Loss) und Return on Equity in Prozent.
- **TP/SL**: Anzeige der gesetzten Ziele, inklusive Stift-Icon zum schnellen Bearbeiten.

### 2.3 Aktionen auf Positionsebene
- **Reverse**: Button, um die Position direkt umzukehren (z. B. von Long auf Short in gleicher Größe).
- **Close (Limit / Market)**: Buttons zur Teil- oder Komplettschließung zu einem bestimmten Preis oder Marktpreis.
- **Close All**: Alle offenen Positionen sofort schließen.

---

## 3. Konfigurationen & Einstellungen (Configs Dialog)

Ein modales Fenster zur Anpassung der Trading-Umgebung und Logik.

### 3.1 Hauptmenü (Linke Seitenleiste)
- **Chart Style** (Chart-Darstellung)
- **Trading** (Handelseinstellungen)
- **Confirmation** (Bestätigungs-Dialoge)
- **Layout** (UI-Anordnung)
- **Alert Configuration** (Alarm-Einstellungen)
- **Notification** (Benachrichtigungen)
- **Display** (Anzeigeoptionen)
- **Trading View** (Chart-Integration)

### 3.2 Untermenü: Trading (Reiter)
- **Margin Mode**:
  - **Cross**: "Shared Margin Pool" → Margin wird zwischen Positionen (Position A, Position B) geteilt.
  - **Isolated**: Getrennte Margin pro Position (Margin A für Position A, Margin B für Position B).
  - Checkbox: "Apply to all pairs" (Auf alle Handelspaare anwenden).
  - **Multi-Trade**: Toggle (On/Off). Hinweis-Text: *"Multi-Trade can be switched anytime without closing positions; it only affects new orders."*
- **Asset Mode**:
  - **Single-Asset**: z. B. USDT wird nur für USDT-M Contracts genutzt. USDC nur für USDC-M Contracts.
  - **Multi-Assets**: Bündelt verschiedene Assets (BTC, ETH, USDT) in einen **Margin Pool**, der dann für USDT-M, USDC-M und Coin-M Contracts verwendet werden kann.
- **Position Mode**:
  - **One-Way Mode** (Nur eine Richtung pro Handelspaar).
  - **Hedge Mode** (Long und Short gleichzeitig auf dem selben Handelspaar möglich).
- **Contract Unit**: Einstellung der Kontrakteinheit (Menge oder Krypto-Wert).

---

## 4. Bestätigungs-Dialoge (Confirmations)

Popups, die vor einer finalen Aktion angezeigt werden, um Fehler zu vermeiden.

### 4.1 Confirm Futures Order
- Angezeigte Felder: **Symbol, Type (z.B. Limit), Direction (Long/Short), Price, Amount, Cost, Leverage, Margin, TP/SL**.
- Option: **"Don't prompt next time"** (Zukünftig nicht mehr nachfragen).
- Buttons: **Cancel**, **Confirm**.

### 4.2 Confirm Chart Order
- Wird ausgelöst, wenn Orders im Chart verschoben (Drag & Drop) oder direkt im Chart platziert werden.
- Zeigt den neuen Preis an.

### 4.3 Fixed Risk Confirmation
- Zeigt das berechnete Risiko, die Menge und den potenziellen Verlust an, bevor eine Fixed-Risk-Order platziert wird.

---

## 5. Alerts & Notifications (Benachrichtigungen)

### 5.1 Alert Configuration
- **Price Alert** (Benachrichtigung bei Erreichen eines Preisniveaus).
- **24H Price Change** (Benachrichtigung bei starken prozentualen Schwankungen).
- **Funding Rate** (Hinweise auf anstehende Funding-Gebühren).
- Zustellungsmöglichkeiten: App Push, Sound, In-App-Popup.

### 5.2 System Notifications
- Popups/Snackbars (oft oben rechts) für Statusmeldungen:
  - *"Order Filled"* (Order ausgeführt)
  - *"Order Placed"* (Order platziert)
  - *"Order Canceled"* (Order storniert)

---

## 6. Analyse & Umfangsabgleich (Gap Analysis gegenüber M3 Specs)

Basierend auf den extrahierten UI-Elementen und den vorliegenden M3-Spezifikationen (FEAT-0021 bis FEAT-0026) ergeben sich folgende Beobachtungen für die UI-Planung:

1. **Ordertypen-Erweiterung**: M3 definiert primär Limit, Market, Trigger (Stop-Loss/Take-Profit) und Fixed-Risk. Bitunix bietet zusätzlich spezifische UI-Flows für **Post-Only**, **Scaled Order**, **Trailing Stop** und **Grid**. Diese müssen im UI-Design als Platzhalter oder Tabs bedacht werden, auch wenn die Backend-Logik später folgt.
2. **Einstellungen**: Die Komplexität der **Configs** (Cross vs. Isolated Margin, Single-Asset vs. Multi-Assets, One-Way vs. Hedge Mode, Multi-Trade Toggle) erfordert eine gut durchdachte, leicht zugängliche Einstellungs-Oberfläche, die über ein einfaches Panel hinausgeht.
3. **Trigger-Typen**: Das UI muss die Auswahl des Trigger-Preises (**Mark**, **Index**, **Last**) bei Trigger-Orders, SL und TP zwingend abbilden.
4. **Position-Management**: Eine "Reverse"-Funktion sowie Buttons für eine schnelle Teil-/Komplett-Schließung (Close Limit/Market, Close All) sind im UI unverzichtbar für effizientes Trading.
