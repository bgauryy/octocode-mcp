/**
 * create-image-tool — image rendering primitives used by the `createMedia`
 * tool: turn agent-authored markup into a real image for inline TUI display
 * (Kitty graphics / iTerm2 inline images; a themed placeholder on terminals
 * without image support).
 *
 * Two authoring modes — the model can create ANY image, not just vector art:
 *   • svg  — rasterized with @resvg/resvg-js (Rust, zero runtime deps, prebuilt
 *            per-platform binaries). Fast, no browser. System fonts ARE loaded
 *            so text renders correctly.
 *   • html — rendered by headless Chrome (reusing the bundled CDP engine) and
 *            screenshotted to PNG. Full CSS/flex/grid/gradients/webfonts/emoji —
 *            whatever a browser can paint. Requires Chrome to be installed.
 *
 * The rendered PNG is carried in result.details (NOT result.content) so it shows
 * in the transcript without bloating model context. Pass showToModel:true to
 * also return it as an image block for a vision model to inspect. Optionally
 * saveTo persists the PNG to disk (path-guarded).
 */

import fs from 'node:fs';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';

import type { PiContext } from '../types.js';
import { createSessionArtifactContext } from './session-artifacts.js';
import { assertPathAllowed } from './path-guard.js';
import { resolveFilePath } from './file-state.js';
import { formatBytes } from './image-render.js';
import { connectToChrome, cleanupConnection, findChromePath } from '../chrome-debug.js';
import { extensionTmpRoot } from '../extension-paths.js';

/** Refuse to render output larger than this — matches image-render's inline cap. */
const MAX_PNG_BYTES = 4 * 1024 * 1024; // 4MB
/** Guard against pathological render sizes. */
const MAX_RENDER_WIDTH = 4096;
const MAX_RENDER_HEIGHT = 8192;
/**
 * Dedicated headless port range so HTML rendering never clashes with a user's
 * chromeDebug session on 9222. Each render picks a DISTINCT port (base + a
 * rotating offset with wraparound) so two parallel createImage({html}) calls do
 * not share one headless Chrome — otherwise the first to finish SIGTERMs the
 * shared instance and kills the other mid-render. A distinct port means each
 * call launches, owns, and tears down its own instance (connectToChrome uses a
 * port-specific profile, and cleanupConnection kills only the pid it launched).
 */
const HTML_RENDER_PORT_BASE = 9445;
const HTML_RENDER_PORT_RANGE = 100; // ports 9445–9544
let htmlRenderPortCounter = 0;
let fallbackFileCounter = 0;
const implicitArtifactFiles = new Set<string>();
const implicitArtifactDirs = new Set<string>();
const fallbackRoot = (): string => path.join(extensionTmpRoot(), 'images');

/** Next distinct headless render port, rotating within the safe range. */
function nextHtmlRenderPort(): number {
  const offset = htmlRenderPortCounter % HTML_RENDER_PORT_RANGE;
  htmlRenderPortCounter = (htmlRenderPortCounter + 1) % HTML_RENDER_PORT_RANGE;
  return HTML_RENDER_PORT_BASE + offset;
}

export interface CreateImageResult {
  ok: boolean;
  message: string;
  base64?: string;
  bytes?: number;
  name?: string;
  savedPath?: string;
}

function clampInt(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(min, Math.floor(value)), max);
}

/** True for an explicitly transparent background value. */
function isTransparentBg(bg?: string): boolean {
  if (!bg) return true;
  const b = bg.trim().toLowerCase();
  return b === 'transparent' || b === 'none' || /rgba?\([^)]*,\s*0(\.0+)?\s*\)$/.test(b);
}

/**
 * Turn rendered PNG bytes into a CreateImageResult: enforce the size cap and,
 * when requested, persist to a path-guarded location. Never throws.
 */
function finalizePng(png: Buffer, cwd: string, opts: { name?: string; saveTo?: string }): CreateImageResult {
  if (png.length === 0) return { ok: false, message: 'createImage: rendered an empty image.' };
  if (png.length > MAX_PNG_BYTES) {
    return { ok: false, message: `createImage: rendered PNG is ${formatBytes(png.length)}, over the 4MB inline limit. Reduce width or complexity.` };
  }

  const name = opts.name && opts.name.trim().length > 0 ? opts.name.trim() : 'image.png';
  let savedPath: string | undefined;
  if (opts.saveTo && opts.saveTo.trim().length > 0) {
    try {
      const abs = resolveFilePath(opts.saveTo, cwd);
      assertPathAllowed(abs, cwd, 'createImage');
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, png);
      savedPath = abs;
    } catch (err) {
      return { ok: false, message: `createImage: could not save to "${opts.saveTo}" — ${(err as Error).message}` };
    }
  }

  const savedNote = savedPath ? ` → saved ${path.basename(savedPath)}` : '';
  return {
    ok: true,
    message: `Created image ${name} [image/png, ${formatBytes(png.length)}]${savedNote}`,
    base64: png.toString('base64'),
    bytes: png.length,
    name,
    savedPath,
  };
}

/**
 * Core: rasterize an SVG string to a PNG. Pure of Pi types so it is
 * unit-testable. Loads system fonts so text renders correctly. Returns ok:false
 * with a reason for invalid SVG, oversized output, or a save failure.
 */
export function createImageFromSvg(
  svg: string,
  cwd: string,
  opts: { width?: number; background?: string; name?: string; saveTo?: string } = {},
): CreateImageResult {
  if (typeof svg !== 'string' || !svg.includes('<svg')) {
    return { ok: false, message: 'createImage: `svg` must be an SVG document containing an <svg> element.' };
  }

  let png: Buffer;
  try {
    const width = clampInt(opts.width, 1, MAX_RENDER_WIDTH);
    const resvg = new Resvg(svg, {
      fitTo: width ? { mode: 'width', value: width } : { mode: 'original' },
      background: opts.background,
      // Load system fonts so <text> renders — without this, text is invisible.
      font: { loadSystemFonts: true },
      shapeRendering: 2, // geometricPrecision
      textRendering: 1, // optimizeLegibility
    });
    png = Buffer.from(resvg.render().asPng());
  } catch (err) {
    return { ok: false, message: `createImage: failed to render SVG — ${(err as Error).message}` };
  }

  return finalizePng(png, cwd, opts);
}

/** Wrap fragment HTML in a full document with sane resets + optional background. */
function wrapHtml(html: string, background?: string): string {
  const looksFull = /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html) || /<!doctype/i.test(html);
  if (looksFull) return html;
  const bg = background && !isTransparentBg(background) ? `background:${background};` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `*{box-sizing:border-box}html,body{margin:0;padding:0;${bg}}` +
    `body{width:fit-content;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}` +
    `</style></head><body>${html}</body></html>`;
}

/**
 * Render an HTML document to a PNG using headless Chrome via the bundled CDP
 * engine. Launches a dedicated headless instance, sizes the viewport to the
 * content (or the requested width/height), captures at 2× for crispness, and
 * always tears the browser down. Throws with a clear message if Chrome is
 * missing or rendering fails.
 */
export async function renderHtmlToPng(
  html: string,
  cwd: string,
  opts: { width?: number; height?: number; background?: string; signal?: AbortSignal } = {},
): Promise<Buffer> {
  findChromePath(); // throws a clear error if Chrome is not installed

  // Distinct port per render so concurrent HTML renders each own/launch/kill
  // their own headless Chrome instead of sharing (and killing) one another's.
  const renderPort = nextHtmlRenderPort();
  const conn = await connectToChrome({
    port: renderPort,
    launch: true,
    headless: true,
    newTab: 'about:blank',
    workspaceCwd: cwd,
    signal: opts.signal,
  });
  const { session } = conn;
  try {
    await session.send('Page.enable', {});

    const reqWidth = clampInt(opts.width, 1, MAX_RENDER_WIDTH);
    const reqHeight = clampInt(opts.height, 1, MAX_RENDER_HEIGHT);

    // Initial viewport so content reflows to the requested width before measuring.
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: reqWidth ?? 800,
      height: reqHeight ?? 600,
      deviceScaleFactor: 2,
      mobile: false,
    });
    if (isTransparentBg(opts.background)) {
      await session.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }).catch(() => undefined);
    }

    const frameTree = await session.send('Page.getFrameTree', {});
    const frameId = ((frameTree['frameTree'] as Record<string, unknown> | undefined)?.['frame'] as Record<string, unknown> | undefined)?.['id'] as string | undefined;
    if (!frameId) throw new Error('could not resolve the page frame');
    await session.send('Page.setDocumentContent', { frameId, html: wrapHtml(html, opts.background) });

    // Let layout settle and webfonts load.
    await new Promise((r) => setTimeout(r, 200));
    await session.send('Runtime.evaluate', {
      expression: 'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',
      awaitPromise: true,
      timeout: 3000,
    }).catch(() => undefined);

    // Measure content and re-size the viewport to fit it (unless width/height fixed).
    const metrics = await session.send('Page.getLayoutMetrics', {});
    const content = (metrics['cssContentSize'] ?? metrics['contentSize']) as { width?: number; height?: number } | undefined;
    const finalWidth = clampInt(reqWidth ?? Math.ceil(content?.width ?? 800), 1, MAX_RENDER_WIDTH)!;
    const finalHeight = clampInt(reqHeight ?? Math.ceil(content?.height ?? 600), 1, MAX_RENDER_HEIGHT)!;
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: finalWidth,
      height: finalHeight,
      deviceScaleFactor: 2,
      mobile: false,
    });

    const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const data = shot['data'] as string | undefined;
    if (!data) throw new Error('screenshot returned no data');
    return Buffer.from(data, 'base64');
  } finally {
    // Always close the tab and kill the headless instance we launched.
    await cleanupConnection(session, false, true).catch(() => undefined);
  }
}

/**
 * Render an HTML document to a PDF using headless Chrome via the bundled CDP
 * engine (Page.printToPDF). Mirrors renderHtmlToPng — launches a dedicated
 * headless instance, injects the document, waits for fonts, and always tears the
 * browser down. Throws with a clear message if Chrome is missing or fails.
 */
export async function renderHtmlToPdf(
  html: string,
  cwd: string,
  opts: { landscape?: boolean; background?: boolean; scale?: number; signal?: AbortSignal } = {},
): Promise<Buffer> {
  findChromePath(); // throws a clear error if Chrome is not installed

  const renderPort = nextHtmlRenderPort();
  const conn = await connectToChrome({
    port: renderPort,
    launch: true,
    headless: true,
    newTab: 'about:blank',
    workspaceCwd: cwd,
    signal: opts.signal,
  });
  const { session } = conn;
  try {
    await session.send('Page.enable', {});
    const frameTree = await session.send('Page.getFrameTree', {});
    const frameId = ((frameTree['frameTree'] as Record<string, unknown> | undefined)?.['frame'] as Record<string, unknown> | undefined)?.['id'] as string | undefined;
    if (!frameId) throw new Error('could not resolve the page frame');
    await session.send('Page.setDocumentContent', { frameId, html: wrapHtml(html) });

    await new Promise((r) => setTimeout(r, 200));
    await session.send('Runtime.evaluate', {
      expression: 'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',
      awaitPromise: true,
      timeout: 3000,
    }).catch(() => undefined);

    const pdf = await session.send('Page.printToPDF', {
      printBackground: opts.background !== false,
      landscape: opts.landscape === true,
      scale: opts.scale && opts.scale > 0 ? opts.scale : 1,
      preferCSSPageSize: true,
    });
    const data = pdf['data'] as string | undefined;
    if (!data) throw new Error('printToPDF returned no data');
    return Buffer.from(data, 'base64');
  } finally {
    await cleanupConnection(session, false, true).catch(() => undefined);
  }
}

/** Async core for HTML mode: render + finalize. Never throws. */
export async function createImageFromHtml(
  html: string,
  cwd: string,
  opts: { width?: number; height?: number; background?: string; name?: string; saveTo?: string; signal?: AbortSignal } = {},
  deps: { renderHtml?: typeof renderHtmlToPng } = {},
): Promise<CreateImageResult> {
  if (typeof html !== 'string' || html.trim().length === 0) {
    return { ok: false, message: 'createImage: `html` must be non-empty HTML markup.' };
  }
  let png: Buffer;
  try {
    png = await (deps.renderHtml ?? renderHtmlToPng)(html, cwd, opts);
  } catch (err) {
    return { ok: false, message: `createImage: failed to render HTML — ${(err as Error).message}` };
  }
  return finalizePng(png, cwd, opts);
}

/**
 * Persist a rendered PNG so it can be opened when the terminal can't display
 * it inline.
 *
 * Primary: `$OCTOCODE_HOME/extension/sessions/<session-key>/images/<name>.png`
 * (registered as an `image` producer in the session artifact manifest).
 * Fallback: `$OCTOCODE_HOME/extension/tmp/images/<session-id>/` when session context
 * is unavailable or the artifact dir cannot be created.
 *
 * Never throws — this is best-effort.
 */
export function persistRenderedPng(base64: string, ctx?: PiContext, name?: string): string | undefined {
  const safeBase = (name ?? 'image.png').replace(/[^\w.-]+/g, '_').replace(/\.png$/i, '') || 'image';
  fallbackFileCounter = (fallbackFileCounter + 1) % Number.MAX_SAFE_INTEGER;
  const suffix = `${Date.now()}-${fallbackFileCounter}`;

  // Primary: session artifact dir.
  if (ctx?.sessionManager) {
    try {
      const artifactCtx = createSessionArtifactContext({ cwd: ctx.cwd, sessionManager: ctx.sessionManager });
      const relPath = `images/${safeBase}-${suffix}.png`;
      const file = artifactCtx.resolve(relPath);
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, Buffer.from(base64, 'base64'), { mode: 0o600 });
      artifactCtx.registerProducer('image', relPath);
      implicitArtifactFiles.add(file);
      implicitArtifactDirs.add(path.dirname(file));
      return file;
    } catch { /* fall through to OS-temp fallback */ }
  }

  // Fallback: OS temp.
  try {
    const sessionId = ctx?.sessionManager?.getSessionId?.() ?? `pid-${process.pid}`;
    const safeSession = sessionId.replace(/[^\w.-]+/g, '_').slice(0, 96) || `pid-${process.pid}`;
    const dir = path.join(fallbackRoot(), safeSession);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);
    const file = path.join(dir, `${safeBase}-${suffix}.png`);
    fs.writeFileSync(file, Buffer.from(base64, 'base64'), { mode: 0o600 });
    implicitArtifactFiles.add(file);
    implicitArtifactDirs.add(dir);
    return file;
  } catch {
    return undefined;
  }
}

/** Remove only harness-created fallback images; explicit saveTo output is never tracked. */
export function cleanupImplicitImageArtifacts(): number {
  let removed = 0;
  for (const file of implicitArtifactFiles) {
    try {
      fs.rmSync(file, { force: true });
      removed += 1;
    } catch {
      // Best-effort session cleanup.
    }
  }
  implicitArtifactFiles.clear();
  for (const dir of implicitArtifactDirs) {
    try { fs.rmdirSync(dir); } catch { /* non-empty or already removed */ }
  }
  implicitArtifactDirs.clear();
  try { fs.rmdirSync(fallbackRoot()); } catch { /* another session may still own it */ }
  return removed;
}
