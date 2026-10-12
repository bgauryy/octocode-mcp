import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { NATIVE_ABI_VERSION } from '@octocodeai/octocode-native/runtime';

const [addon] = process.argv.slice(2);
assert.ok(addon, 'usage: node addon-boundary.mjs <addon>');
const { NativeRuntime } = createRequire(import.meta.url)(addon);
const runtime = new NativeRuntime({
  surface: 'mcp',
  cwd: process.cwd(),
});
try {
  assert.equal(runtime.abiVersion, NATIVE_ABI_VERSION);
  assert.equal(runtime.closed, false);
  await assert.rejects(
    runtime.execute('typed-error', 'localFetch', { queries: [{}] }),
    error => {
      const detail = JSON.parse(error.message);
      assert.equal(detail.kind, 'octocode.nativeError');
      assert.equal(detail.code, 'invalidInput');
      // The payload is the error itself: no kind/version/tool frame. The
      // first repair detail is `error`; any others follow in `details`.
      for (const frame of ['kind', 'version', 'tool']) {
        assert.equal(Object.hasOwn(detail.payload, frame), false, frame);
      }
      const repairs = [detail.payload.error, ...(detail.payload.details ?? [])];
      assert.match(repairs.join('\n'), /path: Missing required field/);
      return true;
    },
  );
  assert.equal(runtime.cancel('missing-request'), false);
} finally {
  await runtime.close();
}
assert.equal(runtime.closed, true);
console.log(JSON.stringify({ typedErrors: true, close: true, missingCancel: true }));
