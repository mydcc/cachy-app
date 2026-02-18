# Cachy App Code Analysis & Hardening Report

**Date:** 2026-05-22
**Auditor:** Jules (Senior Lead Developer)
**Status:** In-Depth Analysis Complete

## 🔴 CRITICAL (Risk of Financial Loss, Crash, or Security Vulnerability)

### 1. Data Integrity: Type Mismatch in `fetchBitunixKlines`
- **Location:** `src/services/apiService.ts` (Line ~418)
- **Issue:** The `high` property of a Kline is assigned as a `string` (`high.toString()`) but the `Kline` interface strictly requires `Decimal`.
- **Risk:** Downstream calculations (Technicals, Indicators) expecting a `Decimal` object will crash immediately when attempting methods like `.plus()` or `.times()`. This is a guaranteed runtime error if that code path is hit.
- **Fix Required:** Remove `.toString()` and ensure strict `Decimal` type assignment.

### 2. Performance: Synchronous Execution Risk in `fillGaps`
- **Location:** `src/services/marketWatcher.ts`
- **Issue:** The `fillGaps` method iterates synchronously up to `klines.length` (potentially 1000+) and can insert up to 5000 candles per gap.
- **Risk:** While optimized for V8, a massive data gap (e.g., after sleep mode) could block the main thread for >50ms, causing UI stutter during critical market movements.
- **Fix Required:** Move heavy gap-filling logic to a Web Worker or break into chunks using `requestIdleCallback`.

### 3. Data Integrity: Manual Parsing in `bitgetWs`
- **Location:** `src/services/bitgetWs.ts` (Inferred/Checked)
- **Issue:** The WebSocket handler for Bitget parses candle/ticker data manually without strict Zod validation schema (unlike `bitunixWs.ts`).
- **Risk:** If Bitget changes their API response format (e.g., fields become null or change type), the app could process corrupt data, leading to incorrect trading decisions.
- **Fix Required:** Implement strict Zod schemas for Bitget WS messages similar to `BitunixWSMessageSchema`.

## 🟡 WARNING (Performance Issue, UX Error, Missing i18n)

### 1. Accessibility & UX: Hardcoded Error Strings
- **Location:** `src/routes/+layout.svelte`
- **Issue:** Error messages like "An unexpected error occurred." are hardcoded strings.
- **Risk:** Non-English users will see untranslated errors.
- **Fix Required:** Move all error strings to `src/locales/locales/{en,de}.json`.

### 2. Accessibility: Interactive Elements without Keyboard Support
- **Location:** `src/routes/+layout.svelte` (Jules Report Overlay)
- **Issue:** `div` elements with `onclick` handlers use `svelte-ignore a11y_click_events_have_key_events`.
- **Risk:** Users navigating via keyboard cannot close the overlay.
- **Fix Required:** Replace `div` with `<button>` or add `onkeydown` handlers and `role="button"`.

### 3. Type Safety: Loose Typing in `tradeService`
- **Location:** `src/services/tradeService.ts`
- **Issue:** `TpSlOrder` interface uses `[key: string]: unknown`, allowing arbitrary properties. `fetchTpSlOrders` uses `any` in generics.
- **Risk:** Refactoring could break hidden dependencies.
- **Fix Required:** Define strict types for all Order properties.

### 4. Data Integrity: Manual API Mapping in `newsService`
- **Location:** `src/services/newsService.ts`
- **Issue:** Responses from CryptoPanic and NewsAPI are mapped manually.
- **Risk:** API changes could break the news feed silently.
- **Fix Required:** Add Zod validation step before mapping.

## 🔵 REFACTOR (Technical Debt)

### 1. Resource Management: Synthetic Subscription Complexity
- **Location:** `src/services/bitunixWs.ts`
- **Issue:** The `syntheticSubs` logic (creating 1h candles from 1m stream) is complex and potentially fragile if state drifts.
- **Recommendation:** Isolate synthetic logic into a dedicated `SyntheticMarketService` to improve testability.

### 2. State Management: Polling in `chat.svelte.ts`
- **Location:** `src/stores/chat.svelte.ts`
- **Issue:** Uses `setInterval` for polling.
- **Recommendation:** Switch to WebSocket or Server-Sent Events (SSE) for chat to reduce server load and improve latency.
