"""10년 전 1억 참고 계산: 합성 월봉으로 손계산 값과 맞춘다. 네트워크를 쓰지 않는다."""
from datetime import datetime, timezone
import unittest

from zero import decade_reference as decade


def months(count, start_year=2016, start_month=12):
    out, year, month = [], start_year, start_month
    for _ in range(count):
        out.append(f'{year:04d}-{month:02d}-01')
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return out


def stamp(day):
    return int(datetime.fromisoformat(day + 'T00:00:00+00:00').timestamp())


def payload(days, values, adjusted=True):
    indicators = {'adjclose': [{'adjclose': values}], 'quote': [{'close': values}]} if adjusted else {'quote': [{'close': values}]}
    return {'chart': {'result': [{'timestamp': [stamp(day) for day in days], 'indicators': indicators}]}}


class DecadeReferenceTests(unittest.TestCase):
    def setUp(self):
        self.days = months(120)

    def test_lump_sum_matches_hand_calculation(self):
        # 가격 100 -> 400(4배), 환율 1000 -> 1200(1.2배): 원화로 4.8배, 1억 -> 4억 8천만원.
        prices = list(zip(self.days, [100 + 300 * index / 119 for index in range(120)]))
        fx = list(zip(self.days, [1000 + 200 * index / 119 for index in range(120)]))
        result = decade.lump_sum(prices, fx)
        self.assertAlmostEqual(result['return_percent_usd'], 300.0)
        self.assertAlmostEqual(result['return_percent_krw'], 380.0)
        self.assertEqual(result['value_krw'], 480_000_000)
        self.assertEqual((result['start_date'], result['end_date']), (self.days[0], self.days[-1]))
        self.assertEqual(result['points'][0], {'date': self.days[0], 'value_krw': 100_000_000})
        self.assertEqual(result['points'][-1]['value_krw'], 480_000_000)
        self.assertEqual(len(result['points']), 12)  # 시작 달, 2017~2026년 1월 10번, 마지막 달

    def test_short_or_unmatched_history_is_refused(self):
        prices = list(zip(self.days, [100.0] * 120))
        fx = list(zip(self.days, [1000.0] * 120))
        self.assertIsNone(decade.lump_sum(prices[:109], fx), '10년에 못 미치는 기록')
        self.assertIsNone(decade.lump_sum(prices, fx[:1]))
        self.assertIsNone(decade.lump_sum(prices, fx[5:]), '시작 달 환율이 없으면 계산하지 않는다')
        self.assertIsNone(decade.lump_sum([], []))

    def test_series_parser_drops_bad_rows_and_broken_payloads(self):
        days = self.days[:4]
        rows = decade.monthly_series(payload(days, [10.0, None, 0, 12.5]))
        self.assertEqual(rows, [(days[0], 10.0), (days[3], 12.5)])
        self.assertEqual(decade.monthly_series({}), [])
        self.assertEqual(decade.monthly_series({'chart': {'result': []}}), [])
        self.assertEqual(decade.monthly_series(payload(days, [1.0, 2.0, 3.0, 4.0], adjusted=False), adjusted=False)[-1], (days[3], 4.0))

    def test_build_reports_only_what_was_computed(self):
        now = datetime(2026, 11, 10, tzinfo=timezone.utc)

        def fetch(symbol):
            if symbol == 'SOXL':
                raise OSError('synthetic outage')
            if symbol == 'SCHD':
                return payload(self.days[:50], [100.0] * 50)
            values = [1000.0] * 120 if symbol == decade.FX_SYMBOL else [100.0 + index for index in range(120)]
            return payload(self.days, values, adjusted=symbol != decade.FX_SYMBOL)

        status, body = decade.build(fetch, now)
        self.assertEqual(status, 200)
        self.assertEqual([item['label'] for item in body['items']], ['S&P 500', 'TQQQ'])
        self.assertEqual(body['failed'], ['SOXL', 'SCHD'])
        self.assertEqual(body['items'][0]['value_krw'], 219_000_000)
        self.assertIs(body['orders_authorized'], False)
        self.assertEqual(body['retrieved_at'], now.isoformat())
        self.assertNotIn('synthetic outage', str(body), '원인 문구를 응답에 싣지 않는다')

        def broken(symbol):
            raise OSError('down')

        status, body = decade.build(broken, now)
        self.assertEqual((status, body['state'], body['items']), (503, 'UNAVAILABLE', []))


if __name__ == '__main__':
    unittest.main()
