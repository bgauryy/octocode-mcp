import { CustomEditor, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { isKeyRelease, isKeyRepeat, matchesKey } from '@earendil-works/pi-tui';
import { PERMISSION_SHORTCUT } from './mode.js';

type EditorFactory = NonNullable<ReturnType<ExtensionContext['ui']['getEditorComponent']>>;

/** Pi reserves Shift+Tab for thinking, so registerShortcut would silently skip it. Keep the override in the editor. */
export function registerPermissionEditor(pi: ExtensionAPI, cycle: (ctx: ExtensionContext) => void): void {
  let installed: EditorFactory | undefined;
  let context: ExtensionContext;
  pi.on('session_start', async (_event, ctx) => {
    if (!ctx.hasUI || ctx.mode !== 'tui') return;
    context = ctx;
    const previous = ctx.ui.getEditorComponent();
    // Replacing an editor closes its active selector. Session switches only need to update the callback's context.
    if (installed && previous === installed) return;
    installed = (tui, theme, keybindings) => {
      const editor = previous?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings, { embedWorkingStatus: true });
      const handleInput = editor.handleInput?.bind(editor);
      // Preserve the editor object: Pi copies its native action handlers and appearance onto this instance.
      editor.handleInput = (data) => {
        if (matchesKey(data, PERMISSION_SHORTCUT)) {
          if (!isKeyRelease(data) && !isKeyRepeat(data)) cycle(context);
          return;
        }
        handleInput?.(data);
      };
      return editor;
    };
    ctx.ui.setEditorComponent(installed);
  });
}
