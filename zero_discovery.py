"""Fixed public Korea trends and anonymous translation of collected public news only."""
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import time
import unicodedata
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener
from urllib.error import HTTPError
import xml.etree.ElementTree as ET

TRENDS_URL = 'https://trends.google.com/trending/rss?geo=KR'
RSS_LIMIT = 1_048_576
TREND_LIMIT = 50
TRANSLATION_LIMIT = 65_536
TRANSLATION_BUDGET = 4000
WINDOW = 86400
CACHE_LIMIT = 1000
STORE = Path.home() / '.cache' / 'zero-streamlit' / 'public-headline-translations.json'
_translation_lock = threading.Lock()
_diagnostic_lock = threading.Lock()
_diagnostic = {'last_errorcode': None, 'provider_state': 'NOT_PROBED', 'store_state': 'UNKNOWN'}


def _record_diagnostic(**values):
    with _diagnostic_lock:
        _diagnostic.update(values)


def get_diagnostic():
    """Process-local fixed enums only; no storage access, probe, paths or provider bodies."""
    with _diagnostic_lock:
        return {key: _diagnostic[key] for key in ('last_errorcode', 'provider_state', 'store_state')}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def _get(url, limit):
    request = Request(url, headers={'User-Agent': 'ZERO-Public-Discovery/1', 'Accept-Encoding': 'identity'})
    with build_opener(_NoRedirect()).open(request, timeout=4) as response:
        if response.status != 200:
            raise ValueError('PUBLIC_HTTP_FAILED')
        body = response.read(limit + 1)
    if len(body) > limit:
        raise ValueError('PUBLIC_BODY_TOO_LARGE')
    return body


def _fetch_trends(url):
    return _get(url, RSS_LIMIT)


def _fetch_translation(url):
    return _get(url, TRANSLATION_LIMIT)


def plain_text(value, limit):
    if not isinstance(value, str):
        return ''
    value = re.sub(r'<[^>]*>', '', value)
    return re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f]', ' ', value)).strip()[:limit]


def parse_rss(body, limit):
    if len(body) > limit:
        raise ValueError('PUBLIC_RSS_TOO_LARGE')
    text = body.decode('utf-8')
    if re.search(r'<!DOCTYPE|<!ENTITY', text, re.I):
        raise ValueError('PUBLIC_RSS_INVALID')
    root = ET.fromstring(text)
    if root.tag != 'rss' or root.find('channel') is None:
        raise ValueError('PUBLIC_RSS_INVALID')
    return root


def collect_trends(now=None, *, fetch=_fetch_trends):
    now = now or datetime.now(timezone.utc)
    root = parse_rss(fetch(TRENDS_URL), RSS_LIMIT)
    ns = {'ht': TRENDS_URL.split('?')[0]}
    rows, seen = [], set()
    for item in root.findall('./channel/item')[:200]:
        keyword = plain_text(item.findtext('title'), 200)
        try:
            published = parsedate_to_datetime(item.findtext('pubDate') or '')
            if published.tzinfo is None:
                continue
        except (TypeError, ValueError, OverflowError):
            continue
        if not -300 <= (now - published).total_seconds() <= 48 * 3600:
            continue
        if not keyword or keyword in seen:
            continue
        seen.add(keyword)
        rows.append({'keyword': keyword, 'traffic': plain_text(item.findtext('ht:approx_traffic', namespaces=ns), 40) or None,
                     'published_at': published.astimezone(timezone.utc).isoformat()})
        if len(rows) >= TREND_LIMIT:
            break
    return {'schema_version': 1, 'items': rows, 'retrieved_at': now.astimezone(timezone.utc).isoformat(), 'source_url': TRENDS_URL}


def title_bytes(title):
    if not isinstance(title, str) or not title.strip() or re.search(r'[\x00-\x1f\x7f<>@]', title):
        return None
    try:
        size = len(title.encode('utf-8'))
    except UnicodeEncodeError:
        return None
    return size if size <= 500 else None


def is_public_english(row):
    from zero_headlines import TRUSTED
    if not isinstance(row, dict) or row.get('market') != '미국' or row.get('publisher') not in TRUSTED:
        return False
    title = row.get('title')
    if (title_bytes(title) is None or not re.search(r'[A-Za-z]', title)
            or any(char.isalpha() and 'LATIN' not in unicodedata.name(char, '') for char in title)):
        return False
    try:
        url = urlsplit(row.get('url', ''))
        return (url.scheme == 'https' and url.netloc == 'news.google.com' and url.query in ('', 'oc=5') and not url.fragment
                and (url.path.startswith('/rss/articles/') or url.path.startswith('/articles/')))
    except (ValueError, TypeError):
        return False


def _read_state(store, now):
    if not store.exists():
        return {'schema_version': 1, 'charges': [], 'cache': {}, 'blocked_until': 0}
    if store.stat().st_size > 4_000_000:
        raise ValueError('TRANSLATION_STATE_INVALID')
    state = json.loads(store.read_text(encoding='utf-8'))
    if (not isinstance(state, dict) or state.get('schema_version') != 1 or not isinstance(state.get('charges'), list)
            or not isinstance(state.get('cache'), dict) or not isinstance(state.get('blocked_until'), (int, float))):
        raise ValueError('TRANSLATION_STATE_INVALID')
    for event in state['charges']:
        if (not isinstance(event, list) or len(event) != 2 or not isinstance(event[0], (int, float))
                or not isinstance(event[1], int) or event[1] <= 0 or event[1] > 500):
            raise ValueError('TRANSLATION_STATE_INVALID')
    if any(not isinstance(k, str) or (v is not None and not isinstance(v, str)) for k, v in state['cache'].items()):
        raise ValueError('TRANSLATION_STATE_INVALID')
    # A clock rollback keeps future charges rather than granting another free budget.
    state['charges'] = [event for event in state['charges'] if event[0] > now - WINDOW]
    return state


def _save_state(store, state):
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=store.parent, delete=False) as output:
            name = output.name
            json.dump(state, output, ensure_ascii=False, allow_nan=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(name, store)
        name = None
    finally:
        if name is not None:
            Path(name).unlink(missing_ok=True)


def cached_public_headline(row, *, store=None, now=None):
    """Return (found, text-or-None) from the atomic file snapshot; no lock, write or HTTP."""
    if not is_public_english(row):
        return False, None
    store = Path(store) if store is not None else STORE
    try:
        state = _read_state(store, time.time() if now is None else now)
        key = 'en|ko:' + row['title']
        _record_diagnostic(store_state='READABLE')
        return key in state['cache'], state['cache'].get(key)
    except (OSError, ValueError, TypeError):
        _record_diagnostic(last_errorcode='STORE_UNAVAILABLE', store_state='UNAVAILABLE')
        return False, None


def translate_public_headline(row, *, store=None, fetch=_fetch_translation, now=None):
    """Internal collector entry point; never exposed as a route accepting arbitrary text.

    Successful and failed exact titles persist. A failed title is not automatically retried;
    quota blocks other new titles for 24 hours. Unreadable state fails closed.
    """
    if not is_public_english(row):
        return None
    title, now = row['title'], time.time() if now is None else now
    store = Path(store) if store is not None else STORE
    key = 'en|ko:' + title
    if not _translation_lock.acquire(blocking=False):
        return cached_public_headline(row, store=store, now=now)[1]
    try:
        lock_path, acquired = store.with_suffix('.lock'), False
        try:
            store.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
            acquired = True
            state = _read_state(store, now)
            _record_diagnostic(store_state='READABLE')
            if key in state['cache']:
                return state['cache'][key]
            size = title_bytes(title)
            if state['blocked_until'] > now or sum(event[1] for event in state['charges']) + size > TRANSLATION_BUDGET:
                _record_diagnostic(last_errorcode='QUOTA', provider_state='LIMIT_BLOCKED')
                return None
            state['charges'].append([now, size])
            # Persist debit and failure sentinel before sending, including a process crash.
            state['cache'][key] = None
            while len(state['cache']) > CACHE_LIMIT:
                del state['cache'][next(iter(state['cache']))]
            _save_state(store, state)
            result = None
            _record_diagnostic(last_errorcode=None, provider_state='REQUESTING')
            try:
                body = fetch('https://api.mymemory.translated.net/get?' + urlencode({'q': title, 'langpair': 'en|ko'}))
                if len(body) > TRANSLATION_LIMIT:
                    raise ValueError('TRANSLATION_TOO_LARGE')
                data = json.loads(body)
                if not isinstance(data, dict):
                    raise ValueError('TRANSLATION_INVALID')
                if data.get('quotaFinished') is True or data.get('responseStatus') in (403, 429, '403', '429'):
                    state['blocked_until'] = now + WINDOW
                    _record_diagnostic(last_errorcode='QUOTA', provider_state='QUOTA')
                elif data.get('responseStatus') == 200 and data.get('quotaFinished') is False and isinstance(data.get('responseData'), dict):
                    text = data['responseData'].get('translatedText')
                    if isinstance(text, str) and '<' not in text and '>' not in text and re.search(r'[가-힣]', text):
                        result = plain_text(text, 1000) or None
                    _record_diagnostic(last_errorcode=None if result else 'INVALID_RESPONSE', provider_state='AVAILABLE' if result else 'UNAVAILABLE')
                else:
                    _record_diagnostic(last_errorcode='INVALID_RESPONSE', provider_state='UNAVAILABLE')
            except HTTPError as error:
                if error.code in (403, 429):
                    state['blocked_until'] = now + WINDOW
                    _record_diagnostic(last_errorcode='QUOTA', provider_state='QUOTA')
                else:
                    _record_diagnostic(last_errorcode='NETWORK_UNAVAILABLE', provider_state='UNAVAILABLE')
            except OSError:
                _record_diagnostic(last_errorcode='NETWORK_UNAVAILABLE', provider_state='UNAVAILABLE')
            except (ValueError, TypeError, KeyError):
                _record_diagnostic(last_errorcode='INVALID_RESPONSE', provider_state='UNAVAILABLE')  # Already persisted failure; retain the original public headline.
            state['cache'][key] = result
            _save_state(store, state)
            return result
        except FileExistsError:
            _record_diagnostic(store_state='BUSY')
            return None
        except (OSError, ValueError, TypeError):
            _record_diagnostic(last_errorcode='STORE_UNAVAILABLE', store_state='UNAVAILABLE')
            return None
        finally:
            if acquired:
                try:
                    lock_path.unlink(missing_ok=True)
                except OSError:
                    pass  # A remaining lock fails closed on subsequent requests.
    finally:
        _translation_lock.release()
