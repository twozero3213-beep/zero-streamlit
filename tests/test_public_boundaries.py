"""Synthetic public adapter boundaries; no provider or owner runtime access."""
import gzip
import io
import json
import unittest
from datetime import datetime, timezone
from unittest import mock
from urllib.error import HTTPError

import zero_macro
import zero_proxy
import zero_research


class Response:
    def __init__(self, body, encoding=''):
        self.body = body
        self.headers = {'Content-Encoding': encoding}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, limit):
        return self.body[:limit]


class PublicBoundaryTests(unittest.TestCase):
    def setUp(self):
        zero_proxy._cache.clear()
        self.addCleanup(zero_proxy._cache.clear)
        patch = mock.patch.object(zero_proxy, '_secret',
                                  side_effect=lambda name: 'synthetic' if name.startswith('CF_') else None)
        patch.start()
        self.addCleanup(patch.stop)

    def test_plain_and_gzip_limits_apply_to_decoded_body(self):
        valid = b'{"value":12.5,"unknown":null,"label":"NaN"}'
        oversized = json.dumps({'value': 'x' * 300}).encode()
        for encoding, body in (('', valid), ('gzip', gzip.compress(valid))):
            with self.subTest(encoding=encoding), mock.patch.object(zero_proxy, 'MAX_BYTES', 100), mock.patch('urllib.request.OpenerDirector.open', return_value=Response(body, encoding)):
                self.assertEqual(zero_proxy.fetch('/api/portfolio')['value'], 12.5)
        for encoding, body in (('', oversized), ('gzip', gzip.compress(oversized)), ('gzip', b'invalid')):
            with self.subTest(encoding=encoding, size=len(body)), mock.patch.object(zero_proxy, 'MAX_BYTES', 100), mock.patch('urllib.request.OpenerDirector.open', return_value=Response(body, encoding)):
                with self.assertRaisesRegex(zero_proxy.Unavailable, '^SITE_INVALID$'):
                    zero_proxy.fetch('/api/portfolio')

    def test_nonfinite_json_never_enters_shared_cache(self):
        for value in ('NaN', 'Infinity', '-Infinity', '1e999', '-1e999'):
            with self.subTest(value=value), mock.patch('urllib.request.OpenerDirector.open', return_value=Response(('{"nested":[' + value + ']}').encode())):
                with self.assertRaisesRegex(zero_proxy.Unavailable, '^SITE_INVALID$'):
                    zero_proxy.get_public('/api/portfolio', {})
                self.assertFalse(zero_proxy._cache)
                self.assertFalse(zero_proxy._pending)

    def test_bad_site_is_fixed_error_before_io_and_status_remains_available(self):
        for base in ('http://example.test', 'https://[', 'https://', 'https://example.test:bad',
                     'https://example.test?token=synthetic', 'https://user@example.test', 'https://example.test/#fragment'):
            with self.subTest(base=base), mock.patch.object(zero_proxy, '_secret', side_effect=lambda name: base if name == 'SITE_URL' else 'synthetic'), mock.patch('urllib.request.OpenerDirector.open') as opened:
                with self.assertRaisesRegex(zero_proxy.Unavailable, '^BAD_SITE$'):
                    zero_proxy.fetch('/api/office')
                self.assertEqual(zero_proxy._status()['site'], 'BAD_SITE')
                opened.assert_not_called()

    def test_redirect_is_refused_without_retry(self):
        error = HTTPError('https://example.test', 302, 'synthetic', {}, io.BytesIO())
        with mock.patch('urllib.request.OpenerDirector.open', side_effect=error) as opened:
            with self.assertRaisesRegex(zero_proxy.Unavailable, '^ACCESS_REFUSED$'):
                zero_proxy.fetch('/api/office')
        opened.assert_called_once()
        self.assertIsNone(zero_proxy._NoRedirect().redirect_request(None, None, None, None, None, None))


class PublicSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.saved = dict(id='SYNTH', latest_period='2026-09', latest_value='1',
                          history=[dict(period='2026-09', value='1')], retrieved_at='2026-10-01T00:00:00+00:00')
        self.latest = {**self.saved, 'latest_value': '3', 'history': [dict(period='2026-09', value='3')],
                       'retrieved_at': '2026-10-16T00:00:00+00:00'}
        patch = mock.patch.multiple(zero_research, _snapshot={'macro': [self.latest]}, _running=True, _next_check=0)
        patch.start()
        self.addCleanup(patch.stop)

    def refresh(self, candidate):
        with mock.patch.object(zero_research.zero_macro, 'collect_macro', return_value=[candidate]), mock.patch.object(zero_research.zero_gauges, 'collect_gauges', return_value=[]), mock.patch.object(zero_research.zero_reports, 'collect_briefing_sources', return_value={'sources': []}):
            zero_research._refresh({})
        return zero_research.overlay({'macro': [self.saved]})

    def test_structured_failure_retains_last_success_and_failure_marker(self):
        actual = self.refresh({**self.latest, 'latest_value': None, 'history': []})
        self.assertEqual(actual['macro'], [self.latest])
        self.assertEqual(actual['refresh']['state'], 'PARTIAL')
        self.assertEqual(actual['refresh']['failed'], ['SYNTH'])
        self.assertEqual(self.saved['latest_value'], '1')

    def test_older_success_cannot_roll_back_last_success(self):
        actual = self.refresh({**self.saved, 'latest_period': '2026-08', 'history': [dict(period='2026-08', value='1')],
                               'retrieved_at': '2026-10-16T12:00:00+00:00'})
        self.assertEqual(actual['macro'], [self.latest])

    def test_same_period_correction_is_retained_through_later_failure(self):
        correction = {**self.latest, 'latest_value': '4', 'history': [dict(period='2026-09', value='4')],
                      'retrieved_at': '2026-10-16T12:00:00+00:00'}
        self.assertEqual(self.refresh(correction)['macro'], [correction])
        self.assertEqual(self.refresh({**correction, 'latest_value': None, 'history': []})['macro'], [correction])


class KoreanReleaseTests(unittest.TestCase):
    def test_kst_day_and_month_boundary(self):
        class Client:
            period = '2026년 9월'
            published = '2026-10-02'

            def read(self, url, params):
                title = self.period + ' 소비자물가동향'
                if params.get('act') != 'view':
                    return ('<a href="/board.es?mid=' + params['mid'] + '&bid=213&act=view&list_no=1">' + title + '</a>').encode()
                return ('게시일 ' + self.published + ' ' + title).encode()

        client = Client()
        for month, day, period, published in ((10, 1, '2026년 9월', '2026-10-02'),
                                             (10, 31, '2026년 11월', '2026-11-01')):
            client.period, client.published = period, published
            with self.subTest(published=published):
                with self.assertRaises(ValueError):
                    zero_macro._release(client, '213', '소비자물가동향', datetime(2026, month, day, 14, 59, tzinfo=timezone.utc))
                actual = zero_macro._release(client, '213', '소비자물가동향', datetime(2026, month, day, 15, 0, tzinfo=timezone.utc))
                self.assertEqual(actual[2], published)
