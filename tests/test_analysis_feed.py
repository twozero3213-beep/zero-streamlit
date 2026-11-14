import concurrent.futures
import datetime as dt
import importlib.util
import json
from pathlib import Path
import threading
import subprocess
import time
import unittest
from unittest.mock import patch
import urllib.parse

from zero.analysis_feed import AnalysisFeed, CALENDAR


class AnalysisFeedTests(unittest.TestCase):
    def setUp(self):
        self.clock = dt.datetime(2026, 10, 15, tzinfo=dt.timezone.utc).timestamp()
        self.calls = 0
        self.broken = False
        self.lock = threading.Lock()

    def fetch(self, url, timeout):
        with self.lock:
            self.calls += 1
        if self.broken:
            raise ValueError('secret provider body')
        symbol = urllib.parse.unquote(urllib.parse.urlsplit(url).path.split('/')[-1])
        return {'chart': {'error': None, 'result': [{'meta': dict(symbol=symbol, currency='KRW' if symbol.startswith('^K') else 'USD',
            instrumentType='FUTURE' if symbol.endswith('=F') else 'INDEX', regularMarketPrice=101, chartPreviousClose=100, regularMarketTime=int(self.clock))}]}}

    def test_cache_singleflight_stale_expiry(self):
        service = AnalysisFeed(self.fetch, lambda: self.clock)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: service.get_feed(), range(8)))
        self.assertEqual(self.calls, 7)
        original = results[0]
        self.assertEqual(original['state'], 'PARTIAL')
        self.assertEqual(len(original['indices']), 8)
        self.assertEqual(len(original['trends']), 7)
        results[1]['indices'][0]['price'] = 0
        self.assertEqual(service.get_feed()['indices'][0]['price'], 101)
        self.clock += 3601
        self.broken = True
        stale = service.get_feed()
        self.assertEqual(stale['state'], 'STALE')
        self.assertEqual(stale['fetched_at'], original['fetched_at'])
        self.assertNotIn('secret', json.dumps(stale))
        self.assertEqual(service.get_feed(), stale)
        self.assertEqual(self.calls, 14)
        self.clock += 86401
        self.assertIsNone(service.get_feed()['indices'][0]['price'])

    def test_metadata_and_numeric_identity(self):
        for key, value in [('symbol', 'EVIL'), ('regularMarketPrice', True), ('regularMarketPrice', '101'),
                           ('currency', 'EUR'), ('instrumentType', 'EQUITY'), ('regularMarketTime', int(self.clock) + 301)]:
            def invalid(url, timeout):
                body = self.fetch(url, timeout)
                body['chart']['result'][0]['meta'][key] = value
                return body
            with self.subTest(key=key, value=value):
                self.assertEqual(AnalysisFeed(invalid, lambda: self.clock).get_feed()['state'], 'UNAVAILABLE')

    def test_earnings_strict_injection(self):
        value = dict(schema_version=1, scope='PUBLIC_EARNINGS_CALENDAR', source_url=CALENDAR, fetched_at='2026-10-15T00:00:00Z',
                     events=[dict(symbol='AAPL', company='Apple', date='2026-10-16', time='AFTER_MARKET', source_url=CALENDAR)])
        def get():
            return AnalysisFeed(self.fetch, lambda: self.clock, lambda: value).get_feed()['earnings']
        self.assertEqual(get()['state'], 'AVAILABLE')
        self.broken = True
        self.assertEqual(AnalysisFeed(self.fetch, lambda: self.clock, lambda: value).get_feed()['state'], 'PARTIAL')
        self.broken = False
        value['events'][0]['company'] = '<script>private</script>'
        self.assertEqual(get()['state'], 'UNAVAILABLE')
        value['events'][0]['company'] = 'Apple'
        value['token'] = 'private'
        self.assertEqual(get()['events'], [])

    def test_quote_age_and_future_boundaries(self):
        for age, expected in [(86400, 'AVAILABLE'), (86401, 'STALE'), (172800, 'STALE'), (604801, 'UNAVAILABLE'), (-300, 'AVAILABLE'), (-301, 'UNAVAILABLE')]:
            def dated(url, timeout):
                value = self.fetch(url, timeout)
                value['chart']['result'][0]['meta']['regularMarketTime'] -= age
                return value
            with self.subTest(age=age):
                result = AnalysisFeed(dated, lambda: self.clock).get_feed()
                self.assertEqual(result['indices'][0]['state'], expected)
                if expected == 'STALE':
                    self.assertEqual(result['indices'][0]['reason'], 'PUBLIC_QUOTE_DELAYED')
                    self.assertTrue(result['cache']['stale'])
                    self.assertEqual(result['trends'], [])

    def test_deadline_and_late_results(self):
        def slow(url, timeout):
            time.sleep(.08)
            return self.fetch(url, timeout)
        service = AnalysisFeed(slow, lambda: self.clock, deadline_seconds=.01)
        start = time.monotonic()
        result = service.get_feed()
        self.assertLess(time.monotonic() - start, .2)
        self.assertEqual(result['state'], 'UNAVAILABLE')
        time.sleep(.1)
        self.assertEqual(service.get_feed(), result)

    def test_default_provider_failure_never_injects_fixed_spot_as_futures(self):
        import zero.analysis_feed as module
        from zero.realtime_market_pulse import MarketIndexItem
        fixed = MarketIndexItem('SPX', 'S&P 500', 5808.12, 15.20, .26, '2026-10-26T16:00:00-04:00', 'USD', 'US')
        with patch.object(module, '_fetch_json', side_effect=OSError('offline')), patch(
                'zero.realtime_market_pulse.RealtimeMarketPulse.fetch_indices', return_value=[fixed]) as pulse:
            result = AnalysisFeed(now=lambda: self.clock).get_feed()
        self.assertEqual(result['state'], 'UNAVAILABLE')
        self.assertTrue(all(row['price'] is None and row['market_time'] is None for row in result['indices']))
        self.assertEqual(result['trends'], [])
        self.assertIsNone(result['fetched_at'])
        pulse.assert_not_called()

    def test_default_refresh_failure_keeps_only_genuine_dated_cache(self):
        import zero.analysis_feed as module
        with patch.object(module, '_fetch_json', side_effect=self.fetch), patch(
                'zero.realtime_market_pulse.RealtimeMarketPulse.fetch_indices', return_value=[]) as pulse:
            service = AnalysisFeed(now=lambda: self.clock)
            original = service.get_feed()
            self.clock += 3601
            self.broken = True
            result = service.get_feed()
        self.assertEqual(result['state'], 'STALE')
        self.assertEqual(result['indices'][0]['market_time'], original['indices'][0]['market_time'])
        self.assertEqual(result['fetched_at'], original['fetched_at'])
        self.assertEqual(result['trends'], [])
        pulse.assert_not_called()



if __name__ == '__main__':
    unittest.main()
