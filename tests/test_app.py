"""Bridge guards: allowlisted reads only, writes stay on the owner's PC, secrets never leave, UI build intact."""
import asyncio
from datetime import datetime, timedelta, timezone
import json
import re
import sys
import unittest
from pathlib import Path
from unittest import mock

from starlette.requests import Request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import zero_proxy  # noqa: E402
import zero_headlines  # noqa: E402

SECRET = 'SECRET-TOKEN-XYZ-31415'


def call(handler, method, path, query=b''):
    scope = {'type': 'http', 'method': method, 'path': '/zero/' + path, 'query_string': query, 'headers': [],
             'path_params': {'path': path.removeprefix('api/')}}
    return asyncio.run(handler(Request(scope)))


class BridgeTests(unittest.TestCase):
    def setUp(self):
        zero_proxy._cache.clear()

    def test_reads_and_quote_refresh_are_forwarded(self):
        allowed = [('/api/portfolio', {}), ('/api/live-quotes', {}), ('/api/team', {'event': 'ONBOARDING'}),
                   ('/api/chart', {'identity': 'US:AAPL', 'range': '1Y'}), ('/api/company-news', {'identity': 'KR:005930'}),
                   ('/api/desk', {}), ('/api/office', {})]
        for path, query in allowed:
            self.assertTrue(zero_proxy._upstream(path, query)[0].startswith(path))

    def test_unlisted_or_malformed_reads_are_refused(self):
        refused = [('/api/refresh', {}), ('/api/office/jobs', {}), ('/internal/objects/x', {}), ('/api/portfolio', {'x': '1'}),
                   ('/api/chart', {'identity': '../x', 'range': '1Y'}), ('/api/chart', {'identity': 'US:AAPL', 'range': '10Y'}),
                   ('/api/team', {'event': 'a&b'})]
        for path, query in refused:
            with self.assertRaises(zero_proxy.Unavailable):
                zero_proxy._upstream(path, query)

    def test_account_refresh_and_office_requests_stay_on_the_owner_pc(self):
        for path in ('api/refresh', 'api/office/jobs', 'api/office/jobs/claim'):
            response = call(zero_proxy.api, 'POST', path)
            self.assertEqual((response.status_code, json.loads(response.body)), (403, {'error': 'OWNER_PC_ONLY'}))
        self.assertEqual(call(zero_proxy.api, 'GET', 'api/nope').status_code, 404)
        self.assertEqual(call(zero_proxy.api, 'GET', 'api/portfolio', b'a=1&a=2').status_code, 404)

    def test_portfolio_is_forwarded_and_cached(self):
        with mock.patch.object(zero_proxy, 'fetch', return_value={'summary': {'total_value_krw': 1}}) as fetch:
            first, second = call(zero_proxy.api, 'GET', 'api/portfolio'), call(zero_proxy.api, 'GET', 'api/portfolio')
        self.assertEqual(json.loads(first.body), {'summary': {'total_value_krw': 1}})
        self.assertEqual(second.body, first.body)
        fetch.assert_called_once()

    def test_failures_return_fixed_codes_only(self):
        with mock.patch.object(zero_proxy, '_secret', lambda name: SECRET if name.startswith('CF_') else None), \
                mock.patch('urllib.request.OpenerDirector.open', side_effect=OSError('boom ' + SECRET)):
            response = call(zero_proxy.api, 'GET', 'api/desk')
        self.assertEqual((response.status_code, json.loads(response.body)), (503, {'error': 'SITE_UNREACHABLE'}))

    def test_status_reports_shape_without_values(self):
        with mock.patch.object(zero_proxy, '_secret', lambda name: SECRET if name.startswith('CF_') else None), \
                mock.patch.object(zero_proxy, 'fetch', side_effect=zero_proxy.Unavailable('ACCESS_REFUSED')):
            response = call(zero_proxy.status, 'GET', 'status')
        body = response.body.decode('utf-8')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(SECRET, body)
        self.assertEqual(json.loads(body)['site'], 'ACCESS_REFUSED')
        with mock.patch.object(zero_proxy, '_secret', lambda name: None):
            self.assertEqual(json.loads(call(zero_proxy.status, 'GET', 'status').body)['site'], 'NOT_CONFIGURED')

    def test_dashboard_prefix_is_stripped_from_secrets(self):
        with mock.patch.dict('os.environ', {'ZERO_CF_ACCESS_CLIENT_ID': 'CF-Access-Client-Id: abc.access'}):
            self.assertEqual(zero_proxy._secret('CF_ACCESS_CLIENT_ID'), 'abc.access')


def feed(*items):
    body = ''.join(f'<item><title>{t}</title><link>{l}</link><pubDate>{p}</pubDate><source url="https://x.example">{s}</source></item>' for t, l, p, s in items)
    return ('<?xml version="1.0"?><rss><channel>' + body + '</channel></rss>').encode()


class HeadlineTests(unittest.TestCase):
    NOW = datetime(2026, 10, 13, 9, 0, tzinfo=timezone.utc)

    def setUp(self):
        zero_proxy._cache.clear()

    def stamp(self, hours):
        return (self.NOW - timedelta(hours=hours)).strftime('%a, %d %b %Y %H:%M:%S GMT')

    def test_only_trusted_fresh_https_politics_economy_titles_survive_with_one_line_per_story(self):
        body = feed(('Fed holds rates steady - Reuters', 'https://n.example/r', self.stamp(1), 'Reuters'),
                    ('Fed holds interest rates steady as inflation cools - Bloomberg.com', 'https://n.example/b', self.stamp(2), 'Bloomberg.com'),
                    ('Celebrity gossip of the day - Daily Gossip', 'https://n.example/g', self.stamp(1), 'Daily Gossip'),
                    ('Old Reuters story - Reuters', 'https://n.example/o', self.stamp(60), 'Reuters'),
                    ('Plain http - Reuters', 'http://n.example/p', self.stamp(1), 'Reuters'),
                    ('금리 동결 한은 총재 발언 - 연합뉴스', 'https://n.example/y', self.stamp(3), '연합뉴스'))
        value = zero_headlines.collect(self.NOW, fetch=lambda url: body)
        self.assertEqual(value['failed'], [])
        titles = {row['title'] for row in value['items']}
        self.assertEqual(titles, {'Fed holds rates steady', '금리 동결 한은 총재 발언'}, 'duplicates collapse to the best-ranked publisher; untrusted, stale and http rows are dropped')
        self.assertEqual({row['publisher'] for row in value['items']}, {'Reuters', '연합뉴스'})
        self.assertTrue(all(row['url'].startswith('https://') for row in value['items']))

    def test_dedupe_keeps_the_higher_ranked_publisher_even_when_it_is_older(self):
        rows = [{'title': '신현송 한은 총재 중·일 중앙은행 총재와 경제동향 논의', 'publisher': '연합뉴스', 'published_at': '2026-10-13T08:00:00+00:00'},
                {'title': '신현송 총재 日 우에다 中 판궁성과 경제 금융 동향 논의', 'publisher': '연합인포맥스', 'published_at': '2026-10-13T08:30:00+00:00'},
                {'title': 'Bearish Bets Dominate Treasuries Before Key Inflation Data', 'publisher': 'Bloomberg.com', 'published_at': '2026-10-13T08:10:00+00:00'},
                {'title': 'ECB Not Seeing Second-Round Inflation Effects, Lagarde Says', 'publisher': 'Bloomberg.com', 'published_at': '2026-10-13T08:20:00+00:00'}]
        kept = zero_headlines.dedupe(rows)
        self.assertEqual(len(kept), 3)
        self.assertEqual([row['publisher'] for row in kept if '신현송' in row['title']], ['연합뉴스'])

    def test_a_failing_feed_is_reported_by_market(self):
        def fetch(url):
            raise OSError('SECRET-TOKEN-XYZ-31415')
        value = zero_headlines.collect(self.NOW, fetch=fetch)
        self.assertEqual((value['items'], value['failed']), ([], ['미국', '한국']))
        self.assertNotIn('SECRET', json.dumps(value))

    def test_route_serves_cached_headlines_and_never_caches_total_failure(self):
        good = {'schema_version': 1, 'items': [{'title': 'T'}], 'failed': []}
        with mock.patch.object(zero_headlines, 'collect', return_value=good) as collect:
            first, second = call(zero_proxy.api, 'GET', 'api/headlines'), call(zero_proxy.api, 'GET', 'api/headlines')
        self.assertEqual((json.loads(first.body), second.body), (good, first.body))
        collect.assert_called_once()
        zero_proxy._cache.clear()
        with mock.patch.object(zero_headlines, 'collect', return_value={'items': [], 'failed': ['미국', '한국']}):
            response = call(zero_proxy.api, 'GET', 'api/headlines')
        self.assertEqual((response.status_code, json.loads(response.body)), (503, {'error': 'HEADLINES_UNAVAILABLE'}))
        self.assertNotIn('headlines', zero_proxy._cache)
        self.assertEqual(call(zero_proxy.api, 'POST', 'api/headlines').status_code, 403)

    def test_panel_script_is_injected_and_never_writes_html(self):
        self.assertIn('<script src="assets/headlines.js" defer></script>', (ROOT / 'ui' / 'index.html').read_text(encoding='utf-8'))
        script = (ROOT / 'ui' / 'assets' / 'headlines.js').read_text(encoding='utf-8')
        self.assertNotIn('innerHTML', script)
        self.assertIn("fetch('api/headlines'", script)


class BuildTests(unittest.TestCase):
    def test_ui_is_the_hosted_original_with_relative_paths(self):
        html = (ROOT / 'ui' / 'index.html').read_text(encoding='utf-8')
        self.assertIn('data-zero-hosted="true"', html)
        self.assertNotIn('data-zero-public', html)
        self.assertFalse((ROOT / 'ui' / 'assets' / 'public.js').exists())
        for path in list((ROOT / 'ui').rglob('*.js')) + list((ROOT / 'ui').rglob('*.html')) + list((ROOT / 'ui').rglob('*.css')):
            self.assertIsNone(re.search(r"""['"`(]/(api|assets)/""", path.read_text(encoding='utf-8')), path.name)

    def test_install_guide_is_installable_from_this_site(self):
        html = (ROOT / 'ui' / 'index.html').read_text(encoding='utf-8')
        self.assertIn('assets/install.js', html)
        script = (ROOT / 'ui' / 'assets' / 'install.js').read_text(encoding='utf-8')
        self.assertIn('beforeinstallprompt', script)
        self.assertIn('로그인은 필요 없습니다', script)
        manifest = json.loads((ROOT / 'ui' / 'assets' / 'manifest.webmanifest').read_text(encoding='utf-8'))
        self.assertEqual((manifest['display'], manifest['start_url'], manifest['scope']), ('standalone', '../', '../'))
        for icon in manifest['icons']:
            self.assertTrue((ROOT / 'ui' / 'assets' / icon['src']).is_file(), icon['src'])

    def test_ui_files_are_revalidated_on_every_load(self):
        scope = {'type': 'http', 'method': 'GET', 'path': '/index.html', 'root_path': '', 'query_string': b'', 'headers': []}
        app = zero_proxy._UI(directory=zero_proxy.UI, html=True)
        response = asyncio.run(app.get_response('index.html', scope))
        self.assertEqual(response.headers['Cache-Control'], 'no-cache')

    def test_frame_is_pinned_to_the_viewport_so_no_dark_band_shows(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_file(str(ROOT / 'zero_page.py'), default_timeout=240).run()
        css = ''.join(block.value for block in app.markdown)
        for rule in ('position:fixed!important', 'inset:0!important', 'height:100dvh!important', 'overflow:hidden!important',
                     'background:#f7f8fa!important'):
            self.assertIn(rule, css)

    def test_page_script_renders(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_file(str(ROOT / 'zero_page.py'), default_timeout=240).run()
        self.assertFalse(app.exception)

    def test_no_secrets_file_in_repo(self):
        self.assertFalse((ROOT / '.streamlit' / 'secrets.toml').exists())
        self.assertIn('secrets.toml', (ROOT / '.gitignore').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
