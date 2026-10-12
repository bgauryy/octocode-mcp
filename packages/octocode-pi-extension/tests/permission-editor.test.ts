import { CustomEditor, ExtensionSelectorComponent, initTheme, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { TuiMainScreen, type EditorTheme } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';
import { KeybindingsManager } from '../../../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js';
import { registerPermissionEditor } from '../src/permission/editor.js';
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

describe('permission shortcut in Pi editor focus', () => {
  it('cycles once per press, leaves text and thinking intact, and delegates Tab and other actions', async () => {
    const fake = fakePi();
    const cycle = vi.fn();
    const ctx = fakeCtx({ cwd: '/private/tmp/editor' });
    registerPermissionEditor(fake.pi, cycle);
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
    registerPermissionEditor(fake.pi, cycle);
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
    registerPermissionEditor(fake.pi, cycle);
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
    registerPermissionEditor(fake.pi, cycle);
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

  it.each([{ mode: 'rpc', hasUI: true }, { mode: 'print', hasUI: false }])('does not install an editor in $mode', async (options) => {
    const fake = fakePi();
    const ctx = fakeCtx({ cwd: '/private/tmp/editor', ...options });
    const install = vi.spyOn(ctx.ui, 'setEditorComponent');
    registerPermissionEditor(fake.pi, vi.fn());
    await fake.fire('session_start', {}, ctx);
    expect(install).not.toHaveBeenCalled();
    expect(ctx.ui.getEditorComponent()).toBeUndefined();
  });
});
