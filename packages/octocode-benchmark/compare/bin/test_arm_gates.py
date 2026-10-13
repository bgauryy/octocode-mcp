"""Arm configuration regressions using fake runners and a fake MCP process."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).parent


def executable(path, body):
    path.write_text(body)
    path.chmod(0o755)


FAKE_MCP = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
readers = {'localSearch','localFetch','structureSearch','astSearch','lspSearch','ghSearchRepo',
           'ghSearchCode','ghStructure','ghGetFileContent','ghSearchHistory','ghGetHistoryItem','artifactSearch'}
goals = {'localSearch','localFetch','ghGetFileContent','ghSearchCode'}
selected = os.getenv('TOOLS_TO_RUN', '')
names = set(selected.split(',')) if selected else set(readers) | {'clasify'}
ready = os.getenv('OCTOCODE_BETA') == 'true' and bool(os.getenv('OCTOCODE_CLASSIFICATION_API'))
if not ready: names.discard('clasify')
ranked = ready and os.getenv('OCTOCODE_RANKING_ENABLED') == 'true'
snapshot = {key: os.getenv(key) for key in ('OCTOCODE_BETA','OCTOCODE_RANKING_ENABLED','OCTOCODE_CLASSIFICATION_API','TOOLS_TO_RUN')}
with Path(os.environ['BENCH_TEST_ENV_LOG']).open('a') as log: log.write(json.dumps(snapshot) + '\\n')
for line in sys.stdin:
    request = json.loads(line)
    if 'id' not in request: continue
    method = request['method']
    if method == 'initialize': result = {'instructions': 'fixture'}
    elif method == 'tools/list':
        result = {'tools': [{'name': name, 'inputSchema': {'properties': {'goals': {}} if ranked and name in goals else {}}}
                            for name in sorted(names)]}
    elif method == 'tools/call':
        args = request['params']['arguments']
        remote = request['params']['name'] == 'clasify' and args['queries'][0]['resources'][0]['tool'] == 'ghSearchRepo'
        result = {'content': [{'type': 'text', 'text': 'ghSearchRepo is not available' if remote else 'outsideAllowedRoots'}]}
    else: raise RuntimeError(method)
    print(json.dumps({'jsonrpc':'2.0','id':request['id'],'result':result}), flush=True)
'''


class ArmGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        for name in ('gh', 'pi'):
            executable(self.bin / name, '#!/bin/sh\nexit 0\n')
        executable(self.bin / 'claude',
                   '#!/bin/sh\nprintf \'%s\\n\' \'{"type":"result","subtype":"success","result":"fixture"}\'\n')
        self.fake_mcp = self.root / 'fake_mcp.py'
        executable(self.fake_mcp, FAKE_MCP)
        self.questions = self.root / 'questions'
        self.questions.mkdir()
        (self.questions / 'Q1.md').write_text('## Question\nFixture?\n')
        self.local_repos = self.root / 'repos'
        self.local_repos.mkdir()
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ['PATH'],
                        RUNNER='claude', QUESTION_DIR=str(self.questions), LOCAL_REPOS=str(self.local_repos),
                        OCTO_MCP_CMD=f'{sys.executable} {self.fake_mcp}',
                        OCTOCODE_CLASSIFICATION_API='fixture-key',
                        BENCH_TEST_ENV_LOG=str(self.root / 'mcp-env.jsonl'))

    def test_run_arm_keeps_beta_on_for_both_local_and_github_arms(self):
        campaign = self.root / 'campaign'
        for arm in ('mcp', 'mcp-clasify', 'local-mcp', 'local-mcp-clasify'):
            result = subprocess.run(['bash', str(HERE / 'run_arm.sh'), str(campaign), arm, '1', 'Q1'],
                                    env=self.env, capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, (arm, result.stderr, result.stdout))
            server = json.loads((campaign / 'runs' / f'{arm}-p1-Q1' / 'mcp.json').read_text())['mcpServers']['octocode']
            configured = server['env']
            enabled = 'clasify' in arm
            self.assertEqual(configured['OCTOCODE_BETA'], 'true')
            self.assertEqual(configured['OCTOCODE_RANKING_ENABLED'], str(enabled).lower())
            if enabled:
                self.assertNotIn('OCTOCODE_CLASSIFICATION_API', configured)
            else:
                self.assertEqual(configured['OCTOCODE_CLASSIFICATION_API'], '')

    def test_preflight_keeps_beta_constant_and_checks_real_gate_receipts(self):
        for arm in ('mcp', 'mcp-clasify', 'local-mcp', 'local-mcp-clasify'):
            result = subprocess.run(['bash', str(HERE / 'preflight.sh'), arm], env=self.env,
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, (arm, result.stderr, result.stdout))
            snapshot = json.loads((self.root / 'mcp-env.jsonl').read_text().splitlines()[-1])
            enabled = 'clasify' in arm
            self.assertEqual(snapshot['OCTOCODE_BETA'], 'true')
            self.assertEqual(snapshot['OCTOCODE_RANKING_ENABLED'], str(enabled).lower())
            self.assertEqual(snapshot['OCTOCODE_CLASSIFICATION_API'], 'fixture-key' if enabled else '')
            self.assertIn('root denial', result.stdout)
