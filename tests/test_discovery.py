"""Public discovery contracts; synthetic inputs and temporary persistence only."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import threading
import time
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import zero_discovery as discovery
import zero_headlines as headlines
import zero_proxy as proxy
from starlette.requests import Request

NOW = datetime(2026, 10, 15, 0, 0, tzinfo=timezone.utc)
TITLE = 'Scientists discover a new planet'
ROW = {'market': '미국', 'publisher': 'Reuters', 'url': 'https://news.google.com/rss/articles/synthetic', 'title': TITLE}
GOOD = json.dumps({'responseStatus': 200, 'quotaFinished': False, 'responseData': {'translatedText': '과학자들이 새로운 행성을 발견하다'}}).encode()
RSS = b'<rss xmlns:ht="https://trends.google.com/trending/rss"><channel><item><title>alpha &amp; beta</title><ht:approx_traffic>200+</ht:approx_traffic><pubDate>Wed, 14 Oct 2026 09:40:00 -0700</pubDate></item><item><title>bad</title><pubDate>invalid</pubDate></item></channel></rss>'

class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        proxy._cache.clear()
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = Path(self.tmp.name) / 'translations.json'

    def translate(self, row=None, fetch=None, now=100000):
        return discovery.translate_public_headline(ROW if row is None else row, store=self.store, fetch=fetch or (lambda url: GOOD), now=now)

    def test_fixed_rss_schema_namespace_dates_plain_text_and_limits(self):
        fetch = mock.Mock(return_value=RSS)
        value = discovery.collect_trends(NOW, fetch=fetch)
        fetch.assert_called_once_with('https://trends.google.com/trending/rss?geo=KR')
        self.assertEqual(set(value), {'schema_version', 'items', 'retrieved_at', 'source_url'})
        self.assertEqual(value['schema_version'], 1)
        self.assertEqual(value['items'], [{'keyword': 'alpha & beta', 'traffic': '200+', 'published_at': '2026-10-14T16:40:00+00:00'}])
        self.assertEqual(value['retrieved_at'], NOW.isoformat())
        with self.assertRaises(ValueError):
            discovery.collect_trends(NOW, fetch=lambda url: b'x' * (discovery.RSS_LIMIT + 1))
        with self.assertRaises(ValueError):
            discovery.collect_trends(NOW, fetch=lambda url: b'<!DOCTYPE rss [<!ENTITY x "private">]><rss><channel/></rss>')
        many = b'<rss><channel/></rss>'
        self.assertEqual(discovery.collect_trends(NOW, fetch=lambda url: many)['items'], [])

    def test_rss_route_cache_600_seconds_and_refuses_queries_writes(self):
        def call(method='GET', query=b''):
            scope = {'type': 'http', 'method': method, 'path': '/zero/api/trends', 'query_string': query, 'headers': [], 'path_params': {'path': 'trends'}}
            return asyncio.run(proxy.api(Request(scope)))
        value = {'schema_version': 1, 'items': [], 'retrieved_at': NOW.isoformat(), 'source_url': discovery.TRENDS_URL}
        with mock.patch.object(discovery, 'collect_trends', return_value=value) as collect, mock.patch.object(proxy.time, 'monotonic', return_value=100):
            self.assertEqual(json.loads(call().body), value)
            self.assertEqual(call().status_code, 200)
            self.assertEqual(proxy._cache['trends'][0], 700)
        collect.assert_called_once()
        self.assertEqual(call(query=b'q=private').status_code, 404)
        self.assertEqual(call('POST').status_code, 403)
        proxy._cache.clear()
        with mock.patch.object(discovery, 'collect_trends', side_effect=ValueError('PRIVATE')):
            r = call()
        self.assertEqual((r.status_code, json.loads(r.body)), (503, {'error': 'TRENDS_UNAVAILABLE'}))

    def test_exact_persistent_cache_anonymous_query_and_charge_before_send(self):
        def fetch(url):
            query = parse_qs(urlsplit(url).query)
            self.assertEqual(set(query), {'q', 'langpair'})
            self.assertEqual(query['langpair'], ['en|ko'])
            self.assertTrue(query['q'][0].startswith(TITLE))
            state = json.loads(self.store.read_text(encoding='utf-8'))
            self.assertGreaterEqual(sum(event[1] for event in state['charges']), len(query['q'][0].encode('utf-8')))
            return GOOD
        fetch = mock.Mock(side_effect=fetch)
        self.assertEqual(self.translate(fetch=fetch), '과학자들이 새로운 행성을 발견하다')
        self.assertEqual(self.translate(fetch=fetch, now=100001), '과학자들이 새로운 행성을 발견하다')
        fetch.assert_called_once()
        changed = dict(ROW, title=TITLE + '!')
        self.translate(changed, fetch=fetch)
        self.assertEqual(fetch.call_count, 2)

    def test_privacy_and_utf8_size_guards_do_not_send_or_create_store(self):
        fetch = mock.Mock(return_value=GOOD)
        for row in ({'title': 'my private note'}, dict(ROW, market='한국'), dict(ROW, publisher='Unknown'), dict(ROW, url='https://private.example/account'), dict(ROW, url='https://news.google.com@private.example/rss/articles/x'), dict(ROW, title='계좌 비공개'), dict(ROW, title='English Привет'), dict(ROW, title='a' * 501), dict(ROW, title=''), dict(ROW, title='title\nprivate'), dict(ROW, title='Email private@example.com')):
            self.assertIsNone(self.translate(row, fetch=fetch))
        fetch.assert_not_called()
        self.assertFalse(self.store.exists())
        self.assertEqual(discovery.title_bytes('a' * 500), 500)
        self.assertIsNone(discovery.title_bytes('a' * 501))
        self.assertIsNone(discovery.title_bytes('English ' + 'é' * 247))

    def test_rolling_budget_charged_failures_restart_and_expiry(self):
        state = {'schema_version': 1, 'charges': [[100000, 498]] * 8 + [[100000, 6]], 'cache': {}, 'blocked_until': 0}
        self.store.write_text(json.dumps(state))
        fetch = mock.Mock(return_value=GOOD)
        self.assertIsNone(self.translate(fetch=fetch))
        fetch.assert_not_called()
        self.assertIsNotNone(self.translate(fetch=fetch, now=100000 + 86401))
        fetch.assert_called_once()
        self.store.write_text(json.dumps({'schema_version': 1, 'charges': [], 'cache': {}, 'blocked_until': 0}))
        def fail(url):
            self.assertTrue(json.loads(self.store.read_text(encoding='utf-8'))['charges'])
            raise OSError('PRIVATE')
        fetch = mock.Mock(side_effect=fail)
        self.assertIsNone(self.translate(fetch=fetch))
        self.assertIsNone(self.translate(fetch=fetch))
        fetch.assert_called_once()
        self.assertNotIn('PRIVATE', self.store.read_text(encoding='utf-8'))

    def test_quota_and_invalid_provider_output_never_become_translations(self):
        quota = json.dumps({'responseStatus': 200, 'quotaFinished': True, 'responseData': {'translatedText': 'quota warning'}}).encode()
        fetch = mock.Mock(return_value=quota)
        self.assertIsNone(self.translate(fetch=fetch))
        self.assertIsNone(self.translate(dict(ROW, title=TITLE + '!'), fetch=fetch))
        fetch.assert_called_once()
        self.assertGreater(json.loads(self.store.read_text(encoding='utf-8'))['blocked_until'], 100000)
        for response in (b'invalid', b'[]', b'{"responseStatus":403}', json.dumps({'responseStatus':200,'responseData':{'translatedText':'<script>bad</script>'}}).encode()):
            self.store.write_text(json.dumps({'schema_version':1,'charges':[],'cache':{},'blocked_until':0}))
            self.assertIsNone(self.translate(fetch=lambda url: response))

    def test_http_quota_stops_new_titles_and_success_requires_real_translation(self):
        fetch = mock.Mock(side_effect=HTTPError('https://api.mymemory.translated.net/get', 429, 'quota', {}, None))
        self.assertIsNone(self.translate(fetch=fetch))
        self.assertIsNone(self.translate(dict(ROW, title=TITLE + '!'), fetch=fetch))
        fetch.assert_called_once()

    def test_limits_entity_rejection_and_naive_news_dates(self):
        items = ''.join('<item><title>keyword %d</title><pubDate>Wed, 14 Oct 2026 09:40:00 -0700</pubDate></item>' % i for i in range(250))
        value = discovery.collect_trends(NOW, fetch=lambda url: ('<rss><channel>' + items + '</channel></rss>').encode())
        self.assertEqual(len(value['items']), 50)
        html = b'<rss><channel><item><title>&lt;b&gt;headline&lt;/b&gt;</title><pubDate>Wed, 14 Oct 2026 09:40:00 -0700</pubDate></item></channel></rss>'
        self.assertEqual(discovery.collect_trends(NOW, fetch=lambda url: html)['items'][0]['keyword'], 'headline')
        body = b'<rss><channel><item><title>Senate vote</title><link>https://news.google.com/rss/articles/x</link><source>Reuters</source><pubDate>Wed, 14 Oct 2026 09:40:00</pubDate></item></channel></rss>'
        translate = mock.Mock()
        self.assertEqual(headlines.collect(NOW, fetch=lambda url: body, translate=translate)['items'], [])
        translate.assert_not_called()

    def test_clock_rollback_keeps_budget_and_same_title_different_case_is_not_cached(self):
        state = {'schema_version':1, 'charges': [[100000, 500]] * 8, 'cache': {}, 'blocked_until':0}
        self.store.write_text(json.dumps(state))
        fetch = mock.Mock(return_value=GOOD)
        self.assertIsNone(self.translate(fetch=fetch, now=99999))
        fetch.assert_not_called()
        self.store.write_text(json.dumps({'schema_version':1,'charges':[],'cache':{},'blocked_until':0}))
        self.translate(fetch=fetch)
        self.translate(dict(ROW, title=TITLE.upper()), fetch=fetch)
        self.assertEqual(fetch.call_count, 2)

    def test_translation_count_bound_and_failed_original_retained(self):
        items = ''.join('<item><title>Headline %d uniqueword%d - Reuters</title><link>https://news.google.com/rss/articles/%d</link><source>Reuters</source><pubDate>Thu, 15 Oct 2026 00:00:00 GMT</pubDate></item>' % (i,i,i) for i in range(12))
        translate = mock.Mock(return_value=None)
        with mock.patch.object(headlines, 'similar', return_value=False):
            value = headlines.collect(NOW, fetch=lambda url: ('<rss><channel>'+items+'</channel></rss>').encode(), translate=translate)
        self.assertEqual(translate.call_count, 2)
        self.assertTrue(all(row['title_ko'] is None and row['translation_status'] == 'PROVIDER_UNAVAILABLE' and row['title'] for row in value['items']))

    def test_standard_google_news_article_query_is_allowed_but_private_parameters_are_not(self):
        fetch = mock.Mock(return_value=GOOD)
        self.assertIsNotNone(self.translate(dict(ROW, url=ROW['url']+'?oc=5'), fetch=fetch))
        for suffix in ('?q=private', '?oc=5&q=private', '?oc=5&q=', '?oc=5&oc=5', '#private'):
            self.assertIsNone(self.translate(dict(ROW, url=ROW['url']+suffix), fetch=fetch))
        fetch.assert_called_once()

    def test_debit_persistence_failure_never_sends(self):
        fetch = mock.Mock(return_value=GOOD)
        with mock.patch.object(discovery, '_save_state', side_effect=OSError('synthetic failure')):
            self.assertIsNone(self.translate(fetch=fetch))
        fetch.assert_not_called()
        self.assertFalse(self.store.with_suffix('.lock').exists())

    def test_long_original_title_is_retained_without_transmitting_truncated_text(self):
        title = 'Scientists ' + 'x' * 501
        body = ('<rss><channel><item><title>' + title + ' - Reuters</title><link>https://news.google.com/rss/articles/x</link><source>Reuters</source><pubDate>Thu, 15 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>').encode()
        translate = mock.Mock()
        value = headlines.collect(NOW, fetch=lambda url: body, translate=translate)
        self.assertEqual(value['items'][0]['title'], title)
        translate.assert_not_called()

    def test_corrupt_or_locked_persistence_fails_closed(self):
        fetch = mock.Mock(return_value=GOOD)
        self.store.write_text('corrupt')
        self.assertIsNone(self.translate(fetch=fetch))
        self.store.write_text(json.dumps({'schema_version':1,'charges':[],'cache':{},'blocked_until':0}))
        self.store.with_suffix('.lock').write_text('synthetic lock')
        self.assertIsNone(self.translate(fetch=fetch))
        fetch.assert_not_called()

    def test_concurrent_exact_title_is_sent_once(self):
        fetch = mock.Mock(return_value=GOOD)
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.translate(fetch=fetch), range(4)))
        self.assertIn('과학자들이 새로운 행성을 발견하다', results)
        self.assertTrue(all(value in (None, '과학자들이 새로운 행성을 발견하다') for value in results))
        fetch.assert_called_once()

    def test_http_transport_timeout_size_and_no_redirect(self):
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.read.return_value = GOOD
        opener = mock.Mock()
        opener.open.return_value = response
        with mock.patch.object(discovery, 'build_opener', return_value=opener):
            self.assertEqual(discovery._fetch_translation('https://api.mymemory.translated.net/get?q=x&langpair=en%7Cko'), GOOD)
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 4)
        self.assertIsNone(discovery._NoRedirect().redirect_request(None, None, None, None, None, None))

    def test_trend_dates_accept_boundaries_and_reject_stale_or_future(self):
        ages = (48*3600, 48*3600+1, -300, -301, 0)
        items = ''.join('<item><title>age %d</title><pubDate>%s</pubDate></item>' % (age, (NOW-timedelta(seconds=age)).strftime('%a, %d %b %Y %H:%M:%S GMT')) for age in ages)
        value = discovery.collect_trends(NOW, fetch=lambda url: ('<rss><channel>'+items+'</channel></rss>').encode())
        self.assertEqual([row['keyword'] for row in value['items']], ['age 172800','age -300','age 0'])

    def test_cached_retrieval_never_sends_and_distinguishes_failure_from_miss(self):
        fetch = mock.Mock(return_value=GOOD)
        self.translate(fetch=fetch)
        self.assertEqual(discovery.cached_public_headline(ROW, store=self.store, now=100001), (True, '과학자들이 새로운 행성을 발견하다'))
        self.assertEqual(discovery.cached_public_headline(dict(ROW,title=TITLE+'!'), store=self.store), (False,None))
        state=json.loads(self.store.read_text(encoding='utf-8')); state['cache']['en|ko:'+TITLE]=None
        self.store.write_text(json.dumps(state))
        self.assertEqual(discovery.cached_public_headline(ROW, store=self.store), (True,None))
        fetch.assert_called_once()

    def test_held_http_translation_lock_does_not_queue_other_threads(self):
        entered, release = threading.Event(), threading.Event()
        def fetch(url):
            entered.set(); release.wait(timeout=2); return GOOD
        with ThreadPoolExecutor(max_workers=2) as pool:
            owner=pool.submit(self.translate, fetch=fetch)
            self.assertTrue(entered.wait(timeout=1))
            start=time.monotonic()
            self.assertIsNone(self.translate(dict(ROW,title=TITLE+'!'),fetch=mock.Mock(side_effect=AssertionError('must not send'))))
            self.assertLess(time.monotonic()-start,0.5)
            release.set()
            self.assertIsNotNone(owner.result(timeout=2))

    def test_cached_titles_after_two_misses_are_reused_without_new_requests(self):
        items=''.join('<item><title>Headline %d uniqueword%d - Reuters</title><link>https://news.google.com/rss/articles/%d</link><source>Reuters</source><pubDate>Thu, 15 Oct 2026 00:00:00 GMT</pubDate></item>' % (i,i,i) for i in range(12))
        cached=lambda row: (True,'캐시 제목') if row['title'].startswith('Headline 3 ') else (False,None)
        translate=mock.Mock(return_value=None)
        with mock.patch.object(headlines,'similar',return_value=False):
            value=headlines.collect(NOW,fetch=lambda url: ('<rss><channel>'+items+'</channel></rss>').encode(),translate=translate,cached=cached)
        translate.assert_called(); self.assertEqual(translate.call_count,2)
        row=next(row for row in value['items'] if row['title'].startswith('Headline 3 '))
        self.assertEqual((row['title_ko'],row['translation_status']),('캐시 제목','TRANSLATED'))

    def test_collector_deadline_returns_without_overlapping_cold_fetches(self):
        entered,release=threading.Event(),threading.Event()
        calls=[]
        def fetch(url):
            calls.append(url); entered.set(); release.wait(timeout=2); return b'<rss><channel/></rss>'
        with mock.patch.object(headlines,'COLLECT_SECONDS',0.05):
            start=time.monotonic()
            first=headlines.collect(NOW,fetch=fetch)
            self.assertLess(time.monotonic()-start,0.5)
            self.assertEqual(first['items'],[])
            self.assertEqual(first['failed'],['미국','한국'])
            other=mock.Mock(side_effect=AssertionError('overlapping cold request'))
            self.assertEqual(headlines.collect(NOW,fetch=other)['items'],[])
            other.assert_not_called()
            release.set()
        for _ in range(100):
            if not headlines._collect_lock.locked(): break
            time.sleep(0.005)
        self.assertFalse(headlines._collect_lock.locked())
        self.assertEqual(len(calls),1,'deadline prevents remaining RSS and translation requests')

    def test_translation_deadline_retains_independent_original_snapshot_and_real_feed_failures(self):
        body = ('<rss><channel><item><title>BREAKING: Senate vote - Reuters</title><link>https://news.google.com/rss/articles/x</link><source>Reuters</source><pubDate>Thu, 15 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>').encode()
        for partial in (False, True):
            with self.subTest(partial=partial):
                entered, release = threading.Event(), threading.Event()
                def fetch(url):
                    time.sleep(0.02)
                    if partial and 'gl=KR' in url:
                        raise OSError('synthetic feed unavailable')
                    return body
                def translate(row):
                    entered.set(); release.wait(timeout=2)
                    return '늦게 도착한 번역'
                try:
                    with mock.patch.object(headlines, 'COLLECT_SECONDS', 0.2):
                        start = time.monotonic()
                        value = headlines.collect(NOW, fetch=fetch, translate=translate, cached=lambda row: (False,None))
                    self.assertTrue(entered.is_set())
                    self.assertLess(time.monotonic()-start, 0.7)
                    self.assertTrue(headlines._collect_lock.locked(), 'HTTP worker remains alive after deadline')
                    self.assertEqual(value['failed'], ['한국'] if partial else [])
                    self.assertEqual(len(value['items']), 1)
                    row = value['items'][0]
                    self.assertEqual((row['title'],row['title_ko'],row['translation_status'],row['kind']), ('BREAKING: Senate vote',None,'PENDING','BREAKING'))
                    before = json.dumps(value,ensure_ascii=False)
                finally:
                    release.set()
                    for _ in range(200):
                        if not headlines._collect_lock.locked(): break
                        time.sleep(0.005)
                self.assertFalse(headlines._collect_lock.locked())
                self.assertEqual(json.dumps(value,ensure_ascii=False),before,'late translation must not mutate returned/cached snapshot')

    def test_original_prefix_classification_only(self):
        for title, kind in (('[속보] 정부 발표','BREAKING'), ('BREAKING: Senate vote','BREAKING'), ('Exclusive: Treasury plan','EXCLUSIVE'), ('[단독] 국회 협상','EXCLUSIVE'), ('Senate discusses breaking news','GENERAL'), ('Government says exclusive talks','GENERAL')):
            self.assertEqual(headlines.classify(title), kind)

    def test_collection_preserves_original_and_translates_only_retained_public_english(self):
        body = ('<rss><channel><item><title>BREAKING: Senate vote - Reuters</title><link>https://news.google.com/rss/articles/x</link><source>Reuters</source><pubDate>Thu, 15 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>').encode()
        translate = mock.Mock(return_value='속보: 상원 표결')
        value = headlines.collect(NOW, fetch=lambda url: body, translate=translate)
        self.assertEqual(len(value['items']), 1)
        row = value['items'][0]
        self.assertEqual((row['title'],row['title_ko'],row['kind']), ('BREAKING: Senate vote','속보: 상원 표결','BREAKING'))
        translate.assert_called_once()
        self.assertEqual(len(headlines.QUERIES), 4)
        self.assertEqual({q[0] for q in headlines.QUERIES}, {'미국','한국'})

if __name__ == '__main__':
    unittest.main()
