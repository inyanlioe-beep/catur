'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const files = ['index.html', 'styles.css', 'script.js', 'engine.js', 'ai-worker.js'];

fs.mkdirSync(output, { recursive: true });
for (const file of files)
    fs.copyFileSync(path.join(root, file), path.join(output, file));

console.log(`Build selesai: ${files.length} berkas statis di dist/`);
