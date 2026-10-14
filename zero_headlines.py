"""Live headlines for the office news board: politics and economy only, from a short list of high-credibility
publishers, one line per story.

Titles only (no article text), https links only. Two news-search queries per market feed a candidate pool;
only allowlisted publishers survive, near-duplicate titles keep the highest-priority publisher, and a feed
that fails is reported by market and never raised. Nothing here reads an account, a secret or ZERO data.
"""
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import re
from urllib.parse import quote
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

KST = timezone(timedelta(hours=9))
QUERIES = (('미국', 'economy OR "Federal Reserve" OR inflation OR tariffs OR Treasury OR Congress OR "White House" OR sanctions OR election when:1d', 'hl=en-US&gl=US&ceid=US:en'),
           ('한국', '경제 OR 금리 OR 환율 OR 증시 OR 정치 OR 국회 OR 대통령 OR 외교 when:1d', 'hl=ko&gl=KR&ceid=KR:ko'))
# Wire services and public broadcasters first; the order is the tie-break when two sources run the same story.
TRUSTED = ('Reuters', 'AP News', 'Associated Press', 'BBC', '연합뉴스', '연합뉴스TV', 'KBS 뉴스', 'MBC 뉴스', 'SBS 뉴스', 'YTN', '뉴시스', '뉴스1', '정책브리핑',
           'Bloomberg.com', 'WSJ', 'Financial Times', 'NPR', 'PBS', 'DW.com', '연합인포맥스')
FEED_LIMIT = 2_000_000
LIMIT = 24
MAX_AGE_HOURS = 36
SIMILARITY = 0.34  # overlap coefficient; unrelated stories in the live feeds scored 0.29 or less


def _clean(text):
    return re.sub(r'\s+', ' ', text or '').strip()


def _fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0 ZERO-Headlines/2'}), timeout=15) as response:
        return response.read(FEED_LIMIT)


def tokens(title):
    """Word tokens plus Korean two-character grams, so spacing differences do not hide a duplicate."""
    text = re.sub(r'[^0-9A-Za-z가-힣]+', ' ', title.lower())
    words = {word for word in text.split() if len(word) > 1}
    korean = ''.join(re.findall(r'[가-힣]+', text))
    return words | {korean[i:i + 2] for i in range(len(korean) - 1)}


def similar(a, b):
    left, right = tokens(a), tokens(b)
    return bool(left and right) and len(left & right) / min(len(left), len(right)) >= SIMILARITY


def dedupe(rows):
    """Keep one row per story: the best-ranked publisher, then the newest."""
    ranked = sorted(rows, key=lambda row: (TRUSTED.index(row['publisher']), -datetime.fromisoformat(row['published_at']).timestamp()))
    kept = []
    for row in ranked:
        if not any(similar(row['title'], other['title']) for other in kept):
            kept.append(row)
    return sorted(kept, key=lambda row: row['published_at'], reverse=True)


def collect(now=None, *, fetch=_fetch):
    """{'schema_version', 'scope', 'checked_at', 'items', 'failed'}; at most LIMIT stories, newest first."""
    now = now or datetime.now(timezone.utc)
    pool, failed = [], []
    for market, query, parameters in QUERIES:
        try:
            root = ET.fromstring(fetch(f'https://news.google.com/rss/search?q={quote(query)}&{parameters}'))
        except Exception:
            failed.append(market)
            continue
        for item in root.iter('item'):
            link, title, source = _clean(item.findtext('link')), _clean(item.findtext('title')), _clean(item.findtext('source'))
            try:
                published = parsedate_to_datetime(item.findtext('pubDate') or '')
            except (TypeError, ValueError):
                continue
            if source not in TRUSTED or not link.startswith('https://') or not title or not 0 <= (now - published).total_seconds() <= MAX_AGE_HOURS * 3600:
                continue
            if title.endswith(' - ' + source):
                title = title[:-len(source) - 3]
            pool.append({'market': market, 'title': title[:300], 'publisher': source, 'url': link[:2000], 'published_at': published.astimezone(timezone.utc).isoformat()})
    return {'schema_version': 1, 'scope': 'PUBLIC_POLITICS_ECONOMY_HEADLINES', 'checked_at': now.astimezone(timezone.utc).isoformat(),
            'items': dedupe(pool)[:LIMIT], 'failed': failed}
