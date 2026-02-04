const Decimal = require('decimal.js');
const d = new Decimal("123.456");
const count = 1000000;

console.time('toNumber');
for(let i=0; i<count; i++) {
    d.toNumber();
}
console.timeEnd('toNumber');

console.time('instanceof_parse');
for(let i=0; i<count; i++) {
    if (d instanceof Decimal) {
        parseFloat(d.toString());
    }
}
console.timeEnd('instanceof_parse');
