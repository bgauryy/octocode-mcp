import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageSkills } from '../../octocode/scripts/stage-skills.mjs';

export const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..'
);
export const repoRoot = resolve(packageRoot, '../..');
export const readJson = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

export function build() {
  const pkg = readJson(join(packageRoot, 'package.json'));
  const mcp = readJson(join(repoRoot, 'packages/octocode-mcp/package.json'));
  const cli = readJson(join(repoRoot, 'packages/octocode/package.json'));
  const manifest = readJson(join(packageRoot, 'src/plugin.json'));
  const skills = join(packageRoot, 'skills');
  stageSkills(join(repoRoot, 'skills'), skills);
  // A collection README is not an installed skill and contains repository-only links.
  for (const entry of readdirSync(skills, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !existsSync(join(skills, entry.name, 'SKILL.md'))
    ) {
      rmSync(join(skills, entry.name), { recursive: true, force: true });
    }
  }
  cpSync(join(packageRoot, 'src/skills'), skills, { recursive: true });
  const onboarding = join(skills, 'octocode-get-started/SKILL.md');
  writeFileSync(
    onboarding,
    readFileSync(onboarding, 'utf8')
      .replaceAll('{{CLI_VERSION}}', cli.version)
      .replaceAll('{{NODE_RANGE}}', cli.engines.node)
  );
  writeJson(join(packageRoot, 'plugin.json'), {
    ...manifest,
    version: pkg.version,
  });
  writeJson(join(packageRoot, 'mcp.json'), {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: {
      octocode: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', `octocode-mcp@${mcp.version}`],
      },
    },
  });
  mkdirSync(join(packageRoot, 'assets'), { recursive: true });
  cpSync(
    join(repoRoot, 'assets/logo.png'),
    join(packageRoot, 'assets/logo.png')
  );
  cpSync(join(repoRoot, 'LICENSE'), join(packageRoot, 'LICENSE'));
  const count = readdirSync(skills).filter(name =>
    existsSync(join(skills, name, 'SKILL.md'))
  ).length;
  console.log(
    `Built Octocode plugin ${pkg.version}: ${count} skills; MCP ${mcp.version}.`
  );
}

// argv[1] keeps a symlinked path while import.meta.url is the real path.
const realOrSelf = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};
if (
  process.argv[1] &&
  realOrSelf(process.argv[1]) === realOrSelf(fileURLToPath(import.meta.url))
)
  build();
