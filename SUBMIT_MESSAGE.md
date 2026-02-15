# 🧹 Remove commented out console warning

## 🎯 What
Removed a commented-out `console.warn` statement in `src/lib/windows/implementations/CandleChartView.svelte`.

## 💡 Why
The code was commented out and no longer needed. Keeping commented-out code reduces readability.

## ✅ Verification
- Verified the removal in the file.
- Ran `npm run check` to ensure no regressions.
- Verified the surrounding logic remains intact.

## ✨ Result
Cleaner codebase.
