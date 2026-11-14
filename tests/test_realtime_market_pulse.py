"""Only invented HTTP responses; market-pulse failure must not create market values."""
import json
import math
import unittest
from unittest.mock import patch
from zero.realtime_market_pulse import RealtimeMarketPulse


class Response:
    def __init__(self, data):
        self.body = json.dumps(data).encode('utf-8')
    def __enter__(self):
        return self
    def __exit__(self, *_):
        return None
    def read(self):
        return self.body


def index(**extra):
    return dict(itemCode='KOSPI', name='코스피', closePrice='2,500.25', compareToPreviousClosePrice='12.25', fluctuationsRatio='0.49', compareToPreviousPrice={'name': 'FALL'}, **extra)


def fx(name='미국 달러', **extra):
    return dict(name=name, closePrice='1,300.25', compareToPreviousClosePrice='2.25', fluctuationsRatio='0.17', compareToPreviousPrice={'name': 'FALL'}, **extra)


class RealtimeMarketPulseTests(unittest.TestCase):
    def test_transport_failure_has_no_fixed_values(self):
        with patch('zero.realtime_market_pulse.urlopen', side_effect=OSError('offline')):
            self.assertEqual(RealtimeMarketPulse.fetch_indices(), [])
            self.assertEqual(RealtimeMarketPulse.fetch_fx_rates(), [])
            result = RealtimeMarketPulse.get_market_pulse_summary()
        self.assertEqual(result['state'], 'UNAVAILABLE')
        self.assertEqual(result['indices'], [])
        self.assertEqual(result['fx_rates'], [])

    def test_empty_payload_has_no_fixed_values(self):
        with patch('zero.realtime_market_pulse.urlopen', return_value=Response({})):
            self.assertEqual(RealtimeMarketPulse.fetch_indices(), [])
            self.assertEqual(RealtimeMarketPulse.fetch_fx_rates(), [])

    def test_valid_observation_does_not_acquire_current_market_time(self):
        with patch('zero.realtime_market_pulse.urlopen', return_value=Response({'homeMajorList': [index()]})):
            rows = RealtimeMarketPulse.fetch_indices()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].price, 2500.25)
        self.assertEqual(rows[0].change, -12.25)
        self.assertEqual(rows[0].change_percent, -.49)
        self.assertIsNone(rows[0].updated_at)

    def test_invalid_rows_do_not_discard_other_observations_or_create_zeroes(self):
        bad = [dict(index(), closePrice=value) for value in (None, '0', '-1', 'nan', 'inf', True)]
        bad += [dict(index(), fluctuationsRatio=None), dict(index(), compareToPreviousClosePrice='bad')]
        with patch('zero.realtime_market_pulse.urlopen', return_value=Response({'homeMajorList': bad + [index()]})):
            rows = RealtimeMarketPulse.fetch_indices()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].price, 2500.25)
        self.assertTrue(all(math.isfinite(row.price) for row in rows))

    def test_index_identity_determines_market_and_currency(self):
        rows = [dict(index(), itemCode='NASDAQ', name='나스닥'), dict(index(), itemCode='UNSUPPORTED', name='미확인 지수')]
        with patch('zero.realtime_market_pulse.urlopen', return_value=Response({'homeMajorList': rows})):
            result = RealtimeMarketPulse.fetch_indices()
        self.assertEqual(len(result), 1)
        self.assertEqual((result[0].symbol, result[0].currency, result[0].market), ('NASDAQ', 'USD', 'US'))

    def test_fx_dollar_names_do_not_turn_other_currencies_into_usd(self):
        data = {'result': [fx('캐나다 달러'), fx('홍콩 달러'), fx(), dict(fx(), closePrice='nan')]}
        with patch('zero.realtime_market_pulse.urlopen', return_value=Response(data)):
            rows = RealtimeMarketPulse.fetch_fx_rates()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].pair, 'USD/KRW')
        self.assertEqual(rows[0].rate, 1300.25)
        self.assertEqual(rows[0].change_percent, -.17)
        self.assertIsNone(rows[0].updated_at)

    def test_partial_summary_retains_only_collected_rows_and_separate_check_time(self):
        with patch('zero.realtime_market_pulse.urlopen', side_effect=[Response({'homeMajorList': [index()]}), OSError('offline')]):
            result = RealtimeMarketPulse.get_market_pulse_summary()
        self.assertEqual(result['state'], 'PARTIAL')
        self.assertEqual(len(result['indices']), 1)
        self.assertEqual(result['fx_rates'], [])
        self.assertIsNone(result['indices'][0]['updated_at'])
        self.assertTrue(result['checked_at'])
        self.assertEqual(result['indices'][0]['source_url'], 'https://m.stock.naver.com/api/home/majors')


if __name__ == '__main__':
    unittest.main()
