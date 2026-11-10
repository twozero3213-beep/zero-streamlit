"""10년 전에 1억원을 한 번에 넣었다면: S&P 500(SPY)·TQQQ·SOXL·SCHD의 참고 계산.

공개 월봉의 수정 종가(배당 재투자·액면분할 반영)와 원/달러 환율 월봉만 쓴다. 세금·수수료·환전 비용은 넣지 않는다.
과거를 되돌려 본 값이며 앞으로의 수익을 뜻하지 않는다. 계좌·주문과 무관하고 키를 쓰지 않는다.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import threading
import time
import urllib.request

CAPITAL_KRW = 100_000_000
SYMBOLS = (('SPY', 'S&P 500'), ('TQQQ', 'TQQQ'), ('SOXL', 'SOXL'), ('SCHD', 'SCHD'))
FX_SYMBOL = 'KRW=X'
CACHE_SECONDS = 6 * 3600
MIN_MONTHS = 110  # 10년치 월봉은 120개 안팎이다. 이보다 짧으면 10년 비교라고 부르지 않는다.
_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=10y&interval=1mo&events=div%2Csplit'
_cache = {'at': 0.0, 'body': None}
_lock = threading.Lock()


def _fetch(symbol):
    request = urllib.request.Request(_URL.format(symbol=symbol), headers={'User-Agent': 'ZERO-Decade-Reference/1.0', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.loads(response.read(4_000_000))


def monthly_series(payload, adjusted=True):
    """Yahoo chart 응답에서 (날짜, 값) 월별 목록을 꺼낸다. 값이 없거나 0 이하인 달은 버린다."""
    try:
        result = payload['chart']['result'][0]
        stamps = result['timestamp']
        indicators = result['indicators']
        values = indicators['adjclose'][0]['adjclose'] if adjusted else indicators['quote'][0]['close']
    except (KeyError, IndexError, TypeError):
        return []
    rows = []
    for stamp, value in zip(stamps, values):
        if isinstance(stamp, (int, float)) and isinstance(value, (int, float)) and value > 0:
            rows.append((datetime.fromtimestamp(stamp, timezone.utc).date().isoformat(), float(value)))
    return rows


def lump_sum(prices, fx, capital=CAPITAL_KRW):
    """prices·fx: (날짜, 값) 과거순 월별 목록. 시작 달에 capital원을 달러로 바꿔 사서 지금까지 들고 있었을 때."""
    if len(prices) < MIN_MONTHS or len(fx) < 2:
        return None
    fx_by_month = {day[:7]: value for day, value in fx}
    start_day, start_price = prices[0]
    end_day, end_price = prices[-1]
    fx_start, fx_end = fx_by_month.get(start_day[:7]), fx_by_month.get(end_day[:7])
    if not fx_start or not fx_end:
        return None
    multiple_usd = end_price / start_price
    multiple_krw = multiple_usd * fx_end / fx_start
    # 그림용: 해마다 1월(과 마지막 달)의 원화 평가액.
    points = []
    for day, price in prices:
        rate = fx_by_month.get(day[:7])
        if rate and (day[5:7] == '01' or day == end_day or day == start_day):
            points.append({'date': day, 'value_krw': round(capital * price / start_price * rate / fx_start)})
    return {
        'start_date': start_day, 'end_date': end_day,
        'return_percent_usd': (multiple_usd - 1) * 100,
        'return_percent_krw': (multiple_krw - 1) * 100,
        'value_krw': round(capital * multiple_krw),
        'fx_start': fx_start, 'fx_end': fx_end, 'points': points,
    }


def build(fetch=_fetch, now=None):
    """(상태 코드, 응답). 네 종목 중 계산된 것만 싣고, 하나도 없으면 503."""
    checked = (now or datetime.now(timezone.utc)).isoformat()
    base = {'schema_version': 1, 'scope': 'DECADE_LUMP_SUM_REFERENCE', 'capital_krw': CAPITAL_KRW,
            'basis': 'MONTHLY_ADJUSTED_CLOSE_DIVIDENDS_REINVESTED_WITH_FX', 'exclusions': ['TAX', 'FEES', 'FX_SPREAD'],
            'orders_authorized': False, 'retrieved_at': checked}
    try:
        fx = monthly_series(fetch(FX_SYMBOL), adjusted=False)
    except (OSError, ValueError):
        fx = []
    items, failed = [], []
    for symbol, label in SYMBOLS:
        try:
            result = lump_sum(monthly_series(fetch(symbol)), fx)
        except (OSError, ValueError):
            result = None
        if result is None:
            failed.append(symbol)
        else:
            items.append({'symbol': symbol, 'label': label, **result})
    if not items:
        return 503, {**base, 'state': 'UNAVAILABLE', 'items': [], 'failed': failed}
    return 200, {**base, 'state': 'AVAILABLE', 'items': items, 'failed': failed}


def get_decade_reference():
    """6시간 캐시. 실패한 응답은 캐시하지 않는다."""
    with _lock:
        if _cache['body'] is not None and time.time() - _cache['at'] < CACHE_SECONDS:
            return 200, _cache['body']
    status, body = build()
    if status == 200:
        with _lock:
            _cache.update(at=time.time(), body=body)
    return status, body
