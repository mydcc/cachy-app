const fs = require('fs');

let code = fs.readFileSync('src/components/shared/charts/CalendarHeatmap.svelte', 'utf8');

// I notice extra trailing tags that got duplicated in the replace earlier:
//       </div>
//     </div>
//     {#if hoveredEntry.bestSymbol}
//      ...
//     {/if}
//     ...

// Let's strip out the malformed trailing tags. The correct end of file should be `</style>\n`
const startOfBadCode = code.indexOf('      </div>\n    </div>\n    {#if hoveredEntry.bestSymbol}');
if (startOfBadCode !== -1) {
    const endOfBadCode = code.indexOf('{/if}\n\n<style>', startOfBadCode);
    if (endOfBadCode !== -1) {
        code = code.slice(0, startOfBadCode) + code.slice(endOfBadCode + 6);
    }
}

// Remove duplicated `hoveredDateStr = dateStr;` in handleMouseEnter
code = code.replace(
    'hoveredDateStr = dateStr;\n    hoveredDateStr = dateStr;',
    'hoveredDateStr = dateStr;'
);

fs.writeFileSync('src/components/shared/charts/CalendarHeatmap.svelte', code);
