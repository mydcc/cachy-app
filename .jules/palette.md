## 2024-05-18 - Say when the close dialog's PnL mark is derived

**Learning:** When displaying the realized PnL of a close action inside the `PartialCloseInput` form, the value might be based on an exact mark directly from the venue, or derived from unrealized PnL due to missing exchange data. The UI should make this explicit for the user so they know when a figure is a derived estimate without losing that critical piece of information.

**Action:** Added `isDerivedMarkPrice` check to `ClosePositionModal` by evaluating `!position.markPrice || position.markPrice.lte(0)`. Passed this explicitly through `PartialCloseContext` so that `PartialCloseInput` can dynamically render `"realizesPnlDerived": "Realizes (est.)"` vs `"realizesPnl": "Realizes"`. Ensured unit tests verified both state paths and confirmed that the submitted `amount` is identical.
