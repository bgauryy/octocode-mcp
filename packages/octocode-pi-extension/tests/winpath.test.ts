import { describe, expect, it } from 'vitest';
import { pathExecutable, powerShellCandidates, system32Executable, systemRoot } from '../src/shared/winpath.js';

const CWD = 'C:\\repo\\project';

describe('systemRoot', () => {
  it('takes %SystemRoot%, then %windir%, whatever the case of the variable name', () => {
    expect(systemRoot({ SystemRoot: 'D:\\Win' })).toBe('D:\\Win');
    expect(systemRoot({ SYSTEMROOT: 'D:\\Win\\' })).toBe('D:\\Win');
    expect(systemRoot({ windir: 'E:\\W' })).toBe('E:\\W');
    expect(systemRoot({ SystemRoot: 'D:\\A', windir: 'E:\\B' })).toBe('D:\\A');
  });

  it('never uses a relative or empty value: a bare or cwd-relative root would reintroduce the lookup in the current folder', () => {
    for (const bad of ['', 'Windows', '.\\Windows', '\\Windows', '..']) expect(systemRoot({ SystemRoot: bad })).toBe('C:\\Windows');
    expect(systemRoot({ SystemRoot: '.\\x', windir: 'D:\\W' })).toBe('D:\\W');
    expect(systemRoot({})).toBe('C:\\Windows');
  });
});

describe('system32Executable', () => {
  it('is an absolute path under System32', () => {
    expect(system32Executable('taskkill.exe', { SystemRoot: 'C:\\Windows' })).toBe('C:\\Windows\\System32\\taskkill.exe');
    expect(system32Executable('WindowsPowerShell\\v1.0\\powershell.exe', { windir: 'D:\\W' })).toBe('D:\\W\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  });
});

describe('pathExecutable', () => {
  const exists = (...files: string[]) => (file: string) => files.includes(file);

  it('finds the first PATH entry that holds the file, with .exe added', () => {
    const env = { Path: 'C:\\a;C:\\Program Files\\PowerShell\\7;C:\\b' };
    expect(pathExecutable('pwsh', { env, cwd: CWD, exists: exists('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'C:\\b\\pwsh.exe') })).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe');
  });

  it('skips the current folder, however it is spelled in PATH, and relative entries', () => {
    const everywhere = () => true;
    expect(pathExecutable('pwsh', { env: { PATH: `.;;${CWD};c:\\REPO\\project\\;..\\bin;bin` }, cwd: CWD, exists: everywhere })).toBeUndefined();
    expect(pathExecutable('pwsh', { env: { PATH: `${CWD};C:\\tools` }, cwd: CWD, exists: everywhere })).toBe('C:\\tools\\pwsh.exe');
  });

  it('is undefined with no PATH or no match', () => {
    expect(pathExecutable('pwsh', { env: {}, cwd: CWD, exists: () => true })).toBeUndefined();
    expect(pathExecutable('pwsh', { env: { PATH: 'C:\\a' }, cwd: CWD, exists: () => false })).toBeUndefined();
  });

  it('unquotes PATH entries', () => {
    expect(pathExecutable('pwsh', { env: { PATH: '"C:\\Program Files\\PS"' }, cwd: CWD, exists: exists('C:\\Program Files\\PS\\pwsh.exe') })).toBe('C:\\Program Files\\PS\\pwsh.exe');
  });
});

describe('powerShellCandidates', () => {
  it('lists pwsh from PATH (never the current folder) before Windows PowerShell by its System32 path', () => {
    const env = { SystemRoot: 'C:\\Windows', PATH: 'C:\\ps7' };
    expect(powerShellCandidates({ env, cwd: CWD, exists: (file) => file === 'C:\\ps7\\pwsh.exe' })).toEqual(['C:\\ps7\\pwsh.exe', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe']);
  });

  it('has only Windows PowerShell when PATH offers no pwsh, and every entry is absolute', () => {
    const list = powerShellCandidates({ env: { SystemRoot: 'C:\\Windows', PATH: CWD }, cwd: CWD, exists: () => true });
    expect(list).toEqual(['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe']);
  });
});
