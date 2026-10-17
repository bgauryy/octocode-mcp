#!/usr/bin/env python3
"""Audit saved local CLI evidence against checkout bytes; never grade semantics."""
import argparse
import collections
import hashlib
import json
import re
import subprocess
from pathlib import Path

NUMBERED = re.compile(r'^(\d+)\t(.*)$')
RG_LINE = re.compile(r'^(.+?):(\d+):(.*)$')
CITATION = re.compile(r'(?P<path>[\w./@+~-]+\.[A-Za-z0-9]+):(?P<start>\d+)(?:[-–](?P<end>\d+))?')
LIMITATIONS = [
    'Source-line fidelity and valid citation locations do not establish semantic correctness, relevance, or complete answers.',
    'Checks use the current checkout. Matching HEAD/status does not prove dirty file bytes matched at run time.',
    'Saved raw output may exceed host display limits; actual model-visible evidence and truncation are unknown.',
    'Unparsed, transformed, unnumbered and clipped content is not classified as matching or mismatching source.',
    'An offered continuation proves unread scope may exist; this audit does not infer that every offered page was required or left unfollowed.',
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


class Sources:
    def __init__(self, root, recorded_root=None):
        self.root = Path(root).resolve()
        self.recorded_root = Path(recorded_root).resolve() if recorded_root else self.root
        self.cache = {}
        self.tracked = None

    def resolve(self, name):
        p = Path(name)
        if p.is_absolute():
            p = p.resolve()
        if p.is_absolute() and p.is_relative_to(self.recorded_root):
            p = self.root / p.relative_to(self.recorded_root)
        p = p if p.is_absolute() else self.root / p
        p = p.resolve()
        return p if p == self.root or self.root in p.parents else None

    def citation_path(self, name):
        direct = self.resolve(name)
        if direct is not None and direct.is_file():
            return name, 'exact_path'
        if self.tracked is None:
            proc = subprocess.run(['git', '-C', str(self.root), 'ls-files', '-z'], capture_output=True, timeout=15)
            self.tracked = proc.stdout.decode('utf-8', 'replace').split('\0') if proc.returncode == 0 else []
        candidates = [p for p in self.tracked if p == name or p.endswith('/' + name)]
        if len(candidates) == 1:
            return candidates[0], 'unique_tracked_suffix'
        return name, 'ambiguous_suffix' if candidates else 'unresolved_path'

    def lines(self, name):
        p = self.resolve(name)
        if p is None or not p.is_file():
            return None
        if p not in self.cache:
            self.cache[p] = p.read_bytes().decode('utf-8', 'replace').splitlines()
        return self.cache[p]

    def check(self, path, line, value):
        lines = self.lines(path)
        if lines is None:
            return 'unresolved_path'
        if line < 1 or line > len(lines):
            return 'out_of_range'
        return 'exact' if lines[line - 1] == value else 'different'


def native_evidence(obj):
    """Yield only explicit source path plus numbered content; ignore hints/schemas."""
    if isinstance(obj, list):
        for x in obj:
            yield from native_evidence(x)
    elif isinstance(obj, dict):
        path = obj.get('path')
        if isinstance(path, str):
            texts = []
            if isinstance(obj.get('content'), str):
                texts.append(obj['content'])
            for match in obj.get('matches', []):
                if isinstance(match, dict) and isinstance(match.get('value'), str):
                    texts.append(match['value'])
            for text in texts:
                for row in text.splitlines():
                    match = NUMBERED.match(row)
                    if match:
                        yield path, int(match[1]), match[2]
        for key, value in obj.items():
            if key not in ('hints', 'instructions', 'echo', 'query', 'queries'):
                yield from native_evidence(value)


def signals(obj, counts):
    if isinstance(obj, list):
        for x in obj:
            signals(x, counts)
    elif isinstance(obj, dict):
        if obj.get('hasMore') is True:
            counts['hasMore_markers'] += 1
        if obj.get('filesScanned') == 0:
            counts['zero_files_scanned_rows'] += 1
        if obj.get('matchCount') == 0:
            counts['zero_match_rows'] += 1
        if obj.get('status') == 'empty':
            counts['empty_rows'] += 1
        if 'next' in obj or 'responsePagination' in obj:
            counts['continuation_containers'] += 1
        for key, value in obj.items():
            if ('clipped' in key.lower()) and value:
                counts['clipping_markers'] += 1
            if key not in ('hints', 'instructions', 'query', 'queries'):
                signals(value, counts)


def audit_arm(folder, root, recorded_root=None):
    sources = Sources(root, recorded_root)
    receipt_path = folder / 'tools.jsonl'
    receipts = [json.loads(x) for x in receipt_path.read_text().splitlines() if x.strip()] if receipt_path.exists() else []
    integrity = []
    evidence = collections.Counter()
    signal_counts = collections.Counter()
    examples = []
    retrieved = set()
    errors = 0
    parsed_outputs = 0
    oversize = 0
    for receipt in receipts:
        artifact = folder / ('tool-%03d.txt' % receipt['id'])
        if not artifact.exists():
            integrity.append({'artifact': artifact.name, 'status': 'missing'})
            continue
        raw = artifact.read_bytes()
        integrity.append({'artifact': artifact.name, 'status': 'verified' if sha(raw) == receipt.get('output_sha256') else 'hash_mismatch'})
        text = raw.decode('utf-8', 'replace')
        oversize += len(text) > 60000
        errors += bool(receipt.get('isError'))
        try:
            obj = json.loads(text)
            rows = native_evidence(obj)
            signals(obj, signal_counts)
        except ValueError:
            rows = ((m[1], int(m[2]), m[3]) for row in text.splitlines() for m in [RG_LINE.match(row)] if m)
        n = 0
        for path, line, value in rows:
            n += 1
            status = sources.check(path, line, value)
            evidence[status] += 1
            resolved = sources.resolve(path)
            if status == 'exact':
                retrieved.add((str(resolved), line))
            elif len(examples) < 20:
                examples.append({'artifact': artifact.name, 'path': path, 'line': line, 'status': status, 'returned': value[:300]})
        parsed_outputs += n > 0
    answer_path = folder / 'answer.md'
    answer = answer_path.read_text() if answer_path.exists() else ''
    citations = []
    for match in CITATION.finditer(answer):
        path, start, end = match['path'], int(match['start']), int(match['end'] or match['start'])
        resolved_name, resolution = sources.citation_path(path)
        lines = sources.lines(resolved_name)
        valid = lines is not None and 1 <= start <= end <= len(lines)
        resolved = sources.resolve(resolved_name)
        citations.append({'path': path, 'start': start, 'end': end,
                          'resolvedPath': resolved_name, 'resolution': resolution,
                          'location': 'valid' if valid else 'invalid_or_unresolved',
                          'exact_retrieved_start_line': bool(valid and (str(resolved), start) in retrieved)})
    return {
        'answerPresent': answer_path.exists(), 'answerSha256': sha(answer_path.read_bytes()) if answer_path.exists() else None,
        'artifactIntegrity': {'status': 'unknown_no_receipts' if not receipts else ('verified' if all(x['status'] == 'verified' for x in integrity) else 'failed'), 'receipts': len(receipts), 'artifacts': integrity, 'orphanArtifacts': sorted(p.name for p in folder.glob('tool-*.txt') if p.name not in {x['artifact'] for x in integrity})},
        'sourceEvidence': {'lineOccurrences': dict(evidence), 'uniqueExactLines': len(retrieved), 'outputsWithParsedSourceLines': parsed_outputs, 'outputsWithoutParsedSourceLines': len(receipts) - parsed_outputs, 'unverifiedExamples': examples},
        'citations': {'references': citations, 'validLocations': sum(x['location'] == 'valid' for x in citations), 'invalidOrUnresolved': sum(x['location'] != 'valid' for x in citations), 'retrievedStartLines': sum(x['exact_retrieved_start_line'] for x in citations)},
        'pagination': dict(signal_counts), 'errors': errors, 'outputsOver60000Chars': oversize,
        'semanticQuality': None, 'semanticQualityStatus': 'requires_independent_source_backed_judgment',
    }


def git_state(root):
    def git(*args):
        p = subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True, timeout=15)
        return p.stdout.strip() if p.returncode == 0 else None
    return {'head': git('rev-parse', 'HEAD'), 'status': git('status', '--porcelain')}


def run(run_dir, output):
    manifest = json.loads((run_dir / 'run.json').read_text())
    relocation_file = run_dir / 'relocation.json'
    mappings = json.loads(relocation_file.read_text()).get('sourceRootMappings', []) if relocation_file.exists() else []
    arms = sorted(p.name for p in run_dir.iterdir() if p.is_dir() and any((p / q['id'] / 'answer.md').exists() for q in manifest['questions']))
    questions = []
    states = {}
    seal_file = run_dir / 'seal.json'
    seals = json.loads(seal_file.read_text()).get('answer_sha256', {}) if seal_file.exists() else {}
    for q in manifest['questions']:
        root = q['path']
        for mapping in mappings:
            source = Path(root)
            previous = Path(mapping['from'])
            if source.is_relative_to(previous):
                root = str(Path(mapping['to']) / source.relative_to(previous))
                break
        if root not in states:
            states[root] = git_state(root)
        questions.append({'id': q['id'], 'questionSha256': q.get('question_sha256'), 'sourceRoot': root, 'recordedSourceRoot': q['path'],
                          'sourceState': dict(states[root], expectedHead=q.get('head'), headMatches=states[root]['head'] == q.get('head'), expectedStatus=q.get('status_before'), statusMatches=states[root]['status'] == (q.get('status_before') or '').strip()),
                          'arms': {arm: audit_arm(run_dir / arm / q['id'], root, q['path']) for arm in arms}})
    for question in questions:
        for arm, audit in question['arms'].items():
            expected = seals.get(arm + '/' + question['id'] + '/answer.md')
            audit['answerSeal'] = 'unknown_no_seal' if expected is None else ('verified' if audit['answerSha256'] == expected else 'hash_mismatch')
    totals = {}
    for arm in arms:
        rows = [q['arms'][arm] for q in questions]
        counts = collections.Counter()
        for row in rows:
            counts.update(row['sourceEvidence']['lineOccurrences'])
        totals[arm] = {'questions': len(rows), 'verifiedAnswerSeals': sum(x['answerSeal'] == 'verified' for x in rows), 'verifiedReceiptSets': sum(x['artifactIntegrity']['status'] == 'verified' for x in rows), 'sourceLineOccurrences': dict(counts), 'validCitationLocations': sum(x['citations']['validLocations'] for x in rows), 'invalidOrUnresolvedCitations': sum(x['citations']['invalidOrUnresolved'] for x in rows), 'semanticJudgments': 0}
    result = {'schemaVersion': 1, 'run': str(run_dir.resolve()), 'method': {'sourceComparison': 'Exact numbered UTF-8 source lines; CRLF and LF treated as line boundaries', 'citationResolution': 'Exact path, then unique git-tracked suffix; ambiguous suffixes stay unresolved', 'semanticScoring': 'Not performed by this deterministic audit'}, 'limitations': LIMITATIONS, 'totals': totals, 'questions': questions}
    output.mkdir(parents=True, exist_ok=True)
    (output / 'returned-data.json').write_text(json.dumps(result, indent=2) + '\n')
    for q in questions:
        (output / (q['id'] + '.returned-data.json')).write_text(json.dumps(q, indent=2) + '\n')
    report = ['# Returned-data audit', '', 'This is an integrity and source-location audit. Semantic answer quality remains unknown pending independent judging.', '', *['- ' + x for x in LIMITATIONS], '', '| Question | Arm | Receipts | Exact / different / unresolved lines | Valid / unresolved citations | Oversize outputs | Errors | Continuation markers |', '|---|---|---|---|---|---|---|---|']
    for q in questions:
        for arm, row in q['arms'].items():
            c = row['sourceEvidence']['lineOccurrences']; ci = row['citations']
            report.append('| %s | %s | %s | %s / %s / %s | %s / %s | %s | %s | %s |' % (q['id'], arm, row['artifactIntegrity']['status'], c.get('exact', 0), c.get('different', 0), c.get('unresolved_path', 0) + c.get('out_of_range', 0), ci['validLocations'], ci['invalidOrUnresolved'], row['outputsOver60000Chars'], row['errors'], row['pagination'].get('hasMore_markers', 0)))
    (output / 'returned-data.md').write_text('\n'.join(report) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = run(args.run, args.output or args.run / 'quality')
    print(json.dumps(result['totals'], indent=2))
