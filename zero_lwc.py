"""Read-only completed public OHLCV iframe; independent of Streamlit reruns."""
from collections import OrderedDict
from datetime import datetime, timezone
import json
import locale
import sys
from math import isfinite
import re
import threading
import time
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

from starlette.concurrency import run_in_threadpool
from starlette.responses import HTMLResponse
from starlette.routing import Route

RANGES = {'1D': ('1d', '1m', 60), '1W': ('5d', '1m', 60), '1M': ('1mo', '60m', 3600),
          '3M': ('3mo', '1d', 86400), '1Y': ('1y', '1d', 86400), '5Y': ('5y', '1d', 86400)}
ETFS = frozenset('SPY QQQ TQQQ BIL UUP VNQ GLD TMF SCHD JEPQ JEPI SPYD HDV VYM NOBL'.split())
IDENTITY = re.compile(r'(US:[A-Z][A-Z0-9.-]{0,14}|KR:[0-9]{6})')
HEADERS = {'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
           'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
           'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'"}
_cache, _lock, _slots = OrderedDict(), threading.Lock(), threading.BoundedSemaphore(2)


def _decode(value):
    if isinstance(value, (bytes, str)):
        if len(value.encode('utf-8') if isinstance(value, str) else value) > 2_000_000:
            raise ValueError('PUBLIC_CHART_INVALID')
        value = json.loads(value)
    if not isinstance(value, dict):
        raise ValueError('PUBLIC_CHART_INVALID')
    return value


def _spec(identity, reader):
    market, symbol = identity.split(':')
    if market == 'US' and symbol in ETFS:
        return market, symbol
    if identity == 'KR:148020':
        return market, symbol + '.KS'
    research = _decode(reader('/api/research', {}))
    for universe in research.get('universes', []):
        board = universe.get('id')
        if market == 'KR' and board not in ('KOSPI', 'KOSDAQ'):
            continue
        for row in universe.get('rows', []):
            if row.get('id') == identity:
                return market, symbol + ('.KQ' if board == 'KOSDAQ' else '.KS') if market == 'KR' else symbol.replace('.', '-')
    raise ValueError('PUBLIC_IDENTITY_UNAVAILABLE')


def _clock(value, now):
    if not isinstance(value, str) or not re.search(r'T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$', value):
        raise ValueError('PUBLIC_CHART_INVALID')
    result = datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    if result > now:
        raise ValueError('PUBLIC_CHART_INVALID')
    return result


def validated_bars(data, identity, range_, spec, now):
    market, symbol = spec
    period, interval, seconds = RANGES[range_]
    if (data.get('schema_version') != 1 or data.get('identity') != identity or data.get('range') != range_
            or data.get('status') != 'AVAILABLE' or data.get('error_code') is not None
            or data.get('market') != market or data.get('currency') != ('USD' if market == 'US' else 'KRW')
            or data.get('interval') != interval or data.get('basis') != 'UNADJUSTED_PROVIDER_COMPLETED_OHLCV'):
        raise ValueError('PUBLIC_CHART_INVALID')
    source = urlsplit(data.get('source_url', ''))
    query = parse_qs(source.query, keep_blank_values=True)
    if (source.scheme != 'https' or source.netloc not in ('query1.finance.yahoo.com', 'query2.finance.yahoo.com')
            or source.path != '/v8/finance/chart/' + symbol or source.fragment
            or query != {'range': [period], 'interval': [interval], 'includePrePost': ['false']}):
        raise ValueError('PUBLIC_CHART_INVALID')
    checked = _clock(data.get('checked_at'), now)
    if now - checked > 86400:
        raise ValueError('PUBLIC_CHART_INVALID')
    observed = _clock(data.get('retrieved_at'), checked)
    bars = data.get('bars')
    if not isinstance(bars, list) or not 1 <= len(bars) <= 2200:
        raise ValueError('PUBLIC_CHART_INVALID')
    zone = ZoneInfo('Asia/Seoul' if market == 'KR' else 'America/New_York')
    observed_local = datetime.fromtimestamp(observed, zone)
    result, previous = [], 0
    for bar in bars:
        if not isinstance(bar, dict) or set(bar) not in ({'time','open','high','low','close','volume'}, {'time','open','high','low','close','volume','completed'}):
            raise ValueError('PUBLIC_CHART_INVALID')
        timestamp = bar.get('time')
        if type(timestamp) is not int or not previous < timestamp <= observed or bar.get('completed', True) is not True:
            raise ValueError('PUBLIC_CHART_INVALID')
        local = datetime.fromtimestamp(timestamp, zone)
        complete = local.weekday() < 5 and (timestamp + seconds <= observed if interval != '1d' else
            local.date() < observed_local.date() or local.date() == observed_local.date() and observed_local.hour * 60 + observed_local.minute >= (940 if market == 'KR' else 970))
        values = [bar.get(key) for key in ('open','high','low','close','volume')]
        if not complete or any(type(value) not in (int, float) or not isfinite(value) for value in values):
            raise ValueError('PUBLIC_CHART_INVALID')
        opened, high, low, closed, volume = values
        if not 0 < low <= min(opened, closed) <= max(opened, closed) <= high or volume < 0:
            raise ValueError('PUBLIC_CHART_INVALID')
        result.append({**bar, 'completed': True})
        previous = timestamp
    return result


def _document(identity, range_, height, reader, renderer):
    if not _slots.acquire(blocking=False):
        raise ValueError('PUBLIC_CHART_BUSY')
    try:
        spec = _spec(identity, reader)
        data = _decode(reader('/api/chart', {'identity': identity, 'range': range_}))
        bars = validated_bars(data, identity, range_, spec, time.time())
        key = (identity, range_, height, data['retrieved_at'])
        with _lock:
            hit = _cache.get(key)
            if hit and hit[0] > time.monotonic():
                _cache.move_to_end(key)
                return hit[1]
        document = renderer(bars, height=height)
        if not isinstance(document, str) or len(document.encode('utf-8')) > 2_000_000:
            raise ValueError('PUBLIC_CHART_INVALID')
        with _lock:
            _cache[key] = (time.monotonic() + 300, document)
            while len(_cache) > 16:
                _cache.popitem(last=False)
        return document
    finally:
        _slots.release()


async def lwc(request, *, reader=None, renderer=None):
    query = dict(request.query_params)
    if (request.method != 'GET' or set(query) != {'identity','range','height'}
            or len(request.query_params.multi_items()) != 3 or not IDENTITY.fullmatch(query.get('identity', ''))
            or query.get('range') not in RANGES or not re.fullmatch(r'[0-9]{3}', query.get('height', ''))
            or not 160 <= int(query['height']) <= 360):
        return HTMLResponse('PUBLIC_CHART_QUERY_INVALID', status_code=400, headers=HEADERS)
    try:
        if reader is None:
            from zero_proxy import get_public
            reader = get_public
        if renderer is None:
            if sys.platform == 'win32' and not sys.flags.utf8_mode and locale.getencoding().lower().replace('-', '') != 'utf8':
                return HTMLResponse('PUBLIC_CHART_DEPENDENCY_UTF8', status_code=503, headers=HEADERS)
            from zero_streamlit_chart import chart_document
            renderer = chart_document
        document = await run_in_threadpool(_document, query['identity'], query['range'], int(query['height']), reader, renderer)
    except Exception:
        # Fixed fallback never exposes upstream payloads, tokens or exception messages.
        return HTMLResponse('<p>차트를 불러오지 못했습니다. 창을 닫고 기본 차트를 이용하거나 다시 시도하세요.</p>', status_code=503, headers=HEADERS)
    return HTMLResponse(document, headers=HEADERS)


routes = [Route('/zero/lwc', lwc, methods=['GET'])]
