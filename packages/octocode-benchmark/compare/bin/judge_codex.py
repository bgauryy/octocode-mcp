#!/usr/bin/env python3
"""Run a Codex judge with private authentication and an isolated tool filesystem."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time

from codex_runner import toml

DISABLED_FEATURES = (
    'view_image', 'apps', 'plugins', 'memories', 'multi_agent', 'multi_agent_v2',
    'browser_use', 'browser_use_external', 'computer_use', 'image_generation',
    'goals', 'sleep_tool', 'hooks', 'skill_search', 'workspace_dependencies',
    'unbounded_connection_retries', 'shell_snapshot',
)
ENV_ALLOW = ('LANG', 'LC_ALL', 'GH_TOKEN', 'GITHUB_TOKEN', 'SSL_CERT_FILE',
             'SSL_CERT_DIR', 'BENCH_REAL_CODEX', 'BENCH_CODEX_CAPTURE_DIR')


def run(command, *, env, cwd, timeout, prompt=None):
    process = subprocess.Popen(command, env=env, cwd=cwd, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               start_new_session=True)
    try:
        stdout, stderr = process.communicate(prompt, timeout=timeout)
        return process.returncode, stdout, stderr
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
        return 124, stdout, stderr


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--prompt', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--timeout', type=int, default=600)
    parser.add_argument('--preflight', action='store_true')
    parser.add_argument('--probe-denied-path', type=Path, action='append', default=[])
    parser.add_argument('--read-path', type=Path, action='append', default=[])
    parser.add_argument('--input-file', type=Path, action='append', default=[])
    args = parser.parse_args()
    if not 0 < args.timeout <= 600:
        parser.error('judge timeout must be between 1 and 600 seconds')
    codex = os.environ.get('CODEX_BIN') or shutil.which('codex')
    real_codex = os.environ.get('BENCH_REAL_CODEX') or codex
    real_gh = os.environ.get('REAL_GH') or shutil.which('gh')
    if not codex or not real_codex or not real_gh:
        raise RuntimeError('Codex and gh must be installed')
    host_home = Path.home().resolve()
    auth = Path(os.environ.get('CODEX_HOME', str(host_home / '.codex'))) / 'auth.json'
    if not auth.is_file():
        raise RuntimeError('Codex file authentication is required for isolated judging')
    prompt = args.prompt.read_bytes()
    args.output = args.output.resolve()
    args.receipt = args.receipt.resolve()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    receipt = {'model': args.model, 'timeout_seconds': args.timeout,
               'prompt_sha256': hashlib.sha256(prompt).hexdigest(),
               'disabled_features': list(DISABLED_FEATURES), 'no_daemon': True,
               'fresh_home': True, 'fresh_codex_home': True,
               'auth_files_copied': ['auth.json'], 'preflight': args.preflight,
               'reported_cost_usd': None}
    with tempfile.TemporaryDirectory(prefix='octocode-judge-') as directory:
        base = Path(directory).resolve()
        lab, home, private = (base / name for name in ('lab', 'home', 'private'))
        for path in (lab, home, private, lab / 'bin', lab / 'tmp'):
            path.mkdir()
        shutil.copyfile(auth, private / 'auth.json')
        (private / 'auth.json').chmod(0o600)
        shutil.copyfile(Path(__file__).with_name('guard') / 'gh', lab / 'bin' / 'gh')
        (lab / 'bin' / 'gh').chmod(0o500)
        for source in args.input_file:
            shutil.copyfile(source, lab / source.name)
        filesystem = {':minimal': 'read', str(lab): 'write', str(home): 'write',
                      '/opt/homebrew': 'read', '/Library': 'read',
                      str(host_home): 'deny', str(private): 'deny'}
        for path in args.read_path:
            filesystem[str(path.resolve())] = 'read'
        permissions = {'filesystem': filesystem, 'network': {'enabled': True}}
        config = {
            'project_doc_max_bytes': 0, 'skills.include_instructions': False,
            'skills.bundled.enabled': False, 'web_search': 'disabled',
            'features.code_mode': {'enabled': False}, 'mcp_servers': {},
            'tools.update_plan.enabled': False,
            'tools.experimental_request_user_input.enabled': False,
            'developer_instructions': '', 'suppress_unstable_features_warning': True,
            'default_permissions': 'judge', 'permissions.judge': permissions,
            'approval_policy': 'never',
        }
        options = ['--ignore-user-config', '--ignore-rules', '--strict-config']
        for feature in DISABLED_FEATURES:
            options += ['--disable', feature]
        options += ['--enable', 'skip_host_skill_discovery']
        for key, value in config.items():
            options += ['-c', key + '=' + toml(value)]
        env = {key: os.environ[key] for key in ENV_ALLOW if key in os.environ}
        env.update(HOME=str(home), CODEX_HOME=str(private), TMPDIR=str(lab / 'tmp'),
                   PATH=str(lab / 'bin') + ':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
                   REAL_GH=str(Path(real_gh).resolve()), GH_CONFIG_DIR=str(home / '.config/gh'))
        receipt['permissions'] = permissions
        if args.preflight:
            canary = private / 'canary.txt'
            canary.write_text('PRIVATE_EVALUATOR_CANARY')
            (lab / 'visible.txt').write_text('VISIBLE')
            denied = [canary, auth.resolve(), host_home / '.agents/skills/octocode-research/SKILL.md',
                      args.prompt.resolve(), *[path.resolve() for path in args.probe_denied_path]]
            probe = (
                'import json,pathlib; result={"visible":pathlib.Path("visible.txt").read_text()=="VISIBLE","denied":{}}\n'
                'for name in ' + repr([str(path) for path in denied]) + ':\n'
                ' try: pathlib.Path(name).read_bytes(); result["denied"][name]=False\n'
                ' except PermissionError: result["denied"][name]=True\n'
                'print(json.dumps(result))\n'
            )
            sandbox = [real_codex, '--no-daemon', 'sandbox', '-P', 'judge', '-C', str(lab),
                       '-c', 'permissions.judge=' + toml(permissions), '--']
            code, stdout, stderr = run(sandbox + ['/usr/bin/python3', '-c', probe],
                                      env=env, cwd=lab, timeout=60)
            receipt['filesystem_probe'] = {'exit_code': code, 'stdout': stdout.decode(),
                                           'stderr': stderr.decode()}
            checks = json.loads(stdout) if code == 0 else {}
            code, stdout, stderr = run(sandbox + [str(lab / 'bin/gh'), 'api', 'rate_limit',
                                                 '--jq', '.resources.core.remaining'],
                                      env=env, cwd=lab, timeout=60)
            receipt['github_probe'] = {'exit_code': code, 'stdout': stdout.decode(),
                                      'stderr': stderr.decode()}
            gh_ok = code == 0 and stdout.strip().isdigit()
            command = [real_codex, '--no-daemon', 'debug', 'prompt-input', *options[3:],
                       '-c', 'model=' + toml(args.model), prompt.decode()]
            code, stdout, stderr = run(command, env=env, cwd=lab, timeout=60)
            args.output.write_bytes(stdout)
            forbidden = ('<skills_instructions>', str(host_home / '.agents'),
                         str(host_home / '.codex'), 'mcp__octocode', 'MAP.secret.txt')
            hits = [term for term in forbidden if term in stdout.decode(errors='replace')]
            receipt['prompt_probe'] = {'exit_code': code, 'forbidden_hits': hits,
                                      'stderr': stderr.decode(), 'bytes': len(stdout)}
            receipt['ok'] = (checks.get('visible') is True and bool(checks.get('denied'))
                             and all(checks['denied'].values()) and gh_ok and code == 0
                             and not hits)
            code = 0 if receipt['ok'] else 2
        else:
            command = [codex, '--no-daemon', 'exec', *options, '--ephemeral',
                       '--skip-git-repo-check', '-m', args.model, '-C', str(lab),
                       '-o', str(args.output), '-']
            code, stdout, stderr = run(command, env=env, cwd=lab,
                                      timeout=args.timeout, prompt=prompt)
            args.receipt.with_suffix('.stdout.log').write_bytes(stdout)
            args.receipt.with_suffix('.stderr.log').write_bytes(stderr)
            receipt['ok'] = code == 0 and args.output.is_file()
        receipt.update(exit_code=code, seconds=round(time.monotonic() - started, 3))
        args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
    return code


if __name__ == '__main__':
    raise SystemExit(main())
