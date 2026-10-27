"""Shared background checks of keyless public material; no owner writes or account imports."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
import json
import threading
import time

import zero_macro
import zero_gauges
import zero_reports

_lock = threading.Lock()
_snapshot = {}
_running = False
_next_check = 0.0
INTERVAL = 900
_bls_cache = {}
_bls_requests = []
_bls_checked_at = None


def read_bls(client, *, payload):
    global _bls_checked_at
    key = (tuple(payload['seriesid']), payload['startyear'], payload['endyear'])
    recent = int(payload['endyear']) == datetime.now(timezone.utc).year
    now = time.monotonic()
    hit = _bls_cache.get(key)
    if not hit or hit[0] <= now:
        _bls_requests[:] = [at for at in _bls_requests if now - at < 86400]
        if len(_bls_requests) >= 25:
            raise ValueError('HTTP_RATE_LIMITED')
        _bls_requests.append(now)
        body = client.read(zero_macro.BLS_URL, payload=payload)
        data = json.loads(body)
        if data.get('status') != 'REQUEST_SUCCEEDED' or not data.get('Results', {}).get('series'):
            return body
        hit = (now + (3600 if recent else 604800), body, datetime.now(timezone.utc).isoformat())
        if len(_bls_cache) >= 4:
            _bls_cache.clear()
        _bls_cache[key] = hit
    if recent:
        _bls_checked_at = hit[2]
    return hit[1]


def _merge_macro(rows, previous):
    known = {row['id']: row for row in previous}
    for row in rows:
        if row['latest_value'] is None or not row['history']:
            continue
        old = known.get(row['id'])
        if old and row.get('latest_period') and old.get('latest_period') and row['latest_period'] < old['latest_period']:
            continue
        if old is None or datetime.fromisoformat(row['retrieved_at']) >= datetime.fromisoformat(old['retrieved_at']):
            known[row['id']] = row
    return list(known.values())


ERRORS = (OSError, ValueError, KeyError, TypeError, ArithmeticError)


def _part(future, fallback, failed, code):
    """One collector failing must not discard the others (a macro error used to drop fresh report indexes)."""
    try:
        return future.result()
    except ERRORS:
        failed.append(code)
        return fallback


def _refresh(previous):
    global _snapshot, _running, _next_check
    result = None
    delay = 60
    try:
        failed = []
        with ThreadPoolExecutor(max_workers=3) as pool:
            macro = pool.submit(zero_macro.collect_macro)
            gauges = pool.submit(zero_gauges.collect_gauges)
            reports = pool.submit(zero_reports.collect_briefing_sources, previous.get('briefing_sources'))
            rows = _part(macro, [], failed, 'MACRO_CHECK_FAILED') + _part(gauges, [], failed, 'GAUGES_CHECK_FAILED')
            library = _part(reports, None, failed, 'REPORTS_CHECK_FAILED')
        for row in rows:
            if row.get('source_url') == zero_macro.BLS_URL and row['latest_value'] is not None and _bls_checked_at:
                row['retrieved_at'] = _bls_checked_at
        failed += [row['id'] for row in rows if row['latest_value'] is None or not row['history']]
        sources = library['sources'] if library else []
        failed += [source['id'] for source in sources if source['status'] != 'AVAILABLE']
        available = any(row['latest_value'] is not None and row['history'] for row in rows) or any(source['status'] == 'AVAILABLE' for source in sources)
        if not rows and library is None:
            raise ValueError('PUBLIC_RESEARCH_CHECK_FAILED')
        result = dict(macro=rows, checked_at=datetime.now(timezone.utc).isoformat(), state='PARTIAL' if failed else 'CURRENT', failed=failed)
        if library is not None:
            result['library'] = library
        delay = INTERVAL if available else 60
    except ERRORS:
        result = dict(checked_at=datetime.now(timezone.utc).isoformat(), state='UNAVAILABLE', failed=['PUBLIC_RESEARCH_CHECK_FAILED'])
        delay = 60
    finally:
        with _lock:
            if result is not None:
                if 'macro' in result:
                    result['macro'] = _merge_macro(result['macro'], _snapshot.get('macro', []))
                result = {**_snapshot, **result}
                _snapshot = result
            _next_check = time.monotonic() + delay
            _running = False


def overlay(base, copy=True):
    """Respond immediately with prior values while one server-wide check runs.

    Pass copy=False when base is already private (freshly parsed JSON) to skip a deep copy of the whole desk."""
    global _running
    with _lock:
        start = not _running and time.monotonic() >= _next_check
        if start:
            _running = True
        current = deepcopy(_snapshot)
        running = _running
        remaining = max(0, round(_next_check - time.monotonic()))
    result = deepcopy(base) if copy else base
    result['macro'] = _merge_macro(current.get('macro', []), result.get('macro', []))
    if not result.get('macro'):
        from zero.macro_indicators import VERIFIED_MACRO_ITEMS
        result['macro'] = VERIFIED_MACRO_ITEMS
    library = current.get('library')
    old_library = result.get('briefing_sources')
    if library and (not old_library or datetime.fromisoformat(library['as_of']) >= datetime.fromisoformat(old_library['as_of'])):
        result['briefing_sources'] = library
    result['refresh'] = dict(state='UPDATING' if running else current.get('state', 'UNAVAILABLE'),
                             checked_at=current.get('checked_at'), interval_seconds=INTERVAL,
                             retry_after_seconds=remaining, failed=current.get('failed', []))
    if start:
        threading.Thread(target=_refresh, args=(deepcopy(result),), name='zero-public-research', daemon=True).start()
    return result
