import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageSkills } from '../../octocode/scripts/stage-skills.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(process.argv[2]);
const staged = join(output, 'skills');
stageSkills(join(repository, 'skills'), staged);

// Rust raw strings accept paths from every build host without JSON escape rules.
function literal(value) {
  let hashes = '#';
  while (value.includes(`"${hashes}`)) hashes += '#';
  return `r${hashes}"${value}"${hashes}`;
}
function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1).flatMap(entry => {
    const path = join(directory, entry.name);
    const relative = prefix + entry.name;
    if (entry.isDirectory()) return files(path, `${relative}/`);
    if (!entry.isFile()) throw new Error(`Unsupported skill entry: ${path}`);
    return [`EmbeddedFile { path: ${literal(relative)}, bytes: include_bytes!(${literal(path)}), executable: ${(statSync(path).mode & 0o111) !== 0} }`];
  });
}
const skills = readdirSync(staged, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name < b.name ? -1 : 1).map(entry => {
  const directory = join(staged, entry.name);
  if (!statSync(join(directory, 'SKILL.md')).isFile()) throw new Error(`Missing SKILL.md: ${entry.name}`);
  return `EmbeddedSkill { name: ${literal(entry.name)}, instructions: include_str!(${literal(join(directory, 'SKILL.md'))}), files: &[${files(directory).join(',\n')}] }`;
});
if (!skills.length) throw new Error('The public skill bundle is empty');
writeFileSync(join(output, 'skills.rs'), `pub(super) static SKILLS: &[EmbeddedSkill] = &[${skills.join(',\n')}];\n`);
