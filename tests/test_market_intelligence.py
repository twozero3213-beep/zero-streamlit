# -*- coding: utf-8 -*-
"""Unit tests for Macro Indicators and Market Intelligence (Chief Director Verdict, 100-Investor Daily Debate, 25 Recommendations)."""
from dataclasses import asdict
import json
import unittest
from unittest import mock
from zero import market_intelligence as intelligence
from zero.macro_indicators import VERIFIED_MACRO_ITEMS, get_macro_indicators
from zero.market_intelligence import (
    get_chief_director_verdict,
    generate_daily_council_debate,
    get_daily_25_recommendations,
    consult_investor_on_specific_asset
)


class TestMarketIntelligence(unittest.TestCase):
    def test_verified_macro_indicators_structure_and_stats(self):
        self.assertEqual(VERIFIED_MACRO_ITEMS, [])
        self.assertEqual(get_macro_indicators(), [], '검증된 입력 없이 현재 지표를 만들어 넣지 않는다')

    def test_macro_indicators_filtering(self):
        items = [
            {'id': 'US_SYNTH', 'name': 'Synthetic US rate', 'country': 'US', 'category': 'rate'},
            {'id': 'KR_SYNTH', 'name': 'Synthetic KR price', 'country': 'KR', 'category': 'price'},
        ]
        self.assertEqual(get_macro_indicators(country='US', items=items), items[:1])
        self.assertEqual(get_macro_indicators(search='KR price', items=items), items[1:])
        self.assertEqual(get_macro_indicators(category='rate', items=items), items[:1])
        self.assertEqual(get_macro_indicators(search='missing', items=items), [])

    def test_chief_director_verdict_probabilities_and_reasoning(self):
        for target in ('MARKET_OVERALL', 'NVDA', '005930'):
            verdict = get_chief_director_verdict(target)
            self.assertEqual((verdict.verdict, verdict.verdict_kr), ('HOLD', '보류'))
            self.assertIsNone(verdict.buy_prob)
            self.assertIsNone(verdict.sell_prob)
            self.assertIsNone(verdict.experience_years)
            self.assertIsNone(verdict.evaluated_at)
            self.assertEqual(verdict.state, 'UNAVAILABLE')
            self.assertIs(verdict.ai_used, False)
            self.assertIs(verdict.orders_authorized, False)
            self.assertIn('가상', verdict.director_name)
            self.assertEqual(verdict.economy_outlook['direction'], 'UNKNOWN')
            for key in ('positive_prob', 'negative_prob', 'positive_probability_pct', 'negative_probability_pct'):
                self.assertIsNone(verdict.economy_outlook[key])
            self.assertEqual(verdict.economy_outlook['indicator_breakdown'], [])
            self.assertEqual(verdict.economy_outlook['key_indicators_analysis'], [])
            self.assertEqual(verdict.to_dict()['buy_prob'], None)
            json.dumps(asdict(verdict), allow_nan=False)

    def test_daily_council_debate(self):
        debate = generate_daily_council_debate()
        self.assertIsNone(debate['date'])
        self.assertEqual(debate['macro_debate']['dialogue'], [])
        self.assertEqual(debate['micro_debate']['dialogue'], [])
        self.assertEqual(debate['strong_sectors'], [])
        self.assertEqual(debate['weak_sectors'], [])
        self.assertEqual(debate.chief_verdict['verdict_call'], 'HOLD')
        self.assertEqual(debate.to_dict()['state'], 'UNAVAILABLE')
        self.assertEqual(debate.economy_outlook['direction'], 'UNKNOWN')
        self.assertEqual(generate_daily_council_debate('2026-11-14')['date'], '2026-11-14', '명시한 요청 날짜는 관측 시각과 구분한다')

    def test_daily_25_recommendations(self):
        data = get_daily_25_recommendations()
        for key in ('nasdaq_10', 'kospi_5', 'kosdaq_5', 'etf_5', 'recommendations'):
            self.assertEqual(data[key], [])
        self.assertEqual(data['count'], 0)
        self.assertEqual(data['state'], 'UNAVAILABLE')
        self.assertIs(data['orders_authorized'], False)

    def test_consult_investor_on_specific_asset(self):
        person = {'id': 'WARREN_BUFFETT', 'name_kr': '워런 버핏', 'name': 'Warren Buffett', 'organization': 'unverified', 'famous_quote': 'unverified quote'}
        with mock.patch.object(intelligence, 'get_investor_by_id', return_value=person):
            value = consult_investor_on_specific_asset('warren-buffett', '삼성전자', '검증 자료가 있나요')
        self.assertIn('워런 버핏', value['investor_name_kr'])
        self.assertIn('가상', value['investor_name_kr'])
        self.assertEqual(value['asset'], '삼성전자')
        self.assertEqual((value['verdict'], value['verdict_kr'], value['state']), ('HOLD', '보류', 'UNAVAILABLE'))
        self.assertIsNone(value['recommended_weight'])
        self.assertIsNone(value['organization'])
        self.assertIsNone(value['famous_quote'])
        self.assertIs(value['ai_used'], False)
        self.assertIs(value['orders_authorized'], False)
        with mock.patch.object(intelligence, 'get_investor_by_id', return_value=None), mock.patch.object(intelligence, 'get_all_investors', return_value=[]):
            unknown = consult_investor_on_specific_asset('unknown', 'SPY')
        self.assertIn('가상', unknown['name_kr'])
        self.assertNotIn('전설', unknown['opinion'])

    def test_unavailable_results_do_not_stamp_a_new_analysis_or_call_ai(self):
        with mock.patch.object(intelligence, 'datetime') as clock:
            clock.now.side_effect = AssertionError('unverified observation clock')
            first = asdict(get_chief_director_verdict())
            second = asdict(get_chief_director_verdict())
            self.assertEqual(first, second)
            self.assertIsNone(generate_daily_council_debate().date_str)
            self.assertEqual(get_daily_25_recommendations()['count'], 0)
        text = json.dumps(first, ensure_ascii=False)
        for fabricated in ('40년', '62.0', '4.88%', '4.25%', 'POSITIVE_EXPANSION'):
            self.assertNotIn(fabricated, text)

    def test_missing_role_catalog_still_returns_hold_without_private_details(self):
        with mock.patch.object(intelligence, 'get_investor_by_id', side_effect=FileNotFoundError('PRIVATE_PATH')):
            value = consult_investor_on_specific_asset('unknown', 'SPY')
        self.assertEqual((value['state'], value['verdict']), ('UNAVAILABLE', 'HOLD'))
        self.assertNotIn('PRIVATE_PATH', json.dumps(value))


if __name__ == "__main__":
    unittest.main()
