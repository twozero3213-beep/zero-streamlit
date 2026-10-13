"""Live headlines for the "주요 뉴스" screen: public news-search titles, collected when the page asks.

Titles only (no article text), https links only, a short server-side cache. Nothing here reads an account,
a secret or any ZERO data; a feed that fails is reported by market and never raised.
"""
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import re
from urllib.parse import quote
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

KST = timezone(timedelta(hours=9))
FEEDS = (('미국', 'stock market OR S&P 500 OR Federal Reserve OR Treasury yields when:1d', 'hl=en-US&gl=US&ceid=US:en'),
         ('한국', '코스피 OR 증시 OR 환율 OR 금리 when:1d', 'hl=ko&gl=KR&ceid=KR:ko'))
FEED_LIMIT = 2_000_000
PER_FEED = 8
MAX_AGE_HOURS = 36


def _clean(text):
    return re.sub(r'\s+', ' ', text or '').strip()


def _fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0 ZERO-Headlines/1'}), timeout=15) as response:
        return response.read(FEED_LIMIT)


def collect(now=None, *, fetch=_fetch):
    """{'schema_version', 'scope', 'checked_at', 'items', 'failed'}; items newest first per market."""
    now = now or datetime.now(timezone.utc)
    items, failed = [], []
    for market, query, parameters in FEEDS:
        try:
            root = ET.fromstring(fetch(f'https://news.google.com/rss/search?q={quote(query)}&{parameters}'))
        except Exception:
            failed.append(market)
            continue
        rows = []
        for item in root.iter('item'):
            link, title, source = _clean(item.findtext('link')), _clean(item.findtext('title')), _clean(item.findtext('source'))
            try:
                published = parsedate_to_datetime(item.findtext('pubDate') or '')
            except (TypeError, ValueError):
                continue
            if not link.startswith('https://') or not title or not 0 <= (now - published).total_seconds() <= MAX_AGE_HOURS * 3600:
                continue
            if source and title.endswith(' - ' + source):
                title = title[:-len(source) - 3]
            rows.append({'market': market, 'title': title[:300], 'publisher': source[:80] or None, 'url': link[:2000],
                         'published_at': published.astimezone(timezone.utc).isoformat()})
        items.extend(sorted(rows, key=lambda row: row['published_at'], reverse=True)[:PER_FEED])
    return {'schema_version': 1, 'scope': 'PUBLIC_NEWS_SEARCH_TITLES', 'checked_at': now.astimezone(timezone.utc).isoformat(),
            'items': items, 'failed': failed}
