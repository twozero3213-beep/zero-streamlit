"""Korean stock facts for the hosted stock screen: today's range, 52-week range, valuation and the daily net buying of
individuals, foreigners and institutions (the table Toss Securities shows as "개인·외국인·기관").

Source: Naver Pay Securities' public mobile pages (m.stock.naver.com, free, no key; registered in ZERO's host list as
FREE_NO_KEY). These are undocumented public endpoints, so every field is validated and a missing one is simply left out
instead of guessed. Net buying is in shares (as the source reports it), never in money. Nothing here reads an account.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import re

import zero_discovery

BASE = 'https://m.stock.naver.com/api/stock/{code}/{path}'
CODE = re.compile(r'[0-9A-Z]{6}')
BODY_LIMIT = 262_144
DAYS = 10
TEXT_AMOUNT = re.compile(r'\d{1,4}(,\d{3})*(\.\d+)?(조|억|만)?( \d{1,4}(,\d{3})*(억|만)?)?')
# source key -> (field, kind); kind 'int' parses a number, 'amount' keeps the source's own Korean unit text,
# 'ratio' strips the trailing unit and keeps the number.
FACTS = {'lastClosePrice': ('prev_close', 'int'), 'openPrice': ('open', 'int'), 'highPrice': ('high', 'int'), 'lowPrice': ('low', 'int'),
         'accumulatedTradingVolume': ('volume', 'int'), 'accumulatedTradingValue': ('trading_value', 'amount'), 'marketValue': ('market_cap', 'amount'),
         'foreignRate': ('foreign_rate', 'ratio'), 'highPriceOf52Weeks': ('high52', 'int'), 'lowPriceOf52Weeks': ('low52', 'int'),
         'per': ('per', 'ratio'), 'pbr': ('pbr', 'ratio'), 'eps': ('eps', 'int'), 'bps': ('bps', 'int'), 'dividendYieldRatio': ('dividend_yield', 'ratio')}


def _fetch(url):
    return zero_discovery._get(url, BODY_LIMIT)


def _int(text):
    text = str(text).strip().replace(',', '')
    return int(text) if re.fullmatch(r'[+-]?\d{1,15}', text) else None


def _number(text):
    """Digits with optional separators and decimals, unit suffix dropped ('9.62배' -> 9.62). None when unreadable."""
    match = re.fullmatch(r'(-?\d{1,6}(?:,\d{3})*(?:\.\d+)?)\s*(?:배|%|원)?', str(text).strip())
    return float(match[1].replace(',', '')) if match else None


def _fact(kind, value):
    if kind == 'int':
        number = _number(value)
        return int(number) if number is not None and number == int(number) and number >= 0 else None
    if kind == 'ratio':
        number = _number(value)
        return number if number is not None and -1000 < number < 100000 else None
    text = str(value).strip()
    return text if TEXT_AMOUNT.fullmatch(text) else None


def _investor_row(raw):
    if not isinstance(raw, dict):
        return None
    date, close = raw.get('bizdate'), _number(raw.get('closePrice'))
    parts = [_int(raw.get(key)) for key in ('individualPureBuyQuant', 'foreignerPureBuyQuant', 'organPureBuyQuant')]
    volume = _number(raw.get('accumulatedTradingVolume'))
    if not (isinstance(date, str) and re.fullmatch(r'20\d{6}', date) and close and close > 0 and volume is not None and None not in parts):
        return None
    iso = date[:4] + '-' + date[4:6] + '-' + date[6:]
    try:
        datetime.strptime(iso, '%Y-%m-%d')
    except ValueError:
        return None
    return {'date': iso, 'individual': parts[0], 'foreign': parts[1], 'institution': parts[2], 'close': int(close), 'volume': int(volume)}


def collect(code, now=None, fetch=None):
    if not isinstance(code, str) or not CODE.fullmatch(code):
        raise ValueError('STOCK_CODE_INVALID')
    now, fetch = now or datetime.now(timezone.utc), fetch or _fetch

    def get(path):
        return json.loads(fetch(BASE.format(code=code, path=path)))
    with ThreadPoolExecutor(2) as pool:
        integration, trend = pool.submit(get, 'integration'), pool.submit(get, 'trend')
        integration, trend = integration.result(), trend.result()
    if not isinstance(integration, dict) or integration.get('itemCode') != code or not isinstance(trend, list):
        raise ValueError('STOCK_INVALID')
    facts = {}
    for entry in integration.get('totalInfos') or []:
        spec = FACTS.get(entry.get('code')) if isinstance(entry, dict) else None
        value = _fact(spec[1], entry.get('value')) if spec else None
        if spec and value is not None:
            facts[spec[0]] = value
    investors = [row for row in map(_investor_row, trend[:DAYS]) if row]
    if 'prev_close' not in facts or not investors:
        raise ValueError('STOCK_EMPTY')
    latest = investors[0]
    change = latest['close'] - facts['prev_close']
    name = zero_discovery.plain_text(integration.get('stockName'), 60)
    if not name:
        raise ValueError('STOCK_NAME_MISSING')
    return {'schema_version': 1, 'scope': 'PUBLIC_STOCK_INFO', 'orders_authorized': False, 'code': code, 'name': name,
            'price': latest['close'], 'price_date': latest['date'], 'change': change, 'change_rate': round(change / facts['prev_close'] * 100, 2),
            'facts': facts, 'investors': investors, 'unit': 'SHARES', 'retrieved_at': now.astimezone(timezone.utc).isoformat(),
            'source': {'label': '네이버페이 증권 공개 시세', 'url': 'https://stock.naver.com/domestic/stock/' + code + '/total'}}
