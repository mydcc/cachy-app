import { safeJsonParse } from '../../src/utils/safeJson';

// Legacy implementation for comparison
function safeJsonParseLegacy(jsonString: string) {
    if (!jsonString) return jsonString as any;
    if (typeof jsonString !== 'string') return jsonString;

    let protectedJson = jsonString.replace(/"([^"]+)"\s*:\s*(-?\d[\d.eE+-]{14,})(?=\s*[,}])/g, '"$1": "$2"');
    protectedJson = protectedJson.replace(/([\[,]\s*)(-?\d[\d.eE+-]{14,})(?=\s*[,\]])/g, '$1"$2"');

    return JSON.parse(protectedJson);
}

const smallJson = JSON.stringify({
    id: 123,
    name: "test",
    value: 45.67
});

const largeNumberJson = JSON.stringify({
    id: 1234567890123456789, // large int
    small: 123,
    price: 12345.123456789012345, // high precision
    nested: {
        id: 9876543210987654321
    }
});

const depthData = {
    ch: "depth_book5",
    ts: 1234567890,
    data: {
        b: Array.from({ length: 50 }, (_, i) => [
            12345.123456789012345 + i,
            1.5 + i
        ]),
        a: Array.from({ length: 50 }, (_, i) => [
            12346.123456789012345 + i,
            2.5 + i
        ])
    }
};
const depthJson = JSON.stringify(depthData);

function runBench(name: string, fn: () => void, iterations = 1000) {
    // Warmup
    for(let i=0; i<10; i++) fn();

    const start = performance.now();
    for(let i=0; i<iterations; i++) {
        fn();
    }
    const end = performance.now();
    const duration = end - start;
    const opsPerSec = (iterations / duration) * 1000;
    console.log(`${name}: ${duration.toFixed(2)}ms for ${iterations} ops (${opsPerSec.toFixed(0)} ops/s) -> ${(duration/iterations).toFixed(3)} ms/op`);
}

console.log("=== SafeJson Benchmark ===");
console.log("Running Small Payload (Common Case)...");
runBench('Legacy', () => safeJsonParseLegacy(smallJson), 10000);
runBench('Optimized', () => safeJsonParse(smallJson), 10000);

console.log("\nRunning Large Payload (Heavy Case)...");
runBench('Legacy', () => safeJsonParseLegacy(largeNumberJson), 10000);
runBench('Optimized', () => safeJsonParse(largeNumberJson), 10000);

console.log("\nRunning Depth Update (Worst Case)...");
runBench('Legacy', () => safeJsonParseLegacy(depthJson), 1000);
runBench('Optimized', () => safeJsonParse(depthJson), 1000);
