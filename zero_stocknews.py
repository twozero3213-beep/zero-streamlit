"""Headlines and disclosure titles for one Korean stock, for the hosted stock screen's "뉴스·공시" tab.

Source: Naver Pay Securities' public mobile pages (m.stock.naver.com, free, no key; FREE_NO_KEY in ZERO's host list).
Only titles, publishers, times and links are kept: article bodies and pictures are never copied. Article links point to
n.news.naver.com and are opened by the reader's browser, never fetched here. The two lists fail on their own. Nothing here
reads an account or secret, and a headline is not a trade recommendation.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
import re

import zero_discovery

BASE = 'https://m.stock.naver.com/api/{path}?pageSize={size}&page=1'
CODE = re.compile(r'[0-9A-Z]{6}')
BODY_LIMIT = 262_144
SIZE = 10
KST = timezone(timedelta(hours=9))
ARTICLE = 'https://n.news.naver.com/mnews/article/{office}/{article}'


def _fetch(url):
    return zero_discovery._get(url, BODY_LIMIT)


def _news_row(raw):
    if not isinstance(raw, dict):
        return None
    office, article, stamp = str(raw.get('officeId', '')), str(raw.get('articleId', '')), str(raw.get('datetime', ''))
    title, publisher = zero_discovery.plain_text(raw.get('titleFull') or raw.get('title'), 200), zero_discovery.plain_text(raw.get('officeName'), 30)
    if not (re.fullmatch(r'\d{3}', office) and re.fullmatch(r'\d{10}', article) and re.fullmatch(r'20\d{10}', stamp) and title and publisher):
        return None
    try:
        at = datetime.strptime(stamp, '%Y%m%d%H%M').replace(tzinfo=KST)
    except ValueError:
        return None
    return {'title': title, 'publisher': publisher, 'published_at': at.isoformat(), 'url': ARTICLE.format(office=office, article=article)}


def _disclosure_row(raw):
    if not isinstance(raw, dict):
        return None
    title, author, stamp = zero_discovery.plain_text(raw.get('title'), 200), zero_discovery.plain_text(raw.get('author'), 30), str(raw.get('datetime', ''))
    if not (title and isinstance(raw.get('disclosureId'), int) and re.fullmatch(r'20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', stamp)):
        return None
    try:
        at = datetime.strptime(stamp, '%Y-%m-%dT%H:%M:%S').replace(tzinfo=KST)
    except ValueError:
        return None
    return {'title': title, 'source': author or '공시', 'published_at': at.isoformat()}


def _news(code, fetch):
    groups = json.loads(fetch(BASE.format(path='news/stock/' + code, size=SIZE)))
    if not isinstance(groups, list):
        raise ValueError('NEWS_INVALID')
    rows, seen = [], set()
    for group in groups:
        # Each group is one story reported by several outlets; its first item stands for it.
        item = (group.get('items') or [None])[0] if isinstance(group, dict) else None
        row = _news_row(item)
        if row and row['url'] not in seen:
            seen.add(row['url'])
            rows.append(row)
    return rows


def _disclosures(code, fetch):
    body = json.loads(fetch(BASE.format(path='stock/' + code + '/disclosure', size=SIZE)))
    if not isinstance(body, list):
        raise ValueError('DISCLOSURE_INVALID')
    return [row for row in map(_disclosure_row, body[:SIZE]) if row]


def collect(code, now=None, fetch=None):
    if not isinstance(code, str) or not CODE.fullmatch(code):
        raise ValueError('STOCK_CODE_INVALID')
    now, fetch = now or datetime.now(timezone.utc), fetch or _fetch

    def run(job):
        try:
            return job(code, fetch)
        except Exception:  # one list failing must not hide the other; the reason text is never kept
            return None
    with ThreadPoolExecutor(2) as pool:
        news, disclosures = list(pool.map(run, (_news, _disclosures)))
    if news is None and disclosures is None:
        raise ValueError('STOCK_NEWS_UNAVAILABLE')
    return {'schema_version': 1, 'scope': 'PUBLIC_STOCK_NEWS', 'orders_authorized': False, 'code': code, 'retrieved_at': now.astimezone(timezone.utc).isoformat(),
            'news': news or [], 'disclosures': disclosures or [], 'failed': [name for name, rows in (('news', news), ('disclosures', disclosures)) if rows is None],
            'source': {'label': '네이버페이 증권 공개 뉴스·공시', 'url': 'https://stock.naver.com/domestic/stock/' + code + '/total'}}
