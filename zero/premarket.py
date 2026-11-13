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

URL = 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d'
CACHE_SECONDS = 300
DEADLINE_SECONDS = 10
# (Yahoo 기호, 이름, 왜 보는지, 단위). 금리는 %가 아니라 %p로 바뀐 폭을 본다.
ITEMS = (
    ('^SOX', '필라델피아 반도체지수', '코스피에서 반도체 비중이 커서 밤사이 이 지수가 가장 먼저 영향을 줘요.', 'index'),
    ('NQ=F', '나스닥100 선물', '미국 기술주의 지금 분위기예요. 한국 장 중에도 계속 움직여요.', 'index'),
    ('ES=F', 'S&P 500 선물', '미국 시장 전체의 지금 분위기예요.', 'index'),
    ('KRW=X', '원·달러 환율', '오르면(원화 약세) 외국인이 국내 주식을 파는 경우가 많아요.', 'fx'),
    ('^TNX', '미국 10년물 금리', '오르면 성장주 값이 눌리는 경우가 많아요.', 'yield'),
    ('CL=F', 'WTI 유가', '오르면 정유·항공주와 물가 걱정에 함께 영향을 줘요.', 'commodity'),
    ('^VIX', 'VIX(미국 공포지수)', '높을수록 시장이 불안하다는 뜻이에요. 20을 넘으면 흔들림이 큰 편이에요.', 'index'),
)
_cache = {'at': 0.0, 'body': None}
_lock = threading.Lock()


def reading(payload):
    """Yahoo 일봉 응답에서 (지금 값, 전 거래일 종가, 기준 시각 ISO). 값이 모자라면 None."""
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
    return price, closes[-2], datetime.fromtimestamp(stamp, timezone.utc).isoformat()


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
        price, previous, at = value
        rows.append({'symbol': symbol, 'name': name, 'why': why, 'unit': unit, 'price': price, 'previous_close': previous,
                     'change': price - previous, 'change_percent': (price / previous - 1) * 100, 'market_time': at})
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
