"""Keyless community attention and news titles; never a disclosure or trading signal."""
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, TimeoutError as FutureTimeout, wait
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha256
from html import unescape
from http.client import HTTPException
import json
import re
import threading
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request
from xml.etree import ElementTree as ET

from zero.realtime_stock_quote import PROVIDER_TIMEOUT_SECONDS, _read_body

DEADLINE_SECONDS = 8
CACHE_SECONDS = 300
FAILURE_CACHE_SECONDS = 30
BODY_LIMIT = 1_000_000
SOURCE_ERROR = 'PUBLIC_MARKET_SOURCE_UNAVAILABLE'
COMMUNITIES = tuple({'id': key, 'label': label, 'url': 'https://apewisdom.io/api/v1.0/filter/' + key} for key, label in (
    ('all-stocks', 'ApeWisdom 주식 표본'), ('stocks', 'r/stocks'), ('investing', 'r/investing'), ('wallstreetbets', 'r/wallstreetbets')))
NEWS_SOURCES = tuple({'id': key, 'label': label, 'url': 'https://news.google.com/rss/search?' + urlencode({'q': query, 'hl': 'ko', 'gl': 'KR', 'ceid': 'KR:ko'})} for key, label, query in (
    ('market-news', '주식·시장 주요 보도', '(주식 OR 증시 OR 코스피 OR 코스닥 OR 뉴욕증시 OR 실적 OR 금리) when:2d'),
    ('control-news', '공개매수·지분·경영권 보도', '(공개매수 OR 경영권분쟁 OR 지분 OR 주주제안) when:2d')))
SOURCES = COMMUNITIES + NEWS_SOURCES
PUBLISHERS = {
    '연합뉴스': {'yna.co.kr', 'www.yna.co.kr'}, '연합뉴스TV': {'yonhapnewstv.co.kr', 'www.yonhapnewstv.co.kr'},
    '한국경제': {'hankyung.com', 'www.hankyung.com'}, '한경닷컴': {'hankyung.com', 'www.hankyung.com'},
    '매일경제': {'mk.co.kr', 'www.mk.co.kr'}, '서울경제': {'sedaily.com', 'www.sedaily.com'},
    '조선비즈': {'biz.chosun.com'}, '이데일리': {'edaily.co.kr', 'www.edaily.co.kr'},
    '머니투데이': {'mt.co.kr', 'www.mt.co.kr', 'news.mt.co.kr'}, '뉴시스': {'newsis.com', 'www.newsis.com'},
    '뉴스1': {'news1.kr', 'www.news1.kr'}, 'KBS뉴스': {'news.kbs.co.kr'}, 'KBS': {'news.kbs.co.kr', 'www.kbs.co.kr'},
    'MBC뉴스': {'imnews.imbc.com'}, 'SBS뉴스': {'news.sbs.co.kr'}, 'Reuters': {'reuters.com', 'www.reuters.com'},
}
LIMITATIONS = [
    '커뮤니티 값은 ApeWisdom이 선택한 게시판의 종목 언급 집계이며 전체 투자자 여론이 아닙니다.',
    '전체 주식과 개별 게시판 표본이 겹치므로 서로 합산할 수 없습니다.',
    '집계 갱신 시각은 제공되지 않아 조회한 시각만 표시합니다.',
    '일반 단어와 티커의 혼동, 봇·광고·조작과 삭제된 게시물의 영향이 있을 수 있습니다.',
    '뉴스는 최근 48시간의 언론 보도 제목이며 공시 확인이나 투자 추천이 아닙니다.',
]
_cache = {'expires_at': 0.0, 'result': None}
_pending = None
_lock = threading.Lock()
_source_slots = threading.BoundedSemaphore(2)
_source_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix='zero-market-watch')


def _fetch(url, *, deadline):
    if url not in {source['url'] for source in SOURCES}:
        raise ValueError(SOURCE_ERROR)
    request = Request(url, headers={'User-Agent': 'ZERO-Public-Market-Watch/0.7', 'Accept': 'application/json, application/rss+xml, application/xml'})
    return _read_body(request, deadline=min(deadline, time.monotonic() + PROVIDER_TIMEOUT_SECONDS), limit=BODY_LIMIT)


def _body(body):
    if not isinstance(body, bytes) or len(body) > BODY_LIMIT:
        raise ValueError(SOURCE_ERROR)
    return body.decode('utf-8-sig')


def _integer(value, *, signed=False, nullable=False):
    if value is None and nullable: return None
    if type(value) is int:
        result = value
    elif isinstance(value, str) and re.fullmatch(r'-?\d{1,12}', value):
        result = int(value)
    else:
        raise ValueError(SOURCE_ERROR)
    if abs(result) > 1_000_000_000_000 or not signed and result < 0:
        raise ValueError(SOURCE_ERROR)
    return result


def _text(value, limit):
    if not isinstance(value, str): raise ValueError(SOURCE_ERROR)
    text = ' '.join(unescape(value).split())
    if not text or len(text) > limit or any(ord(char) < 32 for char in text): raise ValueError(SOURCE_ERROR)
    return text


def parse_community(body):
    value = json.loads(_body(body))
    if not isinstance(value, dict) or not {'count', 'pages', 'current_page', 'results'} <= value.keys(): raise ValueError(SOURCE_ERROR)
    count, pages = _integer(value['count']), _integer(value['pages'])
    if _integer(value['current_page']) != 1 or pages != (count + 99) // 100 or not isinstance(value['results'], list) or len(value['results']) > 100 or len(value['results']) > count:
        raise ValueError(SOURCE_ERROR)
    rows, symbols, ranks = [], set(), set()
    for row in value['results']:
        if not isinstance(row, dict): raise ValueError(SOURCE_ERROR)
        symbol = row.get('ticker')
        if not isinstance(symbol, str) or not re.fullmatch(r'[A-Z][A-Z0-9.-]{0,14}', symbol): raise ValueError(SOURCE_ERROR)
        rank = _integer(row.get('rank'))
        if not 1 <= rank <= count or rank in ranks or symbol in symbols: raise ValueError(SOURCE_ERROR)
        ranks.add(rank); symbols.add(symbol)
        rows.append(dict(rank=rank, symbol=symbol, name=_text(row.get('name'), 200),
                         mentions=_integer(row.get('mentions')), upvotes=_integer(row.get('upvotes'), signed=True),
                         rank_24h_ago=_integer(row.get('rank_24h_ago'), nullable=True),
                         mentions_24h_ago=_integer(row.get('mentions_24h_ago'), nullable=True)))
    return sorted(rows, key=lambda row: row['rank'])[:10]


def _article_url(value):
    if not isinstance(value, str) or len(value) > 2048 or any(ord(char) < 33 for char in value): return False
    parsed = urlsplit(value)
    return (parsed.scheme == 'https' and parsed.netloc == 'news.google.com' and not parsed.fragment
            and parsed.query in ('', 'oc=5') and bool(re.fullmatch(r'/rss/articles/[A-Za-z0-9_-]{8,1900}', parsed.path)))


def _publisher(node):
    if node is None or node.text not in PUBLISHERS: return None
    parsed = urlsplit(node.attrib.get('url', ''))
    if (parsed.scheme not in {'https', 'http'} or parsed.netloc not in PUBLISHERS[node.text]
            or parsed.path not in {'', '/'} or parsed.query or parsed.fragment): return None
    return node.text


def _category(title):
    for category, pattern in (
            ('TENDER', '공개매수'), ('CONTROL_STAKE', '경영권|지분|최대주주|주주제안|의결권'),
            ('EARNINGS', '실적|매출|영업이익|순이익|어닝'), ('POLICY', '정책|금리|금융위|금감원|연준|규제'),
            ('MARKET', '증시|주식|코스피|코스닥|나스닥|다우|뉴욕증시|상장|주가')):
        if re.search(pattern, title): return category
    return 'OTHER'


def parse_news(body, now):
    text = _body(body)
    if '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper(): raise ValueError(SOURCE_ERROR)
    document = ET.fromstring(text)
    channels = document.findall('channel')
    if document.tag != 'rss' or len(channels) != 1: raise ValueError(SOURCE_ERROR)
    accepted = channels[0].findall('item'); accepted_set = set(accepted)
    if any(node.tag.rsplit('}', 1)[-1] == 'item' and node not in accepted_set for node in document.iter()): raise ValueError(SOURCE_ERROR)
    if now.utcoffset() is None: raise ValueError(SOURCE_ERROR)
    rows, seen = [], set()
    for item in accepted[:100]:
        try:
            source = _publisher(item.find('source')); url = item.findtext('link')
            if source is None or not _article_url(url): continue
            published = parsedate_to_datetime(item.findtext('pubDate') or '')
            if published.utcoffset() is None or published > now or now - published > timedelta(hours=48): continue
            title = _text(item.findtext('title'), 300)
            suffix = ' - ' + source
            if title.endswith(suffix): title = _text(title[:-len(suffix)], 300)
            key = (source, title)
            if url in seen or key in seen: continue
            seen.update((url, key))
            rows.append(dict(id='market-news:' + sha256(url.encode()).hexdigest()[:24], title=title, url=url,
                             published_at=published.astimezone(timezone.utc).isoformat(), source=source,
                             category=_category(title), is_official_disclosure=False))
        except (ValueError, TypeError, OverflowError):
            continue
    return sorted(rows, key=lambda row: (row['published_at'], row['id']), reverse=True)


def _response(results, now):
    observed = now.isoformat()
    communities, news, sources = [], [], []
    for source in SOURCES:
        items = results.get(source['id'])
        status = 'UNAVAILABLE' if items is None else 'AVAILABLE' if items else 'EMPTY'
        sources.append(dict(id=source['id'], label=source['label'], url=source['url'], status=status,
                            error_code=SOURCE_ERROR if items is None else None, observed_at=observed))
        if source in COMMUNITIES:
            communities.append(dict(id=source['id'], label=source['label'], source_url=source['url'], status=status,
                                    observed_at=observed, provider_updated_at=None, items=items or []))
        elif items:
            news.extend(items)
    unique, seen = [], set()
    for row in sorted(news, key=lambda row: (row['published_at'], row['id']), reverse=True):
        key = (row['source'], row['title'])
        if row['url'] not in seen and key not in seen:
            seen.update((row['url'], key)); unique.append(row)
    failed = sum(source['status'] == 'UNAVAILABLE' for source in sources)
    has_items = bool(unique or any(source['items'] for source in communities))
    state = 'UNAVAILABLE' if failed == len(SOURCES) else 'PARTIAL' if failed else 'AVAILABLE' if has_items else 'EMPTY'
    body = dict(schema_version=1, scope='MARKET_WATCH', state=state, observed_at=observed,
                provider_updated_at=None, communities=communities, news=unique[:30], sources=sources,
                limitations=list(LIMITATIONS), orders_authorized=False)
    return (503 if state == 'UNAVAILABLE' else 200), body


def build(fetch=None, now=None, *, deadline=None):
    deadline = time.monotonic() + DEADLINE_SECONDS if deadline is None else deadline
    fetch = fetch or (lambda url: _fetch(url, deadline=deadline))
    checked = now or datetime.now(timezone.utc)
    queued, pending, results = list(NEWS_SOURCES + COMMUNITIES), {}, {}
    slots, pool = _source_slots, _source_pool
    def load(source):
        try:
            if time.monotonic() >= deadline: return None
            try:
                body = fetch(source['url'])
                if time.monotonic() >= deadline: return None
                rows = parse_community(body) if source in COMMUNITIES else parse_news(body, checked)
                return rows if time.monotonic() < deadline else None
            except (OSError, HTTPException, ValueError, TypeError, KeyError, UnicodeError, ET.ParseError, OverflowError):
                return None
        finally:
            slots.release()
    try:
        while queued or pending:
            while queued and len(pending) < 2 and time.monotonic() < deadline:
                if not slots.acquire(blocking=False): break
                source = queued.pop(0)
                try:
                    future = pool.submit(load, source)
                except (RuntimeError, OSError):
                    slots.release(); results[source['id']] = None
                    continue
                future.add_done_callback(lambda done: slots.release() if done.cancelled() else None)
                pending[future] = source['id']
            if not pending: break
            done, _ = wait(pending, timeout=max(0, deadline - time.monotonic()), return_when=FIRST_COMPLETED)
            if not done: break
            for future in done:
                results[pending.pop(future)] = future.result()
    finally:
        for future in pending: future.cancel()
    # load fences completion, so a delayed coordinator may retain an already completed observation.
    for future, identity in pending.items():
        if future.done() and not future.cancelled(): results[identity] = future.result()
    return _response(results, checked)


def get_market_watch(*, deadline=None):
    """Single-flight snapshots; the caller's common deadline includes admission and queue time."""
    global _pending
    deadline = time.monotonic() + DEADLINE_SECONDS if deadline is None else min(deadline, time.monotonic() + DEADLINE_SECONDS)
    if time.monotonic() >= deadline:
        return _response({}, datetime.now(timezone.utc))
    with _lock:
        if _cache['result'] is not None and time.monotonic() < _cache['expires_at']:
            return deepcopy(_cache['result'])
        waiting = _pending
        owner = waiting is None
        if owner: waiting = _pending = Future()
    if not owner:
        try:
            return deepcopy(waiting.result(timeout=max(0, deadline - time.monotonic())))
        except FutureTimeout:
            return _response({}, datetime.now(timezone.utc))
    try:
        result = build(deadline=deadline)
        # build only harvests on-time rows; a later timeout cannot erase those partial observations.
        if time.monotonic() < deadline:
            with _lock:
                if time.monotonic() < deadline:
                    ttl = CACHE_SECONDS if result[0] == 200 else FAILURE_CACHE_SECONDS
                    _cache.update(expires_at=time.monotonic() + ttl, result=deepcopy(result))
        waiting.set_result(result)
        return deepcopy(result)
    except BaseException as error:
        waiting.set_exception(error)
        raise
    finally:
        with _lock:
            if _pending is waiting: _pending = None
