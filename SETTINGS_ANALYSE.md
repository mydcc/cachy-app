# Einstellungen-Analyse: CachyApp Trading Platform

## Zusammenfassung

Diese Analyse untersucht die Einstellungsmöglichkeiten der CachyApp aus Sicht eines professionellen Traders. Sie bewertet die Benutzerfreundlichkeit, Performance-Einstellungen und identifiziert Verbesserungspotenziale.

## 1. Übersicht der Konfigurationsoptionen

Die CachyApp bietet 6 Haupt-Tabs mit umfangreichen Einstellungsmöglichkeiten:

### 📊 Trading Tab
**3 Unter-Tabs: Market & Execution | Chart & Technicals | Controls**

#### Market & Execution
- **Gebührenpräferenz**: Maker vs. Taker (Standardgebühren für Berechnungen)
- **Marktdaten-Intervall**: 1s / 2s / 5s / **10s (Standard)** / Custom
  - ⚡ 1s = Ultra-responsiv für Scalping (hohe CPU-Last)
  - ⚖️ 10s = Balanced für Swing Trading (Standard)
- **Spin-Buttons**: Immer sichtbar / Bei Hover / Versteckt
- **Auto-Update Preiseingabe**: Synchronisiert Eingabefelder mit Live-Preis
- **Sicherheitsabfragen**: Bestätigung bei Trade-Löschung / Bulk-Löschung

#### Chart & Technicals
- **Technische Analyse**: Ein/Aus-Schalter für gesamtes Panel
- **Modul-Auswahl**: Summary, Oscillators, Moving Averages, Pivots
- **Indikator-Einstellungen**: 22 einzelne Indikatoren individuell steuerbar
  - RSI, Stochastic RSI, MACD, Stochastic, Williams %R
  - CCI, ADX, Awesome Oscillator, Momentum, MFI
  - EMA, SMA, Bollinger Bands, ATR, VWAP
  - Volume MA, Volume Profile, Pivots, SuperTrend
  - Ichimoku, Parabolic SAR, Divergences, Market Structure
- **Indikator-Optimierung**: Nur aktivierte Indikatoren werden berechnet

#### Controls
- **Hotkey-Modus**: 
  - Safety Mode (Alt+ Modifikator, Standard)
  - Direct Mode (Schnelle Direkttasten)
  - Custom (Individuelle Anpassung)
- **Tastenkombinationen**: Vollständig anpassbar

---

### 🎨 Visuals Tab
**3 Unter-Tabs: Look & Feel | Layout | Background**

#### Look & Feel
- **Sprache**: Deutsch / English
- **Theme**: 26 Farbschemata (Dark, Dracula, Tokyo Night, Nord, Catppuccin, etc.)
- **Schriftart**: 10 Optionen (Inter, Roboto, Fira Code, etc.)
- **Chat-Schriftgröße**: 10-24px
- **Glassmorphism**: Blur (0-120px), Opazität (0-100%), Sättigung (50-300%)

#### Layout
- **Sidebars**: Ein/Ausblenden der linken/rechten Panels
- **Side Panel**: Enable/Disable, Standard vs. Floating Mode
- **Panel-Position**: Frei verschiebbar und skalierbar

#### Background
- **Typ**: Keiner / Bild / Video / Animation
- **Bild/Video-URL**: Mit Opazität & Blur-Kontrolle
- **Animationen**: Gradient Flow, Particles, Breathing Circles, Waves, Aurora
- **Video-Geschwindigkeit**: 0.1x - 2x

---

### 🤖 AI Tab
**3 Unter-Tabs: Intelligence Core | Behavior & Persona | Autonomous Agents**

#### Intelligence Core
- **Provider**: OpenAI / Gemini / Anthropic
- **Modell-Auswahl**: Pro Provider konfigurierbar
  - OpenAI: gpt-4o, gpt-4-turbo, gpt-3.5-turbo
  - Gemini: gemini-1.5-flash, gemini-1.5-pro
  - Anthropic: claude-3-5-sonnet, claude-3-opus
- **System-Prompt**: Anpassbares Verhalten für AI-Agent

#### Behavior & Persona
- **News-Analyse**: Aktiviert/Deaktiviert
- **CMC Context**: CoinMarketCap Daten in AI-Kontext einbeziehen
- **Bestätigungen**: Aktionen bestätigen / Chat-Löschung bestätigen
- **Trade History Limit**: 5-100 Trades für AI-Kontext
- **Analyse-Tiefe**: Quick / Standard / Deep

#### Autonomous Agents
- **Discord-Bot**: Token & Channel-Verwaltung (unbegrenzte Channels)
- **X/Twitter-Monitore**: User & Hashtag Tracking (geplant)

---

### 🔗 Connections Tab
**3 Unter-Tabs: Exchanges | Data Services | News Feeds**

#### Exchanges
- **Bitunix**: API Key + Secret
- **Bitget**: API Key + Secret + Passphrase
- **Status-Anzeige**: Verbunden / Nicht verbunden

#### Data Services
- **CryptoPanic**: API Key + Filter + Plan (Developer/Growth/Enterprise)
- **CoinMarketCap**: API Key für Marktdaten
- **NewsAPI.org**: API Key für Nachrichten
- **ImgBB**: API Key für Screenshot-Uploads
- **API-Quota Dashboard**: Verbrauch & Limits in Echtzeit

#### News Feeds
- **RSS Presets**: Coindesk, Cointelegraph, etc.
- **Custom RSS Feeds**: Max. 5 eigene Feeds
- **Symbol-Filter**: RSS nach aktuell ausgewähltem Symbol filtern

---

### ⚙️ System Tab
**4 Unter-Tabs: Performance | Dashboard | Data & Backup | Maintenance**

#### Performance
**Leistungsprofile** (Quick-Select Presets):
- **💡 Light**: 5min Intervall, 10 Cache, 2 Timeframes, News deaktiviert
  - Minimal CPU/RAM, langsame Updates
  - Geeignet für: Position Trading, schwache Hardware
- **⚖️ Balanced (Standard)**: 1min Intervall, 20 Cache, 3 Timeframes, News aktiv
  - Gute Balance zwischen Performance & Reaktionszeit
  - Geeignet für: Day Trading, normale Hardware
- **⚡ Pro**: 10s Intervall, 50 Cache, 4 Timeframes, alle Favoriten analysieren
  - Maximale Reaktionszeit, hohe CPU-Last
  - Geeignet für: Scalping, leistungsstarke Hardware

**Erweiterte Einstellungen**:
- **Analyse-Intervall**: 10s - 600s (Slider)
  - Wie oft technische Indikatoren neu berechnet werden
- **Alle Favoriten analysieren**: Top 4 vs. Alle (CPU-Multiplikator)
- **Pause bei Inaktivität**: Verdoppelt Intervall wenn Tab nicht fokussiert
- **Market Cache Size**: 5 - 100 Symbole (RAM-Verbrauch)
- **Analyse-Timeframes**: 5m, 15m, 1h, 4h, 1d (Mehrfachauswahl)
  - Mehr Timeframes = mehr API-Calls & CPU-Last
- **News-Analyse**: Aktiviert/Deaktiviert (verbraucht API-Quota)

**Weitere Optionen**:
- **Network Logging**: API-Traffic in Konsole anzeigen
- **Debug Mode**: Detaillierte Logs & versteckte Features
- **Cache löschen**: Entfernt gespeicherte News & Marktdaten
- **App neu laden**: Kompletter Reload
- **Englische Fachbegriffe erzwingen**: Verhindert Übersetzung technischer Begriffe

#### Dashboard
- **Berechnungs-Performance**: Echtzeit-Metriken zu CPU/Memory-Nutzung (geplant)

#### Data & Backup
- **Backup erstellen**: Exportiert Settings & Daten als JSON
- **Passwort-Verschlüsselung**: Optional für Backups
- **Backup wiederherstellen**: Importiert aus JSON-Datei

#### Maintenance (Danger Zone)
- **Factory Reset**: Löscht alle localStorage-Daten (irreversibel)

---

### ☁️ Cloud Tab
- **Community Cloud (Beta)**: SpacetimeDB-Integration
- **Chat-System**: Echtzeit-Kommunikation mit anderen Tradern

---

## 2. Performance-Einstellungen im Detail

### Kritische Performance-Parameter

| Einstellung | Standard | Bereich | CPU-Impact | RAM-Impact | Datenfrische |
|------------|----------|---------|-----------|-----------|--------------|
| **Marktdaten-Intervall** | 10s | 1s-10s | Hoch bei 1s | Mittel | ⚡ Besser bei 1s |
| **Analyse-Intervall** | 60s | 10s-600s | Höher bei 10s | Moderat | ⚡ Besser bei 10s |
| **Market Cache Size** | 20 | 5-100 | Linear | Linear | Größer = besser |
| **Technicals Cache** | 20 | - | Moderat | Moderat | 60s TTL |
| **History Limit** | 750 Kerzen | - | Hoch | Hoch | Mehr Historie |
| **Analyse-Timeframes** | 2 (1h,4h) | 1-5 | 2-5x CPU | Moderat | Mehr Datenpunkte |
| **Alle Favoriten** | Nein (Top 4) | Ja/Nein | 3-5x mehr | 2-3x mehr | Alle Symbole |
| **Pause on Blur** | Ja | - | ~50% weniger | Keine | Keine (pausiert) |
| **News-Analyse** | Ja | - | Moderat | Moderat | Abhängig von Feed |
| **Alle Indikatoren** | 6/22 | - | Basis | Basis | Vollständig |

### Datenfluss: Settings → Berechnungen → UI

```
Einstellungen-State → Berechnungs-Engine → API-Calls → UI-Updates
        ↓                    ↓                  ↓            ↓
marketDataInterval   technicalsCacheSize   REST calls   Echtzeit-Updates
analysisInterval     maxTechnicalsHistory  WebSocket    Chart-Refresh
analyzeAllFavorites  enabledIndicators     RSS feeds    Indikator-Anzeige
analysisTimeframes   technicalsUpdateMode  N-fach       Performance
```

**Wichtige Zusammenhänge**:
- `marketDataInterval` (10s Standard) → Steuert WebSocket-Ping/REST-Polling-Frequenz
- `analysisInterval` (60s Standard) → Triggert Neuberechnung technischer Indikatoren
- `analysisTimeframes` → Multipliziert API-Calls (N Timeframes × Symbole)
- `marketCacheSize` (20 Standard) → LRU-Cache limitiert RAM für OHLCV-Daten
- `technicalsCacheSize` (20) → Separater Cache für berechnete Indikatoren
- `pauseAnalysisOnBlur` → Verdoppelt Intervall wenn Tab nicht fokussiert (Energiesparmodus)
- `enabledIndicators` → Nur ausgewählte Indikatoren werden berechnet (Optimierungsflag)

---

## 3. Bewertung aus Trader-Sicht

### ✅ Was funktioniert gut

1. **Granulare Kontrolle**: Umfangreiche Anpassungsmöglichkeiten für fortgeschrittene User
2. **Performance-Profile**: Einfache Presets (Light/Balanced/Pro) für Quick-Start
3. **Indikator-Optimierung**: CPU-sparende Berechnung nur aktivierter Indikatoren
4. **Sicherheitsabfragen**: Verhindert versehentliches Löschen von Trades
5. **Pause on Blur**: Intelligentes Energie-Management
6. **API-Quota Dashboard**: Transparente Anzeige des Verbrauchs
7. **Backup-System**: Mit optionaler Verschlüsselung
8. **Multi-Provider AI**: Flexibilität bei AI-Anbietern
9. **Theme-Vielfalt**: 26 Themes für individuelle Präferenzen
10. **Hotkey-System**: Vollständig anpassbare Shortcuts

### ⚠️ Kritische Punkte für professionelle Trader

#### 10s Marktdaten-Intervall: Ausreichend schnell?
**❌ NEIN für Scalping (<5min Timeframes)**
- Scalper benötigen 1-2s Updates für präzises Timing
- 10s Standard ist geeignet für:
  - ✅ Swing Trading (1h+ Timeframes)
  - ✅ Day Trading (15m+ Timeframes)
  - ❌ Scalping (1-5m Timeframes)
- **Empfehlung**: Scalping-Profil mit 1-2s Intervall hinzufügen

#### Cache-Limits: Realistisch?
**⚠️ BEDINGT - abhängig von Portfolio-Größe**
- 20 Symbole Cache = ausreichend für:
  - ✅ Fokus auf 3-5 Hauptpositionen
  - ❌ Diversifiziertes Portfolio mit 30+ Symbolen
- Bei >20 Symbolen: Cache-Misses führen zu API-Calls & Latenz
- **Empfehlung**: Cache-Size für Pro-Profil auf 50-100 erhöhen

#### 60s Analyse-Intervall: Optimal?
**✅ JA für die meisten Use-Cases**
- Verhindert Analysis-Thrashing (zu häufige Neuberechnungen)
- 10s Intervall im Pro-Profil vorhanden für aggressive Trader
- **Aber**: Keine Option für Ultra-Fast (5s) bei niedrigen Timeframes

### 🚨 Fehlende Features für Profis

1. **Kein Risikomanagement**:
   - ❌ Max. Position Size pro Trade
   - ❌ Daily Loss Limit / Stop-Loss
   - ❌ Leverage-Caps
   - ❌ Portfolio Heat Map

2. **Keine Order-Templates**:
   - ❌ Gespeicherte SL/TP-Multipliers
   - ❌ Standard-Positionsgrößen
   - ❌ Favorite Entry/Exit Strategies

3. **Keine technischen Alerts**:
   - ❌ Price Alerts mit Benachrichtigungen
   - ❌ Technical Indicator Crossovers
   - ❌ Volume Spike Alerts
   - ❌ Multi-Timeframe Confluence Alerts

4. **Kein API Rate Limiting**:
   - ❌ Throttling-Kontrollen
   - ❌ Burst-Mode vs. Sustained Mode
   - ❌ Prioritäten (Execution > Analysis > News)

5. **Keine Korrelationsüberwachung**:
   - ❌ Sektor-/Markt-Korrelation
   - ❌ Beta zu BTC/ETH
   - ❌ Portfolio-Diversifikations-Score

6. **Keine Slippage-Settings**:
   - ❌ Maximaler akzeptabler Spread
   - ❌ Slippage-Toleranz
   - ❌ Execution-Qualitäts-Metriken

---

## 4. Usability-Probleme

### 🔴 Hohe Priorität

1. **Verwirrende Bezeichnungen**:
   - "mode1" / "mode2" → sollte "Direct" / "Safety" heißen
   - "Analyse-Intervall" vs. "Marktdaten-Intervall": Unterschied unklar
   - "Technicals Update Mode": Versteckt in Defaults, nicht sichtbar in UI

2. **Keine Performance-Anzeige**:
   - User können nicht validieren, ob Einstellungen zu CPU-Last führen
   - Keine Echtzeit-Metriken (CPU%, RAM%, API-Calls/min)
   - Kein Feedback über Impact von Änderungen

3. **Fehlende Tooltips/Hilfe**:
   - Viele Settings ohne Erklärung
   - Keine Angabe des Performance-Impacts
   - Keine Empfehlungen für verschiedene Trading-Stile

### 🟡 Mittlere Priorität

4. **News-Analyse standardmäßig aktiv**:
   - Verbraucht API-Quota ohne Warnung
   - User sollten explizit opt-in

5. **RSS-Feed Cache-Löschung**:
   - Silent Operation beim Feed-Wechsel
   - Keine Warnung über Datenverlust

6. **Cloud Tab (Beta)**:
   - Als vollwertiger Tab gelistet, aber Beta
   - Verwirrt User über Funktionalität

7. **Hotkey-Konfiguration**:
   - Custom-Mode hat keine Preview
   - Keine Konflikt-Erkennung bei Tastenkombinationen

### 🟢 Niedrige Priorität

8. **Exchange Status-Anzeige**:
   - Nur Verbunden/Nicht verbunden
   - Kein Last-Seen-Timestamp
   - Keine Latenz-Anzeige

9. **AI Provider Model-Namen**:
   - Inkonsistente Namenskonvention
   - Keine Preis-Informationen

---

## 5. Vorschläge zur Verbesserung

### Vorschlag 1: Performance-Monitoring Dashboard (Priorität: Hoch)

**Problem**: User haben kein Feedback über den Impact ihrer Einstellungen.

**Lösung**: Echtzeit-Performance-Dashboard im System-Tab

**Features**:
- **CPU-Auslastung**: 0-100%, farbcodiert (Grün <30%, Gelb 30-60%, Rot >60%)
- **RAM-Verbrauch**: Aktuelle Nutzung + Maximum
- **API-Calls/Minute**: Live-Zähler mit Quota-Warnung
- **WebSocket-Latenz**: Durchschnittliche Ping-Zeit
- **Cache Hit-Rate**: Prozentsatz der Cache-Treffer
- **Berechnungsdauer**: Durchschnittliche Zeit für technische Analysen

**Implementierung**:
```typescript
// In SystemTab.svelte -> Dashboard Sub-Tab
<PerformanceMonitor>
  <Metric label="CPU Usage" value={cpuPercent} />
  <Metric label="Memory" value={memoryMB} />
  <Metric label="API Calls/min" value={apiRate} />
  <Metric label="Cache Hit Rate" value={cacheHitRate} />
</PerformanceMonitor>
```

**Benefit**: User können sofort sehen, ob ihre Einstellungen zu Problemen führen.

---

### Vorschlag 2: Verbesserte Einstellungs-Labels & Tooltips (Priorität: Hoch)

**Problem**: Verwirrende Terminologie und fehlende Erklärungen.

**Lösung**: Klarere Bezeichnungen + kontextuelle Hilfe

**Änderungen**:
1. **Hotkey-Modi**:
   - ❌ Alt: "mode1" / "mode2" / "mode3"
   - ✅ Neu: "Direct (Fast)" / "Safety (Alt+)" / "Custom"

2. **Performance-Profil-Namen**:
   - ❌ Alt: "Light" / "Balanced" / "Pro"
   - ✅ Neu: "Light (Swing Trading)" / "Balanced (Day Trading)" / "Pro (Scalping)"

3. **Intervall-Beschreibungen**:
   - Marktdaten-Intervall: "Wie oft neue Preise abgerufen werden (niedriger = aktueller)"
   - Analyse-Intervall: "Wie oft Indikatoren neu berechnet werden (niedriger = mehr CPU)"

4. **Tooltips mit Icons**:
   ```svelte
   <label>
     Analyze All Favorites
     <Tooltip>
       ⚠️ CPU Impact: High (3-5x increase)
       📊 Best for: Large portfolios (30+ symbols)
       ⏱️ Recommended: Only with Pro profile
     </Tooltip>
   </label>
   ```

**Implementierung**:
- Tooltip-Component mit Icon
- Farb-codierte Warnungen (Grün/Gelb/Rot)
- Performance-Impact-Rating (Low/Medium/High)

---

### Vorschlag 3: Trader-Profil-Presets mit Erklärungen (Priorität: Mittel)

**Problem**: User müssen selbst herausfinden, welche Settings für ihren Stil passen.

**Lösung**: Erweiterte Profil-Auswahl mit Empfehlungen

**Neue Profile**:

1. **🐌 Position Trader** (Wochen-Monate):
   - Marktdaten: 30-60s
   - Analyse: 5min
   - Timeframes: 1d, 3d, 1w
   - Cache: 10 Symbole
   - News: Deaktiviert
   - CPU-Last: Minimal

2. **📈 Swing Trader** (Tage-Wochen):
   - Marktdaten: 10s (Standard)
   - Analyse: 1min
   - Timeframes: 4h, 1d
   - Cache: 20 Symbole
   - News: Aktiviert
   - CPU-Last: Niedrig

3. **⚡ Day Trader** (Stunden-Tage):
   - Marktdaten: 5s
   - Analyse: 30s
   - Timeframes: 15m, 1h, 4h
   - Cache: 30 Symbole
   - News: Aktiviert
   - CPU-Last: Mittel

4. **🚀 Scalper** (<1h):
   - Marktdaten: 1-2s
   - Analyse: 10s
   - Timeframes: 1m, 5m, 15m
   - Cache: 50 Symbole
   - News: Deaktiviert (CPU-Priorität)
   - CPU-Last: Hoch

**UI-Implementierung**:
```svelte
<ProfileSelector>
  {#each profiles as profile}
    <ProfileCard 
      title={profile.name}
      timeframe={profile.timeframe}
      cpuImpact={profile.cpuImpact}
      recommended={profile.recommended}
      onClick={() => applyProfile(profile)}
    />
  {/each}
</ProfileSelector>
```

---

### Vorschlag 4: Smart Defaults & Adaptive Einstellungen (Priorität: Niedrig)

**Problem**: Ein-Größe-passt-nicht-für-alle bei Standardwerten.

**Lösung**: Adaptive Einstellungen basierend auf User-Verhalten

**Features**:

1. **Hardware-Erkennung**:
   - Detect: CPU-Cores, RAM, GPU
   - Auto-Suggest: "Ihr System unterstützt Pro-Profil (8GB RAM, 4 Cores)"

2. **Usage-Pattern-Learning**:
   - Track: Durchschnittliche Timeframes, Anzahl Trades/Tag
   - Suggest: "Sie handeln hauptsächlich 1h Charts → Empfehlung: Balanced-Profil"

3. **API-Quota-Warnung**:
   - Monitor: Verbleibende API-Calls
   - Warn: "News-Analyse verbraucht 80% Ihrer täglichen Quota → Deaktivieren?"

4. **Performance-Auto-Tuning**:
   - Detect: Hohe CPU-Last (>80%) für 5+ Minuten
   - Suggest: "CPU-Last kritisch → Auf Balanced downgraden?"

**Implementierung**:
```typescript
// In settingsState.svelte.ts
class AdaptiveSettings {
  autoDetectHardware(): ProfileRecommendation
  monitorUsagePatterns(): ProfileRecommendation
  watchAPIQuota(): Alert[]
  suggestOptimizations(): Suggestion[]
}
```

---

## 6. Zusammenfassung & Fazit

### Stärken der aktuellen Settings
✅ Umfangreiche Anpassungsmöglichkeiten
✅ Performance-Profile für Quick-Start
✅ Indikator-Optimierung & Caching
✅ Intelligentes Energie-Management
✅ Sicherheitsabfragen & Backup-System

### Schwächen & Verbesserungspotenzial
❌ 10s Marktdaten-Intervall zu langsam für Scalping
❌ Cache-Limits zu klein für große Portfolios (>30 Symbole)
❌ Fehlende Risikomanagement-Settings
❌ Keine Echtzeit-Performance-Metriken
❌ Verwirrende Terminologie (mode1/mode2)
❌ Keine technischen Alerts oder Order-Templates

### Priorisierung der Vorschläge

**Sofort umsetzen** (Quick Wins):
1. ✅ Performance-Monitoring Dashboard (hoher User-Value)
2. ✅ Verbesserte Labels & Tooltips (reduziert Support-Anfragen)

**Kurzfristig** (1-2 Wochen):
3. ✅ Trader-Profil-Presets mit Erklärungen
4. ✅ Scalping-Profil mit 1-2s Intervall

**Mittelfristig** (1-2 Monate):
5. ⏳ Risikomanagement-Settings
6. ⏳ Order-Templates
7. ⏳ Technische Alerts

**Langfristig** (>2 Monate):
8. 🔮 Smart Defaults & Adaptive Einstellungen
9. 🔮 Korrelationsüberwachung
10. 🔮 Slippage & Execution-Qualität

### Antwort auf die zentrale Frage

**"Liebt der User die App?"**

**Aktuell**: ⚖️ **7/10** - Gute Basis, aber Optimierungsbedarf
- Professionelle Trader schätzen die Granularität
- Aber: Fehlende Performance-Transparenz frustriert
- Terminologie verwirrt Einsteiger
- Für Scalper zu langsam (10s Intervall)

**Nach Umsetzung der Vorschläge 1-4**: ⭐ **9/10** - Excellent
- Performance-Dashboard gibt Kontrolle & Vertrauen
- Klare Labels & Tooltips reduzieren Lernkurve
- Trader-Profile decken alle Stile ab (Position → Scalper)
- User fühlt sich verstanden & gut betreut

---

## Appendix: Technische Details

### Performance-Metriken Formel

```typescript
// CPU-Auslastung berechnen
cpuUsage = (analysisTime / intervalTime) * 100

// Cache Hit-Rate
cacheHitRate = (cacheHits / totalRequests) * 100

// API-Calls pro Minute
apiRate = (apiCallCount / elapsedMinutes)

// Durchschnittliche Berechnungsdauer
avgCalcTime = sum(calculationTimes) / count(calculations)
```

### Empfohlene Grenzwerte

| Profil | CPU-Last | RAM | API/min | Cache-Size | Timeframes |
|--------|---------|-----|---------|------------|------------|
| Light | <20% | <500MB | <30 | 10 | 2 |
| Balanced | 20-40% | 500-1000MB | 30-60 | 20 | 3 |
| Pro | 40-70% | 1-2GB | 60-120 | 50 | 4 |
| Scalper | 60-90% | 2-3GB | 120-240 | 50-100 | 3-4 |

### Glossar

- **LRU Cache**: Least Recently Used - älteste Einträge werden zuerst entfernt
- **TTL**: Time To Live - maximale Gültigkeitsdauer von Cache-Einträgen
- **Slippage**: Differenz zwischen erwartetem und tatsächlichem Ausführungspreis
- **Scalping**: Trading-Stil mit sehr kurzen Haltedauern (<5min)
- **API Quota**: Maximale Anzahl erlaubter API-Anfragen pro Zeiteinheit
- **WebSocket**: Bidirektionale Echtzeit-Verbindung für Live-Daten
- **OHLCV**: Open/High/Low/Close/Volume Kerzen-Daten

---

**Erstellt**: 2026-01-26  
**Version**: 1.0  
**Autor**: CachyApp Team
