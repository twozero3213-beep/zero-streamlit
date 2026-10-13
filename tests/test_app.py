"""Public edition guards: nothing private leaves the bridge, writes are refused, the UI build is intact."""
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
# Distinct sentinels: if any appears in a served payload, an account figure leaked.
SENTINELS = ['246813579', '111222333', '444555666', '777888999', '12.3456', '135792468', '987654321', '555555555',
             '314159265', '1357.24', '86420864']


def holding(symbol, market, value):
    return {'symbol': symbol, 'name': symbol + ' 이름', 'market': market, 'currency': 'USD', 'asset_class': 'EQUITY',
            'quantity': 246813579, 'average_price': '111222333', 'current_price': '444555666',
            'computed_unrealized_pnl_native': '777888999', 'computed_unrealized_return_percent': '12.3456',
            'market_value': 135792468, 'market_value_krw': value}


RAW = {
    'schema_version': 1,
    'context': {'collected_at': '2026-10-10T06:54:15+00:00', 'policy_capital_krw': '314159265', 'valuation_basis': 'PRICE'},
    'summary': {'total_value_krw': 987654321, 'holdings_value_krw': 400.0, 'by_currency': {'KRW': {'cash': '555555555'}},
                'fx': {'usd_krw': '1357.24', 'source': 'x'},
                'zero_portfolio': {'state': 'REFERENCE', 'capital_krw': 314159265, 'total_value_krw': 987654321,
                                   'gross_return_percent': 12.3456, 'gross_gain_krw': 86420864,
                                   'holdings': [holding('AAA', 'US', 300), holding('000001', 'KR', 100)],
                                   'allocations': {'target_percent': {'us_equity': '64', 'us_reserve': '16', 'kr': '20'}}}},
    'holdings': [holding('AAA', 'US', 300), holding('000001', 'KR', 100)],
    'allocations': {'target_percent': {'us_equity': '64', 'us_reserve': '16', 'kr': '20'}, 'observed_market_percent': {'US': '75', 'KR': '25'}},
    'history': [{'observed_at': 't', 'holdings_value_krw': 987654321}],
    'benchmark': {'capital_krw': 314159265, 'latest_usd': {'return_percent': '12.3456', 'reference_value_krw': 555555555}},
}


def call(method, path, query=b''):
    scope = {'type': 'http', 'method': method, 'path': '/zero/api/' + path, 'query_string': query, 'headers': [],
             'path_params': {'path': path}}
    return asyncio.run(zero_proxy.api(Request(scope)))


class MaskTests(unittest.TestCase):
    def test_every_account_figure_is_removed_and_weights_remain(self):
        served = json.dumps(zero_proxy.mask_portfolio(RAW), ensure_ascii=False)
        for sentinel in SENTINELS:
            self.assertNotIn(sentinel, served)
        masked = json.loads(served)
        self.assertEqual([h['market_value_krw'] for h in masked['holdings']], [75.0, 25.0])
        self.assertEqual(masked['summary']['holdings_value_krw'], 100.0)
        self.assertEqual(masked['summary']['zero_portfolio']['holdings_value_krw'], 100.0)
        self.assertEqual(masked['allocations']['target_percent'], {'us_equity': '64', 'us_reserve': '16', 'kr': '20'})
        self.assertEqual(masked['history'], [])
        self.assertEqual(masked['summary']['zero_portfolio']['state'], 'REFERENCE')

    def test_owner_requests_are_not_published(self):
        office = zero_proxy.public_office({'jobs': [{'text': '비밀 요청'}], 'state': 'QUEUED', 'revision': 3})
        self.assertEqual((office['jobs'], office['state']), ([], 'EMPTY'))

    def test_only_allowlisted_reads_are_forwarded(self):
        allowed = [('/api/portfolio', {}), ('/api/team', {'event': 'ONBOARDING'}), ('/api/chart', {'identity': 'US:AAPL', 'range': '1Y'}),
                   ('/api/company-news', {'identity': 'KR:005930'}), ('/api/desk', {})]
        for path, query in allowed:
            self.assertTrue(zero_proxy._upstream(path, query)[0].startswith(path))
        refused = [('/api/refresh', {}), ('/api/office/jobs', {}), ('/internal/objects/x', {}), ('/api/portfolio', {'x': '1'}),
                   ('/api/chart', {'identity': '../x', 'range': '1Y'}), ('/api/chart', {'identity': 'US:AAPL', 'range': '10Y'}),
                   ('/api/team', {'event': 'a&b'}), ('/api/live-quotes', {})]
        for path, query in refused:
            with self.assertRaises(zero_proxy.Unavailable):
                zero_proxy._upstream(path, query)


class BridgeTests(unittest.TestCase):
    def setUp(self):
        zero_proxy._cache.clear()

    def test_writes_and_repricing_are_refused(self):
        self.assertEqual(call('POST', 'office/jobs').status_code, 403)
        self.assertEqual(call('GET', 'live-quotes').status_code, 403)
        self.assertEqual(call('GET', 'nope').status_code, 404)
        self.assertEqual(call('GET', 'portfolio', b'a=1&a=2').status_code, 404)

    def test_portfolio_is_served_masked(self):
        with mock.patch.object(zero_proxy, 'fetch', return_value=RAW):
            response = call('GET', 'portfolio')
        self.assertEqual(response.status_code, 200)
        for sentinel in SENTINELS:
            self.assertNotIn(sentinel, response.body.decode('utf-8'))

    def test_failures_return_fixed_codes_only(self):
        with mock.patch.object(zero_proxy, '_secret', lambda name: SECRET if name.startswith('CF_') else None), \
                mock.patch('urllib.request.OpenerDirector.open', side_effect=OSError('boom ' + SECRET)):
            response = call('GET', 'desk')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(json.loads(response.body), {'error': 'SITE_UNREACHABLE'})

    def test_unconfigured_deployment_reports_not_configured(self):
        with mock.patch.object(zero_proxy, '_secret', lambda name: None):
            response = call('GET', 'research')
        self.assertEqual(json.loads(response.body), {'error': 'NOT_CONFIGURED'})

    def test_dashboard_prefix_is_stripped_from_secrets(self):
        with mock.patch.dict('os.environ', {'ZERO_CF_ACCESS_CLIENT_ID': 'CF-Access-Client-Id: abc.access'}):
            self.assertEqual(zero_proxy._secret('CF_ACCESS_CLIENT_ID'), 'abc.access')


class BuildTests(unittest.TestCase):
    def test_ui_is_public_relative_and_patched(self):
        html = (ROOT / 'ui' / 'index.html').read_text(encoding='utf-8')
        self.assertIn('data-zero-public="true"', html)
        self.assertIn('assets/public.js', html)
        self.assertIn('#refresh{display:none', html)
        app = (ROOT / 'ui' / 'assets' / 'app.js').read_text(encoding='utf-8')
        self.assertEqual(app.count('ZERO_PUBLIC'), 4)
        for path in list((ROOT / 'ui').rglob('*.js')) + list((ROOT / 'ui').rglob('*.html')) + list((ROOT / 'ui').rglob('*.css')):
            self.assertIsNone(re.search(r"""['"`(]/(api|assets)/""", path.read_text(encoding='utf-8')), path.name)

    def test_page_script_renders(self):
        from streamlit.testing.v1 import AppTest
        app = AppTest.from_file(str(ROOT / 'zero_page.py'), default_timeout=240).run()
        self.assertFalse(app.exception)

    def test_no_secrets_file_in_repo(self):
        self.assertFalse((ROOT / '.streamlit' / 'secrets.toml').exists())
        self.assertIn('secrets.toml', (ROOT / '.gitignore').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
