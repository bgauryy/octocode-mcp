#!/usr/bin/env node
'use strict';

// Rust line coverage over exactly the `test:rust` selections. Each selection
// runs under `cargo llvm-cov nextest --no-report` (instrumented build in
// target/llvm-cov-target, apart from the dev build), then one merged report.
// Report flags pass through: `yarn coverage:rust --html`, `--lcov --output-path lcov.info`.

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { testRustSelections } = require('./test-rust-selections.cjs');

function cargo(args) {
  console.log(`$ cargo ${args.join(' ')}`);
  const { status, error } = spawnSync('cargo', args, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
  if (error) throw error;
  if (status !== 0) process.exit(status ?? 1);
}

cargo(['llvm-cov', 'clean', '--workspace']);
for (const selection of testRustSelections()) cargo(['llvm-cov', 'nextest', '--no-report', ...selection]);
cargo(['llvm-cov', 'report', ...process.argv.slice(2)]);
