// ABI drift gate for the WASM technicals module (BUG-0313).
//
// Verifies that the three committed artifacts in static/wasm/ stay one
// consistent wasm-bindgen trio:
//
//   technicals_wasm_bg.wasm — the compiled module
//   technicals_wasm.js      — the generated glue (provides the imports)
//   technicals_wasm.d.ts    — the declared API surface (classes + methods)
//
// A raw cargo binary copied next to an older glue will NOT instantiate
// (missing __wbindgen_* imports) and historically shipped silently broken —
// this gate makes that drift fail loudly instead. Run after build:wasm:
//
//   npm run check:wasm
import { readFile } from 'fs/promises';

const DIR = 'static/wasm';
const failures = [];

function fail(msg) {
  failures.push(msg);
}

function extractDeclaredMethods(dts) {
  // Map "export class Foo { ... bar(): void; ... }" → { foo: ['bar', …] },
  // skipping members that are not wasm-bindgen exports (constructor, free,
  // Symbol.dispose).
  const declared = {};
  const classRe = /export class (\w+)\s*\{([\s\S]*?)\n\}/g;
  const methodRe = /^\s{4}([A-Za-z_]\w*)\(/gm;
  const SKIP = new Set(['constructor', 'free']);
  for (const [, className, body] of dts.matchAll(classRe)) {
    const methods = [...body.matchAll(methodRe)]
      .map(m => m[1])
      .filter(name => !SKIP.has(name) && !name.startsWith('['));
    if (methods.length > 0) declared[className.toLowerCase()] = methods;
  }
  return declared;
}

const [wasmBytes, glueSrc, dtsSrc] = await Promise.all([
  readFile(`${DIR}/technicals_wasm_bg.wasm`).catch(() => null),
  readFile(`${DIR}/technicals_wasm.js`, 'utf8').catch(() => null),
  readFile(`${DIR}/technicals_wasm.d.ts`, 'utf8').catch(() => null),
]);

if (!wasmBytes || !glueSrc || !dtsSrc) {
  console.error('❌ Missing artifacts in static/wasm/:', [
    !wasmBytes && 'technicals_wasm_bg.wasm',
    !glueSrc && 'technicals_wasm.js',
    !dtsSrc && 'technicals_wasm.d.ts',
  ].filter(Boolean).join(', '));
  console.error('   Run `npm run build:wasm` first.');
  process.exit(1);
}

let mod;
try {
  mod = await WebAssembly.compile(wasmBytes);
} catch (err) {
  console.error('❌ static/wasm/technicals_wasm_bg.wasm does not compile:', err.message);
  process.exit(1);
}

const exportNames = new Set(WebAssembly.Module.exports(mod).map(e => e.name));

// 1. Every import the binary declares must be provided by the glue.
const imports = WebAssembly.Module.imports(mod);
const unprovided = [...new Set(imports.map(i => i.name))].filter(
  name => !glueSrc.includes(name),
);
if (unprovided.length > 0) {
  fail(`binary needs ${unprovided.length} import(s) the glue does not provide: ${unprovided.slice(0, 5).join(', ')}`);
}

// 2. The binary must export every method declared on a d.ts class, using
//    wasm-bindgen's `<class>_<method>` naming.
const declared = extractDeclaredMethods(dtsSrc);
for (const [className, methods] of Object.entries(declared)) {
  for (const method of methods) {
    const expected = `${className}_${method}`;
    if (!exportNames.has(expected)) {
      fail(`declared API missing from binary exports: ${expected}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`❌ WASM ABI drift detected (${failures.length}):`);
  for (const f of failures) console.error(`   - ${f}`);
  console.error('\nThe glue/binary/d.ts trio in static/wasm/ is inconsistent.');
  console.error('Regenerate all three together: npm run build:wasm');
  process.exit(1);
}

console.log(
  `✅ WASM ABI consistent: ${imports.length} imports provided by glue, ` +
  `${Object.values(declared).flat().length} declared API methods exported ` +
  `(${wasmBytes.length} bytes).`,
);
