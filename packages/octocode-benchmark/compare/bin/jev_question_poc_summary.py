#!/usr/bin/env python3
"""Tokenize exact captured exchanges; never infer host billing or drop failed tasks."""
import collections
import hashlib
import json
import pathlib
import statistics
import sys
import tiktoken


def measured_rows(run):
    encoders = {name: tiktoken.get_encoding(name) for name in ('o200k_base', 'cl100k_base')}
    rows = []
    for original in run['rows']:
        row = {key: value for key, value in original.items() if key != 'responses'}
        row['tokens'] = {}
        for name, encoding in encoders.items():
            count = lambda text: len(encoding.encode(text, disallowed_special=()))
            responses = sum(count(r['stdout']) for r in original['responses'])
            arguments = sum(count(r['argumentText']) for r in original['responses'])
            row['tokens'][name] = {'responses': responses, 'arguments': arguments, 'exchange': responses + arguments}
        row['responseHashes'] = [hashlib.sha256(r['stdout'].encode()).hexdigest() for r in original['responses']]
        rows.append(row)
    return rows


def summarize(run):
    rows = measured_rows(run)
    groups = collections.defaultdict(list)
    for lane, arms in {'judgment': run['styles'], 'novelty': ['relevant', 'adds'],
                       'selection': ['full-read', 'direct-search', 'source-prefix', 'goals-compound', 'goals-atomic',
                                     'locate-compound', 'locate-atomic', 'locate-atomic-evidence']}.items():
        for arm in arms:
            groups[(lane, arm)] = []
    for row in rows:
        groups[(row['lane'], row['arm'])].append(row)
    summary = []
    for (lane, arm), items in groups.items():
        expected = len(run['suite'][{'selection': 'locate'}.get(lane, lane)])
        expected_ids = {item['id'] for item in run['suite'][{'selection': 'locate'}.get(lane, lane)]}
        missing_ids = sorted(expected_ids - {item['case'] for item in items})
        quality = lambda row: not row.get('error') and (row.get('coverage', {}).get('complete', False) if lane == 'selection' else row.get('correct', False))
        provider = [entry for entry in run['ledger'] if entry.get('lane') == lane and entry.get('arm') == arm]
        total = lambda key: sum(p[key] for p in provider) if all(p.get(key) is not None for p in provider) else None
        entry = {'lane': lane, 'arm': arm, 'completed': len(items), 'expected': expected, 'missingCases': missing_ids,
                 'eligibleForComparison': not missing_ids and not any(row.get('error') for row in items), 'qualityPass': sum(quality(row) for row in items),
                 'errors': sum(bool(row.get('error')) for row in items), 'providerCalls': len(provider),
                 'providerInputTokens': total('inputTokens'), 'providerOutputTokens': total('outputTokens'),
                 'responseTokens': sum(row['tokens']['o200k_base']['responses'] for row in items),
                 'argumentTokens': sum(row['tokens']['o200k_base']['arguments'] for row in items),
                 'medianMs': statistics.median(row['ms'] for row in items) if items else None}
        if lane in ('judgment', 'novelty'):
            entry['falsePositive'] = sum(row.get('decision') is True and row.get('expected') is False for row in items)
            entry['falseNegative'] = sum(row.get('decision') is False and row.get('expected') is True for row in items)
            entry['unknown'] = sum(row.get('decision') is None for row in items)
        if lane == 'selection':
            for baseline in ['full-read', 'direct-search']:
                controls = {r['case']: r for r in rows if r['lane'] == lane and r['arm'] == baseline}
                pairs = [(row, controls[row['case']]) for row in items if row['case'] in controls]
                ratios = [row['tokens']['o200k_base']['responses'] / control['tokens']['o200k_base']['responses'] for row, control in pairs if quality(row) and quality(control)]
                entry[baseline] = {'missingPairs': expected - len(pairs),
                                   'qualityRegressions': sum(quality(control) and not quality(row) for row, control in pairs),
                                   'qualityWins': sum(quality(row) and not quality(control) for row, control in pairs),
                                   'adequatePairs': len(ratios), 'medianResponseRatioOnAdequatePairs': statistics.median(ratios) if ratios else None}
        summary.append(entry)
    return {'tokenizer': {'library': 'tiktoken', 'version': tiktoken.__version__, 'encodings': ['o200k_base', 'cl100k_base'],
                          'scope': 'Exact CLI stdout and serialized arguments. Excludes host framing, schema loading, history replay, reasoning and final answer; not observed model usage.'},
            'totals': run['totals'], 'summary': summary, 'rows': rows}


def summarize_expansion(run):
    original = summarize(json.loads(pathlib.Path(run['sourceRun']).read_text()))
    rows = measured_rows(run)
    groups = collections.defaultdict(list)
    for row in rows:
        groups[(row['arm'], row['surrounding'])].append(row)
    summary = []
    for (arm, surrounding), items in groups.items():
        entry = {'arm': arm, 'surrounding': surrounding, 'completed': len(items),
                 'qualityPass': sum(row.get('coverage', {}).get('complete', False) and not row.get('error') for row in items),
                 'responseTokens': sum(row['tokens']['o200k_base']['responses'] for row in items),
                 'argumentTokens': sum(row['tokens']['o200k_base']['arguments'] for row in items)}
        for baseline in ['full-read', 'direct-search']:
            controls = {row['case']: row for row in original['rows'] if row['lane'] == 'selection' and row['arm'] == baseline}
            ratios = {name: [] for name in ['responses', 'exchange']}
            for row in items:
                if row.get('error') or not row.get('coverage', {}).get('complete'):
                    continue
                control = controls[row['case']]
                if not control.get('coverage', {}).get('complete'):
                    continue
                for name in ratios:
                    ratios[name].append(row['tokens']['o200k_base'][name] / control['tokens']['o200k_base'][name])
            entry[baseline] = {'adequatePairs': len(ratios['responses']),
                               'qualityRegressions': sum(not row.get('coverage', {}).get('complete', False) or bool(row.get('error')) for row in items),
                               'medianRatiosOnAdequatePairs': {name: statistics.median(values) if values else None for name, values in ratios.items()}}
        summary.append(entry)
    return {'tokenizer': original['tokenizer'], 'exposure': run['exposure'], 'newProviderCalls': 0, 'summary': summary, 'rows': rows}


if __name__ == '__main__':
    source = pathlib.Path(sys.argv[1])
    run = json.loads(source.read_text())
    print(json.dumps(summarize_expansion(run) if 'sourceRun' in run else summarize(run), indent=2))
