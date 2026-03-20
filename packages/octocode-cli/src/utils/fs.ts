import fs from 'node:fs';
import path from 'node:path';

export function dirExists(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function readFileContent(filePath: string): string | null {
  try {
    if (fileExists(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch {
    void 0;
  }
  return null;
}

export function writeFileContent(filePath: string, content: string): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!dirExists(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

export function backupFile(filePath: string): string | null {
  if (!fileExists(filePath)) {
    return null;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup-${timestamp}`;
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

export function readJsonFile<T>(filePath: string): T | null {
  const content = readFileContent(filePath);
  if (!content) return null;

  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile(filePath: string, data: unknown): boolean {
  try {
    const content = JSON.stringify(data, null, 2) + '\n';
    return writeFileContent(filePath, content);
  } catch {
    return false;
  }
}

export function copyDirectory(src: string, dest: string): boolean {
  try {
    if (!dirExists(src)) {
      return false;
    }

    if (!dirExists(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function listSubdirectories(dirPath: string): string[] {
  try {
    if (!dirExists(dirPath)) {
      return [];
    }
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

export function removeDirectory(dirPath: string): boolean {
  try {
    if (!dirExists(dirPath)) {
      return false;
    }
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
