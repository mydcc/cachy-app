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
 * The TypeScript door to the rule schema.
 *
 * Every question here is answered by the Rust core in `technicals-wasm`, never
 * re-decided locally. What this file adds is loading, error shape and honesty
 * about the loaded state.
 *
 * **Why every call throws when the core is not loaded.** The sibling alert
 * service guards each method with `if (!this.instance) return;`, and because
 * nothing ever calls its loader, every alert evaluation in the shipped build
 * silently does nothing. A validator that silently returns on an unloaded core
 * would be worse still: the caller would read "no refusals" as "valid" and arm a
 * rule nothing had checked. So the failure is loud, and `isReady()` exists for
 * callers that want to ask before committing.
 */

import { logger } from "../../services/logger";
import type { RuleDocument, Refused, RuleRefusal, ConsequenceLevel } from "./types";

/** The functions `technicals-wasm/src/rule/exports.rs` puts on the module. */
interface RuleWasmExports {
  rule_schema_version(): number;
  rule_validate(documentJson: string): string;
  rule_content_hash(documentJson: string): string;
  rule_authorise(documentJson: string, requestedLevel: string): void;
  rule_warmup_candles(documentJson: string): number;
  rule_timeframes(documentJson: string): string[];
  rule_from_alert_json(alertJson: string, timeframe: string, createdAtMs: number): string;
  default: (wasmBinaryPath: string) => Promise<unknown>;
}

/**
 * A refusal from the core, in the shape the rest of the app already handles.
 *
 * Mirrors `ExchangeUnsupportedError`: `message` is developer English that is
 * never shown to a trader, and `translationKey` is the user-facing channel that
 * `getDisplayMessage` renders. `refusals` carries the full list, because the
 * core reports every problem in one pass so a caller can repair a document
 * without one round trip per mistake.
 */
export class RuleRefusedError extends Error {
  public readonly refusals: RuleRefusal[];
  public readonly translationKey: string;

  constructor(refusals: RuleRefusal[]) {
    const detail =
      refusals.map((r) => `${r.code} at \`${r.field}\`: ${r.detail}`).join("; ") ||
      "rule refused without a stated reason";
    super(detail);
    this.name = "RuleRefusedError";
    this.refusals = refusals;
    // The first refusal drives the headline; the rest stay available on
    // `refusals` for a UI that wants to annotate every offending field.
    this.translationKey = refusals[0]?.i18n_key ?? "rules.refusal.unknownField";
  }
}

export function isRuleRefusedError(e: unknown): e is RuleRefusedError {
  return e instanceof RuleRefusedError;
}

/** Raised when the core has not been loaded. Never confused with a refusal. */
export class RuleCoreUnavailableError extends Error {
  public readonly translationKey = "rules.coreUnavailable";
  constructor(cause?: unknown) {
    super(`rule schema core is not loaded${cause ? `: ${String(cause)}` : ""}`);
    this.name = "RuleCoreUnavailableError";
  }
}

/**
 * A thrown `JsValue` from the core is the serialised `Refused` struct. Anything
 * else is a genuine failure and is not dressed up as a refusal — mislabelling a
 * crash as "your rule is invalid" would send a trader hunting a bug in their
 * strategy.
 */
function toRefusedError(thrown: unknown): Error {
  const candidate = thrown as Partial<Refused> | undefined;
  if (candidate && Array.isArray(candidate.refusals)) {
    return new RuleRefusedError(candidate.refusals as RuleRefusal[]);
  }
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

export type RuleWasmLoader = () => Promise<RuleWasmExports>;

const defaultLoader: RuleWasmLoader = async () => {
  const wasmJsPath = "/wasm/technicals_wasm.js";
  const mod = (await import(/* @vite-ignore */ wasmJsPath)) as RuleWasmExports;
  await mod.default("/wasm/technicals_wasm_bg.wasm");
  return mod;
};

class RuleSchemaService {
  private core: RuleWasmExports | null = null;
  private loading: Promise<void> | null = null;
  private loader: RuleWasmLoader = defaultLoader;

  /** Swap the loader. Exists for tests; production never calls it. */
  setLoader(loader: RuleWasmLoader) {
    this.loader = loader;
    this.core = null;
    this.loading = null;
  }

  async load(): Promise<void> {
    if (this.core) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        this.core = await this.loader();
        logger.log("alerts", "[RuleSchema] core loaded, schema v" + this.core.rule_schema_version());
      } catch (err) {
        // Clear the latch so a later attempt can retry rather than being stuck
        // on one transient failure for the life of the tab.
        this.loading = null;
        logger.error("alerts", "[RuleSchema] failed to load core", err);
        throw new RuleCoreUnavailableError(err);
      }
    })();

    return this.loading;
  }

  isReady(): boolean {
    return this.core !== null;
  }

  private require(): RuleWasmExports {
    if (!this.core) throw new RuleCoreUnavailableError();
    return this.core;
  }

  /** The schema version this build authors and reads. */
  schemaVersion(): number {
    return this.require().rule_schema_version();
  }

  /**
   * Validate a document and return its canonical form.
   *
   * Store what comes back, not what went in: the core normalises on the way out
   * (`240m` becomes `4h`), and a stored non-canonical spelling would hash
   * differently from the rule it names.
   */
  validate(document: RuleDocument): RuleDocument {
    const core = this.require();
    try {
      return JSON.parse(core.rule_validate(JSON.stringify(document))) as RuleDocument;
    } catch (e) {
      throw toRefusedError(e);
    }
  }

  /** The content hash identifying this strategy in a journal or decision log. */
  contentHash(document: RuleDocument): string {
    const core = this.require();
    try {
      return core.rule_content_hash(JSON.stringify(document));
    } catch (e) {
      throw toRefusedError(e);
    }
  }

  /**
   * Throw unless the document authorises `level`.
   *
   * The check an executor makes before doing anything. A `notify` rule asked to
   * send is refused here, naming `action.consequence_level`.
   */
  authorise(document: RuleDocument, level: ConsequenceLevel): void {
    const core = this.require();
    try {
      core.rule_authorise(JSON.stringify(document), level);
    } catch (e) {
      throw toRefusedError(e);
    }
  }

  /** Candles of trigger history needed before the rule can produce a verdict. */
  warmupCandles(document: RuleDocument): number {
    const core = this.require();
    try {
      return core.rule_warmup_candles(JSON.stringify(document));
    } catch (e) {
      throw toRefusedError(e);
    }
  }

  /** Every timeframe the document reads, canonical spellings, trigger first. */
  timeframes(document: RuleDocument): string[] {
    const core = this.require();
    try {
      return core.rule_timeframes(JSON.stringify(document));
    } catch (e) {
      throw toRefusedError(e);
    }
  }

  /**
   * Express a shipped FEAT-0027 alert as a rule document.
   *
   * Goes through the core so the conversion is the one the differential tests in
   * `rule/legacy.rs` cover, rather than a second one written here.
   */
  fromAlert(alert: unknown, timeframe: string, createdAtMs: number): RuleDocument {
    const core = this.require();
    try {
      return JSON.parse(
        core.rule_from_alert_json(JSON.stringify(alert), timeframe, createdAtMs),
      ) as RuleDocument;
    } catch (e) {
      throw toRefusedError(e);
    }
  }
}

export const ruleSchema = new RuleSchemaService();
