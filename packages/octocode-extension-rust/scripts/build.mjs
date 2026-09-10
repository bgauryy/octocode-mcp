import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { platforms, currentPlatform } from '../platforms.cjs';
import { stageBinary } from './binary.cjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const release = args.includes('--release');
const all = args.includes('--all');
const targetIndex = args.indexOf('--target');
const requested = targetIndex === -1 ? undefined : args[targetIndex + 1];
const valid = new Set(['--release', '--all', '--target', ...(requested ? [requested] : [])]);
if (args.some(value => !valid.has(value)) || (targetIndex !== -1 && (!requested || requested.startsWith('--'))) || (all && requested)) throw new Error('Usage: build.mjs [--release] [--all | --target <platform-id-or-rust-triple>]');
const selected = all ? platforms : requested ? platforms.filter(value => value.id === requested || value.target === requested) : [currentPlatform()];
if (selected.length === 0) throw new Error(`Unsupported target: ${requested}`);
if (process.env.CARGO_BUILD_TARGET) throw new Error('Use --target instead of CARGO_BUILD_TARGET so artifact staging remains explicit.');

for (const platform of selected) {
  const cross = platform.os !== process.platform || platform.arch !== process.arch || (platform.os === 'linux' && platform.libc !== currentPlatform().libc);
  const command = cross && platform.os === 'linux' ? ['zigbuild'] : cross && platform.os === 'win32' ? ['xwin', 'build'] : ['build'];
  const env = { ...process.env };
  if (platform.libc === 'musl') {
    // Node addons are shared libraries, not statically linked musl executables.
    if (env.CARGO_ENCODED_RUSTFLAGS) env.CARGO_ENCODED_RUSTFLAGS += '\x1f-C\x1ftarget-feature=-crt-static';
    else env.RUSTFLAGS = `${env.RUSTFLAGS ?? ''} -C target-feature=-crt-static`.trim();
  }
  const result = spawnSync('cargo', [...command, '--locked', '--target', platform.target, ...(release ? ['--release'] : [])], { cwd: root, stdio: 'inherit', env });
  if (result.error) throw new Error('Development builds require Rust; cross builds additionally require cargo-zigbuild/Zig (Linux) or cargo-xwin (Windows). Published installs use prebuilt optional packages.', { cause: result.error });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const library = platform.os === 'darwin' ? 'liboctocode_extension_rust.dylib' : platform.os === 'win32' ? 'octocode_extension_rust.dll' : 'liboctocode_extension_rust.so';
  const targetRoot = resolve(root, process.env.CARGO_TARGET_DIR ?? 'target');
  const artifact = join(targetRoot, platform.target, release ? 'release' : 'debug', library);
  // Never truncate a loaded addon inode. Windows hosts must release loaded DLLs before rebuilding.
  stageBinary(artifact, join(root, platform.binary), platform);
  if (release) stageBinary(artifact, join(root, 'npm', platform.id, platform.binary), platform);
  console.log(`Built ${platform.id}${release ? ' and staged its optional package' : ' for local development'}`);
}
