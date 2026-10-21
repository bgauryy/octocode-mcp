import { CustomEditor, type ExtensionAPI, type ExtensionContext, type Theme } from '@earendil-works/pi-coding-agent';
import { isKeyRelease, isKeyRepeat, matchesKey, truncateToWidth, visibleWidth, type Component, type TuiMouseEvent } from '@earendil-works/pi-tui';
import { thinkingTranscript } from './thinking.js';
import { CHIPS, PERMISSION_SHORTCUT, PERMISSION_SHORTCUT_LABEL, type PermissionMode } from '../permission/mode.js';

type EditorFactory = NonNullable<ReturnType<ExtensionContext['ui']['getEditorComponent']>>;
type Paint = Pick<Theme, 'fg'>;

/** What the editor needs from the permission state: the live mode and the Shift+Tab step. */
export interface EditorPermission {
  readonly mode: PermissionMode;
  cycle(ctx: ExtensionContext): void;
}

/** Columns the closed box takes: `│ ` on the left and ` │` on the right. */
export const BOX_INSET = 2;
/** Below this width the box, labels and hint step aside and Pi's plain rules remain. */
export const BOX_MIN_WIDTH = 24;
const LABEL = 'octocode';

/**
 * The empty-prompt hint, most useful first: parts drop from the end until it fits, and the first is cut last. Pi owns
 * `/`, `@` and `!`; Shift+Tab is Octocode's permission cycle.
 */
export function hintText(width: number): string {
  const parts = ['Ask about any code', '/ commands', '@ files', '! shell', `${PERMISSION_SHORTCUT_LABEL.toLowerCase()} permission`];
  for (let count = parts.length; count > 1; count -= 1) {
    const text = parts.slice(0, count).join(' · ');
    if (visibleWidth(text) <= width) return text;
  }
  return truncateToWidth(parts[0]!, Math.max(0, width), '…');
}

/**
 * The empty editor's content row with the hint after the cursor. `row` is the row Pi rendered (padding, the cursor
 * marker and the reverse-video cursor, then spaces); only its trailing spaces are replaced, so the cursor and IME
 * position stay where Pi put them.
 */
export function withHint(row: string, width: number, theme: Paint): string {
  // `muted`, not `dim`: placeholder text still needs 4.5:1 contrast (WCAG 1.4.3), and `dim` falls short on light themes.
  const head = row.replace(/ +$/, '');
  const used = visibleWidth(head);
  const room = width - used - 1;
  if (room < 4) return row;
  const hint = hintText(room);
  return `${head} ${theme.fg('muted', hint)}${' '.repeat(Math.max(0, room - visibleWidth(hint)))}`;
}

/** A border rule of `width` columns with `left` and `right` labels set into it, one rule column outside each. */
export function labelledRule(width: number, left: string, right: string, rule: (text: string) => string): string {
  const room = width - 2;
  let l = left;
  let r = right;
  // A label needs one rule column between it and its neighbour; the right one yields first.
  if (visibleWidth(l) + visibleWidth(r) + 1 > room) r = '';
  if (visibleWidth(l) + 1 > room) l = '';
  const gap = Math.max(0, room - visibleWidth(l) - visibleWidth(r));
  return `${rule('─')}${l}${rule('─'.repeat(gap))}${r}${rule('─')}`;
}

export function borderTint(text: string, pi: (text: string) => string, theme: Paint): (text: string) => string {
  if (text.trimStart().startsWith('!')) return pi;
  return (part) => theme.fg('accent', part);
}

/**
 * Draws `editor` as Octocode's prompt: a closed box (`╭─╮ │ │ ╰─╯`) tinted by the theme accent, `octocode` in the
 * idle top border (Pi's working line takes that place during a run), the mode in the bottom border, and a muted hint
 * while the prompt is empty and `hint()` holds. Pi's rendering, input and handlers stay its own: the box wraps the rows Pi renders at
 * the inner width, and clicks shift by the same inset, so wrapping, scrolling, the cursor marker and click-to-place
 * keep working. Colour is never the only signal: the mode is written next to the tint.
 */
export function decorateEditor(editor: CustomEditor, permission: Pick<EditorPermission, 'mode'>, theme: () => Paint, hint: () => boolean): CustomEditor {
  const render = editor.render.bind(editor);
  const handleMouse = editor.handleMouse.bind(editor);
  const setIndicator = editor.setWorkingStatusIndicator.bind(editor);
  const topBorder = Reflect.get(editor, 'renderTopBorder').bind(editor) as (width: number, hidden: number) => string;
  const bottomBorder = Reflect.get(editor, 'renderBottomBorder').bind(editor) as (width: number, hidden: number) => string;
  let working = false;
  let boxed = false;
  // Pi assigns a colour for the thinking level and the `!` mode; keep it for the `!` mode and the working line.
  let assigned = editor.borderColor;
  Object.defineProperty(editor, 'borderColor', {
    configurable: true,
    enumerable: true,
    get: () => borderTint(editor.getText(), assigned, theme()),
    set: (color: (text: string) => string) => {
      assigned = color;
    },
  });
  editor.setWorkingStatusIndicator = (indicator) => {
    working = indicator !== undefined;
    setIndicator(indicator);
  };
  const rule = (text: string) => editor.borderColor(text);
  Reflect.set(editor, 'renderTopBorder', (width: number, hidden: number) => {
    if (!boxed || working || hidden > 0) return topBorder(width, hidden);
    return labelledRule(width, theme().fg('accent', ` ${LABEL} `), '', rule);
  });
  Reflect.set(editor, 'renderBottomBorder', (width: number, hidden: number) => {
    if (!boxed || hidden > 0) return bottomBorder(width, hidden);
    const chip = CHIPS[permission.mode];
    return labelledRule(width, '', theme().fg(chip.color, ` ${chip.short} `), rule);
  });
  editor.render = (width: number): string[] => {
    boxed = width >= BOX_MIN_WIDTH;
    if (!boxed) return render(width);
    const inner = width - BOX_INSET * 2;
    const lines = render(inner);
    const rows = Reflect.get(editor, 'renderedVisibleLineCount');
    if (typeof rows !== 'number' || lines.length < rows + 2) return lines;
    const hinted = editor.getText() === '' && hint();
    const side = (row: string) => `${rule('│')} ${row}${' '.repeat(Math.max(0, inner - visibleWidth(row)))} ${rule('│')}`;
    const indent = ' '.repeat(BOX_INSET);
    return lines.map((line, index) => {
      if (index === 0) return `${rule('╭─')}${line}${rule('─╮')}`;
      if (index <= rows) return side(hinted && index === 1 ? withHint(line, inner, theme()) : line);
      if (index === rows + 1) return `${rule('╰─')}${line}${rule('─╯')}`;
      // Autocomplete rows sit under the box, aligned with the text.
      return `${indent}${line}${indent}`;
    });
  };
  editor.handleMouse = (event: TuiMouseEvent) => handleMouse(boxed ? { ...event, x: event.x - BOX_INSET, width: event.width - BOX_INSET * 2 } : event);
  return editor;
}

const isEditor = (component: Component): component is CustomEditor =>
  component instanceof CustomEditor ||
  ['getText', 'setWorkingStatusIndicator', 'handleMouse', 'renderTopBorder', 'renderBottomBorder'].every((name) => typeof Reflect.get(component, name) === 'function');

/**
 * The main editor in the TUI: Shift+Tab cycles the permission mode (Pi reserves Shift+Tab for thinking, so
 * registerShortcut would skip it; the override lives in the editor), and `decorateEditor` draws the prompt. A prior
 * factory's editor is kept and decorated when it is an editor; any other component only gets the shortcut. The hint
 * shows until the conversation starts: by then the footer chip carries the Shift+Tab reminder.
 */
export function registerEditor(pi: ExtensionAPI, permission: EditorPermission): void {
  let installed: EditorFactory | undefined;
  let context: ExtensionContext;
  let started = false;
  const sample = (ctx: ExtensionContext) => {
    started = ctx.sessionManager.getBranch().some((entry) => entry.type === 'message');
  };
  pi.on('agent_start', async () => {
    started = true;
  });
  pi.on('session_tree', async (_event, ctx) => sample(ctx));
  pi.on('session_start', async (_event, ctx) => {
    if (!ctx.hasUI || ctx.mode !== 'tui') return;
    context = ctx;
    sample(ctx);
    const previous = ctx.ui.getEditorComponent();
    // Replacing an editor closes its active selector. Session switches only need to update the callback's context.
    if (installed && previous === installed) return;
    installed = (tui, theme, keybindings) => {
      const editor = previous?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings, { embedWorkingStatus: true });
      const transcript = thinkingTranscript(tui);
      const handleInput = editor.handleInput?.bind(editor);
      // Preserve the editor object: Pi copies its native action handlers and appearance onto this instance.
      editor.handleInput = (data) => {
        if (matchesKey(data, PERMISSION_SHORTCUT)) {
          if (!isKeyRelease(data) && !isKeyRepeat(data)) permission.cycle(context);
          return;
        }
        if (keybindings.matches(data, 'app.thinking.toggle')) {
          if (!isKeyRelease(data) && !isKeyRepeat(data)) transcript.toggle();
          return;
        }
        handleInput?.(data);
      };
      return isEditor(editor) ? decorateEditor(editor, permission, () => context.ui.theme, () => !started) : editor;
    };
    ctx.ui.setEditorComponent(installed);
  });
}
