"""Hermetic catalog-gate and path-denial checks for benchmark preflight."""
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import mcp_probe


READERS = {
    'localSearch', 'localFetch', 'structureSearch', 'astSearch', 'lspSearch',
    'ghSearchRepo', 'ghSearchCode', 'ghStructure', 'ghGetFileContent',
    'ghSearchHistory', 'ghGetHistoryItem', 'artifactSearch',
}


def tool(name, goals=False):
    properties = {'goals': {'type': 'array'}} if goals else {}
    return {'name': name, 'inputSchema': {'properties': {'queries': {'items': {'properties': properties}}}}}


class FakeClient:
    def __init__(self, tools):
        self.tools = tools
        self.calls = []
        self.proc = SimpleNamespace(stdin=SimpleNamespace(write=lambda _: None, flush=lambda: None))

    def call(self, method, params=None):
        self.calls.append((method, params))
        if method == 'initialize': return {'instructions': 'fixture'}
        if method == 'tools/list': return {'tools': self.tools}
        if method == 'tools/call':
            name = params['name']
            if name == 'clasify' and params['arguments']['queries'][0]['resources'][0]['tool'] == 'ghSearchRepo':
                return {'content': [{'text': 'ghSearchRepo is not available'}]}
            return {'content': [{'text': 'outsideAllowedRoots'}]}
        raise AssertionError(method)

    def close(self):
        pass


class McpProbeTests(unittest.TestCase):
    def receipt(self, names, goals, enabled, selected='', forbidden=None):
        fake = FakeClient([tool(name, name in goals) for name in names])
        server = {'env': {'TOOLS_TO_RUN': selected} if selected else {}}
        with patch.object(mcp_probe, 'McpClient', return_value=fake):
            result = mcp_probe.probe(server, enabled, enabled, forbidden=forbidden)
        return result, fake

    def test_full_catalog_expects_goals_on_only_four_readers(self):
        names = READERS | {'clasify'}
        expected = {'localSearch', 'localFetch', 'ghGetFileContent', 'ghSearchCode'}
        result, _ = self.receipt(names, expected, True)
        self.assertTrue(result['ok'], result['problems'])
        self.assertEqual(set(result['goalsTools']), expected)

    def test_local_allowlist_has_two_goals_and_preserves_denials(self):
        selected = 'localSearch,localFetch,structureSearch,astSearch,lspSearch,clasify'
        names = set(selected.split(','))
        result, fake = self.receipt(names, {'localSearch', 'localFetch'}, True,
                                    selected, Path('/private/forbidden.txt'))
        self.assertTrue(result['ok'], result['problems'])
        self.assertEqual(result['goalsTools'], ['localFetch', 'localSearch'])
        self.assertEqual(len(result['denials']), 3)
        self.assertTrue(all(row['denied'] for row in result['denials']))
        self.assertEqual([params['name'] for method, params in fake.calls if method == 'tools/call'],
                         ['localFetch', 'clasify', 'clasify'])

    def test_unexpected_goal_field_fails_even_on_selected_reader(self):
        selected = 'localSearch,localFetch,structureSearch,astSearch,lspSearch,clasify'
        names = set(selected.split(','))
        result, _ = self.receipt(names, {'localSearch', 'localFetch', 'structureSearch'},
                                 True, selected)
        self.assertFalse(result['ok'])
        self.assertIn('goals schema gate differs from eligible read tools', result['problems'])

    def test_off_arm_rejects_any_goal_field(self):
        selected = 'localSearch,localFetch,structureSearch,astSearch,lspSearch'
        names = set(selected.split(','))
        result, _ = self.receipt(names, {'localSearch'}, False, selected)
        self.assertFalse(result['ok'])
        self.assertIn('goals schema gate differs from eligible read tools', result['problems'])
