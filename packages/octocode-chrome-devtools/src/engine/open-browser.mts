#!/usr/bin/env node

import { spawn, execSync, execFileSync } from 'child_process';
import { platform } from 'os';
import { existsSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { getOctocodeHome, propagateOctocodeEnv } from './octocode-config.mjs';
import { browserMajorVersion, planRealProfile } from './real-profile.mjs';
import { flagArgs } from './cli-flags.mjs';
import { cdpHttp } from './engine-io.mjs';

const argv = process.argv.slice(2);
const { getArg, hasFlag } = flagArgs(argv);

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`Usage: open-browser.mjs [options]

Launch or reuse a Chrome DevTools Protocol session.

Options:
  --port <n>              CDP port (default: 9222)
  --url <url>             Initial URL
  --headless              Use an isolated headless profile
  --profile <name>        Use the real browser profile (needs approval; quit the browser;
                          Google Chrome 136+ refuses, Chromium/Chrome for Testing work)
  --chromePath <path>     Explicit Chrome executable
  --windowSize <WxH>      Browser window size
  --enableFeatures <csv>  Chrome feature flags
  --userAgent <ua>        User-Agent override
  --proxyServer <url>     Proxy (also --proxyBypassList, --proxyPacUrl)
  --config <path>         Proxy configuration file
  --cleanup               Stop the isolated session tracked for this port (from any cwd)
  --dry-run               Preview cleanup without stopping Chrome
  -h, --help              Show this help and exit`);
  process.exit(0);
}

const PORT = getArg('--port', '9222');
const PROFILE = getArg('--profile', 'Default');
const URL_ARG = getArg('--url', '');
const HEADLESS = hasFlag('--headless');
const REAL_PROFILE = hasFlag('--profile');
const CLEANUP = hasFlag('--cleanup');
const DRY_RUN = hasFlag('--dry-run');
const CHROME_PATH = getArg('--chromePath', '');
const WINDOW_SIZE = getArg('--windowSize', HEADLESS ? '1280x720' : '');
const ENABLE_FEATURES = getArg('--enableFeatures', '');
const USER_AGENT = getArg('--userAgent', '');
const PROXY_SERVER = getArg('--proxyServer', '');
const PROXY_BYPASS_LIST = getArg('--proxyBypassList', '');
const PROXY_PAC_URL = getArg('--proxyPacUrl', '');
const CONFIG_PATH = getArg('--config', '');

function ok(payload) {
  console.log(JSON.stringify(payload));
}
function err(message: string): never {
  console.log(JSON.stringify({ status: 'ERROR', message }));
  process.exit(1);
}

// PORT names the session file and the profile directory that cleanup deletes.
if (!/^\d+$/.test(PORT) || Number(PORT) < 1 || Number(PORT) > 65535)
  err('--port needs a positive integer <= 65535');

propagateOctocodeEnv({ cwd: process.cwd(), trusted: true });

// Every isolated profile and session file lives at
// <workspace>/.octocode/octocode-chrome-devtools/tmp/browser-state/, keyed by port.
const STATE_SUBPATH = [
  '.octocode',
  'octocode-chrome-devtools',
  'tmp',
  'browser-state',
];
const sessionFileIn = stateDir => join(stateDir, `cdp-session-${PORT}.json`);
const profileDirIn = stateDir => join(stateDir, `cdp-chrome-profile-${PORT}`);

const WORKSPACE = process.cwd();
const CHROME_STATE_DIR = join(WORKSPACE, ...STATE_SUBPATH);
const SESSION_FILE = sessionFileIn(CHROME_STATE_DIR);
const HEADLESS_PROFILE_DIR = profileDirIn(CHROME_STATE_DIR);

function readJsonFile(filePath, { strict = false } = {}) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (jsonErr) {
    if (strict)
      err(`Invalid JSON in config file: ${filePath} (${jsonErr.message})`);
    console.error(
      `[BROWSER] Warning: ignoring invalid JSON config ${filePath}: ${jsonErr.message}`
    );
    return null;
  }
}

function normalizeProxyConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const enabled = raw.enabled;
  const server = typeof raw.server === 'string' ? raw.server.trim() : '';
  const bypassList =
    typeof raw.bypassList === 'string' ? raw.bypassList.trim() : '';
  const pacUrl = typeof raw.pacUrl === 'string' ? raw.pacUrl.trim() : '';
  return {
    enabled: enabled === undefined ? true : Boolean(enabled),
    server,
    bypassList,
    pacUrl,
  };
}

function loadProxyConfig() {
  const cwdConfig = join(process.cwd(), '.octocode', 'chrome-devtools.json');
  const homeConfig = join(getOctocodeHome(), 'config.json');
  if (CONFIG_PATH && !existsSync(CONFIG_PATH))
    err(`Config file not found: ${CONFIG_PATH}`);
  const candidateFiles = CONFIG_PATH ? [CONFIG_PATH] : [cwdConfig, homeConfig];

  for (const configFile of candidateFiles) {
    const json = readJsonFile(configFile, { strict: Boolean(CONFIG_PATH) });
    if (!json || typeof json !== 'object') continue;

    const candidates = [
      json?.proxy,
      json?.chromeDevtools?.proxy,
      json?.skills?.['octocode-chrome-devtools']?.proxy,
    ];
    for (const candidate of candidates) {
      const normalized = normalizeProxyConfig(candidate);
      if (normalized) return normalized;
    }
  }
  return null;
}

function findChrome() {
  if (platform() === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    return candidates.find(p => existsSync(p)) ?? null;
  }
  if (platform() === 'linux') {
    for (const bin of [
      'google-chrome',
      'google-chrome-stable',
      'chromium-browser',
      'chromium',
    ]) {
      try {
        execSync(`which ${bin}`, { stdio: 'ignore' });
        return bin;
      } catch {}
    }
  }
  if (platform() === 'win32') {
    const candidates = [
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Chromium\\Application\\chrome.exe`,
    ];
    return candidates.find(p => p && existsSync(p)) ?? null;
  }
  return null;
}

async function checkRunning() {
  try {
    return await cdpHttp(PORT, '/json/version', { timeoutMs: 2000 });
  } catch {
    return null;
  }
}

function readSession(sessionFile = SESSION_FILE) {
  try {
    return JSON.parse(readFileSync(sessionFile, 'utf8'));
  } catch {
    return null;
  }
}

// The OS pid of the browser process serving this CDP endpoint.
async function browserPid(wsUrl, timeoutMs = 3000): Promise<number | null> {
  if (typeof wsUrl !== 'string' || !wsUrl) return null;
  return new Promise<number | null>(resolvePid => {
    let socket;
    const done = pid => {
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {}
      resolvePid(pid);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    try {
      socket = new WebSocket(wsUrl);
    } catch {
      return done(null);
    }
    socket.onopen = () =>
      socket.send(
        JSON.stringify({ id: 1, method: 'SystemInfo.getProcessInfo' })
      );
    socket.onerror = () => done(null);
    socket.onclose = () => done(null);
    socket.onmessage = event => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.id !== 1) return;
        const browser = message.result?.processInfo?.find(
          info => info.type === 'browser'
        );
        done(Number.isSafeInteger(browser?.id) ? browser.id : null);
      } catch {
        done(null);
      }
    };
  });
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The isolated profile this package created for PORT, read from a Chrome
// command line: <workspace>/.octocode/octocode-chrome-devtools/tmp/browser-state/cdp-chrome-profile-<PORT>.
function packageProfileFromCommand(command) {
  const sep = '[\\\\/]';
  const suffix = [...STATE_SUBPATH, `cdp-chrome-profile-${PORT}`]
    .map(escapeRegExp)
    .join(sep);
  const match = command.match(
    new RegExp(`--user-data-dir=(.+?)${sep}${suffix}(?=["\\s]|$)`)
  );
  // A lazy match must not span into another flag's value.
  if (!match || /\s--/.test(match[1])) return null;
  const workspace = match[1].replace(/^"/, '');
  const stateDir = join(workspace, ...STATE_SUBPATH);
  return { workspace, stateDir, profileDir: profileDirIn(stateDir) };
}

// Finds the workspace that launched the Chrome listening on PORT, when it is an
// isolated profile this package created. Returns its session for the normal
// verified cleanup; never trusts the listener alone.
async function discoverListenerSession(info): Promise<{
  reason?: string;
  listenerPid?: number;
  workspace?: string;
  sessionFile?: string;
  session?: any;
}> {
  const running = info ?? (await checkRunning());
  if (!running) return { reason: 'NO_LISTENER' };
  const pid = await browserPid(running.webSocketDebuggerUrl);
  if (!pid) return { reason: 'LISTENER_PID_UNKNOWN' };
  const owner = packageProfileFromCommand(getProcessCommand(pid));
  if (!owner) return { listenerPid: pid, reason: 'NOT_PACKAGE_PROFILE' };
  const sessionFile = sessionFileIn(owner.stateDir);
  const session = readSession(sessionFile);
  if (
    !session ||
    String(session.port) !== String(PORT) ||
    resolve(String(session.profileDir ?? '')) !== resolve(owner.profileDir)
  )
    return {
      listenerPid: pid,
      workspace: owner.workspace,
      reason: 'NO_SESSION_FILE',
    };
  return { listenerPid: pid, workspace: owner.workspace, sessionFile, session };
}

function writeSession(pid) {
  writeFileSync(
    SESSION_FILE,
    JSON.stringify({
      pid,
      port: PORT,
      profileDir: HEADLESS_PROFILE_DIR,
      headless: HEADLESS,
      isolated: usingIsolatedProfile,
      startedAt: Date.now(),
      chromePath,
    }),
    { mode: 0o600 }
  );
}

function getProcessCommand(pid) {
  const pidText = String(pid);
  if (!/^\d+$/.test(pidText)) return '';
  try {
    if (platform() === 'darwin' || platform() === 'linux') {
      return execFileSync('ps', ['-p', pidText, '-o', 'command='], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    }
    if (platform() === 'win32') {
      return execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pidText}").CommandLine`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
    }
  } catch {}
  return '';
}

function processMatchesTrackedSession(session) {
  // Cleanup only kills Chrome instances launched with this exact CDP port and
  // isolated profile path; never trust a stale pid file alone.
  const command = getProcessCommand(session.pid);
  if (!command) return false;

  const isChrome =
    /Chrome|Chromium|Brave Browser|chrome|chromium|chrome\.exe/i.test(command);
  const hasPort = command.includes(`--remote-debugging-port=${session.port}`);
  const hasProfile = session.profileDir && command.includes(session.profileDir);

  return isChrome && hasPort && hasProfile;
}

async function waitForExit(pid, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0);
      await new Promise(r => setTimeout(r, 100));
    } catch {
      return true;
    }
  }
  return false;
}

async function removeDirWithRetry(dir) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      if (!existsSync(dir)) return true;
    } catch (e) {
      if (attempt === 4) throw e;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return !existsSync(dir);
}

async function cleanupSession() {
  let session = readSession();
  let sessionFile = SESSION_FILE;
  let owner: Record<string, unknown> = { workspace: WORKSPACE, sessionFile };
  if (!session) {
    const found = await discoverListenerSession(null);
    if (!found.session) {
      console.error(
        `[BROWSER] No tracked session found for port ${PORT} (${found.reason})`
      );
      ok({
        status: 'NO_TRACKED_SESSION',
        port: PORT,
        reason: found.reason,
        listenerPid: found.listenerPid,
        workspace: found.workspace,
      });
      return;
    }
    session = found.session;
    sessionFile = found.sessionFile;
    owner = {
      workspace: found.workspace,
      sessionFile,
      discoveredFromListener: true,
    };
    console.error(
      `[BROWSER] Port ${PORT} belongs to the session of workspace ${found.workspace}`
    );
  }
  if (String(session.port) !== String(PORT)) {
    err(
      `Tracked session port mismatch: expected ${PORT}, found ${session.port}`
    );
  }
  if (!processMatchesTrackedSession(session)) {
    console.error(
      `[BROWSER] Refusing to kill pid=${session.pid}; it does not match the tracked CDP port/profile`
    );
    if (DRY_RUN) {
      ok({
        status: 'CLEANUP_DRY_RUN',
        port: PORT,
        pid: session.pid,
        matchesTrackedSession: false,
        wouldKill: false,
        ...owner,
      });
      return;
    }
    try {
      rmSync(sessionFile, { force: true });
    } catch {}
    ok({ status: 'STALE_SESSION_REMOVED', port: PORT, ...owner });
    return;
  }

  if (DRY_RUN) {
    ok({
      status: 'CLEANUP_DRY_RUN',
      port: PORT,
      pid: session.pid,
      matchesTrackedSession: true,
      wouldKill: true,
      profileDir: session.profileDir,
      ...owner,
    });
    return;
  }

  try {
    process.kill(session.pid, 'SIGTERM');
    console.error(`[BROWSER] Sent SIGTERM to Chrome pid=${session.pid}`);
  } catch {
    console.error(`[BROWSER] Process pid=${session.pid} already gone`);
  }
  const exited = await waitForExit(session.pid);
  if (!exited) {
    try {
      process.kill(session.pid, 'SIGKILL');
      console.error(`[BROWSER] Sent SIGKILL to Chrome pid=${session.pid}`);
    } catch {}
    await waitForExit(session.pid, 1000);
  }

  if (session.profileDir && existsSync(session.profileDir)) {
    try {
      await removeDirWithRetry(session.profileDir);
      console.error(`[BROWSER] Removed profile: ${session.profileDir}`);
    } catch (e) {
      console.error(`[BROWSER] Could not remove profile: ${e.message}`);
    }
  }

  try {
    rmSync(sessionFile, { force: true });
  } catch {}
  console.error('[BROWSER] Session cleaned up');
  ok({ status: 'CLEANED_UP', port: PORT, pid: session.pid, ...owner });
}

if (CLEANUP) {
  await cleanupSession();
  process.exit(0);
}

if (REAL_PROFILE && HEADLESS)
  err(
    '--profile drives the real profile in a visible window; drop --headless, or drop --profile for an isolated headless session.'
  );

const proxyConfig = loadProxyConfig();
const effectiveProxyServer =
  PROXY_SERVER || (proxyConfig?.enabled ? proxyConfig.server : '');
const effectiveProxyBypassList =
  PROXY_BYPASS_LIST || (proxyConfig?.enabled ? proxyConfig.bypassList : '');
const effectiveProxyPacUrl =
  PROXY_PAC_URL || (proxyConfig?.enabled ? proxyConfig.pacUrl : '');
const proxyRequested = Boolean(effectiveProxyServer || effectiveProxyPacUrl);

const existing = await checkRunning();
if (existing) {
  // Report which workspace's isolated session owns the reused browser, if any.
  const owner = await discoverListenerSession(existing);
  const notApplied = [
    proxyRequested && 'proxy settings',
    ENABLE_FEATURES && '--enableFeatures',
    REAL_PROFILE && '--profile',
    USER_AGENT && '--userAgent',
    hasFlag('--windowSize') && '--windowSize',
  ].filter(Boolean);
  ok({
    status: 'BROWSER_READY',
    wsUrl: existing.webSocketDebuggerUrl,
    port: PORT,
    reused: true,
    browser: existing.Browser,
    ...(owner.session
      ? {
          isolated: true,
          sessionFile: owner.sessionFile,
          workspace: owner.workspace,
        }
      : {}),
    proxyConfigured: false,
    proxyRequested,
    enableFeaturesRequested: ENABLE_FEATURES || undefined,
    warning: notApplied.length
      ? `Existing Chrome was reused; ${notApplied.join(', ')} apply only when launching a fresh browser and were not applied. Run cleanup or use another port for a fresh session.`
      : undefined,
  });
  process.exit(0);
}

const chromePath = CHROME_PATH || findChrome();
if (!chromePath)
  err(
    'Chrome not found. Install Google Chrome from https://www.google.com/chrome/ or pass --chromePath <path>'
  );
if (CHROME_PATH && !existsSync(CHROME_PATH))
  err(`Chrome not found at --chromePath: ${CHROME_PATH}`);

let userDataDir;
let usingIsolatedProfile = false;

mkdirSync(CHROME_STATE_DIR, { recursive: true, mode: 0o700 });

if (REAL_PROFILE) {
  const plan = planRealProfile({
    chromePath,
    profile: PROFILE,
    os: platform(),
    env: process.env,
    major: () => browserMajorVersion(chromePath, platform()),
  });
  if ('error' in plan) err(plan.error);
  userDataDir = plan.userDataDir;
  console.error(
    '[BROWSER] WARNING: Using real user Chrome profile. CDP scripts will have access'
  );
  console.error(
    '[BROWSER] WARNING: to all cookies, auth tokens, and sessions in this profile.'
  );
  console.error(
    '[BROWSER] WARNING: Use --headless for isolated inspection without profile access.'
  );
} else {
  usingIsolatedProfile = true;
  mkdirSync(HEADLESS_PROFILE_DIR, { recursive: true });
  userDataDir = HEADLESS_PROFILE_DIR;
  if (!HEADLESS)
    console.error(
      '[BROWSER] Visible isolated profile (pass --profile <name> for the real profile, after approval)'
    );
}

const chromeArgs = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-mode',
];

if (!usingIsolatedProfile)
  chromeArgs.push(`--profile-directory=${PROFILE}`, '--restore-last-session');
if (HEADLESS) chromeArgs.push('--headless=new', '--disable-dev-shm-usage');
if (HEADLESS && platform() === 'linux') chromeArgs.push('--disable-gpu');
if (HEADLESS && platform() === 'linux')
  chromeArgs.push('--no-sandbox', '--disable-setuid-sandbox');
if (USER_AGENT) chromeArgs.push(`--user-agent=${USER_AGENT}`);
if (WINDOW_SIZE) {
  chromeArgs.push(`--window-size=${WINDOW_SIZE.replace('x', ',')}`);
}
if (ENABLE_FEATURES) chromeArgs.push(`--enable-features=${ENABLE_FEATURES}`);
if (effectiveProxyServer)
  chromeArgs.push(`--proxy-server=${effectiveProxyServer}`);
if (effectiveProxyBypassList)
  chromeArgs.push(`--proxy-bypass-list=${effectiveProxyBypassList}`);
if (effectiveProxyPacUrl && !effectiveProxyServer)
  chromeArgs.push(`--proxy-pac-url=${effectiveProxyPacUrl}`);
if (URL_ARG) chromeArgs.push(URL_ARG);

const profileLabel = HEADLESS
  ? 'headless'
  : usingIsolatedProfile
    ? 'isolated-cdp'
    : PROFILE;
console.error(
  `[BROWSER] Launching Chrome: headless=${HEADLESS} port=${PORT} profile=${profileLabel}`
);

const child = spawn(chromePath, chromeArgs, {
  detached: true,
  stdio: 'ignore',
});
child.unref();

if (usingIsolatedProfile) writeSession(child.pid);

let attempts = 0;
while (attempts < 40) {
  await new Promise(r => setTimeout(r, 500));
  const info = await checkRunning();
  if (info) {
    ok({
      status: 'BROWSER_READY',
      wsUrl: info.webSocketDebuggerUrl,
      port: PORT,
      reused: false,
      browser: info.Browser,
      isolated: usingIsolatedProfile,
      sessionFile: usingIsolatedProfile ? SESSION_FILE : null,
      proxyConfigured: proxyRequested,
      enableFeaturesConfigured: ENABLE_FEATURES || undefined,
      windowSize: WINDOW_SIZE || undefined,
    });
    process.exit(0);
  }
  attempts++;
}

if (usingIsolatedProfile && existsSync(HEADLESS_PROFILE_DIR)) {
  // The isolated child is ours: stop it before deleting the profile it holds.
  try {
    process.kill(child.pid, 'SIGKILL');
  } catch {}
  await waitForExit(child.pid, 2000);
  rmSync(HEADLESS_PROFILE_DIR, { recursive: true, force: true });
  rmSync(SESSION_FILE, { force: true });
}
if (!usingIsolatedProfile) {
  // The real-profile browser we started never exposed CDP; close it gracefully so the
  // profile is not left held by a window the caller cannot drive.
  try {
    process.kill(child.pid, 'SIGTERM');
  } catch {}
  err(
    `Chrome did not expose CDP on port ${PORT} within 20s for the real profile and was asked to quit. This browser build may ignore --remote-debugging-port on its default data directory; use an isolated session with cookies --from-port or --from-storage-state.`
  );
}
err(
  `Chrome did not respond on port ${PORT} after 20s. Try launching manually with --remote-debugging-port=${PORT}`
);
