function naiveStdDev(data) {
    const period = data.length;
    let sum = 0;
    let sumSq = 0;
    for (let x of data) {
        sum += x;
        sumSq += x * x;
    }
    const avg = sum / period;
    const varNaive = (sumSq - period * avg * avg) / period;
    return Math.sqrt(Math.max(0, varNaive));
}

function twoPassStdDev(data) {
    const period = data.length;
    let sum = 0;
    for (let x of data) sum += x;
    const avg = sum / period;
    let sumSqDiff = 0;
    for (let x of data) {
        sumSqDiff += Math.pow(x - avg, 2);
    }
    return Math.sqrt(sumSqDiff / period);
}

const base = 100000; // 100k (BTC level)
const data = [base + 0.1, base + 0.2, base + 0.1, base + 0.3, base + 0.1];

console.log("Naive:    ", naiveStdDev(data));
console.log("Two-Pass: ", twoPassStdDev(data));
