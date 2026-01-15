import { generateStableId } from './src/utils/utils';

const id1 = generateStableId("test-id-123");
const id2 = generateStableId("test-id-123");
const id3 = generateStableId("test-id-456");

console.log(`ID1: ${id1}`);
console.log(`ID2: ${id2}`);
console.log(`ID3: ${id3}`);

if (id1 === id2 && id1 !== id3) {
    console.log("SUCCESS: Hash is stable and distinct.");
} else {
    console.error("FAILURE: Hash check failed.");
    process.exit(1);
}
