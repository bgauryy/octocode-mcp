import fs from 'node:fs';
import path from 'node:path';
import { launch, type LaunchedChrome } from 'chrome-launcher';
import { HOME_NAMES, outputDir, sweepDeadOutputs } from '../shared/home.js';
import { processAlive } from '../shared/process.js';
import { startFilteringProxy, type FilteringProxy, type FilteringProxyOptions } from './proxy.js';

/** Starting Chrome for a session, and finding the Chrome already running on a persistent profile. */

/** The persistent profile visible mode uses: `<Octocode home>/pi-browser-profile`. */
export const persistentProfileDir = (env: NodeJS.ProcessEnv): string => outputDir(HOME_NAMES.browserProfile, env);

/** A Chrome this session launched; `proxy` is the filtering proxy it runs behind, stopped when Chrome is killed. */
export type OwnChrome = LaunchedChrome & { proxy?: FilteringProxy };

/** Chrome's flags to send every request through `proxy`, loopback included (`<-loopback>` removes Chrome's built-in loopback bypass). */
export const proxyFlags = (proxy: FilteringProxy): string[] => [
  `--proxy-server=${proxy.url}`,
  '--proxy-bypass-list=<-loopback>',
  // WebRTC's UDP does not go through an HTTP proxy: this stops it from reaching local addresses directly.
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
];

/**
 * A launched Chrome: `profile` (kept, visible mode) or a fresh profile folder under `<Octocode home>/pi-browser/` (not
 * the temp dir) that is removed when it closes. A fresh Chrome runs behind a filtering proxy that stops with it. One on
 * a kept profile does not: it outlives the session and is reused by the next one, so its coverage is the CDP guard's only.
 */
export async function launchChrome(headless: boolean, profile?: string, proxyOptions?: FilteringProxyOptions): Promise<OwnChrome> {
  // Headless Chrome defaults to an 800x600 window, where many sites collapse into a mobile layout (no search box).
  const flags = [...(headless ? ['--headless=new', '--window-size=1366,900'] : []), '--no-first-run', '--no-default-browser-check'];
  if (profile) return launch({ startingUrl: 'about:blank', userDataDir: profile, chromeFlags: flags });
  const root = outputDir(HOME_NAMES.browser);
  sweepDeadOutputs(root, 0);
  const proxy = await startFilteringProxy(proxyOptions);
  const userDataDir = fs.mkdtempSync(path.join(root, `${process.pid}-`));
  let chrome: OwnChrome;
  try {
    chrome = await launch({ startingUrl: 'about:blank', userDataDir, chromeFlags: [...flags, ...proxyFlags(proxy)] });
  } catch (error) {
    await proxy.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    throw error;
  }
  chrome.proxy = proxy;
  const kill = chrome.kill.bind(chrome);
  chrome.kill = async () => {
    try {
      await kill();
    } finally {
      await proxy.close();
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5 });
    }
  };
  return chrome;
}

/**
 * The DevTools port of a Chrome already running on `profile`, from the DevToolsActivePort file there: the port, then
 * the browser's DevTools path (`/devtools/browser/<id>`, new for every Chrome run). A file whose port now answers with
 * another path is stale (that Chrome quit and something else took the port): it is removed, and nothing is reused.
 */
export async function profilePort(profile: string): Promise<number | undefined> {
  const file = path.join(profile, 'DevToolsActivePort');
  let lines: string[];
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n');
  } catch {
    return undefined;
  }
  const port = Number(lines[0]);
  if (Number.isInteger(port) && port > 0 && lines[1] && (await browserPath(port, 1_000).catch(() => undefined)) === lines[1].trim()) return port;
  fs.rmSync(file, { force: true });
  return undefined;
}

/** Records `port` in the profile's DevToolsActivePort the way Chrome does (it writes the file only for port 0). */
export async function recordProfilePort(profile: string, port: number): Promise<void> {
  fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), `${port}\n${await browserPath(port, 5_000)}\n`);
}

/** The browser-level DevTools WebSocket URL of the browser on `port`, from `/json/version`: the one socket a session drives every page through. */
export async function browserWebSocketUrl(port: number, timeoutMs: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
  const { webSocketDebuggerUrl } = (await response.json()) as { webSocketDebuggerUrl?: unknown };
  if (typeof webSocketDebuggerUrl !== 'string') throw new Error(`Chrome on port ${port} reports no browser DevTools URL`);
  return webSocketDebuggerUrl;
}

/** The DevTools path of the browser on `port` (`/devtools/browser/<id>`). */
const browserPath = async (port: number, timeoutMs: number): Promise<string> => new URL(await browserWebSocketUrl(port, timeoutMs)).pathname;

/** Chrome's SingletonLock (a `<host>-<pid>` symlink) names a live process: another Chrome owns the profile. */
export function profileLocked(profile: string): boolean {
  try {
    const pid = Number(fs.readlinkSync(path.join(profile, 'SingletonLock')).split('-').pop());
    return Number.isInteger(pid) && pid > 0 && processAlive(pid);
  } catch {
    return false;
  }
}
