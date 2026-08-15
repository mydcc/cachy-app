---
id: BUG-0182
title: "Epic: Migrate Rust/WASM backend to rust_decimal"
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: core
data_class: none
adr: none
depends_on: []
estimate: 3
size: M
target_date: 2026-08-24
---

# BUG-0182 — Epic: Migrate Rust/WASM backend to rust_decimal

## Symptom

Financial calculations or representations (prices, amounts, balances, etc.) were using native number/f64 arithmetic in the Rust codebase (`lib.rs`, `alert_exports.rs`). This violates the institutional-grade standard of zero tolerance for floating-point inaccuracies in financial data. 
This Epic consolidates multiple smaller bugs previously logged (BUG-0172 to BUG-0181).

## Fix & Instructions for Jules

Refactor the code to use `rust_decimal::Decimal` for all financial calculations, types, and formatting in the Rust/WASM backend.

**WASM Boundary Rule:**
When passing `Decimal` values across the WASM boundary (to or from TypeScript), serialize them as `String` in the `#[wasm_bindgen]` signatures. Do not pass them as `f64` or JavaScript `Number`. 

- Replace all `f64` types used for financial values with `rust_decimal::Decimal`.
- Ensure that parsing from/to Strings is handled gracefully.
- Run `cargo test` and `npm run build` (which triggers `scripts/build_wasm.sh`) to ensure compilation succeeds.

## Acceptance criteria

- [x] `lib.rs` and `alert_exports.rs` use `rust_decimal` instead of `f64` for financial values.
- [x] Financial values cross the WASM boundary as Strings — `initialize` takes
      `string[]` for closes/highs/lows/volumes, `update` takes decimal strings,
      and results serialize back as strings (`serde-with-str`).
- [x] `npm run check` and `npm run test` pass.
- [x] E2E tests still pass.
