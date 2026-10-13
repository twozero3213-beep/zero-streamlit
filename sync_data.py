"""Refresh data/ from a ZERO checkout's committed zero/data, keeping only what the viewer shows.

usage: python sync_data.py <path-to-zero-checkout> [rev]    (rev defaults to HEAD)
Reads committed content with `git show`, so uncommitted work in the checkout never leaks.
"""
import json
import subprocess
import sys
from pathlib import Path

FILES = ['research_connections', 'team_staff', 'crisis_history', 'us_data_sources', 'briefing_sources', 'research_tools']
# Internal fields (work orders, code module paths, evidence gaps, acceptance rules) are dropped from the public copy.
STAFF_KEYS = ('id', 'owner', 'name', 'priority', 'inputs', 'reviewer', 'mandate', 'outputs')
STAFF_TOP = ('schema_version', 'reviewed_on', 'authority', 'fictional_roles')
CRISIS_KEYS = ('id', 'name', 'period', 'lessons', 'hypotheses')
CRISIS_TOP = ('schema_version', 'research_as_of_kst', 'research_status', 'known_at_policy',
              'model_training_completed', 'orders_authorized', 'outperformance_validated')


def pick(source, keys):
    return {k: source[k] for k in keys if k in source}


def trim(name, data):
    if name == 'team_staff':
        return {**pick(data, STAFF_TOP), 'staff': [pick(s, STAFF_KEYS) for s in data['staff']]}
    if name == 'crisis_history':
        return {**pick(data, CRISIS_TOP), 'events': [pick(e, CRISIS_KEYS) for e in data['events']]}
    return data


if __name__ == '__main__':
    code, rev = Path(sys.argv[1]), (sys.argv[2] if len(sys.argv) > 2 else 'HEAD')
    out = Path(__file__).parent / 'data'
    for name in FILES:
        text = subprocess.run(['git', '-C', str(code), 'show', f'{rev}:zero/data/{name}.json'],
                              capture_output=True, check=True, encoding='utf-8').stdout
        (out / f'{name}.json').write_text(json.dumps(trim(name, json.loads(text)), ensure_ascii=False, indent=1) + '\n',
                                          encoding='utf-8')
    print('synced', rev, subprocess.run(['git', '-C', str(code), 'rev-parse', '--short', rev],
                                        capture_output=True, encoding='utf-8').stdout.strip())
