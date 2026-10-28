# Super-Alert system — gap and UI/UX audit (FEAT-0623)

- **Date:** 2026-10-28
- **Scope:** the alert experience as shipped on `develop` after
  [`BUG-0750`](../../bugs/BUG-0750-per-alert-trigger-methods-never-reach-delivery.md)
  (`3e2bbbfa9`).
- **Method:** read the four surfaces and the delivery path, then checked every
  claim against the code. No behaviour was changed by this audit.
- **Related:** parent [`FEAT-0605`](../../features/FEAT-0605-ui-status-quo-audit.md),
  panel [`FEAT-0389`](../../features/FEAT-0389-super-alert-panel.md).

The system is judged against the three questions a trader asks of one alert:
**what** fires, **where** it goes, and **how** it announces itself.

## 1. Surfaces audited

| Surface | Where |
| :--- | :--- |
| Super-Alert panel | `src/components/alerts/AlertPanelView.svelte` + six tabs in `tabs/` |
| Lifecycle footer (channels, frequency, expiry, note) | `src/components/alerts/RuleLifecycleFields.svelte`, mounted once in the panel shell |
| Rail entry | `src/lib/navigation/entry-points.ts` → `alerts` |
| Indicator alert action | `src/components/settings/tabs/IndicatorAlertAction.svelte` |
| Drawing alert action | `src/lib/windows/implementations/CandleChartView.svelte` → `armDrawingAlert` |
| Notification policy | `src/components/settings/NotificationSettings.svelte` → `lib/notificationPolicy.ts` |
| External channels | `src/components/settings/ExternalChannelSettings.svelte`, `ExternalChannelCard.svelte` |
| Delivery | `src/services/notificationService.svelte.ts`, `src/services/externalDelivery.ts` |

## 2. Gap table — the three questions per alert type

| Alert type | What fires (trigger configuration) | Where it goes (delivery) | How it announces (banner, sound) | State |
| :--- | :--- | :--- | :--- | :--- |
| **Price** | Panel `PriceTab`, or chart seed (`CandleChartView` → `openAlertPanelWith`) | Lifecycle footer: local channels per rule, external channels by policy | Category-level only | Complete except the two cross-type gaps below |
| **Indicator** | Indicator card → `IndicatorAlertAction` seeds the draft; panel `IndicatorsTab` | Same footer — one builder, so one answer | Category-level only | Complete; refusals for unexpressible cards are named (BUG-0453) |
| **Combination** | Panel `ComboTab`, up to five conditions | Same footer | Category-level only | Complete |
| **Candlestick** | Panel `CandlesticksTab` | Same footer | Category-level only | Complete |
| **Template** | Panel `TemplatesTab` seeds a draft from a named strategy | Same footer | Category-level only | Complete |
| **Drawing** | Chart only, armed directly (`armDrawingAlert`); no builder | **No footer**: `trigger_methods` absent, so the category policy decides | Category-level only; `frequency` absent, which the core reads as `once` | **Gap** — no channel choice, no frequency, no note, and no way to change any of it afterwards |

Two gaps cut across all types:

- **External channels are policy-wide, not per rule.** `TriggerMethod` mirrors
  the core's three local variants; `email`, `discord` and `telegram` are decided
  by the Settings matrix alone. Deliberate, and tracked as
  [`FEAT-0748`](../../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md).
- **No per-type announcement.** All alerts fire the `alert-fired` category, which
  maps to one tone (`alarm`) and one toast style. Neither banner nor sound can be
  chosen per alert type. Recorded as a deferral in §5.

## 3. Channel dead-end check

The acceptance criterion asks for channels that can be configured but never
fire, or fire but cannot be configured. Both halves were traced end to end.

| Channel | Configurable | Reaches a send path | Test path | Per rule |
| :--- | :--- | :--- | :--- | :--- |
| In-app toast | Policy matrix | `notify()` → `toastService` | — (the toast is the test) | Yes (BUG-0750) |
| Browser | Policy matrix; toggle operable while undecided, blocked when denied/unsupported | `notify()` → `showBrowser` | — | Yes |
| Sound | Policy matrix + preview tone; blocked only when the browser cannot play | `notify()` → `soundChannel.play` | Preview button (`unlockAndPlay`) | Yes |
| E-mail | `ExternalChannelSettings` (Mailgun domain, key, recipient) | `deliverExternal` → `sendEmail` | Per-channel Test button | **No** — policy only |
| Discord | Settings (webhook) | `deliverExternal` → `sendDiscord` | Per-channel Test button | **No** — policy only |
| Telegram | Settings (bot token, chat) | `deliverExternal` → `sendTelegram` | Per-channel Test button + chat lookup | **No** — policy only |

**Verdict: no dead end of the kind that would be a bug.** Every channel has a
send path, and every "switched on but cannot deliver" state is reported where
the trader configures it (permission note, sound availability, `externalProblem`
"needs setup"). External credentials are re-validated at send time, so a channel
edited between arming and firing fails visibly in `externalDeliveryLog` rather
than silently.

The one asymmetry is deliberate and tracked: the per-channel Test button proves
the *channel*, not the *rule*, so a rule that never fires still cannot be
dry-run — [`FEAT-0748`](../../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md).

## 4. UI/UX findings per surface

Severity: **H** blocks a task the surface exists for, **M** costs time or
confuses, **L** polish. Disposition links the follow-up; "deferred" records the
reason.

| # | Surface | Finding | Sev | Disposition |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Panel · Manage | Rows carry a symbol and a fragment of a price comparison only; combination, indicator and candlestick rules read as a bare symbol, and there is no name, timeframe, status or expiry | H | [`FEAT-0747`](../../features/FEAT-0747-manage-list-with-search-filters-and-firing-log.md), [`FEAT-0543`](../../features/FEAT-0543-show-full-rule-configuration-on-manage-rows.md) |
| 2 | Panel · Manage | The only row action is delete. Pausing, resuming, editing, duplicating or inspecting a rule is impossible from the list | H | [`FEAT-0746`](../../features/FEAT-0746-pause-resume-and-duplicate-armed-rules.md), [`FEAT-0542`](../../features/FEAT-0542-view-and-edit-armed-alert-from-manage.md) |
| 3 | Panel · Manage | "Verlauf" is the set of rules that have fired, not a log of firings. The persisted firing ledger (`cachy_shadow_firings_v1`) is never shown | H | [`FEAT-0747`](../../features/FEAT-0747-manage-list-with-search-filters-and-firing-log.md) |
| 4 | Panel · Builder | The channel checkboxes start empty while the policy announces in-app, so the footer reads "nothing selected" for a rule that does announce; the effective default is invisible | M | [`FEAT-0748`](../../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md) (AC added by this audit) |
| 5 | Panel · Builder | No per-rule "send test"; verifying a rule means waiting for the market | M | [`FEAT-0748`](../../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md) |
| 6 | Panel · Tabs | The strip starts on Templates and ends on Manage, while the panel opens on Manage (`alertPanelState.activeTab`) — the default tab is the last one in reading order | L | Deferred: cosmetic, and the control center (FEAT-0749) revisits the tab model |
| 7 | Rail entry | No badge or unread state. A firing while the panel is closed leaves only the transient notification and the ledger; nothing says "three alerts fired since you looked" | M | [`FEAT-0749`](../../features/FEAT-0749-control-center-window-for-alerts-and-bots.md) (AC added by this audit) |
| 8 | Indicator card | The alert button is an unlabelled bell; a refused card dims it to 45 % opacity and puts the reason in `title`/`aria-label` only | L | [`FEAT-0611`](../../features/FEAT-0611-adopt-the-button-primitive-in-the-settings-tabs.md) records the primitive gap; deferred as polish |
| 9 | Notification settings | One "Alert triggered" row for all alert types. A trader cannot route price alerts differently from indicator alerts without the per-rule selection | M | Deferred: per-rule selection (FEAT-0748) covers the practical need; per-type routing is a product decision (§5) |
| 10 | External channels | Credentials sit in plain sight of the same page as the policy toggles, with the unencrypted-at-rest trade-off stated at the top | — | Not a finding: deliberate and documented in ADR-0018 |
| 11 | Whole flow | A rule armed from a drawing never passes the footer at all | H | [`FEAT-0752`](../../features/FEAT-0752-route-drawing-alerts-through-the-lifecycle-footer.md) (filed by this audit) |

## 5. Deferrals with reasons

- **Per-type sound and banner.** All alerts share `alert-fired → "alarm"` and
  one toast style (`src/lib/notificationTones.ts`). Deferred: per-rule channel
  selection (FEAT-0748) covers "this alert stays quiet, that one rings", and
  per-*type* configuration would multiply the matrix without a stated need. A
  trader who wants type-level defaults is asking for templates, which
  `TemplatesTab` already provides for conditions.
- **Tab order versus default tab (finding 6).** Cosmetic; FEAT-0749 reworks the
  surrounding navigation.
- **Indicator button's visual refusal (finding 8).** The reason is reachable by
  keyboard through `aria-label`; the visual treatment belongs to the shared
  primitive work, not to a one-off.
- **Bots.** `AutomationTab.svelte` (bot list, order intent) is adjacent but not
  part of the alert flow; it is tracked by
  [`FEAT-0749`](../../features/FEAT-0749-control-center-window-for-alerts-and-bots.md).

## 6. What is healthy

Named so the follow-ups do not read as a rewrite:

- One builder for every type, and the footer is mounted once, so channels,
  frequency, expiry and note cannot drift between tabs.
- Delivery precedence is explicit and tested after BUG-0750: the rule owns the
  local channels, the policy owns the external ones, and an availability floor
  keeps an alarm audible when the chosen channel refuses.
- Refusals are named rather than silent: unexpressible indicator cards, broken
  rules, orphaned and drawing-anchored rules each surface a reason.
- External credentials are validated at send time and their failures land in a
  log the settings screen reads, with test entries distinguishable from real
  ones.
