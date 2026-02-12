
import { BufferPool } from '../src/utils/bufferPool';

const pool = new BufferPool();

// Test 1: Capacity Bucketing
console.log("Test 1: Capacity Bucketing");
const b1 = pool.acquire(1000);
console.log(`Acquired 1000 -> Buffer Length: ${b1.length}`);

if (b1.length === 1024) {
    console.log("PASS: 1000 -> 1024 bucket");
} else {
    console.error(`FAIL: 1000 -> ${b1.length}`);
    process.exit(1);
}

pool.release(b1);

// Test 2: Reuse
console.log("\nTest 2: Reuse");
const b2 = pool.acquire(1001);
console.log(`Acquired 1001 -> Buffer Length: ${b2.length}`);

if (b2 === b1) {
    console.log("PASS: Buffer instance reused!");
} else {
    console.error("FAIL: Buffer instance NOT reused (Address differs)");
    process.exit(1);
}

if (b2.length === 1024) {
    console.log("PASS: 1001 -> 1024 bucket");
}

pool.release(b2);

// Test 3: Growth
console.log("\nTest 3: Growth");
const b3 = pool.acquire(2000);
console.log(`Acquired 2000 -> Buffer Length: ${b3.length}`);

if (b3.length === 2048) {
    console.log("PASS: 2000 -> 2048 bucket");
} else {
    console.error(`FAIL: 2000 -> ${b3.length}`);
    process.exit(1);
}
