#!/usr/bin/env node
import*as e from"path";import*as t from"fs";import{Node as n,Project as r,SyntaxKind as i}from"ts-morph";function a(e,t,n=``){if(typeof e==`string`){e.startsWith(`!`)||t.add(e);return}if(Array.isArray(e)){for(let r of e)a(r,t,n);return}if(typeof e==`object`&&e)for(let[n,r]of Object.entries(e))r===null?t.add(`!${n}`):typeof r==`string`?t.add(r):typeof r==`object`&&a(r,t,n)}function o(e){let t=new Set,n=new Map,r=new Map;if(e.main&&t.add(e.main),e.module&&t.add(e.module),e.types&&t.add(e.types),e.typings&&t.add(e.typings),e.bin)if(typeof e.bin==`string`)t.add(e.bin),r.set(e.name||`default`,e.bin);else for(let[n,i]of Object.entries(e.bin))t.add(i),r.set(n,i);if(e.exports){let r=new Set;a(e.exports,r);for(let i of r)if(!i.startsWith(`!`)&&(t.add(i),typeof e.exports==`object`&&!Array.isArray(e.exports)))for(let[t,r]of Object.entries(e.exports))(r===i||typeof r==`object`&&JSON.stringify(r).includes(i))&&n.set(t,i)}return{main:e.main,module:e.module,types:e.types||e.typings,exports:n.size>0?n:void 0,bin:r.size>0?r:void 0,all:t}}function s(e){let t=Object.keys(e.dependencies||{}),n=Object.keys(e.devDependencies||{}),r=Object.keys(e.peerDependencies||{});return{production:t,development:n,peer:r,all:new Set([...t,...n,...r])}}function c(e){if(e.workspaces){if(Array.isArray(e.workspaces))return e.workspaces;if(e.workspaces.packages)return e.workspaces.packages}}function l(e){if(e.repository)return typeof e.repository==`string`?e.repository:e.repository.url}async function u(n){let r=await t.promises.readFile(n,`utf-8`),i=JSON.parse(r);return{name:i.name||e.basename(e.dirname(n)),version:i.version||`0.0.0`,description:i.description,entryPoints:o(i),dependencies:s(i),scripts:i.scripts||{},workspaces:c(i),repository:l(i),keywords:i.keywords||[]}}async function d(n){let r=e.join(n,`package.json`);if(!t.existsSync(r))return!1;try{let e=await t.promises.readFile(r,`utf-8`);return!!JSON.parse(e).workspaces}catch{return!1}}function f(t,n){let r=t.startsWith(`./`)?t.slice(2):t;return e.join(n,r)}function p(e,t,n,r){let i={path:e,conditions:[]};if(typeof t==`string`){let e=f(t,r);n.add(e),i.conditions.push({condition:`default`,target:t,resolved:e})}else if(Array.isArray(t)){for(let e of t)if(typeof e==`string`){let t=f(e,r);n.add(t),i.conditions.push({condition:`default`,target:e,resolved:t});break}}else if(typeof t==`object`&&t){for(let[a,o]of Object.entries(t))if(o!==null){if(typeof o==`string`){let e=f(o,r);n.add(e),i.conditions.push({condition:a,target:o,resolved:e})}else if(typeof o==`object`){let t=p(e,o,n,r);i.conditions.push(...t.conditions)}}}return i}function m(t,n,r){let i=t.exports,a=r?new Set(r.keys()):new Set;if(!i)return{paths:[],wildcards:[],internalOnly:[...a]};let o={paths:[],wildcards:[],internalOnly:[]},s=new Set;if(typeof i==`string`)o.paths.push(p(`.`,i,s,n));else if(typeof i==`object`&&!Array.isArray(i)){for(let[e,t]of Object.entries(i))if(t!==null){if(e.includes(`*`)){o.wildcards.push(e);continue}o.paths.push(p(e,t,s,n))}}if(r){for(let t of r.keys())if(![...s].some(n=>{let r=e.normalize(n),i=e.normalize(t);return i===r||i.replace(/\.(ts|tsx)$/,`.js`)===r||i.replace(/\.(ts|tsx)$/,`.d.ts`)===r})){let e=r.get(t);e&&o.internalOnly.push(e.relativePath)}}return o}function h(e){if(n.isFunctionDeclaration(e)||n.isFunctionExpression(e))return`function`;if(n.isClassDeclaration(e)||n.isClassExpression(e))return`class`;if(n.isInterfaceDeclaration(e))return`interface`;if(n.isTypeAliasDeclaration(e))return`type`;if(n.isEnumDeclaration(e))return`enum`;if(n.isVariableDeclaration(e)){let t=e.getInitializer();if(t&&(n.isArrowFunction(t)||n.isFunctionExpression(t)))return`function`;let r=e.getParent()?.getParent();return n.isVariableStatement(r)&&r.getDeclarationKind()===`const`?`const`:`variable`}return`unknown`}function g(e){let t=e.getSourceFile(),n=e.getStart(),{line:r,column:i}=t.getLineAndColumnAtPos(n);return{line:r,column:i}}function _(e){let t=[];for(let n of e.getMethods())t.push({name:n.getName(),type:`function`,isPrivate:n.hasModifier(i.PrivateKeyword),isStatic:n.hasModifier(i.StaticKeyword),signature:n.getSignature()?.getDeclaration().getText()});for(let n of e.getProperties())t.push({name:n.getName(),type:`variable`,isPrivate:n.hasModifier(i.PrivateKeyword),isStatic:n.hasModifier(i.StaticKeyword)});for(let n of e.getGetAccessors())t.push({name:n.getName(),type:`function`,isPrivate:n.hasModifier(i.PrivateKeyword),isStatic:n.hasModifier(i.StaticKeyword)});return t}function v(e){return e.getMembers().map(e=>({name:e.getName(),type:`const`,isPrivate:!1,isStatic:!0}))}function y(e){if(n.isJSDocable(e)){let t=e.getJsDocs();if(t.length>0)return t[0].getDescription()}}function b(e){if(n.isFunctionDeclaration(e))return`(${e.getParameters().map(e=>e.getText()).join(`, `)}) => ${e.getReturnType().getText()}`;if(n.isClassDeclaration(e))return e.getName()||`class`;if(n.isInterfaceDeclaration(e))return e.getName();if(n.isTypeAliasDeclaration(e))return e.getType().getText()}function x(e,t){let r=new Map,i=new Set,a=new Set;for(let t of e.getImportDeclarations()){let e=t.getModuleSpecifierValue(),n=!e.startsWith(`.`)&&!e.startsWith(`/`),o=g(t),s=t.isTypeOnly();if(n){let t=e.startsWith(`@`)?e.split(`/`).slice(0,2).join(`/`):e.split(`/`)[0];i.add(t)}else{let n=t.getModuleSpecifierSourceFile();if(n){let i=n.getFilePath(),a=[],c=t.getDefaultImport();c&&a.push(c.getText());for(let e of t.getNamedImports())a.push(e.getName());let l=t.getNamespaceImport();l&&a.push(`* as ${l.getText()}`);let u={specifier:e,resolvedPath:i,identifiers:a,isTypeOnly:s,isDynamic:!1,position:o},d=r.get(i)||[];d.push(u),r.set(i,d)}else a.add(e)}}return e.forEachDescendant(e=>{if(n.isCallExpression(e)&&e.getExpression().getText()===`import`){let t=e.getArguments();if(t.length>0&&n.isStringLiteral(t[0])){let e=t[0].getLiteralText();if(!e.startsWith(`.`)&&!e.startsWith(`/`)){let t=e.startsWith(`@`)?e.split(`/`).slice(0,2).join(`/`):e.split(`/`)[0];i.add(t)}}}if(n.isCallExpression(e)){let t=e.getExpression();if(n.isIdentifier(t)&&t.getText()===`require`){let t=e.getArguments();if(t.length>0&&n.isStringLiteral(t[0])){let e=t[0].getLiteralText();if(!e.startsWith(`.`)&&!e.startsWith(`/`)){let t=e.startsWith(`@`)?e.split(`/`).slice(0,2).join(`/`):e.split(`/`)[0];i.add(t)}}}}}),{internal:r,external:i,unresolved:a}}function S(e){let t=[],r=e.getExportedDeclarations();for(let[i,a]of r)for(let r of a){let a={name:i,type:h(r),isDefault:i===`default`,isReExport:r.getSourceFile()!==e,jsDoc:y(r),signature:b(r),position:g(r)};n.isClassDeclaration(r)?a.members=_(r):n.isEnumDeclaration(r)&&(a.members=v(r)),t.push(a)}return t}function ee(t,n,r){let i=t.toLowerCase(),a=e.basename(t).toLowerCase();return r?`entry`:a.includes(`.config.`)||a.includes(`rc.`)||a===`tsconfig.json`||a===`jest.config.ts`||a===`vitest.config.ts`?`config`:a.includes(`.test.`)||a.includes(`.spec.`)||i.includes(`__tests__`)||i.includes(`/test/`)||i.includes(`/tests/`)?`test`:a.endsWith(`.d.ts`)||i.includes(`/types/`)?`type`:(a===`index.ts`||a===`index.js`)&&n.filter(e=>e.isReExport).length>n.length*.5?`barrel`:i.includes(`/utils/`)||i.includes(`/util/`)||i.includes(`/helpers/`)||i.includes(`/lib/`)?`util`:i.includes(`/components/`)||a.endsWith(`.tsx`)||a.endsWith(`.vue`)?`component`:i.includes(`/services/`)||i.includes(`/service/`)||a.includes(`service.`)?`service`:`unknown`}async function C(t){let{rootPath:n,tsConfigPath:i,extensions:a=[`.ts`,`.tsx`,`.js`,`.jsx`],excludePatterns:o=[`**/node_modules/**`,`**/dist/**`,`**/build/**`],includeTests:s=!1}=t,c={skipAddingFilesFromTsConfig:!0},l=i||e.join(n,`tsconfig.json`);try{await import(`fs`).then(e=>{e.existsSync(l)&&(c.tsConfigFilePath=l)})}catch{}let u=new r(c),d=a.map(e=>`${n}/**/*${e}`),f=[...o];s||f.push(`**/*.test.*`,`**/*.spec.*`,`**/__tests__/**`),u.addSourceFilesAtPaths(d);for(let e of u.getSourceFiles()){let t=e.getFilePath(),n=f.some(e=>new RegExp(e.replace(/\./g,`\\.`).replace(/\*\*/g,`.*`).replace(/\*/g,`[^/]*`)).test(t)),r=t.includes(`/node_modules/`)||t.includes(`\\node_modules\\`);(n||r)&&u.removeSourceFile(e)}let p=new Map;for(let t of u.getSourceFiles()){let r=t.getFilePath(),i=e.relative(n,r),a=x(t,n),o=S(t),s={path:r,relativePath:i,imports:a,exports:o,importedBy:new Set,scripts:new Set,role:ee(r,o,!1)};p.set(r,s)}for(let[e,t]of p)for(let n of t.imports.internal.keys()){let t=p.get(n);t&&t.importedBy.add(e)}return p}function w(t,n,r){for(let i of n){let n=e.isAbsolute(i)?i:e.resolve(r,i),a=[n,n+`.ts`,n+`.tsx`,n+`.js`,n+`.jsx`,e.join(n,`index.ts`),e.join(n,`index.tsx`),e.join(n,`index.js`),e.join(n,`index.jsx`)];for(let e of a){let n=t.get(e);if(n){n.role=`entry`;break}}}}function T(e,t,n,r=new Set){let i={definedIn:t,exportType:`named`,reExportChain:[],publicFrom:[],conditions:[]};if(r.has(t))return i;r.add(t);let a=e.get(t);if(!a)return i;let o=a.exports.find(e=>e.name===n);if(!o)return i;if(!o.isReExport)return{definedIn:t,exportType:o.isDefault?`default`:`named`,reExportChain:[],publicFrom:[],conditions:[]};for(let[t,i]of a.imports.internal)for(let o of i){let i=o.identifiers.some(e=>e.startsWith(`* as `));if(o.identifiers.includes(n)||i){let i=T(e,t,n,r);return{...i,reExportChain:[a.relativePath,...i.reExportChain]}}}return i}function E(e,t){let n=new Map,r=new Set;for(let[n,i]of e)(i.role===`entry`||t.has(n))&&r.add(n);for(let t of r){let r=e.get(t);if(r)for(let i of r.exports){let a=`${i.name}`;if(n.has(a)){let e=n.get(a);e.publicFrom.includes(r.relativePath)||e.publicFrom.push(r.relativePath)}else{let o=T(e,t,i.name);o.publicFrom.push(r.relativePath),n.set(a,o)}}}return n}function D(e){let t=[];for(let[n,r]of e)for(let[n,i]of r.imports.internal){let a=i.flatMap(e=>e.identifiers);t.push({from:r.relativePath,to:e.get(n)?.relativePath||n,importCount:i.length,identifiers:a})}return t}function O(e,t){let n=new Map;for(let[t,r]of e)for(let e of r.imports.external)n.has(e)||n.set(e,new Set),n.get(e).add(r.relativePath);let r=[];for(let[i,a]of n)r.push({name:i,usedBy:Array.from(a),isDeclared:t.all.has(i),isDevOnly:k(i,a,e)});return r}function k(e,t,n){for(let e of t){let t=Array.from(n.values()).find(t=>t.relativePath===e);if(t&&t.role!==`test`&&t.role!==`config`)return!1}return!0}function A(e,t){let n=new Set,r=new Set,i=new Set;for(let[t,a]of e)for(let e of a.imports.external)n.add(e),a.role===`test`?r.add(e):i.add(e);let a=[];for(let e of t.production)n.has(e)||a.push(e);for(let e of t.development)n.has(e)||a.push(e);let o=[];for(let e of n)t.all.has(e)||te(e)||o.push(e);let s=[];for(let e of t.production)r.has(e)&&!i.has(e)&&s.push(e);return{declared:{production:t.production,development:t.development,peer:t.peer},used:{production:Array.from(i),development:Array.from(r)},unused:a,unlisted:o,misplaced:s}}function te(e){let t=new Set(`assert.async_hooks.buffer.child_process.cluster.console.constants.crypto.dgram.dns.domain.events.fs.http.http2.https.inspector.module.net.os.path.perf_hooks.process.punycode.querystring.readline.repl.stream.string_decoder.timers.tls.trace_events.tty.url.util.v8.vm.wasi.worker_threads.zlib`.split(`.`)),n=e.startsWith(`node:`)?e.slice(5):e;return t.has(n)}function j(e){let t=[],n=new Set,r=new Set,i=[];function a(o){n.add(o),r.add(o),i.push(o);let s=e.get(o);if(s){for(let o of s.imports.internal.keys())if(!n.has(o))a(o);else if(r.has(o)){let n=i.indexOf(o),r=i.slice(n).map(t=>e.get(t)?.relativePath||t);r.push(e.get(o)?.relativePath||o),t.push(r)}}i.pop(),r.delete(o)}for(let t of e.keys())n.has(t)||a(t);return t}function M(e,t){let n=[],r=new Map;for(let[t,n]of e)for(let[t,i]of n.imports.internal){r.has(t)||r.set(t,new Set);let n=r.get(t);for(let r of i)for(let i of r.identifiers)if(i.startsWith(`* as `)){let r=e.get(t);if(r)for(let e of r.exports)n.add(e.name)}else n.add(i)}for(let[i,a]of e){if(t.has(i)||a.role===`barrel`)continue;let e=r.get(i)||new Set;for(let t of a.exports)t.isReExport||!e.has(t.name)&&!e.has(`default`)&&n.push({file:a.relativePath,export:t.name,type:t.type})}return n}function N(e){let t=[];for(let[n,r]of e)r.role===`barrel`&&t.push(r.relativePath);return t}function P(e,t=10){return Array.from(e.values()).map(e=>({file:e.relativePath,importedByCount:e.importedBy.size})).filter(e=>e.importedByCount>0).sort((e,t)=>t.importedByCount-e.importedByCount).slice(0,t)}function F(e,t){let n=[];for(let[r,i]of e)i.importedBy.size===0&&!t.has(r)&&i.role!==`entry`&&i.role!==`test`&&i.role!==`config`&&n.push(i.relativePath);return n}function I(e){let t=[];for(let[n,r]of e)r.exports.length!==0&&(r.exports.some(e=>e.type!==`type`&&e.type!==`interface`&&!e.isReExport)||t.push(r.relativePath));return t}function L(e,t){return t.production.includes(e)?`production`:t.development.includes(e)?`development`:t.peer.includes(e)?`peer`:`unlisted`}function R(e,t){let n=new Map;for(let[r,i]of e)for(let e of i.imports.external){let r=n.get(e);r||(r={package:e,declaredAs:L(e,t),usageLocations:[],stats:{totalImports:0,uniqueSymbols:[],filesUsedIn:0,typeOnlyCount:0}},n.set(e,r));let a={file:i.relativePath,symbols:[],isNamespace:!1,isDefault:!1,isTypeOnly:!1,isDynamic:!1};r.usageLocations.push(a)}for(let[e,t]of n){let e=t.usageLocations.flatMap(e=>e.symbols);t.stats={totalImports:t.usageLocations.length,uniqueSymbols:[...new Set(e)],filesUsedIn:new Set(t.usageLocations.map(e=>e.file)).size,typeOnlyCount:t.usageLocations.filter(e=>e.isTypeOnly).length}}return n}const z=[{name:`presentation`,paths:[`**/components/**`,`**/pages/**`,`**/views/**`,`**/ui/**`],dependsOn:[`domain`,`infrastructure`,`shared`],description:`UI layer - components, pages, views`},{name:`domain`,paths:[`**/domain/**`,`**/models/**`,`**/entities/**`,`**/core/**`],dependsOn:[`shared`],description:`Business logic - domain models, entities`},{name:`infrastructure`,paths:[`**/services/**`,`**/api/**`,`**/repositories/**`,`**/adapters/**`],dependsOn:[`domain`,`shared`],description:`External services - APIs, repositories`},{name:`shared`,paths:[`**/utils/**`,`**/helpers/**`,`**/lib/**`,`**/types/**`,`**/common/**`],dependsOn:[],description:`Shared utilities - types, helpers`}];function B(e,t){let n=e.replace(/\\/g,`/`).toLowerCase(),r=t.replace(/\\/g,`/`).toLowerCase();return new RegExp(r.replace(/\*\*/g,`.*`).replace(/\*/g,`[^/]*`).replace(/\./g,`\\.`)).test(n)}function V(e){let t=[...e.values()].map(e=>e.relativePath.replace(/\\/g,`/`));if(t.some(e=>e.includes(`/packages/`)||e.includes(`/apps/`)))return`monorepo`;if(t.some(e=>e.includes(`/features/`)||e.includes(`/modules/`)))return`feature-based`;let n=t.some(e=>e.includes(`/components/`)),r=t.some(e=>e.includes(`/services/`)),i=t.some(e=>e.includes(`/utils/`));if(n&&(r||i))return`layered`;let a=t.filter(e=>e.startsWith(`src/`));return a.length>0&&Math.max(...a.map(e=>e.split(`/`).length))<=3?`flat`:`unknown`}function H(e,t){let n=t.map(e=>({...e,files:[]}));for(let[t,r]of e){let e=r.relativePath;for(let t of n)if(t.paths.some(t=>B(e,t))){t.files.push(e);break}}return n}function U(e,t){let n=[],r=new Map;for(let e of t)for(let t of e.files)r.set(t,e.name);let i=new Map;for(let e of t)i.set(e.name,new Set([e.name,...e.dependsOn]));for(let[t,a]of e){let t=r.get(a.relativePath);if(!t)continue;let o=i.get(t);if(o)for(let[i,s]of a.imports.internal){let s=e.get(i);if(!s)continue;let c=r.get(s.relativePath);c&&(o.has(c)||n.push({from:a.relativePath,to:s.relativePath,fromLayer:t,toLayer:c}))}}return n}function W(e){let t=V(e),n=H(e,z),r=U(e,n);for(let e of n)e.violatedBy=r.filter(t=>t.toLayer===e.name).map(e=>e.from);return{pattern:t,layers:n.filter(e=>e.files.length>0),violations:r}}function G(e,t,n){let r=[];for(let[t,n]of e)n.role===`entry`&&r.push({entryPoint:n.relativePath,exports:n.exports.filter(e=>!e.isReExport)});return r}function K(e,t){let n=0,r=0;for(let t of e.values())n+=t.imports.internal.size+t.imports.external.size,r+=t.exports.length;return{totalFiles:e.size,totalImports:n,totalExports:r,internalDependencies:D(e),externalDependencies:O(e,t.dependencies)}}function q(e,t){let n=[];for(let[r,i]of e)n.push({path:r,relativePath:i.relativePath,role:i.role,exportCount:i.exports.length,importCount:i.imports.internal.size,externalImportCount:i.imports.external.size,linesOfCode:0,isBarrel:i.role===`barrel`,isEntryPoint:t.has(r)||i.role===`entry`});return n}function J(e,t){let n=Array.from(e.values()).sort((e,t)=>t.exports.length-e.exports.length).slice(0,10).map(e=>e.relativePath);return{unusedExports:M(e,t),circularDependencies:j(e),barrelFiles:N(e),largestFiles:n,mostImported:P(e),orphanFiles:F(e,t),typeOnlyFiles:I(e)}}function Y(e,t,n,r,i,a){let o=new Set;for(let[t,n]of e)n.role===`entry`&&o.add(t);let s={version:`2.0.0`,generatedAt:new Date().toISOString(),repositoryPath:r,analysisType:`full`,duration:Date.now()-i},c=E(e,o),l=R(e,t.dependencies),u=W(e),d=a?m(a,r,e):void 0,f={};for(let[e,t]of c)f[e]=t;let p={};for(let[e,t]of l)p[e]=t;return{metadata:s,package:t,publicAPI:G(e,o,r),moduleGraph:K(e,t),dependencies:n,files:q(e,o),insights:J(e,o),exportFlows:f,dependencyUsage:p,architecture:u,exportsMap:d}}async function X(n,r){if(await t.promises.mkdir(r,{recursive:!0}),n.files.length>300){let i=Math.ceil(n.files.length/300);console.log(`📦 Splitting ${n.files.length} files into ${i} chunks...`);for(let a=0;a<i;a++){let i=n.files.slice(a*300,(a+1)*300),o=e.join(r,`static-analysis-files-${String(a).padStart(2,`0`)}.json`);await t.promises.writeFile(o,JSON.stringify(i,null,2),`utf-8`)}}let i=e.join(r,`analysis.json`);await t.promises.writeFile(i,JSON.stringify(n,null,2),`utf-8`);let a=e.join(r,`ANALYSIS_SUMMARY.md`);await t.promises.writeFile(a,Z(n),`utf-8`);let o=e.join(r,`PUBLIC_API.md`);await t.promises.writeFile(o,ne(n),`utf-8`);let s=e.join(r,`DEPENDENCIES.md`);await t.promises.writeFile(s,re(n),`utf-8`);let c=e.join(r,`INSIGHTS.md`);await t.promises.writeFile(c,ie(n),`utf-8`);let l=e.join(r,`MODULE_GRAPH.md`);if(await t.promises.writeFile(l,ae(n),`utf-8`),n.exportFlows){let i=e.join(r,`EXPORT_FLOWS.md`);await t.promises.writeFile(i,oe(n),`utf-8`)}if(n.architecture){let i=e.join(r,`ARCHITECTURE.md`);await t.promises.writeFile(i,se(n),`utf-8`)}if(n.dependencyUsage){let i=e.join(r,`DEPENDENCY_USAGE.md`);await t.promises.writeFile(i,Q(n),`utf-8`)}}function Z(e){let{metadata:t,package:n,moduleGraph:r,dependencies:i,insights:a}=e;return`# Repository Analysis: ${n.name}

> Generated: ${t.generatedAt}  
> Analysis Duration: ${t.duration}ms

## Overview

| Metric | Value |
|--------|-------|
| Package Name | ${n.name} |
| Version | ${n.version} |
| Total Files | ${r.totalFiles} |
| Total Exports | ${r.totalExports} |
| Total Internal Imports | ${r.internalDependencies.length} |
| External Dependencies | ${r.externalDependencies.length} |

## Description

${n.description||`_No description provided_`}

## Entry Points

${Array.from(n.entryPoints.all).map(e=>`- \`${e}\``).join(`
`)||`_No entry points found_`}

## Quick Stats

- **Unused Dependencies:** ${i.unused.length}
- **Unlisted Dependencies:** ${i.unlisted.length}
- **Circular Dependencies:** ${a.circularDependencies.length}
- **Unused Exports:** ${a.unusedExports.length}
- **Orphan Files:** ${a.orphanFiles.length}
- **Barrel Files:** ${a.barrelFiles.length}

## Scripts

${Object.entries(n.scripts).length>0?Object.entries(n.scripts).slice(0,10).map(([e,t])=>`- \`${e}\`: ${t.substring(0,50)}${t.length>50?`...`:``}`).join(`
`):`_No scripts defined_`}

---

*Generated by Octocode Documentation Writer*
`}function ne(e){let{publicAPI:t}=e,n=`# Public API Reference

> ${e.package.name}@${e.package.version}

`;if(t.length===0)return n+`_No public API exports found_
`;for(let e of t){if(n+=`## ${e.entryPoint}\n\n`,e.exports.length===0){n+=`_No exports_

`;continue}for(let t of e.exports){if(n+=`### \`${t.name}\`\n\n`,n+=`- **Type:** ${t.type}\n`,t.signature&&(n+=`- **Signature:** \`${t.signature}\`\n`),t.jsDoc&&(n+=`\n${t.jsDoc}\n`),t.members&&t.members.length>0){n+=`
**Members:**
`;for(let e of t.members)e.isPrivate||(n+=`- \`${e.name}\` (${e.type})${e.isStatic?` [static]`:``}\n`)}n+=`
`}}return n}function re(e){let{dependencies:t,moduleGraph:n}=e;return`# Dependencies

## Production Dependencies (${t.declared.production.length})

${t.declared.production.map(e=>`- ${e}`).join(`
`)||`_None_`}

## Development Dependencies (${t.declared.development.length})

${t.declared.development.map(e=>`- ${e}`).join(`
`)||`_None_`}

## Peer Dependencies (${t.declared.peer.length})

${t.declared.peer.map(e=>`- ${e}`).join(`
`)||`_None_`}

---

## Dependency Issues

### Unused Dependencies (${t.unused.length})

${t.unused.map(e=>`- ⚠️ ${e}`).join(`
`)||`✅ _No unused dependencies_`}

### Unlisted Dependencies (${t.unlisted.length})

${t.unlisted.map(e=>`- ❌ ${e}`).join(`
`)||`✅ _All dependencies are declared_`}

### Misplaced Dependencies (${t.misplaced.length})

${t.misplaced.map(e=>`- 📦 ${e} (should be devDependency)`).join(`
`)||`✅ _No misplaced dependencies_`}

---

## External Dependency Usage

| Package | Used By (files) |
|---------|-----------------|
${n.externalDependencies.slice(0,30).map(e=>`| ${e.name} | ${e.usedBy.length} |`).join(`
`)}

`}function ie(e){let{insights:t}=e;return`# Code Insights

## Summary

| Insight | Count |
|---------|-------|
| Unused Exports | ${t.unusedExports.length} |
| Circular Dependencies | ${t.circularDependencies.length} |
| Barrel Files | ${t.barrelFiles.length} |
| Orphan Files | ${t.orphanFiles.length} |
| Type-Only Files | ${t.typeOnlyFiles.length} |

---

## Circular Dependencies

${t.circularDependencies.length>0?t.circularDependencies.map((e,t)=>`### Cycle ${t+1}\n\n\`\`\`\n${e.join(` → `)}\n\`\`\``).join(`

`):`✅ _No circular dependencies detected_`}

---

## Unused Exports

${t.unusedExports.length>0?t.unusedExports.slice(0,50).map(e=>`- \`${e.export}\` in \`${e.file}\` (${e.type})`).join(`
`):`✅ _No unused exports detected_`}

${t.unusedExports.length>50?`\n_...and ${t.unusedExports.length-50} more_`:``}

---

## Most Imported Files

| File | Imported By |
|------|-------------|
${t.mostImported.map(e=>`| ${e.file} | ${e.importedByCount} files |`).join(`
`)}

---

## Barrel Files

${t.barrelFiles.length>0?t.barrelFiles.map(e=>`- ${e}`).join(`
`):`_No barrel files detected_`}

---

## Orphan Files

${t.orphanFiles.length>0?t.orphanFiles.map(e=>`- ${e}`).join(`
`):`✅ _No orphan files detected_`}

---

## Type-Only Files

${t.typeOnlyFiles.length>0?t.typeOnlyFiles.map(e=>`- ${e}`).join(`
`):`_No type-only files detected_`}

`}function ae(e){let{moduleGraph:t}=e,n=new Set(e.files.sort((e,t)=>t.importCount+t.exportCount-(e.importCount+e.exportCount)).slice(0,30).map(e=>e.relativePath)),r=t.internalDependencies.filter(e=>n.has(e.from)&&n.has(e.to)),i=`# Module Graph

## Dependency Graph (Top 30 Most Connected Files)

\`\`\`mermaid
graph TD
`,a=new Map,o=0;for(let e of n){let t=`N${o++}`;a.set(e,t);let n=e.split(`/`).slice(-2).join(`/`);i+=`    ${t}["${n}"]\n`}for(let e of r){let t=a.get(e.from),n=a.get(e.to);t&&n&&(i+=`    ${t} --> ${n}\n`)}i+=`\`\`\`

## File Roles

\`\`\`mermaid
pie title File Distribution by Role
`;let s=new Map;for(let t of e.files)s.set(t.role,(s.get(t.role)||0)+1);for(let[e,t]of s)i+=`    "${e}" : ${t}\n`;return i+="```\n",i}function oe(e){let{exportFlows:t,package:n}=e,r=`# Export Flows

> How symbols travel from source to public API in ${n.name}

`;if(!t||Object.keys(t).length===0)return r+`_No export flows detected_
`;let i=new Map;for(let[e,n]of Object.entries(t)){let t=i.get(n.definedIn)||[];t.push({name:e,flow:n}),i.set(n.definedIn,t)}r+=`## Summary

| Metric | Value |
|--------|-------|
| Total Tracked Exports | ${Object.keys(t).length} |
| Origin Files | ${i.size} |
| Re-exported Symbols | ${Object.values(t).filter(e=>e.reExportChain.length>0).length} |

---

## Export Flow Details

`;for(let[e,t]of i){r+=`### From \`${e}\`\n\n`;for(let{name:e,flow:n}of t)r+=`#### \`${e}\`\n\n`,r+=`- **Type:** ${n.exportType}\n`,r+=`- **Defined in:** \`${n.definedIn}\`\n`,n.reExportChain.length>0&&(r+=`- **Re-export chain:** ${n.reExportChain.map(e=>`\`${e}\``).join(` → `)}\n`),n.publicFrom.length>0&&(r+=`- **Public from:** ${n.publicFrom.map(e=>`\`${e}\``).join(`, `)}\n`),n.conditions.length>0&&(r+=`- **Conditions:** ${n.conditions.join(`, `)}\n`),r+=`
`}r+=`---

## Export Flow Diagram

\`\`\`mermaid
flowchart TB
    subgraph "Public API"
`;let a=new Set;for(let e of Object.values(t))for(let t of e.publicFrom)a.add(t);let o=0,s=new Map;for(let e of a){let t=`EP${o++}`;s.set(e,t),r+=`        ${t}["${e}"]\n`}r+=`    end

`;for(let[e,t]of i){let n=`O${o++}`;s.set(e,n),r+=`    ${n}["${e}"]\n`;for(let{flow:e}of t)if(e.publicFrom.length>0)for(let t of e.publicFrom){let e=s.get(t);e&&(r+=`    ${n} --> ${e}\n`)}}return r+="```\n",r}function se(e){let{architecture:t,package:n}=e,r=`# Architecture Analysis

> Code organization patterns in ${n.name}

`;if(!t)return r+`_No architecture analysis available_
`;if(r+=`## Detected Pattern: **${t.pattern}**

`,r+=`${{layered:`The codebase follows a layered architecture with distinct layers for presentation, domain, infrastructure, and shared utilities.`,"feature-based":`The codebase is organized by features/modules, with each feature containing its own components, services, and types.`,flat:`The codebase has a flat structure with minimal directory nesting.`,monorepo:`The codebase is a monorepo with multiple packages or applications.`,unknown:`The architecture pattern could not be automatically detected.`}[t.pattern]}\n\n`,t.layers.length>0){r+=`## Layers

| Layer | Description | Files |
|-------|-------------|-------|
`;for(let e of t.layers)r+=`| ${e.name} | ${e.description} | ${e.files.length} |\n`;r+=`
`;for(let e of t.layers)if(r+=`### ${e.name}\n\n`,r+=`> ${e.description}\n\n`,r+=`**Allowed dependencies:** ${e.dependsOn.length>0?e.dependsOn.join(`, `):`none (base layer)`}\n\n`,e.files.length>0){r+=`**Files (${e.files.length}):**\n`;for(let t of e.files.slice(0,20))r+=`- \`${t}\`\n`;e.files.length>20&&(r+=`- _...and ${e.files.length-20} more_\n`),r+=`
`}}if(r+=`---

## Layer Violations

`,t.violations.length===0)r+=`✅ _No layer violations detected_
`;else{r+=`⚠️ **${t.violations.length} violations detected**\n\n`,r+=`| From | To | From Layer | To Layer |
`,r+=`|------|----|-----------|---------|
`;for(let e of t.violations.slice(0,30))r+=`| \`${e.from}\` | \`${e.to}\` | ${e.fromLayer} | ${e.toLayer} |\n`;t.violations.length>30&&(r+=`\n_...and ${t.violations.length-30} more violations_\n`)}r+=`
---

## Architecture Diagram

\`\`\`mermaid
graph TB
`;for(let e of t.layers){let t=e.name.replace(/[^a-zA-Z0-9]/g,``);r+=`    subgraph ${t}["${e.name} (${e.files.length} files)"]\n`,r+=`    end
`}for(let e of t.layers){let t=e.name.replace(/[^a-zA-Z0-9]/g,``);for(let n of e.dependsOn){let e=n.replace(/[^a-zA-Z0-9]/g,``);r+=`    ${t} --> ${e}\n`}}return r+="```\n",r}function Q(e){let{dependencyUsage:t,package:n}=e,r=`# Dependency Usage Details

> Which symbols are imported from each package in ${n.name}

`;if(!t||Object.keys(t).length===0)return r+`_No dependency usage data available_
`;r+=`## Summary

| Package | Type | Files Used In | Total Imports | Type-Only |
|---------|------|---------------|---------------|-----------|
`;let i=Object.entries(t).sort((e,t)=>t[1].stats.filesUsedIn-e[1].stats.filesUsedIn);for(let[e,t]of i)r+=`| ${t.package} | ${t.declaredAs} | ${t.stats.filesUsedIn} | ${t.stats.totalImports} | ${t.stats.typeOnlyCount} |\n`;r+=`
---

`,r+=`## Detailed Usage

`;for(let[e,t]of i){r+=`### \`${t.package}\`\n\n`,r+=`- **Declared as:** ${t.declaredAs}\n`,r+=`- **Used in ${t.stats.filesUsedIn} files**\n`,t.stats.uniqueSymbols.length>0&&(r+=`- **Symbols used:** ${t.stats.uniqueSymbols.slice(0,10).map(e=>`\`${e}\``).join(`, `)}`,t.stats.uniqueSymbols.length>10&&(r+=` _...and ${t.stats.uniqueSymbols.length-10} more_`),r+=`
`),r+=`
**Usage locations:**
`;for(let e of t.usageLocations.slice(0,10))r+=`- \`${e.file}\``,e.isTypeOnly&&(r+=` (type-only)`),e.isDynamic&&(r+=` (dynamic)`),e.isNamespace&&(r+=` (namespace)`),r+=`
`;t.usageLocations.length>10&&(r+=`- _...and ${t.usageLocations.length-10} more locations_\n`),r+=`
`}return r}async function $(n,r,i={}){let a=Date.now(),o=e.resolve(n),s=r?e.resolve(r):e.join(o,`scripts`),c=e.join(o,`package.json`);if(!t.existsSync(c))throw Error(`No package.json found at ${o}`);console.log(`📦 Analyzing repository: ${o}`),console.log(`🔍 Phase 1: Discovering configuration...`);let l=await t.promises.readFile(c,`utf-8`),f=JSON.parse(l),p=await u(c);console.log(`   Package: ${p.name}@${p.version}`),console.log(`   Entry points: ${p.entryPoints.all.size}`),console.log(`   Dependencies: ${p.dependencies.all.size}`),await d(o)&&console.log(`   📁 Monorepo detected with workspaces: ${p.workspaces?.join(`, `)}`),console.log(`🔨 Phase 2: Building module graph...`);let m=await C({rootPath:o,outputPath:s,includeTests:i.includeTests??!1,extensions:i.extensions??[`.ts`,`.tsx`,`.js`,`.jsx`],excludePatterns:i.excludePatterns??[`**/node_modules/**`,`**/dist/**`,`**/build/**`,`**/.git/**`],...i});console.log(`   Files analyzed: ${m.size}`),w(m,p.entryPoints.all,o);let h=0,g=0,_=0;for(let e of m.values())h+=e.exports.length,g+=e.imports.internal.size,_+=e.imports.external.size;console.log(`   Total exports: ${h}`),console.log(`   Internal imports: ${g}`),console.log(`   External imports: ${_}`),console.log(`📊 Phase 3: Analyzing dependencies...`);let v=A(m,p.dependencies);console.log(`   Unused dependencies: ${v.unused.length}`),console.log(`   Unlisted dependencies: ${v.unlisted.length}`),console.log(`   Misplaced dependencies: ${v.misplaced.length}`),console.log(`🔬 Phase 4: Enhanced analysis...`);let y=W(m);console.log(`   Architecture pattern: ${y.pattern}`),console.log(`   Layers detected: ${y.layers.length}`),console.log(`   Layer violations: ${y.violations.length}`),console.log(`📝 Phase 5: Generating output...`);let b=Y(m,p,v,o,a,f);await X(b,s);let x=Date.now()-a;return console.log(`\n✅ Analysis complete in ${x}ms`),console.log(`📁 Output written to: ${s}`),console.log(`   - analysis.json`),b.files.length>300&&console.log(`   - static-analysis-files-*.json (split chunks)`),console.log(`   - ANALYSIS_SUMMARY.md`),console.log(`   - PUBLIC_API.md`),console.log(`   - DEPENDENCIES.md`),console.log(`   - INSIGHTS.md`),console.log(`   - MODULE_GRAPH.md`),console.log(`   - EXPORT_FLOWS.md (NEW)`),console.log(`   - ARCHITECTURE.md (NEW)`),console.log(`   - DEPENDENCY_USAGE.md (NEW)`),b}async function ce(n,r={}){let i=Date.now(),a=e.resolve(n),o=e.join(a,`package.json`);if(!t.existsSync(o))throw Error(`No package.json found at ${a}`);let s=await t.promises.readFile(o,`utf-8`),c=JSON.parse(s),l=await u(o),d=await C({rootPath:a,...r});return w(d,l.entryPoints.all,a),Y(d,l,A(d,l.dependencies),a,i,c)}async function le(){let e=process.argv.slice(2);e.length===0&&(console.log(`
Repository Analyzer - Analyze TypeScript/JavaScript projects

Usage:
  npx ts-node src/index.ts <repo-path> [output-path]

Arguments:
  repo-path    Path to the repository root (must contain package.json)
  output-path  Optional path for output files (defaults to scripts/)

Example:
  npx ts-node src/index.ts ./my-project ./analysis-output
`),process.exit(0));let t=e[0],n=e[1];try{await $(t,n)}catch(e){console.error(`❌ Analysis failed:`,e),process.exit(1)}}import.meta.url===`file://${process.argv[1]}`&&le();export{A as analyzeDependencies,R as analyzeDetailedDependencyUsage,m as analyzeExportsMap,u as analyzePackageJson,$ as analyzeRepository,E as buildExportFlows,C as buildModuleGraph,W as detectArchitecture,j as findCircularDependencies,M as findUnusedExports,d as isMonorepo,ce as quickAnalyze};