/**
 * Common Test Fixtures
 *
 * Provides reusable test data and file structures for testing.
 *
 * @example
 * ```typescript
 * import { fixtures } from '../helpers';
 *
 * // Use pre-built file trees
 * const vfs = createVirtualFileSystem(fixtures.simpleProject);
 *
 * // Use sample content
 * const tsContent = fixtures.files.typescript.simple;
 * ```
 */

import type { VirtualFileSystemTree } from './fsMock.js';

/**
 * Sample file contents for different file types
 */
export const fileContents = {
  typescript: {
    simple: `export const hello = 'world';
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`,
    withClass: `export class UserService {
  private users: Map<string, User> = new Map();

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createUser(data: CreateUserInput): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }
}

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

interface CreateUserInput {
  name: string;
  email: string;
}
`,
    withImports: `import { readFile } from 'fs/promises';
import path from 'path';
import { UserService } from './services/userService';
import type { Config } from '../types';

export async function loadConfig(configPath: string): Promise<Config> {
  const content = await readFile(configPath, 'utf-8');
  return JSON.parse(content);
}
`,
  },
  javascript: {
    simple: `const hello = 'world';
function greet(name) {
  return \`Hello, \${name}!\`;
}
module.exports = { hello, greet };
`,
  },
  json: {
    packageJson: `{
  "name": "test-project",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "express": "^4.18.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
`,
    tsconfig: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`,
  },
  markdown: {
    readme: `# Test Project

A sample project for testing.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`typescript
import { hello } from 'test-project';
console.log(hello);
\`\`\`
`,
  },
};

/**
 * Pre-built virtual file system trees
 */
export const fileTrees = {
  /**
   * Simple project with src, tests, and config files
   */
  simpleProject: {
    '/workspace': {
      type: 'directory',
      children: {
        src: {
          type: 'directory',
          children: {
            'index.ts': {
              type: 'file',
              content: fileContents.typescript.simple,
              size: fileContents.typescript.simple.length,
              mtime: new Date('2024-01-15'),
            },
            utils: {
              type: 'directory',
              children: {
                'helper.ts': {
                  type: 'file',
                  content: fileContents.typescript.withImports,
                  size: fileContents.typescript.withImports.length,
                  mtime: new Date('2024-01-14'),
                },
              },
            },
            services: {
              type: 'directory',
              children: {
                'userService.ts': {
                  type: 'file',
                  content: fileContents.typescript.withClass,
                  size: fileContents.typescript.withClass.length,
                  mtime: new Date('2024-01-13'),
                },
              },
            },
          },
        },
        tests: {
          type: 'directory',
          children: {
            'index.test.ts': {
              type: 'file',
              content:
                'import { hello } from "../src";\ntest("hello", () => expect(hello).toBe("world"));',
              size: 80,
              mtime: new Date('2024-01-12'),
            },
          },
        },
        'package.json': {
          type: 'file',
          content: fileContents.json.packageJson,
          size: fileContents.json.packageJson.length,
          mtime: new Date('2024-01-10'),
        },
        'tsconfig.json': {
          type: 'file',
          content: fileContents.json.tsconfig,
          size: fileContents.json.tsconfig.length,
          mtime: new Date('2024-01-10'),
        },
        'README.md': {
          type: 'file',
          content: fileContents.markdown.readme,
          size: fileContents.markdown.readme.length,
          mtime: new Date('2024-01-10'),
        },
      },
    },
  } as VirtualFileSystemTree,

  /**
   * Large project with many files (for pagination testing)
   */
  largeProject: (() => {
    const children: Record<
      string,
      { type: 'file'; content: string; size: number }
    > = {};
    for (let i = 1; i <= 150; i++) {
      children[`file${i.toString().padStart(3, '0')}.ts`] = {
        type: 'file',
        content: `// File ${i}\nexport const value${i} = ${i};`,
        size: 40,
      };
    }
    return {
      '/workspace': {
        type: 'directory',
        children: {
          src: {
            type: 'directory',
            children,
          },
        },
      },
    } as VirtualFileSystemTree;
  })(),

  /**
   * Project with symlinks
   */
  projectWithSymlinks: {
    '/workspace': {
      type: 'directory',
      children: {
        src: {
          type: 'directory',
          children: {
            'index.ts': {
              type: 'file',
              content: 'export {}',
              size: 10,
            },
          },
        },
        'link-to-src': {
          type: 'symlink',
          target: '/workspace/src',
        },
        'dangerous-link': {
          type: 'symlink',
          target: '/etc/passwd',
        },
      },
    },
  } as VirtualFileSystemTree,

  /**
   * Empty directory
   */
  emptyProject: {
    '/workspace': {
      type: 'directory',
      children: {},
    },
  } as VirtualFileSystemTree,

  /**
   * Deep nested structure
   */
  deepProject: {
    '/workspace': {
      type: 'directory',
      children: {
        level1: {
          type: 'directory',
          children: {
            level2: {
              type: 'directory',
              children: {
                level3: {
                  type: 'directory',
                  children: {
                    level4: {
                      type: 'directory',
                      children: {
                        level5: {
                          type: 'directory',
                          children: {
                            'deep-file.ts': {
                              type: 'file',
                              content: 'export const deep = true;',
                              size: 25,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  } as VirtualFileSystemTree,
};

/**
 * Query fixtures for testing tool inputs
 */
export const queries = {
  viewStructure: {
    simple: {
      path: '/workspace',
    },
    withDepth: {
      path: '/workspace',
      depth: 2,
    },
    withPagination: {
      path: '/workspace',
      entriesPerPage: 10,
      entryPageNumber: 1,
    },
    withResearchGoals: {
      path: '/workspace',
      researchGoal: 'Explore project structure',
      reasoning: 'Need to understand file organization',
    },
  },
  ripgrep: {
    simple: {
      pattern: 'export',
      path: '/workspace',
    },
    filesOnly: {
      pattern: 'function',
      path: '/workspace',
      filesOnly: true,
    },
    withType: {
      pattern: 'import',
      path: '/workspace',
      type: 'ts',
    },
    withContext: {
      pattern: 'class',
      path: '/workspace',
      contextLines: 3,
    },
  },
  findFiles: {
    simple: {
      path: '/workspace',
      name: '*.ts',
    },
    withDepth: {
      path: '/workspace',
      name: '*.ts',
      maxDepth: 2,
    },
    filesOnly: {
      path: '/workspace',
      type: 'f' as const,
    },
  },
  fetchContent: {
    fullContent: {
      path: '/workspace/src/index.ts',
      fullContent: true,
    },
    withMatch: {
      path: '/workspace/src/index.ts',
      matchString: 'export',
      matchStringContextLines: 2,
    },
    withPagination: {
      path: '/workspace/src/index.ts',
      charLength: 100,
      charOffset: 0,
    },
  },
};

/**
 * All fixtures combined for easy import
 */
export const fixtures = {
  files: fileContents,
  trees: fileTrees,
  queries,
};

export type TestFixtures = typeof fixtures;
