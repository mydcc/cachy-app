<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  FEAT-0021 — placing the position the calculator just sized.

  Everything here reads from `tradeState.currentTradeData`, the calculator's
  own output, so the numbers submitted are the numbers displayed. The
  FEAT-0011 gate re-derives them anyway and refuses a mismatch; this panel
  does not get to be the only thing standing between a typo and an order.

  Order types and time-in-force come from `exchangeCapabilities`, which serves
  each venue's own declaration (FEAT-0017). An unsupported option is shown
  disabled with a reason rather than omitted, because a missing control looks
  like a missing feature. The gate reads the same declarations, so a control
  this panel gets wrong is still refused before transport.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";
  import { untrack } from "svelte";
  import { _ } from "../../locales/i18n";
  import { accountState } from "../../stores/account.svelte";
  import {
    accountVerification,
    credentialPresence,
    ensureCurrent,
    subjectFor,
    VERIFICATION_INPUT_DEBOUNCE_MS,
  } from "../../stores/accountVerification.svelte";
  import { tradeState } from "../../stores/trade.svelte";
  import { resultsState } from "../../stores/results.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { paperState } from "../../stores/paperTrading.svelte";
  import { modalState } from "../../stores/modal.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { toastService } from "../../services/toastService.svelte";
  import {
    capabilitiesOf,
    supportsOrderType,
    unsupportedReasonKey,
    unsupportedTimeInForceReasonKey,
    type OrderEntryType,
    type TimeInForce,
  } from "../../services/exchangeCapabilities";
  import { stopLossPlacement } from "../../services/exchange/stopLossPlacement";
  import {
    orderPlacementService,
    narrowTradeType,
    type PlacementResult,
  } from "../../services/orderPlacementService";
  import { activeExchange } from "../../services/exchange";
  import ActiveAccountChip from "../shared/ActiveAccountChip.svelte";
  import { translateRefusal, MAX_ACCOUNT_STATE_AGE_MS } from "../../services/orderGate";
  import { marketState, META_FETCH_RETRY_MS } from "../../stores/market.svelte";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { formatDynamicDecimal, parseDecimal } from "../../utils/utils";
  import type { TranslationKey } from "../../locales/schema";

  const exchange = $derived(settingsState.apiProvider);
  const caps = $derived(capabilitiesOf(exchange));
  // BUG-0649 — the note has to agree with the gate. `attached` means nothing to
  // warn about, so no branch renders for it.
  const stopPlacement = $derived(stopLossPlacement(caps));
  /**
   * BUG-0649 — the note has to answer a second question too: is there a stop to
   * talk about at all? The gate asks exactly this (`orderGate.ts:977` — a
   * positive Decimal, with zero and missing alike meaning none).
   *
   * Gating on capability alone put "clear the stop to send the order
   * deliberately unprotected" on every Bitget entry, including the many that
   * carry no stop — an instruction that cannot be carried out, on the same
   * screen, for the same trader this defect was observed on. The gate would not
   * have refused either. That is this bug's own shape, reintroduced by its own
   * fix: the panel saying something the gate will not act on.
   *
   * `$derived.by` because `data` is declared further down; the closure runs at
   * read time, once every binding is initialised.
   */
  const stopRequested = $derived.by(
    () => data?.stopLossPrice instanceof Decimal && data.stopLossPrice.gt(0),
  );
  const tifSupported = $derived(caps.timeInForce.length > 0);

  /**
   * The delta the calculator itself treats as "did not change"
   * (`calculatorService.ts:429`). Named so the two cannot drift apart quietly.
   */
  const UNPERSISTED_PRICE_DELTA = new Decimal("0.000001");

  /**
   * A level the trader has stated, or `null` for none.
   *
   * `parseDecimal`, not the raw constructor: `TradeTargetSchema.price` carries no
   * numeric refine (`trade.svelte.ts:159`), so any string can reach this, and a
   * throw inside a `$derived` breaks the panel on every re-evaluation — the
   * auto-update ticker would take it down, not just the click.
   */
  function positiveDecimal(value: Decimal | string | null | undefined): Decimal | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = value instanceof Decimal ? value : parseDecimal(value);
    return parsed.isFinite() && parsed.gt(0) ? parsed : null;
  }

  /**
   * BUG-0648 — `data` is the last calculation that *succeeded*, and nothing
   * nulls it when a later one is refused: `clearResults()` resets
   * `resultsState`, never `tradeState`. So clearing the stop can leave `data`
   * still carrying it, and the summary still showing a size derived from it.
   *
   * `submit()` builds the order from `data`, and the gate compares the payload
   * against the intent that same `data` produced — so it cannot see the
   * disagreement. `orderGate.ts:1872` does the same for leverage: it compares
   * `payload.leverage` with `displayed.leverage`, and both arrive from `data`.
   * Everywhere else the gate is the right place; this is the exception, and the
   * reason is structural rather than a matter of taste.
   *
   * The comparison covers every field the calculation *consumes*, not the ones
   * that happened to come to mind. `positionSize` and `requiredMargin` are
   * functions of account size, risk percentage, entry price, stop, leverage and
   * fees (`calculatorService.ts:478-492`), so guarding four of those six left
   * the same defect one field over.
   */
  const staleInputs = $derived.by(() => {
    if (!data) return false;

    /*
     * `undefined` means the store states nothing here, which is not the same as
     * stating "cleared": an empty field is a claim, a missing field is not one.
     * These fields are `string | null` in production and never undefined, so the
     * branch changes no runtime behaviour — it stops a partial test mock from
     * reading as a withdrawal. Revisit it if they ever become genuinely
     * optional: the guard would then silently stop covering them, with no type
     * error to say so.
     */
    const stated = (value: string | null | undefined): string | null =>
      value === undefined ? null : value;

    /*
     * The calculator skips the store write-back when the derived stop moved
     * less than this (`calculatorService.ts:429`) and assigns `currentTradeData`
     * regardless — so `data` can hold a stop the store never received. Comparing
     * exactly would refuse that order forever, with no input that helps. Same
     * tolerance, so "agree" means what the calculator meant by "changed".
     */
    const priceAgrees = (
      calculated: Decimal | null | undefined,
      value: string | Decimal | null | undefined,
    ) => {
      const claim = stated(value as string | null | undefined);
      if (claim === null) return true;
      const fromCalculation = positiveDecimal(calculated);
      const fromInput = positiveDecimal(claim);
      if (fromCalculation === null && fromInput === null) return true;
      if (fromCalculation === null || fromInput === null) return false;
      return fromCalculation
        .minus(fromInput)
        .abs()
        .lte(UNPERSISTED_PRICE_DELTA);
    };

    /*
     * Scalars are different: zero is a value here, not an absence, and an empty
     * one is not a trader statement at all — an empty leverage makes the
     * calculator substitute `DEFAULT_LEVERAGE`, which is exactly the source it
     * read, so comparing that against zero would refuse every order until the
     * trader typed a leverage they never wanted to change. Skip the empty case
     * and compare the rest for what it is.
     */
    const scalarAgrees = (
      calculated: Decimal | null | undefined,
      value: string | null | undefined,
    ) => {
      const claim = stated(value);
      if (claim === null || claim === "") return true;
      if (calculated === null || calculated === undefined) return false;
      return calculated.isFinite() && calculated.eq(parseDecimal(claim));
    };

    /*
     * Take-profit legs travel with the order, so a leg the trader deleted or
     * reordered has to count as stale too — same rule as the stop, per leg.
     * `submit()` builds `takeProfits` from `data.targets` in order, so order is
     * part of what gets sent, not a cosmetic detail.
     */
    const calculatedLegs = (data.targets ?? []).map((t) => positiveDecimal(t.price));
    const inputLegs = (tradeState.targets ?? []).map((t) => t.price);
    const sameLegs =
      tradeState.targets === undefined ||
      (calculatedLegs.length === inputLegs.length &&
        calculatedLegs.every((leg, index) => priceAgrees(leg, inputLegs[index])));

    return (
      !priceAgrees(data.stopLossPrice, tradeState.stopLossPrice) ||
      !priceAgrees(data.entryPrice, tradeState.entryPrice) ||
      !scalarAgrees(data.leverage, tradeState.leverage) ||
      !scalarAgrees(data.accountSize, tradeState.accountSize) ||
      !scalarAgrees(data.riskPercentage, tradeState.riskPercentage) ||
      !sameLegs ||
      (tradeState.symbol !== undefined && data.symbol !== tradeState.symbol) ||
      (tradeState.tradeType !== undefined && data.tradeType !== tradeState.tradeType)
    );
  });

  let entryType = $state<OrderEntryType>("market");
  let timeInForce = $state<TimeInForce>("GTC");
  let submitting = $state(false);
  const tifVisible = $derived(entryType === "limit");
  let result = $state<PlacementResult | null>(null);

  /*
   * The time-in-force as it applies to the venue that is actually active.
   *
   * `apiProvider` changes at runtime and the raw selection outlives the
   * switch: picking POST_ONLY on Bitunix and moving to Bitget left a
   * maker-only instruction sitting on a venue that declares no time-in-force
   * at all. "Maker only" quietly becoming "whatever fills" is a different
   * order — different fill, different fee.
   *
   * Derived rather than reset through an `$effect`, so the submitted value
   * cannot lag the venue by an effect tick. `timeInForce` stays the user's
   * raw choice; this is what the order is built from, and it is always
   * consistent with `caps` by construction.
   *
   * The fallback is always GTC, never the venue's first declared value.
   * Reaching for `caps.timeInForce[0]` would look tidier and is a trap: a
   * venue declaring `["IOC", …]` would hand an unasked-for IOC to a trader who
   * selected nothing, and IOC cancels whatever does not fill immediately. GTC
   * is the only value that is neutral — it is what an order does anyway with
   * no constraint attached, and the one `orderPlacementService` may drop
   * without changing how the order executes. A venue that cannot take even
   * that gets refused by the gate, loudly, which beats inventing a value
   * nobody chose.
   */
  const effectiveTimeInForce = $derived<TimeInForce>(
    caps.timeInForce.includes(timeInForce) ? timeInForce : "GTC",
  );

  // Trigger is omitted since Bitunix does not support trigger orders via API
  const ALL_TYPES: OrderEntryType[] = ["market", "limit"];

  /*
   * FEAT-0253 — the calculator has to know the entry order type, because a
   * market entry is a taker fill and a limit entry a maker fill, and the entry
   * fee follows that.
   *
   * Published to the store rather than read back from it: this panel stays the
   * only writer and keeps rendering from its own local state, so it does not
   * depend on the store to show which button is active. The same one-way
   * mirror the leverage and fee fields use.
   */
  $effect(() => {
    tradeState.entryOrderType = entryType;
  });

  function selectOrderType(t: OrderEntryType) {
    entryType = t;
    if (t === "market") {
      settingsState.autoUpdatePriceInput = true;
      const currentSym = tradeState.symbol;
      if (currentSym) {
        const norm = normalizeSymbol(currentSym, exchange === "bitget" ? "bitget" : "bitunix");
        const livePrice = marketState.data[norm]?.lastPrice;
        if (livePrice) {
          tradeState.entryPrice = new Decimal(livePrice).toString();
        }
      }
    }
  }

  const data = $derived(tradeState.currentTradeData);

  const levDecimal = $derived(parseDecimal(tradeState.leverage));
  const marginCost = $derived(
    data && data.positionSize instanceof Decimal && data.entryPrice instanceof Decimal && levDecimal.gt(0)
      ? data.positionSize.mul(data.entryPrice).div(levDecimal)
      : null
  );

  const meta = $derived(
    data?.symbol ? marketState.symbolMeta[normalizeSymbol(data.symbol, exchange || "bitunix")] : undefined,
  );

  const hasMeta = $derived(
    exchange !== "bitunix" || meta !== undefined,
  );

  const tradingAvailable = $derived(
    !meta || (meta.symbolStatus === "OPEN" && meta.isApiSupported !== false),
  );

  const isBelowMinVolume = $derived(
    meta?.minTradeVolume && data?.positionSize instanceof Decimal
      ? data.positionSize.lt(new Decimal(meta.minTradeVolume))
      : false,
  );

  const isAboveMaxVolume = $derived.by(() => {
    if (!meta || !(data?.positionSize instanceof Decimal)) return false;
    const max = entryType === "market" ? meta.maxMarketOrderVolume : meta.maxLimitOrderVolume;
    return max ? data.positionSize.gt(new Decimal(max)) : false;
  });

  const volumeValid = $derived(!isBelowMinVolume && !isAboveMaxVolume);

  // The calculator's margin-exceeded flag (required margin above the
  // displayed account balance). The warning is already shown next to the
  // results; offering the order anyway would ask the gate to refuse what
  // the panel can see (BUG-0549).
  const marginFunded = $derived(!resultsState.isMarginExceeded);

  // The same check against the balance for the active mode — required
  // margin above the free USDT the gate will measure. This is the state
  // AC3 names: the calculator flag above compares against the typed account
  // size, which can differ from the wallet in either direction. Unknown —
  // balance not loaded, wrong mode's snapshot on hand (BUG-0565), or the
  // calculator produced no margin figure — never disables: the panel is
  // only a hint, the gate stays the authority and refuses what it measures.
  //
  // Best-effort hint, intentionally unpaired: this pairs the trade store
  // with the account store across time boundaries, so it may disagree with
  // the gate's recomputation for a moment. It must never become
  // enforcement — only the gate's own measurement refuses.
  const liveAvailable = $derived(
    accountState.readUsdtBalance(paperState.enabled ? "paper" : "live")
      ?.available,
  );
  const liveMarginFunded = $derived.by(() => {
    if (
      data?.requiredMargin instanceof Decimal &&
      liveAvailable instanceof Decimal
    ) {
      // A non-finite reading measures nothing — same rule as the gate:
      // don't disable, the unmeasured hint below says why.
      if (!liveAvailable.isFinite()) return true;
      return data.requiredMargin.lte(liveAvailable);
    }
    return true;
  });
  // No live reading to compare against: the gate records an
  // `availableMarginUnmeasured` skip and the venue decides (IDEA-0563).
  const balanceUnmeasured = $derived(
    data?.requiredMargin instanceof Decimal &&
      (liveAvailable === undefined ||
        (liveAvailable instanceof Decimal && !liveAvailable.isFinite())),
  );
  // Live-only shortfall: the typed balance covers the margin but the wallet
  // does not — the state where the calculator flag stays green while the
  // control stays disabled.
  const liveMarginShortfall = $derived(
    data?.requiredMargin instanceof Decimal &&
      liveAvailable instanceof Decimal &&
      data.requiredMargin.gt(liveAvailable),
  );

  /*
   * BUG-0560: the panel used to be ready whenever the calculator had a size and
   * the wallet could cover it, so live order entry was offered on credentials
   * nobody had ever presented to the exchange. Now it needs a verdict from a
   * read that came back — and, per the panel's own contract, it says why.
   *
   * Two deliberate exclusions, because the gate remains the authority:
   * paper mode consults nothing (the simulated book needs no credentials, and
   * AC5 requires that it not start asking), and a *rejected* credential is not
   * this panel's business either — the gate refuses an order the venue will not
   * accept, with a far more specific message than "unverified" could be. What
   * the panel adds is the case the gate cannot see: an account whose state is
   * simply unknown, where the old panel said nothing at all.
   */
  const verificationSubject = $derived(
    subjectFor(exchange === "bitget" ? "bitget" : "bitunix"),
  );
  const accountVerificationStatus = $derived(
    accountVerification.statusFor(verificationSubject),
  );
  // Everything that is not a verdict blocks. That is `unconfigured` too, which
  // this used to wave through on the argument that "no credential" cannot
  // coexist with a live balance — it can. `accountState` keeps its balance
  // hydrated after the key fields are cleared, and the sidebar is what
  // hydrates it, so the panel would have gone live on a funded account with no
  // credential behind it. The gate refuses such an order at submit, so this is
  // defence in depth rather than the last line — but AC4 says "unknown or
  // stale", and an account nobody has read is exactly that.
  //
  // `rejected` is the one state left open, on purpose: the gate has something
  // better to say about it than this panel could — the venue's own refusal,
  // which names the actual problem. That reasoning is about `failure:
  // "rejected"`, where the venue named a reason; for `failure: "unreachable"`
  // there is nothing to pass on, and this panel stays silent anyway rather than
  // duplicating the card's wording. If it ever does word that state, the
  // exemption needs revisiting rather than inheriting this sentence.
  const accountUnverified = $derived(
    !paperState.enabled &&
      accountVerificationStatus !== "verified" &&
      accountVerificationStatus !== "rejected",
  );

  // Why live entry is blocked, when the reason is the credentials themselves.
  // Three situations, three sentences, because they are three different problems
  // and this panel used to fold them into one. A Bitget account with a key and a
  // secret and no passphrase is missing the one field its venue needs, and
  // telling it "no API credentials configured" invites a trader to delete the two
  // fields that were fine.
  const credentialsPresence = $derived(
    credentialPresence(verificationSubject),
  );
  const credentialIssue = $derived.by(() => {
    if (credentialsPresence === "none") return "none";
    if (credentialsPresence !== "incomplete") return null;
    // The passphrase only exists on the Bitunix form's absence; a Bitget
    // trader has never seen one and would not know what to type.
    return exchange === "bitget" ? "passphrase" : "incomplete";
  });

  // Make sure a verdict exists whenever the panel is on screen, so the state
  // above resolves to something instead of staying unknown until the trader
  // presses a disabled button. Cheap when a verdict is current; one signed read
  // when it is missing, expired or about edited credentials.
  //
  // All three credential fields are read, not just the key, because this effect
  // is the only thing that re-asks. The fingerprint hashes all three, so editing
  // the passphrase on its own does make the verdict stale — and with the key as
  // the only dependency, nothing re-ran: the panel reported a check in progress
  // while none was running, and live entry stayed blocked until an unrelated
  // keystroke or an account switch.
  //
  // Debounced, because these reads are signed and the fields being watched are
  // text inputs. Every character typed into a field that already has content
  // changes the fingerprint, so every character is a different credential set as
  // far as the store is concerned, and it would spend one request per keystroke.
  // Waiting for the typing to settle asks the same question once. The store's
  // own retry floor cannot do this: it has no way to tell a rotated key from a
  // key mid-keystroke, because a read is never issued for a half-empty set at all.
  $effect(() => {
    if (paperState.enabled) return;
    void verificationSubject?.id;
    void verificationSubject?.keys.key;
    void verificationSubject?.keys.secret;
    void verificationSubject?.keys.passphrase;
    void accountVerificationStatus;
    const provider = exchange === "bitget" ? "bitget" : "bitunix";
    const handle = setTimeout(
        () => untrack(() => void ensureCurrent(provider)),
        VERIFICATION_INPUT_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  });

  // Owns the store's clock. This panel is mounted unconditionally by the app
  // shell, which makes it the one place that can hold the tick for as long as
  // the app is open; without a live clock the derived freshness comparison has
  // no reactive input, so an expired verdict would keep reading `verified` for
  // as long as the tab stayed open. The tick moves one number — no request, no
  // venue, no verdict — and the effect above re-runs when the window closes.
  $effect(() => accountVerification.startClock());

  // The calculator produces a size only when the inputs make one derivable.
  // AC 1: Trading-pair metadata is available in a store before submit action is enabled.
  // AC 3: Below minTradeVolume or above max order volume disables submit action.
  // AC 4: symbolStatus != OPEN or isApiSupported == false shows trading as unavailable.
  const ready = $derived(
    data !== null &&
      data.positionSize instanceof Decimal &&
      data.positionSize.gt(0) &&
      hasMeta &&
      tradingAvailable &&
      volumeValid &&
      marginFunded &&
      liveMarginFunded &&
      !accountUnverified,
  );

  // An unreadable trade direction is not a long: the control stays
  // disabled, the summary falls back to notReady, and submit returns
  // early — three independent walls before entrySideOf's contract throw.
  const tradeDirectionKnown = $derived(
    data !== null && narrowTradeType(data.tradeType) !== null,
  );

  // BUG-0628 — the refetch must key off the trade input, not the calculator
  // output. The calculator refuses without metadata (no orderable size), so
  // `data` is null exactly when a refetch is most needed; gating on
  // `data?.symbol` deadlocks after a silently failed fetch (no further
  // trading-pairs request, panel stuck on notReady + noSymbolMeta).
  // `metaRetryTick` re-arms one attempt per store cooldown, because nothing
  // else re-fires once the calculator has refused. `fetchKeyedMeta`
  // deduplicates concurrent callers, so this cannot become a fetch storm.
  let metaRetryTick = $state(0);
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- bare read registers the retry driver as an effect dependency
    metaRetryTick;
    const needed = tradeState.symbol || data?.symbol;
    if (!needed || exchange !== "bitunix") return;
    // Read the store directly: `meta` follows the calculator output, which
    // is null while the guard refuses — the entry may still be cached.
    if (marketState.symbolMeta[normalizeSymbol(needed, exchange || "bitunix")] !== undefined) return;
    void activeExchange().account.fetchTradingPairInfo(needed);
    const timer = setTimeout(() => {
      metaRetryTick += 1;
    }, META_FETCH_RETRY_MS);
    return () => clearTimeout(timer);
  });

  const typeLabel = (t: OrderEntryType) =>
    $_(`orderEntry.type.${t}` as TranslationKey);

  /**
   * How an outcome reads to the trader.
   *
   * A gate refusal has to go through `translateRefusal`: its messages name the
   * field and the numbers that disagreed, so translating the bare key leaves
   * literal `{field}` and `{age}` on screen.
   */
  function errorText(r: PlacementResult): string {
    if (r.refusal) {
      return translateRefusal(r.refusal, (key, options) =>
        $_(key as TranslationKey, options),
      );
    }
    return $_((r.errorKey ?? "orderEntry.errors.entryRejected") as TranslationKey);
  }

  /**
   * The exchange's own text, when there is any.
   *
   * Some errors carry an i18n key here rather than prose — "apiErrors.generic"
   * is one. svelte-i18n echoes a key it does not know, so a round trip through
   * `$_` translates the ones that are keys and leaves real exchange text
   * alone, instead of printing a dotted path at the trader.
   */
  function detailText(detail: string): string {
    const translated = $_(detail as TranslationKey);
    return translated === detail ? detail : translated;
  }

  function isAccountStateStale(): boolean {
    const at = tradeState.remoteAccountStateAt;
    return at === undefined || Date.now() - at > MAX_ACCOUNT_STATE_AGE_MS;
  }

  async function submit() {
    if (!ready || !data || submitting || !tradeDirectionKnown) return;

    /*
     * BUG-0648 — refuse before anything is built. The gate cannot catch this:
     * it compares the payload against the intent, and both come from `data`.
     */
    if (staleInputs) {
      uiState.showError($_("orderEntry.errors.staleCalculation"));
      return;
    }

    // BUG-0507: the guard belongs where it is checked. Set before the
    // confirmation dialog — the await below lasts as long as the trader
    // takes to answer, and for that whole window the flag used to stay
    // false with the button enabled. The existing finally clears it on
    // every exit path, including cancel.
    submitting = true;
    try {
      const isPaper = paperState.enabled;
      // BUG-0555 — one normalized fact set feeds BOTH the confirmation
      // text below and the EntryPlan further down, so the trader confirms
      // exactly what is sent. Derived here, before the modal call — never
      // re-read from inputs afterwards.
      //
      // Absence rules (same as the service's): a stop counts as present
      // only when it is a positive Decimal — empty AND zero both render
      // the explicit no-stop-loss key, never a numeric zero. A TP leg
      // counts only when its price is a positive Decimal; zero legs render
      // the explicit no-take-profit state, not silence. The plan carries
      // prices only (EntryPlan.takeProfits is Decimal[] — portions are
      // not part of the payload), so the payload stays prices-only while
      // the confirmation shows each leg with its configured portion from
      // the same normalized targets.
      const legs = (data.targets ?? []).filter(
        (t) => t.price instanceof Decimal && t.price.gt(0),
      );
      const takeProfits = legs.map((t) => t.price);
      // Portion of the position closed at this leg, as configured in the
      // calculator targets (50 → "50%"). A missing/unreadable portion
      // renders explicitly, never as a silent zero.
      const formatLegPercent = (value: unknown): string =>
        value instanceof Decimal && value.isFinite()
          ? `${value.toString()}%`
          : "—";
      const quotePrecision = meta?.quotePrecision ?? 2;
      const stopLossPrice = data.stopLossPrice;
      const stopPresent =
        stopLossPrice instanceof Decimal && stopLossPrice.gt(0);
      const leverage = data.leverage;
      const leveragePresent =
        leverage instanceof Decimal && leverage.gt(0);
      const marginMode = tradeState.remoteMarginMode;
      const facts = {
        symbol: data.symbol,
        tradeType: data.tradeType,
        qty: data.positionSize,
        entryPrice: data.entryPrice,
        stopLossPrice,
        leverage,
        marginMode,
        takeProfits,
        side: $_(
          (data.tradeType === "short"
            ? "orderEntry.side.short"
            : "orderEntry.side.long") as TranslationKey,
        ),
        entryTypeLabel: typeLabel(entryType),
        takeProfitText:
          legs.length > 0
            ? legs
                .map((t, i) =>
                  $_("orderEntry.confirm.takeProfitLeg", {
                    values: {
                      index: String(i + 1),
                      price: formatDynamicDecimal(t.price, quotePrecision),
                      percent: formatLegPercent(t.percent),
                    },
                  }),
                )
                .join(", ")
            : $_("orderEntry.confirm.noTakeProfit"),
        stopText: stopPresent
          ? formatDynamicDecimal(stopLossPrice, quotePrecision)
          : $_("orderEntry.confirm.noStopLoss"),
        leverageText: leveragePresent
          ? marginMode
            ? $_("orderEntry.confirm.leverageLine", {
                values: {
                  leverage: leverage.toString(),
                  marginMode,
                },
              })
            : $_("orderEntry.confirm.leverageLineNoMode", {
                values: { leverage: leverage.toString() },
              })
          : $_("orderEntry.confirm.leverageUnknown"),
      };
      const confirmed = await modalState.show(
        isPaper
          ? $_("orderEntry.confirm.titlePaper")
          : $_("orderEntry.confirm.titleLive"),
        $_("orderEntry.confirm.message", {
          values: {
            side: facts.side,
            qty: facts.qty.toString(),
            symbol: facts.symbol,
            type: facts.entryTypeLabel,
            takeProfit: facts.takeProfitText,
            stop: facts.stopText,
            leverage: facts.leverageText,
          },
        }),
        "confirm",
      );
      if (confirmed !== true) return;

      // Cleared on confirm only: a cancelled dialog leaves the previous
      // result banner exactly as it was.
      result = null;
      // The gate refuses an entry whose leverage/margin-mode read is older
      // than its limit, and nothing refreshes that read except a symbol
      // change — so a panel left open for a minute refuses every order and
      // tells the trader to refresh something they have no control over.
      // Re-read it here instead. A failed read leaves the old timestamp to
      // age out, so the gate still refuses rather than being talked round.
      if (!isPaper && isAccountStateStale()) {
        await activeExchange().account.fetchLeverageMarginMode(data.symbol);
      }

      result = await orderPlacementService.placeEntryGroup({
        exchange,
        symbol: facts.symbol,
        // BUG-0494 — a clicked order is manual provenance. Required on the
        // plan so no call site can omit it and silently take the live path.
        origin: "manual",
        // BUG-0550 — EntryPlan.tradeType is "long" | "short" while the
        // calculator's tradeType stays a free string. An unreadable spelling
        // is not a long: tradeDirectionKnown already disabled the control
        // and guarded submit, so this fallback below is unreachable — it
        // exists only because the union demands a direction.
        tradeType: narrowTradeType(facts.tradeType) ?? "long",
        entryType,
        qty: facts.qty,
        entryPrice: facts.entryPrice,
        stopLossPrice: facts.stopLossPrice,
        takeProfits: facts.takeProfits,
        accountSize: data.accountSize,
        riskPercentage: data.riskPercentage,
        leverage: facts.leverage,
        marginMode: facts.marginMode,
        accountStateAt: tradeState.remoteAccountStateAt,
        timeInForce: entryType === "limit" ? effectiveTimeInForce : undefined,
      });

      if (result.unprotected) {
        // The one outcome this whole flow exists to make impossible to miss.
        // A toast is not enough on its own, so the banner below stays until
        // the next submission.
        toastService.error($_("orderEntry.errors.unprotected"));
      } else if (!result.entryPlaced) {
        toastService.error(errorText(result));
      } else {
        toastService.success($_("orderEntry.placed"));
      }
    } catch (e) {
      uiState.showError($_("orderEntry.errors.entryRejected"));
      result = {
        entryPlaced: false,
        stopLoss: "none",
        takeProfit: "none",
        unprotected: false,
        errorDetail: e instanceof Error ? e.message : String(e),
      };
    } finally {
      submitting = false;
    }
  }
</script>

<div>
  <!-- FEAT-0026: the state that decides where the money goes, written on the
       surface that sends it. -->
  <div class="flex items-center justify-between gap-2 flex-wrap">
    <h2 class="section-header min-w-0 flex-1"><span>{$_("orderEntry.title")}</span><span class="shrink-0"><ActiveAccountChip /></span></h2>
  </div>

  <!-- Order type & TimeInForce row -->
  <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
    <div class="flex items-center gap-2">
      {#each ALL_TYPES as t (t)}
        {@const exchangeSupports = supportsOrderType(exchange, t)}
        <button
          class="type-btn"
          class:active={entryType === t}
          disabled={!exchangeSupports}
          title={!exchangeSupports ? $_(unsupportedReasonKey(exchange, t) as TranslationKey) : undefined}
          onclick={() => selectOrderType(t)}
        >
          {typeLabel(t)}
        </button>
      {/each}
    </div>

    <!--
      Shown disabled rather than omitted where the venue declares no
      time-in-force. A control that vanishes reads as a missing feature in
      Cachy; a disabled one with a reason says the venue does not take it.
      Same rule as the order-type buttons beside it.

      Always rendered, even for market entries: in market mode the wrapper
      is visibility-hidden, so it keeps its exact box and the rows below
      never jump when the order type switches. Hidden content stays out of
      the accessibility tree via aria-hidden.
    -->
      <div
        class="flex items-center gap-1.5"
        class:invisible={!tifVisible}
        aria-hidden={!tifVisible}
        title={!tifSupported
          ? $_(unsupportedTimeInForceReasonKey(exchange) as TranslationKey)
          : undefined}
      >
        <label for="order-tif" class="text-xs font-semibold text-[var(--text-secondary)]">
          {$_("orderEntry.timeInForce")}
        </label>
        <!--
          The reason is also on the control itself, not only as a hover on the
          wrapper: a disabled select is never focusable, so a title attribute
          reaches a mouse and nothing else. `aria-label` puts the same sentence
          in the accessibility tree, where a screen reader still announces it.
        -->
        <select
          id="order-tif"
          bind:value={timeInForce}
          disabled={!tifSupported}
          aria-label={!tifSupported
            ? $_(unsupportedTimeInForceReasonKey(exchange) as TranslationKey)
            : $_("orderEntry.timeInForce")}
          class="input-field text-xs py-1 px-2"
        >
          {#each caps.timeInForce as tif (tif)}
            <option value={tif}>{tif}</option>
          {/each}
          {#if !tifSupported}
            <option value={timeInForce}>{$_("orderEntry.timeInForceNone")}</option>
          {/if}
        </select>
      </div>
  </div>

  <!-- What will be sent, from the calculator -->
  {#if data && data.positionSize instanceof Decimal && data.positionSize.gt(0) && tradeDirectionKnown}
    <dl class="summary">
      <div><dt>{$_("orderEntry.summary.size")}</dt><dd>{formatDynamicDecimal(data.positionSize, meta?.basePrecision ?? 4)}</dd></div>
      {#if marginCost}
        <div><dt>{$_("dashboard.margin")}</dt><dd>{formatDynamicDecimal(marginCost, 2)}</dd></div>
      {/if}
      <div><dt>{$_("orderEntry.summary.entry")}</dt><dd>{formatDynamicDecimal(data.entryPrice, meta?.quotePrecision ?? 2)}</dd></div>
      <div><dt>{$_("orderEntry.summary.stop")}</dt><dd>{formatDynamicDecimal(data.stopLossPrice, meta?.quotePrecision ?? 2)}</dd></div>
    </dl>

    <!--
      BUG-0648, second half. This is the same comparison `submit()` refuses on,
      so the figures on screen and the send decision can no longer disagree.

      The numbers stay. Blanking the summary would empty it on every keystroke
      while a recalculation is briefly incomplete — worse than showing them
      labelled, because a trader who can see that a figure is old can act on it,
      while a trader staring at an empty panel cannot tell that anything was
      calculated at all. Same reasoning as the BUG-0649 note below: state it
      here, where the numbers are, not only on the click that was refused.
    -->
    {#if staleInputs}
      <p class="note warn">{$_("orderEntry.notes.staleCalculation")}</p>
    {/if}

    <!--
      BUG-0649. Which note depends on both capability flags, and the gate reads
      the same pair (`orderGate.ts`, `unplaceableStop`). Asking only
      `!caps.tpSlAtEntry` is what put "the stop is placed as a second request" on
      a venue that cannot send a separate request — the gate refused it one click
      later, on the same screen. The decision lives in `stopLossPlacement` so the
      two call sites cannot answer different questions again.
    -->
    {#if stopRequested && stopPlacement === "separate"}
      <p class="note warn">{$_("orderEntry.notes.noAttachedProtection")}</p>
    {:else if stopRequested && stopPlacement === "unprotected"}
      <p class="note warn">{$_("orderEntry.notes.unprotectedEntry")}</p>
    {/if}

    {#if !hasMeta}
      <p class="note">{$_("orderEntry.errors.metadataLoading")}</p>
    {:else if meta && !tradingAvailable}
      <div class="outcome danger" role="alert" style="margin-bottom: var(--space-3);">
        <strong>{$_("orderEntry.errors.tradingUnavailable")}</strong>
        {#if meta.symbolStatus && meta.symbolStatus !== "OPEN"}
          <span class="detail">{$_("dashboard.symbolInfo.statusStop")}: {meta.symbolStatus}</span>
        {:else if meta.isApiSupported === false}
          <span class="detail">{$_("dashboard.symbolInfo.apiNotSupported")}</span>
        {/if}
      </div>
    {:else if accountUnverified}
      <p class="note warn" role="status">
        {#if credentialIssue === "passphrase"}
          {$_("orderEntry.errors.accountPassphraseMissing")}
        {:else if credentialIssue === "incomplete"}
          {$_("orderEntry.errors.accountCredentialsIncomplete")}
        {:else if credentialIssue === "none"}
          {$_("orderEntry.errors.accountCredentialsMissing")}
        {:else}
          {$_("orderEntry.errors.accountUnverified")}
        {/if}
      </p>
    {:else if balanceUnmeasured}
      <p class="note">{$_("orderEntry.notes.balanceUnmeasured")}</p>
    {:else if liveMarginShortfall && data?.requiredMargin instanceof Decimal && liveAvailable instanceof Decimal}
      <p class="note warn">
        {$_("orderEntry.notes.liveMarginShortfall", {
          values: {
            actual: data.requiredMargin.toString(),
            limit: liveAvailable.toString(),
          },
        })}
      </p>
    {:else if isBelowMinVolume}
      <p class="note warn">{$_("orderEntry.errors.belowMinTradeVolume", { values: { min: meta?.minTradeVolume ?? "" } })}</p>
    {:else if isAboveMaxVolume}
      <p class="note warn">{$_("orderEntry.errors.exceedsMaxOrderVolume", { values: { max: (entryType === "market" ? meta?.maxMarketOrderVolume : meta?.maxLimitOrderVolume) ?? "" } })}</p>
    {/if}
  {:else}
    <p class="note">{$_("orderEntry.notReady")}</p>
  {/if}

  <button
    class="submit-btn"
    class:paper-mode-btn={paperState.enabled}
    disabled={!ready || !tradeDirectionKnown || submitting}
    onclick={submit}
  >
    {#if submitting}
      {$_("orderEntry.submitting")}
    {:else if paperState.enabled}
      {$_("orderEntry.submitPaper")}
    {:else}
      {$_("orderEntry.submitLive")}
    {/if}
  </button>

  <!-- Outcome -->
  {#if result}
    {#if result.unprotected}
      <div class="outcome danger" role="alert">
        <strong>{$_("orderEntry.errors.unprotectedTitle")}</strong>
        <p>{$_("orderEntry.errors.unprotected")}</p>
      </div>
    {:else if result.entryPlaced}
      <div class="outcome ok">
        {$_("orderEntry.result.placed", {
          values: {
            stop: $_(`orderEntry.protection.${result.stopLoss}` as TranslationKey),
            target: $_(`orderEntry.protection.${result.takeProfit}` as TranslationKey),
          },
        })}
      </div>
    {:else}
      <div class="outcome danger" role="alert">
        {errorText(result)}
        {#if result.errorDetail && !result.refusal}
          <span class="detail">{detailText(result.errorDetail)}</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  /* This panel titles a live action, not a section: normal case. Scoped,
     so the global uppercase .section-header everywhere else is untouched. */
  .section-header {
    text-transform: none;
  }
  .type-btn {
    padding: 0.35rem 0.6rem;
    font-size: 0.8125rem;
    font-weight: var(--font-bold);
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--text-secondary);
    transition: all 0.15s;
    cursor: pointer;
  }
  .type-btn:hover:not(:disabled) {
    color: var(--text-primary);
  }
  .type-btn.active {
    color: var(--accent-color);
    border-bottom-color: var(--accent-color);
  }
  .type-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
    margin-bottom: var(--space-3);
    background: var(--bg-tertiary);
    padding: var(--space-2) 0.6rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
  }
  .summary dt {
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }
  .summary dd {
    margin: 0;
    font-family: monospace;
    font-size: 0.8125rem;
    font-weight: var(--font-semibold);
    color: var(--text-primary);
    word-break: break-all;
  }
  .note {
    font-size: 0.7rem;
    color: var(--text-secondary);
    margin-bottom: var(--space-3);
  }
  .note.warn {
    color: var(--warning-color);
  }
  .submit-btn {
    width: 100%;
    height: 48px;
    padding: 0 var(--space-4);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-radius: var(--radius-md);
    border: 1px solid var(--accent-color);
    background-color: var(--accent-color);
    color: var(--btn-accent-text);
    transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
    cursor: pointer;
  }
  .submit-btn:hover:not(:disabled) {
    background-color: var(--accent-color-hover);
    border-color: var(--accent-color-hover);
  }
  .submit-btn.paper-mode-btn {
    background-color: var(--success-color);
    border-color: var(--success-color);
    color: var(--text-on-success);
  }
  .submit-btn.paper-mode-btn:hover:not(:disabled) {
    opacity: 0.9;
  }
  .submit-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .outcome {
    margin-top: var(--space-3);
    padding: 0.6rem;
    border-radius: var(--radius-lg);
    font-size: var(--text-xs);
    border: 1px solid;
  }
  .outcome.ok {
    border-color: var(--success-color);
    color: var(--success-color);
  }
  .outcome.danger {
    border-color: var(--danger-color);
    color: var(--danger-color);
    font-weight: var(--font-bold);
  }
  .outcome .detail {
    display: block;
    margin-top: var(--space-1);
    font-weight: 400;
    opacity: 0.85;
    word-break: break-word;
  }
</style>
