
Title: "🧪 Add tests for heatmapUtils"

Description:
🎯 **What:** The testing gap for `getCoinankUrl`, `getCoinankTimeframe`, `getCoinankHeatmapSymbol`, and `getCoinglassUrl` in `src/utils/heatmapUtils.ts` has been fully addressed.
📊 **Coverage:**
- `getCoinankTimeframe`: Tested for valid Cachy timeframes mappings and fallback defaults for unknown and empty strings.
- `getCoinankHeatmapSymbol`: Tested for standard symbols and striping of special characters such as `/`, `-`, and `.P` suffixes to normalized lowercase strings.
- `getCoinankUrl`: Tested for URL formatting in both `iframe` and `link` modes with various standard timeframe, timeframe default fallbacks and stripped symbol cases.
- `getCoinglassUrl`: Tested for URL formatting, focusing specifically on correctly handling special symbols and `.P` suffixes removal.
✨ **Result:** Test coverage for `src/utils/heatmapUtils.ts` has been significantly improved, acting as a regression safety net for future refactoring and features.
