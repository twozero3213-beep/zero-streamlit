"""Ranking guards: validated rows only, no invented amounts, one failing list never hides the rest."""
import asyncio
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import zero_proxy  # noqa: E402
import zero_rankings  # noqa: E402
from starlette.requests import Request  # noqa: E402

def call(handler, method, path, query=b''):
    scope = {'type': 'http', 'method': method, 'path': '/zero/' + path, 'query_string': query, 'headers': [],
             'path_params': {'path': path.removeprefix('api/')}}
    return asyncio.run(handler(Request(scope)))


NOW = datetime(2026, 10, 22, 8, 0, tzinfo=timezone.utc)


def row(code, name='삼성전자', price='212500', rate='-1.25', volume='204406', sosok='0', **extra):
    return {'itemcode': code, 'itemname': name, 'nowPrice': price, 'prevChangeRate': rate, 'tradeVolume': volume, 'sosok': sosok, 'askBuy': '1', **extra}


class RankingTests(unittest.TestCase):
    def tearDown(self):
        zero_proxy._cache.clear()

    def test_rows_are_validated_deduplicated_and_carry_no_amounts(self):
        body = json.dumps([row('005930'), row('005930'), row('12345'), row('000660', price='0'), row('035720', rate='abc'),
                           row('000270', name='<b></b>'), row('068270', rate='29.95', volume='12'), row('0001A0'),
                           row('247540', sosok='1'), row('111111', sosok='9')]).encode()
        value = zero_rankings.collect(NOW, fetch=lambda url: body)
        self.assertEqual(value['state'], 'AVAILABLE')
        lists = {(entry['market'], entry['kind']): [item['code'] for item in entry['items']] for entry in value['lists']}
        both = ['005930', '068270', '0001A0', '247540']
        kospi, kosdaq = ['005930', '068270', '0001A0'], ['247540']
        self.assertEqual(lists, {('KOSPI', 'VOLUME'): kospi, ('KOSDAQ', 'VOLUME'): kosdaq, ('KOSPI', 'UP'): kospi, ('KOSDAQ', 'UP'): kosdaq,
                                 ('KOSPI', 'DOWN'): kospi, ('KOSDAQ', 'DOWN'): kosdaq, ('ALL', 'FOREIGN'): both, ('ALL', 'INSTITUTION'): both},
                         'a market list keeps only its market; whole-market lists keep both')
        self.assertEqual(value['lists'][0]['items'][0], {'code': '005930', 'name': '삼성전자', 'market': 'KOSPI', 'price': 212500, 'change_rate': -1.25, 'volume': 204406})
        self.assertFalse(value['amounts_included'])
        self.assertNotIn('askBuy', json.dumps(value))

    def test_each_list_asks_for_its_own_order_and_failures_are_named(self):
        asked = []

        def fetch(url):
            asked.append(url)
            if 'organizationPureBuy' in url:
                raise OSError('SECRET-TOKEN-XYZ-31415')
            return json.dumps([row('005930')]).encode()
        value = zero_rankings.collect(NOW, fetch=fetch)
        self.assertEqual(sorted(u.split('orderType=')[1].split('&')[0] for u in asked), sorted(['quantTop'] * 2 + ['up'] * 2 + ['down'] * 2 + ['foreignPureBuy', 'organizationPureBuy']))
        self.assertTrue(all(u.startswith('https://stock.naver.com/api/domestic/market/stock/default?') for u in asked))
        self.assertEqual((value['state'], value['failed']), ('PARTIAL', ['KOSDAQ:VOLUME', 'KOSDAQ:UP', 'KOSDAQ:DOWN', 'ALL:INSTITUTION']), 'KOSDAQ volume has no KOSDAQ row here')
        self.assertNotIn('SECRET', json.dumps(value))

    def test_route_caches_success_and_never_caches_total_failure(self):
        good = zero_rankings.collect(NOW, fetch=lambda url: json.dumps([row('005930')]).encode())
        with mock.patch.object(zero_rankings, 'collect', return_value=good) as collect:
            first, second = call(zero_proxy.api, 'GET', 'api/market-rank'), call(zero_proxy.api, 'GET', 'api/market-rank')
        self.assertEqual((first.status_code, json.loads(first.body)['scope'], second.body), (200, 'PUBLIC_MARKET_RANK', first.body))
        collect.assert_called_once()
        zero_proxy._cache.clear()
        bad = zero_rankings.collect(NOW, fetch=lambda url: b'{}')
        with mock.patch.object(zero_rankings, 'collect', return_value=bad):
            response = call(zero_proxy.api, 'GET', 'api/market-rank')
        self.assertEqual((response.status_code, json.loads(response.body)), (503, {'error': 'RANK_UNAVAILABLE'}))
        self.assertNotIn('market-rank', zero_proxy._cache)
        self.assertEqual(call(zero_proxy.api, 'GET', 'api/market-rank', b'kind=VOLUME').status_code, 404)
        self.assertEqual(call(zero_proxy.api, 'POST', 'api/market-rank').status_code, 403)


if __name__ == '__main__':
    unittest.main()
