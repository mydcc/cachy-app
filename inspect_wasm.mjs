// Quick script to inspect WASM exports
import { readFile } from 'fs/promises';

const wasmBytes = await readFile('static/wasm/technicals_wasm.wasm');
const wasmModule = await WebAssembly.compile(wasmBytes);

console.log('=== WASM Module Exports ===');
const exports = WebAssembly.Module.exports(wasmModule);
exports.forEach((exp, i) => {
  console.log(`${i}: ${exp.name} (${exp.kind})`);
});

console.log('\n=== WASM Module Imports ===');
const imports = WebAssembly.Module.imports(wasmModule);
imports.forEach((imp, i) => {
  console.log(`${i}: ${imp.module}.${imp.name} (${imp.kind})`);
});
