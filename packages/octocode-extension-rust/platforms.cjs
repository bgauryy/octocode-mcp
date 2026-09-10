"use strict";

// Canonical catalog used by loaders, builds, manifests and publish checks.
const platforms = Object.freeze([
  ['darwin-arm64', 'aarch64-apple-darwin', 'darwin', 'arm64'],
  ['darwin-x64', 'x86_64-apple-darwin', 'darwin', 'x64'],
  ['linux-x64-gnu', 'x86_64-unknown-linux-gnu', 'linux', 'x64', 'glibc'],
  ['linux-x64-musl', 'x86_64-unknown-linux-musl', 'linux', 'x64', 'musl'],
  ['linux-arm64-gnu', 'aarch64-unknown-linux-gnu', 'linux', 'arm64', 'glibc'],
  ['win32-x64-msvc', 'x86_64-pc-windows-msvc', 'win32', 'x64'],
].map(([id, target, os, arch, libc]) => Object.freeze({
  id, target, os, arch, libc,
  binary: `octocode-extension-rust.${id}.node`,
  packageName: `@octocodeai/octocode-extension-rust-${id}`,
})));

function currentPlatform(runtime = process) {
  let libc;
  if (runtime.platform === 'linux') {
    const report = runtime.report?.getReport();
    if (!report?.header) throw new Error('UNSUPPORTED_PLATFORM: Cannot determine Linux libc from the Node diagnostic report.');
    libc = report.header.glibcVersionRuntime ? 'glibc' : 'musl';
  }
  const platform = platforms.find(value => value.os === runtime.platform && value.arch === runtime.arch && value.libc === libc);
  if (!platform) throw new Error(`UNSUPPORTED_PLATFORM: Octocode extension native operations do not support ${runtime.platform}-${runtime.arch}${libc ? `-${libc}` : ''}. Supported: ${platforms.map(value => value.id).join(', ')}.`);
  return platform;
}

module.exports = { platforms, currentPlatform };
