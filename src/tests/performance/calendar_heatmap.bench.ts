// @vitest-environment happy-dom
import { describe, bench } from "vitest";
import { mount, unmount } from "svelte";
import CalendarHeatmap from "../../components/shared/charts/CalendarHeatmap.svelte";

if (typeof window !== "undefined") {
    window.matchMedia = window.matchMedia || function() {
        return {
            matches: false,
            addListener: function() {},
            removeListener: function() {}
        };
    };
}

// Ensure the benchmark has valid sample data as this impacts the rendering of the heatmap elements.
const testData = Array.from({ length: 365 }, (_, i) => {
    const d = new Date(2024, 0, 1);
    d.setDate(d.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
        date: dateStr,
        pnl: Math.random() * 200 - 100,
        count: Math.floor(Math.random() * 10),
    };
});

describe("CalendarHeatmap Render Performance", () => {
    bench("initial render", () => {
        const div = document.createElement("div");
        document.body.appendChild(div);
        const comp = mount(CalendarHeatmap, {
            target: div,
            props: {
                data: testData,
                year: 2024
            }
        });
        unmount(comp);
        document.body.removeChild(div);
    });
});
