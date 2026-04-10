/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
