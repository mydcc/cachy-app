const fs = require('fs');
let code = fs.readFileSync('src/services/apiService.ts', 'utf8');
code = code.replace(/volNum \+= c\.volume\.toNumber\(\);/, 'volNum += +c.volume;');
fs.writeFileSync('src/services/apiService.ts', code);
