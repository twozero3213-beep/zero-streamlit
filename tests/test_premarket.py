"""장 전 점검표: 합성 Yahoo 응답으로 계산과 실패 처리를 검사한다(네트워크 없음)."""
import unittest

from zero import premarket


def chart(price, closes, stamp=1_800_000_000):
    return {'chart': {'result': [{'meta': {'regularMarketPrice': price, 'regularMarketTime': stamp},
                                  'indicators': {'quote': [{'close': closes}]}}]}}


class PremarketTests(unittest.TestCase):
    def test_change_is_against_the_previous_trading_close(self):
        # 일봉 [100, 110, 99]: 마지막은 진행 중인 오늘 값. 전 거래일 종가 110 대비 99는 -10%.
        self.assertEqual(premarket.reading(chart(99.0, [100.0, 110.0, None, 99.0]))[:2], (99.0, 110.0))

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
            return chart(99.0, [100.0, 110.0, 99.0])
        status, body = premarket.build(fetch=fetch)
        self.assertEqual(status, 200)
        self.assertEqual(body['failed'], ['^VIX'])
        self.assertEqual(len(body['items']), len(premarket.ITEMS) - 1)
        first = body['items'][0]
        self.assertAlmostEqual(first['change_percent'], -10.0)
        self.assertAlmostEqual(first['change'], -11.0)
        self.assertIs(body['orders_authorized'], False)
        status, body = premarket.build(fetch=lambda symbol: (_ for _ in ()).throw(OSError()))
        self.assertEqual((status, body['state']), (503, 'UNAVAILABLE'))


if __name__ == '__main__':
    unittest.main()
