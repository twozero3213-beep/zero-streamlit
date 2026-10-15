"""Official provider contracts, mocked transports only; no runtime secrets."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import importlib
import io
import json
from pathlib import Path
import sys
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import zero_discovery as discovery
import zero_proxy as proxy
from zero_trend_filter import clean_trend_keyword, fallback_keywords

NOW = datetime(2026, 10, 15, 3, tzinfo=timezone.utc)
RSS = '<rss version="2.0"><channel><item><title>인공지능 반도체</title><pubDate>Thu, 15 Oct 2026 03:00:00 GMT</pubDate></item></channel></rss>'.encode()
SYNTHETIC_KEY = 'test-only-injected-credential'


def youtube_body(titles):
    return json.dumps({'kind': 'youtube#videoListResponse', 'items': [
        {'snippet': {'title': title}} for title in titles]}, ensure_ascii=True).encode()


class TrendTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('zero_trend_providers'), 'provider sidecar is missing')
        self.providers = importlib.import_module('zero_trend_providers')
        self.service = importlib.import_module('zero_trends')
        proxy._cache.clear()

    def assert_safe(self, result):
        for word in result['safe_keywords'] + [result['safe_keyword']]:
            self.assertEqual(clean_trend_keyword(word), word)
            self.assertLessEqual(len(word), 15)

    def test_google_reuses_rss_parser_and_filters_before_output(self):
        fetch = mock.Mock(return_value=RSS)
        value = self.providers.collect_google(NOW, fetch=fetch)
        fetch.assert_called_once_with(discovery.TRENDS_URL)
        self.assertEqual(value['provider'], 'GOOGLE_TRENDS_RSS')
        self.assertEqual(value['state'], 'AVAILABLE')
        self.assertEqual(value['safe_keywords'], ['인공지능 반도체'])
        self.assert_safe(value)

    def test_all_three_stages_unicode_length_and_secret_echo(self):
        bad = ['사망 소식', '탄 핵', '도박', '씨.발', 'ＣＡＳＩＮＯ', 'a\u200bb', 'a\ud800b',
               'ㅋㅋㅋ', '!!!', '12345', '가' * 16, '<b>커피</b>', SYNTHETIC_KEY]
        fetch = mock.Mock(return_value=youtube_body(bad + ['ＡＩ 반도체', 'AI 반도체']))
        value = self.providers.collect_youtube(NOW, enabled=True, api_key=SYNTHETIC_KEY, fetch=fetch)
        self.assertEqual(value['safe_keywords'], ['AI 반도체'])
        self.assertEqual([row['keyword'] for row in value['items']], ['AI 반도체'])
        self.assertNotIn(SYNTHETIC_KEY, json.dumps(value))
        self.assert_safe(value)

    def test_disabled_missing_invalid_configuration_never_fetches_or_reads_environment(self):
        fetch = mock.Mock()
        with mock.patch('os.getenv', side_effect=AssertionError('no implicit environment reads')):
            for enabled, key, state in [(False, SYNTHETIC_KEY, 'DISABLED'), (True, None, 'NOT_CONFIGURED'),
                                         (True, 'bad\nkey', 'NOT_CONFIGURED'), ('true', SYNTHETIC_KEY, 'DISABLED')]:
                value = self.providers.collect_youtube(NOW, enabled=enabled, api_key=key, fetch=fetch)
                self.assertEqual(value['state'], state)
                self.assertTrue(value['fallback'])
                self.assert_safe(value)
        fetch.assert_not_called()

    def test_youtube_fixed_official_chart_and_header_key_only(self):
        fetch = mock.Mock(return_value=youtube_body(['산책 날씨']))
        value = self.providers.collect_youtube(NOW, enabled=True, api_key=SYNTHETIC_KEY, fetch=fetch)
        url = fetch.call_args.args[0]
        self.assertTrue(url.startswith('https://www.googleapis.com/youtube/v3/videos?'))
        self.assertIn('chart=mostPopular', url)
        self.assertIn('regionCode=KR', url)
        self.assertNotIn(SYNTHETIC_KEY, url)
        self.assertEqual(fetch.call_args.kwargs['headers']['X-Goog-Api-Key'], SYNTHETIC_KEY)
        self.assertEqual(value['state'], 'AVAILABLE')
        self.assertEqual(value['source_url'], self.providers.YOUTUBE_DOCS)

    def test_unsupported_naver_and_provider_vs_keyword_availability(self):
        value = self.providers.naver_trends(NOW)
        self.assertEqual(value['state'], 'UNSUPPORTED')
        self.assertEqual(value['reason'], 'GLOBAL_POPULAR_SEARCH_UNSUPPORTED')
        self.assertEqual(value['items'], [])
        self.assertTrue(value['fallback'])
        filtered = self.providers.collect_youtube(NOW, enabled=True, api_key=SYNTHETIC_KEY,
                                                  fetch=lambda *a, **k: youtube_body(['사망']))
        self.assertEqual(filtered['state'], 'AVAILABLE')
        self.assertEqual(filtered['reason'], 'NO_SAFE_KEYWORDS')
        self.assertEqual(filtered['items'], [])
        self.assertTrue(filtered['fallback'])
        self.assert_safe(filtered)

    def test_bad_provider_responses_fail_closed_without_body_or_exception(self):
        bodies = [b'not json', b'[]', b'{}', b'{"items":{}}', b'{"error":{"message":"private"}}',
                  b'x' * (self.providers.MAX_BYTES + 1)]
        for body in bodies:
            value = self.providers.collect_youtube(NOW, enabled=True, api_key=SYNTHETIC_KEY,
                                                   fetch=lambda *a, **k: body)
            self.assertEqual(value['state'], 'UNAVAILABLE')
            self.assertNotIn('private', json.dumps(value))
            self.assert_safe(value)
        with mock.patch('sys.stdout', new_callable=io.StringIO) as out, mock.patch('sys.stderr', new_callable=io.StringIO) as err:
            fetch = mock.Mock(side_effect=OSError(SYNTHETIC_KEY))
            value = self.providers.collect_youtube(NOW, enabled=True, api_key=SYNTHETIC_KEY, fetch=fetch)
        self.assertEqual(value['state'], 'UNAVAILABLE')
        self.assertNotIn(SYNTHETIC_KEY, json.dumps(value) + out.getvalue() + err.getvalue())
        self.assertEqual(self.providers.collect_google(NOW, fetch=mock.Mock(side_effect=OSError('private')))['state'], 'UNAVAILABLE')

    def test_transport_fixed_hosts_no_redirect_size_timeout(self):
        for url in ['http://www.googleapis.com/youtube/v3/videos', 'https://evil.test/',
                    'https://www.googleapis.com@evil.test/', 'https://www.googleapis.com/youtube/v3/videos?key=secret',
                    'https://trends.google.com/trending/rss?geo=KR&url=https://evil.test']:
            with mock.patch.object(self.providers, 'build_opener') as opener:
                with self.assertRaises(ValueError):
                    self.providers._fetch(url)
                opener.assert_not_called()
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.read.return_value = b'{}'
        with mock.patch.object(self.providers, 'build_opener') as opener:
            opener.return_value.open.return_value = response
            self.providers._fetch(self.providers.YOUTUBE_URL, headers={'X-Goog-Api-Key': SYNTHETIC_KEY})
            self.assertEqual(opener.return_value.open.call_args.kwargs['timeout'], 4)
            self.assertIsNone(opener.call_args.args[0].redirect_request(None, None, None, None, None, None))
            response.read.assert_called_once_with(self.providers.MAX_BYTES + 1)
            response.read.return_value = b'x' * (self.providers.MAX_BYTES + 1)
            with self.assertRaises(ValueError):
                self.providers._fetch(self.providers.YOUTUBE_URL)
            response.status = 302
            with self.assertRaises(ValueError):
                self.providers._fetch(self.providers.YOUTUBE_URL)

    def test_service_reuses_existing_google_hourly_cache_and_optional_singleflight(self):
        service = self.service.TrendService(youtube_enabled=True, youtube_api_key=SYNTHETIC_KEY)
        with mock.patch.object(discovery, 'collect_trends', return_value=discovery.filtered_trends({'items': [{'keyword': '산책 날씨'}]}, NOW)) as google, \
             mock.patch.object(self.providers, '_fetch', return_value=youtube_body(['실적 발표'])) as youtube, \
             mock.patch.object(proxy.time, 'monotonic', return_value=100):
            google_cached = proxy.get_trends()
            with ThreadPoolExecutor(max_workers=4) as pool:
                values = list(pool.map(lambda _: service.get_trends(NOW), range(4)))
            self.assertEqual(google.call_count, 1)
            self.assertEqual(youtube.call_count, 1)
            self.assertEqual(set(values[0]['safe_keywords']), {'산책 날씨', '실적 발표'})
            self.assertEqual([p['state'] for p in values[0]['providers']], ['AVAILABLE', 'AVAILABLE', 'UNSUPPORTED'])
            self.assertEqual(proxy._cache['trends'][1], google_cached)
            with mock.patch.object(proxy.time, 'monotonic', return_value=3699):
                service.get_trends(NOW)
                self.assertEqual(youtube.call_count, 1)
            with mock.patch.object(proxy.time, 'monotonic', return_value=3700):
                service.get_trends(NOW)
                self.assertEqual(youtube.call_count, 2)
        self.assert_safe(values[0])
        self.assertNotIn(SYNTHETIC_KEY, repr(service) + json.dumps(values))

    def test_safe_fallback_keeps_market_time_and_weather_branches(self):
        for month, hour, expected in [(1, 0, '따뜻한 모닝커피'), (7, 0, '아이스 아메리카노'),
                                       (10, 3, '오늘 점심 메뉴'), (10, 16, '편안한 휴식'), (10, 7, '산책 날씨')]:
            now = NOW.replace(month=month, hour=hour)
            words = fallback_keywords(now)
            self.assertIn(expected, words)
            self.assertIn('원·달러 환율', words)
            self.assertTrue(all(clean_trend_keyword(word) == word for word in words))


    def test_service_preserves_google_observation_time_and_invalid_key_is_safe(self):
        observed = NOW.replace(hour=2).isoformat()
        cached = discovery.filtered_trends({'items': [{'keyword': '산책 날씨'}], 'retrieved_at': observed}, NOW)
        for invalid_key in (None, 123, {}, 'bad\nkey'):
            with mock.patch.object(proxy, 'get_trends', return_value=json.dumps(cached).encode()):
                result = self.service.TrendService(youtube_enabled=True, youtube_api_key=invalid_key).get_trends(NOW)
            self.assertEqual(result['providers'][0]['retrieved_at'], observed)
            self.assertEqual(result['providers'][1]['state'], 'NOT_CONFIGURED')

    def test_cached_google_is_refiltered_and_fallback_is_not_live_data(self):
        raw = {'state': 'AVAILABLE', 'retrieved_at': NOW.isoformat(), 'items': [
            {'keyword': '탄 핵'}, {'keyword': '가' * 16}, {'keyword': '산책 날씨'}]}
        with mock.patch.object(proxy, 'get_trends', return_value=json.dumps(raw).encode()):
            result = self.service.TrendService().get_trends(NOW)
        self.assertEqual(result['safe_keywords'], ['산책 날씨'])
        raw.update(state='UNAVAILABLE', items=[{'keyword': '산책 날씨'}])
        with mock.patch.object(proxy, 'get_trends', return_value=json.dumps(raw).encode()):
            result = self.service.TrendService().get_trends(NOW)
        self.assertTrue(result['fallback'])
        self.assertTrue(all(not provider['items'] for provider in result['providers']))
        self.assert_safe(result)

    def test_fresh_google_collection_does_not_look_like_a_future_observation(self):
        clock = [NOW]
        class Clock(datetime):
            @classmethod
            def now(cls, tz=None):
                return clock[0]
        def collect():
            clock[0] = NOW.replace(second=5)
            return json.dumps(discovery.filtered_trends({'items': [{'keyword': '산책 날씨'}]}, clock[0])).encode()
        with mock.patch.object(self.service, 'datetime', Clock), mock.patch.object(proxy, 'get_trends', side_effect=collect):
            result = self.service.TrendService().get_trends()
        self.assertEqual(result['providers'][0]['state'], 'AVAILABLE')
        self.assertFalse(result['fallback'])

if __name__ == '__main__':
    unittest.main()




class RouteIntegrationTests(unittest.TestCase):
    def test_shared_route_uses_injected_service_without_secrets_or_account_access(self):
        from zero_trends import TrendService
        service=TrendService()
        payload={'schema_version':1,'providers':[{'state':'AVAILABLE','retrieved_at':NOW.isoformat(),'items':[{'keyword':'반도체','traffic':None}]}],
                 'safe_keywords':['반도체'],'safe_keyword':'반도체','fallback':False}
        with mock.patch.object(service,'get_trends',return_value=payload), mock.patch.object(proxy,'_trend_service',service):
            result=json.loads(proxy.get_public_trends())
        self.assertEqual(result['safe_keyword'],'반도체')
        self.assertEqual(result['state'],'AVAILABLE')
        self.assertEqual(result['items'][0]['keyword'],'반도체')
        self.assertIn('전체 검색 순위 아님',result['source_label'])
        with self.assertRaises(ValueError): proxy.configure_trends(object())
