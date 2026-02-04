const Decimal = require('decimal.js');
const d1 = new Decimal("1.23e-20");
console.log("d1.toString():", d1.toString());
console.log("parseFloat(d1.toString()):", parseFloat(d1.toString()));
console.log("d1.toNumber():", d1.toNumber());

const d2 = new Decimal("1.23e+30");
console.log("d2.toString():", d2.toString());
console.log("parseFloat(d2.toString()):", parseFloat(d2.toString()));
console.log("d2.toNumber():", d2.toNumber());
