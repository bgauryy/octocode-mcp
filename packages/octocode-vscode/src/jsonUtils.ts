import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

type Logger = (message: string) => void;

export async function readJsonFile<T>(
  filePath: string,
  logger?: Logger
): Promise<T | null> {
  try {
    try {
      await fsPromises.access(filePath, fs.constants.R_OK);
    } catch {
      return null;
    }

    const content = await fsPromises.readFile(filePath, 'utf-8');
    if (!content.trim()) {
      return null;
    }

    return JSON.parse(content) as T;
  } catch (error) {
    logger?.(`Failed to read/parse JSON at ${filePath}: ${error}`);
    return null;
  }
}
