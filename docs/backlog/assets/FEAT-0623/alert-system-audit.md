# Super-Alert system — gap and UI/UX audit (FEAT-0623)

- **Date:** 2026-10-28
- **Scope:** the alert experience as shipped on `develop` after
  [`BUG-0750`](../../bugs/BUG-0750-per-alert-trigger-methods-never-reach-delivery.md)
  (`3e2bbbfa9`).
- **Method:** read the four surfaces and the delivery path, then checked every
  claim against the code. No behaviour was changed by this audit; the defects it
  found are separate items (see §7).
- **Note (2026-10-28):** the drawing rows below describe the pre-FEAT-0752
  state; FEAT-0752 closes that builder gap.
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
| Drawing alert action | `src/lib/windows/implementations/CandleChartView.svelte` → `alertOnSelectedDrawing` → `armDrawingAlert` |
| Notification policy | `src/components/settings/NotificationSettings.svelte` → `src/lib/notificationPolicy.ts` |
| External channels | `src/components/settings/ExternalChannelSettings.svelte`, `ExternalChannelCard.svelte` |
| Delivery | `src/services/notificationService.svelte.ts`, `src/services/externalDelivery.ts` |

## 2. Gap table — the three questions per alert type

| Alert type | What fires (trigger configuration) | Where it goes (delivery) | How it announces (banner, sound) | State |
| :--- | :--- | :--- | :--- | :--- |
| **Price** | Panel `PriceTab`, or chart context menu → `openAlertPanelWith` (`CandleChartView.svelte:288-305`) | Lifecycle footer: local channels per rule, external channels by policy | Category-level only | Complete except the two cross-type gaps below |
| **Indicator** | Indicator card → `IndicatorAlertAction` seeds the draft; panel `IndicatorsTab` | Same footer — one builder, so one answer | Category-level only | Complete except the cross-type gaps; refusals for unexpressible cards are named |
| **Combination** | Panel `ComboTab`, up to five conditions | Same footer | Category-level only | Complete except the cross-type gaps |
| **Candlestick** | Panel `CandlesticksTab` | Same footer | Category-level only | Complete except the cross-type gaps |
| **Drawing** | Chart only, armed directly: selecting a drawing and pressing the bell runs `alertOnSelectedDrawing` → `armDrawingAlert` | **No footer**: `trigger_methods` absent, so the category policy decides | Category-level only; `frequency` absent (the core reads `once`), no expiry, no note | **Gap** — no channel choice, no frequency, no note, no expiry, and no way to change any of it afterwards ([`FEAT-0752`](../../features/FEAT-0752-route-drawing-alerts-through-the-lifecycle-footer.md)) |

`TemplatesTab` is not a sixth type: it loads a condition set into the
Combination tab, which is why it can share the same footer.

Two gaps cut across all types:

- **External channels are policy-wide, not per rule.** `TriggerMethod` mirrors
  the core's three local variants, so `email`, `discord` and `telegram` are
  decided by the Settings matrix alone.
  **Decision: per-rule external selection is wanted.** The alert surface already
  distinguishes rules by symbol, timeframe and condition; the same trader who
  says "this one stays in the app" should be able to say "that one goes to
  Discord", and the epic's problem statement names exactly that need.
  [`FEAT-0748`](../../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md)
  implements it by extending `TriggerMethod` on both sides and amending
  [`ADR-0018`](../../../adr/0018-user-directed-egress-of-class-a-announcements.md)
  before the first external variant ships. The policy stays the ceiling: a rule
  can select an external channel the trader configured, never open one they
  have not.
- **No per-type announcement.** All alerts fire the `alert-fired` category, which
  maps to one tone (`alarm`) and one toast style. Neither banner nor sound can be
  chosen per alert type. Decision: not now — see §5.

## 3. Channel dead-end check

The acceptance criterion asks for channels that can be configured but never
fire, or fire but cannot be configured. Both halves were traced end to end.

| Channel | Configurable | Reaches a send path | Test path | Per rule | Undeliverable state |
| :--- | :--- | :--- | :--- | :--- | :--- |
| In-app toast | Policy matrix | `notify()` → `toastService` | — (the toast is the test) | Yes (BUG-0750) | n/a |
| Browser | Policy matrix; toggle operable while undecided, blocked when denied/unsupported | `notify()` → `showBrowser` | — | Yes | Permission note in Settings; the rule-level floor in `notify()` |
| Sound | Policy matrix + preview tone; blocked only when the browser cannot play | `notify()` → `soundChannel.play` | Preview button (`unlockAndPlay`) | Yes | Availability note in Settings; the rule-level floor |
| E-mail | `ExternalChannelSettings` (Mailgun domain, key, recipient) | `deliverExternal` → `sendEmail` | Per-channel Test button | No — policy only | `problem` on the card, "needs setup" in the matrix |
| Discord | Settings (webhook) | `deliverExternal` → `sendDiscord` | Per-channel Test button | No — policy only | Same |
| Telegram | Settings (bot token, chat) | `deliverExternal` → `sendTelegram` | Per-channel Test button + chat lookup | No — policy only | Same |

**Verdict: one dead end, and it is a bug.**
[`BUG-0753`](../../bugs/BUG-0753-external-channel-policy-on-card-off.md): the
matrix gates a cell on `validateChannel` (credentials only), while delivery
gates on `isChannelActive` (`enabled && valid`). With valid credentials and the
channel card's own switch off, the matrix still lets the trader switch the
channel on; the alert then fires with that channel silently excluded — no
`externalDeliveryLog` entry, no marker, nothing in Settings that says "paused".
That is "configured but never fires" in the sense the criterion names.

Two corrections to the obvious reading of the delivery code:

- `sendOn` re-validates at send time, but `notify()` filters with `isActive`
  before dispatch, so a channel edited into an invalid state is skipped rather
  than logged. Only a provider-side rejection (401/403/429, timeout, network)
  produces an `externalDeliveryLog` entry.
- That entry is rendered in the external-channel settings section and on the
  card; it is not pushed to the trader. A revoked webhook is discovered the next
  time Settings is opened, not when the alert fires.

## 4. UI/UX findings per surface

Severity: **H** blocks a task the surface exists for, **M** costs time or
confuses, **L** polish. Every row has a disposition: a follow-up link, a
recorded acceptance, or a deferral with its reason.

| # | Surface | Finding | Sev | Disposition |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Panel · Manage | A row shows the symbol, a bare `op + constant` fragment, and one of three badges (broken / expired / fired). For an indicator rule the fragment is misleading — RSI > 70 renders as a price-looking "Crosses Up 70" — and there is no name, timeframe, expiry or "armed" state | H | [`FEAT-0747`](../../features/FEAT-0747-manage-list-with-search-filters-and-firing-log.md), [`FEAT-0543`](../../features/FEAT-0543-show-full-rule-configuration-on-manage-rows.md) |
| 2 | Panel · Manage | The only row action is delete. Pausing, resuming, editing, duplicating or inspecting a rule is impossible from the list | H | [`FEAT-0746`](../../features/FEAT-0746-pause-resume-and-duplicate-armed-rules.md), [`FEAT-0542`](../../features/FEAT-0542-view-and-edit-armed-alert-from-manage.md) |
| 3 | Panel · Manage | "Verlauf" is "rules that have ever fired", not a log of firings: the persisted ledger is never shown, and an armed repeating rule moves into it after its first firing | H | [`FEAT-0747`](../../features/FEAT-0747-manage-list-with-search-filters-and-firing-log.md); the classification is [`BUG-0754`](../../bugs/BUG-0754-armed-repeating-rule-moves-to-history.md) |
| 4 | Panel · Manage | A suspended rule (`enabled: false`, e.g. its drawing was deleted) renders with the same status as a live alarm: it stays in "Aktiv", no badge, no reason, no way to re-enable | H | [`BUG-0755`](../../bugs/BUG-0755-disabled-rule-renders-as-armed.md) |
| 5 | Panel · Builder | The channel checkboxes start empty and the collapsed summary omits channels. The hint says the policy decides, but not *which* channels it resolves to; the effective set is invisible until Settings is opened | M | [`FEAT-0748`](../../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md) (AC added by this audit) |
| 6 | Panel · Builder | No per-rule "send test"; verifying a rule means waiting for the market. The Settings test proves a channel, not the rule | M | [`FEAT-0748`](../../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md) |
| 7 | Panel · Tabs | The strip starts on Templates and ends on Manage; the store's *initial* tab is Manage, but opening and resetting do not reset `activeTab`, so a reopened panel lands on whatever tab was last used | L | Accepted as is: a remembered tab is defensible; the strip order is cosmetic |
| 8 | Rail entry | No badge or unread state. A firing while the panel is closed leaves the toast and a "fired" row, but nothing ambient says "something fired since you looked" | M | [`FEAT-0749`](../../features/FEAT-0749-control-center-window-for-alerts-and-bots.md) (proposal and AC added by this audit) |
| 9 | Indicator card | A refused alert action is a bell at 45 % opacity; the reason lives in `title` and `aria-label` only, so a sighted keyboard or mouse user sees no reason, and the refused state may fail non-text contrast | M | [`FEAT-0756`](../../features/FEAT-0756-show-why-an-indicator-alert-action-refuses.md) (filed by this audit) |
| 10 | Notification settings | One "Alert triggered" row for all alert types; a trader cannot route price alerts differently from indicator alerts except through the per-rule selection | M | Deferred: per-rule selection (FEAT-0748) covers the need; per-type is a product decision (§5) |
| 11 | Whole flow | A rule armed from a drawing never passes the footer at all | H | [`FEAT-0752`](../../features/FEAT-0752-route-drawing-alerts-through-the-lifecycle-footer.md) (filed by this audit) |

## 5. Deferrals with reasons

- **Per-type sound and banner.** All alerts share `alert-fired → "alarm"` and
  one toast style (`src/lib/notificationTones.ts`). Deferred: per-rule channel
  selection already distinguishes rules, muting is what pause is for (FEAT-0746),
  and a per-type axis would multiply the policy matrix without a stated need.
  Note that an empty channel selection does *not* mute a rule — it defers to the
  policy — so "this one stays quiet" is a pause, not a channel choice.
- **Tab order and remembered tab (finding 7).** Accepted as is; neither the
  control center (FEAT-0749) nor this audit owns the panel shell.
- **Per-type routing (finding 10).** Same decision as per-type sound.
- **Bots.** `AutomationTab.svelte` (bot list, order intent) is adjacent but not
  part of the alert flow; it is tracked by FEAT-0749.

## 6. What is healthy

Named so the follow-ups do not read as a rewrite:

- One builder for every alert type, and the footer is mounted once, so channels,
  frequency, expiry and note cannot drift between tabs.
- Delivery precedence is explicit and tested after BUG-0750: the rule owns the
  local channels, the policy owns the external ones, and an availability floor
  adds an in-app toast when the rule's own selection produced nothing — as long
  as the category policy still wants in-app. A category the trader silenced
  entirely stays silent and outranks the rule.
- Refusals are named rather than silent: unexpressible indicator cards, broken
  rules, orphaned and drawing-anchored rules each surface a reason. The one
  exception is the gap above (BUG-0755: the row, not the report, is silent).
- External credentials are unencrypted at rest by decision, and the trade-off is
  stated at the top of the section where they are entered (ADR-0018 decision 4).
  They are not written to logs, and egress goes directly to the trader's own
  services.

## 7. Follow-ups filed by this audit

| Item | What it fixes |
| :--- | :--- |
| [`FEAT-0752`](../../features/FEAT-0752-route-drawing-alerts-through-the-lifecycle-footer.md) | Drawing alerts bypass the builder and its footer |
| [`BUG-0753`](../../bugs/BUG-0753-external-channel-policy-on-card-off.md) | External channel can be switched on in the matrix while its own card switch is off — silent drop |
| [`BUG-0754`](../../bugs/BUG-0754-armed-repeating-rule-moves-to-history.md) | An armed repeating rule disappears from the active list after firing |
| [`BUG-0755`](../../bugs/BUG-0755-disabled-rule-renders-as-armed.md) | A suspended rule still renders as armed |
| [`FEAT-0756`](../../features/FEAT-0756-show-why-an-indicator-alert-action-refuses.md) | A refused indicator alert action gives no visible reason |

Sharpened instead of duplicated: FEAT-0748 gains the effective-set criterion,
FEAT-0749 the unread count on its rail entry.
