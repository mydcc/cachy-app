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

/**
 * The lifecycle vocabulary shared by the builder footer and the Manage detail
 * (FEAT-0393, FEAT-0543).
 *
 * Explicit `Record<…>` maps rather than computed keys: the generated
 * `TranslationKey` union is what catches a locale entry someone deleted, and a
 * computed key silently opts out of it. One map also means the footer and the
 * read-only row cannot drift into two spellings of the same setting.
 */

import type { TranslationKey } from "../../locales/schema";
import type {
  EvaluationMode,
  TriggerFrequency,
  TriggerMethod,
} from "../rules/types";

export const FREQUENCY_KEYS: Record<TriggerFrequency, TranslationKey> = {
  once: "dashboard.alerts.panel.lifecycle.frequencyOption.once",
  every_time: "dashboard.alerts.panel.lifecycle.frequencyOption.every_time",
  once_per_candle_close:
    "dashboard.alerts.panel.lifecycle.frequencyOption.once_per_candle_close",
};

export const METHOD_KEYS: Record<TriggerMethod, TranslationKey> = {
  in_app: "dashboard.alerts.panel.lifecycle.methodOption.in_app",
  browser: "dashboard.alerts.panel.lifecycle.methodOption.browser",
  sound: "dashboard.alerts.panel.lifecycle.methodOption.sound",
  email: "dashboard.alerts.panel.lifecycle.methodOption.email",
  discord: "dashboard.alerts.panel.lifecycle.methodOption.discord",
  telegram: "dashboard.alerts.panel.lifecycle.methodOption.telegram",
};

/** The methods this app can deliver on-device. */
export const LOCAL_METHODS: readonly TriggerMethod[] = ["in_app", "browser", "sound"];

/** The methods that leave the device, in the order the selector shows them. */
export const EXTERNAL_METHODS: readonly TriggerMethod[] = ["email", "discord", "telegram"];

export const EVALUATION_KEYS: Record<EvaluationMode, TranslationKey> = {
  close: "dashboard.alerts.panel.evaluationModeOption.close",
  intrabar: "dashboard.alerts.panel.evaluationModeOption.intrabar",
};
