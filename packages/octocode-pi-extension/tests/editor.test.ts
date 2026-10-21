import { AssistantMessageComponent, CustomEditor, ExtensionSelectorComponent, initTheme, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Container, CombinedAutocompleteProvider, TuiMainScreen, visibleWidth, type EditorTheme } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';
import { KeybindingsManager } from '../../../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js';
import { BOX_MIN_WIDTH, decorateEditor, hintText, labelledRule, registerEditor, withHint } from '../src/ui/editor.js';
import { thinkingTranscript } from '../src/ui/thinking.js';
import type { PermissionMode } from '../src/permission/mode.js';
import { fakeCtx, fakePi } from './fake-pi.js';

const identity = (text: string): string => text;
type EditorFactory = NonNullable<ReturnType<ExtensionContext['ui']['getEditorComponent']>>;
const editorTheme: EditorTheme = {
  borderColor: identity,
  selectList: { selectedPrefix: identity, selectedText: identity, description: identity, scrollInfo: identity, noMatch: identity },
};

/** Runs the installed Pi TuiBase input router without starting a physical terminal. */
function terminal() {
  const tui = new TuiMainScreen({ columns: 100, rows: 30 } as never);
  tui.requestRender = vi.fn();
  Reflect.set(tui, 'requestImmediateRender', vi.fn());
  const input = (data: string) => Reflect.get(tui, 'handleTerminalInput').call(tui, data);
  return { tui, input, keys: new KeybindingsManager() };
}

describe('permission shortcut in the Octocode editor', () => {
  it('toggles thinking with the configured binding once per press without changing the draft', async () => {
    initTheme('dark', false);
    const fake = fakePi();
    const ctx = fakeCtx({ cwd: '/private/tmp/editor' });
    registerEditor(fake.pi, { mode: 'full', cycle: vi.fn() });
    await fake.fire('session_start', {}, ctx);
    const { tui, input, keys } = terminal();
    const chat = new Container();
    const component = new AssistantMessageComponent({ role: 'assistant', content: [{ type: 'thinking', thinking: 'Complete thought.' }] } as never, true);
    chat.addChild(component);
    tui.addChild(chat);
    thinkingTranscript(tui).refresh();
    const setHidden = vi.spyOn(component, 'setHideThinkingBlock');
    const editor = ctx.ui.getEditorComponent()!(tui, editorTheme, keys) as CustomEditor;
    tui.setFocus(editor);
    input('draft');
    input('\x14');
    expect(setHidden).toHaveBeenLastCalledWith(true);
    input('\x1b[116;5:2u');
    input('\x1b[116;5:3u');
    expect(setHidden).toHaveBeenCalledTimes(1);
    keys.setUserBindings({ 'app.thinking.toggle': 'ctrl+y' });
    input('\x19');
    expect(setHidden).toHaveBeenLastCalledWith(false);
    expect(editor.getText()).toBe('draft');
  });

  it('cycles once per press, leaves text and thinking intact, and delegates Tab and other actions', async () => {
    const fake = fakePi();
    const cycle = vi.fn();
    const ctx = fakeCtx({ cwd: '/private/tmp/editor' });
    registerEditor(fake.pi, { mode: 'full', cycle: cycle });
    await fake.fire('session_start', {}, ctx);
    const { tui, input, keys } = terminal();
    const editor = ctx.ui.getEditorComponent()!(tui, editorTheme, keys) as CustomEditor;
    const thinking = vi.fn();
    const model = vi.fn();
    editor.onAction('app.thinking.cycle', thinking);
    editor.onAction('app.model.select', model);
    const complete = vi.fn(async () => null);
    editor.setAutocompleteProvider({ getSuggestions: complete, applyCompletion: () => ({ lines: ['completed'], cursorLine: 0, cursorCol: 9 }) });
    tui.setFocus(editor);
    input('draft');
    keys.setUserBindings({ 'app.thinking.toggle': 'shift+tab' });
    input('\x1b[Z');
    input('\x1b[9;2u');
    input('\x1b[9;2:2u');
    input('\x1b[9;2:3u');
    expect(cycle).toHaveBeenCalledTimes(2);
    expect(cycle).toHaveBeenLastCalledWith(ctx);
    expect(thinking).not.toHaveBeenCalled();
    expect(editor.getText()).toBe('draft');
    input('\t');
    await Promise.resolve();
    expect(complete).toHaveBeenCalled();
    input('\x0c');
    expect(model).toHaveBeenCalledOnce();
    expect(fake.shortcuts.size).toBe(0);
  });

  it('keeps permission unchanged while a real Pi approval selector owns focus', async () => {
    initTheme('dark', false);
    const fake = fakePi();
    const cycle = vi.fn();
    const ctx = fakeCtx({ cwd: '/private/tmp/editor' });
    registerEditor(fake.pi, { mode: 'full', cycle: cycle });
    await fake.fire('session_start', {}, ctx);
    const { tui, input, keys } = terminal();
    const editor = ctx.ui.getEditorComponent()!(tui, editorTheme, keys);
    const selected = vi.fn();
    const cancelled = vi.fn();
    const selector = new ExtensionSelectorComponent('Approve?', ['Allow once', 'Deny'], selected, cancelled);
    tui.setFocus(selector);
    input('\x1b[Z');
    input('\t');
    input('\x1b[B');
    input('\r');
    expect(selected).toHaveBeenCalledWith('Deny');
    expect(cancelled).not.toHaveBeenCalled();
    expect(cycle).not.toHaveBeenCalled();
    tui.setFocus(editor);
    input('\x1b[Z');
    expect(cycle).toHaveBeenCalledOnce();
  });

  it('chains a prior factory without replacing its editor or input behavior', async () => {
    const fake = fakePi();
    const cycle = vi.fn();
    const ctx = fakeCtx({ cwd: '/private/tmp/editor' });
    const { tui, input, keys } = terminal();
    const original = new CustomEditor(tui, editorTheme, keys);
    const originalInput = vi.spyOn(original, 'handleInput');
    const factory: EditorFactory = vi.fn(() => original);
    ctx.ui.setEditorComponent(factory);
    registerEditor(fake.pi, { mode: 'full', cycle: cycle });
    await fake.fire('session_start', {}, ctx);
    const editor = ctx.ui.getEditorComponent()!(tui, editorTheme, keys);
    expect(editor).toBe(original);
    expect(factory).toHaveBeenCalledWith(tui, editorTheme, keys);
    tui.setFocus(editor);
    input('hello');
    input('\x1b[Z');
    expect(editor.getText()).toBe('hello');
    expect(originalInput).toHaveBeenCalledWith('hello');
    expect(originalInput).not.toHaveBeenCalledWith('\x1b[Z');
    expect(cycle).toHaveBeenCalledOnce();
  });

  it('keeps the installed factory across session changes and uses the latest context', async () => {
    const fake = fakePi();
    const cycle = vi.fn<(ctx: ExtensionContext) => void>();
    const ctx = fakeCtx({ cwd: '/private/tmp/first' });
    registerEditor(fake.pi, { mode: 'full', cycle: cycle });
    await fake.fire('session_start', {}, ctx);
    const factory = ctx.ui.getEditorComponent()!;
    const { tui, input, keys } = terminal();
    const editor = factory(tui, editorTheme, keys);
    tui.setFocus(editor);
    const next = { ...fakeCtx({ cwd: '/private/tmp/second' }), ui: ctx.ui };
    await fake.fire('session_start', { reason: 'resume' }, next);
    expect(ctx.ui.getEditorComponent()).toBe(factory);
    input('\x1b[Z');
    expect(cycle).toHaveBeenCalledExactlyOnceWith(next);
    await fake.fire('session_start', {}, next);
    expect(ctx.ui.getEditorComponent()).toBe(factory);
    input('\x1b[Z');
    expect(cycle).toHaveBeenCalledTimes(2);
  });

  it('shows the hint in a fresh session until the first run, and not in a session with messages', async () => {
    const fake = fakePi();
    const ctx = fakeCtx({ cwd: '/private/tmp/editor' });
    Reflect.set(ctx.ui, 'theme', { fg: (_color: string, text: string) => text });
    registerEditor(fake.pi, { mode: 'full', cycle: vi.fn() });
    await fake.fire('session_start', {}, ctx);
    const { tui, keys } = terminal();
    const editor = ctx.ui.getEditorComponent()!(tui, editorTheme, keys) as CustomEditor;
    const row = () => editor.render(100)[1]!;
    expect(row()).toContain('Ask about any code');
    await fake.fire('agent_start', {}, ctx);
    expect(row()).not.toContain('Ask about any code');
    const resumed = fakeCtx({ cwd: '/private/tmp/editor' });
    Reflect.set(resumed.ui, 'theme', { fg: (_color: string, text: string) => text });
    resumed.sessionManager.getBranch = (() => [{ type: 'message' }]) as never;
    await fake.fire('session_start', {}, resumed);
    expect(resumed.ui.getEditorComponent()!(tui, editorTheme, keys).render(100)[1]).not.toContain('Ask about any code');
    await fake.fire('session_tree', {}, ctx);
    expect(row()).toContain('Ask about any code');
  });

  it.each([{ mode: 'rpc', hasUI: true }, { mode: 'print', hasUI: false }])('does not install an editor in $mode', async (options) => {
    const fake = fakePi();
    const ctx = fakeCtx({ cwd: '/private/tmp/editor', ...options });
    const install = vi.spyOn(ctx.ui, 'setEditorComponent');
    registerEditor(fake.pi, { mode: 'full', cycle: vi.fn() });
    await fake.fire('session_start', {}, ctx);
    expect(install).not.toHaveBeenCalled();
    expect(ctx.ui.getEditorComponent()).toBeUndefined();
  });
});

describe('Octocode prompt box', () => {
  const CODES: Record<string, number> = { error: 31, accent: 35, muted: 90, dim: 2 };
  const tagged = { fg: (color: string, text: string) => `\x1b[${CODES[color] ?? 39}m${text}\x1b[39m` };
  const painted = (code: number, text: string) => `\x1b[${code}m${text}\x1b[39m`;
  const plain = (line: string) => line.replace(/\x1b\[[0-9;]*m|\x1b_[^\x07]*\x07/g, '');
  function boxed(mode: { value: PermissionMode } = { value: 'full' }, hint = { value: true }) {
    const { tui, input, keys } = terminal();
    const editor = decorateEditor(new CustomEditor(tui, editorTheme, keys, { embedWorkingStatus: true }), { get mode() { return mode.value; } }, () => tagged as never, () => hint.value);
    tui.setFocus(editor);
    return { editor, input, mode, hint };
  }
  /** Column `x` of row `y` in the box at `width`, as a terminal reports a left click there. */
  const click = (editor: CustomEditor, x: number, y: number, width = 60) => {
    editor.handleMouse({ type: 'press', button: 'left', x, y, width, height: 10 } as never);
    return editor.handleMouse({ type: 'click', button: 'left', x, y, width, height: 10 } as never);
  };

  it('draws a closed box with the idle label, the mode, and the hint while empty, every row exactly the width', () => {
    const { editor } = boxed();
    const lines = editor.render(80);
    const text = lines.map(plain);
    expect(text[0]).toMatch(/^╭── octocode ─+╮$/);
    expect(text[1]).toMatch(/^│ .*Ask about any code · \/ commands · @ files · ! shell · shift\+tab permission +│$/);
    expect(text[2]).toMatch(/^╰─+ ⏵⏵ full ──╯$/);
    expect(text.map((line) => visibleWidth(line))).toEqual([80, 80, 80]);
    expect(lines[1]).toContain(painted(90, 'Ask about any code').slice(0, -5));
  });

  it('drops the hint on the first keystroke and keeps the typed text inside the box', () => {
    const { editor, input } = boxed();
    input('hello');
    const text = editor.render(60).map(plain);
    expect(text[1]).toMatch(/^│ hello +│$/);
    expect(text.join('\n')).not.toContain('Ask about any code');
  });

  it('keeps the accent border across permission modes and uses Pi’s colour for a ! command', () => {
    const { editor, input, mode } = boxed({ value: 'manual' });
    editor.borderColor = (text) => painted(36, text);
    let lines = editor.render(60);
    expect(lines[0]!.startsWith(painted(35, '╭─'))).toBe(true);
    expect(plain(lines[2]!)).toContain('⏸ manual');
    mode.value = 'full';
    lines = editor.render(60);
    expect(lines[0]!.startsWith(painted(35, '╭─'))).toBe(true);
    expect(lines[2]).toContain(painted(31, ' ⏵⏵ full '));
    expect(plain(lines[2]!)).toContain('⏵⏵ full');
    input('!ls');
    expect(editor.render(60)[0]!.startsWith(painted(36, '╭─'))).toBe(true);
  });

  it('gives the top border to Pi’s working line during a run', () => {
    const { editor } = boxed();
    editor.setWorkingStatusIndicator({ renderInBorder: () => 'Working', renderSpinnerInBorder: () => '⠋' } as never);
    const top = plain(editor.render(60)[0]!);
    expect(top).toMatch(/^╭─── Working ─+╮$/);
    expect(top).not.toContain('octocode');
    editor.setWorkingStatusIndicator(undefined);
    expect(plain(editor.render(60)[0]!)).toContain(' octocode ');
  });

  it('places the cursor where a click lands inside the box', () => {
    const { editor, input } = boxed();
    input('hello world');
    editor.render(60);
    click(editor, 2 + 3, 1);
    input('X');
    expect(editor.getText()).toBe('helXlo world');
  });

  it.each([
    { where: 'the left border', x: 0, expected: 'Xhello world' },
    { where: 'the left padding', x: 1, expected: 'Xhello world' },
    { where: 'the first text column', x: 2, expected: 'Xhello world' },
    { where: 'the right border', x: 59, expected: 'hello worldX' },
  ])('places the cursor at the nearest text column for a click on $where', ({ x, expected }) => {
    const { editor, input } = boxed();
    input('hello world');
    editor.render(60);
    click(editor, x, 1);
    input('X');
    expect(editor.getText()).toBe(expected);
  });

  it('accepts the autocomplete row a click lands on, under the box', async () => {
    const { editor } = boxed();
    editor.setAutocompleteProvider(new CombinedAutocompleteProvider([{ name: 'help', description: 'Show help' }, { name: 'hello', description: 'Say hello' }], '/private/tmp/editor'));
    editor.setText('');
    for (const key of '/he') editor.handleInput(key);
    await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true));
    const lines = editor.render(60).map(plain);
    const row = lines.findIndex((line, index) => index > 2 && line.includes('hello'));
    expect(row).toBeGreaterThan(2);
    // Autocomplete rows sit two columns in, aligned with the text above.
    expect(lines[row]!.startsWith('  ')).toBe(true);
    click(editor, lines[row]!.indexOf('hello'), row);
    expect(editor.getText()).toMatch(/^\/hello/);
  });

  it('shows the hint only while `hint()` holds (the conversation has not started)', () => {
    const { editor, hint } = boxed();
    expect(plain(editor.render(80)[1]!)).toContain('Ask about any code');
    hint.value = false;
    expect(plain(editor.render(80)[1]!)).toMatch(/^│ \S? +│$/);
  });

  it('keeps Pi’s scroll indicators when the text overflows', () => {
    const { editor } = boxed();
    editor.setText(Array.from({ length: 20 }, (_, line) => `line ${line}`).join('\n'));
    const text = editor.render(60).map(plain);
    expect(text[0]!.startsWith('╭─')).toBe(true);
    expect(text[0]).toContain('↑');
    expect(text[0]).not.toContain('octocode');
    expect(text.every((line) => visibleWidth(line) === 60)).toBe(true);
  });

  it('steps aside below the minimum width: Pi’s plain rules, no labels, no hint', () => {
    const { editor } = boxed();
    const text = editor.render(BOX_MIN_WIDTH - 1).map(plain);
    expect(text[0]).toBe('─'.repeat(BOX_MIN_WIDTH - 1));
    expect(text.join('')).not.toMatch(/[╭│╰]|octocode|Ask/);
  });

  it('boxes from the minimum width up, every row exactly the width', () => {
    const { editor, input } = boxed();
    for (const width of [BOX_MIN_WIDTH, 40]) {
      const text = editor.render(width).map(plain);
      expect(text[0]!.startsWith('╭─')).toBe(true);
      expect(text.every((line) => visibleWidth(line) === width)).toBe(true);
    }
    input('a prompt long enough to wrap inside the narrow box');
    const text = editor.render(BOX_MIN_WIDTH).map(plain);
    expect(text.length).toBeGreaterThan(3);
    expect(text.every((line) => visibleWidth(line) === BOX_MIN_WIDTH)).toBe(true);
  });

  it('shortens the hint part by part and keeps labels inside the rule', () => {
    expect(hintText(200)).toBe('Ask about any code · / commands · @ files · ! shell · shift+tab permission');
    expect(hintText(40)).toBe('Ask about any code · / commands');
    expect(plain(hintText(10))).toBe('Ask about…');
    expect(labelledRule(20, ' left ', ' right ', (text) => text)).toBe('─ left ───── right ─');
    expect(visibleWidth(labelledRule(10, ' a long label ', ' right ', (text) => text))).toBe(10);
    expect(withHint('ab   ', 5, tagged as never)).toBe('ab   ');
  });
});
