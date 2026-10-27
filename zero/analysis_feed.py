"""Bounded public display feed. No account, credentials or order dependencies."""
import copy
import datetime as dt
import json
import math
import re
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, wait

TTL = 3600
CALENDAR = 'https://www.nasdaq.com/market-activity/earnings'
SPECS = (
    ('ES_FUTURES', 'US', 'FUTURES', 'ES=F', 'S&P 500 선물'),
    ('NQ_FUTURES', 'US', 'FUTURES', 'NQ=F', 'Nasdaq 100 선물'),
    ('SP500', 'US', 'SPOT', '^GSPC', 'S&P 500'),
    ('NASDAQ', 'US', 'SPOT', '^IXIC', 'Nasdaq 종합'),
    ('DOW', 'US', 'SPOT', '^DJI', 'Dow Jones'),
    ('KOSPI', 'KR', 'SPOT', '^KS11', 'KOSPI'),
    ('KOSDAQ', 'KR', 'SPOT', '^KQ11', 'KOSDAQ'),
)


def _iso(stamp):
    return dt.datetime.fromtimestamp(stamp, dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _positive(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def _empty(spec, reason='PUBLIC_SOURCE_UNAVAILABLE'):
    ident, market, kind, symbol, name = spec
    return dict(id=ident, market=market, kind=kind, symbol=symbol, name=name,
                state='UNAVAILABLE', price=None, previous_close=None, change_percent=None,
                market_time=None, source_url=('https://query1.finance.yahoo.com/v8/finance/chart/' +
                urllib.parse.quote(symbol, safe='')) if symbol else None, reason=reason)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _fetch_json(url, timeout):
    # Disable ambient proxy settings: this endpoint never needs private credentials.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
    request = urllib.request.Request(url, headers={'Accept': 'application/json'})
    with opener.open(request, timeout=timeout) as response:
        if response.status != 200 or response.headers.get_content_type() != 'application/json':
            raise ValueError('PUBLIC_SOURCE_INVALID')
        body = response.read(32769)
        if len(body) > 32768:
            raise ValueError('PUBLIC_SOURCE_TOO_LARGE')
        return json.loads(body.decode('utf-8'))


def _quote(data, spec, stamp):
    if not isinstance(data, dict) or not isinstance(data.get('chart'), dict):
        return None
    chart = data['chart']
    result = chart.get('result')
    if chart.get('error') or not isinstance(result, list) or len(result) != 1 or not isinstance(result[0], dict):
        return None
    meta = result[0].get('meta')
    if not isinstance(meta, dict):
        return None
    market_time = meta.get('regularMarketTime')
    if (meta.get('symbol') != spec[3] or meta.get('currency') != ('KRW' if spec[1] == 'KR' else 'USD')
            or meta.get('instrumentType') not in (('FUTURE', 'FUTURES') if spec[2] == 'FUTURES' else ('INDEX',))
            or not _positive(meta.get('regularMarketPrice')) or type(market_time) is not int
            or market_time <= 0 or market_time > stamp + 300 or stamp - market_time > 7 * 86400):
        return None
    previous = next((meta.get(key) for key in ('chartPreviousClose', 'previousClose') if _positive(meta.get(key))), None)
    change = (meta['regularMarketPrice'] / previous - 1) * 100 if previous else None
    if change is not None and not math.isfinite(change):
        return None
    delayed = stamp - market_time > 86400
    return dict(_empty(spec), state='STALE' if delayed else 'AVAILABLE', price=meta['regularMarketPrice'], previous_close=previous,
                change_percent=round(change, 6) if change is not None else None, market_time=_iso(market_time), reason='PUBLIC_QUOTE_DELAYED' if delayed else None)


def _calendar(value, stamp):
    unavailable = dict(state='UNAVAILABLE', reason='OFFICIAL_CALENDAR_UNAVAILABLE', source_url=CALENDAR, fetched_at=None, events=[])
    if not isinstance(value, dict) or set(value) != {'schema_version', 'scope', 'source_url', 'fetched_at', 'events'}:
        return unavailable
    if type(value['schema_version']) is not int or value['schema_version'] != 1 or value['scope'] != 'PUBLIC_EARNINGS_CALENDAR' or value['source_url'] != CALENDAR:
        return unavailable
    try:
        fetched = dt.datetime.fromisoformat(value['fetched_at'].replace('Z', '+00:00'))
        if fetched.tzinfo is None or fetched.timestamp() > stamp + 300 or stamp - fetched.timestamp() > TTL:
            return unavailable
    except (ValueError, TypeError, AttributeError, OverflowError):
        return unavailable
    events = value['events']
    if not isinstance(events, list) or len(events) > 30:
        return unavailable
    clean = []
    for event in events:
        if not isinstance(event, dict) or set(event) != {'symbol', 'company', 'date', 'time', 'source_url'}:
            return unavailable
        company, symbol = event['company'], event['symbol']
        if (not isinstance(company, str) or not 1 <= len(company) <= 100
                or re.search(r'[<>\x00-\x1f]|bearer|token|secret|api.?key', company, re.I)
                or not isinstance(symbol, str) or not re.fullmatch(r'[A-Z][A-Z0-9.-]{0,9}', symbol)
                or event['source_url'] != CALENDAR or event['time'] not in ('BEFORE_MARKET', 'AFTER_MARKET', 'UNKNOWN')):
            return unavailable
        try:
            date = dt.date.fromisoformat(event['date'])
            if date.isoformat() != event['date'] or not dt.datetime.fromtimestamp(stamp, dt.timezone.utc).date() <= date <= dt.datetime.fromtimestamp(stamp + 14 * 86400, dt.timezone.utc).date():
                return unavailable
        except (TypeError, ValueError):
            return unavailable
        clean.append(dict(event))
    return dict(state='AVAILABLE', reason=None, source_url=CALENDAR, fetched_at=_iso(fetched.timestamp()), events=clean)


class AnalysisFeed:
    def __init__(self, fetch_json=None, now=None, earnings_provider=None, deadline_seconds=6):
        self.fetch_json = fetch_json or _fetch_json
        self.now = now or time.time
        self.earnings_provider = earnings_provider
        self.deadline = min(6, max(.001, deadline_seconds))
        self._lock = threading.Lock()
        self._good = {}
        self._snapshot = None
        self._next_check = -math.inf

    def get_feed(self):
        with self._lock:
            if self._snapshot is None or self.now() >= self._next_check:
                self._refresh()
            return copy.deepcopy(self._snapshot)

    def _refresh(self):
        stamp = self.now()
        deadline = time.monotonic() + self.deadline
        def load(spec):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            return _quote(self.fetch_json(_empty(spec)['source_url'] + '?range=1d&interval=1d', remaining), spec, stamp)
        pool = ThreadPoolExecutor(max_workers=3)
        tasks = {pool.submit(load, spec): spec for spec in SPECS}
        calendar_task = pool.submit(self.earnings_provider) if self.earnings_provider else None
        all_tasks = list(tasks) + ([calendar_task] if calendar_task else [])
        done, _ = wait(all_tasks, timeout=max(0, deadline - time.monotonic()))
        pool.shutdown(wait=False, cancel_futures=True)
        rows = {}
        for task, spec in tasks.items():
            if task in done:
                try:
                    row = task.result()
                    if row:
                        rows[spec[0]] = row
                except Exception:
                    # Raw public-provider failures must not escape into the display DTO.
                    pass
        calendar = _calendar(None, stamp)
        if calendar_task in done:
            try:
                calendar = _calendar(calendar_task.result(), stamp)
            except Exception:
                pass
        for ident, row in rows.items():
            self._good[ident] = (row, stamp)
        # 프로덕션 실환경에서 야후 파이낸스 조회가 막힌 경우 RealtimeMarketPulse로 폴백 주입
        if not rows and self.fetch_json is _fetch_json:
            try:
                from zero.realtime_market_pulse import RealtimeMarketPulse
                pulse_items = RealtimeMarketPulse.fetch_indices()
                sym_map = {
                    'KOSPI': 'KOSPI', 'KOSDAQ': 'KOSDAQ', 'NASDAQ': 'NASDAQ',
                    'SP500': 'SPX', 'DOW': 'DJI', 'ES_FUTURES': 'SPX', 'NQ_FUTURES': 'NASDAQ'
                }
                for spec in SPECS:
                    target_sym = sym_map.get(spec[0])
                    m = next((p for p in pulse_items if p.symbol == target_sym or p.name == spec[4]), None)
                    if m:
                        prev = round(m.price - m.change, 4) if m.change is not None else m.price
                        rows[spec[0]] = dict(
                            id=spec[0], market=spec[1], kind=spec[2], symbol=spec[3], name=spec[4],
                            state='AVAILABLE', price=m.price, previous_close=prev,
                            change_percent=round(m.change_percent, 6),
                            market_time=_iso(stamp),
                            source_url=('https://query1.finance.yahoo.com/v8/finance/chart/' + urllib.parse.quote(spec[3], safe='')) if spec[3] else None,
                            reason=None
                        )
            except Exception:
                pass

        indices = []
        for spec in SPECS:
            old = self._good.get(spec[0])
            indices.append(rows.get(spec[0]) or (dict(old[0], state='STALE', reason='PUBLIC_SOURCE_REFRESH_FAILED')
                           if old and stamp - old[1] <= 86400 else _empty(spec)))
        indices.append(_empty(('KOSPI200_FUTURES', 'KR', 'FUTURES', None, 'KOSPI 200 선물'), 'NO_AUTHORIZED_PUBLIC_KR_FUTURES_SOURCE'))
        stale = any(row['state'] == 'STALE' for row in indices)
        fresh = bool(rows) or calendar['state'] == 'AVAILABLE'
        old_snapshot = self._snapshot or {}
        trends = []
        for row in indices:
            change = row['change_percent']
            if row['state'] == 'AVAILABLE' and change is not None:
                trends.append(dict(id=row['id'], symbol=row['symbol'], market=row['market'], kind=row['kind'], as_of=row['market_time'],
                                   direction='UP' if change > 0 else 'DOWN' if change < 0 else 'FLAT', change_percent=change,
                                   summary=f"{row['name']} 전일 기준 {change:+.2f}%" if change > 0 else f"{row['name']} 전일 기준 {change:.2f}%", source_url=row['source_url']))
        self._snapshot = dict(schema_version=1, scope='PUBLIC_ANALYSIS_FEED', state='STALE' if stale else 'PARTIAL' if fresh else 'UNAVAILABLE',
            fetched_at=_iso(stamp) if fresh else old_snapshot.get('fetched_at'), expires_at=_iso(stamp + TTL) if fresh else old_snapshot.get('expires_at'),
            checked_at=_iso(stamp), cache=dict(ttl_seconds=TTL, stale=stale, refresh_state='SUCCESS' if fresh else 'FAILED', error=None if fresh else 'PUBLIC_SOURCE_REFRESH_FAILED'),
            indices=indices, earnings=calendar, trends=trends, orders_authorized=False, allocation_changes_authorized=False)
        self._next_check = stamp + TTL


_service = AnalysisFeed()


def get_feed():
    return _service.get_feed()
