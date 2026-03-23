#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.join(__dirname, 'scripts');

function collectJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const files = collectJsFiles(scriptsDir);

for (const filePath of files) {
  let code = fs.readFileSync(filePath, 'utf8');
  const shebang = code.startsWith('#!') ? code.slice(0, code.indexOf('\n') + 1) : '';
  if (shebang) code = code.slice(shebang.length);
  const result = await minify(code, { compress: true, mangle: true, module: true, format: { ecma: 2022 } });
  if (result.error) throw result.error;
  fs.writeFileSync(filePath, shebang + (result.code ?? ''), 'utf8');
}
