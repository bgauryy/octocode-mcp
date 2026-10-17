#!/usr/bin/env python3
"""Discover public question files and resolve selectors without a fixed catalog size."""
from pathlib import Path
import argparse
import re


def discover(directory):
    rows = {}
    for path in sorted(Path(directory).glob('*.md')):
        match = re.fullmatch(r'Q(\d+)', path.stem) or re.match(r'(\d+)-', path.stem)
        if not match:
            continue
        number = int(match.group(1))
        if number in rows:
            raise ValueError('Duplicate question number: ' + str(number))
        rows[number] = path
    if not rows:
        raise ValueError('No numbered questions found in ' + str(directory))
    return rows


def resolve(directory, selector):
    rows = discover(directory)
    if selector in {p.stem for p in rows.values()}:
        return next(p for p in rows.values() if p.stem == selector)
    match = re.fullmatch(r'Q?(\d+)', selector)
    if match and int(match.group(1)) in rows:
        return rows[int(match.group(1))]
    raise ValueError('Unknown question: ' + selector)


def select(directory, selector='all'):
    rows = discover(directory)
    if selector == 'all':
        return [f"Q{n}" for n in sorted(rows)]
    match = re.fullmatch(r'(\d+)-(\d+)', selector)
    if match:
        start, end = map(int, match.groups())
        if start > end:
            raise ValueError('Reversed question range')
        missing = set(range(start, end + 1)) - rows.keys()
        if missing:
            raise ValueError('Missing questions: ' + ', '.join(map(str, sorted(missing))))
        return [f"Q{n}" for n in range(start, end + 1)]
    selected = [next(f'Q{n}' for n, p in rows.items() if p == resolve(directory, s)) for s in selector.split(',')]
    if len(set(selected)) != len(selected):
        raise ValueError('Duplicate question selection')
    return selected


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('selector', nargs='?', default='all')
    parser.add_argument('--resolve', action='store_true')
    args = parser.parse_args()
    try:
        if args.resolve:
            print(resolve(args.directory, args.selector).resolve())
        else:
            print('\n'.join(select(args.directory, args.selector)))
    except ValueError as error:
        parser.exit(2, str(error) + '\n')
