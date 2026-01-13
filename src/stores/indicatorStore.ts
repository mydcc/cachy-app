import { writable } from "svelte/store";
import { browser } from "$app/environment";

export interface IndicatorSettings {
  historyLimit: number; // Global setting for calculation depth
  precision: number; // Global precision for indicator values
  rsi: {
    length: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    showSignal: boolean;
    signalType: "sma" | "ema";
    signalLength: number;
    defaultTimeframe: string; // Used if sync is disabled
  };
  macd: {
    fastLength: number;
    slowLength: number;
    signalLength: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    oscillatorMaType: "ema" | "sma";
    signalMaType: "ema" | "sma";
  };
  stochastic: {
    kPeriod: number;
    kSmoothing: number;
    dPeriod: number;
  };
  cci: {
    length: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    threshold: number; // usually 100 (triggers on > 100 or < -100)
    smoothingType: "sma" | "ema";
    smoothingLength: number;
  };
  adx: {
    adxSmoothing: number; // Was 'length'
    diLength: number;
    threshold: number; // usually 25
  };
  ao: {
    fastLength: number;
    slowLength: number;
  };
  momentum: {
    length: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
  };
  ema: {
    ema1: {
      length: number;
      offset: number;
      smoothingType: "none" | "sma" | "ema" | "smma" | "wma" | "vwma";
      smoothingLength: number;
    };
    ema2: {
      length: number;
      offset: number;
      smoothingType: "none" | "sma" | "ema" | "smma" | "wma" | "vwma";
      smoothingLength: number;
    };
    ema3: {
      length: number;
      offset: number;
      smoothingType: "none" | "sma" | "ema" | "smma" | "wma" | "vwma";
      smoothingLength: number;
    };
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
  };
  pivots: {
    type: "classic" | "woodie" | "camarilla" | "fibonacci";
    viewMode: "integrated" | "separated" | "abstract";
  };
}

const defaultSettings: IndicatorSettings = {
  historyLimit: 750,
  precision: 4,
  rsi: {
    length: 14,
    source: "close",
    showSignal: true,
    signalType: "sma",
    signalLength: 14,
    defaultTimeframe: "1d",
  },
  macd: {
    fastLength: 12,
    slowLength: 26,
    signalLength: 9,
    source: "close",
    oscillatorMaType: "ema",
    signalMaType: "ema",
  },
  stochastic: {
    kPeriod: 14,
    kSmoothing: 3,
    dPeriod: 3,
  },
  cci: {
    length: 20,
    source: "close",
    threshold: 100,
    smoothingType: "sma",
    smoothingLength: 5,
  },
  adx: {
    adxSmoothing: 14,
    diLength: 14,
    threshold: 25,
  },
  ao: {
    fastLength: 5,
    slowLength: 34,
  },
  momentum: {
    length: 10,
    source: "close",
  },
  ema: {
    ema1: { length: 21, offset: 0, smoothingType: "sma", smoothingLength: 14 },
    ema2: { length: 50, offset: 0, smoothingType: "sma", smoothingLength: 14 },
    ema3: { length: 200, offset: 0, smoothingType: "sma", smoothingLength: 14 },
    source: "close",
  },
  pivots: {
    type: "classic",
    viewMode: "integrated",
  },
};

const STORE_KEY = "cachy_indicator_settings";

function createIndicatorStore() {
  const stored = browser ? localStorage.getItem(STORE_KEY) : null;

  // Merge stored settings with defaults to ensure new keys exist
  let initial: IndicatorSettings = defaultSettings;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);

      // Migration for ADX 'length' to 'adxSmoothing'
      let adxParsed = { ...defaultSettings.adx, ...(parsed.adx || {}) };
      if (
        parsed.adx &&
        parsed.adx.length !== undefined &&
        parsed.adx.adxSmoothing === undefined
      ) {
        adxParsed.adxSmoothing = parsed.adx.length;
      }

      initial = {
        historyLimit: parsed.historyLimit || defaultSettings.historyLimit,
        precision:
          parsed.precision !== undefined
            ? parsed.precision
            : defaultSettings.precision,
        rsi: { ...defaultSettings.rsi, ...parsed.rsi },
        macd: { ...defaultSettings.macd, ...parsed.macd },
        stochastic: { ...defaultSettings.stochastic, ...parsed.stochastic },
        cci: { ...defaultSettings.cci, ...parsed.cci },
        adx: adxParsed,
        ao: { ...defaultSettings.ao, ...parsed.ao },
        momentum: { ...defaultSettings.momentum, ...parsed.momentum },
        ema: parsed.ema
          ? {
              ema1: {
                ...defaultSettings.ema.ema1,
                ...(parsed.ema.ema1 || { length: parsed.ema.ema1Length }),
              },
              ema2: {
                ...defaultSettings.ema.ema2,
                ...(parsed.ema.ema2 || { length: parsed.ema.ema2Length }),
              },
              ema3: {
                ...defaultSettings.ema.ema3,
                ...(parsed.ema.ema3 || { length: parsed.ema.ema3Length }),
              },
              source: parsed.ema.source || defaultSettings.ema.source,
            }
          : defaultSettings.ema,
        pivots: { ...defaultSettings.pivots, ...parsed.pivots },
      };
    } catch (e) {
      console.error("Failed to parse indicator settings", e);
    }
  }

  const { subscribe, set, update } = writable<IndicatorSettings>(initial);

  return {
    subscribe,
    set: (val: IndicatorSettings) => {
      if (browser) localStorage.setItem(STORE_KEY, JSON.stringify(val));
      set(val);
    },
    update: (fn: (val: IndicatorSettings) => IndicatorSettings) => {
      update((val) => {
        const newState = fn(val);
        if (browser) localStorage.setItem(STORE_KEY, JSON.stringify(newState));
        return newState;
      });
    },
    reset: () => {
      if (browser)
        localStorage.setItem(STORE_KEY, JSON.stringify(defaultSettings));
      set(defaultSettings);
    },
  };
}

export const indicatorStore = createIndicatorStore();
