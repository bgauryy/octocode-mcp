#!/usr/bin/env python3
"""Quality-first comparisons of frozen partitions and prompt instructions."""
import json
import statistics
import sys
import tiktoken
from jev_question_poc_summary import measured_rows


def summarize(run):
    rows = measured_rows(run)
    raw = {(row['case'], row['arm']): row for row in run['rows']}
    for row in rows:
        row['verificationTokens'] = {}
        for encoding in ['o200k_base', 'cl100k_base']:
            enc = tiktoken.get_encoding(encoding)
            row['verificationTokens'][encoding] = sum(len(enc.encode(response['stdout'], disallowed_special=())) + len(enc.encode(response['argumentText'], disallowed_special=()))
                                                       for response in raw[(row['case'], row['arm'])]['responses'] if response['tool'] == 'localFetch')
    quality = lambda row: not row.get('error') and row.get('coverage', {}).get('complete', False)
    expected = {item['id'] for item in run['suite']}
    summaries = []
    for arm in ['full-read'] + [f'{mode}/{prompt}' for mode in run['partitions'] for prompt in run['prompts']]:
        group = [row for row in rows if row['arm'] == arm]
        ledger = [entry for entry in run['ledger'] if entry.get('arm') == arm]
        count = lambda key: sum(entry[key] for entry in ledger) if all(entry.get(key) is not None for entry in ledger) else None
        summary = {'arm': arm, 'expected': len(expected), 'completed': len(group), 'missing': sorted(expected - {row['case'] for row in group}),
                   'qualityPass': sum(quality(row) for row in group), 'factPass': sum(not row.get('error') and row.get('factCoverage', {}).get('complete', False) for row in group),
                   'errors': sum(bool(row.get('error')) for row in group), 'exchangeTokens': sum(row['tokens']['o200k_base']['exchange'] for row in group),
                   'verificationTokens': sum(row['verificationTokens']['o200k_base'] for row in group), 'providerCalls': len(ledger),
                   'providerInputTokens': count('inputTokens'), 'providerOutputTokens': count('outputTokens'), 'comparisons': {}}
        for baseline in ['lines-2k/current', 'full-read']:
            controls = {row['case']: row for row in rows if row['arm'] == baseline}
            pairs = [(row, controls[row['case']]) for row in group if row['case'] in controls]
            adequate = [(row, control) for row, control in pairs if quality(row) and quality(control)]
            summary['comparisons'][baseline] = {'missingPairs': len(expected) - len(pairs), 'adequatePairs': len(adequate),
                'wins': sum(quality(row) and not quality(control) for row, control in pairs), 'regressions': sum(quality(control) and not quality(row) for row, control in pairs),
                'medianExchangeRatiosOnAdequatePairs': {encoding: statistics.median(row['tokens'][encoding]['exchange'] / control['tokens'][encoding]['exchange'] for row, control in adequate) if adequate else None for encoding in ['o200k_base', 'cl100k_base']}}
        summaries.append(summary)
    return {'tokenizer': tiktoken.__version__, 'scope': run['policy']['accounting'], 'totals': run['totals'], 'summary': summaries, 'rows': rows}


if __name__ == '__main__':
    print(json.dumps(summarize(json.load(open(sys.argv[1]))), indent=2))
