"""Keyless market attention is sampled metadata, never trading authority."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from importlib import import_module
import json
import threading
import time
from types import SimpleNamespace
import unittest
from unittest import mock

NOW = datetime(2026, 11, 14, 12, tzinfo=timezone.utc)


def community(count=12):
    return json.dumps(dict(count=count, pages=1, current_page=1, results=[dict(rank=i + 1, ticker='AA' + str(i), name='Synthetic company ' + str(i), mentions=20 - i, upvotes=-2 if i == 0 else i, rank_24h_ago=None if i == 0 else i + 2, mentions_24h_ago=0 if i == 0 else i) for i in range(count)])).encode()


def item(title='증시와 실적 소식', token='ARTICLE0001', at=NOW - timedelta(hours=1), publisher='연합뉴스', publisher_url='https://www.yna.co.kr', url=None):
    link = url or 'https://news.google.com/rss/articles/' + token + '?oc=5'
    stamp = format_datetime(at) if isinstance(at, datetime) else at
    return '<item><title>' + title + ' - ' + publisher + '</title><link>' + link + '</link>' + ('<pubDate>' + stamp + '</pubDate>' if stamp else '') + '<source url="' + publisher_url + '">' + publisher + '</source></item>'


def rss(*items):
    return ('<rss><channel><title>Google News</title>' + ''.join(items) + '</channel></rss>').encode()


class MarketWatchTests(unittest.TestCase):
    def setUp(self):
        self.api = import_module('zero.market_watch')
        self.pool = ThreadPoolExecutor(max_workers=2)
        self.addCleanup(lambda: self.pool.shutdown(wait=True, cancel_futures=True))
        for patch in (mock.patch.object(self.api, '_source_pool', self.pool),
                      mock.patch.object(self.api, '_source_slots', threading.BoundedSemaphore(2)),
                      mock.patch.object(self.api, '_cache', {'expires_at': 0.0, 'result': None}),
                      mock.patch.object(self.api, '_pending', None)):
            patch.start(); self.addCleanup(patch.stop)

    def fetch(self, url):
        return community() if 'apewisdom.io' in url else rss(item())

    def test_four_samples_and_two_news_queries_keep_metadata_authority(self):
        status, body = self.api.build(fetch=self.fetch, now=NOW)
        self.assertEqual((status, body['scope'], body['state']), (200, 'MARKET_WATCH', 'AVAILABLE'))
        self.assertEqual(len(body['sources']), 6)
        self.assertEqual([row['id'] for row in body['communities']], ['all-stocks', 'stocks', 'investing', 'wallstreetbets'])
        self.assertTrue(all(len(row['items']) == 10 and row['provider_updated_at'] is None for row in body['communities']))
        self.assertEqual(body['communities'][0]['items'][0]['upvotes'], -2)
        self.assertIsNone(body['provider_updated_at'])
        self.assertEqual(len(body['news']), 1)
        self.assertFalse(body['news'][0]['is_official_disclosure'])
        self.assertFalse(body['orders_authorized'])
        self.assertNotIn('total_mentions', body)
        self.assertNotIn('summary', body['news'][0])

    def test_community_schema_is_bounded_and_preserves_signed_votes(self):
        rows = self.api.parse_community(community())
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows[0]['symbol'], 'AA0')
        self.assertEqual(rows[0]['upvotes'], -2)
        self.assertIsNone(rows[0]['rank_24h_ago'])
        data = json.loads(community())
        for change in (lambda x: x.update(results='invalid'), lambda x: x.update(current_page=2), lambda x: x['results'][0].update(mentions=True), lambda x: x['results'][0].update(ticker='../private'), lambda x: x['results'][0].update(upvotes='NaN')):
            candidate = json.loads(json.dumps(data)); change(candidate)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.api.parse_community(json.dumps(candidate).encode())
        with self.assertRaises(ValueError): self.api.parse_community(b'x' * 1_000_001)

    def test_news_uses_trusted_source_identity_dates_and_google_article_links(self):
        valid = item()
        body = rss(valid, valid, item(token='FUTURE0001', at=NOW + timedelta(seconds=1)),
                   item(token='OLD0000001', at=NOW - timedelta(hours=49)),
                   item(token='DATEONLY01', at='2026-11-14'), item(token='NAIVE00001', at='Sat, 14 Nov 2026 11:00:00'),
                   item(token='MISSING001', at=None), item(token='FORGED0001', publisher_url='https://evil.test'),
                   item(token='UNKNOWN001', publisher='무명블로그'), item(url='https://evil.test/article'),
                   item(url='https://news.google.com.evil.test/rss/articles/ARTICLE0001'),
                   item(url='https://user:pass@news.google.com/rss/articles/ARTICLE0001'),
                   item(url='https://news.google.com/rss/articles/ARTICLE0001?token=secret'))
        rows = self.api.parse_news(body, NOW)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['title'], '증시와 실적 소식')
        self.assertEqual(rows[0]['source'], '연합뉴스')
        self.assertEqual(rows[0]['published_at'], (NOW - timedelta(hours=1)).isoformat())
        self.assertFalse(rows[0]['is_official_disclosure'])
        self.assertNotIn('secret', str(rows))

    def test_news_rejects_entities_oversize_and_layout_changes_but_accepts_empty(self):
        for body in (b'<!DOCTYPE rss [<!ENTITY test "x">]><rss><channel/></rss>', b'<!doctype rss><rss><channel/></rss>', b'x' * 1_000_001, b'<rss><wrong/></rss>', b'<feed xmlns="x"><item/></feed>'):
            with self.subTest(body=body[:30]), self.assertRaises(ValueError): self.api.parse_news(body, NOW)
        self.assertEqual(self.api.parse_news(rss(), NOW), [])

    def test_categories_are_news_topics_not_confirmed_disclosures(self):
        cases = [('공개매수 제안 보도', 'TENDER'), ('최대주주 지분과 주주제안', 'CONTROL_STAKE'), ('기업 실적 발표', 'EARNINGS'), ('금리 정책 발표', 'POLICY'), ('코스피 증시 상승', 'MARKET'), ('회사 이름', 'OTHER')]
        for title, expected in cases:
            with self.subTest(title=title): self.assertEqual(self.api.parse_news(rss(item(title=title)), NOW)[0]['category'], expected)

    def test_partial_empty_and_failed_sources_are_distinct(self):
        def empty(url): return b'{"count":0,"pages":0,"current_page":1,"results":[]}' if 'apewisdom.io' in url else rss()
        status, body = self.api.build(fetch=empty, now=NOW)
        self.assertEqual((status, body['state']), (200, 'EMPTY'))
        self.assertTrue(all(row['status'] == 'EMPTY' for row in body['sources']))
        first = self.api.COMMUNITIES[0]['url']
        def partial(url):
            if url == first: raise OSError('PRIVATE_PROVIDER_DETAIL')
            return empty(url)
        status, body = self.api.build(fetch=partial, now=NOW)
        self.assertEqual((status, body['state']), (200, 'PARTIAL'))
        self.assertEqual(body['sources'][0]['status'], 'UNAVAILABLE')
        self.assertEqual(body['sources'][0]['error_code'], 'PUBLIC_MARKET_SOURCE_UNAVAILABLE')
        self.assertNotIn('PRIVATE_PROVIDER_DETAIL', str(body))
        status, body = self.api.build(fetch=lambda _: (_ for _ in ()).throw(OSError('PRIVATE_DETAIL')), now=NOW)
        self.assertEqual((status, body['state'], body['news']), (503, 'UNAVAILABLE', []))

    def test_transport_uses_only_fixed_source_urls_and_original_deadline(self):
        clock = mock.Mock(monotonic=mock.Mock(return_value=100.0))
        url = self.api.COMMUNITIES[0]['url']
        with mock.patch.object(self.api, 'time', clock), mock.patch.object(self.api, '_read_body', return_value=community()) as read:
            self.assertEqual(self.api._fetch(url, deadline=103.0), community())
            self.assertEqual(read.call_args.kwargs, {'deadline': 102.0, 'limit': 1_000_000})
            request = read.call_args.args[0]
            self.assertEqual(request.full_url, url)
            self.assertNotIn('Authorization', request.headers)
            self.assertNotIn('Cookie', request.headers)
            with self.assertRaises(ValueError): self.api._fetch('https://evil.test/', deadline=103.0)
            self.assertEqual(read.call_count, 1)

    def test_admission_covers_running_and_queued_source_jobs(self):
        slots = self.api._source_slots
        self.assertTrue(slots.acquire(blocking=False)); self.assertTrue(slots.acquire(blocking=False))
        try:
            fetch = mock.Mock(side_effect=AssertionError('SOURCE_MUST_NOT_START'))
            status, body = self.api.build(fetch=fetch, now=NOW)
            self.assertEqual((status, body['state']), (503, 'UNAVAILABLE'))
            fetch.assert_not_called()
        finally:
            slots.release(); slots.release()

    def test_late_workers_do_not_publish_or_grow_a_queue(self):
        entered = threading.Event(); release = threading.Event(); calls = []
        clock = mock.Mock(monotonic=mock.Mock(return_value=100.0))
        def slow(url):
            calls.append(url); entered.set(); release.wait(2)
            return self.fetch(url)
        def expire(pending, *, timeout, return_when):
            self.assertTrue(entered.wait(1), 'start the admitted worker before advancing the test clock')
            clock.monotonic.return_value += timeout + .01
            return set(), set(pending)
        with mock.patch.object(self.api, 'time', clock), mock.patch.object(self.api, 'wait', side_effect=expire), mock.patch.object(self.api, '_fetch', side_effect=lambda url, **kwargs: slow(url)):
            try:
                status, body = self.api.get_market_watch()
                self.assertEqual((status, body['state']), (503, 'UNAVAILABLE'))
                self.assertLessEqual(len(calls), 2)
                self.assertEqual(self.api.get_market_watch()[0], 503)
                self.assertLessEqual(len(calls), 2)
                cached = json.dumps(self.api._cache['result'], sort_keys=True)
            finally:
                release.set()
                self.pool.shutdown(wait=True)
            self.assertEqual(json.dumps(self.api._cache['result'], sort_keys=True), cached)
        self.assertTrue(self.api._source_slots.acquire(blocking=False)); self.api._source_slots.release()

    def test_singleflight_and_cache_prevent_duplicate_collections(self):
        entered = threading.Event(); release = threading.Event()
        result = (200, {'schema_version': 1, 'scope': 'MARKET_WATCH', 'state': 'EMPTY'})
        def build(**kwargs): entered.set(); release.wait(2); return result
        with ThreadPoolExecutor(max_workers=2) as callers, mock.patch.object(self.api, 'build', side_effect=build) as collect:
            first = callers.submit(self.api.get_market_watch)
            self.assertTrue(entered.wait(1))
            second = callers.submit(self.api.get_market_watch)
            release.set()
            self.assertEqual(first.result(2), result); self.assertEqual(second.result(2), result)
            self.assertEqual(collect.call_count, 1)
            cached = self.api.get_market_watch(); cached[1]['state'] = 'MUTATED'
            self.assertEqual(self.api.get_market_watch(), result)
            self.assertEqual(collect.call_count, 1)

    def test_success_and_failure_cache_have_different_ttl(self):
        for status, state, ttl in ((200, 'EMPTY', 300), (503, 'UNAVAILABLE', 30)):
            with self.subTest(status=status):
                self.api._cache.update(expires_at=0.0, result=None)
                clock = mock.Mock(monotonic=mock.Mock(return_value=100.0))
                with mock.patch.object(self.api, 'time', clock), mock.patch.object(self.api, 'build', return_value=(status, {'state': state})) as build:
                    self.assertEqual(self.api.get_market_watch()[0], status)
                    clock.monotonic.return_value = 100 + ttl - 1
                    self.api.get_market_watch(); self.assertEqual(build.call_count, 1)
                    clock.monotonic.return_value += 1
                    self.api.get_market_watch(); self.assertEqual(build.call_count, 2)

    def test_fast_source_is_preserved_when_later_sources_exhaust_the_deadline(self):
        release = threading.Event(); blocked = threading.Event()
        clock = mock.Mock(monotonic=mock.Mock(return_value=100.0))
        first = self.api.NEWS_SOURCES[0]['url']
        original_wait = self.api.wait
        stages = []
        def fetch(url):
            if url == first: return self.fetch(url)
            blocked.set(); release.wait()
            return self.fetch(url)
        def staged_wait(pending, **kwargs):
            stages.append(1)
            if len(stages) == 1:
                done, rest = original_wait(pending, timeout=2, return_when=kwargs['return_when'])
                self.assertTrue(done, 'the fast source must finish before the test clock advances')
                return done, rest
            self.assertTrue(blocked.wait(2))
            clock.monotonic.return_value = 109.0
            return set(), set(pending)
        with mock.patch.object(self.api, 'time', clock), mock.patch.object(self.api, 'wait', side_effect=staged_wait), mock.patch.object(self.api, '_fetch', side_effect=lambda url, **kwargs: fetch(url)):
            try:
                status, body = self.api.get_market_watch()
                self.assertEqual((status, body['state']), (200, 'PARTIAL'))
                self.assertEqual(len(body['news']), 1)
                self.assertEqual(next(row for row in body['sources'] if row['id'] == 'market-news')['status'], 'AVAILABLE')
                self.assertTrue(all(row['status'] == 'UNAVAILABLE' for row in body['sources'] if row['id'] != 'market-news'))
                self.assertIsNone(self.api._cache['result'])
            finally:
                release.set(); self.pool.shutdown(wait=True)

    def test_news_sources_receive_the_first_two_admissions(self):
        seen = []; lock = threading.Lock(); started = threading.Event()
        def fetch(url):
            with lock:
                seen.append(url)
                if len(seen) == 2: started.set()
            self.assertTrue(started.wait(2))
            return self.fetch(url)
        self.assertEqual(self.api.build(fetch=fetch, now=NOW)[0], 200)
        self.assertEqual(set(seen[:2]), {source['url'] for source in self.api.NEWS_SOURCES})

    def test_completed_on_time_future_survives_a_delayed_wait_notification(self):
        clock = mock.Mock(monotonic=mock.Mock(return_value=100.0))
        original_wait = self.api.wait
        def delayed_notification(pending, **kwargs):
            done, _ = original_wait(pending, timeout=2, return_when=kwargs['return_when'])
            self.assertTrue(done, 'complete an admitted source before advancing the test clock')
            clock.monotonic.return_value = 109.0
            return set(), set(pending)
        with mock.patch.object(self.api, 'time', clock), mock.patch.object(self.api, 'wait', side_effect=delayed_notification):
            status, body = self.api.build(fetch=self.fetch, now=NOW, deadline=108.0)
        self.assertEqual((status, body['state']), (200, 'PARTIAL'))
        self.assertTrue(any(row['status'] == 'AVAILABLE' for row in body['sources']))

    def test_closed_source_pool_is_a_fixed_unavailable_result(self):
        self.pool.shutdown(wait=True)
        status, body = self.api.build(fetch=self.fetch, now=NOW)
        self.assertEqual((status, body['state']), (503, 'UNAVAILABLE'))
        self.assertTrue(all(row['error_code'] == 'PUBLIC_MARKET_SOURCE_UNAVAILABLE' for row in body['sources']))
        self.assertTrue(self.api._source_slots.acquire(blocking=False)); self.api._source_slots.release()

    def test_snapshot_assembled_after_common_deadline_keeps_rows_without_caching(self):
        clock = mock.Mock(monotonic=mock.Mock(return_value=100.0))
        def late(**kwargs):
            self.assertEqual(kwargs['deadline'], 108.0)
            clock.monotonic.return_value = 109.0
            return 200, {'state': 'AVAILABLE', 'news': ['COLLECTED_BEFORE_DEADLINE']}
        with mock.patch.object(self.api, 'time', clock), mock.patch.object(self.api, 'build', side_effect=late):
            status, body = self.api.get_market_watch()
        self.assertEqual((status, body['state']), (200, 'AVAILABLE'))
        self.assertEqual(body['news'], ['COLLECTED_BEFORE_DEADLINE'])
        self.assertIsNone(self.api._cache['result']); self.assertIsNone(self.api._pending)

    def test_caller_deadline_is_capped_and_late_partial_is_preserved(self):
        api, clock = self.api, [100.0]
        partial = (200, {'state': 'PARTIAL', 'items': [{'title': '합성'}]})
        def build(*, deadline):
            clock[0] = deadline
            return partial
        for supplied, expected in ((None, 100 + api.DEADLINE_SECONDS), (102.0, 102.0), (1000.0, 100 + api.DEADLINE_SECONDS)):
            clock[0] = 100.0
            with self.subTest(deadline=supplied), mock.patch.object(api, '_cache', {'expires_at': 0.0, 'result': None}), mock.patch.object(api, 'time', SimpleNamespace(monotonic=lambda: clock[0])), mock.patch.object(api, 'build', side_effect=build) as collect:
                self.assertEqual(api.get_market_watch() if supplied is None else api.get_market_watch(deadline=supplied), partial)
                collect.assert_called_once_with(deadline=expected)
                self.assertIsNone(api._cache['result'])
        with mock.patch.object(api, 'time', SimpleNamespace(monotonic=lambda: 100.0)), mock.patch.object(api, 'build') as collect:
            self.assertEqual(api.get_market_watch(deadline=99.0)[0], 503)
            collect.assert_not_called()

    def test_singleflight_waiter_uses_the_shorter_caller_budget(self):
        api, pending = self.api, mock.Mock()
        pending.result.side_effect = api.FutureTimeout
        with mock.patch.object(api, '_pending', pending), mock.patch.object(api, 'time', SimpleNamespace(monotonic=lambda: 100.0)), mock.patch.object(api, 'build') as collect:
            self.assertEqual(api.get_market_watch(deadline=100.5)[0], 503)
            pending.result.assert_called_once_with(timeout=0.5)
            collect.assert_not_called()


if __name__ == '__main__': unittest.main()
