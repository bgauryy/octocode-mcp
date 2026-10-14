#!/usr/bin/env node
// Development replay: vary verification context around frozen model selections.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hermeticEnv } from '../../../../test-utils/hermetic-env.ts';
import { invoke, mergeRanges, sourceCoverage } from './jev_question_poc.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const input = process.argv[2], destination = process.argv[3];
if (!input || !destination) throw new Error('Usage: jev_read_expansion_poc.mjs <frozen-run.json> <new-output-directory>');
const source = JSON.parse(await fs.readFile(input));
const out = path.resolve(destination);
await fs.mkdir(path.dirname(out), {recursive:true}); await fs.mkdir(out);
const env = hermeticEnv(process.env, 'jev-read-expansion');
const run = {version:1,split:'development',sourceRun:path.resolve(input),sourceRunHash:hash(await fs.readFile(input)),
  harnessHash:hash(await fs.readFile(fileURLToPath(import.meta.url))),
  exposure:'Chosen after observing narrow-window failures in the source run. Same cases and judgments; not validation or held-out evidence.',
  policy:'Replay both atomic Locate policies with 0, 8, or 16 lines around each selected range. Clamp to file, union overlap/adjacency, read once with the recorded snapshot. No gold-dependent expansion or stopping.',
  provider:'No new provider calls. Each modeled workflow still includes its original classification response and provider cost.',
  rows:[],errors:[]};
const save=()=>fs.writeFile(path.join(out,'run.json'),JSON.stringify(run,null,2),{mode:0o600});
await save();
try {
  for (const row of source.rows.filter(row=>row.lane==='selection'&&['locate-atomic','locate-atomic-evidence'].includes(row.arm))) {
    if(row.error) throw new Error('Cannot replay failed selection');
    const item=source.suite.locate.find(item=>item.id===row.case);
    const classification=row.responses.filter(response=>response.tool==='clasify');
    const file=classification[0].input.queries[0].resources[0].query.path;
    if(hash(await fs.readFile(file))!==hash(item.source)) throw new Error('Source snapshot changed');
    const totalLines=item.source.match(/[^\n]*\n|[^\n]+$/g).length;
    const fixture=path.dirname(file);
    const localEnv={...env,WORKSPACE_ROOT:fixture,ALLOWED_PATHS:fixture,OCTOCODE_ENABLE_LOCAL:'true',OCTOCODE_ENABLE_STATS:'false',OCTOCODE_OUTPUT_DEFAULT_CHAR_LENGTH:'20000',DISABLE_TOOLS:'',TOOLS_TO_RUN:''};
    for(const surrounding of [0,8,16]) {
      const record={case:row.case,arm:row.arm,surrounding,responses:[...classification],inheritedProviderCalls:row.providerCalls};
      try {
        record.ranges=mergeRanges(row.ranges.map(([start,end])=>[Math.max(1,start-surrounding),Math.min(totalLines,end+surrounding)]));
        if(surrounding===0) record.responses=[...row.responses];
        else if(record.ranges.length) {
          const query={path:file,snapshot:row.snapshot,ranges:record.ranges.map(range=>range.join('-')),minify:'none'};
          const response=await invoke('localFetch',{queries:[query]},fixture,localEnv);
          record.responses.push(response);
          if(response.code!==0||response.json?.results?.some(row=>row.status==='error'||row.data?.next)) throw new Error('Expanded read failed or remained paged');
        }
        record.coverage=sourceCoverage(record.responses,item);
      } catch(error) {record.error=error.message;}
      run.rows.push(record); await save();
    }
  }
} catch(error) {run.errors.push(error.message);}
finally {await fs.rm(env.OCTOCODE_HOME,{recursive:true,force:true}); await save();}
console.log(JSON.stringify({out,rows:run.rows.length,errors:run.errors,failed:run.rows.filter(row=>row.error).length,newProviderCalls:0}));
if(run.errors.length||run.rows.some(row=>row.error)) process.exitCode=1;
