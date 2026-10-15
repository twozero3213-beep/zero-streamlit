"""Official, bounded public trend providers; credentials are injected by trusted callers.

Provenance checked 2026-10-15:
https://support.google.com/trends/answer/3076011?hl=en (RSS export)
https://developers.google.com/youtube/v3/docs/videos/list (mostPopular chart)
https://docs.cloud.google.com/docs/authentication/api-keys-use (header authentication)
https://developers.naver.com/docs/serviceapi/datalab/search/search.md
NAVER's requested-keyword relative series is not a global popular-search ranking.
"""
from datetime import datetime, timezone
from http.client import HTTPException
import json
import re
import unicodedata
from urllib.request import Request, build_opener

import zero_discovery as discovery
from zero_trend_filter import clean_trend_keyword, fallback_keywords, get_safe_trend_keyword

MAX_BYTES = discovery.RSS_LIMIT
YOUTUBE_URL = ('https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular'
               '&regionCode=KR&maxResults=50&fields=kind,items(snippet(title))')
YOUTUBE_DOCS = 'https://developers.google.com/youtube/v3/docs/videos/list'
NAVER_DOCS = 'https://developers.naver.com/docs/serviceapi/datalab/search/search.md'
_KEY = re.compile(r'[A-Za-z0-9_-]{1,256}\Z')
_PROVIDER_ERRORS = (OSError, ValueError, TypeError, HTTPException, RecursionError)


def _fetch(url, *, headers=None):
    # Exact endpoints prevent callers turning this transport into an arbitrary fetcher.
    if url not in (discovery.TRENDS_URL, YOUTUBE_URL):
        raise ValueError('TREND_ENDPOINT_REFUSED')
    headers = dict(headers or {})
    if (set(headers) - {'X-Goog-Api-Key'} or
            any(not isinstance(value, str) or not _KEY.fullmatch(value) for value in headers.values()) or
            (headers and url != YOUTUBE_URL)):
        raise ValueError('TREND_HEADERS_REFUSED')
    request = Request(url, headers={'User-Agent': 'ZERO-Public-Discovery/1',
                                   'Accept-Encoding': 'identity', **headers})
    with build_opener(discovery._NoRedirect()).open(request, timeout=4) as response:
        if response.status != 200:
            raise ValueError('TREND_HTTP_FAILED')
        body = response.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError('TREND_BODY_TOO_LARGE')
    return body


def _result(provider, state, now, *, titles=(), secret=None, reason=None):
    titles = titles if state == 'AVAILABLE' else ()
    words, seen = [], set()
    for raw in titles[:200]:
        if secret and isinstance(raw, str) and secret.casefold() in unicodedata.normalize('NFKC', raw).casefold():
            continue
        # All three existing moderation stages run on the full title, before assignment.
        keyword = clean_trend_keyword(raw)
        if keyword and keyword.casefold() not in seen:
            words.append(keyword)
            seen.add(keyword.casefold())
        if len(words) == discovery.TREND_LIMIT:
            break
    return {'schema_version': 1, 'provider': provider, 'state': state,
            'reason': reason or ('NO_SAFE_KEYWORDS' if state == 'AVAILABLE' and not words else None),
            'source_url': {'GOOGLE_TRENDS_RSS': discovery.TRENDS_URL,
                           'YOUTUBE_MOST_POPULAR': YOUTUBE_DOCS, 'NAVER_DATALAB': NAVER_DOCS}[provider],
            'retrieved_at': now.astimezone(timezone.utc).isoformat() if state == 'AVAILABLE' else None,
            'items': [{'keyword': word, 'traffic': None, 'published_at': None} for word in words],
            'fallback': not bool(words), 'safe_keywords': words or fallback_keywords(now),
            'safe_keyword': get_safe_trend_keyword(words, now=now)}


def collect_google(now=None, *, fetch=None):
    """Reuse the installed feedparser, XML guards, age checks and three-stage filter."""
    now = now or datetime.now(timezone.utc)
    try:
        return discovery.collect_trends(now, fetch=fetch or _fetch)
    except _PROVIDER_ERRORS:
        return discovery.filtered_trends(now=now, failed=True)


def collect_youtube(now=None, *, enabled=False, api_key=None, fetch=None):
    """Popular video titles for KR, not search keywords or a global search ranking.

No environment/runtime configuration is read here. The server must explicitly
inject its trusted enable flag and key; no key is ever placed in a URL or result.
"""
    now = now or datetime.now(timezone.utc)
    if enabled is not True:
        return _result('YOUTUBE_MOST_POPULAR', 'DISABLED', now)
    if not isinstance(api_key, str) or not _KEY.fullmatch(api_key):
        return _result('YOUTUBE_MOST_POPULAR', 'NOT_CONFIGURED', now)
    try:
        body = (fetch or _fetch)(YOUTUBE_URL, headers={'X-Goog-Api-Key': api_key})
        if not isinstance(body, bytes) or len(body) > MAX_BYTES:
            raise ValueError('TREND_BODY_INVALID')
        value = json.loads(body)
        if (not isinstance(value, dict) or value.get('kind') != 'youtube#videoListResponse'
                or 'error' in value or not isinstance(value.get('items'), list)):
            raise ValueError('TREND_SCHEMA_INVALID')
        titles = []
        for row in value['items'][:50]:
            if not isinstance(row, dict) or not isinstance(row.get('snippet'), dict):
                raise ValueError('TREND_SCHEMA_INVALID')
            titles.append(row['snippet'].get('title'))
        return _result('YOUTUBE_MOST_POPULAR', 'AVAILABLE', now, titles=titles, secret=api_key)
    except _PROVIDER_ERRORS:
        return _result('YOUTUBE_MOST_POPULAR', 'UNAVAILABLE', now, reason='PROVIDER_FAILED')


def naver_trends(now=None):
    """Do not substitute DataLab relative ratios or unofficial crawling for ranks."""
    return _result('NAVER_DATALAB', 'UNSUPPORTED', now or datetime.now(timezone.utc),
                   reason='GLOBAL_POPULAR_SEARCH_UNSUPPORTED')
