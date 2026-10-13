"""Bridge guards: allowlisted reads only, writes stay on the owner's PC, secrets never leave, UI build intact."""
import asyncio
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


class BuildTests(unittest.TestCase):
    def test_ui_is_the_hosted_original_with_relative_paths(self):
        html = (ROOT / 'ui' / 'index.html').read_text(encoding='utf-8')
        self.assertIn('data-zero-hosted="true"', html)
        self.assertNotIn('data-zero-public', html)
        self.assertFalse((ROOT / 'ui' / 'assets' / 'public.js').exists())
        for path in list((ROOT / 'ui').rglob('*.js')) + list((ROOT / 'ui').rglob('*.html')) + list((ROOT / 'ui').rglob('*.css')):
            self.assertIsNone(re.search(r"""['"`(]/(api|assets)/""", path.read_text(encoding='utf-8')), path.name)

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
