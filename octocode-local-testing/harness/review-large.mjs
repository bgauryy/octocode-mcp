// LIVE: a >100-file PR (microsoft/TypeScript#51387): inventory pages, a late
// file's patch and its patch windows, proven against GitHub's REST files API
// (an independent, unauthenticated oracle). Includes the former
// review-large-patch.mjs walk, now started from this run's own read.
import {startServer,rowData,nextHints,checks,writeResults,inventoryRows,rawPatch,patchNumbersOk} from './mcp-client.mjs';
const c=await startServer();const {check,summary}=checks('review-large');const calls=[];
const q={operation:'pullRequest',owner:'microsoft',repo:'TypeScript',number:51387};
async function run(label,args,hint){const e=hint?await c.follow(hint):await c.call('ghGetHistoryItem',args);calls.push({...e,label,bytes:Buffer.byteLength(e.text)});check(label+' succeeds',!e.isError&&!e.rowErrors);return e}
try {
 const meta=rowData(await run('metadata',q));const m=meta.pullRequests[0];
 check('fixture exceeds 100 changed files',m.changedFilesCount>100,m.changedFilesCount);
 check('metadata excludes changed-file bodies',!m.files);
 // PR leads ride the row's one capped `hints` list, never a list nested in the PR (pull_request.rs; runtime_github.rs asserts data.hints.readFiles).
 check('metadata offers file inventory',!!meta.hints?.readFiles);
 let e=await run('inventory page 1',{...q,sections:['files'],pageSize:100});let files=[];let pages=0;
 for(;e&&pages<40;pages++){
  const pr=rowData(e)?.pullRequests?.[0];
  check('page '+(pages+1)+' has file metadata',Array.isArray(pr?.files)&&pr.files.length>0);
  check('page '+(pages+1)+' excludes patches',inventoryRows(pr?.files).every(f=>f.path&&!Object.hasOwn(f,'patch')));
  check('page '+(pages+1)+' preserves head SHA',pr?.headSha===m.headSha);
  files.push(...inventoryRows(pr?.files));
  const next=nextHints(e.sc).find(h=>h.path.endsWith('.next.nextFilePage'));
  e=next?await run('inventory page '+(pages+2),null,next):null;
 }
 check('inventory terminates',!e);
 check('all changed files returned exactly once',files.length===m.changedFilesCount&&new Set(files.map(f=>f.path)).size===m.changedFilesCount,files.length);
 const chosen=files[110];let selectedEntry=null;
 if(chosen){selectedEntry=await run('selected patch beyond file 100',{...q,sections:['patches'],include:[chosen.path],minify:'none'});const selected=rowData(selectedEntry).pullRequests[0];
 check('selection finds requested late file only',selected.files?.length===1&&selected.files[0].path===chosen.path,chosen.path);
 check('selected patch or explicit unavailability',typeof selected.files?.[0]?.patch==='string'||!!selected.files?.[0]?.patchUnavailable);
 }
 const apiFiles=[];
 for(let page=1;page<=Math.ceil(m.changedFilesCount/100);page++){
 const res=await fetch(`https://api.github.com/repos/microsoft/TypeScript/pulls/51387/files?per_page=100&page=${page}`,{headers:{'User-Agent':'octocode-review-audit'}});
 if(!res.ok)throw Error('independent GitHub files oracle HTTP '+res.status);
 apiFiles.push(...await res.json());
 }
 // An `omitted` row (no counts) must be a file GitHub sent with 0/0 and no patch; every other row's counts equal the API's.
 const statsMatch=(row,f)=>row.patchUnavailable==='omitted'?row.additions===undefined&&f.additions===0&&f.deletions===0&&!Object.hasOwn(f,'patch'):row.additions===f.additions&&row.deletions===f.deletions;
 check('inventory paths and stats equal independent API',apiFiles.length===files.length&&apiFiles.every((f,i)=>files[i].path===f.filename&&statsMatch(files[i],f)),files.filter(r=>r.patchUnavailable==='omitted').length+' omitted');
 // Patch windows of the late file: each starts at the accumulated offset, every unfinished window continues, the walk ends.
 let w=selectedEntry,patch='',windows=0;
 while(w&&windows<20){windows++;const f=rowData(w)?.pullRequests?.[0]?.files?.[0];check('patch window '+windows+' starts at accumulated offset',(f?.patchPagination?.offset??0)===patch.length,f?.patchPagination?.offset);patch+=f?.patch??'';
  const hints=nextHints(w.sc);const next=hints.find(h=>/patch/i.test(h.path)&&(h.query?.offset>0||h.query?.queries?.[0]?.offset>0));
  if(f?.patchPagination?.hasMore)check('unfinished window '+windows+' has executable continuation',!!next);
  w=next?await run('patch window '+(windows+1),null,next):null;}
 check('patch pagination terminates',!w,windows+' windows');
 const api=apiFiles.find(f=>f.filename===chosen?.path);
 check('late file has an independent API patch',typeof api?.patch==='string',chosen?.path);
 check('assembled raw patch exactly equals independent API',rawPatch(patch)===api?.patch,'chars '+patch.length);
 check('assembled patch numbers every line on its side (new for +/space, old for -)',patchNumbersOk(patch));
} catch(error){check('audit completes',false,error.stack)} finally {const result=summary();writeResults('review-large',{at:new Date().toISOString(),...result,calls});console.table(calls.map(({label,ms,bytes})=>({label,ms,bytes})));c.close();process.exitCode=result.failed.length?1:0;}
