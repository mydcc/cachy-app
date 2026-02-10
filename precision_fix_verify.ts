function naiveBB(data, period) {
    let sum = 0;
    let sumSq = 0;
    // initial
    for(let i=0; i<period; i++) { sum += data[i]; sumSq += data[i]*data[i]; }

    // next step (simulate sliding)
    // drop 0, add period
    // sum/sumSq updated...
    // let's just do one window calculation
    const avg = sum / period;
    const vari = (sumSq - period * avg * avg) / period;
    return Math.sqrt(Math.max(0, vari));
}

function loopBB(data, period) {
    let sum = 0;
    for(let i=0; i<period; i++) sum += data[i];
    const avg = sum / period;

    let sumSqDiff = 0;
    for(let i=0; i<period; i++) {
        sumSqDiff += (data[i] - avg) ** 2;
    }
    return Math.sqrt(sumSqDiff / period);
}

const base = 100000000;
const data = [];
for(let i=0; i<20; i++) data.push(base + (i%2)*0.1);

console.log("Naive: ", naiveBB(data, 20));
console.log("Loop:  ", loopBB(data, 20));
