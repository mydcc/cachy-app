import type { Decimal } from 'decimal.js';

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  trend?: string;
}

export interface KeyFeature {
  type: string;
  candleIndex?: number;
  candleIndex1?: number;
  candleIndex2?: number;
  color?: string;
  borderColor?: string;
  gapType?: string;
  direction?: string;
  shadowType?: string;
  radius?: number;
  yValue1Property?: string;
  yValue2Property?: string;
  lineWidth?: number;
  dashed?: boolean;
}

export interface PatternDefinition {
  id: string;
  type: string;
  name: string;
  candles: CandleData[];
  keyFeatures?: KeyFeature[];
}

export const CANDLESTICK_PATTERNS: PatternDefinition[] = [
  {
    "id": "doji",
    "type": "Indecision",
    "name": "Doji",
    "candles": [
      {
        "open": 50,
        "high": 60,
        "low": 40,
        "close": 50.5,
        "trend": "any"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(250, 204, 21, 0.4)",
        "borderColor": "#FACC15"
      }
    ]
  },
  {
    "id": "spinning_top",
    "type": "Indecision",
    "name": "Spinning Top",
    "candles": [
      {
        "open": 50,
        "high": 65,
        "low": 35,
        "close": 52,
        "trend": "any"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(250, 204, 21, 0.4)",
        "borderColor": "#FACC15"
      }
    ]
  },
  {
    "id": "abandoned_baby_bullish",
    "type": "Bullish Reversal",
    "name": "Abandoned Baby (Bullish)",
    "candles": [
      {
        "open": 70,
        "high": 72,
        "low": 50,
        "close": 52,
        "trend": "downtrend"
      },
      {
        "open": 40,
        "high": 42,
        "low": 38,
        "close": 40.5
      },
      {
        "open": 55,
        "high": 80,
        "low": 53,
        "close": 78
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(250,204,21,0.4)"
      },
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "shadow_to_shadow",
        "direction": "down",
        "color": "rgba(163,230,53,0.3)"
      },
      {
        "type": "gap",
        "candleIndex1": 1,
        "candleIndex2": 2,
        "gapType": "shadow_to_shadow",
        "direction": "up",
        "color": "rgba(163,230,53,0.3)"
      }
    ]
  },
  {
    "id": "belt_hold_bullish",
    "type": "Bullish Reversal",
    "name": "Belt Hold (Bullish)",
    "candles": [
      {
        "open": 30,
        "high": 55,
        "low": 30,
        "close": 53,
        "trend": "downtrend"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      }
    ]
  },
  {
    "id": "breakaway_bullish",
    "type": "Bullish Reversal",
    "name": "Breakaway (Bullish)",
    "candles": [
      {
        "open": 80,
        "high": 82,
        "low": 60,
        "close": 62,
        "trend": "downtrend"
      },
      {
        "open": 55,
        "high": 57,
        "low": 45,
        "close": 48
      },
      {
        "open": 47,
        "high": 49,
        "low": 40,
        "close": 42
      },
      {
        "open": 41,
        "high": 43,
        "low": 35,
        "close": 38
      },
      {
        "open": 37,
        "high": 70,
        "low": 36,
        "close": 68
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "body_to_body",
        "direction": "down",
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 4,
        "color": "rgba(34,197,94,0.4)"
      }
    ]
  },
  {
    "id": "bullish_engulfing",
    "type": "Bullish Reversal",
    "name": "Bullish Engulfing",
    "candles": [
      {
        "open": 50,
        "high": 52,
        "low": 45,
        "close": 46,
        "trend": "downtrend"
      },
      {
        "open": 44,
        "high": 60,
        "low": 43,
        "close": 58
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(239, 68, 68, 0.3)",
        "borderColor": "#EF4444"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(34, 197, 94, 0.3)",
        "borderColor": "#22C55E"
      },
      {
        "type": "engulf",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250, 204, 21, 0.4)",
        "borderColor": "#FACC15"
      }
    ]
  },
  {
    "id": "bullish_harami",
    "type": "Bullish Reversal",
    "name": "Bullish Harami",
    "candles": [
      {
        "open": 60,
        "high": 62,
        "low": 40,
        "close": 42,
        "trend": "downtrend"
      },
      {
        "open": 45,
        "high": 50,
        "low": 43,
        "close": 48
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      },
      {
        "type": "body_inside_body",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250,204,21,0.4)"
      }
    ]
  },
  {
    "id": "bullish_harami_cross",
    "type": "Bullish Reversal",
    "name": "Bullish Harami Cross",
    "candles": [
      {
        "open": 60,
        "high": 62,
        "low": 40,
        "close": 42,
        "trend": "downtrend"
      },
      {
        "open": 48,
        "high": 52,
        "low": 46,
        "close": 48.5
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      },
      {
        "type": "body_inside_body",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250,204,21,0.4)"
      }
    ]
  },
  {
    "id": "bullish_kicker",
    "type": "Bullish Reversal",
    "name": "Bullish Kicker",
    "candles": [
      {
        "open": 60,
        "high": 62,
        "low": 45,
        "close": 48,
        "trend": "downtrend"
      },
      {
        "open": 65,
        "high": 85,
        "low": 64,
        "close": 82
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "shadow_to_shadow",
        "direction": "up",
        "color": "rgba(163,230,53,0.3)"
      }
    ]
  },
  {
    "id": "concealing_baby_swallow",
    "type": "Bullish Reversal",
    "name": "Concealing Baby Swallow",
    "candles": [
      {
        "open": 80,
        "high": 80,
        "low": 50,
        "close": 50,
        "trend": "downtrend"
      },
      {
        "open": 48,
        "high": 48,
        "low": 30,
        "close": 30
      },
      {
        "open": 35,
        "high": 45,
        "low": 32,
        "close": 40
      },
      {
        "open": 48,
        "high": 49,
        "low": 20,
        "close": 22
      }
    ]
  },
  {
    "id": "dragonfly_doji",
    "type": "Bullish Reversal",
    "name": "Dragonfly Doji",
    "candles": [
      {
        "open": 50,
        "high": 50.5,
        "low": 30,
        "close": 50.2,
        "trend": "downtrend"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      },
      {
        "type": "shadow",
        "candleIndex": 0,
        "shadowType": "lower",
        "color": "rgba(250,204,21,0.4)"
      }
    ]
  },
  {
    "id": "hammer",
    "type": "Bullish Reversal",
    "name": "Hammer",
    "candles": [
      {
        "open": 38,
        "high": 42,
        "low": 20,
        "close": 40,
        "trend": "downtrend"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(250, 204, 21, 0.4)",
        "borderColor": "#FACC15"
      },
      {
        "type": "shadow",
        "candleIndex": 0,
        "shadowType": "lower",
        "color": "rgba(250, 204, 21, 0.4)",
        "borderColor": "#FACC15"
      }
    ]
  },
  {
    "id": "homing_pigeon",
    "type": "Bullish Reversal",
    "name": "Homing Pigeon",
    "candles": [
      {
        "open": 60,
        "high": 62,
        "low": 40,
        "close": 42,
        "trend": "downtrend"
      },
      {
        "open": 50,
        "high": 52,
        "low": 44,
        "close": 46
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      },
      {
        "type": "body_inside_body",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250,204,21,0.4)"
      }
    ]
  },
  {
    "id": "inverted_hammer",
    "type": "Bullish Reversal",
    "name": "Inverted Hammer",
    "candles": [
      {
        "open": 40,
        "high": 60,
        "low": 38,
        "close": 42,
        "trend": "downtrend"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      },
      {
        "type": "shadow",
        "candleIndex": 0,
        "shadowType": "upper",
        "color": "rgba(250,204,21,0.4)"
      }
    ]
  },
  {
    "id": "ladder_bottom",
    "type": "Bullish Reversal",
    "name": "Ladder Bottom",
    "candles": [
      {
        "open": 80,
        "high": 81,
        "low": 65,
        "close": 68,
        "trend": "downtrend"
      },
      {
        "open": 67,
        "high": 68,
        "low": 55,
        "close": 58
      },
      {
        "open": 57,
        "high": 58,
        "low": 45,
        "close": 48
      },
      {
        "open": 47,
        "high": 55,
        "low": 44,
        "close": 46
      },
      {
        "open": 50,
        "high": 75,
        "low": 49,
        "close": 72
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 3,
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 4,
        "color": "rgba(34,197,94,0.4)"
      }
    ]
  },
  {
    "id": "matching_low",
    "type": "Bullish Reversal",
    "name": "Matching Low",
    "candles": [
      {
        "open": 60,
        "high": 62,
        "low": 40,
        "close": 40,
        "trend": "downtrend"
      },
      {
        "open": 45,
        "high": 47,
        "low": 38,
        "close": 40
      }
    ],
    "keyFeatures": [
      {
        "type": "line",
        "yValue1Property": "close",
        "candleIndex1": 0,
        "yValue2Property": "close",
        "candleIndex2": 1,
        "color": "#FACC15",
        "lineWidth": 2,
        "dashed": true
      }
    ]
  },
  {
    "id": "morning_doji_star",
    "type": "Bullish Reversal",
    "name": "Morning Doji Star",
    "candles": [
      {
        "open": 70,
        "high": 72,
        "low": 50,
        "close": 52,
        "trend": "downtrend"
      },
      {
        "open": 42,
        "high": 45,
        "low": 39,
        "close": 42.5
      },
      {
        "open": 55,
        "high": 80,
        "low": 53,
        "close": 78
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(250,204,21,0.4)"
      },
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "body_to_body",
        "direction": "down",
        "color": "rgba(163,230,53,0.3)"
      },
      {
        "type": "gap",
        "candleIndex1": 1,
        "candleIndex2": 2,
        "gapType": "body_to_body",
        "direction": "up",
        "color": "rgba(163,230,53,0.3)"
      }
    ]
  },
  {
    "id": "morning_star",
    "type": "Bullish Reversal",
    "name": "Morning Star",
    "candles": [
      {
        "open": 70,
        "high": 72,
        "low": 50,
        "close": 52,
        "trend": "downtrend"
      },
      {
        "open": 45,
        "high": 48,
        "low": 42,
        "close": 46
      },
      {
        "open": 55,
        "high": 80,
        "low": 53,
        "close": 78
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(250,204,21,0.4)",
        "borderColor": "#FACC15"
      },
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "body_to_body",
        "direction": "down",
        "color": "rgba(163,230,53,0.3)"
      },
      {
        "type": "gap",
        "candleIndex1": 1,
        "candleIndex2": 2,
        "gapType": "body_to_body",
        "direction": "up",
        "color": "rgba(163,230,53,0.3)"
      }
    ]
  },
  {
    "id": "piercing_line",
    "type": "Bullish Reversal",
    "name": "Piercing Line",
    "candles": [
      {
        "open": 60,
        "high": 62,
        "low": 40,
        "close": 42,
        "trend": "downtrend"
      },
      {
        "open": 38,
        "high": 55,
        "low": 37,
        "close": 53
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "low_to_open",
        "direction": "down",
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "penetration",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(34,197,94,0.3)"
      }
    ]
  },
  {
    "id": "stick_sandwich",
    "type": "Bullish Reversal",
    "name": "Stick Sandwich",
    "candles": [
      {
        "open": 60,
        "high": 62,
        "low": 40,
        "close": 42,
        "trend": "downtrend"
      },
      {
        "open": 45,
        "high": 58,
        "low": 44,
        "close": 55
      },
      {
        "open": 53,
        "high": 55,
        "low": 41,
        "close": 42.5
      }
    ],
    "keyFeatures": [
      {
        "type": "line",
        "yValue1Property": "close",
        "candleIndex1": 0,
        "yValue2Property": "close",
        "candleIndex2": 2,
        "color": "#FACC15",
        "lineWidth": 2,
        "dashed": true
      }
    ]
  },
  {
    "id": "three_inside_up",
    "type": "Bullish Reversal",
    "name": "Three Inside Up",
    "candles": [
      {
        "open": 70,
        "high": 72,
        "low": 50,
        "close": 52,
        "trend": "downtrend"
      },
      {
        "open": 55,
        "high": 60,
        "low": 53,
        "close": 58
      },
      {
        "open": 59,
        "high": 75,
        "low": 58,
        "close": 73
      }
    ],
    "keyFeatures": [
      {
        "type": "body_inside_body",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(34,197,94,0.4)"
      }
    ]
  },
  {
    "id": "three_outside_up",
    "type": "Bullish Reversal",
    "name": "Three Outside Up",
    "candles": [
      {
        "open": 60,
        "high": 62,
        "low": 50,
        "close": 52,
        "trend": "downtrend"
      },
      {
        "open": 50,
        "high": 68,
        "low": 48,
        "close": 65
      },
      {
        "open": 66,
        "high": 75,
        "low": 64,
        "close": 72
      }
    ],
    "keyFeatures": [
      {
        "type": "engulf",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(34,197,94,0.4)"
      }
    ]
  },
  {
    "id": "three_white_soldiers",
    "type": "Bullish Reversal",
    "name": "Three White Soldiers",
    "candles": [
      {
        "open": 30,
        "high": 45,
        "low": 28,
        "close": 43,
        "trend": "downtrend"
      },
      {
        "open": 42,
        "high": 58,
        "low": 40,
        "close": 55
      },
      {
        "open": 54,
        "high": 70,
        "low": 52,
        "close": 68
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(34,197,94,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(34,197,94,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(34,197,94,0.3)"
      }
    ]
  },
  {
    "id": "tower_bottom",
    "type": "Bullish Reversal",
    "name": "Tower Bottom",
    "candles": [
      {
        "open": 70,
        "high": 72,
        "low": 55,
        "close": 58,
        "trend": "downtrend"
      },
      {
        "open": 57,
        "high": 59,
        "low": 48,
        "close": 50
      },
      {
        "open": 50,
        "high": 53,
        "low": 47,
        "close": 49
      },
      {
        "open": 49,
        "high": 52,
        "low": 46,
        "close": 48
      },
      {
        "open": 48,
        "high": 51,
        "low": 47,
        "close": 50
      },
      {
        "open": 52,
        "high": 65,
        "low": 50,
        "close": 63
      },
      {
        "open": 64,
        "high": 78,
        "low": 62,
        "close": 75
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(239,68,68,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 6,
        "color": "rgba(34,197,94,0.3)"
      }
    ]
  },
  {
    "id": "tri_star_bullish",
    "type": "Bullish Reversal",
    "name": "Tri-Star (Bullish)",
    "candles": [
      {
        "open": 55,
        "high": 58,
        "low": 52,
        "close": 55.5,
        "trend": "downtrend"
      },
      {
        "open": 48,
        "high": 51,
        "low": 45,
        "close": 48.5
      },
      {
        "open": 54,
        "high": 57,
        "low": 51,
        "close": 54.5
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(250,204,21,0.4)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "body_to_body",
        "direction": "down",
        "color": "rgba(163,230,53,0.2)"
      },
      {
        "type": "gap",
        "candleIndex1": 1,
        "candleIndex2": 2,
        "gapType": "body_to_body",
        "direction": "up",
        "color": "rgba(163,230,53,0.2)"
      }
    ]
  },
  {
    "id": "tweezer_bottoms",
    "type": "Bullish Reversal",
    "name": "Tweezer Bottoms",
    "candles": [
      {
        "open": 50,
        "high": 52,
        "low": 30,
        "close": 35,
        "trend": "downtrend"
      },
      {
        "open": 33,
        "high": 48,
        "low": 30.5,
        "close": 45
      }
    ],
    "keyFeatures": [
      {
        "type": "low_point",
        "candleIndex": 0,
        "color": "rgba(250, 204, 21, 0.6)",
        "radius": 5
      },
      {
        "type": "low_point",
        "candleIndex": 1,
        "color": "rgba(250, 204, 21, 0.6)",
        "radius": 5
      },
      {
        "type": "line",
        "yValue1Property": "low",
        "candleIndex1": 0,
        "yValue2Property": "low",
        "candleIndex2": 1,
        "color": "#FACC15",
        "lineWidth": 2,
        "dashed": true
      }
    ]
  },
  {
    "id": "unique_three_river_bottom",
    "type": "Bullish Reversal",
    "name": "Unique Three River Bottom",
    "candles": [
      {
        "open": 70,
        "high": 72,
        "low": 50,
        "close": 52,
        "trend": "downtrend"
      },
      {
        "open": 55,
        "high": 57,
        "low": 45,
        "close": 48
      },
      {
        "open": 46,
        "high": 50,
        "low": 44,
        "close": 49
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(239,68,68,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(34,197,94,0.3)"
      }
    ]
  },
  {
    "id": "mat_hold",
    "type": "Bullish Continuation",
    "name": "Mat Hold",
    "candles": [
      {
        "open": 30,
        "high": 60,
        "low": 28,
        "close": 58,
        "trend": "uptrend"
      },
      {
        "open": 62,
        "high": 65,
        "low": 59,
        "close": 60
      },
      {
        "open": 60,
        "high": 63,
        "low": 57,
        "close": 58
      },
      {
        "open": 58,
        "high": 61,
        "low": 56,
        "close": 59
      },
      {
        "open": 68,
        "high": 90,
        "low": 67,
        "close": 88
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(34,197,94,0.3)"
      },
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "direction": "up",
        "color": "rgba(163,230,53,0.2)"
      },
      {
        "type": "gap",
        "candleIndex1": 3,
        "candleIndex2": 4,
        "direction": "up",
        "color": "rgba(163,230,53,0.2)"
      },
      {
        "type": "body",
        "candleIndex": 4,
        "color": "rgba(34,197,94,0.4)"
      }
    ]
  },
  {
    "id": "rising_three_methods",
    "type": "Bullish Continuation",
    "name": "Rising Three Methods",
    "candles": [
      {
        "open": 30,
        "high": 60,
        "low": 28,
        "close": 58,
        "trend": "uptrend"
      },
      {
        "open": 55,
        "high": 57,
        "low": 50,
        "close": 52
      },
      {
        "open": 50,
        "high": 53,
        "low": 47,
        "close": 48
      },
      {
        "open": 47,
        "high": 49,
        "low": 44,
        "close": 46
      },
      {
        "open": 45,
        "high": 75,
        "low": 43,
        "close": 70
      }
    ],
    "keyFeatures": [
      {
        "type": "body_range",
        "candleIndex": 0,
        "color": "rgba(250,204,21,0.2)"
      },
      {
        "type": "body",
        "candleIndex": 4,
        "color": "rgba(34,197,94,0.4)"
      }
    ]
  },
  {
    "id": "separating_lines_bullish",
    "type": "Bullish Continuation",
    "name": "Separating Lines (Bullish)",
    "candles": [
      {
        "open": 60,
        "high": 62,
        "low": 40,
        "close": 42,
        "trend": "uptrend"
      },
      {
        "open": 60,
        "high": 80,
        "low": 58,
        "close": 78
      }
    ],
    "keyFeatures": [
      {
        "type": "line",
        "yValue1Property": "open",
        "candleIndex1": 0,
        "yValue2Property": "open",
        "candleIndex2": 1,
        "color": "#FACC15",
        "lineWidth": 2,
        "dashed": true
      }
    ]
  },
  {
    "id": "side_by_side_white_lines_bullish",
    "type": "Bullish Continuation",
    "name": "Side-by-Side White Lines (Bullish)",
    "candles": [
      {
        "open": 30,
        "high": 50,
        "low": 28,
        "close": 48,
        "trend": "uptrend"
      },
      {
        "open": 55,
        "high": 65,
        "low": 53,
        "close": 63
      },
      {
        "open": 56,
        "high": 66,
        "low": 54,
        "close": 64
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "direction": "up",
        "color": "rgba(163,230,53,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(34,197,94,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(34,197,94,0.3)"
      }
    ]
  },
  {
    "id": "upside_gap_three_methods",
    "type": "Bullish Continuation",
    "name": "Upside Gap Three Methods",
    "candles": [
      {
        "open": 30,
        "high": 50,
        "low": 28,
        "close": 48,
        "trend": "uptrend"
      },
      {
        "open": 55,
        "high": 75,
        "low": 53,
        "close": 73
      },
      {
        "open": 70,
        "high": 72,
        "low": 50,
        "close": 52
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "direction": "up",
        "color": "rgba(163,230,53,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(250,204,21,0.3)"
      }
    ]
  },
  {
    "id": "upside_tasuki_gap",
    "type": "Bullish Continuation",
    "name": "Upside Tasuki Gap",
    "candles": [
      {
        "open": 30,
        "high": 50,
        "low": 28,
        "close": 48,
        "trend": "uptrend"
      },
      {
        "open": 55,
        "high": 65,
        "low": 53,
        "close": 63
      },
      {
        "open": 60,
        "high": 61,
        "low": 52,
        "close": 54
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "direction": "up",
        "color": "rgba(163,230,53,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(250,204,21,0.3)"
      }
    ]
  },
  {
    "id": "bullish_marubozu",
    "type": "Bullish Strength/Continuation",
    "name": "Bullish Marubozu",
    "candles": [
      {
        "open": 40,
        "high": 70,
        "low": 40,
        "close": 70,
        "trend": "any"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      }
    ]
  },
  {
    "id": "abandoned_baby_bearish",
    "type": "Bearish Reversal",
    "name": "Abandoned Baby (Bearish)",
    "candles": [
      {
        "open": 30,
        "high": 52,
        "low": 28,
        "close": 50,
        "trend": "uptrend"
      },
      {
        "open": 60,
        "high": 62,
        "low": 58,
        "close": 60.5
      },
      {
        "open": 45,
        "high": 47,
        "low": 20,
        "close": 22
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(250,204,21,0.4)"
      },
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "shadow_to_shadow",
        "direction": "up",
        "color": "rgba(239,68,68,0.3)"
      },
      {
        "type": "gap",
        "candleIndex1": 1,
        "candleIndex2": 2,
        "gapType": "shadow_to_shadow",
        "direction": "down",
        "color": "rgba(239,68,68,0.3)"
      }
    ]
  },
  {
    "id": "advance_block",
    "type": "Bearish Reversal",
    "name": "Advance Block",
    "candles": [
      {
        "open": 30,
        "high": 50,
        "low": 28,
        "close": 48,
        "trend": "uptrend"
      },
      {
        "open": 47,
        "high": 60,
        "low": 46,
        "close": 57
      },
      {
        "open": 56,
        "high": 65,
        "low": 55,
        "close": 61
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(34,197,94,0.2)"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(34,197,94,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(34,197,94,0.4)"
      }
    ]
  },
  {
    "id": "belt_hold_bearish",
    "type": "Bearish Reversal",
    "name": "Belt Hold (Bearish)",
    "candles": [
      {
        "open": 70,
        "high": 70,
        "low": 45,
        "close": 47,
        "trend": "uptrend"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      }
    ]
  },
  {
    "id": "breakaway_bearish",
    "type": "Bearish Reversal",
    "name": "Breakaway (Bearish)",
    "candles": [
      {
        "open": 30,
        "high": 52,
        "low": 28,
        "close": 50,
        "trend": "uptrend"
      },
      {
        "open": 57,
        "high": 67,
        "low": 55,
        "close": 65
      },
      {
        "open": 66,
        "high": 75,
        "low": 64,
        "close": 72
      },
      {
        "open": 73,
        "high": 80,
        "low": 71,
        "close": 78
      },
      {
        "open": 79,
        "high": 81,
        "low": 40,
        "close": 45
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "body_to_body",
        "direction": "up",
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 4,
        "color": "rgba(239,68,68,0.4)"
      }
    ]
  },
  {
    "id": "bearish_engulfing",
    "type": "Bearish Reversal",
    "name": "Bearish Engulfing",
    "candles": [
      {
        "open": 50,
        "high": 55,
        "low": 48,
        "close": 54,
        "trend": "uptrend"
      },
      {
        "open": 56,
        "high": 57,
        "low": 40,
        "close": 42
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(34, 197, 94, 0.3)",
        "borderColor": "#22C55E"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(239, 68, 68, 0.3)",
        "borderColor": "#EF4444"
      },
      {
        "type": "engulf",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250, 204, 21, 0.4)",
        "borderColor": "#FACC15"
      }
    ]
  },
  {
    "id": "bearish_harami",
    "type": "Bearish Reversal",
    "name": "Bearish Harami",
    "candles": [
      {
        "open": 40,
        "high": 62,
        "low": 38,
        "close": 60,
        "trend": "uptrend"
      },
      {
        "open": 55,
        "high": 57,
        "low": 50,
        "close": 52
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      },
      {
        "type": "body_inside_body",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250,204,21,0.4)"
      }
    ]
  },
  {
    "id": "bearish_harami_cross",
    "type": "Bearish Reversal",
    "name": "Bearish Harami Cross",
    "candles": [
      {
        "open": 40,
        "high": 62,
        "low": 38,
        "close": 60,
        "trend": "uptrend"
      },
      {
        "open": 55,
        "high": 59,
        "low": 53,
        "close": 55.5
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      },
      {
        "type": "body_inside_body",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250,204,21,0.4)"
      }
    ]
  },
  {
    "id": "bearish_kicker",
    "type": "Bearish Reversal",
    "name": "Bearish Kicker",
    "candles": [
      {
        "open": 40,
        "high": 62,
        "low": 38,
        "close": 60,
        "trend": "uptrend"
      },
      {
        "open": 35,
        "high": 36,
        "low": 18,
        "close": 20
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "shadow_to_shadow",
        "direction": "down",
        "color": "rgba(239,68,68,0.3)"
      }
    ]
  },
  {
    "id": "dark_cloud_cover",
    "type": "Bearish Reversal",
    "name": "Dark Cloud Cover",
    "candles": [
      {
        "open": 40,
        "high": 62,
        "low": 38,
        "close": 60,
        "trend": "uptrend"
      },
      {
        "open": 64,
        "high": 65,
        "low": 45,
        "close": 47
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "high_to_open",
        "direction": "up",
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "penetration",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(239,68,68,0.3)"
      }
    ]
  },
  {
    "id": "deliberation_stalled",
    "type": "Bearish Reversal",
    "name": "Deliberation / Stalled Pattern",
    "candles": [
      {
        "open": 30,
        "high": 55,
        "low": 28,
        "close": 53,
        "trend": "uptrend"
      },
      {
        "open": 54,
        "high": 70,
        "low": 53,
        "close": 68
      },
      {
        "open": 70,
        "high": 75,
        "low": 69,
        "close": 72
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(34,197,94,0.2)"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(34,197,94,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(34,197,94,0.4)"
      }
    ]
  },
  {
    "id": "evening_doji_star",
    "type": "Bearish Reversal",
    "name": "Evening Doji Star",
    "candles": [
      {
        "open": 30,
        "high": 52,
        "low": 28,
        "close": 50,
        "trend": "uptrend"
      },
      {
        "open": 58,
        "high": 61,
        "low": 55,
        "close": 58.5
      },
      {
        "open": 45,
        "high": 47,
        "low": 20,
        "close": 22
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(250,204,21,0.4)"
      },
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "body_to_body",
        "direction": "up",
        "color": "rgba(239,68,68,0.3)"
      },
      {
        "type": "gap",
        "candleIndex1": 1,
        "candleIndex2": 2,
        "gapType": "body_to_body",
        "direction": "down",
        "color": "rgba(239,68,68,0.3)"
      }
    ]
  },
  {
    "id": "evening_star",
    "type": "Bearish Reversal",
    "name": "Evening Star",
    "candles": [
      {
        "open": 50,
        "high": 72,
        "low": 48,
        "close": 70,
        "trend": "uptrend"
      },
      {
        "open": 75,
        "high": 78,
        "low": 72,
        "close": 74
      },
      {
        "open": 65,
        "high": 67,
        "low": 40,
        "close": 42
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(250,204,21,0.4)"
      },
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "body_to_body",
        "direction": "up",
        "color": "rgba(239,68,68,0.3)"
      },
      {
        "type": "gap",
        "candleIndex1": 1,
        "candleIndex2": 2,
        "gapType": "body_to_body",
        "direction": "down",
        "color": "rgba(239,68,68,0.3)"
      }
    ]
  },
  {
    "id": "gravestone_doji",
    "type": "Bearish Reversal",
    "name": "Gravestone Doji",
    "candles": [
      {
        "open": 50,
        "high": 70,
        "low": 49.5,
        "close": 50.2,
        "trend": "uptrend"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      },
      {
        "type": "shadow",
        "candleIndex": 0,
        "shadowType": "upper",
        "color": "rgba(250,204,21,0.4)"
      }
    ]
  },
  {
    "id": "hanging_man",
    "type": "Bearish Reversal",
    "name": "Hanging Man",
    "candles": [
      {
        "open": 78,
        "high": 82,
        "low": 60,
        "close": 80,
        "trend": "uptrend"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      },
      {
        "type": "shadow",
        "candleIndex": 0,
        "shadowType": "lower",
        "color": "rgba(250,204,21,0.4)"
      }
    ]
  },
  {
    "id": "shooting_star",
    "type": "Bearish Reversal",
    "name": "Shooting Star",
    "candles": [
      {
        "open": 72,
        "high": 90,
        "low": 68,
        "close": 70,
        "trend": "uptrend"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      },
      {
        "type": "shadow",
        "candleIndex": 0,
        "shadowType": "upper",
        "color": "rgba(250,204,21,0.4)"
      }
    ]
  },
  {
    "id": "three_black_crows",
    "type": "Bearish Reversal",
    "name": "Three Black Crows",
    "candles": [
      {
        "open": 70,
        "high": 72,
        "low": 55,
        "close": 57,
        "trend": "uptrend"
      },
      {
        "open": 58,
        "high": 60,
        "low": 42,
        "close": 45
      },
      {
        "open": 46,
        "high": 48,
        "low": 30,
        "close": 32
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(239,68,68,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(239,68,68,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(239,68,68,0.3)"
      }
    ]
  },
  {
    "id": "three_inside_down",
    "type": "Bearish Reversal",
    "name": "Three Inside Down",
    "candles": [
      {
        "open": 50,
        "high": 72,
        "low": 48,
        "close": 70,
        "trend": "uptrend"
      },
      {
        "open": 65,
        "high": 67,
        "low": 60,
        "close": 62
      },
      {
        "open": 61,
        "high": 62,
        "low": 45,
        "close": 47
      }
    ],
    "keyFeatures": [
      {
        "type": "body_inside_body",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(239,68,68,0.4)"
      }
    ]
  },
  {
    "id": "three_outside_down",
    "type": "Bearish Reversal",
    "name": "Three Outside Down",
    "candles": [
      {
        "open": 40,
        "high": 52,
        "low": 38,
        "close": 50,
        "trend": "uptrend"
      },
      {
        "open": 52,
        "high": 54,
        "low": 35,
        "close": 38
      },
      {
        "open": 37,
        "high": 39,
        "low": 28,
        "close": 30
      }
    ],
    "keyFeatures": [
      {
        "type": "engulf",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(239,68,68,0.4)"
      }
    ]
  },
  {
    "id": "tower_top",
    "type": "Bearish Reversal",
    "name": "Tower Top",
    "candles": [
      {
        "open": 30,
        "high": 45,
        "low": 28,
        "close": 42,
        "trend": "uptrend"
      },
      {
        "open": 43,
        "high": 55,
        "low": 41,
        "close": 52
      },
      {
        "open": 52,
        "high": 55,
        "low": 49,
        "close": 53
      },
      {
        "open": 53,
        "high": 56,
        "low": 50,
        "close": 51
      },
      {
        "open": 51,
        "high": 54,
        "low": 48,
        "close": 50
      },
      {
        "open": 48,
        "high": 50,
        "low": 35,
        "close": 38
      },
      {
        "open": 37,
        "high": 39,
        "low": 25,
        "close": 28
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(34,197,94,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 6,
        "color": "rgba(239,68,68,0.3)"
      }
    ]
  },
  {
    "id": "tri_star_bearish",
    "type": "Bearish Reversal",
    "name": "Tri-Star (Bearish)",
    "candles": [
      {
        "open": 45,
        "high": 48,
        "low": 42,
        "close": 45.5,
        "trend": "uptrend"
      },
      {
        "open": 52,
        "high": 55,
        "low": 49,
        "close": 52.5
      },
      {
        "open": 46,
        "high": 49,
        "low": 43,
        "close": 46.5
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0,
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(250,204,21,0.4)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "gapType": "body_to_body",
        "direction": "up",
        "color": "rgba(239,68,68,0.2)"
      },
      {
        "type": "gap",
        "candleIndex1": 1,
        "candleIndex2": 2,
        "gapType": "body_to_body",
        "direction": "down",
        "color": "rgba(239,68,68,0.2)"
      }
    ]
  },
  {
    "id": "tweezer_tops",
    "type": "Bearish Reversal",
    "name": "Tweezer Tops",
    "candles": [
      {
        "open": 50,
        "high": 70,
        "low": 48,
        "close": 65,
        "trend": "uptrend"
      },
      {
        "open": 67,
        "high": 70.5,
        "low": 52,
        "close": 55
      }
    ],
    "keyFeatures": [
      {
        "type": "high_point",
        "candleIndex": 0,
        "color": "rgba(250, 204, 21, 0.6)",
        "radius": 5
      },
      {
        "type": "high_point",
        "candleIndex": 1,
        "color": "rgba(250, 204, 21, 0.6)",
        "radius": 5
      },
      {
        "type": "line",
        "yValue1Property": "high",
        "candleIndex1": 0,
        "yValue2Property": "high",
        "candleIndex2": 1,
        "color": "#FACC15",
        "lineWidth": 2,
        "dashed": true
      }
    ]
  },
  {
    "id": "downside_gap_three_methods",
    "type": "Bearish Continuation",
    "name": "Downside Gap Three Methods",
    "candles": [
      {
        "open": 70,
        "high": 72,
        "low": 50,
        "close": 52,
        "trend": "downtrend"
      },
      {
        "open": 45,
        "high": 47,
        "low": 25,
        "close": 27
      },
      {
        "open": 30,
        "high": 50,
        "low": 28,
        "close": 48
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "direction": "down",
        "color": "rgba(239,68,68,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(250,204,21,0.3)"
      }
    ]
  },
  {
    "id": "downside_tasuki_gap",
    "type": "Bearish Continuation",
    "name": "Downside Tasuki Gap",
    "candles": [
      {
        "open": 70,
        "high": 72,
        "low": 50,
        "close": 52,
        "trend": "downtrend"
      },
      {
        "open": 45,
        "high": 47,
        "low": 35,
        "close": 37
      },
      {
        "open": 40,
        "high": 48,
        "low": 39,
        "close": 46
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "direction": "down",
        "color": "rgba(239,68,68,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 2,
        "color": "rgba(250,204,21,0.3)"
      }
    ]
  },
  {
    "id": "falling_three_methods",
    "type": "Bearish Continuation",
    "name": "Falling Three Methods",
    "candles": [
      {
        "open": 70,
        "high": 72,
        "low": 40,
        "close": 42,
        "trend": "downtrend"
      },
      {
        "open": 45,
        "high": 48,
        "low": 43,
        "close": 46
      },
      {
        "open": 48,
        "high": 51,
        "low": 46,
        "close": 49
      },
      {
        "open": 50,
        "high": 53,
        "low": 48,
        "close": 51
      },
      {
        "open": 55,
        "high": 57,
        "low": 25,
        "close": 30
      }
    ],
    "keyFeatures": [
      {
        "type": "body_range",
        "candleIndex": 0,
        "color": "rgba(250,204,21,0.2)"
      },
      {
        "type": "body",
        "candleIndex": 4,
        "color": "rgba(239,68,68,0.4)"
      }
    ]
  },
  {
    "id": "in_neck_line",
    "type": "Bearish Continuation",
    "name": "In Neck Line",
    "candles": [
      {
        "open": 60,
        "high": 61,
        "low": 40,
        "close": 42,
        "trend": "downtrend"
      },
      {
        "open": 38,
        "high": 48,
        "low": 37,
        "close": 44
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "direction": "down",
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(34,197,94,0.3)"
      }
    ]
  },
  {
    "id": "on_neck_line",
    "type": "Bearish Continuation",
    "name": "On Neck Line",
    "candles": [
      {
        "open": 60,
        "high": 61,
        "low": 40,
        "close": 42,
        "trend": "downtrend"
      },
      {
        "open": 38,
        "high": 45,
        "low": 37,
        "close": 41.5
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "direction": "down",
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "line",
        "yValue1Property": "close",
        "candleIndex1": 0,
        "yValue2Property": "close",
        "candleIndex2": 1,
        "color": "#FACC15",
        "lineWidth": 2,
        "dashed": true
      }
    ]
  },
  {
    "id": "separating_lines_bearish",
    "type": "Bearish Continuation",
    "name": "Separating Lines (Bearish)",
    "candles": [
      {
        "open": 40,
        "high": 62,
        "low": 38,
        "close": 60,
        "trend": "downtrend"
      },
      {
        "open": 40,
        "high": 42,
        "low": 20,
        "close": 22
      }
    ],
    "keyFeatures": [
      {
        "type": "line",
        "yValue1Property": "open",
        "candleIndex1": 0,
        "yValue2Property": "open",
        "candleIndex2": 1,
        "color": "#FACC15",
        "lineWidth": 2,
        "dashed": true
      }
    ]
  },
  {
    "id": "thrusting_line",
    "type": "Bearish Continuation",
    "name": "Thrusting Line",
    "candles": [
      {
        "open": 60,
        "high": 61,
        "low": 40,
        "close": 42,
        "trend": "downtrend"
      },
      {
        "open": 38,
        "high": 52,
        "low": 37,
        "close": 49
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "direction": "down",
        "color": "rgba(250,204,21,0.3)"
      },
      {
        "type": "body",
        "candleIndex": 1,
        "color": "rgba(34,197,94,0.3)"
      }
    ]
  },
  {
    "id": "two_black_gapping_candles",
    "type": "Bearish Continuation",
    "name": "Two Black Gapping Candles",
    "candles": [
      {
        "open": 65,
        "high": 66,
        "low": 50,
        "close": 52,
        "trend": "uptrend_peak"
      },
      {
        "open": 48,
        "high": 49,
        "low": 35,
        "close": 38
      }
    ],
    "keyFeatures": [
      {
        "type": "gap",
        "candleIndex1": 0,
        "candleIndex2": 1,
        "direction": "down",
        "color": "rgba(239,68,68,0.3)"
      }
    ]
  },
  {
    "id": "bearish_marubozu",
    "type": "Bearish Strength/Continuation",
    "name": "Bearish Marubozu",
    "candles": [
      {
        "open": 70,
        "high": 70,
        "low": 40,
        "close": 40,
        "trend": "any"
      }
    ],
    "keyFeatures": [
      {
        "type": "body",
        "candleIndex": 0
      }
    ]
  },
  {
    "id": "retracing_wicks",
    "type": "Reversal Signals by Wicks",
    "name": "Retracing Wicks",
    "candles": [
      {
        "open": 50,
        "high": 60,
        "low": 48,
        "close": 58,
        "trend": "uptrend"
      },
      {
        "open": 58,
        "high": 82,
        "low": 57,
        "close": 70
      },
      {
        "open": 70,
        "high": 81.5,
        "low": 62,
        "close": 64
      },
      {
        "open": 64,
        "high": 65,
        "low": 40,
        "close": 45
      }
    ],
    "keyFeatures": [
      {
        "type": "shadow",
        "candleIndex": 1,
        "shadowType": "upper"
      },
      {
        "type": "shadow",
        "candleIndex": 2,
        "shadowType": "upper"
      },
      {
        "type": "line",
        "yValue1Property": "high",
        "candleIndex1": 1,
        "yValue2Property": "high",
        "candleIndex2": 2,
        "color": "#FACC15",
        "lineWidth": 2,
        "dashed": true
      },
      {
        "type": "body",
        "candleIndex": 3,
        "color": "rgba(239, 68, 68, 0.4)",
        "borderColor": "#EF4444"
      }
    ]
  },
  {
    "id": "advancing_wicks",
    "type": "Reversal Signals by Wicks",
    "name": "Advancing Wicks",
    "candles": [
      {
        "open": 90,
        "high": 92,
        "low": 75,
        "close": 78,
        "trend": "downtrend"
      },
      {
        "open": 78,
        "high": 79,
        "low": 48,
        "close": 62"
      },
      {
        "open": 62,
        "high": 68,
        "low": 49,
        "close": 67"
      },
      {
        "open": 67,
        "high": 90,
        "low": 66,
        "close": 88
      }
    ],
    "keyFeatures": [
      {
        "type": "shadow",
        "candleIndex": 1,
        "shadowType": "lower"
      },
      {
        "type": "shadow",
        "candleIndex": 2,
        "shadowType": "lower"
      },
      {
        "type": "line",
        "yValue1Property": "low",
        "candleIndex1": 1,
        "yValue2Property": "low",
        "candleIndex2": 2,
        "color": "#FACC15",
        "lineWidth": 2,
        "dashed": true
      },
      {
        "type": "body",
        "candleIndex": 3,
        "color": "rgba(34, 197, 94, 0.4)",
        "borderColor": "#22C55E"
      }
    ]
  }
];
