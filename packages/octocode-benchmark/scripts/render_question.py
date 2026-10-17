#!/usr/bin/env python3
"""Render only public repository tokens; copy selected pinned tracked corpora for Codex."""
from __future__ import annotations
import json, os, re, shutil, subprocess
from pathlib import Path

TOKEN = re.compile(r'\{\{REPO:([a-zA-Z0-9_-]+)\}\}')


def prepare_question(text, manifest, destination, allowed_root):
    selected = sorted(set(TOKEN.findall(text)))
    data = json.loads(Path(manifest).read_text()) if manifest and Path(manifest).is_file() else {}
    scoped = data.get('questionRepositories', {}).get(os.environ.get('BENCH_QUESTION_ID', ''), [])
    selected = sorted(set(selected) | set(scoped))
    if not selected:
        return text, []
    if not manifest:
        raise ValueError('Repository placeholders require QUESTION_REPO_MAP/repositories.json')
    repositories = {r['id']:r for r in data['repositories']}
    roots, receipts = {}, []
    allowed_root = Path(allowed_root).resolve(strict=True)
    for ident in selected:
        row = repositories[ident]
        source = Path(row['sourceRoot']).resolve(strict=True)
        if not source.is_relative_to(allowed_root):
            raise ValueError('Repository is outside the permitted corpus root: ' + ident)
        def git(*args):
            return subprocess.check_output(['git','-C',str(source),*args], timeout=30)
        commit = git('rev-parse','HEAD').decode().strip()
        if commit != row['commit']:
            raise ValueError('Pinned repository HEAD changed: ' + ident)
        if git('status','--porcelain','--untracked-files=no').strip():
            raise ValueError('Tracked repository content changed: ' + ident)
        paths = [p for p in git('ls-files','-z').decode().split('\0') if p]
        target = destination / ident
        target.mkdir(parents=True)
        for name in paths:
            path = Path(name)
            if path.is_absolute() or '..' in path.parts:
                raise ValueError('Invalid tracked path')
            src, dst = source/path, target/path
            dst.parent.mkdir(parents=True,exist_ok=True)
            if src.is_symlink(): dst.symlink_to(os.readlink(src))
            elif src.is_file(): shutil.copyfile(src,dst)
            else: raise ValueError('Tracked corpus file is missing: '+ident+'/'+name)
        if git('status','--porcelain','--untracked-files=no').strip():
            raise ValueError('Tracked corpus changed while copying: ' + ident)
        roots[ident] = str(target)
        receipts.append({'id':ident,'commit':commit,'trackedFiles':len(paths),
            'sourceRoot':str(source),'solverRoot':str(target),'trackedCorpusSha256':row.get('trackedCorpusSha256'),
            'selection':'git ls-files; clean tracked tree checked before and after copy'})
    rendered = TOKEN.sub(lambda m: roots[m.group(1)],text)
    if scoped:
        rendered += '\n\nRepository scope:\n' + '\n'.join(roots[ident] for ident in scoped)
    return rendered, receipts
