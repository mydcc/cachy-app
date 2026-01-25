# 📋 Settings & Berechnung - Umfassende Analyse

## **Phase 1: Settings-Audit**

### ✅ Vorhanden (in settings.svelte.ts)

```typescript
logSettings?: {
  technicals: boolean;
  network: boolean;
  ai: boolean;
  market: boolean;
  general: boolean;
  governance: boolean;
  technicalsVerbose?: boolean;
};

enableNetworkLogs: boolean;
debugMode: boolean;
marketMode: "performance" | "balanced" | "pro" | "custom";
analyzeAllFavorites: boolean;
enableNewsScraper: boolean;
marketCacheSize: number; // LRU cache size
pauseAnalysisOnBlur: boolean;
```

### ❌ VERLOREN gegangen / FEHLEN

#### **Berechnung & Caching**

- `cacheKlinesHistorically` – Sollen alte Kerzen neu berechnet oder nur 1x geholt werden?
- `maxKlineCacheAge` – Wie lange Klines speichern (aktuell: unbegrenzt)?
- `technicalsUpdateInterval` – Wie oft Indikatoren berechnen (aktuell: bei jeder neuen Kline)?
- `indicatorCacheStrategy` – "aggressive" | "balanced" | "minimal"
- `enableIndicatorCaching` – An/Aus für die gesamte Indikator-Cache

#### **UI/Dashboard Performance**

- `symbolPickerRefreshInterval` – Wie oft Snapshot im Picker aktualisieren?
- `marketDashboardUpdateInterval` – Trennung von Chart-Updates und Dashboard-Updates?
- `enableOffscreenMarketDashboard` – Bei nicht sichtbarem Tab pausieren?
- `maxSymbolsInCache` – Max. Symbole die gleichzeitig gepuffert werden

#### **Logging & Debugging**

- `enableCalculationTracing` – Detailliertes Logging WELCHER Berechnung wann
- `enableMemoryProfiling` – RAM-Verbrauch pro Komponente tracken
- `enablePerformanceMetrics` – Response-Zeiten für API-Calls & Berechnungen
- `logVerbosityLevel` – "quiet" | "normal" | "verbose" | "debug"
- `enableWebWorkerLogs` – Logs aus dem Technicals-Worker sichtbar machen

#### **Intelligente Optimierungen**

- `enableAdaptiveAnalysis` – Analyse-Tiefe basierend auf CPU-Last anpassen
- `enableLazyLoading` – Symbole erst berechnen wenn sichtbar
- `intelligentCacheWarmup` – Favorit-Symbole im Hintergrund vorberechnen

---

## **Phase 2: Aktuelle Berechnungs-Architektur**

### **Flow 1: Kline-Daten (= Kerzen)**

```
API (Bitunix/Binance)
  ↓
[apiService.fetchBitunixKlines] 
  → Ruft 50/750/1000 Klines ab (je nach Interval)
  → Speichert in: marketState.klines[symbol][timeframe]
  ↓
[TechnicalsPanel.svelte / MarketWatcher]
  → WebSocket: Neue 5m-Kline kommt alle 5 Sekunden
  → Aktualisiert localStorage & marketState
  ↓
[Berechnung auf neue Kline]
  → shouldFetchNews() → Nur wenn < 10 News im Cache
  → calculateAllIndicators() → 40+ Indikatoren
  ↓
[technicalsService]
  → Worker-basiert (offloaded, nicht blocking)
  → Cache: LRU, Max. 5 Einträge, TTL 5 Minuten
```

### **Flow 2: Indikatoren-Berechnungen**

```
[TechnicalsPanel.svelte]
  → $effect: currentKline aktualisiert sich
  → Throttle: CALCULATION_THROTTLE_MS (zur Zeit: nicht definiert, immer sofort!)
  ↓
[technicalsService.calculateTechnicals]
  → Cache-Hit? → Sofort zurückgeben (< 1ms)
  → Cache-Miss? → Weiterleitung an Worker
  ↓
[technicals.worker.ts]
  → calculateAllIndicators() mit 40+ Indikatoren:
    - 8 Oszillatoren (RSI, Stoch, MACD, etc.)
    - 3 Moving Averages (EMA 20/50/200)
    - Pivots (Daily, Weekly, Monthly)
    - Advanced (SuperTrend, VWAP, Divergences, etc.)
  → Rückgabe Decimal-Werte
  ↓
[Serialisierung]
  → Decimal → JSON (toFixed, dann back)
  → Speicherung in: marketState.technicals[symbol]
```

### **Flow 3: News & Sentiment**

```
[newsStore.refresh(symbol)]
  → shouldFetchNews(symbol)
    - Keine Cache? → Fetch
    - < 10 News im Cache? → Fetch
    - Cache > 24h alt? → Fetch
    - Sonst: Cache nutzen
  ↓
[newsService.fetchNews]
  → CryptoPanic (mit Quota-Tracking)
  → NewsAPI (wenn zu wenig News)
  → Discord (wenn aktiviert)
  → RSS (wenn aktiviert)
  ↓
[analyzeSentiment]
  → Top 10 News → Gemini/OpenAI API
  → Score: -1 to +1, Regime: BULLISH/BEARISH/NEUTRAL
```

### **Flow 4: Market Analyzer (Background)**

```
[app.ts]
  → Startet bei App-Init
  → Cycles durch Favoriten-Symbole
  → Berechnet für ALLE aktiven Symbole
  ↓
[marketWatcher.performPollingCycle]
  → Verwaltet concurrent API-Calls (max. 3 parallel)
  → Fetcht: Price, Ticker24h, Klines (5m/1h/1d)
  → Periodisch: marketAnalysisInterval (aktuell: 60s)
```

---

## **Phase 3: Kline-Caching-Strategie (KRITISCH)**

### **AKTUELLE IMPLEMENTIERUNG:**

```typescript
// src/stores/market.svelte.ts
updateSymbolKlines(symbol: string, timeframe: string, klines: any[]) {
  const current = this.getOrCreateSymbol(symbol);
  
  // PROBLEM: Überschreibt ALLE Klines, nicht inkrementell!
  klines.forEach((k) => {
    current.klines[timeframe] = {
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      time: k.time,
    };
  });

  this.enforceCacheLimit(); // LRU basierend auf marketCacheSize
}
```

### **ANTWORT: Werden Klines neuberechnet?**

✅ **NEIN, sie werden nicht neuberechnet!**

- Historische Klines werden **1x abgerufen** (50/750/1000 je nach Kontext)
- Neue 5m-Klines kommen **live via WebSocket**
- Die **vollständige Historie wird nicht jedes Mal neugerechnet** ✅
- **ABER:** Jede Berechnung benutzt die GANZE Geschichte (letzte 1000 Klines)

### **PROBLEM: Ineffiziente Lade-Strategie**

```
Symbol 1 geladen:
  → 1000 Klines (5m) = ~50 KB
  → 750 Klines (1d) = ~40 KB
  → Indikatoren berechnet = 50ms

Symbol wechsel zu Symbol 2:
  → 1000 Klines (5m) NEU laden ✗ (nicht zwischengecacht!)
  → Indikatoren NEU berechnen ✗ (nicht zwischengecacht!)
  → Wartet: ~500-1000ms

Nach 5 Symbolen:
  → 5x API-Calls für 5m-Klines
  → 5x Indikator-Berechnungen
  → RAM: ~250 KB für Klines
  → CPU: spikes bei Symbol-Wechsel
```

### **OPTIMIERUNG MÖGLICH:**

```typescript
// Strategie 1: "Smart Prefetch"
// Beim Öffnen des SymbolPickers: 
// → Parallel die top 5 Favoriten laden & berechnen
// → Dann Symbol-Wechsel: instant (< 50ms)

// Strategie 2: "Time-Based Refresh"
// 5m-Klines: 1x pro Minute neu laden
// 1d-Klines: 1x pro Tag neu laden (rest von Cache)
// Indikatoren: Cache 5 Minuten (kein Refresh nötig solange Kline sich nicht ändert)

// Strategie 3: "Dirty Tracking"
// Nur Indikatoren NEU berechnen wenn:
// → Neue Kline kam (WebSocket) ODER
// → Indicator-Settings geändert
// NICHT bei jedem $effect Trigger
```

---

## **Phase 4: Logging-System Plan**

### **Struktur:**

```typescript
// In Settings:
logSettings = {
  // CATEGORIES
  technicals: boolean;      // Alle Indikator-Berechnungen
  network: boolean;          // API-Calls, WebSocket
  ai: boolean;               // LLM-Anfragen (Sentiment, AI)
  market: boolean;           // Market-Analyzer, Symbol-Switching
  general: boolean;          // App-Logs
  governance: boolean;       // Settings, Storage
  
  // DEPTH
  technicalsVerbose: boolean;     // Verbose: jeder einzelne Indikator
  networkDetailed: boolean;       // Detailed: Request/Response body
  performanceMetrics: boolean;    // Timing: ms pro Operation
  memoryProfiling: boolean;       // RAM: Allocation pro Komponente
}

// In Logger-Service:
logger.tech("Calculating RSI with period 14", { klineCount: 1000, ms: 45 });
logger.network("POST /api/klines", { status: 200, ms: 310, size: "45 KB" });
logger.market("Symbol switch: BTCUSDT → ETHUSDT", { cached: true, ms: 5 });
logger.performance("TechnicalsPanel render", { duration: 23 });
```

### **Console Output:**

```
🟦 [TECH] Calculating RSI with period 14 | Klines: 1000 | 45ms
🟪 [NETWORK] GET /api/klines → 200 | 310ms | 45 KB
🟨 [MARKET] Symbol: BTCUSDT → ETHUSDT | Cached ✓ | 5ms
🟩 [PERF] TechnicalsPanel render | 23ms
🔴 [ERROR] Failed to fetch CryptoPanic | 429 - Quota exceeded
```

---

## **Phase 5: SymbolPicker & Dashboard wie TradingView**

### **Aktuelle Probleme:**

1. **Slow SymbolPicker** – Beim Öffnen wartet man auf API-Daten
2. **Leere Dashboard-Werte** – Beim Wechsel fehlen Daten kurz
3. **Kein Scroll-Optimierung** – Große Lists werden vollständig rendered
4. **Keine Snapshot-Vorschau** – Man sieht nicht 24h-Change bevor man wechselt

### **TradingView-Ansatz (Reverse Engineering):**

```
1. LAZY LOADING
   → Liste wird gescrollt
   → Nur sichtbare Symbole werden datengeladen
   → Invisible: Placeholder (Symbol + "--")
   → Scrolling = sehr schnell

2. PREFETCH STRATEGY
   → Beim Öffnen: Top 10 Favoriten sofort mit Snapshots laden
   → Klick auf Symbol: Daten sind schon da
   → Instant switch (<50ms)

3. CACHING PER TIMEFRAME
   → BTC/1m: separat gecacht
   → BTC/5m: separat gecacht
   → etc.
   → So können mehrere TFs schnell getoggelt werden

4. SKELETAL LOADING
   → Grayscale Candles während Laden
   → Technicals: Loading Spinner statt "--"
   → Gefühl von Speed auch wenn noch laden

5. PARALLEL OPERATIONS
   → Während User Symbol tippt (SymbolPicker Suche)
   → Im Hintergrund schon Daten laden für TOP matches
   → Wenn User drückt: maybe done already
```

### **Implementation Plan für Cachy:**

```typescript
// Option A: Prefetch on SymbolPicker Open
$effect(() => {
  if (modalState.isOpen && modalState.type === "symbolPicker") {
    // Asynchron: Top 5 Favoriten laden
    const top5 = favoritesState.favorites.slice(0, 5);
    top5.forEach(sym => {
      // Trigger Kline-Load (non-blocking)
      apiService.fetchBitunixKlines(sym, "5m", 50);
    });
  }
});

// Option B: Lazy Grid in SymbolPicker
// Nur sichtbare Symbole rendern + 2 außerhalb (virtuals crolling)
<VirtualList items={allSymbols} let:item>
  <SymbolCard {item} />
</VirtualList>

// Option C: Memoized Snapshots
// Cache: snapshots[symbol] = { price, 24hChange, volume }
// TTL: 30 Sekunden
// Update: Nur wenn Symbol aktiv
```

---

## **NEXT STEPS nach Plan-Bestätigung:**

1. ✅ Settings erweitern (caching, logging, ui-perf Einstellungen)
2. ✅ Logger-Service mit Kategorien schreiben
3. ✅ Dokumentation: Welche Berechnung wann, wie lange, RAM-Impact
4. ✅ Kline-Caching optimieren (Prefetch, Smart Invalidation)
5. ✅ SymbolPicker verbessern (Lazy Loading, Prefetch)
6. ✅ Dashboard Title mit Smart-Infos versehen (ohne Perf-Hit)
