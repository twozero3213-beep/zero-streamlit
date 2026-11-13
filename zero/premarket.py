"""장 전 점검표: 한국 장이 열리기 전에 보는 밤사이 해외 지표(Yahoo Finance 공개 일봉, 키 없음).

디시 주식 갤러리에서 가장 많은 글이 '내일 장 어떻게 되냐'였다(검토자료/전략리서치-20261114/dc-stock-needs.md).
여기서는 예측하지 않고, 그 질문에 사람들이 실제로 확인하는 숫자와 기준 시각만 모아 준다. 주문·계좌와 무관하다.
"""
from __future__ import annotations

from datetime import datetime, timezone
import threading
import time
import urllib.parse
import urllib.request

from zero.realtime_stock_quote import _read_json

URL = 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d'
CACHE_SECONDS = 300
DEADLINE_SECONDS = 10
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
_lock = threading.Lock()


def rarity(closes, change, unit):
    """오늘 움직임이 지난 1년 하루 움직임 가운데 상위 몇 %인지(작을수록 드문 큰 움직임). 금리는 %p 폭, 나머지는 % 폭."""
    moves = [abs(b - a) if unit == 'yield' else abs(b / a - 1) for a, b in zip(closes, closes[1:])]
    if len(moves) < 60:
        return None
    today = abs(change)
    return sum(move >= today for move in moves) / len(moves) * 100


def reading(payload):
    """Yahoo 일봉 응답에서 (지금 값, 전 거래일 종가, 기준 시각 ISO, 종가 목록). 값이 모자라면 None."""
    try:
        result = payload['chart']['result'][0]
        meta = result['meta']
        closes = [value for value in result['indicators']['quote'][0]['close'] if isinstance(value, (int, float)) and value > 0]
        price, stamp = meta['regularMarketPrice'], meta['regularMarketTime']
    except (KeyError, IndexError, TypeError):
        return None
    if not isinstance(price, (int, float)) or price <= 0 or len(closes) < 2 or not isinstance(stamp, (int, float)):
        return None
    # 일봉의 마지막 값은 진행 중인 오늘 값이라 전 거래일 종가는 그 앞 값이다.
    return price, closes[-2], datetime.fromtimestamp(stamp, timezone.utc).isoformat(), closes[:-1]


def build(fetch=None, now=None):
    deadline = time.monotonic() + DEADLINE_SECONDS
    fetch = fetch or (lambda symbol: _read_json(urllib.request.Request(URL.format(symbol=urllib.parse.quote(symbol, safe='')),
                                                headers={'User-Agent': 'ZERO-Premarket/1.0', 'Accept': 'application/json'}), deadline=deadline))
    rows, failed = [], []
    for symbol, name, why, unit in ITEMS:
        try:
            value = reading(fetch(symbol)) if time.monotonic() < deadline else None
        except (OSError, ValueError, TimeoutError):
            value = None
        if value is None:
            failed.append(symbol)
            continue
        price, previous, at, history = value
        change = price - previous if unit == 'yield' else price / previous - 1
        rows.append({'symbol': symbol, 'name': name, 'why': why, 'unit': unit, 'price': price, 'previous_close': previous,
                     'change': price - previous, 'change_percent': (price / previous - 1) * 100, 'market_time': at,
                     'rarity_percent': rarity(history, change, unit)})
    base = {'schema_version': 1, 'scope': 'PREMARKET_CHECKLIST', 'retrieved_at': (now or datetime.now(timezone.utc)).isoformat(),
            'source': 'Yahoo Finance 공개 일봉(지연될 수 있음)', 'failed': failed, 'orders_authorized': False}
    if not rows:
        return 503, {**base, 'state': 'UNAVAILABLE', 'items': []}
    return 200, {**base, 'state': 'AVAILABLE', 'items': rows}


def get_premarket():
    """5분 캐시. 실패 응답은 캐시하지 않는다."""
    with _lock:
        if _cache['body'] is not None and time.time() - _cache['at'] < CACHE_SECONDS:
            return 200, _cache['body']
        status, body = build()
        if status == 200:
            _cache.update(at=time.time(), body=body)
        return status, body
