import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cleanupImplicitImageArtifacts,
  createImageFromSvg,
  createImageFromHtml,
  persistRenderedPng,
} from '../src/tools/create-image-tool.js';
import { setCapabilityCheckForTests, setImageVisibilityCheckForTests } from '../src/tools/image-render.js';

let dir: string;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#0d1117"/><circle cx="20" cy="10" r="6" fill="#58a6ff"/></svg>';

beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'create-image-')); });
afterEach(async () => {
  cleanupImplicitImageArtifacts();
  setCapabilityCheckForTests(undefined);
  setImageVisibilityCheckForTests(undefined);
  await rm(dir, { recursive: true, force: true });
});

// ── createImageFromSvg ─────────────────────────────────────────────────────────
describe('createImageFromSvg', () => {
  it('rasterizes valid SVG to a PNG base64 (png magic header)', () => {
    const res = createImageFromSvg(SVG, dir, { name: 'dot.png' });
    expect(res.ok).toBe(true);
    expect(res.bytes).toBeGreaterThan(0);
    expect(Buffer.from(res.base64!, 'base64').subarray(0, 4).toString('latin1')).toBe('\x89PNG');
  });

  it('honors an explicit render width', () => {
    const small = createImageFromSvg(SVG, dir, { width: 40 });
    const big = createImageFromSvg(SVG, dir, { width: 400 });
    expect(big.bytes!).toBeGreaterThan(small.bytes!);
  });

  it('rejects input without an <svg> element', () => {
    const res = createImageFromSvg('not svg at all', dir);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/<svg>/);
  });

  it('reports a render failure for malformed SVG', () => {
    expect(createImageFromSvg('<svg><rect width="oops"', dir).ok).toBe(false);
  });

  it('saves the PNG to disk when saveTo is given', async () => {
    const out = path.join(dir, 'nested', 'diagram.png');
    const res = createImageFromSvg(SVG, dir, { saveTo: out });
    expect(res.ok).toBe(true);
    expect(res.savedPath).toBe(out);
    expect(existsSync(out)).toBe(true);
    expect((await readFile(out)).length).toBe(res.bytes);
  });
});

// ── createImageFromHtml ────────────────────────────────────────────────────────
describe('createImageFromHtml', () => {
  it('rejects empty html markup', async () => {
    const res = await createImageFromHtml('   ', dir);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/html/);
  });

  it('renders HTML through an injected browser renderer', async () => {
    const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.from('mock-image')]);
    const renderHtml = vi.fn(async () => png);
    const res = await createImageFromHtml(
      '<div style="width:120px;height:60px;background:#58a6ff;color:#fff;font:16px sans-serif;display:flex;align-items:center;justify-content:center">hi</div>',
      dir,
      { name: 'card.png' },
      { renderHtml },
    );
    expect(res.ok).toBe(true);
    expect(res.bytes).toBeGreaterThan(0);
    expect(Buffer.from(res.base64!, 'base64').subarray(0, 4).toString('latin1')).toBe('\x89PNG');
    expect(renderHtml).toHaveBeenCalledOnce();
  });
});

// ── implicit artifact tracking ─────────────────────────────────────────────────
describe('implicit image artifacts', () => {
  it('cleans harness-persisted fallback output but preserves explicit saveTo output', () => {
    const rendered = createImageFromSvg(SVG, dir, { name: 'temporary.png' });
    expect(rendered.ok).toBe(true);

    // No session context: persistRenderedPng takes the OS-temp fallback path and
    // tracks the file for cleanup.
    const implicitPath = persistRenderedPng(rendered.base64!, undefined, rendered.name)!;
    expect(implicitPath).toBeTruthy();
    expect(existsSync(implicitPath)).toBe(true);

    const explicitPath = path.join(dir, 'durable.png');
    const explicit = createImageFromSvg(SVG, dir, { saveTo: explicitPath });
    expect(explicit.savedPath).toBe(explicitPath);
    expect(existsSync(explicitPath)).toBe(true);

    expect(cleanupImplicitImageArtifacts()).toBeGreaterThan(0);
    expect(existsSync(implicitPath)).toBe(false);
    expect(existsSync(explicitPath)).toBe(true);
  });
});
