# Berechnungs-Settings Kartografie

## 📊 Übersicht aller Einstellungen die Berechnungen beeinflussen

---

## 1️⃣ **Market Analysis (Hintergrund-Analyst)**

### Settings die Market Analyst kontrollieren

| Setting | Ort | Typ | Default | Auswirkung |
|---------|-----|-----|---------|-----------|
| `marketAnalysisInterval` | `settings.svelte.ts:121` | `number` (Sekunden) | `60` | Zeitintervall zwischen Analyst-Zyklen. 0 = deaktiviert, 30-60s = normal, 300s = langsam |
| `pauseAnalysisOnBlur` | `settings.svelte.ts:122` | `boolean` | `true` | Wenn `true`: verdoppelt Interval wenn Browser unfokussiert (Energie sparen) |
| `analyzeAllFavorites` | `settings.svelte.ts:167` | `boolean` | `false` | Wenn `false`: nur top 4 Favoriten analysieren; `true`: ALLE Favoriten → CPU-Last steigt |
| `favoriteSymbols` | `settings.svelte.ts:404` | `string[]` | `["BTC","ETH","SOL","LINK"]` | Liste der zu analysierenden Symbole. Mehr = mehr Rechenzeit |
| `marketMode` | `settings.svelte.ts:172` | `enum` | `"balanced"` | Preset für Performance (`0s`), Balanced (`60s`), Pro (`10s`), Custom |

**Berechnung im Analyst:**

```
Flussdiagramm:
┌─ processNext() startet alle 60s (oder marketAnalysisInterval)
├─ if pauseAnalysisOnBlur & hidden → verdopple Interval (→ 120s)
├─ Symbol durchsuchen (favoriteSymbols[])
├─ Ist älteste Analyse älter als 10min?
│  └─ JA: Neue berechnen
│  └─ NEIN: nächste Symbol
├─ Klines fetchen (1h: 200 candles, 4h: 100 candles)
├─ technicalsService.calculateTechnicals() im Web Worker
│  ├─ MovingAverages (EMA, SMA)
│  ├─ Oscillators (RSI, MACD, Stochastic)
│  ├─ ConfluenceAnalyzer (Score berechnen)
│  └─ Volatility, Pivots
├─ Resultat → analysisState.results[symbol]
└─ Nächstes Interval scheduling
```

---

## 2️⃣ **Technical Indicators (UI Display & Web Worker)**

### Settings für Technicals-Anzeige

| Setting | Ort | Typ | Default | Auswirkung |
|---------|-----|-----|---------|-----------|
| `showTechnicals` | `settings.svelte.ts:408` | `boolean` | `false` | Master-Toggle: ob Technicals-Panel überhaupt gerendert wird |
| `showTechnicalsSummary` | `settings.svelte.ts:262` | `boolean` | `true` | Zeigt Confluence Score + Trend |
| `showTechnicalsConfluence` | `settings.svelte.ts:263` | `boolean` | `true` | Zeigt Confluence-Details (wie viele Indis aligned) |
| `showTechnicalsVolatility` | `settings.svelte.ts:264` | `boolean` | `true` | Zeigt ATR, Bollinger Bands |
| `showTechnicalsOscillators` | `settings.svelte.ts:265` | `boolean` | `true` | RSI, MACD, Stochastic |
| `showTechnicalsMAs` | `settings.svelte.ts:266` | `boolean` | `true` | Moving Averages (EMA/SMA) |
| `showTechnicalsAdvanced` | `settings.svelte.ts:267` | `boolean` | `true` | VWAP, Ichimoku, etc |
| `showTechnicalsSignals` | `settings.svelte.ts:268` | `boolean` | `true` | Buy/Sell Signals |
| `showTechnicalsPivots` | `settings.svelte.ts:269` | `boolean` | `true` | Pivot Points (R1, S1, etc) |

**Auswirkung:**

- Diese beeinflussen nur **Rendering**, nicht Berechnung
- Web Worker berechnet immer ALLE, Settings filtern nur Anzeige
- Mit allen `false` = schnelleres Rendering (aber Calc läuft im Hintergrund)

---

## 3️⃣ **Konstanten (in Code, nicht in Settings)**

### Fest verdrahtete Berechnungs-Konstanten

| Konstante | Ort | Wert | Auswirkung |
|-----------|-----|-----|-----------|
| `DATA_FRESHNESS_TTL` | `marketAnalyst.ts:18` | `10 * 60 * 1000` (10min) | Wie alt Analyse max sein darf, bevor neu gerechnet wird |
| `CACHE_TTL_NEWS` | `newsService.ts:19` | `24 * 60 * 60 * 1000` (24h) | Wie lange News gecacht werden (pro Coin) |
| `MAX_SYMBOLS_CACHED` | `newsService.ts:20` | `20` | Max wie viele Coin-Caches im localStorage |
| `LRU_CACHE_MAX_ENTRIES` | `technicalsService.ts` | `5` | Max Anzahl gecachter Kline-Sets im Memory |
| Kline-Größen | `marketAnalyst.ts:85-105` | `1h: 200, 4h: 100` | Wie viele Candles pro Fetch (länger = genauer aber langsamer) |

---

## 4️⃣ **Market Watcher (Real-Time WebSocket)**

### Settings für Live-Daten

| Setting | Ort | Typ | Default | Auswirkung |
|---------|-----|-----|---------|-----------|
| `marketDataInterval` | `settings.svelte.ts:397` | `number` (Sekunden) | `10` | REST-Polling Intervall wenn WS down ist |
| `apiProvider` | `settings.svelte.ts:272` | `"bitunix" \| "bitget"` | `"bitunix"` | Welche Exchange für API-Calls (beeinflusst Daten-Qualität) |

**Berechnung im MarketWatcher:**

```
WebSocket Stream → marketState.updateSymbol()
  └─ Falls WS down oder zu langsam:
      ├─ performPollingCycle() alle 10s (marketDataInterval)
      ├─ REST fetchTicker24h, fetchKlines
      └─ Cached in marketState.data
```

---

## 5️⃣ **News & Sentiment Analysis**

### Settings für News-Fetch

| Setting | Ort | Typ | Default | Auswirkung |
|---------|-----|-----|---------|-----------|
| `enableNewsAnalysis` | `settings.svelte.ts:271` | `boolean` | `true` | Ob News überhaupt gefetcht werden |
| `cryptoPanicFilter` | `settings.svelte.ts:257` | `"all"\|"important"\|"hot"` etc | `"important"` | Welche News gefiltert werden (reduziert API-Calls) |
| `cryptoPanicApiKey` | `settings.svelte.ts:283` | `string` | `""` | API-Key für CryptoPanic |
| `newsApiKey` | `settings.svelte.ts:284` | `string` | `""` | Fallback API-Key für NewsAPI |
| `rssFilterBySymbol` | `settings.svelte.ts:285` | `boolean` | `false` | Ob RSS auch nach Symbol-Namen gefiltert wird |

**Berechnung:**

```
selectSymbol() → app.fetchAllAnalysisData()
  └─ newsService.shouldFetchNews()
      ├─ Cache < 10 News? → fetch
      ├─ News älter als 24h? → fetch
      └─ Sonst: Cache nutzen
```

---

## 6️⃣ **Trade Calculation (Position-spezifisch)**

### Settings für Trade-Setup

| Setting | Ort | Typ | Default | Auswirkung |
|---------|-----|-----|---------|-----------|
| `autoUpdatePriceInput` | `settings.svelte.ts:399` | `boolean` | `true` | Wenn neue Ticker-Daten, Entry-Price auto-update? |
| `feePreference` | `settings.svelte.ts:413` | `"maker"\|"taker"` | `"taker"` | Welcher Fee für P&L Berechnungen (0.02% vs 0.05%) |
| `autoFetchBalance` | `settings.svelte.ts:400` | `boolean` | `false` | Wenn `true`: häufiger Balance geholt (mehr API-Calls) |

---

## 7️⃣ **AI-gestützte Analysen**

### Settings für AI-Kontext

| Setting | Ort | Typ | Default | Auswirkung |
|---------|-----|-----|---------|-----------|
| `analysisDepth` | `settings.svelte.ts:436` | `"quick"\|"standard"\|"deep"` | `"standard"` | Wie ausführlich AI die Trades analysiert |
| `aiTradeHistoryLimit` | `settings.svelte.ts:438` | `number` | `50` | Wieviele alte Trades für AI-Context fetchen |
| `enableCmcContext` | `settings.svelte.ts:303` | `boolean` | `false` | Ob CMC-Daten (Market Cap, etc) einbeziehen |

---

## 8️⃣ **Logging & Debugging**

### Settings für Visibility

| Setting | Ort | Typ | Default | Auswirkung |
|---------|-----|-----|---------|-----------|
| `debugMode` | `settings.svelte.ts:427` | `boolean` | `false` | Wenn `true`: ALLE console.logs anzeigen (Performance-Impact!) |
| `logSettings.technicals` | `settings.svelte.ts:158` | `boolean` | `false` | Log Technical Calculations |
| `logSettings.network` | `settings.svelte.ts:159` | `boolean` | `false` | Log API-Calls |
| `logSettings.market` | `settings.svelte.ts:161` | `boolean` | `false` | Log Market Watcher Events |
| `enableNetworkLogs` | `settings.svelte.ts:150` | `boolean` | `false` | SSE-Logs zum Server streamen |

---

## 9️⃣ **Cache & Memory**

### Settings für Speicher-Verwaltung

| Setting | Ort | Typ | Default | Auswirkung |
|---------|-----|-----|---------|-----------|
| `marketCacheSize` | `settings.svelte.ts:171` | `number` | `20` | Max Symbole im LRU Memory-Cache (zu hoch = RAM-Leak) |

---

## 🎯 **Kompletter Berechnung-Fluss mit Settings-Einfluss**

```
INITIALISIERUNG:
┌─ App startet
├─ settingsState lädt (localStorage)
├─ marketAnalyst.start()
│  └─ marketAnalysisInterval gelesen
├─ marketWatcher.startPolling()
│  └─ marketDataInterval gelesen
└─ newsService initialisiert
   └─ enableNewsAnalysis, cryptoPanicApiKey gelesen

USER HANDLUNG #1: Symbol im Picker wählen
┌─ selectSymbol("ETHUSDT")
├─ app.fetchAllAnalysisData("ETHUSDT", true)
│  ├─ fetchTicker24h() via apiProvider
│  │  └─ autoUpdatePriceInput? → Preis in Input
│  └─ fetchBitunixKlines() für ATR
├─ newsService.fetchNews("ETHUSDT")
│  ├─ shouldFetchNews()?
│  │  ├─ Cache vorhanden & < 24h & >= 10 news?
│  │  └─ JA: Skippen, NEIN: fetch
│  └─ apiQuotaTracker.logCall()
└─ Modal schließt

HINTERGRUND (Continuous):
┌─ Alle marketAnalysisInterval Sekunden:
│  ├─ processNext() in MarketAnalyst
│  ├─ if pauseAnalysisOnBlur & hidden: interval *= 2
│  ├─ analyzeAllFavorites? → alle vs. top-4
│  ├─ DATA_FRESHNESS_TTL vergangen?
│  │  ├─ JA: technicalsService.calculateTechnicals()
│  │  │  ├─ MovingAverages (EMA 200, SMA)
│  │  │  ├─ Oscillators (RSI, MACD, Stoch)
│  │  │  ├─ Confluence Score
│  │  │  └─ Resultat → UI (settings.showTechnicals*)
│  │  └─ NEIN: Cache nutzen
│  └─ Nächstes Interval scheduling
│
└─ Alle marketDataInterval Sekunden:
   ├─ MarketWatcher.performPollingCycle()
   ├─ Top 12 Requests schedulen (staggered)
   └─ fetchTicker24h, fetchKlines
      └─ Cache in marketState

UI RENDER (bei jedem State-Change):
├─ showTechnicals? → Panel rendern/verstecken
├─ show[Technical]* Settings? → Sub-Sections rendern
└─ technicals aus analysisState anzeigen
```

---

## ⚙️ **Performance-Tuning Matrix**

### Schnelle (Light) Config

```
marketAnalysisInterval: 300      // 5 min (statt 60s)
pauseAnalysisOnBlur: true         // doppel-pause
analyzeAllFavorites: false        // nur top-4
debugMode: false                  // kein spam
logSettings: { all: false }       // kein logging
marketCacheSize: 10               // kleinerer LRU
```

**Effekt:** ~50% weniger CPU/Memory, aber weniger frische Daten

### Balanced (Standard)

```
marketAnalysisInterval: 60        // jede Min
pauseAnalysisOnBlur: true
analyzeAllFavorites: false        // top-4
debugMode: false
marketCacheSize: 20
```

**Effekt:** Sweet Spot

### Pro (High Frequency)

```
marketAnalysisInterval: 10        // schnell!
pauseAnalysisOnBlur: false        // auch wenn hidden
analyzeAllFavorites: true         // ALLE
debugMode: false (ggf true für Debugging)
marketCacheSize: 50               // großer LRU
```

**Effekt:** ~200% mehr CPU/Memory, aber maximale Frische

---

## 📝 **Settings-Auswirkung auf Berechnung: Zusammenfassung**

| Bereich | Setting | Schweregrad | Auswirkung |
|---------|---------|------------|-----------|
| **Analyst-Speed** | `marketAnalysisInterval` | 🔴 Kritisch | Direkt Rechenfrequenz |
| **Analyst-Umfang** | `analyzeAllFavorites` | 🔴 Kritisch | Linear mehr Symbols = mehr CPU |
| **Pause-Smart** | `pauseAnalysisOnBlur` | 🟡 Hoch | 2x Energieeinsparung wenn hidden |
| **News-Fetch** | `enableNewsAnalysis` | 🟡 Hoch | Stoppt API-Calls wenn disabled |
| **UI-Rende** | `showTechnicals*` | 🟢 Niedrig | Nur Rendering, nicht Calc |
| **Cache-Größe** | `marketCacheSize` | 🟡 Hoch | Zu groß = RAM-Leak |
| **Polling-Fallback** | `marketDataInterval` | 🟢 Niedrig | Nur wenn WS down |
| **Debug-Spam** | `debugMode` | 🟢 Niedrig | Nur Console Performance |

---

## 🚀 **Nächste Schritte (UI Improvements)**

- [ ] Settings-Tab für "Calculation Profile" (Light / Balanced / Pro)
- [ ] Live Memory-Monitor im Settings (wie viel RAM gerade verbraucht)
- [ ] "Calculation Timeline" - visualisieren wann Analyst läuft
- [ ] Advanced Mode: granulare Settings für jeden Indicator
- [ ] Slider für `marketAnalysisInterval` statt Text-Input (mit Min/Max Guards)
