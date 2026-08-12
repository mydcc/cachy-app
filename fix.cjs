const fs = require('fs');

const file = 'src/services/dataRepairService.ts';
let code = fs.readFileSync(file, 'utf-8');

// The linter error is on line 293. Let's find out what it is.
