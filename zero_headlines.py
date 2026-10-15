"""Live headlines for the office news board: politics and economy only, from a short list of high-credibility
publishers, one line per story.

Titles only (no article text), https links only. Two news-search queries per market feed a candidate pool;
only allowlisted publishers survive, near-duplicate titles keep the highest-priority publisher, and a feed
that fails is reported by market and never raised. Nothing here reads an account, a secret or ZERO data.
"""
from concurrent.futures import Future, TimeoutError as FutureTimeout
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import json
import re
import threading
import time
import unicodedata
from urllib.parse import quote, urlsplit
import xml.etree.ElementTree as ET

import zero_discovery

KST = timezone(timedelta(hours=9))
QUERIES = (('미국', 'economy OR "Federal Reserve" OR inflation OR tariffs OR Treasury when:1d', 'hl=en-US&gl=US&ceid=US:en'),
           ('미국', 'Congress OR "White House" OR sanctions OR election when:1d', 'hl=en-US&gl=US&ceid=US:en'),
           ('한국', '경제 OR 금리 OR 환율 OR 증시 when:1d', 'hl=ko&gl=KR&ceid=KR:ko'),
           ('한국', '정치 OR 국회 OR 대통령 OR 외교 when:1d', 'hl=ko&gl=KR&ceid=KR:ko'))
# Wire services and public broadcasters first; the order is the tie-break when two sources run the same story.
TRUSTED = ('Reuters', 'AP News', 'Associated Press', 'BBC', '연합뉴스', '연합뉴스TV', 'KBS 뉴스', 'MBC 뉴스', 'SBS 뉴스', 'YTN', '뉴시스', '뉴스1', '정책브리핑',
           'Bloomberg.com', 'WSJ', 'Financial Times', 'NPR', 'PBS', 'DW.com', '연합인포맥스')
FEED_LIMIT = 524_288
MAX_TRANSLATIONS = 2
COLLECT_SECONDS = 24
_collect_lock = threading.Lock()
LIMIT = 24
MAX_AGE_HOURS = 36
SIMILARITY = 0.34  # overlap coefficient; unrelated stories in the live feeds scored 0.29 or less


def _clean(text):
    return zero_discovery.plain_text(text, 2000)


def _fetch(url):
    return zero_discovery._get(url, FEED_LIMIT)


def _language(text):
    """Conservative script gate, including cached translations; not semantic language detection."""
    if not isinstance(text, str) or not text.strip():
        return None
    for char in text:
        if (char in '<>\ufffd' or unicodedata.category(char)[0] in 'MC'
                or (char.isalpha() and not ('A' <= char <= 'Z' or 'a' <= char <= 'z' or '가' <= char <= '힣'))):
            return None
    return 'ko' if re.search(r'[가-힣]', text) else 'en' if re.search(r'[A-Za-z]', text) else None


def _supported_feed_languages(*elements):
    """Explicit declarations must be KR/EN; absent metadata relies on the fixed KR/EN query locale."""
    for element in elements:
        if element is None:
            continue
        declared = [element.get('{http://www.w3.org/XML/1998/namespace}lang'),
                    element.findtext('language'),
                    element.findtext('{http://purl.org/dc/elements/1.1/}language')]
        if any(value is not None and not re.fullmatch(r'(?:en|ko)(?:-[a-z0-9]{1,8})*', value.strip(), re.I)
               for value in declared):
            return False
    return True


def classify(title):
    """Only explicit original-title prefixes; no inferred urgency or exclusivity."""
    if re.match(r'^\s*(?:\[속보\]|속보\s*[:：]|\[breaking(?: news)?\]|breaking(?: news)?\s*[:：-])', title, re.I):
        return 'BREAKING'
    if re.match(r'^\s*(?:\[단독\]|단독\s*[:：]|\[exclusive\]|exclusive\s*[:：-])', title, re.I):
        return 'EXCLUSIVE'
    return 'GENERAL'


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


def _collect(now, *, fetch, translate, cached, deadline, snapshot):
    """{'schema_version', 'scope', 'checked_at', 'items', 'failed'}; at most LIMIT stories, newest first."""
    now = now or datetime.now(timezone.utc)
    pool, failed = [], []
    for market, query, parameters in QUERIES:
        if time.monotonic() >= deadline:
            if market not in failed:
                failed.append(market)
            continue
        try:
            body = fetch(f'https://news.google.com/rss/search?q={quote(query)}&{parameters}')
            zero_discovery.parse_rss(body, FEED_LIMIT)
            # The shared RSS adapter omits language declarations; retain the validated original XML.
            root = ET.fromstring(body)
        except (OSError, ValueError, ET.ParseError):
            if market not in failed:
                failed.append(market)
            continue
        for item in root.findall('./channel/item')[:200]:
            if not _supported_feed_languages(root, root.find('channel'), item, item.find('title'), item.find('source')):
                continue
            link, title, source = _clean(item.findtext('link')), _clean(item.findtext('title')), _clean(item.findtext('source'))
            try:
                published = parsedate_to_datetime(item.findtext('pubDate') or '')
                if published.tzinfo is None:
                    continue
            except (TypeError, ValueError, OverflowError):
                continue
            try:
                url = urlsplit(link)
                safe_link = url.scheme == 'https' and bool(url.hostname) and not url.username and not url.password and len(link) <= 2000
            except ValueError:
                safe_link = False
            if source not in TRUSTED or not safe_link or not title or not 0 <= (now - published).total_seconds() <= MAX_AGE_HOURS * 3600:
                continue
            if title.endswith(' - ' + source):
                title = title[:-len(source) - 3]
            if _language(title) is None:
                continue
            pool.append({'market': market, 'title': title, 'publisher': source, 'url': link[:2000], 'published_at': published.astimezone(timezone.utc).isoformat(), 'kind': classify(title)})
    items = dedupe(pool)[:LIMIT]
    for row in items:
        row['title_ko'] = None
        row['translation_status'] = 'NOT_APPLICABLE' if _language(row['title']) == 'ko' else 'PROVIDER_UNAVAILABLE'
        if row['translation_status'] == 'NOT_APPLICABLE' or not zero_discovery.is_public_english(row):
            continue
        found, title_ko = cached(row)
        if not found:
            row['translation_status'] = 'PENDING'
        elif _language(title_ko) == 'ko':
            row['title_ko'], row['translation_status'] = title_ko.strip(), 'TRANSLATED'

    def result():
        return {'schema_version': 1, 'scope': 'PUBLIC_POLITICS_ECONOMY_HEADLINES',
                'checked_at': now.astimezone(timezone.utc).isoformat(),
                'items': [row for row in items if row['translation_status'] in ('NOT_APPLICABLE', 'TRANSLATED')],
                'failed': failed, 'translation_diagnostic': zero_discovery.get_diagnostic()}

    # Cache hits are available even if a new translation stalls; never snapshot untranslated English.
    snapshot.set_result(json.dumps(result(), ensure_ascii=False).encode('utf-8'))
    attempts = 0
    for row in items:
        if row['translation_status'] != 'PENDING' or attempts >= MAX_TRANSLATIONS or time.monotonic() >= deadline:
            continue
        attempts += 1
        row['translation_status'] = 'PROVIDER_UNAVAILABLE'
        title_ko = translate(row)
        if _language(title_ko) == 'ko':
            row['title_ko'], row['translation_status'] = title_ko.strip(), 'TRANSLATED'
    return result()


def collect(now=None, *, fetch=_fetch, translate=zero_discovery.translate_public_headline,
            cached=zero_discovery.cached_public_headline):
    """24-second response deadline; one cold collector, at most two new translations.

    A stalled DNS/socket operation can finish in the daemon after the response deadline;
    its collector lock stays held and the deadline prevents any subsequent HTTP request.
    """
    now = now or datetime.now(timezone.utc)
    unavailable = {'schema_version': 1, 'scope': 'PUBLIC_POLITICS_ECONOMY_HEADLINES',
                   'checked_at': now.astimezone(timezone.utc).isoformat(), 'items': [],
                   'failed': list(dict.fromkeys(query[0] for query in QUERIES)), 'translation_diagnostic': zero_discovery.get_diagnostic()}
    if not _collect_lock.acquire(blocking=False):
        return unavailable
    deadline = time.monotonic() + COLLECT_SECONDS
    waiting, snapshot = Future(), Future()
    def load():
        try:
            value = _collect(now, fetch=fetch, translate=translate, cached=cached, deadline=deadline, snapshot=snapshot)
        except Exception as error:
            _collect_lock.release()
            waiting.set_exception(error)
        else:
            _collect_lock.release()
            waiting.set_result(value)
    try:
        threading.Thread(target=load, name='public-headlines', daemon=True).start()
    except RuntimeError:
        _collect_lock.release()
        return unavailable
    try:
        return waiting.result(timeout=max(0, deadline - time.monotonic()))
    except FutureTimeout:
        return json.loads(snapshot.result()) if snapshot.done() else unavailable
