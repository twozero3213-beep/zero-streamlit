"""Live Korean stock rankings for the hosted home screen: most traded, biggest risers and fallers, foreign and institution net buying.

Source: Naver Pay Securities' public ranking list (stock.naver.com, free, no key; registered in ZERO's host list).
That list gives the rank order with today's price, change and volume, but not the net-buy amounts, so this module
never produces amounts. Each list fails on its own and is reported by name; nothing here reads an account or secret.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import re

import zero_discovery

URL = 'https://stock.naver.com/api/domestic/market/stock/default?tradeType=KRX&marketType={market}&orderType={order}&startIdx=0&pageSize={size}'
# The net-buy orders ignore marketType (checked 2026-10-22: KOSPI and KOSDAQ return the same mixed list), so they
# are fetched once for the whole market and each row keeps its own market from 'sosok'.
JOBS = (('KOSPI', 'VOLUME', 'quantTop'), ('KOSDAQ', 'VOLUME', 'quantTop'),
        ('KOSPI', 'UP', 'up'), ('KOSDAQ', 'UP', 'up'), ('KOSPI', 'DOWN', 'down'), ('KOSDAQ', 'DOWN', 'down'),
        ('ALL', 'FOREIGN', 'foreignPureBuy'), ('ALL', 'INSTITUTION', 'organizationPureBuy'))
SOSOK = {'0': 'KOSPI', '1': 'KOSDAQ'}
SIZE = 10
BODY_LIMIT = 262_144
CODE = re.compile(r'[0-9A-Z]{6}')  # new KRX codes mix letters, e.g. 0001A0
INTEGER = re.compile(r'\d{1,15}')
RATE = re.compile(r'-?\d{1,4}(\.\d{1,4})?')


def _fetch(url):
    return zero_discovery._get(url, BODY_LIMIT)


def _row(raw):
    """One validated row, or None. Anything malformed is dropped instead of guessed."""
    if not isinstance(raw, dict):
        return None
    code, name = raw.get('itemcode'), zero_discovery.plain_text(raw.get('itemname'), 60)
    price, rate, volume = (str(raw.get(key, '')) for key in ('nowPrice', 'prevChangeRate', 'tradeVolume'))
    if not (isinstance(code, str) and CODE.fullmatch(code) and name and INTEGER.fullmatch(price) and int(price) > 0
            and RATE.fullmatch(rate) and -100 < float(rate) <= 1000 and INTEGER.fullmatch(volume) and raw.get('sosok') in SOSOK):
        return None
    return {'code': code, 'name': name, 'market': SOSOK[raw['sosok']], 'price': int(price), 'change_rate': float(rate), 'volume': int(volume)}


def _list(market, order, fetch):
    body = json.loads(fetch(URL.format(market='KOSPI' if market == 'ALL' else market, order=order, size=SIZE)))
    if not isinstance(body, list):
        raise ValueError('RANK_INVALID')
    rows, seen = [], set()
    for raw in body[:SIZE]:
        row = _row(raw)
        if row and row['code'] not in seen and market in ('ALL', row['market']):
            seen.add(row['code'])
            rows.append(row)
    if not rows:
        raise ValueError('RANK_EMPTY')
    return rows


def collect(now=None, fetch=None):
    now, fetch = now or datetime.now(timezone.utc), fetch or _fetch

    def run(job):
        try:
            return job, _list(job[0], job[2], fetch)
        except Exception:  # one list failing must not hide the others; the reason text is never kept
            return job, None

    with ThreadPoolExecutor(len(JOBS)) as pool:
        results = list(pool.map(run, JOBS))
    lists = [{'market': market, 'kind': kind, 'items': rows} for (market, kind, _), rows in results if rows]
    return {'schema_version': 1, 'scope': 'PUBLIC_MARKET_RANK', 'orders_authorized': False,
            'state': 'AVAILABLE' if len(lists) == len(JOBS) else 'PARTIAL' if lists else 'UNAVAILABLE',
            'retrieved_at': now.astimezone(timezone.utc).isoformat(), 'amounts_included': False,
            'source': {'label': '네이버페이 증권 공개 순위', 'url': 'https://stock.naver.com/'},
            'lists': lists, 'failed': [market + ':' + kind for (market, kind, _), rows in results if not rows]}
