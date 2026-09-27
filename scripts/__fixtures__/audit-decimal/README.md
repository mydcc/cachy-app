# audit-decimal fixtures

One directory per case, so a test can point `scripts/audit-decimal.mjs` at
exactly the tree it means. Driven by
`src/tests/architecture/audit_decimal_svelte.test.ts` (BUG-0534).

Outside `src/` on purpose: a fixture under `src/` would fail the real audit
run, which is the opposite of what a fixture is for.

| Directory        | Case                                                        |
| ---------------- | ----------------------------------------------------------- |
| `unsafe-component` | `parseFloat` on a price in a `<script>` block, no Decimal import |
| `unsafe-markup`    | `Number()` in a template expression, not in `<script>`        |
| `unsafe-decimal`   | a `.ts` Decimal importer with a native conversion (unchanged path) |
| `safe-marked`      | a display-only conversion carrying `// audit: safe — <reason>` |
| `safe-marked-markup` | the same in a template expression, where a line comment is not a comment |
| `unreasoned`       | a marker with no reason — its own failure, not an exemption    |
| `comment-only`     | conversions that appear only inside comments                  |
| `summary`          | one clean file of each kind, to assert the reported counts    |
