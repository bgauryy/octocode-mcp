#!/usr/bin/env python3
"""Audit a saved native CLI/shell exploration; join quality with measured exchanges."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from audit_local_results import run as audit_run


def build_comparison(run, returned):
    summary = json.loads((run / 'summary.json').read_text())
    semantic_path = run / 'quality/semantic/audit.json'
    semantic = json.loads(semantic_path.read_text()) if semantic_path.exists() else {}
    judgments = {q['id']: q for q in semantic.get('questions', [])}
    acceptance_path = run / 'quality/semantic/acceptance.json'
    acceptance = json.loads(acceptance_path.read_text()) if acceptance_path.exists() else {}
    if acceptance and acceptance.get('inputAuditSha256') != hashlib.sha256(semantic_path.read_bytes()).hexdigest():
        raise ValueError('Acceptance refers to a different semantic audit')
    accepted = {q['id']:q for q in acceptance.get('questions', [])}
    evidence = {q['id']: q for q in returned['questions']}
    metrics = {(r['question'], r['arm']): r for r in summary['rows']}
    manifest = json.loads((run / 'run.json').read_text())
    questions = []
    for question in manifest['questions']:
        ident = question['id']
        grade = judgments.get(ident)
        review = accepted.get(ident, {})
        arms = {}
        for arm in ('shell', 'octocode'):
            answer = run / arm / ident / 'answer.md'
            answer_sha = hashlib.sha256(answer.read_bytes()).hexdigest()
            quality = (grade or {}).get('arms', {}).get(arm)
            accepted_arm = review.get('arms', {}).get(arm)
            for assessment in (quality, accepted_arm):
                if assessment and assessment.get('answerSha256') != answer_sha:
                    raise ValueError('Assessment answer hash mismatch: ' + arm + '/' + ident)
            arms[arm] = {
                'answerSha256': answer_sha,
                'metrics': metrics.get((ident, arm)),
                'returnedData': evidence.get(ident, {}).get('arms', {}).get(arm),
                'quality': quality,
                'acceptance': accepted_arm,
            }
        questions.append({'id': ident, 'repo': question['repo'],
                          'title': question['question'].splitlines()[0].lstrip('# '),
                          'qualityStatus': (grade or {}).get('status', 'pending'),
                          'acceptanceConclusion': review.get('checkedConclusion'),
                          'disagreements': review.get('disagreements', []),
                          'checkedSources': (grade or {}).get('checkedSources', []), 'arms': arms})
    return {'schemaVersion': 1, 'run': str(run), 'initialPromptIncluded': False,
            'providerInputTokens': None, 'providerOutputTokens': None,
            'limitations': [
                'Original normalized raw retrieval counts are not provider or model-visible tokens.',
                'Q07 shell research has no valid receipt; excluded from paired efficiency.',
                'Semantic scores are provisional independent source audits, not a blind isolated campaign.',
                'No quality-equivalent efficiency winner is declared from partial claim checks.',
                'Original answers and measurements are preserved; audit costs are separate.',
            ], 'semanticAudit': {k:v for k,v in semantic.items() if k != 'questions'},
            'questions': questions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True, type=Path, help='Saved exploration directory containing run.json and sealed answer/tool artifacts')
    args = parser.parse_args()
    run = args.run.resolve(strict=True)
    returned = audit_run(run, run / 'quality')
    result = build_comparison(run, returned)
    destination = run / 'quality/comparison.json'
    destination.write_text(json.dumps(result, indent=2) + '\n')
    rows = ['# Quality-aware saved-run comparison', '',
            'Original answers are sealed. Source fidelity, semantic quality and efficiency are separate.', '',
            'Semantic grades below are provisional claim audits; they do not establish full quality equivalence.', '',
            '| Question | Shell confirmed corrections | Octocode confirmed corrections | Review disagreements |',
            '|---|---:|---:|---|']
    for q in result['questions']:
        counts = []
        for arm in ('shell','octocode'):
            review = q['arms'][arm]['acceptance']
            counts.append(sum(f['acceptance'] == 'supported_factual_correction' for f in review['findings']) if review else 'unknown')
        rows.append(f"| {q['id']} | {counts[0]} | {counts[1]} | {'; '.join(q['disagreements']) or 'none recorded'} |")
    rows += ['', 'Counts are checked audit findings, not exhaustive error totals or accuracy scores. Provisional numeric estimates remain in the original semantic audit; acceptance does not validate them.', '']
    for q in result['questions']:
        rows += ['## ' + q['id'], '', q.get('acceptanceConclusion') or 'Acceptance pending', '']
    rows += ['', '## Limits', ''] + ['- ' + text for text in result['limitations']]
    (run / 'quality/comparison.md').write_text('\n'.join(rows) + '\n')
    print(destination)


if __name__ == '__main__':
    main()
