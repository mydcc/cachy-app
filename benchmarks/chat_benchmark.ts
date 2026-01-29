
import { GET, POST } from "../src/routes/api/chat-v2/+server";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';

// Setup environment for benchmark
const DB_PATH = "db/chat_messages.json";
const BENCH_DB_DIR = "db";

async function cleanup() {
    try {
        await fs.rm(BENCH_DB_DIR, { recursive: true, force: true });
    } catch (e) {}
}

async function runBenchmark() {
    console.log("Starting benchmark...");

    // Ensure clean state
    await cleanup();

    // Pre-fill DB with some data to simulate real usage
    const PREFILL_COUNT = 900;
    console.log(`Pre-filling DB with ${PREFILL_COUNT} messages...`);
    // We can just write the file directly to save time
    const initialMessages = Array.from({ length: PREFILL_COUNT }, (_, i) => ({
        id: `prefill-${i}`,
        text: `History message ${i}`,
        sender: "user" as const,
        timestamp: Date.now() - (PREFILL_COUNT - i) * 1000
    }));
    await fs.mkdir(BENCH_DB_DIR, { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify(initialMessages));


    // Measure POST (Write) Performance
    const POST_ITERATIONS = 50;
    const postStart = performance.now();

    for (let i = 0; i < POST_ITERATIONS; i++) {
        const req = {
            json: async () => ({
                text: `Message ${i}`,
                sender: "user",
                clientId: "bench-client"
            })
        };
        await POST({ request: req } as any);
    }

    const postEnd = performance.now();
    const postTime = postEnd - postStart;
    console.log(`POST: ${POST_ITERATIONS} reqs in ${postTime.toFixed(2)}ms (${(postTime/POST_ITERATIONS).toFixed(2)}ms/req)`);

    // Measure GET (Read) Performance
    const GET_ITERATIONS = 100;
    const getStart = performance.now();
    const url = new URL("http://localhost/api/chat-v2");

    for (let i = 0; i < GET_ITERATIONS; i++) {
        await GET({ url } as any);
    }

    const getEnd = performance.now();
    const getTime = getEnd - getStart;
    console.log(`GET: ${GET_ITERATIONS} reqs in ${getTime.toFixed(2)}ms (${(getTime/GET_ITERATIONS).toFixed(2)}ms/req)`);

    // Cleanup
    await cleanup();
}

runBenchmark().catch(console.error);
