const Decimal = require('decimal.js');
const { performance } = require('perf_hooks');

const d = new Decimal("123.45");

let start = performance.now();
let sum = 0;
for(let i=0; i<10000000; i++) {
    sum += d.toNumber();
}
console.log("toNumber():", performance.now() - start);

start = performance.now();
let sum2 = 0;
for(let i=0; i<10000000; i++) {
    sum2 += d['toNumber']();
}
console.log("['toNumber']():", performance.now() - start);

start = performance.now();
let sum3 = 0;
for(let i=0; i<10000000; i++) {
    sum3 += +d;
}
console.log("+d:", performance.now() - start);
