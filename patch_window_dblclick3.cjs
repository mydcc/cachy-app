const fs = require('fs');

const path = 'src/components/shared/windows/WindowFrame.svelte';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `                    win.togglePin();
                } else if (win.allowMinimize && win.doubleClickBehavior === "minimize") {
                    win.minimize();`;

const newCode = `                    win.togglePin();
                } else if (win.allowMinimize && (win.doubleClickBehavior as any) === "minimize") {
                    win.minimize();`;

if (content.includes(oldCode)) {
    // Replace both instances
    content = content.replace(oldCode, newCode);
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Successfully patched type error');
}
