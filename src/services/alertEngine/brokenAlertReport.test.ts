/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * FEAT-0028 — what the trader is told about an alert that can never fire.
 *
 * The setting decides whether they are interrupted. It does not decide whether
 * the failure is recorded: these tests pin that separation, because the whole
 * hazard of an inert alert is that it is invisible, and a preference that could
 * make it *more* invisible would defeat the point.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readable } from "svelte/store";

vi.mock("$app/environment", () => ({ browser: true, dev: false }));

const loggerError = vi.fn();
vi.mock("../logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: (...a: unknown[]) => loggerError(...a),
  },
}));

const toastError = vi.fn();
vi.mock("../toastService.svelte", () => ({
  toastService: {
    error: (...a: unknown[]) => toastError(...a),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Echo the key and the values, the way an assertion can read them back.
vi.mock("../../locales/i18n", () => ({
  _: readable((key: string, opts?: { values?: Record<string, unknown> }) =>
    opts?.values ? `${key}:${JSON.stringify(opts.values)}` : key,
  ),
}));

import { settingsState } from "../../stores/settings.svelte";
import { settingsAwareUnevaluableSink } from "./ruleLoopWiring";
import type { UnevaluableRule } from "./ruleEvaluationLoop";

/**
 * Read at import, before any test writes to the store — otherwise the
 * assertion below would only prove that `beforeEach` ran.
 */
const SHIPPED_DEFAULT = settingsState.brokenAlertReport;

const BROKEN: UnevaluableRule = {
  ruleId: "rule-7",
  name: "RSI oversold",
  symbol: "BTCUSDT",
  reason:
    "indicator 'ichimoku' has no JavaScript implementation on the alert path",
};

describe("reporting an alert that can never fire", () => {
  beforeEach(() => {
    loggerError.mockReset();
    toastError.mockReset();
    settingsState.brokenAlertReport = "notify";
  });

  it("defaults to notifying, because this failure is invisible by nature", () => {
    expect(SHIPPED_DEFAULT).toBe("notify");
  });

  it("shows the trader their own name for the alert, not its id", () => {
    settingsAwareUnevaluableSink(BROKEN);

    expect(toastError).toHaveBeenCalledTimes(1);
    const [message] = toastError.mock.calls[0];
    expect(message).toContain("dashboard.alerts.brokenRule.toast");
    expect(message).toContain("RSI oversold");
    expect(message).toContain("BTCUSDT");
  });

  it("logs the id rather than the name, because a log line gets copied around", () => {
    settingsAwareUnevaluableSink(BROKEN);

    const [, logged] = loggerError.mock.calls[0];
    expect(logged).toContain("rule-7");
    expect(logged).not.toContain("RSI oversold");
  });

  it("stops interrupting when the trader chooses log-only", () => {
    settingsState.brokenAlertReport = "log";

    settingsAwareUnevaluableSink(BROKEN);

    expect(toastError).not.toHaveBeenCalled();
  });

  it("still records it on log-only — the setting hides the interruption, not the failure", () => {
    settingsState.brokenAlertReport = "log";

    settingsAwareUnevaluableSink(BROKEN);

    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError.mock.calls[0][1]).toContain("never fire");
  });

  it("falls back to the id when a rule has no name", () => {
    settingsAwareUnevaluableSink({ ...BROKEN, name: "" });

    expect(toastError.mock.calls[0][0]).toContain("rule-7");
  });
});
