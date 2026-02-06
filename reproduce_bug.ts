import { safeJsonParse } from './src/utils/safeJson';
const bigIntStr = "1234567890123456789";
const json = `{"key\\"": ${bigIntStr}}`;
console.log("Input:", json);
const parsed = safeJsonParse(json);
console.log("Parsed type:", typeof parsed['key"']);
