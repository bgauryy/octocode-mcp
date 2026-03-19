import path from 'node:path';
import { fileURLToPath } from 'node:url';
export function isDirectRun(importMetaUrl, argv1 = process.argv[1]) {
    if (!argv1) {
        return false;
    }
    return fileURLToPath(importMetaUrl) === path.resolve(argv1);
}
