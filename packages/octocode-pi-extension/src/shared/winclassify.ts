import os from 'node:os';

/**
 * Which PowerShell commands are destructive. The helper's parser (winhelper-script.ts) only reports the commands of a
 * script and their arguments; everything that decides (aliases, `-Command` and `-EncodedCommand` unwrapping, `cmd /c`,
 * which Remove-Item forms wipe data) lives here, so it runs and is tested on any platform. A flag of the same kind as
 * the POSIX one in permission/shell.ts: it flags common destructive commands, and is not a security boundary. A command
 * whose name is computed (`& $tool -Recurse C:\`) is not judged: its target is unknown, and flagging every `& $exe` would
 * make the flag meaningless.
 */

/** One argument of a parsed command: a `-Name[:value]` parameter, or a value (`value` set when it is a string constant). */
export interface ScriptElement {
  param?: string;
  arg?: string;
  text: string;
  value?: string;
}

/** One command of a parsed script (nested ones included); `name` is null when it is computed (`& $tool`). */
export interface ScriptCommand {
  name: string | null;
  args: ScriptElement[];
}

/** Parses a script into its commands; undefined when it does not parse or no parser is available. */
export type ParseScript = (script: string) => Promise<ScriptCommand[] | undefined>;

/** `parsed: false` means no verdict could be reached (parse error, no helper, unwrapping impossible): treat it as destructive. */
export interface Classification {
  destructive?: string;
  parsed: boolean;
}

/** How many `pwsh -Command` / `Invoke-Expression` layers are followed before the command counts as unparsed. */
const MAX_DEPTH = 4;

/** Built-in aliases of the cmdlets checked here (lower case). */
const ALIASES: Readonly<Record<string, string>> = {
  rm: 'remove-item',
  ri: 'remove-item',
  del: 'remove-item',
  erase: 'remove-item',
  rd: 'remove-item',
  rmdir: 'remove-item',
  clc: 'clear-content',
  iex: 'invoke-expression',
};
/** Aliases that cmd.exe also has, and the `/s` switch that makes them recursive there (`rd /s`, `del /s /q`). */
const CMD_REMOVERS = new Set(['del', 'erase', 'rd', 'rmdir']);
/** Commands that wipe a disk or power the machine off or restart it, whatever their arguments. */
const ALWAYS_DESTRUCTIVE = new Set(['format-volume', 'clear-disk', 'remove-partition', 'initialize-disk', 'stop-computer', 'restart-computer', 'shutdown', 'diskpart']);
const POWERSHELLS = new Set(['pwsh', 'powershell', 'pwsh-preview']);

/** Parameters of Remove-Item and of every cmdlet (PowerShell accepts any unambiguous prefix of a parameter name). */
const REMOVE_PARAMS = [
  'path', 'literalpath', 'filter', 'include', 'exclude', 'recurse', 'force', 'stream', 'whatif', 'confirm', 'credential', 'usetransaction',
  'verbose', 'debug', 'erroraction', 'warningaction', 'informationaction', 'progressaction', 'errorvariable', 'warningvariable', 'informationvariable', 'outvariable', 'outbuffer', 'pipelinevariable',
];
/** Of those, the ones that take the next word as their value. */
const VALUE_PARAMS = new Set(['path', 'literalpath', 'filter', 'include', 'exclude', 'stream', 'credential']);
/** `powershell.exe` / `pwsh` parameters, for resolving prefixes such as `-c`, `-e` and `-ec`. */
const SHELL_PARAMS = ['command', 'encodedcommand', 'file', 'executionpolicy', 'workingdirectory', 'version', 'configurationname', 'inputformat', 'outputformat', 'windowstyle', 'settingsfile', 'custompipename'];
/** The short forms `pwsh` itself accepts for them, which a bare prefix would leave ambiguous. */
const SHELL_ALIASES: Readonly<Record<string, string>> = { c: 'command', e: 'encodedcommand', ec: 'encodedcommand', f: 'file' };
/** `powershell.exe` parameters whose next word is a value, not part of the script. */
const SHELL_VALUE_PARAMS = new Set(SHELL_PARAMS.filter((name) => name !== 'command' && name !== 'encodedcommand' && name !== 'file'));

/** The parameter `name` stands for: an exact match, else the only one that starts with it (ambiguous or unknown: undefined). */
function resolveParam(name: string, params: readonly string[]): string | undefined {
  const lower = name.toLowerCase();
  if (params.includes(lower)) return lower;
  const found = params.filter((each) => each.startsWith(lower));
  return lower !== '' && found.length === 1 ? found[0] : undefined;
}

/** The program name of a command, lower case, without its folder, module prefix or `.exe`. */
function programName(name: string): string {
  return name.slice(Math.max(name.lastIndexOf('\\'), name.lastIndexOf('/')) + 1).toLowerCase().replace(/\.exe$/, '');
}

/** The text an element stands for: its string value, else its source with one pair of quotes removed. */
function elementText(element: ScriptElement): string {
  if (element.value !== undefined) return element.value;
  return element.text.replace(/^(['"])(.*)\1$/s, '$2');
}

/** Splits `text` at the commas outside quotes and parentheses: how PowerShell writes an array argument (`.\build, C:\Users\me`). */
function splitList(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote = '';
  let depth = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at]!;
    if (char === '`') {
      current += char + (text[at + 1] ?? '');
      at++;
      continue;
    }
    if (quote) quote = char === quote ? '' : quote;
    else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '{') depth++;
    else if (char === ')' || char === '}') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The paths an argument stands for: one string constant, or the elements of an array written as source (`'a', 'b'`), each without its quotes. */
const textTargets = (text: string): string[] => splitList(text).map((part) => part.replace(/^(['"])(.*)\1$/s, '$2'));
const elementTargets = (element: ScriptElement): string[] => (element.value !== undefined ? [element.value] : textTargets(element.text));

/** `-Name:$false` / `-Name:0` turns a switch off. */
const switchOff = (element: ScriptElement): boolean => element.arg !== undefined && /^\$?(?:false|0)$/i.test(element.arg.trim());

/** Environment references to the profile and system folders, in PowerShell's and cmd's spellings, with the Windows default they stand for. */
const VARIABLES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(?:~|\$\{?home\}?|\$env:userprofile|%userprofile%)(?=\\|$)/, 'c:\\users\\~'],
  [/^(?:\$env:(?:systemroot|windir)|%(?:systemroot|windir)%)(?=\\|$)/, 'c:\\windows'],
  [/^(?:\$env:programfiles\(x86\)|%programfiles\(x86\)%)(?=\\|$)/, 'c:\\program files (x86)'],
  [/^(?:\$env:programfiles|%programfiles%)(?=\\|$)/, 'c:\\program files'],
  [/^(?:\$env:programdata|%programdata%)(?=\\|$)/, 'c:\\programdata'],
  [/^(?:\$env:systemdrive|%systemdrive%)(?=\\|$)/, 'c:'],
];

/** `path` without `.` and `..` segments (`D:\work\..\..` is `D:`; above a root stays at the root; a relative path keeps leading `..`) and without a trailing separator; a path with a variable left in it is not touched. */
function resolveDots(path: string): string {
  if (path === '' || /[$%(@]/.test(path)) return path.length > 1 ? path.replace(/\\+$/, '') : path;
  const drive = /^[a-z]:(?=\\|$)/.exec(path)?.[0];
  const rooted = drive !== undefined || path.startsWith('\\');
  const stack: string[] = [];
  for (const part of (drive ? path.slice(2) : path).split('\\')) {
    if (part === '' || part === '.') continue;
    if (part !== '..') stack.push(part);
    else if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
    else if (!rooted) stack.push('..');
  }
  const body = stack.join('\\');
  if (drive) return body ? `${drive}\\${body}` : drive;
  if (rooted) return body ? `\\${body}` : '\\';
  return body || '.';
}

/** `target` in a comparable form: lower case, `\` separators, no quotes, known variables expanded, no trailing separator or wildcard tail. */
function normalizedTarget(target: string): { path: string; wildcard: boolean } {
  // `\\?\C:\x` and `\\.\C:\x` are `C:\x` (the prefix would otherwise read as a `?` wildcard).
  let path = target.trim().replace(/^(['"])(.*)\1$/s, '$2').toLowerCase().replace(/\//g, '\\').replace(/^\\\\[?.]\\(?=[a-z]:)/, '').replace(/\\{2,}(?!$)/g, '\\');
  for (const [pattern, value] of VARIABLES) path = path.replace(pattern, value);
  const wildcard = /[*?[]/.test(path);
  // `C:\x\*` and `C:\x\*.*` stand for the folder's content: judged as the folder.
  path = path.replace(/\\\*(?:\.\*)?$/, '');
  return { path: resolveDots(path), wildcard };
}

/** Whether removing `path` (normalized) takes a drive, the users folder, a profile, a system folder or the current or parent folder with it. */
function protectedTarget(path: string): boolean {
  const home = os.homedir().replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');
  return (
    // A drive root, and any folder directly under one (`C:\x`): next to the root, not a project folder.
    /^(?:[a-z]:|\\)$/.test(path) ||
    /^[a-z]:\\[^\\]+$/.test(path) ||
    // A profile folder, whatever the user.
    /^[a-z]:\\users\\[^\\]+$/.test(path) ||
    (/^[a-z]:\\/.test(home) && (path === home || home.startsWith(`${path}\\`))) ||
    // System folders, and anything inside them.
    /^[a-z]:\\(?:windows|program files(?: \(x86\))?|programdata)(?:\\|$)/.test(path) ||
    // The current folder and its parents.
    /^\.{1,2}(?:\\\.{1,2})*$/.test(path)
  );
}

/** Whether `path` is computed at run time (`$dir`, `(Get-Location)`), so its value cannot be judged. */
const computed = (path: string): boolean => /^[$(@%]/.test(path);

/**
 * The switches of a cmd.exe word that is only switches, lower case: `/s` is `['s']`, `/s/q` and `/S/Q` are `['s','q']`,
 * `/A:H/S` is `['a','s']` (cmd reads them as one cluster). A path (`/tmp/s`) or anything else is undefined.
 */
function cmdSwitches(word: string): string[] | undefined {
  if (!/^(?:\/[a-z?](?::[^/]*)?)+$/i.test(word)) return undefined;
  return [...word.matchAll(/\/([a-z?])/gi)].map((match) => match[1]!.toLowerCase());
}

const hasSwitch = (word: string, letter: string): boolean => cmdSwitches(word)?.includes(letter) === true;

/** What a `Remove-Item` (or alias) call with these arguments removes, when that is a lot. */
function removalDanger(name: string, args: readonly ScriptElement[]): string | undefined {
  // `rd /s` and `del /s /q` are cmd.exe syntax; PowerShell reads `/s` as a path, so the intent is what is flagged.
  if (CMD_REMOVERS.has(name) && args.some((arg) => arg.param === undefined && hasSwitch(elementText(arg), 's'))) return `\`${name} /s\` (recursive delete)`;
  let recurse = false;
  let force = false;
  const targets: string[] = [];
  for (let at = 0; at < args.length; at++) {
    const arg = args[at]!;
    if (arg.param === undefined) {
      targets.push(...elementTargets(arg));
      continue;
    }
    const param = resolveParam(arg.param, REMOVE_PARAMS);
    if (param === 'whatif' && !switchOff(arg)) return undefined;
    if (param === 'recurse') recurse = !switchOff(arg);
    else if (param === 'force') force = !switchOff(arg);
    else if (param && VALUE_PARAMS.has(param) && arg.arg === undefined) {
      const next = args[++at];
      if (next && (param === 'path' || param === 'literalpath')) targets.push(...elementTargets(next));
    } else if (param === 'path' || param === 'literalpath') {
      targets.push(...textTargets(arg.arg!));
    }
  }
  if (!recurse && !force) return undefined;
  const checked = targets.map(normalizedTarget);
  const reaches = checked.some(({ path, wildcard }) => protectedTarget(path) || wildcard);
  const unknown = recurse && (targets.length === 0 || checked.some(({ path }) => computed(path)));
  if (!reaches && !unknown) return undefined;
  const flags = [recurse ? '-Recurse' : '', force ? '-Force' : ''].filter(Boolean).join(' ');
  return `Remove-Item ${flags} on ${targets.length > 0 ? targets.join(' ') : 'its piped input'}`;
}

/** `cmd /c <script>`: the script text, or undefined when the command is not cmd running one. */
function cmdScript(args: readonly ScriptElement[]): string | undefined {
  const at = args.findIndex((arg) => arg.param === undefined && (hasSwitch(elementText(arg), 'c') || hasSwitch(elementText(arg), 'k')));
  return at < 0 ? undefined : args.slice(at + 1).map(elementText).join(' ');
}

/** A disk wipe or power-off, in PowerShell or cmd: `name` with its argument words. */
function systemDanger(name: string, words: readonly string[]): string | undefined {
  if (ALWAYS_DESTRUCTIVE.has(name)) return `\`${name}\``;
  const drive = name === 'format' ? words.find((word) => /^[a-z]:/i.test(word)) : undefined;
  return drive === undefined ? undefined : `\`format ${drive}\``;
}

/** Words that introduce another command: `if exist X rd /s`, `else rd /s`, `for … do rd /s`. */
const CMD_BLOCKS = new Set(['if', 'else', 'for', 'do']);

/** One simple cmd.exe command split into words: recursive `rd`/`del`, `format X:`, or a system command; also behind `if`, `for`, `@` and a parenthesis. */
function cmdDanger(words: readonly string[]): string | undefined {
  const tidy = words.map((word) => word.replace(/^[@(]+/, '').replace(/\)+$/, ''));
  const name = programName(tidy[0] ?? '');
  if (CMD_BLOCKS.has(name)) {
    for (let at = 1; at < tidy.length; at++) {
      const danger = cmdDanger(tidy.slice(at));
      if (danger) return danger;
    }
    return undefined;
  }
  const rest = tidy.slice(1);
  if (CMD_REMOVERS.has(name) && rest.some((word) => hasSwitch(word, 's'))) return `\`${name} /s\` (recursive delete)`;
  return systemDanger(name, rest);
}

/** Splits a cmd.exe line at `&`, `&&`, `|` and `||` and checks each command; words keep quoted spaces, and `^` escapes the next character (`r^d`). */
function cmdLineDanger(line: string): string | undefined {
  for (const part of line.replace(/\^(.?)/gs, '$1').split(/&&|\|\||[&|]/)) {
    const words = [...part.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]!);
    const danger = cmdDanger(words);
    if (danger) return danger;
  }
  return undefined;
}

/** The script a nested `pwsh`/`powershell` call runs: `-Command <words>`, `-EncodedCommand <base64>`, or a bare first word; null when it cannot be found (`-File`, no script). */
function shellScript(args: readonly ScriptElement[]): { script: string } | { unparsed: true } | null {
  for (let at = 0; at < args.length; at++) {
    const arg = args[at]!;
    if (arg.param === undefined) return { script: args.slice(at).map(elementText).join(' ') };
    const param = SHELL_ALIASES[arg.param.toLowerCase()] ?? resolveParam(arg.param, SHELL_PARAMS);
    if (param === 'file') return null;
    if (param === 'command') {
      const words = arg.arg === undefined ? args.slice(at + 1).map(elementText) : [arg.arg.replace(/^(['"])(.*)\1$/s, '$2'), ...args.slice(at + 1).map(elementText)];
      return words.length > 0 ? { script: words.join(' ') } : null;
    }
    if (param === 'encodedcommand') {
      const encoded = arg.arg !== undefined ? arg.arg.replace(/^(['"])(.*)\1$/s, '$2') : args[at + 1] && args[at + 1]!.param === undefined ? elementText(args[at + 1]!) : '';
      const bytes = Buffer.from(encoded, 'base64');
      // Valid base64 of UTF-16: an even byte count that decodes back to the same text.
      return encoded !== '' && bytes.length > 0 && bytes.length % 2 === 0 && bytes.toString('base64').replace(/=+$/, '') === encoded.replace(/=+$/, '') ? { script: bytes.toString('utf16le') } : { unparsed: true };
    }
    if (param && SHELL_VALUE_PARAMS.has(param) && arg.arg === undefined) at++;
  }
  return null;
}

/** What one command is: a flagged danger, a script to check as PowerShell, or a script that cannot be unwrapped. */
function inspect(command: ScriptCommand): { danger: string } | { script: string } | { unparsed: true } | undefined {
  if (command.name === null) return undefined;
  const typed = programName(command.name);
  const name = ALIASES[typed] ?? typed;
  const words = command.args.filter((arg) => arg.param === undefined).map(elementText);
  if (name === 'remove-item') {
    const danger = removalDanger(typed, command.args);
    return danger ? { danger } : undefined;
  }
  if (name === 'clear-content') {
    const hit = command.args.filter((arg) => arg.param === undefined).flatMap(elementTargets).map(normalizedTarget).find(({ path, wildcard }) => protectedTarget(path) || wildcard);
    return hit ? { danger: `Clear-Content on ${hit.path}` } : undefined;
  }
  if (name === 'invoke-expression') {
    const first = command.args.find((arg) => arg.param === undefined);
    return first?.value !== undefined ? { script: first.value } : { danger: 'Invoke-Expression of a script built at run time' };
  }
  if (POWERSHELLS.has(name)) return shellScript(command.args) ?? undefined;
  if (name === 'cmd') {
    const script = cmdScript(command.args);
    const danger = script === undefined ? undefined : cmdLineDanger(script);
    return danger ? { danger } : undefined;
  }
  const danger = systemDanger(name, words);
  return danger ? { danger } : undefined;
}

/**
 * Whether `script` runs a destructive PowerShell or cmd command, following `pwsh -Command`, `-EncodedCommand` and
 * `Invoke-Expression` into the script they run. `parsed: false` when any layer cannot be read: the caller treats that
 * as destructive. A script that parsed and showed nothing destructive is `{ parsed: true }`.
 */
export async function classifyScript(script: string, parse: ParseScript, depth = 0): Promise<Classification> {
  if (depth > MAX_DEPTH) return { parsed: false };
  const commands = await parse(script);
  if (!commands) return { parsed: false };
  let parsed = true;
  for (const command of commands) {
    const found = inspect(command);
    if (!found) continue;
    if ('danger' in found) return { destructive: found.danger, parsed: true };
    if ('unparsed' in found) {
      parsed = false;
      continue;
    }
    const inner = await classifyScript(found.script, parse, depth + 1);
    if (inner.destructive !== undefined) return inner;
    if (!inner.parsed) parsed = false;
  }
  return { parsed };
}
