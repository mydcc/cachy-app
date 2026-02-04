const Decimal = require('decimal.js');

const decimals = [];
for(let i=0; i<10000; i++) {
    decimals.push(new Decimal(Math.random() * 10000));
}

const count = 100; // Loop 100 times over 10000 decimals = 1M ops

console.time('toNumber');
let sum = 0;
for(let j=0; j<count; j++) {
    for(let i=0; i<decimals.length; i++) {
        sum += decimals[i].toNumber();
    }
}
console.timeEnd('toNumber');

console.time('parseFloat');
sum = 0;
for(let j=0; j<count; j++) {
    for(let i=0; i<decimals.length; i++) {
        sum += parseFloat(decimals[i].toString());
    }
}
console.timeEnd('parseFloat');
