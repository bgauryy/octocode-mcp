#!/usr/bin/env python3
"""Render the saved-run comparison and provisional quality audit as an inline HTML fragment."""
import argparse
import json
from pathlib import Path


def render(run):
    summary = json.loads((run / 'summary.json').read_text())
    comparison = json.loads((run / 'quality/comparison.json').read_text())
    quality = {q['id']: q for q in comparison['questions']}
    manifest = json.loads((run / 'run.json').read_text())
    rows = {(r['question'], r['arm']):r for r in summary['rows']}
    data = {'arms': summary['arms'], 'paired': summary['paired_retrieval_ratio_octocode_over_shell'], 'questions': []}
    keys = ('tool_input_tokens','visible_output_tokens','tool_rounds','tool_seconds_sum','errors','wall_seconds','status','oversized_output_calls_over_60k_chars')
    for question in manifest['questions']:
        ident = question['id']
        data['questions'].append({'id':ident, 'repo':question['repo'],
            'title':question['question'].splitlines()[0].lstrip('# '),
            'shell':{k:rows[(ident,'shell')].get(k) for k in keys},
            'octocode':{k:rows[(ident,'octocode')].get(k) for k in keys},
            'quality':quality.get(ident)})
    template = Path(__file__).with_name('comparison.html').read_text()
    template = template.replace('30 questions', str(len(data['questions'])) + ' questions')
    text = json.dumps(data, separators=(',',':')).replace('<', '\\u003c')
    return template.replace('__COMPARISON_DATA__', text)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    args.output.write_text(render(args.run.resolve(strict=True)))
    print(args.output)
