const Decimal = require('decimal.js');

const d = new Decimal("12345.6789");
const count = 1000000;

console.time('toNumber');
for(let i=0; i<count; i++) {
    d.toNumber();
}
console.timeEnd('toNumber');

console.time('parseFloat');
for(let i=0; i<count; i++) {
    parseFloat(d.toString());
}
console.timeEnd('parseFloat');

// Custom extraction if possible
// Decimal stores: s (sign), e (exponent), d (array of digits, base 1e7 by default)

console.time('custom');
for(let i=0; i<count; i++) {
    // This is just a guess at implementation, standard Decimal.js uses base 1e7
    // but accessing private props is risky.
    // Let's just see if we can read them.
    const val = d.d[0];
}
console.timeEnd('custom');
