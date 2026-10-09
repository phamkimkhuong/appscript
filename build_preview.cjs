const fs = require('fs');

let index = fs.readFileSync('Index.html', 'utf8');
const styles = fs.readFileSync('Styles.html', 'utf8');
const modals = fs.readFileSync('Modals.html', 'utf8');
const scripts = fs.readFileSync('Scripts.html', 'utf8');

index = index.replace(/<\?!=\s*include\(['"]Styles['"]\);\s*\?>/g, styles);
index = index.replace(/<\?!=\s*include\(['"]Modals['"]\);\s*\?>/g, modals);
index = index.replace(/<\?!=\s*include\(['"]Scripts['"]\);\s*\?>/g, scripts);

fs.writeFileSync('preview.html', index, 'utf8');
console.log('preview.html successfully rebuilt, total size:', index.length);
