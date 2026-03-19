#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.join(__dirname, 'scripts');
const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(scriptsDir, file);
  let code = fs.readFileSync(filePath, 'utf8');
  const shebang = code.startsWith('#!') ? code.slice(0, code.indexOf('\n') + 1) : '';
  if (shebang) code = code.slice(shebang.length);
  const result = await minify(code, { compress: true, mangle: true, format: { ecma: 2020 } });
  if (result.error) throw result.error;
  fs.writeFileSync(filePath, shebang + (result.code ?? ''), 'utf8');
}
