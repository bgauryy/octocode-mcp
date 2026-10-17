import json
import os
from pathlib import Path
import tempfile
import unittest
import subprocess
import sys
from unittest.mock import patch

import judge_codex


class IsolatedJudgeTests(unittest.TestCase):
    def test_github_pair_runs_with_no_local_read_paths_and_keeps_attempt(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            camp, questions, auth = (root / name for name in ('campaign', 'questions', 'auth'))
            for path in (camp, questions, auth):
                path.mkdir()
            (auth / 'auth.json').write_text('{}')
            (questions / 'Q1.md').write_text('# A fixture question\n')
            for arm in ('mcp', 'gh-lean'):
                run = camp / f'runs/{arm}-p1-Q1'
                run.mkdir(parents=True)
                (run / 'status.json').write_text('{"ok":true}')
                (run / 'answer.md').write_text('A fixture answer.')
                (camp / f'{arm}-p1-Q1.jsonl').write_text(
                    '{"kind":"answer","total_chars":17}\n')
            fake = root / 'fake-codex'
            fake.write_text('#!' + sys.executable + '\n' +
                'import json,pathlib,sys\n'
                'if "--version" in sys.argv: print("fixture"); raise SystemExit(0)\n'
                'value={"X":{"correctness":10,"depth":5,"workflow":5},'
                '"Y":{"correctness":10,"depth":5,"workflow":5},"winner":"tie","reason":"fixture"}\n'
                'pathlib.Path(sys.argv[sys.argv.index("-o")+1]).write_text('
                '"```json\\n"+json.dumps(value)+"\\n```\\n")\n')
            fake.chmod(0o700)
            env = dict(os.environ, CODEX_BIN=str(fake), CODEX_HOME=str(auth),
                       JUDGE_RUNNER='codex', JUDGE_MODEL='fixture', JUDGE_ATTEMPTS_USED='2',
                       QUESTION_DIR=str(questions), REAL_GH='/usr/bin/true')
            env.pop('BENCH_REAL_CODEX', None)
            script = Path(judge_codex.__file__).with_name('judge_pair.sh')
            command = ['/bin/bash', str(script), str(camp), 'mcp', 'gh-lean', '1', 'Q1']
            result = subprocess.run(command, env=env, capture_output=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            pair = camp / 'judge/mcp~gh-lean'
            self.assertTrue((pair / 'p1-Q1.md').is_file())
            self.assertNotIn('Authoritative metrics:', (pair / 'p1-Q1.packet.md').read_text())
            self.assertTrue((pair / 'attempts/p1-Q1/3/isolation.json').is_file())
            again = subprocess.run(command, env=env, capture_output=True, timeout=20)
            self.assertEqual(again.returncode, 0, again.stderr.decode())
            self.assertIn(b'already judged', again.stdout)
            self.assertEqual(len(list((pair / 'attempts/p1-Q1').iterdir())), 1)

    def test_private_auth_and_host_context_do_not_reach_tool_filesystem(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            host = root / 'host'
            auth = host / '.codex'
            auth.mkdir(parents=True)
            (auth / 'auth.json').write_text('{"test_auth":true}')
            (auth / 'config.toml').write_text('developer_instructions="CONTAMINATION"')
            (host / '.agents').mkdir()
            prompt, output, receipt = (root / name for name in ('prompt.md', 'verdict.md', 'receipt.json'))
            prompt.write_text('Unchanged blind judging input.\n')
            seen = {}

            def execute(command, *, env, cwd, timeout, prompt):
                seen.update(env=env, cwd=cwd, command=command)
                self.assertEqual(command[1:3], ['--no-daemon', 'exec'])
                self.assertEqual(timeout, 600)
                self.assertEqual(prompt, b'Unchanged blind judging input.\n')
                self.assertNotIn('HOST_ONLY_SECRET', env)
                self.assertNotEqual(env['HOME'], str(host))
                private = Path(env['CODEX_HOME'])
                self.assertEqual(sorted(path.name for path in private.iterdir()), ['auth.json'])
                self.assertFalse((private / 'auth.json').is_symlink())
                self.assertEqual((private / 'auth.json').stat().st_mode & 0o777, 0o600)
                self.assertNotIn('config.toml', str(list(cwd.iterdir())))
                self.assertTrue((cwd / 'bin/gh').is_file())
                output.write_text('Judgment')
                return 0, b'stdout preserved', b'stderr preserved'

            environment = {'HOME': str(host), 'CODEX_HOME': str(auth), 'CODEX_BIN': '/fake/codex',
                           'REAL_GH': '/usr/bin/true', 'HOST_ONLY_SECRET': 'must not inherit'}
            argv = ['judge_codex.py', '--model', 'gpt-6.1-sol', '--prompt', str(prompt),
                    '--output', str(output), '--receipt', str(receipt)]
            with patch.dict(os.environ, environment, clear=True), patch('sys.argv', argv), \
                    patch.object(judge_codex, 'run', side_effect=execute):
                self.assertEqual(judge_codex.main(), 0)
            data = json.loads(receipt.read_text())
            self.assertTrue(data['ok'])
            self.assertEqual(data['permissions']['filesystem'][str(host)], 'deny')
            self.assertEqual(data['permissions']['filesystem'][seen['env']['CODEX_HOME']], 'deny')
            self.assertIn('skip_host_skill_discovery', seen['command'])
            self.assertIn('skills.include_instructions=false', seen['command'])
            self.assertIn('skills.bundled.enabled=false', seen['command'])
            self.assertIn('mcp_servers={}', seen['command'])
            self.assertFalse(Path(seen['env']['CODEX_HOME']).exists())
            self.assertFalse(Path(seen['env']['HOME']).exists())
            self.assertEqual(receipt.with_suffix('.stdout.log').read_bytes(), b'stdout preserved')
            self.assertEqual(receipt.with_suffix('.stderr.log').read_bytes(), b'stderr preserved')

    def test_rejects_deadline_increase_before_auth_or_model_execution(self):
        argv = ['judge_codex.py', '--model', 'gpt-6.1-sol', '--prompt', 'input',
                '--output', 'output', '--receipt', 'receipt', '--timeout', '601']
        with patch('sys.argv', argv), patch.object(judge_codex, 'run') as execute, \
                self.assertRaises(SystemExit) as raised:
            judge_codex.main()
        self.assertEqual(raised.exception.code, 2)
        execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
