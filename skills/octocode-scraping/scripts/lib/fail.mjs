/**
 * The one error shape for every scraping script: compact JSON on stdout, then exit.
 * Exit 2 = invalid input, 1 = runtime failure or nothing found.
 */
export function fail(code, message, exitCode = 1, extra = {}) {
  console.log(JSON.stringify({ ok: false, ...extra, error: { code, message } }));
  process.exit(exitCode);
}
