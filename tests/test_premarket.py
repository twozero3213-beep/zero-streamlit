"""장 전 점검표: 합성 Yahoo 응답으로 계산과 실패 처리를 검사한다(네트워크 없음)."""
from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest import mock

NOW = datetime(2026, 11, 14, tzinfo=timezone.utc)

from zero import premarket


def chart(price, closes, stamp=1_794_596_400, symbol='^SOX'):
    return {'chart': {'result': [{'meta': {'regularMarketPrice': price, 'regularMarketTime': stamp, 'symbol': symbol, 'priceHint': 2},
                                  'timestamp': [stamp - 3600 - (len(closes) - 1 - index) * 86400 for index in range(len(closes))],
                                  'indicators': {'quote': [{'close': closes}]}}]}}


class PremarketTests(unittest.TestCase):
    def test_change_is_against_the_previous_trading_close(self):
        # 일봉 [100, 110, 99]: 마지막은 진행 중인 오늘 값. 전 거래일 종가 110 대비 99는 -10%.
        self.assertEqual(premarket.reading(chart(99.0, [100.0, 110.0, 99.0]), now=NOW)[:2], (99.0, 110.0))
        self.assertIsNone(premarket.reading(chart(99.0, [100.0, 110.0, None, 99.0]), now=NOW), '바로 앞 거래일의 누락을 압축하지 않는다')

    def test_rarity_compares_today_with_a_year_of_daily_moves(self):
        # 1% 움직임 99번과 5% 움직임 1번. 오늘 5%면 상위 1%, 오늘 1%면 100% 전부가 그 이상이다.
        closes, value = [100.0], 100.0
        for step in [0.01] * 99 + [0.05]:
            value *= 1 + step; closes.append(value)
        self.assertAlmostEqual(premarket.rarity(closes, 0.05, 'index'), 1.0)
        self.assertAlmostEqual(premarket.rarity(closes, -0.01, 'index'), 100.0)
        self.assertIsNone(premarket.rarity(closes[:30], 0.05, 'index'), '두 달 남짓보다 짧으면 비교하지 않는다')
        self.assertAlmostEqual(premarket.rarity([4.0 + 0.01 * i for i in range(80)], 0.02, 'yield'), 0.0, '금리는 %p 폭으로 비교한다')
        self.assertIsNone(premarket.reading(chart(99.0, [99.0])), '전 거래일 종가가 없으면 계산하지 않는다')
        self.assertIsNone(premarket.reading(chart(None, [1.0, 2.0])))
        self.assertIsNone(premarket.reading({'chart': {'result': []}}))

    def test_build_keeps_what_arrived_and_names_what_failed(self):
        def fetch(symbol):
            if symbol == '^VIX':
                raise OSError('down')
            return chart(99.0, [100.0, 110.0, 99.0], symbol=symbol)
        status, body = premarket.build(fetch=fetch, now=NOW)
        self.assertEqual(status, 200)
        self.assertEqual(body['failed'], ['^VIX'])
        self.assertEqual(len(body['items']), len(premarket.ITEMS) - 1)
        first = body['items'][0]
        self.assertAlmostEqual(first['change_percent'], -10.0)
        self.assertAlmostEqual(first['change'], -11.0)
        self.assertIs(body['orders_authorized'], False)
        status, body = premarket.build(fetch=lambda symbol: (_ for _ in ()).throw(OSError()))
        self.assertEqual((status, body['state']), (503, 'UNAVAILABLE'))

class PremarketBoundaryTests(unittest.TestCase):
    def test_invalid_numbers_identity_and_daily_alignment_are_omitted(self):
        for value in (True, float('nan'), float('inf'), -1, 0):
            self.assertIsNone(premarket.reading(chart(value, [1.0, 2.0]), symbol='^SOX', now=NOW))
            self.assertIsNone(premarket.reading(chart(2.0, [1.0, 2.0], stamp=value), symbol='^SOX', now=NOW))
        self.assertIsNone(premarket.reading(chart(2.0, [1.0, 2.0], stamp=1e30), symbol='^SOX', now=NOW))
        self.assertIsNone(premarket.reading(chart(2.0, [1.0, 2.0], stamp=NOW.timestamp() + 1), symbol='^SOX', now=NOW))
        self.assertIsNone(premarket.reading(chart(2.0, [1.0, 2.0]), symbol='^VIX', now=NOW))
        for closes in ([1.0, None], [None, 2.0], [1.0, float('inf')], [1.0, True]):
            self.assertIsNone(premarket.reading(chart(2.0, closes), symbol='^SOX', now=NOW))
        for mutation in ('missing_timestamp', 'duplicate', 'out_of_order', 'missing_today', 'wrong_price'):
            value = chart(2.0, [1.0, 2.0])
            source = value['chart']['result'][0]
            if mutation == 'missing_timestamp': source['timestamp'].pop()
            elif mutation == 'duplicate': source['timestamp'][0] = source['timestamp'][1]
            elif mutation == 'out_of_order': source['timestamp'].reverse()
            elif mutation == 'missing_today': source['timestamp'] = [at - 86400 for at in source['timestamp']]
            else: source['meta']['regularMarketPrice'] = 3.0
            self.assertIsNone(premarket.reading(value, symbol='^SOX', now=NOW), mutation)
        self.assertEqual(premarket.rarity([1.0] * 61 + [None] + [2.0] * 61, 0.2, 'index'), 0.0)
        self.assertIsNone(premarket.rarity([1.0] * 100, float('nan'), 'index'))

    def test_lock_wait_consumes_original_budget_and_failures_have_short_cache(self):
        clock, deadlines, released = [100.0], [], []
        class WaitingLock:
            def acquire(lock, *, timeout):
                self.assertEqual(timeout, premarket.DEADLINE_SECONDS)
                clock[0] += 8
                return True
            def release(lock):
                released.append(True)
        failure = {'state': 'UNAVAILABLE', 'retrieved_at': 'original failed attempt', 'items': []}
        def build(*, deadline):
            deadlines.append(deadline)
            return 503, failure
        with mock.patch.multiple(premarket, _cache={'at': 0.0, 'body': None}, _failure={'at': 0.0, 'body': None}, _lock=WaitingLock()), mock.patch.object(premarket, 'time', SimpleNamespace(monotonic=lambda: clock[0])), mock.patch.object(premarket, 'build', side_effect=build) as collect:
            self.assertEqual(premarket.get_premarket(), (503, failure))
            self.assertEqual(deadlines, [100 + premarket.DEADLINE_SECONDS])
            self.assertEqual(premarket.get_premarket(), (503, failure))
            self.assertEqual(collect.call_count, 1)
            self.assertEqual(failure['retrieved_at'], 'original failed attempt')
            clock[0] = 130.0
            self.assertEqual(premarket.get_premarket(), (503, failure))
            self.assertEqual(collect.call_count, 2, '실패 캐시는 30초가 지나면 다시 시도한다')
            self.assertEqual(deadlines[-1], 130 + premarket.DEADLINE_SECONDS)
        self.assertEqual(len(released), 3)
        lock = mock.Mock()
        lock.acquire.return_value = False
        with mock.patch.object(premarket, '_lock', lock), mock.patch.object(premarket, 'build') as collect:
            self.assertEqual(premarket.get_premarket()[0], 503)
            collect.assert_not_called()
            lock.release.assert_not_called()

    def test_failed_refresh_does_not_relabel_or_overwrite_previous_good_data(self):
        old = {'state': 'AVAILABLE', 'retrieved_at': 'old observation', 'items': [{'price': 1.0}]}
        failure = {'state': 'UNAVAILABLE', 'retrieved_at': 'failed attempt', 'items': []}
        with mock.patch.multiple(premarket, _cache={'at': -1000.0, 'body': old}, _failure={'at': 0.0, 'body': None}), mock.patch.object(premarket, 'time', SimpleNamespace(monotonic=lambda: 100.0)), mock.patch.object(premarket, 'build', return_value=(503, failure)):
            self.assertEqual(premarket.get_premarket(), (503, failure))
            self.assertIs(premarket._cache['body'], old)
            self.assertEqual(old['retrieved_at'], 'old observation')


if __name__ == '__main__':
    unittest.main()
