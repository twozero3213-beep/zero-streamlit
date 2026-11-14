"""장 전 점검표: 한국 장이 열리기 전에 보는 밤사이 해외 지표(Yahoo Finance 공개 일봉, 키 없음).

디시 주식 갤러리에서 가장 많은 글이 '내일 장 어떻게 되냐'였다(검토자료/전략리서치-20261114/dc-stock-needs.md).
여기서는 예측하지 않고, 그 질문에 사람들이 실제로 확인하는 숫자와 기준 시각만 모아 준다. 주문·계좌와 무관하다.
"""
from __future__ import annotations

from datetime import datetime, timezone
import math
import threading
import time
import urllib.parse
import urllib.request

from zero.realtime_stock_quote import _read_json

URL = 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d'
CACHE_SECONDS = 300
DEADLINE_SECONDS = 9
FAILURE_CACHE_SECONDS = 30
# (Yahoo 기호, 이름, 왜 보는지, 단위). 금리는 %가 아니라 %p로 바뀐 폭을 본다.
ITEMS = (
    ('^SOX', '필라델피아 반도체지수', '미국 반도체 회사 30곳의 주가 지수예요. 코스피는 시가총액에서 반도체 비중이 커요.', 'index'),
    ('NQ=F', '나스닥100 선물', '나스닥100 지수의 선물 가격이에요. 거의 하루 종일 거래돼서 지금 분위기가 보여요.', 'index'),
    ('ES=F', 'S&P 500 선물', 'S&P 500 지수의 선물 가격이에요. 미국 시장 전체의 지금 분위기가 보여요.', 'index'),
    ('KRW=X', '원·달러 환율', '1달러가 몇 원인지예요. 숫자가 오르면 원화 값이 내렸다는 뜻이에요.', 'fx'),
    ('^TNX', '미국 10년물 금리', '미국 정부가 10년 동안 빌리는 돈의 이자율이에요. 주식 값을 매길 때 기준 금리로 많이 써요.', 'yield'),
    ('CL=F', 'WTI 유가', '미국 원유 1배럴 값이에요. 정유·항공·화학 회사의 비용과 이어져요.', 'oil'),
    ('^VIX', 'VIX(미국 변동성 지수)', 'S&P 500 옵션 가격으로 계산한 앞으로 30일 흔들림 예상치예요. 클수록 흔들림을 크게 본다는 뜻이에요.', 'index'),
)
_cache = {'at': 0.0, 'body': None}
_failure = {'at': 0.0, 'body': None}
_lock = threading.Lock()


def _finite(value):
    return type(value) in (int, float) and math.isfinite(value)

def rarity(closes, change, unit):
    """누락을 건너뛰지 않고 인접한 유효 일봉만 비교한다. 금리는 %p, 나머지는 % 폭이다."""
    if not _finite(change):
        return None
    moves = []
    for a, b in zip(closes, closes[1:]):
        if not (_finite(a) and _finite(b) and a > 0 and b > 0):
            continue
        move = abs(b - a) if unit == 'yield' else abs(b / a - 1)
        if math.isfinite(move):
            moves.append(move)
    if len(moves) < 60:
        return None
    return sum(move >= abs(change) for move in moves) / len(moves) * 100


def reading(payload, *, symbol=None, now=None):
    """같은 종목의 현재 일봉과 바로 앞 일봉이 확인될 때만 전일 대비를 계산한다."""
    try:
        result = payload['chart']['result'][0]
        meta = result['meta']
        closes, stamps = result['indicators']['quote'][0]['close'], result['timestamp']
        price, stamp, hint = meta['regularMarketPrice'], meta['regularMarketTime'], meta['priceHint']
        expected = symbol if symbol is not None else meta['symbol']
        if expected not in {item[0] for item in ITEMS} or meta['symbol'] != expected:
            return None
        if (not _finite(price) or price <= 0 or not _finite(stamp) or stamp <= 0
                or type(hint) is not int or not 0 <= hint <= 10
                or not isinstance(closes, list) or not isinstance(stamps, list) or len(closes) != len(stamps) or len(closes) < 2):
            return None
        if any(not _finite(at) or at <= 0 for at in stamps) or any(a >= b for a, b in zip(stamps, stamps[1:])):
            return None
        if not 0 <= stamp - stamps[-1] < 86400 or stamp > (now or datetime.now(timezone.utc)).timestamp():
            return None
        if not all(_finite(value) and value > 0 for value in closes[-2:]) or round(closes[-1], hint) != round(price, hint):
            return None
        at = datetime.fromtimestamp(stamp, timezone.utc).isoformat()
    except (KeyError, IndexError, TypeError, ValueError, OverflowError, OSError):
        return None
    return price, closes[-2], at, closes[:-1]


def _response(rows, failed, now):
    base = {'schema_version': 1, 'scope': 'PREMARKET_CHECKLIST', 'retrieved_at': now.isoformat(),
            'source': 'Yahoo Finance 공개 일봉(지연될 수 있음)', 'failed': failed, 'orders_authorized': False}
    return (200 if rows else 503), {**base, 'state': 'AVAILABLE' if rows else 'UNAVAILABLE', 'items': rows}

def build(fetch=None, now=None, *, deadline=None):
    deadline = time.monotonic() + DEADLINE_SECONDS if deadline is None else deadline
    now = now or datetime.now(timezone.utc)
    fetch = fetch or (lambda symbol: _read_json(urllib.request.Request(URL.format(symbol=urllib.parse.quote(symbol, safe='')),
                                                headers={'User-Agent': 'ZERO-Premarket/1.0', 'Accept': 'application/json'}), deadline=deadline))
    rows, failed = [], []
    for symbol, name, why, unit in ITEMS:
        try:
            payload = fetch(symbol) if time.monotonic() < deadline else None
            value = reading(payload, symbol=symbol, now=now) if time.monotonic() < deadline else None
        except (OSError, ValueError, TimeoutError):
            value = None
        if value is None:
            failed.append(symbol)
            continue
        price, previous, at, history = value
        difference, percent = price - previous, (price / previous - 1) * 100
        if not math.isfinite(difference) or not math.isfinite(percent):
            failed.append(symbol)
            continue
        change = difference if unit == 'yield' else percent / 100
        rows.append({'symbol': symbol, 'name': name, 'why': why, 'unit': unit, 'price': price, 'previous_close': previous,
                     'change': difference, 'change_percent': percent, 'market_time': at,
                     'rarity_percent': rarity(history, change, unit)})
    return _response(rows, failed, now)


def get_premarket():
    """잠금 대기도 같은 9초 안에 포함한다. 실패 응답은 원래 시각 그대로 30초만 재사용한다."""
    deadline = time.monotonic() + DEADLINE_SECONDS
    if not _lock.acquire(timeout=max(0, deadline - time.monotonic())):
        return _response([], [item[0] for item in ITEMS], datetime.now(timezone.utc))
    try:
        current = time.monotonic()
        if _cache['body'] is not None and 0 <= current - _cache['at'] < CACHE_SECONDS:
            return 200, _cache['body']
        if _failure['body'] is not None and 0 <= current - _failure['at'] < FAILURE_CACHE_SECONDS:
            return 503, _failure['body']
        status, body = build(deadline=deadline)
        if status == 200:
            _failure.update(at=0.0, body=None)
            if time.monotonic() < deadline:
                _cache.update(at=time.monotonic(), body=body)
        else:
            _failure.update(at=time.monotonic(), body=body)
        return status, body
    finally:
        _lock.release()
