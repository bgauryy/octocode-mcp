import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync,cpSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
export function filesIn(directory) {
  return readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry => {
    const filename = path.join(directory,entry.name);
    return entry.isDirectory()?filesIn(filename):[filename];
  });
}
export const sha = filename => createHash('sha256').update(readFileSync(filename)).digest('hex');
export function verify(root) {
  const frozen = JSON.parse(readFileSync(path.join(root,'freeze.json'),'utf8'));
  const failures = frozen.files.filter(file => sha(file.path)!==file.sha256);
  if (failures.length) throw Error(`Frozen input changed: ${failures.map(f=>f.path).join(', ')}`);
  return frozen;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(process.argv[2] ?? '.octocode/octocode-eval-benchmark/artifact-search-v2');
  const frozenSource = path.join(root,'harness');
  if (existsSync(frozenSource) || existsSync(path.join(root,'freeze.json'))) throw Error('Refusing to replace an existing frozen harness; choose a new artifact root');
  cpSync(sourceRoot,frozenSource,{recursive:true});
  const protocol = path.join(root,'protocol.json');
  const filenames = [...filesIn(frozenSource),...filesIn(path.join(root,'baseline')),...filesIn(path.join(root,'candidate')),
    ...(existsSync(protocol)?[protocol]:[])];
  const frozen = {version:2,createdAt:new Date().toISOString(),suite:'Fresh authored prospective heldout diagnostic; reviewer knows prior failure categories',
    contract:{primary:'Joint first-action semantic + schema + transport + sensor success',target:0.95,
      guards:['No unnecessary calls','Zero sensor failures','No matched-case semantic regression','Report first-action and repaired results separately'],
      limits:'Single model and seed; diagnostic coverage, not a population reliability claim'},
    files:filenames.map(filename=>({path:filename,sha256:sha(filename)}))};
  writeFileSync(path.join(root,'freeze.json'),JSON.stringify(frozen,null,2),{flag:'wx'});
  console.log(JSON.stringify({frozenFiles:filenames.length,path:path.join(root,'freeze.json')}));
}
