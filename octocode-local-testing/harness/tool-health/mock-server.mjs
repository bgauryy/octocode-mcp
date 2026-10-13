// Loopback mock for the external providers the tool-health suite exercises:
// GitHub REST (GITHUB_API_URL), an npm registry (artifactSearch `registryUrl`)
// and the jev classification provider (OCTOCODE_CLASSIFICATION_API_HOST).
// Responses come from one small in-memory model (two repositories whose
// files are the tool-health fixture), so every endpoint answers consistently
// and filters/pages generically; nothing keys on a particular test input.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = text => createHash('sha1').update(text).digest('hex');
const blobSha = text => sha(`blob ${Buffer.byteLength(text)}\0${text}`);

/** Every file under `dir` (relative path → UTF-8 text), sorted. */
function readTree(dir) {
  const out = {};
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else out[child] = fs.readFileSync(path.join(dir, child), 'utf8');
    }
  };
  walk('');
  return out;
}

/** A file larger than one default read window, so reads continue. */
const LARGE_GUIDE = Array.from({ length: 1500 }, (_, i) => `Line ${i + 1}: the greeter guide repeats this sentence to fill a long document.`).join('\n') + '\n';
const DATE = i => new Date(Date.UTC(2025, 0, 1 + i, 12)).toISOString().replace('.000', '');
const USER = { login: 'octo-dev', id: 1, type: 'User', html_url: 'https://github.com/octo-dev' };

/** The model: repositories, commits, pull requests, issues, npm packages. */
export function buildModel(fixtureDir) {
  const files = readTree(fixtureDir);
  const paths = Object.keys(files);
  // Three commits on `main`: each adds a slice of the files, newest first in listings.
  const commits = [];
  const slices = [paths.slice(0, 2), paths.slice(2, 4), paths.slice(4)];
  slices.forEach((added, i) => {
    const parent = commits.at(-1);
    const message = `Add ${added.join(', ')}`;
    commits.push({ oid: sha(`commit ${i} ${message}`), message, date: DATE(i), parent: parent?.oid, added, tree: sha(`tree ${i}`) });
  });
  const head = commits.at(-1);
  const repos = [
    { owner: 'octo', name: 'demo', description: 'Tool-health demo greeter in TypeScript', language: 'TypeScript', stars: 42, files },
    { owner: 'octo', name: 'demo-cli', description: 'Command line wrapper for the demo greeter', language: 'TypeScript', stars: 7, files: { 'README.md': '# demo-cli\n\nA greeter CLI.\n' } },
    { owner: 'octo', name: 'demo-docs', description: 'Documentation site for the demo greeter', language: 'Markdown', stars: 3, files: { 'README.md': '# demo-docs\n\nGreeter docs.\n', 'guide.txt': LARGE_GUIDE } },
  ];
  const pulls = [
    { number: 1, title: 'Add greeter module', body: 'Introduces greet() and the Greeter class.', state: 'closed', merged: true, base: commits[0], head: commits[1], date: DATE(1) },
    { number: 3, title: 'Add greeter docs', body: 'Documents the greeter usage.', state: 'open', merged: false, base: commits[1], head: commits[2], date: DATE(2) },
  ];
  const issues = [
    { number: 2, title: 'Greeter should support a prefix', body: 'The greeter needs a configurable prefix.', state: 'open', date: DATE(1), comments: [{ id: 21, body: 'Agreed, the Greeter class takes one now.', date: DATE(2) }] },
  ];
  const packages = [
    { name: 'tiny-health', version: '1.2.3', versions: ['1.0.0', '1.2.3'], description: 'Tiny health-check helpers', dependencies: { 'tiny-greet': '^2.0.0' }, keywords: ['health', 'check'] },
    { name: 'tiny-greet', version: '2.1.0', versions: ['2.0.0', '2.1.0'], description: 'Greeting helpers for health dashboards', dependencies: {}, keywords: ['greet', 'health'] },
    { name: 'tiny-pulse', version: '0.4.0', versions: ['0.4.0'], description: 'Pulse monitor for health checks', dependencies: {}, keywords: ['health', 'pulse'] },
  ];
  return { files, commits, head, repos, pulls, issues, packages };
}

function repoJson(base, repo) {
  const full = `${repo.owner}/${repo.name}`;
  return {
    id: Number.parseInt(sha(full).slice(0, 8), 16), node_id: `R_${repo.name}`, name: repo.name, full_name: full,
    owner: { ...USER, login: repo.owner }, private: false, html_url: `https://github.com/${full}`, description: repo.description,
    fork: false, url: `${base}/repos/${full}`, created_at: DATE(0), updated_at: DATE(3), pushed_at: DATE(3),
    homepage: null, size: 10, stargazers_count: repo.stars, watchers_count: repo.stars, language: repo.language,
    forks_count: 0, open_issues_count: 1, archived: false, disabled: false, visibility: 'public', default_branch: 'main',
    topics: ['greeter'], license: { key: 'mit', name: 'MIT License', spdx_id: 'MIT' }, has_issues: true,
  };
}

const splitQuery = q => {
  const terms = [], qualifiers = {};
  for (const token of (q.match(/"[^"]*"|\S+/g) ?? [])) {
    const m = /^([a-z-]+):(.+)$/.exec(token);
    if (m) (qualifiers[m[1]] ??= []).push(m[2].replace(/^"|"$/g, ''));
    else terms.push(token.replace(/^"|"$/g, '').toLowerCase());
  }
  return { terms, qualifiers };
};

function page(items, url, base, perPageDefault = 30) {
  const perPage = Math.max(1, Number(url.searchParams.get('per_page') ?? perPageDefault));
  const current = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const slice = items.slice((current - 1) * perPage, current * perPage);
  const last = Math.max(1, Math.ceil(items.length / perPage));
  const link = n => { const u = new URL(url.pathname + url.search, base); u.searchParams.set('page', String(n)); u.searchParams.set('per_page', String(perPage)); return u.href; };
  const rels = [];
  if (current < last) rels.push(`<${link(current + 1)}>; rel="next"`, `<${link(last)}>; rel="last"`);
  if (current > 1) rels.push(`<${link(1)}>; rel="first"`, `<${link(current - 1)}>; rel="prev"`);
  return { slice, headers: rels.length ? { link: rels.join(', ') } : {} };
}

const lines = text => text.split('\n');
const addPatch = text => { const ls = lines(text).filter((l, i, a) => i < a.length - 1 || l !== ''); return `@@ -0,0 +1,${ls.length} @@\n${ls.map(l => `+${l}`).join('\n')}`; };

function commitJson(base, repo, commit, model) {
  const full = `${repo.owner}/${repo.name}`;
  const author = { name: 'Octo Dev', email: 'dev@example.invalid', date: commit.date };
  return {
    sha: commit.oid, node_id: `C_${commit.oid.slice(0, 8)}`, url: `${base}/repos/${full}/commits/${commit.oid}`, html_url: `https://github.com/${full}/commit/${commit.oid}`,
    commit: { author, committer: author, message: commit.message, tree: { sha: commit.tree, url: `${base}/repos/${full}/git/trees/${commit.tree}` }, comment_count: 0 },
    author: USER, committer: USER, parents: commit.parent ? [{ sha: commit.parent, url: `${base}/repos/${full}/commits/${commit.parent}` }] : [],
    stats: { total: commit.added.reduce((n, p) => n + lines(model.files[p]).length, 0), additions: commit.added.reduce((n, p) => n + lines(model.files[p]).length, 0), deletions: 0 },
    files: commit.added.map(p => fileChange(base, full, commit.oid, p, model.files[p])),
  };
}

function fileChange(base, full, ref, p, text) {
  const count = lines(text).filter((l, i, a) => i < a.length - 1 || l !== '').length;
  return { sha: blobSha(text), filename: p, status: 'added', additions: count, deletions: 0, changes: count, blob_url: `https://github.com/${full}/blob/${ref}/${p}`, raw_url: `https://github.com/${full}/raw/${ref}/${p}`, contents_url: `${base}/repos/${full}/contents/${p}?ref=${ref}`, patch: addPatch(text) };
}

function issueJson(base, repo, item, pull) {
  const full = `${repo.owner}/${repo.name}`;
  return {
    url: `${base}/repos/${full}/issues/${item.number}`, repository_url: `${base}/repos/${full}`, html_url: `https://github.com/${full}/${pull ? 'pull' : 'issues'}/${item.number}`,
    id: 1000 + item.number, node_id: `I_${item.number}`, number: item.number, title: item.title, user: USER, labels: [], state: item.state, locked: false,
    assignees: [], milestone: null, comments: item.comments?.length ?? 0, created_at: item.date, updated_at: item.date, closed_at: item.state === 'closed' ? item.date : null,
    author_association: 'OWNER', body: item.body, reactions: { total_count: 0 }, state_reason: null,
    ...(pull && { pull_request: { url: `${base}/repos/${full}/pulls/${item.number}`, html_url: `https://github.com/${full}/pull/${item.number}`, merged_at: item.merged ? item.date : null } }),
  };
}

function pullJson(base, repo, pr, model) {
  const full = `${repo.owner}/${repo.name}`;
  const changed = pr.head.added;
  const adds = changed.reduce((n, p) => n + fileChange(base, full, pr.head.oid, p, model.files[p]).additions, 0);
  const ref = (label, commit) => ({ label: `${repo.owner}:${label}`, ref: label, sha: commit.oid, user: USER, repo: repoJson(base, repo) });
  return {
    ...issueJson(base, repo, pr, true), url: `${base}/repos/${full}/pulls/${pr.number}`, html_url: `https://github.com/${full}/pull/${pr.number}`,
    merged: pr.merged, merged_at: pr.merged ? pr.date : null, merge_commit_sha: pr.merged ? pr.head.oid : null, draft: false, mergeable: pr.merged ? null : true,
    head: ref(`feature-${pr.number}`, pr.head), base: ref('main', pr.base), commits: 1, additions: adds, deletions: 0, changed_files: changed.length,
    review_comments: 0, requested_reviewers: [], merged_by: pr.merged ? USER : null,
  };
}

/** A jev System One answer per requested question, shaped by the question's type. */
function jevAnswer(question) {
  if (question.type === 'noul') return { type: 'noul', noul: 0.9 };
  if (question.type === 'choice') {
    const labels = Object.keys(question.criteria ?? {});
    const rest = labels.length > 1 ? 0.2 / (labels.length - 1) : 0;
    const probabilities = Object.fromEntries(labels.map((l, i) => [l, i === 0 ? (labels.length > 1 ? 0.8 : 1) : rest]));
    return { type: 'choice', choice: labels[0], confidence: probabilities[labels[0]], probabilities };
  }
  if (question.type === 'score') {
    const levels = question.criteria ?? [];
    const top = levels.length - 1;
    const probabilities = Object.fromEntries(levels.map((_, i) => [String(i), i === top ? 1 : 0]));
    const legend = Object.fromEntries(levels.map((l, i) => [String(i), l]));
    return { type: 'score', score: top, confidence: 1, probabilities, legend };
  }
  return { type: question.type };
}

/**
 * A bare `octo/demo.git` under `<tmpDir>/git` whose history is the model's
 * commits (same files, messages and dates), served by `git http-backend`. The
 * model's commit and tree SHAs are replaced by the real ones, so REST answers
 * and a clone agree. Returns `{ reason }` when git is unavailable.
 */
function makeGitRepo(model, tmpDir) {
  const git = (args, cwd, date = DATE(0)) => spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Octo Dev', GIT_AUTHOR_EMAIL: 'dev@example.invalid', GIT_COMMITTER_NAME: 'Octo Dev', GIT_COMMITTER_EMAIL: 'dev@example.invalid', GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  if (git(['--version']).status !== 0) return { reason: 'git is not installed' };
  const work = path.join(tmpDir, 'git-work');
  const root = path.join(tmpDir, 'git');
  fs.mkdirSync(work, { recursive: true });
  const init = git(['init', '-q', '-b', 'main'], work);
  if (init.status !== 0) return { reason: `git init failed: ${init.stderr.trim()}` };
  for (const commit of model.commits) {
    for (const file of commit.added) {
      fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
      fs.writeFileSync(path.join(work, file), model.files[file]);
    }
    for (const args of [['add', '-A'], ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', commit.message]]) {
      const r = git(args, work, commit.date);
      if (r.status !== 0) return { reason: `git ${args.at(-3) ?? args[0]} failed: ${r.stderr.trim()}` };
    }
    commit.oid = git(['rev-parse', 'HEAD'], work).stdout.trim();
    commit.tree = git(['rev-parse', 'HEAD^{tree}'], work).stdout.trim();
  }
  model.commits.forEach((commit, i) => { commit.parent = model.commits[i - 1]?.oid; });
  fs.mkdirSync(path.join(root, 'octo'), { recursive: true });
  const bare = git(['clone', '-q', '--bare', work, path.join(root, 'octo', 'demo.git')], tmpDir);
  if (bare.status !== 0) return { reason: `git clone --bare failed: ${bare.stderr.trim()}` };
  git(['config', 'http.uploadpack', 'true'], path.join(root, 'octo', 'demo.git'));
  const head = git(['rev-parse', 'HEAD'], work).stdout.trim();
  return { root, head };
}

/**
 * Start the mock on an ephemeral loopback port. GitHub REST answers at the
 * root and under `/api/v3` (a GitHub Enterprise base, which ghCloneRepo maps to
 * `<host>/<owner>/<repo>.git`). `requests` records every request; `unhandled`
 * the ones no route answered (a suite failure detail). With `tmpDir`, git
 * smart HTTP serves `octo/demo.git` behind Basic auth: `gitAuth` records each
 * credential check as `{ user, tokenMatches }` (never the secret itself).
 */
export async function startMock({ fixtureDir, tmpDir, token, configureModel, classificationResponder } = {}) {
  const model = buildModel(fixtureDir);
  configureModel?.(model);
  const requests = [];
  const classificationRequests = [];
  const unhandled = [];
  const gitAuth = [];
  const repoGit = tmpDir ? makeGitRepo(model, tmpDir) : { reason: 'no tmpDir' };
  let base = '';
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => { chunks.push(chunk); });
    req.on('end', async () => {
      const raw = Buffer.concat(chunks);
      const body = raw.toString('utf8');
      const url = new URL(req.url, base);
      requests.push(`${req.method} ${url.pathname}${url.search}`);
      if (repoGit.root && /^\/[^/]+\/[^/]+\.git(\/|$)/.test(url.pathname)) { serveGit(req, res, url, raw); return; }
      const send = (status, payload, headers = {}) => {
        const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
        res.writeHead(status, { 'content-type': typeof payload === 'string' ? 'text/plain' : 'application/json; charset=utf-8', 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600), 'x-ratelimit-resource': 'core', ...headers });
        res.end(text);
      };
      try {
        const handled = await route(req.method, url, body, req.headers, send);
        if (!handled) { unhandled.push(`${req.method} ${url.pathname}${url.search}`); send(404, { message: 'Not Found' }); }
      } catch (error) {
        unhandled.push(`${req.method} ${url.pathname}: ${error.message}`);
        send(500, { message: error.message });
      }
    });
  });

  const findRepo = (owner, name) => model.repos.find(r => r.owner === owner && r.name === name);
  const commitByRef = ref => (!ref || ref === 'HEAD' || ref === 'main') ? model.head : model.commits.find(c => c.oid === ref || c.oid.startsWith(ref));
  // Files visible at a commit: those added by it and its ancestors (non-demo repos have one snapshot).
  const filesAt = (repo, commit) => {
    if (repo.files !== model.files) return repo.files;
    const visible = {};
    for (const c of model.commits) { for (const p of c.added) visible[p] = model.files[p]; if (c === commit) break; }
    return visible;
  };

  function serveGit(req, res, url, raw) {
    const auth = /^Basic (.+)$/.exec(req.headers.authorization ?? '');
    if (!auth) { res.writeHead(401, { 'www-authenticate': 'Basic realm="octocode-tool-health"' }); res.end(); return; }
    const [user, ...rest] = Buffer.from(auth[1], 'base64').toString('utf8').split(':');
    const tokenMatches = rest.join(':') === token;
    gitAuth.push({ user, tokenMatches });
    if (user !== 'x-access-token' || !tokenMatches) { res.writeHead(403); res.end(); return; }
    const child = spawn('git', ['http-backend'], { env: { ...process.env, GIT_PROJECT_ROOT: repoGit.root, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), REQUEST_METHOD: req.method, CONTENT_TYPE: req.headers['content-type'] ?? '', CONTENT_LENGTH: String(raw.length), HTTP_CONTENT_ENCODING: req.headers['content-encoding'] ?? '', GIT_PROTOCOL: req.headers['git-protocol'] ?? '', REMOTE_USER: user, REMOTE_ADDR: '127.0.0.1' } });
    const out = [];
    child.stdout.on('data', c => out.push(c));
    child.on('close', () => {
      const buffer = Buffer.concat(out);
      const split = buffer.indexOf('\r\n\r\n');
      const headerText = buffer.subarray(0, split).toString('utf8');
      const headers = {};
      let status = 200;
      for (const line of headerText.split('\r\n')) {
        const i = line.indexOf(':');
        if (i < 0) continue;
        const key = line.slice(0, i).trim().toLowerCase(), value = line.slice(i + 1).trim();
        if (key === 'status') status = Number.parseInt(value, 10);
        else headers[key] = value;
      }
      res.writeHead(status, headers);
      res.end(buffer.subarray(split + 4));
    });
    child.stdin.end(raw);
  }

  async function route(method, url, body, headers, send) {
    const p = (decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/').replace(/^\/api\/v3(?=\/|$)/, '') || '/';
    let m;
    // ---- jev classification provider
    if (method === 'POST' && p === '/v1/systemone') {
      const request = JSON.parse(body || '{}');
      classificationRequests.push(request);
      if (classificationResponder) {
        const response = await classificationResponder(request);
        send(response.status ?? 200, response.body);
        return true;
      }
      const answers = Object.fromEntries(Object.entries(request.questions ?? {}).map(([id, q]) => [id, jevAnswer(q)]));
      send(200, { model: request.model || 'jev-mock', answers, usage: { input_tokens: 10, output_tokens: 2 } });
      return true;
    }
    // ---- npm registry
    if (method === 'GET' && p === '/-/v1/search') {
      const text = (url.searchParams.get('text') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const size = Number(url.searchParams.get('size') ?? 20), from = Number(url.searchParams.get('from') ?? 0);
      const hits = model.packages.filter(pkg => text.every(t => pkg.name.includes(t) || pkg.description.toLowerCase().includes(t) || pkg.keywords.includes(t)));
      send(200, { objects: hits.slice(from, from + size).map(pkg => ({ package: { name: pkg.name, version: pkg.version, description: pkg.description, keywords: pkg.keywords, date: DATE(5), links: { npm: `https://www.npmjs.com/package/${pkg.name}`, repository: 'https://github.com/octo/demo' }, publisher: { username: 'octo-dev' } }, score: { final: 0.5, detail: { quality: 0.5, popularity: 0.5, maintenance: 0.5 } }, searchScore: 1 })), total: hits.length, time: DATE(6) });
      return true;
    }
    if (method === 'GET' && (m = /^\/((?:@[^/]+\/)?[^/@]+)(?:\/([^/]+))?$/.exec(p)) && model.packages.some(pkg => pkg.name === m[1])) {
      const pkg = model.packages.find(x => x.name === m[1]);
      const manifest = version => ({ name: pkg.name, version, description: pkg.description, license: 'MIT', homepage: 'https://github.com/octo/demo#readme', repository: { type: 'git', url: 'git+https://github.com/octo/demo.git' }, dependencies: pkg.dependencies, keywords: pkg.keywords, dist: { tarball: `${base}/${pkg.name}/-/${pkg.name}-${version}.tgz`, shasum: sha(version), integrity: `sha512-${Buffer.from(sha(version)).toString('base64')}` }, gitHead: model.head.oid });
      if (m[2]) {
        const version = m[2] === 'latest' ? pkg.version : m[2];
        if (!pkg.versions.includes(version)) { send(404, { error: 'version not found' }); return true; }
        send(200, manifest(version));
        return true;
      }
      send(200, { name: pkg.name, description: pkg.description, 'dist-tags': { latest: pkg.version }, versions: Object.fromEntries(pkg.versions.map(v => [v, manifest(v)])), time: Object.fromEntries(pkg.versions.map((v, i) => [v, DATE(i)])), license: 'MIT', repository: { type: 'git', url: 'git+https://github.com/octo/demo.git' } });
      return true;
    }
    // ---- GitHub REST
    if (method !== 'GET') return false;
    if (p === '/search/repositories') {
      const { terms, qualifiers } = splitQuery(url.searchParams.get('q') ?? '');
      const hits = model.repos.filter(r => (!qualifiers.user && !qualifiers.org || [...(qualifiers.user ?? []), ...(qualifiers.org ?? [])].includes(r.owner))
        && terms.every(t => `${r.name} ${r.description}`.toLowerCase().includes(t)));
      const { slice, headers: h } = page(hits, url, base);
      send(200, { total_count: hits.length, incomplete_results: false, items: slice.map(r => ({ ...repoJson(base, r), score: 1 })) }, h);
      return true;
    }
    if (p === '/search/code') {
      const { terms, qualifiers } = splitQuery(url.searchParams.get('q') ?? '');
      const scope = model.repos.filter(r => (qualifiers.repo ?? [`${r.owner}/${r.name}`]).includes(`${r.owner}/${r.name}`) && (!qualifiers.user && !qualifiers.org || [...(qualifiers.user ?? []), ...(qualifiers.org ?? [])].includes(r.owner)));
      const hits = [];
      for (const r of scope) for (const [fp, text] of Object.entries(r.files)) {
        if (qualifiers.path && !qualifiers.path.some(prefix => fp.startsWith(prefix.replace(/^\//, '')))) continue;
        if (qualifiers.extension && !qualifiers.extension.some(ext => fp.endsWith(`.${ext}`))) continue;
        if (qualifiers.filename && !qualifiers.filename.some(name => path.basename(fp).includes(name))) continue;
        const inPath = (qualifiers.in ?? []).includes('path');
        const hay = (inPath ? fp : text).toLowerCase();
        if (!terms.every(t => hay.includes(t))) continue;
        const full = `${r.owner}/${r.name}`;
        const fragmentLine = lines(text).find(l => terms.some(t => l.toLowerCase().includes(t))) ?? '';
        const matches = terms.flatMap(t => { const i = fragmentLine.toLowerCase().indexOf(t); return i >= 0 ? [{ text: fragmentLine.slice(i, i + t.length), indices: [i, i + t.length] }] : []; });
        hits.push({ name: path.basename(fp), path: fp, sha: blobSha(text), url: `${base}/repos/${full}/contents/${fp}?ref=${model.head.oid}`, git_url: `${base}/repos/${full}/git/blobs/${blobSha(text)}`, html_url: `https://github.com/${full}/blob/${model.head.oid}/${fp}`, repository: repoJson(base, r), score: 1, text_matches: inPath ? [] : [{ object_url: `${base}/repos/${full}/contents/${fp}`, object_type: 'FileContent', property: 'content', fragment: fragmentLine, matches }] });
      }
      const { slice, headers: h } = page(hits, url, base);
      send(200, { total_count: hits.length, incomplete_results: false, items: slice }, h);
      return true;
    }
    if (p === '/search/issues') {
      const { terms, qualifiers } = splitQuery(url.searchParams.get('q') ?? '');
      const repo = qualifiers.repo?.[0] ? findRepo(...qualifiers.repo[0].split('/')) : model.repos[0];
      if (!repo) { send(422, { message: 'Validation Failed', errors: [{ message: 'The listed users and repositories cannot be searched' }] }); return true; }
      const isPr = (qualifiers.is ?? []).includes('pr') || (qualifiers.type ?? []).includes('pr');
      const isIssue = (qualifiers.is ?? []).includes('issue') || (qualifiers.type ?? []).includes('issue');
      const state = (qualifiers.is ?? []).find(v => v === 'open' || v === 'closed') ?? qualifiers.state?.[0];
      const pool = repo === model.repos[0] ? [...(isIssue ? [] : model.pulls.map(x => ({ x, pr: true }))), ...(isPr ? [] : model.issues.map(x => ({ x, pr: false })))] : [];
      const hits = pool.filter(({ x }) => (!state || x.state === state) && terms.every(t => `${x.title} ${x.body}`.toLowerCase().includes(t))).sort((a, b) => b.x.number - a.x.number);
      const { slice, headers: h } = page(hits, url, base);
      send(200, { total_count: hits.length, incomplete_results: false, items: slice.map(({ x, pr }) => ({ ...issueJson(base, repo, x, pr), score: 1 })) }, h);
      return true;
    }
    if (!(m = /^\/repos\/([^/]+)\/([^/]+)(?:\/(.*))?$/.exec(p))) return false;
    const repo = findRepo(m[1], m[2]);
    if (!repo) { send(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' }); return true; }
    const full = `${repo.owner}/${repo.name}`;
    const rest = m[3] ?? '';
    if (rest === '') { send(200, repoJson(base, repo)); return true; }
    if ((m = /^commits\/(.+)$/.exec(rest))) {
      const commit = commitByRef(m[1]);
      if (!commit) { send(422, { message: `No commit found for SHA: ${m[1]}` }); return true; }
      if (String(headers.accept ?? '').includes('vnd.github.sha')) { send(200, commit.oid); return true; }
      send(200, commitJson(base, repo, commit, model));
      return true;
    }
    if (rest === 'commits') {
      const filePath = url.searchParams.get('path');
      const start = commitByRef(url.searchParams.get('sha') ?? 'HEAD');
      const chain = model.commits.slice(0, model.commits.indexOf(start) + 1).reverse().filter(c => !filePath || c.added.some(a => a === filePath || a.startsWith(`${filePath}/`)));
      const { slice, headers: h } = page(chain, url, base);
      send(200, slice.map(c => commitJson(base, repo, c, model)), h);
      return true;
    }
    if ((m = /^compare\/(.+?)\.\.\.(.+)$/.exec(rest))) {
      const from = commitByRef(m[1]), to = commitByRef(m[2]);
      if (!from || !to) { send(404, { message: 'Not Found' }); return true; }
      const between = model.commits.slice(model.commits.indexOf(from) + 1, model.commits.indexOf(to) + 1);
      send(200, { url: `${base}/repos/${full}/compare/${m[1]}...${m[2]}`, html_url: `https://github.com/${full}/compare/${m[1]}...${m[2]}`, status: 'ahead', ahead_by: between.length, behind_by: 0, total_commits: between.length, base_commit: commitJson(base, repo, from, model), merge_base_commit: commitJson(base, repo, from, model), commits: between.map(c => commitJson(base, repo, c, model)), files: between.flatMap(c => c.added.map(fp => fileChange(base, full, to.oid, fp, model.files[fp]))) });
      return true;
    }
    if ((m = /^contents(?:\/(.*))?$/.exec(rest))) {
      const commit = commitByRef(url.searchParams.get('ref') ?? 'HEAD');
      if (!commit) { send(404, { message: 'No commit found for the ref' }); return true; }
      const visible = filesAt(repo, commit);
      const target = m[1] ?? '';
      if (visible[target] !== undefined) {
        const text = visible[target];
        if (String(headers.accept ?? '').includes('raw')) { send(200, text); return true; }
        send(200, { type: 'file', encoding: 'base64', size: Buffer.byteLength(text), name: path.basename(target), path: target, content: Buffer.from(text).toString('base64'), sha: blobSha(text), url: `${base}/repos/${full}/contents/${target}?ref=${commit.oid}`, html_url: `https://github.com/${full}/blob/${commit.oid}/${target}`, download_url: null, git_url: `${base}/repos/${full}/git/blobs/${blobSha(text)}` });
        return true;
      }
      const prefix = target ? `${target}/` : '';
      const children = new Map();
      for (const fp of Object.keys(visible)) if (fp.startsWith(prefix)) { const name = fp.slice(prefix.length).split('/')[0]; children.set(name, fp.slice(prefix.length).includes('/') ? 'dir' : 'file'); }
      if (!children.size) { send(404, { message: 'Not Found' }); return true; }
      send(200, [...children].map(([name, type]) => ({ type, name, path: prefix + name, size: type === 'file' ? Buffer.byteLength(visible[prefix + name]) : 0, sha: type === 'file' ? blobSha(visible[prefix + name]) : sha(`dir ${prefix + name}`), url: `${base}/repos/${full}/contents/${prefix + name}`, html_url: `https://github.com/${full}/tree/${commit.oid}/${prefix + name}`, download_url: null })));
      return true;
    }
    if ((m = /^git\/trees\/(.+)$/.exec(rest))) {
      const commit = model.commits.find(c => c.tree === m[1]) ?? commitByRef(m[1]);
      if (!commit) { send(404, { message: 'Not Found' }); return true; }
      const visible = filesAt(repo, commit);
      const dirs = new Set();
      for (const fp of Object.keys(visible)) { const parts = fp.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/')); }
      const tree = [...[...dirs].map(d => ({ path: d, mode: '040000', type: 'tree', sha: sha(`dir ${d}`), url: `${base}/repos/${full}/git/trees/${sha(`dir ${d}`)}` })), ...Object.entries(visible).map(([fp, text]) => ({ path: fp, mode: '100644', type: 'blob', sha: blobSha(text), size: Buffer.byteLength(text), url: `${base}/repos/${full}/git/blobs/${blobSha(text)}` }))].sort((a, b) => a.path.localeCompare(b.path));
      send(200, { sha: commit.tree, url: `${base}/repos/${full}/git/trees/${commit.tree}`, tree, truncated: false });
      return true;
    }
    if (rest === 'pulls') {
      const state = url.searchParams.get('state') ?? 'open';
      const head = url.searchParams.get('head');
      const baseRef = url.searchParams.get('base');
      const sort = url.searchParams.get('sort') === 'updated' ? 'updated_at' : 'created_at';
      const direction = url.searchParams.get('direction') === 'asc' ? 1 : -1;
      const pulls = (repo === model.repos[0] ? model.pulls : [])
        .map(pr => pullJson(base, repo, pr, model))
        .filter(pr => (state === 'all' || pr.state === state)
          && (!head || head === pr.head.label || head === pr.head.ref)
          && (!baseRef || baseRef === pr.base.ref))
        .sort((a, b) => direction * (a[sort].localeCompare(b[sort]) || a.number - b.number));
      const { slice, headers: h } = page(pulls, url, base);
      send(200, slice, h);
      return true;
    }
    if ((m = /^(pulls|issues)\/(\d+)(?:\/(\w+))?$/.exec(rest))) {
      const number = Number(m[2]);
      const pr = repo === model.repos[0] && model.pulls.find(x => x.number === number);
      const issue = repo === model.repos[0] && model.issues.find(x => x.number === number);
      if (m[1] === 'pulls' && !pr) { send(404, { message: 'Not Found' }); return true; }
      if (m[1] === 'issues' && !pr && !issue) { send(404, { message: 'Not Found' }); return true; }
      const sub = m[3];
      if (!sub) { send(200, m[1] === 'pulls' ? pullJson(base, repo, pr, model) : issueJson(base, repo, pr || issue, !!pr)); return true; }
      const list = items => { const { slice, headers: h } = page(items, url, base); send(200, slice, h); return true; };
      if (sub === 'files' && pr) return list(pr.head.added.map(fp => fileChange(base, full, pr.head.oid, fp, model.files[fp])));
      if (sub === 'commits' && pr) return list([commitJson(base, repo, pr.head, model)]);
      if (sub === 'comments') return list((issue?.comments ?? []).map(c => ({ id: c.id, user: USER, body: c.body, created_at: c.date, updated_at: c.date, html_url: `https://github.com/${full}/issues/${number}#issuecomment-${c.id}`, author_association: 'OWNER' })));
      if (sub === 'reviews' || sub === 'events' || sub === 'timeline') return list([]);
      return false;
    }
    return false;
  }

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  return { url: base, model, requests, classificationRequests, unhandled, gitAuth, git: !!repoGit.root, gitHead: repoGit.head, gitUnavailable: repoGit.reason, close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); }) };
}

// `node mock-server.mjs <fixtureDir> [port]`: run standalone for debugging.
if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = await startMock({ fixtureDir: path.resolve(process.argv[2] ?? '.') });
  console.log(mock.url);
  let shown = 0;
  setInterval(() => {
    while (shown < mock.requests.length) console.error(new Date().toISOString(), JSON.stringify(mock.requests[shown++]).slice(0, 240));
    while (mock.unhandled.length) console.error('UNHANDLED', mock.unhandled.shift());
  }, 100);
}
