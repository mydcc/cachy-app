const Decimal = require('decimal.js');

const strings = [];
for(let i=0; i<10000; i++) {
    strings.push((Math.random() * 10000).toFixed(8));
}

// Pre-create Decimals
const decimals = strings.map(s => new Decimal(s));

const count = 100;

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
