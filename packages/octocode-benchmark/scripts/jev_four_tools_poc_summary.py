#!/usr/bin/env python3
"""Four-tool paired context accounting; failures and missing cases remain explicit."""
import json
import statistics
import sys
from jev_question_poc_summary import measured_rows


def summarize(run):
    rows = measured_rows(run)
    expected = {item['id'] for item in run['suite']}
    quality = lambda row: not row.get('error') and row.get('coverage', {}).get('complete', False)
    groups = []
    for tool in run['tools']:
        controls = {row['case']: row for row in rows if row['tool'] == tool and row['arm'] == 'direct'}
        for arm in run['policy']['arms'][tool]:
            items = [row for row in rows if row['tool'] == tool and row['arm'] == arm]
            ledger = [entry for entry in run['ledger'] if entry.get('tool') == tool and entry.get('arm') == arm]
            total = lambda key: sum(entry[key] for entry in ledger) if all(entry.get(key) is not None for entry in ledger) else None
            paired = [(row, controls[row['case']]) for row in items if row['case'] in controls]
            adequate = [(row, control) for row, control in paired if quality(row) and quality(control)]
            groups.append({
                'tool': tool, 'arm': arm, 'expected': len(expected), 'completed': len(items),
                'missingCases': sorted(expected - {row['case'] for row in items}),
                'qualityPass': sum(quality(row) for row in items), 'errors': sum(bool(row.get('error')) for row in items),
                'responseTokens': sum(row['tokens']['o200k_base']['responses'] for row in items),
                'argumentTokens': sum(row['tokens']['o200k_base']['arguments'] for row in items),
                'exchangeTokens': sum(row['tokens']['o200k_base']['exchange'] for row in items),
                'providerCalls': len(ledger), 'providerInputTokens': total('inputTokens'), 'providerOutputTokens': total('outputTokens'),
                'directControl': {'missingPairs': len(expected) - len(paired), 'adequatePairs': len(adequate),
                                  'qualityRegressions': sum(quality(control) and not quality(row) for row, control in paired),
                                  'medianExchangeRatioOnAdequatePairs': statistics.median(row['tokens']['o200k_base']['exchange'] / control['tokens']['o200k_base']['exchange'] for row, control in adequate) if adequate else None},
            })
    return {'scope': run['policy']['tokenizer'], 'totals': run['totals'], 'summary': groups, 'rows': rows}


if __name__ == '__main__':
    print(json.dumps(summarize(json.load(open(sys.argv[1]))), indent=2))
