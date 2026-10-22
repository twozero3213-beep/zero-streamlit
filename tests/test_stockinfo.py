"""Stock facts guards: validated fields only, unreadable ones left out, provider text never reaches the client."""
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
import zero_stockinfo  # noqa: E402
from starlette.requests import Request  # noqa: E402

NOW = datetime(2026, 10, 22, 14, 0, tzinfo=timezone.utc)


def call(method, path, query=b''):
    scope = {'type': 'http', 'method': method, 'path': '/zero/' + path, 'query_string': query, 'headers': [],
             'path_params': {'path': path.removeprefix('api/')}}
    return asyncio.run(zero_proxy.api(Request(scope)))


def info(extra=()):
    rows = [('lastClosePrice', '223,500'), ('openPrice', '223,500'), ('highPrice', '226,000'), ('lowPrice', '212,000'), ('accumulatedTradingVolume', '20,447,184'),
            ('accumulatedTradingValue', '4조 4,485억'), ('marketValue', '1,254조 268억'), ('foreignRate', '46.14%'), ('highPriceOf52Weeks', '380,000'),
            ('lowPriceOf52Weeks', '93,500'), ('per', '9.62배'), ('pbr', 'N/A'), ('dividendYieldRatio', '0.78%')] + list(extra)
    return {'itemCode': '005930', 'stockName': '삼성전자', 'totalInfos': [{'code': code, 'key': code, 'value': value} for code, value in rows]}


def day(date, individual, foreign, institution, close='214,500'):
    return {'itemCode': '005930', 'bizdate': date, 'individualPureBuyQuant': individual, 'foreignerPureBuyQuant': foreign, 'organPureBuyQuant': institution,
            'closePrice': close, 'accumulatedTradingVolume': '11,418,430'}


TREND = [day('20261022', '+977,352', '-585,787', '-400,833'), day('20261021', '-2,324,529', '+2,055,241', '+313,027', '223,500'), day('20261099', '+1', '+1', '+1')]


def serve(integration, trend, price=()):
    def fetch(url):
        if '/price?' in url:
            return json.dumps(list(price)).encode()
        return json.dumps(integration if url.endswith('/integration') else trend).encode()
    return fetch


class StockInfoTests(unittest.TestCase):
    def tearDown(self):
        zero_proxy._cache.clear()

    def test_facts_and_investors_are_parsed_and_bad_values_are_dropped(self):
        value = zero_stockinfo.collect('005930', NOW, fetch=serve(info(), TREND))
        self.assertEqual((value['name'], value['price'], value['change'], value['change_rate'], value['price_date']), ('삼성전자', 214500, -9000, -4.03, '2026-10-22'))
        self.assertEqual(value['facts'], {'prev_close': 223500, 'open': 223500, 'high': 226000, 'low': 212000, 'volume': 20447184, 'trading_value': '4조 4,485억',
                                          'market_cap': '1,254조 268억', 'foreign_rate': 46.14, 'high52': 380000, 'low52': 93500, 'per': 9.62, 'dividend_yield': 0.78},
                         'pbr "N/A" is left out, not guessed')
        self.assertEqual([row['date'] for row in value['investors']], ['2026-10-22', '2026-10-21'], 'impossible date 20261099 is dropped')
        self.assertEqual(value['investors'][0], {'date': '2026-10-22', 'individual': 977352, 'foreign': -585787, 'institution': -400833, 'close': 214500, 'volume': 11418430})
        self.assertEqual((value['unit'], value['orders_authorized']), ('SHARES', False))

    def test_daily_closes_are_sorted_deduplicated_and_optional(self):
        rows = [{'localTradedAt': '2026-10-22', 'closePrice': '214,500'}, {'localTradedAt': '2026-10-21', 'closePrice': '223,500'}, {'localTradedAt': '2026-10-21', 'closePrice': '223,500'},
                {'localTradedAt': '2026-13-99', 'closePrice': '1'}, {'localTradedAt': '2026-10-20', 'closePrice': '0'}, {'localTradedAt': '2026-10-19', 'closePrice': 'x'}, 'bad']
        value = zero_stockinfo.collect('005930', NOW, fetch=serve(info(), TREND, rows))
        self.assertEqual(value['daily'], [{'date': '2026-10-21', 'close': 223500}, {'date': '2026-10-22', 'close': 214500}])
        broken = zero_stockinfo.collect('005930', NOW, fetch=lambda url: (_ for _ in ()).throw(OSError('x')) if '/price?' in url else serve(info(), TREND)(url))
        self.assertEqual(broken['daily'], [], 'a failing price list leaves the chart empty, not the whole answer')

    def test_peers_keep_only_valid_domestic_rows_and_exclude_the_stock_itself(self):
        def peer(code, **extra):
            return {'stockType': 'domestic', 'itemCode': code, 'stockName': '동종' + code, 'closePrice': '1,234,000', 'fluctuationsRatio': '-4.64', 'sosok': '0', **extra}
        rows = [peer('000660'), peer('005930'), peer('402340', sosok='1'), peer('12345'), peer('000270', closePrice='0'), peer('035720', fluctuationsRatio='x'),
                peer('068270', stockType='world'), peer('207940', sosok='9'), 'bad']
        value = zero_stockinfo.collect('005930', NOW, fetch=serve({**info(), 'industryCompareInfo': rows}, TREND))
        self.assertEqual(value['peers'], [{'code': '000660', 'name': '동종000660', 'market': 'KOSPI', 'price': 1234000, 'change_rate': -4.64},
                                          {'code': '402340', 'name': '동종402340', 'market': 'KOSDAQ', 'price': 1234000, 'change_rate': -4.64}])
        self.assertEqual(zero_stockinfo.collect('005930', NOW, fetch=serve(info(), TREND))['peers'], [])

    def test_unusable_responses_raise_fixed_codes(self):
        for code in ('0059', 'abc123', 5930, '../etc'):
            with self.assertRaises(ValueError):
                zero_stockinfo.collect(code, NOW, fetch=serve(info(), TREND))
        with self.assertRaises(ValueError):  # the response must be for the requested code
            zero_stockinfo.collect('000660', NOW, fetch=serve(info(), TREND))
        with self.assertRaises(ValueError):  # no previous close, so no change can be computed
            zero_stockinfo.collect('005930', NOW, fetch=serve({**info(), 'totalInfos': []}, TREND))
        with self.assertRaises(ValueError):
            zero_stockinfo.collect('005930', NOW, fetch=serve(info(), []))

    def test_route_validates_code_caches_and_hides_provider_errors(self):
        good = zero_stockinfo.collect('005930', NOW, fetch=serve(info(), TREND))
        with mock.patch.object(zero_stockinfo, 'collect', return_value=good) as collect:
            first, second = call('GET', 'api/stock-info', b'code=005930'), call('GET', 'api/stock-info', b'code=005930')
        self.assertEqual((first.status_code, second.body), (200, first.body))
        collect.assert_called_once_with('005930')
        zero_proxy._cache.clear()
        with mock.patch.object(zero_stockinfo, 'collect', side_effect=OSError('SECRET-TOKEN-XYZ-31415')):
            response = call('GET', 'api/stock-info', b'code=005930')
        self.assertEqual((response.status_code, json.loads(response.body)), (503, {'error': 'STOCK_UNAVAILABLE'}))
        self.assertNotIn(b'SECRET', response.body)
        self.assertNotIn('stock-info:005930', zero_proxy._cache)
        for query in (b'', b'code=59', b'code=005930&x=1', b'code=../x', b'code=005930&code=000660'):
            self.assertEqual(call('GET', 'api/stock-info', query).status_code, 404, query)
        self.assertEqual(call('POST', 'api/stock-info', b'code=005930').status_code, 403)


if __name__ == '__main__':
    unittest.main()
