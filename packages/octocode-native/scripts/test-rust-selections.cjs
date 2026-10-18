'use strict';

// The `test:rust` script in package.json is the one source of the Rust test
// selections (packages and features). Tools that must run the same selections
// read them here instead of keeping a copy.

const RUN = 'cargo nextest run ';

/** The argument list of every `cargo nextest run` command in the `test:rust` script. */
function testRustSelections(pkg = require('../package.json')) {
  return pkg.scripts['test:rust'].split('&&').map(command => {
    const trimmed = command.trim();
    if (!trimmed.startsWith(RUN)) throw Error(`test:rust step is not "${RUN}…": ${trimmed}`);
    return trimmed.slice(RUN.length).split(/\s+/);
  });
}

module.exports = { testRustSelections };
