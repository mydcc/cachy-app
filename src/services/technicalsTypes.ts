/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Decimal } from "decimal.js";

export interface Kline {
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  time: number; // Unix timestamp in ms
}

export interface IndicatorResult {
  name: string;
  params?: string; // e.g. "14, 14"
  value: Decimal;
  signal?: Decimal; // For MACD signal line, etc.
  histogram?: Decimal; // For MACD histogram
  action: "Buy" | "Sell" | "Neutral";
}

export interface TechnicalsData {
  oscillators: IndicatorResult[];
  movingAverages: IndicatorResult[];
  pivots: {
    classic: {
      r3: Decimal;
      r2: Decimal;
      r1: Decimal;
      p: Decimal;
      s1: Decimal;
      s2: Decimal;
      s3: Decimal;
    };
  };
  pivotBasis?: {
    high: Decimal;
    low: Decimal;
    close: Decimal;
    open: Decimal;
  };
  summary: {
    buy: number;
    sell: number;
    neutral: number;
    action: "Buy" | "Sell" | "Neutral";
  };
}


export interface SerializedIndicatorResult {
  name: string;
  params?: string;
  value: string;
  signal?: string;
  histogram?: string;
  action: "Buy" | "Sell" | "Neutral";
}

export interface SerializedTechnicalsData {
  oscillators: SerializedIndicatorResult[];
  movingAverages: SerializedIndicatorResult[];
  pivots: {
    classic: {
      p: string; r1: string; r2: string; r3: string;
      s1: string; s2: string; s3: string;
    }
  };
  pivotBasis?: {
    high: string; low: string; open: string; close: string;
  };
  summary: TechnicalsData['summary'];
}

export interface WorkerCalculatePayload {
  klines: {
    time: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }[];
  settings: any; // IndicatorSettings
}

export type WorkerMessageType = "CALCULATE" | "RESULT" | "ERROR";

export interface WorkerMessage {
  type: WorkerMessageType;
  payload?: any;
  error?: string;
  id?: string;
}
