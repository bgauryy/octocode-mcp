// The engine repeats the workspace lint floor inline (its own `[lints]` block,
// because it adds library-only denials). A key that drifts from the workspace
// value weakens one crate silently, so every shared key must match exactly.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** key → raw value for the TOML table `[header]` (no nested tables). */
function table(toml, header) {
  const lines = toml.split('\n');
  const start = lines.indexOf(`[${header}]`);
  assert.notEqual(start, -1, `missing [${header}]`);
  const values = {};
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('[')) break;
    const match = line.match(/^([a-z_]+)\s*=\s*(.+?)\s*(#.*)?$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

for (const kind of ['rust', 'clippy']) {
  test(`engine [lints.${kind}] matches the workspace floor for every shared key`, () => {
    const workspace = table(fs.readFileSync(path.join(ROOT, 'Cargo.toml'), 'utf8'), `workspace.lints.${kind}`);
    const engine = table(fs.readFileSync(path.join(ROOT, 'crates/engine/Cargo.toml'), 'utf8'), `lints.${kind}`);
    const drift = Object.keys(workspace)
      .filter(key => key in engine && engine[key] !== workspace[key])
      .map(key => `${key}: workspace ${workspace[key]} vs engine ${engine[key]}`);
    assert.deepEqual(drift, []);
    assert.ok(Object.keys(workspace).length > 0, 'workspace floor is empty');
  });
}
