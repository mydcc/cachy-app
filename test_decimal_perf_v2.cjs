const Decimal = require('decimal.js');

const d = new Decimal("12345.6789");
const count = 1000000;

console.time('toNumber');
let sum = 0;
for(let i=0; i<count; i++) {
    sum += d.toNumber();
}
console.timeEnd('toNumber');

console.time('parseFloat');
sum = 0;
for(let i=0; i<count; i++) {
    sum += parseFloat(d.toString());
}
console.timeEnd('parseFloat');

console.time('valueOf');
sum = 0;
for(let i=0; i<count; i++) {
    // valueOf is usually same as toString or toNumber
    sum += Number(d);
}
console.timeEnd('valueOf');

// Let's try to access private props to build number
// Decimal.js config: precision 20, rounding 4, toExpNeg -7, toExpPos 21.
// Base is 1e7.

console.time('customReconstruct');
sum = 0;
for(let i=0; i<count; i++) {
   // This is risky and depends on decimal.js version/internals
   // But let's see if we can do it.
   // value = s * (d[0] * 1e(e) + ... ) ??
   // It is complicated.
   sum += d.toNumber(); // Placeholder
}
console.timeEnd('customReconstruct');
