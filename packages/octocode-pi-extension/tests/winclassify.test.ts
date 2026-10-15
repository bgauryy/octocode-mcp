import { describe, expect, it } from 'vitest';
import { classifyScript, type ParseScript, type ScriptCommand, type ScriptElement } from '../src/shared/winclassify.js';

/**
 * A stand-in for the helper's parser that reads the simple shapes the cases use: `;` and `|` separate commands, a quoted
 * word is one string constant, `-name[:value]` is a parameter, `{ … }` nests commands, and `<<bad>>` does not parse. The real parser is covered by the tests that need pwsh (winhelper.test.ts).
 */
const parse: ParseScript = async (script) => {
  if (script.includes('<<bad>>')) return undefined;
  // Split at `;`, `|`, `{` and `}` outside quotes.
  const parts: string[] = [''];
  let quote = '';
  for (const char of script) {
    if (quote) quote = char === quote ? '' : quote;
    else if (char === '"' || char === "'") quote = char;
    if (!quote && /[;|{}]/.test(char)) parts.push('');
    else parts[parts.length - 1] += char;
  }
  const commands: ScriptCommand[] = [];
  for (const part of parts.map((each) => each.trim()).filter(Boolean)) {
    const words = [...part.matchAll(/(-[A-Za-z]+):("[^"]*")|"([^"]*)"|'([^']*)'|(\S+)/g)].map((match): ScriptElement => {
      if (match[1] !== undefined) return { param: match[1].slice(1), arg: match[2]!, text: match[0] };
      const quoted = match[3] ?? match[4];
      if (quoted !== undefined) return { text: match[0], value: quoted };
      const word = match[5]!;
      const param = /^-([A-Za-z]+)(?::(.*))?$/.exec(word);
      if (param) return { param: param[1]!, text: word, ...(param[2] !== undefined ? { arg: param[2] } : {}) };
      return word.startsWith('$') || word.startsWith('(') ? { text: word } : { text: word, value: word };
    });
    const [name, ...args] = words;
    commands.push({ name: name!.text.startsWith('$') ? null : name!.value ?? name!.text, args });
  }
  return commands;
};

const classify = (script: string) => classifyScript(script, parse);
const flagged = async (script: string) => {
  const result = await classify(script);
  expect(result.parsed).toBe(true);
  return result.destructive;
};
const b64 = (script: string) => Buffer.from(script, 'utf16le').toString('base64');

describe('Remove-Item', () => {
  it.each([
    ['rm -r -fo C:\\x'],
    ['rm -Recurse -Force C:\\x'],
    ['Remove-Item -Recurse C:\\'],
    ['Remove-Item -Recurse -Force "C:\\Program Files"'],
    ['del -Recurse C:/Windows/System32'],
    ['ri -r $env:USERPROFILE'],
    ['ri -r ~'],
    ['rmdir -Recurse $HOME'],
    ['rd -r -fo "$env:SystemRoot\\Temp"'],
    ['erase -Force *'],
    ['Remove-Item -Force -Path C:\\Users\\someone'],
    ['Remove-Item -LiteralPath C:\\data -Recurse'],
    ['Remove-Item -Path:C:\\data -Recurse'],
    ['rm -r .'],
    ['rm -r -fo ..\\..'],
    ['rm -Recurse build\\*'],
    ['Remove-Item -Recurse $target'],
    ['Get-ChildItem | Remove-Item -Recurse'],
    ['Remove-Item -Recurse -Force D:\\'],
    ['Remove-Item -Recurse -Force $env:SystemDrive\\'],
    ['rm -r -fo "C:\\Program Files (x86)\\Vendor"'],
    ['Remove-Item -Recurse -Recurse:$true C:\\x'],
  ])('flags %s', async (script) => {
    expect(await flagged(script)).toMatch(/^Remove-Item/);
  });

  it.each([
    ['Remove-Item out.txt'],
    ['rm .\\build\\out.txt'],
    ['rm -Force .\\build\\out.txt'],
    ['rm -Recurse .\\node_modules'],
    ['Remove-Item -Recurse C:\\work\\project\\dist'],
    ['Remove-Item -Recurse -Force C:\\x -WhatIf'],
    ['Remove-Item -Recurse:$false C:\\x'],
    ['Remove-Item -Force:0 C:\\x\\y'],
    ['Remove-Item -Filter *.log .\\logs'],
    ['rm -f .\\a'],
    ['rm -rf C:\\x'],
    ['Remove-Item -Include *.tmp .\\a'],
    ['Get-ChildItem -Recurse -Force C:\\'],
    ['Get-ChildItem'],
  ])('leaves %s alone', async (script) => {
    expect(await flagged(script)).toBeUndefined();
  });

  it('reads cmd-style switches given to the PowerShell aliases', async () => {
    expect(await flagged('rd /s /q C:\\x')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('del /s /q build')).toBe('`del /s` (recursive delete)');
    expect(await flagged('rmdir /S old')).toBe('`rmdir /s` (recursive delete)');
    expect(await flagged('del /q old.txt')).toBeUndefined();
  });

  it('reads a cluster of cmd switches glued together with slashes, in any case', async () => {
    expect(await flagged('rd /s/q C:\\x')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('del /f/s/q build')).toBe('`del /s` (recursive delete)');
    expect(await flagged('rmdir /Q/S old')).toBe('`rmdir /s` (recursive delete)');
    expect(await flagged('del /A:H/S old')).toBe('`del /s` (recursive delete)');
    expect(await flagged('erase /f /S/q old')).toBe('`erase /s` (recursive delete)');
    // Not switches: a path, a cluster without /s.
    expect(await flagged('rd /q/x old')).toBeUndefined();
    expect(await flagged('del /tmp/s')).toBeUndefined();
    expect(await flagged('del /f/q old.txt')).toBeUndefined();
  });

  it('resolves aliases whatever their case and folder', async () => {
    expect(await flagged('RM -R -FO C:\\x')).toMatch(/^Remove-Item/);
    expect(await flagged('Microsoft.PowerShell.Management\\Remove-Item -Recurse C:\\x')).toMatch(/^Remove-Item/);
  });

  it('does not judge a command whose name is computed', async () => {
    expect(await flagged('$tool -Recurse C:\\x')).toBeUndefined();
  });
});

/** A script whose parse is fixed: what the helper reports for `Remove-Item -Recurse -Force <array>` is one element holding the whole array text. */
const parsedAs = (name: string, args: ScriptElement[]) => classifyScript('script', async () => [{ name, args }]);
const flag = (name: string): ScriptElement => ({ param: name, text: `-${name}` });

describe('array targets', () => {
  it.each([
    ['.\\build, C:\\Users\\me', 'C:\\Users\\me'],
    ['.\\build,C:\\', 'C:\\'],
    ["'.\\build', 'C:\\Windows'", 'C:\\Windows'],
    ['"C:\\a b\\c", "C:\\Program Files"', 'C:\\Program Files'],
    ['.\\a,.\\b,..', '..'],
    ['.\\a, $env:USERPROFILE', '$env:USERPROFILE'],
  ])('checks every target of %s', async (text) => {
    const result = await parsedAs('Remove-Item', [flag('Recurse'), flag('Force'), { text }]);
    expect(result.destructive).toMatch(/^Remove-Item -Recurse -Force on /);
  });

  it('checks the targets given to -Path as an array, as the next word or glued to the parameter', async () => {
    expect((await parsedAs('rm', [flag('Recurse'), { param: 'Path', text: '-Path' }, { text: "'C:\\a','C:\\'" }])).destructive).toBeDefined();
    expect((await parsedAs('rm', [flag('Force'), { param: 'LiteralPath', arg: "'C:\\a','C:\\Users\\x'", text: "-LiteralPath:'C:\\a','C:\\Users\\x'" }])).destructive).toBeDefined();
  });

  it('keeps a comma inside quotes as part of one target', async () => {
    for (const text of ["'C:\\work\\a,b'", '"C:\\work\\x, y"']) {
      expect((await parsedAs('Remove-Item', [flag('Recurse'), { text }])).destructive).toBeUndefined();
    }
  });

  it('leaves an array of project folders alone', async () => {
    expect(await parsedAs('Remove-Item', [flag('Recurse'), flag('Force'), { text: '.\\build, .\\dist\\out, C:\\work\\p\\tmp' }])).toEqual({ parsed: true });
  });

  it('checks every Clear-Content target', async () => {
    expect((await parsedAs('Clear-Content', [{ text: '.\\notes.txt, C:\\Windows\\x' }])).destructive).toBeDefined();
    expect(await parsedAs('Clear-Content', [{ text: '.\\a.txt, .\\b.txt' }])).toEqual({ parsed: true });
  });
});

describe('target normalisation', () => {
  it.each([
    ['rm -r D:\\work\\proj\\..\\..'],
    ['rm -r C:\\temp\\..'],
    ['rm -r C:\\work\\..\\Windows'],
    ['rm -r C:\\a\\b\\..\\..\\..\\x'],
    ['rm -r .\\build\\..'],
    ['rm -r .\\a\\..\\..'],
    ['rm -r ~\\..'],
    ['rm -r C:\\.\\Users\\me'],
    ['rm -r \\\\?\\C:\\'],
    ['rm -r \\\\?\\C:\\Users\\me'],
    ['rm -r \\\\.\\C:\\Windows'],
    ['rm -r //?/C:/Windows'],
  ])('flags %s', async (script) => {
    expect(await flagged(script)).toMatch(/^Remove-Item/);
  });

  it.each([['rm -r C:\\work\\proj\\.\\dist'], ['rm -r C:\\work\\a\\..\\b\\dist'], ['rm -r .\\a\\..\\dist'], ['rm -r \\\\?\\C:\\work\\p\\dist'], ['rm -r ..\\sibling\\dist']])('leaves %s alone', async (script) => {
    expect(await flagged(script)).toBeUndefined();
  });
});

describe('disk and power commands', () => {
  it.each([['Format-Volume -DriveLetter D'], ['Clear-Disk -Number 1 -RemoveData'], ['Remove-Partition -DiskNumber 1'], ['Initialize-Disk 1'], ['Stop-Computer -Force'], ['Restart-Computer'], ['shutdown /s /t 0'], ['C:\\Windows\\System32\\shutdown.exe /r'], ['diskpart'], ['format D: /q'], ['Clear-Content C:\\x'], ['clc *.log'], ['Clear-Content ~']])('flags %s', async (script) => {
    expect(await flagged(script)).toBeDefined();
  });

  it.each([['Clear-Content .\\notes.txt'], ['Get-Volume'], ['Get-Disk'], ['Format-Table'], ['format']])('leaves %s alone', async (script) => {
    expect(await flagged(script)).toBeUndefined();
  });
});

describe('unwrapping', () => {
  it('follows -Command, whatever its spelling', async () => {
    for (const flag of ['-Command', '-c', '-com']) {
      expect(await flagged(`pwsh ${flag} "Remove-Item -Recurse C:\\x"`)).toMatch(/^Remove-Item/);
    }
    expect(await flagged('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "rm -r -fo C:\\x"')).toMatch(/^Remove-Item/);
    expect(await flagged('pwsh -Command Remove-Item -Recurse C:\\x')).toMatch(/^Remove-Item/);
    expect(await flagged('pwsh "Remove-Item -Recurse C:\\x"')).toMatch(/^Remove-Item/);
    expect(await flagged('pwsh -c:"Remove-Item -Recurse C:\\x"')).toMatch(/^Remove-Item/);
    expect(await flagged('"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo -c "Format-Volume -DriveLetter D"')).toBeDefined();
  });

  it('follows -EncodedCommand, whatever its spelling', async () => {
    const encoded = b64('Remove-Item -Recurse -Force C:\\x');
    for (const flag of ['-EncodedCommand', '-e', '-ec', '-enc']) expect(await flagged(`pwsh ${flag} ${encoded}`)).toMatch(/^Remove-Item/);
    expect(await flagged(`powershell -NoProfile -EncodedCommand:${encoded}`)).toMatch(/^Remove-Item/);
  });

  it('follows several layers, and stops after a few', async () => {
    const inner = b64('Remove-Item -Recurse C:\\x');
    expect(await flagged(`pwsh -Command "pwsh -EncodedCommand ${inner}"`)).toMatch(/^Remove-Item/);
    let script = 'Remove-Item -Recurse C:\\x';
    for (let layer = 0; layer < 6; layer++) script = `pwsh -EncodedCommand ${b64(script)}`;
    expect(await classify(script)).toEqual({ parsed: false });
  });

  it('follows Invoke-Expression of a string, and flags one built at run time', async () => {
    expect(await flagged('iex "Remove-Item -Recurse C:\\x"')).toMatch(/^Remove-Item/);
    expect(await flagged('Invoke-Expression "Get-Date"')).toBeUndefined();
    expect(await flagged('iex $payload')).toBe('Invoke-Expression of a script built at run time');
  });

  it('follows cmd /c with glued switches, before and after /c', async () => {
    expect(await flagged('cmd /c "rd /s/q C:\\x"')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('cmd.exe /d/c "del /f/s/q C:\\x"')).toBe('`del /s` (recursive delete)');
    expect(await flagged('cmd /S /C "rd /S /Q C:\\x"')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('cmd /c "echo a && rd /s/q x"')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('cmd /c "rd /q x"')).toBeUndefined();
  });

  it('sees a cmd remover behind if, for, a parenthesis, @ or ^', async () => {
    expect(await flagged('cmd /c "if exist X rd /s /q X"')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('cmd /c "if not exist X (echo no) else rd /s/q X"')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('cmd /c "(rd /s /q x)"')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('cmd /c "@rd /s /q x"')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('cmd /c "for %i in (a b) do rd /s /q %i"')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('cmd /c "r^d /s /q x"')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('cmd /c "if exist X echo hi"')).toBeUndefined();
    expect(await flagged('cmd /c "if exist X del x.txt"')).toBeUndefined();
  });

  it('follows cmd /c', async () => {
    expect(await flagged('cmd /c "rd /s /q C:\\x"')).toBe('`rd /s` (recursive delete)');
    expect(await flagged('cmd.exe /d /c "echo hi & del /s /q C:\\x"')).toBe('`del /s` (recursive delete)');
    expect(await flagged('cmd /c "format D: /q"')).toBe('`format D:`');
    expect(await flagged('cmd /k "echo a && shutdown /s"')).toBe('`shutdown`');
    expect(await flagged('cmd /c "echo hi | find hi"')).toBeUndefined();
    expect(await flagged('cmd /c "del old.txt"')).toBeUndefined();
    expect(await flagged('cmd')).toBeUndefined();
  });

  it('finds a command inside a script block or after a pipe', async () => {
    expect(await flagged('Get-ChildItem | ForEach-Object { rm -r -fo C:\\x }')).toMatch(/^Remove-Item/);
    expect(await flagged('Start-Sleep 1; Format-Volume -DriveLetter D')).toBeDefined();
  });

  it('does not follow a nested shell that runs a file or nothing', async () => {
    expect(await flagged('pwsh -File .\\build.ps1')).toBeUndefined();
    expect(await flagged('pwsh -NoProfile')).toBeUndefined();
    expect(await flagged('pwsh -Command')).toBeUndefined();
  });

  it('is unparsed when a layer cannot be read', async () => {
    expect(await classify('pwsh -EncodedCommand ###')).toEqual({ parsed: false });
    expect(await classify('pwsh -EncodedCommand')).toEqual({ parsed: false });
    expect(await classify('pwsh -EncodedCommand QQ==')).toEqual({ parsed: false });
    expect(await classify('pwsh -Command "Remove-Item <<bad>>"')).toEqual({ parsed: false });
    expect(await classify('Remove-Item <<bad>>')).toEqual({ parsed: false });
  });

  it('reports a destructive command even when another layer is unreadable', async () => {
    expect(await classify('pwsh -EncodedCommand ###; Format-Volume -DriveLetter D')).toMatchObject({ parsed: true });
    const result = await classify(`pwsh -EncodedCommand ${b64('Get-Date <<bad>>')}; rm -r C:\\x`);
    expect(result).toEqual({ destructive: 'Remove-Item -Recurse on C:\\x', parsed: true });
  });
});

describe('plain commands', () => {
  it.each([['Get-ChildItem'], ['git status'], ['npm test'], ['Get-Content -Path .\\a.txt | Select-String x'], ['Write-Output "rm -r C:\\x"'], ['pwsh -Command "Get-ChildItem"']])('%s stays plain', async (script) => {
    expect(await classify(script)).toEqual({ parsed: true });
  });
});
