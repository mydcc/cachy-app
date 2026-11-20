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
 * The form behind the Combo tab (FEAT-0030, v2 in FEAT-0813).
 *
 * The draft is always a group already: `blankDraft` starts at
 * `{ kind: "group", op: "all", of: [] }` and `setSingleCondition` wraps its
 * one condition in the same shape. So this module never rewrites the tree's
 * root -- it adds and removes members of the group the panel already holds,
 * which is why arriving here from the Indicators tab keeps the condition
 * built there.
 *
 * v2 brings the builder up to the core instead of the other way round: a
 * member may itself be a group (one level, so two in all -- the core allows
 * eight), and a leaf may be an indicator comparison, a price condition or a
 * candlestick pattern side by side.
 *
 * Every function is pure and returns a new `ComboForm`. The tab owns the
 * `$state`; this module owns the rules about what a legal combination is.
 */

import { Decimal } from "decimal.js";
import { generateId } from "../../utils/utils";
import {
    buildIndicatorCondition,
    defaultForm,
    readIndicatorForm,
    type IndicatorForm,
} from "./indicatorConditionForm";
import { INDICATOR_CATALOGUE, catalogueEntry } from "./indicatorCatalogue";
import { ALL_PATTERNS, buildPatternCondition } from "./patternCatalogue";
import { EXTERNAL_FEEDS } from "../rules/externalFeeds";
import { buildPriceCondition, priceReadingOf, type PriceReading } from "./priceFormLeaf";
import type {
    CandlePatternName,
    CompareOp,
    Condition,
    LogicOp,
    TimeframeString,
} from "../rules/types";

/**
 * Sixteen leaves per rule, decided 2026-11-20 (TODO.md #35).
 *
 * The cap keeps the panel usable; the evaluator could take more. It counts
 * leaves, not groups, because a leaf is what a trader reads and checks.
 * Enforced in the builder so a trader is never offered a row the panel then
 * has to refuse.
 */
export const MAX_COMBO_CONDITIONS = 16;

/**
 * How deep the builder nests: the root group plus one level of groups inside
 * it. The core allows eight (`MAX_CONDITION_DEPTH`); a deeper document opens
 * read-only rather than being flattened.
 */
export const MAX_COMBO_DEPTH = 2;

/**
 * The most closed candles a rule may need before it can judge. Mirrors the
 * core's `MAX_RULE_WARMUP_CANDLES` (ADR-0016) for display only: the core
 * computes the warmup and refuses a document past it.
 */
export const RULE_WARMUP_CEILING = 500;

/**
 * Which join operators the builder offers: AND and OR, never NOR.
 *
 * `LogicOp` is `all | any | none` and both the evaluator and the read-back
 * sentence handle all three, so this is a deliberate narrowing of the builder
 * and not a gap in the core.
 *
 * `none` is left out because of what it does to an alert. A crossing is an
 * event -- rare, which is why it carries signal. `none` is a state, and it is
 * the ordinary one: `none(rsi > 70, macd crosses above)` holds on almost
 * every candle of almost every symbol. Against a `cross` it is worse still,
 * since a cross is true only in the single evaluation where it happens, so
 * negating it is true on every candle except the interesting one.
 *
 * Nothing is taken away from the trader. `none(A, B)` is `all(not A, not B)`,
 * and a `compare` negates through its own operator -- "RSI not above 70" is
 * `rsi <= 70`, which also reads better in the sentence. The only leaf that
 * cannot be negated that way is `cross`, and that is exactly the case where
 * the resulting rule would be the permanently-true non-alert above.
 */
export const COMBO_OPS: readonly LogicOp[] = ["all", "any"];

/** Whether this builder is willing to present a group joined this way. */
export function isOfferedOp(op: LogicOp): boolean {
    return COMBO_OPS.includes(op);
}

/** The kinds of leaf a row can be. */
export type ComboLeafKind = "indicator" | "price" | "pattern" | "feed";
/** What the trigger editor offers. A feed is refused there by the core (ADR-0012 decision 7). */
export const COMBO_LEAF_KINDS: readonly ComboLeafKind[] = ["indicator", "price", "pattern"];
/** What the veto editor offers (FEAT-0814): the trigger's kinds plus a third-party feed. */
export const VETO_LEAF_KINDS: readonly ComboLeafKind[] = [...COMBO_LEAF_KINDS, "feed"];


export const FEED_OPS: readonly CompareOp[] = ["gt", "gte", "lt", "lte"];

/** How a reader treats a leaf kind the call site does not offer. */
export interface ComboReadOptions {
    /** Read `external_feed` leaves (the veto editor). Default: lock on them. */
    allowFeed?: boolean;
}

interface LeafBase {
    /**
     * Keeps `{#each}` keys stable when a row is removed from the middle of
     * the list. Deliberately never reaches the document: a row id inside the
     * rule would differ between two traders building the same combination and
     * break the content-hash equality FEAT-0391 depends on.
     */
    readonly id: string;
    /**
     * The timeframe this condition reads, or `null` to read the rule's
     * trigger timeframe.
     *
     * Per FEAT-0303 every condition is evaluated at the same instant -- the
     * close of the trigger timeframe -- and each reads the last candle of its
     * own timeframe that had closed by then. That is what makes a coarser
     * condition hold across several finer triggers, and it is why a row may
     * name a coarser timeframe but never a finer one.
     */
    readonly timeframe: TimeframeString | null;
}

export interface IndicatorLeaf extends LeafBase {
    readonly kind: "indicator";
    readonly form: IndicatorForm;
}

export interface PriceLeaf extends LeafBase {
    readonly kind: "price";
    readonly reading: PriceReading;
}

export interface PatternLeaf extends LeafBase {
    readonly kind: "pattern";
    readonly pattern: CandlePatternName;
}

/** A third-party feed against a threshold; legal only inside a veto. */
export interface FeedLeaf extends LeafBase {
    readonly kind: "feed";
    readonly feed: string;
    readonly op: CompareOp;
    /** Decimal string as typed; built only once it parses. */
    readonly value: string;
}

export type ComboLeaf = IndicatorLeaf | PriceLeaf | PatternLeaf | FeedLeaf;

/** An indicator row. Kept as a name because it was the only row kind in v1. */
export type ComboRow = IndicatorLeaf;

/** A group inside the root group. It holds leaves only (`MAX_COMBO_DEPTH`). */
export interface ComboGroupNode {
    readonly id: string;
    readonly kind: "group";
    readonly op: LogicOp;
    readonly members: readonly ComboLeaf[];
}

export type ComboNode = ComboLeaf | ComboGroupNode;

export interface ComboForm {
    readonly op: LogicOp;
    readonly rows: readonly ComboNode[];
}

/** What a leaf patch may change. `id` and `kind` are fixed for a row's life. */
export type ComboLeafPatch = Partial<{
    form: IndicatorForm;
    reading: PriceReading;
    pattern: CandlePatternName;
    feed: string;
    op: CompareOp;
    value: string;
    timeframe: TimeframeString | null;
}>;

/** A fresh row on the first catalogue indicator, reading the trigger timeframe. */
export function newComboRow(): IndicatorLeaf {
    return {
        id: generateId(),
        kind: "indicator",
        form: defaultForm(INDICATOR_CATALOGUE[0]),
        timeframe: null,
    };
}

/**
 * A fresh leaf of `kind`.
 *
 * A price leaf starts without a threshold. Any number put there would be a
 * level the trader did not choose, and an empty one keeps the rule unarmable
 * until they type theirs.
 */
export function newComboLeaf(kind: ComboLeafKind): ComboLeaf {
    if (kind === "indicator") return newComboRow();
    if (kind === "price") {
        return {
            id: generateId(),
            kind: "price",
            reading: {
                form: { kind: "rises_above", threshold: "", lookback: 1 },
                field: "close",
                source: "last",
            },
            timeframe: null,
        };
    }
    if (kind === "feed") {
        return { id: generateId(), kind: "feed", feed: EXTERNAL_FEEDS[0], op: "gt", value: "", timeframe: null };
    }
    return { id: generateId(), kind: "pattern", pattern: ALL_PATTERNS[0], timeframe: null };
}

/**
 * A feed threshold as the document stores it, or null while it is not a
 * number. Decimal, not `Number`: a funding rate of 0.0001 is a value a
 * float would print as 1e-4 and a trader would not recognise.
 */
function feedValue(raw: string): string | null {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    try {
        const value = new Decimal(trimmed);
        return value.isFinite() ? value.toFixed() : null;
    } catch {
        return null;
    }
}

export function emptyComboForm(op: LogicOp = "all"): ComboForm {
    return { op, rows: [] };
}

/** Every leaf in the form, in document order. */
export function leavesOf(form: ComboForm): readonly ComboLeaf[] {
    return form.rows.flatMap((node) => (node.kind === "group" ? node.members : [node]));
}

export function leafCount(form: ComboForm): number {
    return leavesOf(form).length;
}

export function canAddRow(form: ComboForm): boolean {
    return leafCount(form) < MAX_COMBO_CONDITIONS;
}

/** A nested group starts with one leaf, so it costs one slot. */
export function canAddGroup(form: ComboForm): boolean {
    return canAddRow(form);
}

/**
 * Add a leaf of `kind`, to the root or to the nested group `groupId`.
 * A full form, or a `groupId` that names no group, is returned unchanged.
 */
export function addRow(
    form: ComboForm,
    kind: ComboLeafKind = "indicator",
    groupId?: string,
): ComboForm {
    if (!canAddRow(form)) return form;
    const leaf = newComboLeaf(kind);
    if (groupId === undefined) return { ...form, rows: [...form.rows, leaf] };
    if (!form.rows.some((node) => node.kind === "group" && node.id === groupId)) return form;
    return {
        ...form,
        rows: form.rows.map((node) =>
            node.kind === "group" && node.id === groupId
                ? { ...node, members: [...node.members, leaf] }
                : node,
        ),
    };
}

/**
 * Add a nested group holding one indicator leaf.
 *
 * Its operator defaults to the opposite of the root's, because that is the
 * only reason to nest: `all(A, any(B, C))`. A nested group joined like its
 * parent says nothing the flat list did not.
 */
export function addGroup(form: ComboForm): ComboForm {
    if (!canAddGroup(form)) return form;
    const group: ComboGroupNode = {
        id: generateId(),
        kind: "group",
        op: form.op === "all" ? "any" : "all",
        members: [newComboRow()],
    };
    return { ...form, rows: [...form.rows, group] };
}

/**
 * Remove the row or group `id`. A nested group left empty goes with its last
 * leaf: an empty group has no truth value and the core refuses it.
 */
export function removeRow(form: ComboForm, id: string): ComboForm {
    const rows: ComboNode[] = [];
    for (const node of form.rows) {
        if (node.id === id) continue;
        if (node.kind !== "group") {
            rows.push(node);
            continue;
        }
        const members = node.members.filter((leaf) => leaf.id !== id);
        if (members.length > 0) rows.push(members.length === node.members.length ? node : { ...node, members });
    }
    return { ...form, rows };
}

function patchLeaf(leaf: ComboLeaf, next: ComboLeafPatch): ComboLeaf {
    const timeframe = next.timeframe === undefined ? leaf.timeframe : next.timeframe;
    if (leaf.kind === "indicator") return { ...leaf, form: next.form ?? leaf.form, timeframe };
    if (leaf.kind === "price") return { ...leaf, reading: next.reading ?? leaf.reading, timeframe };
    if (leaf.kind === "feed") {
        // A feed has no timeframe of its own: it is read as of the close.
        return {
            ...leaf,
            feed: next.feed ?? leaf.feed,
            op: next.op ?? leaf.op,
            value: next.value ?? leaf.value,
        };
    }
    return { ...leaf, pattern: next.pattern ?? leaf.pattern, timeframe };
}

/** Patch the leaf `id`, wherever it sits. Fields that do not fit its kind are ignored. */
export function replaceRow(form: ComboForm, id: string, next: ComboLeafPatch): ComboForm {
    return {
        ...form,
        rows: form.rows.map((node) => {
            if (node.kind === "group") {
                return {
                    ...node,
                    members: node.members.map((leaf) => (leaf.id === id ? patchLeaf(leaf, next) : leaf)),
                };
            }
            return node.id === id ? patchLeaf(node, next) : node;
        }),
    };
}

/** Swap the leaf `id` for a fresh leaf of `kind`, keeping its place and timeframe. */
export function changeLeafKind(form: ComboForm, id: string, kind: ComboLeafKind): ComboForm {
    const swap = (leaf: ComboLeaf): ComboLeaf =>
        leaf.id === id && leaf.kind !== kind
            ? { ...newComboLeaf(kind), id: leaf.id, timeframe: leaf.timeframe }
            : leaf;
    return {
        ...form,
        rows: form.rows.map((node) =>
            node.kind === "group" ? { ...node, members: node.members.map(swap) } : swap(node),
        ),
    };
}

/** Set the root's operator, or the nested group `groupId`'s. */
export function setLogicOp(form: ComboForm, op: LogicOp, groupId?: string): ComboForm {
    if (groupId === undefined) return { ...form, op };
    return {
        ...form,
        rows: form.rows.map((node) =>
            node.kind === "group" && node.id === groupId ? { ...node, op } : node,
        ),
    };
}

function buildLeaf(leaf: ComboLeaf, triggerTimeframe: TimeframeString): Condition | null {
    const timeframe = leaf.timeframe ?? triggerTimeframe;
    if (leaf.kind === "indicator") return buildIndicatorCondition(leaf.form, timeframe);
    if (leaf.kind === "price") return buildPriceCondition(leaf.reading, timeframe);
    if (leaf.kind === "feed") {
        const value = feedValue(leaf.value);
        return value === null ? null : { kind: "external_feed", feed: leaf.feed, op: leaf.op, value };
    }
    return buildPatternCondition(leaf.pattern, timeframe);
}

/**
 * The condition tree this form describes, or `null` when it describes none.
 *
 * `null` rather than an empty group on purpose: an empty group is what
 * `setSingleCondition(null)` writes to disable the arm button, so returning
 * one here would arm a rule that can never fire. A leaf that is not usable
 * yet -- a price with no threshold -- makes the whole tree `null` for the
 * same reason: a rule missing one of its conditions is a different rule.
 */
export function buildComboCondition(
    form: ComboForm,
    triggerTimeframe: TimeframeString,
): Condition | null {
    if (form.rows.length === 0) return null;
    const of: Condition[] = [];
    for (const node of form.rows) {
        if (node.kind === "group") {
            const members: Condition[] = [];
            for (const leaf of node.members) {
                const built = buildLeaf(leaf, triggerTimeframe);
                if (built === null) return null;
                members.push(built);
            }
            if (members.length === 0) return null;
            of.push({ kind: "group", op: node.op, of: members });
            continue;
        }
        const built = buildLeaf(node, triggerTimeframe);
        if (built === null) return null;
        of.push(built);
    }
    return { kind: "group", op: form.op, of };
}

/** What the builder writes into the draft while the trader is still editing. */
export interface ComboDraft {
    /** The tree of every leaf that builds; `null` when none does. */
    condition: Condition | null;
    /**
     * True while at least one leaf does not build yet. The draft then holds a
     * different rule than the form shows, so arming must stay off until it
     * clears -- but the leaves that do build stay in the draft, so a tab
     * switch in the middle of an edit cannot wipe them (BUG-0443 class).
     */
    incomplete: boolean;
}

/**
 * The tree to keep in the draft for this form: every leaf that builds, with
 * the unfinished ones left out and flagged. `buildComboCondition` stays the
 * strict all-or-nothing reading; this is the one a write-through uses.
 */
export function buildComboDraft(form: ComboForm, triggerTimeframe: TimeframeString): ComboDraft {
    let incomplete = false;
    const of: Condition[] = [];
    for (const node of form.rows) {
        if (node.kind === "group") {
            const members: Condition[] = [];
            for (const leaf of node.members) {
                const built = buildLeaf(leaf, triggerTimeframe);
                if (built === null) incomplete = true;
                else members.push(built);
            }
            if (members.length > 0) of.push({ kind: "group", op: node.op, of: members });
            continue;
        }
        const built = buildLeaf(node, triggerTimeframe);
        if (built === null) incomplete = true;
        else of.push(built);
    }
    return { condition: of.length === 0 ? null : { kind: "group", op: form.op, of }, incomplete };
}

/** The document field a tree editor writes: the trigger, or the veto. */
export type ComboField = "conditions" | "veto";

/**
 * The refusal path of a root member, or of a member inside a nested group.
 * Matches the core's own spelling (`conditions.of[2].of[0]`), and holds
 * because `buildComboCondition` writes the rows in the order the form keeps.
 */
export function refusalPath(
    rootIndex: number,
    memberIndex?: number,
    field: ComboField = "conditions",
): string {
    const root = `${field}.of[${rootIndex}]`;
    return memberIndex === undefined ? root : `${root}.of[${memberIndex}]`;
}

/** The refusal path of every leaf the form renders, in document order. */
export function leafPaths(form: ComboForm, field: ComboField = "conditions"): string[] {
    return form.rows.flatMap((node, index) =>
        node.kind === "group"
            ? node.members.map((_leaf, memberIndex) => refusalPath(index, memberIndex, field))
            : [refusalPath(index, undefined, field)],
    );
}

/** Why the builder cannot open a document. */
export type ComboLockReason = "too_many" | "unsupported";

type TreeReading = { form: ComboForm } | { reason: ComboLockReason };

function ownTimeframe(timeframe: TimeframeString, trigger: TimeframeString): TimeframeString | null {
    return timeframe === trigger ? null : timeframe;
}

function readLeaf(child: Condition, trigger: TimeframeString, options: ComboReadOptions): ComboLeaf | null {
    if (child.kind === "external_feed") {
        if (!options.allowFeed) return null;
        // Claimed only when the rebuild is the stored leaf, so opening the
        // veto cannot rewrite a threshold ("0.010" stays locked, not "0.01").
        if (feedValue(child.value) !== child.value) return null;
        return { id: generateId(), kind: "feed", feed: child.feed, op: child.op, value: child.value, timeframe: null };
    }
    if (child.kind === "pattern") {
        return {
            id: generateId(),
            kind: "pattern",
            pattern: child.pattern,
            timeframe: ownTimeframe(child.timeframe, trigger),
        };
    }
    if (child.kind !== "compare" && child.kind !== "cross") return null;

    // `readIndicatorForm` takes the sole condition of a group, so each leaf
    // is handed over wrapped the way that reader expects.
    const form = readIndicatorForm({ kind: "group", op: "all", of: [child] });
    if (form && catalogueEntry(form.subject.id)) {
        return {
            id: generateId(),
            kind: "indicator",
            form,
            timeframe: ownTimeframe(child.timeframe, trigger),
        };
    }
    const reading = priceReadingOf(child);
    if (reading) {
        return {
            id: generateId(),
            kind: "price",
            reading,
            timeframe: ownTimeframe(child.timeframe, trigger),
        };
    }
    return null;
}

function readTree(
    conditions: Condition | null | undefined,
    trigger: TimeframeString,
    options: ComboReadOptions = {},
): TreeReading {
    if (!conditions || conditions.kind !== "group") return { reason: "unsupported" };
    // A `none` group is legal in the core and may arrive from a template, an
    // import or a model proposal. The builder does not offer that operator,
    // so it says so by refusing to open the document -- rewriting it into an
    // `all` would hand the trader a different rule under the same name.
    if (!isOfferedOp(conditions.op)) return { reason: "unsupported" };

    const rows: ComboNode[] = [];
    let leaves = 0;
    for (const child of conditions.of) {
        if (child.kind === "group") {
            if (!isOfferedOp(child.op) || child.of.length === 0) return { reason: "unsupported" };
            const members: ComboLeaf[] = [];
            for (const grandchild of child.of) {
                // A third level is legal in the core but deeper than this
                // builder edits; flattening it would change what it means.
                const leaf = readLeaf(grandchild, trigger, options);
                if (!leaf) return { reason: "unsupported" };
                members.push(leaf);
            }
            leaves += members.length;
            rows.push({ id: generateId(), kind: "group", op: child.op, members });
            continue;
        }
        const leaf = readLeaf(child, trigger, options);
        if (!leaf) return { reason: "unsupported" };
        leaves += 1;
        rows.push(leaf);
    }
    if (leaves > MAX_COMBO_CONDITIONS) return { reason: "too_many" };
    return { form: { op: conditions.op, rows } };
}

/**
 * Read an existing document back into the form.
 *
 * Returns `null` for a tree this builder cannot represent -- a third level of
 * nesting, a NOR group, more leaves than the cap, a leaf it has no row for --
 * rather than dropping the parts it does not understand. Silently editing
 * away half a trader's rule is worse than showing them that this tab cannot
 * open it.
 */
export function readComboForm(
    conditions: Condition | null | undefined,
    triggerTimeframe: TimeframeString,
    options: ComboReadOptions = {},
): ComboForm | null {
    const reading = readTree(conditions, triggerTimeframe, options);
    return "form" in reading ? reading.form : null;
}

/**
 * Why `readComboForm` refused `conditions`, or `null` when it would open them.
 * The tab names the reason so a trader with seventeen conditions learns that
 * the count is the problem, not that the builder failed.
 */
export function comboLockReason(
    conditions: Condition | null | undefined,
    triggerTimeframe: TimeframeString,
    options: ComboReadOptions = {},
): ComboLockReason | null {
    const reading = readTree(conditions, triggerTimeframe, options);
    return "reason" in reading ? reading.reason : null;
}

/**
 * A stored veto as a group the tree editor can open (FEAT-0814). A veto may
 * be a bare leaf -- the core does not require a group there -- so a single
 * leaf is read as a one-member `all` group. The editor writes back only once
 * the trader edits, so opening a bare veto never rewrites its hash.
 */
export function vetoAsGroup(veto: Condition | null | undefined): Condition | null {
    if (!veto) return null;
    return veto.kind === "group" ? veto : { kind: "group", op: "all", of: [veto] };
}
