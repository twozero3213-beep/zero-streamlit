"""Bounded public report indexes. Discovery is not a full-text review or training."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
from http.client import HTTPException
import json
from pathlib import Path
import re
from urllib.parse import parse_qsl, urljoin, urlsplit
from urllib.request import ProxyHandler, Request, build_opener
from xml.etree import ElementTree

from zero_discovery import _NoRedirect as NoRedirect

LIMIT = 2_000_000
RECORD_LIMIT = 12
HOSTS = {'www.bok.or.kr', 'toss.im', 'www.federalreserve.gov', 'www.bis.org'}
TOP_KEYS = {'schema_version', 'as_of', 'sources', 'review_candidates', 'learning_authority',
            'full_text_review_count', 'model_training', 'orders'}
RECORD_KEYS = {'id', 'source_id', 'kind', 'title', 'url', 'published_at', 'published_date',
               'retrieved_at', 'content_changed_at', 'content_digest', 'access', 'summary'}
SOURCE_KEYS = {'id', 'label', 'url', 'kind', 'status', 'checked_at', 'error_code', 'records'}


def catalog():
    return json.loads(Path(__file__).with_name('briefing_sources.json').read_text(encoding='utf8'))


def public_url(value):
    if not isinstance(value, str) or len(value) > 600 or any(ord(c) < 33 for c in value):
        raise ValueError('PUBLIC_SOURCE_URL_INVALID')
    p = urlsplit(value)
    if (p.scheme != 'https' or p.hostname not in HOSTS or p.username or p.password
            or p.port or p.fragment or '%' in p.netloc or '\\' in value):
        raise ValueError('PUBLIC_SOURCE_URL_INVALID')
    if p.hostname == 'www.bok.or.kr':
        if not re.fullmatch(r'/(?:portal|imer)/bbs/[BP]\d{7}/(?:view\.do|news\.rss)', p.path):
            raise ValueError('PUBLIC_SOURCE_URL_INVALID')
        query = parse_qsl(p.query, keep_blank_values=True)
        if not query or len(query) > 2 or len({k for k, _ in query}) != len(query):
            raise ValueError('PUBLIC_SOURCE_URL_INVALID')
        if any(k not in {'menuNo', 'nttId'} or not re.fullmatch(r'\d{1,12}', v) for k, v in query):
            raise ValueError('PUBLIC_SOURCE_URL_INVALID')
    elif p.query:
        raise ValueError('PUBLIC_SOURCE_URL_INVALID')
    elif p.hostname == 'toss.im' and not re.fullmatch(r'/tossfeed/(?:article|series)/[A-Za-z0-9_-]{1,120}', p.path):
        raise ValueError('PUBLIC_SOURCE_URL_INVALID')
    elif p.hostname == 'www.federalreserve.gov' and not re.fullmatch(r'/(?:feeds/[a-z_]+\.xml|newsevents/(?:pressreleases|speech)/[A-Za-z0-9_]+\.htm)', p.path):
        raise ValueError('PUBLIC_SOURCE_URL_INVALID')
    elif p.hostname == 'www.bis.org' and not re.fullmatch(r'/(?:doclist/[a-z_]+\.rss|press/[A-Za-z0-9_]+\.htm|media-releases/[a-z0-9-]{1,200})', p.path):
        raise ValueError('PUBLIC_SOURCE_URL_INVALID')
    return value


def _clock(value):
    if not isinstance(value, str):
        raise ValueError('PUBLIC_SOURCE_TIME_INVALID')
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError('PUBLIC_SOURCE_TIME_INVALID')
    return parsed


def _day(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('PUBLIC_SOURCE_DATE_INVALID')
    return date.fromisoformat(value).isoformat()


def _text(value, limit):
    if not isinstance(value, str) or not value or len(value) > limit or any(ord(c) < 32 for c in value):
        raise ValueError('PUBLIC_SOURCE_TEXT_INVALID')
    return value


def _candidate_key(url):
    canonical = public_url(url); parsed = urlsplit(canonical)
    if (parsed.hostname == 'www.bok.or.kr'
            and re.fullmatch(r'/(?:portal|imer)/bbs/[BP]\d{7}/view\.do', parsed.path)):
        query = parse_qsl(parsed.query, keep_blank_values=True); parameters = dict(query)
        notice = parameters.get('nttId')
        if (notice is not None and len(parameters) == len(query)
                and set(parameters) <= {'nttId', 'menuNo'}
                and all(re.fullmatch(r'\d{1,12}', value) for value in parameters.values())):
            # menuNo is navigation context; the board path and notice identify the document.
            return ('BOK_NOTICE', parsed.hostname, parsed.path, notice)
    return ('URL', canonical)


def _unique_candidates(rows):
    selected = {}; source_order = {source['id']: index for index, source in enumerate(catalog()['sources'])}
    # The stable representative does not resolve conflicting titles/dates. Every
    # original record, digest and source clock remains in sources for that review.
    for row in sorted(rows, key=lambda item: (source_order[item['source_id']], item['id'])):
        selected.setdefault(_candidate_key(row['url']), row)
    return sorted(selected.values(), key=lambda row: (row['published_at'] or row['published_date'] or '', row['id']), reverse=True)


def validate_briefing_sources(value):
    """Fail before network or publication if a runtime index gains extra authority."""
    if (not isinstance(value, dict) or set(value) != TOP_KEYS or type(value['schema_version']) is not int
            or value['schema_version'] != 1 or value['learning_authority'] != 'SOURCE_REVIEW_ONLY'
            or value['full_text_review_count'] != 0 or type(value['full_text_review_count']) is not int
            or value['model_training'] is not False or value['orders'] is not False):
        raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
    as_of = _clock(value['as_of'])
    if as_of > datetime.now(timezone.utc):
        raise ValueError('PUBLIC_SOURCE_TIME_INVALID')
    expected = {s['id']: s for s in catalog()['sources']}
    if not isinstance(value['sources'], list) or len(value['sources']) > len(expected):
        raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
    known = {}; source_ids = set()
    for source in value['sources']:
        if not isinstance(source, dict) or set(source) != SOURCE_KEYS or source['id'] not in expected or source['id'] in source_ids:
            raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
        source_ids.add(source['id']); spec = expected[source['id']]
        if any(source[k] != spec[k] for k in ('id', 'label', 'url', 'kind')):
            raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
        public_url(source['url'])
        checked = _clock(source['checked_at'])
        if checked > as_of or source['status'] not in {'AVAILABLE', 'RETAINED', 'UNAVAILABLE'}:
            raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
        if source['error_code'] not in {None, 'PUBLIC_SOURCE_UNAVAILABLE'}:
            raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
        if ((source['status'] == 'AVAILABLE') != (source['error_code'] is None)
                or not isinstance(source['records'], list) or len(source['records']) > RECORD_LIMIT):
            raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
        if source['status'] == 'UNAVAILABLE' and source['records']:
            raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
        for record in source['records']:
            if not isinstance(record, dict) or set(record) != RECORD_KEYS:
                raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
            if (record['source_id'] != source['id'] or record['kind'] != source['kind']
                    or record['access'] != 'INDEX_ONLY' or record['summary'] is not None):
                raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
            public_url(record['url']); _text(record['title'], 200)
            if urlsplit(record['url']).hostname != urlsplit(source['url']).hostname:
                raise ValueError('PUBLIC_SOURCE_URL_INVALID')
            retrieved = _clock(record['retrieved_at']); changed = _clock(record['content_changed_at'])
            if changed > retrieved or retrieved > checked:
                raise ValueError('PUBLIC_SOURCE_TIME_INVALID')
            if record['published_at'] is not None:
                published = _clock(record['published_at'])
                if published > retrieved or record['published_date'] != published.date().isoformat():
                    raise ValueError('PUBLIC_SOURCE_TIME_INVALID')
            elif record['published_date'] is not None:
                _day(record['published_date'])
                if record['published_date'] > retrieved.astimezone(timezone(timedelta(hours=9))).date().isoformat():
                    raise ValueError('PUBLIC_SOURCE_TIME_INVALID')
            if (not re.fullmatch(r'[0-9a-f]{64}', record['content_digest'])
                    or record['content_digest'] != _digest(record)
                    or record['id'] != source['id'] + ':' + sha256(record['url'].encode()).hexdigest()[:16]
                    or record['id'] in known):
                raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
            known[record['id']] = record
    if not isinstance(value['review_candidates'], list) or len(value['review_candidates']) > len(expected) * RECORD_LIMIT:
        raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
    for candidate in value['review_candidates']:
        if not isinstance(candidate, dict) or set(candidate) != RECORD_KEYS | {'publication_status'}:
            raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
        record = known.get(candidate['id'])
        if record is None or any(candidate[k] != record[k] for k in RECORD_KEYS):
            raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
        if candidate['publication_status'] != _publication_status(record, as_of):
            raise ValueError('PUBLIC_SOURCE_CONTRACT_INVALID')
    normalized = deepcopy(value)
    normalized['review_candidates'] = _unique_candidates(normalized['review_candidates'])
    return normalized


def _digest(record):
    # Only index metadata is fingerprinted: full-report revisions require a real reread.
    return sha256(json.dumps([record[k] for k in ('title', 'url', 'published_at', 'published_date')], ensure_ascii=False).encode()).hexdigest()


def _publication_status(record, now):
    if record['published_at']:
        return 'BEFORE_CUTOFF' if _clock(record['published_at']) <= now else 'AFTER_CUTOFF'
    if record['published_date']:
        return 'TIME_UNKNOWN'
    return 'DATE_UNKNOWN'


def _fetch(url):
    public_url(url)
    request = Request(url, headers={'User-Agent': 'ZERO-Public-Research/0.6', 'Accept': 'application/rss+xml, application/xml, text/html'})
    # No ambient proxy credentials, cookies, automatic redirects or arbitrary URLs.
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=12) as response:
        body = response.read(LIMIT + 1)
    return body


class _TossIndex(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows = []; self.active = None; self.field = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            self.active = {'url': attrs.get('href', ''), 'title': '', 'date': ''} if '/tossfeed/article/' in attrs.get('href', '') else None
        if self.active is not None and tag in {'h4', 'time'}:
            self.field = 'title' if tag == 'h4' else 'date'

    def handle_data(self, data):
        if self.active is not None and self.field:
            self.active[self.field] += data

    def handle_endtag(self, tag):
        if tag in {'h4', 'time'}:
            self.field = None
        if tag == 'a' and self.active is not None:
            self.rows.append(self.active); self.active = None; self.field = None


def _records(spec, body, now):
    if not isinstance(body, bytes) or len(body) > LIMIT:
        raise ValueError('PUBLIC_SOURCE_BODY_INVALID')
    text = body.decode('utf-8-sig')
    candidates = []
    if spec['format'] == 'RSS':
        if '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
            raise ValueError('PUBLIC_SOURCE_XML_INVALID')
        root = ElementTree.fromstring(text)
        rdf = root.tag == '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF'
        if not rdf and (root.tag != 'rss' or root.find('channel') is None):
            raise ValueError('PUBLIC_SOURCE_XML_INVALID')
        namespace = '{http://purl.org/rss/1.0/}' if rdf else ''
        items = root.findall('./' + namespace + 'item') if rdf else root.findall('./channel/item')
        for item in items[:100]:
            published = None; day = None; raw = item.findtext('pubDate')
            if raw:
                try:
                    published = parsedate_to_datetime(raw)
                    if published.tzinfo is None: published = None
                    else: day = published.date().isoformat()
                except (ValueError, TypeError, OverflowError):
                    pass
            if rdf:
                # BIS uses normalized midnight dates in RDF; their release time is not established.
                raw = item.findtext('{http://purl.org/dc/elements/1.1/}date') or ''
                try: day = _day(raw[:10])
                except ValueError: pass
            candidates.append((item.findtext(namespace + 'title') or '', item.findtext(namespace + 'link') or '', published, day))
    else:
        parser = _TossIndex(); parser.feed(text)
        for row in parser.rows[:100]:
            raw = row['date'].strip(); day = None
            if re.fullmatch(r'\d{4}\.\d{2}\.\d{2}', raw):
                try: day = _day(raw.replace('.', '-'))
                except ValueError: pass
            candidates.append((row['title'], urljoin(spec['url'], row['url']), None, day))
    result = []; seen = set()
    for title, url, published, day in candidates:
        try:
            url = public_url(url.strip()); title = ' '.join(unescape(title).split())[:200]
            _text(title, 200)
            if (urlsplit(url).hostname != urlsplit(spec['url']).hostname or url in seen
                    or (published and published > now)
                    or (day and day > now.astimezone(timezone(timedelta(hours=9))).date().isoformat())):
                continue
        except (ValueError, TypeError):
            continue
        seen.add(url)
        row = dict(id=spec['id'] + ':' + sha256(url.encode()).hexdigest()[:16], source_id=spec['id'], kind=spec['kind'],
                   title=title, url=url, published_at=published.isoformat() if published else None, published_date=day,
                   retrieved_at=now.isoformat(), content_changed_at=now.isoformat(), access='INDEX_ONLY', summary=None)
        row['content_digest'] = _digest(row); result.append(row)
        if len(result) == RECORD_LIMIT: break
    return result


def collect_briefing_sources(previous=None, *, now=None, fetch=None):
    # An injected clock supports offline checks; production clocks each completed read.
    clock = (lambda: now) if now is not None else (lambda: datetime.now(timezone.utc))
    started = clock()
    if started.tzinfo is None or started > datetime.now(timezone.utc):
        raise ValueError('PUBLIC_SOURCE_TIME_INVALID')
    previous = validate_briefing_sources(previous) if previous is not None else {'sources': []}
    if previous.get('as_of') and _clock(previous['as_of']) > started:
        raise ValueError('PUBLIC_SOURCE_TIME_INVALID')
    prior = {s['id']: s for s in previous['sources']}; get = fetch or _fetch

    def one(spec):
        result = {k: spec[k] for k in ('id', 'label', 'url', 'kind')}
        result.update(checked_at=started.isoformat(), error_code=None, status='AVAILABLE', records=[])
        old = prior.get(spec['id'], {}).get('records', [])
        try:
            body = get(spec['url'])
            current = _records(spec, body, clock())
            if not current: raise ValueError('PUBLIC_SOURCE_EMPTY')
            known = {row['id']: row for row in old}
            for row in current:
                if row['id'] in known and row['content_digest'] == known[row['id']]['content_digest']:
                    row.update({k: known[row['id']][k] for k in ('retrieved_at', 'content_changed_at')})
            result['records'] = current
        except (OSError, ValueError, KeyError, TypeError, UnicodeError, HTTPException, ElementTree.ParseError):
            result.update(status='RETAINED' if old else 'UNAVAILABLE', error_code='PUBLIC_SOURCE_UNAVAILABLE', records=deepcopy(old))
        result['checked_at'] = clock().isoformat()
        return result

    with ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(one, catalog()['sources']))
    finished = clock()
    candidates = [{**r, 'publication_status': _publication_status(r, finished)} for s in sources for r in s['records']]
    candidates.sort(key=lambda r: (r['published_at'] or r['published_date'] or '', r['id']), reverse=True)
    return validate_briefing_sources(dict(schema_version=1, as_of=finished.isoformat(), sources=sources,
        review_candidates=candidates, learning_authority='SOURCE_REVIEW_ONLY', full_text_review_count=0,
        model_training=False, orders=False))
