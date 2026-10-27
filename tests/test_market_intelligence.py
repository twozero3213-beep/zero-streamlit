# -*- coding: utf-8 -*-
"""Unit tests for Macro Indicators and Market Intelligence (Chief Director Verdict, 100-Investor Daily Debate, 25 Recommendations)."""
import unittest
from zero.macro_indicators import VERIFIED_MACRO_ITEMS, get_macro_indicators
from zero.market_intelligence import (
    get_chief_director_verdict,
    generate_daily_council_debate,
    get_daily_25_recommendations,
    consult_investor_on_specific_asset
)


class TestMarketIntelligence(unittest.TestCase):
    def test_verified_macro_indicators_structure_and_stats(self):
        self.assertGreaterEqual(len(VERIFIED_MACRO_ITEMS), 8)
        ids = {item["id"] for item in VERIFIED_MACRO_ITEMS}
        expected_ids = {
            "US_DGS10", "US_FEDFUNDS", "GLOBAL_VIX", "KR_USD_KRW",
            "US_CPI", "KR_BASE_RATE", "US_UNEMPLOYMENT", "GLOBAL_WTI_CRUDE"
        }
        self.assertTrue(expected_ids.issubset(ids))

        for item in VERIFIED_MACRO_ITEMS:
            self.assertIn("id", item)
            self.assertIn("name", item)
            self.assertIn("latest_value", item)
            self.assertIn("statistics", item)
            stats = item["statistics"]
            self.assertTrue(stats.get("available"))
            self.assertIn("p25", stats)
            self.assertIn("p75", stats)
            self.assertIn("median", stats)
            self.assertGreaterEqual(len(item.get("history", [])), 3)

    def test_macro_indicators_filtering(self):
        us_items = get_macro_indicators(country="US")
        self.assertTrue(all(item["country"] == "US" for item in us_items))
        self.assertGreater(len(us_items), 0)

        vix_items = get_macro_indicators(search="VIX")
        self.assertEqual(len(vix_items), 1)
        self.assertEqual(vix_items[0]["id"], "GLOBAL_VIX")

    def test_chief_director_verdict_probabilities_and_reasoning(self):
        verdict = get_chief_director_verdict()
        self.assertIn(verdict.verdict, ["BUY", "SELL"])
        self.assertNotEqual(verdict.verdict, "HOLD")  # Never HOLD
        self.assertAlmostEqual(verdict.buy_prob + verdict.sell_prob, 100.0, places=1)
        self.assertEqual(verdict.buy_prob, 62.0)
        self.assertEqual(verdict.sell_prob, 38.0)

        # Economic outlook probabilities
        economy = verdict.economy_outlook
        self.assertAlmostEqual(economy["positive_prob"] + economy["negative_prob"], 100.0, places=1)
        self.assertEqual(economy["positive_prob"], 68.0)
        self.assertEqual(economy["negative_prob"], 32.0)
        self.assertGreaterEqual(len(economy["indicator_breakdown"]), 5)
        self.assertTrue(len(verdict.summary_reasoning) > 30)

    def test_daily_council_debate(self):
        debate = generate_daily_council_debate()
        self.assertIn("date", debate)
        self.assertIn("macro_debate", debate)
        self.assertIn("micro_debate", debate)
        self.assertGreaterEqual(len(debate["strong_sectors"]), 2)
        self.assertGreaterEqual(len(debate["weak_sectors"]), 2)

        # Check strong sectors have winners and losers
        for sector in debate["strong_sectors"]:
            self.assertTrue(len(sector["strong_companies"]) > 0)
            self.assertTrue(len(sector["weak_companies"]) > 0)

    def test_daily_25_recommendations(self):
        data = get_daily_25_recommendations()
        picks = data["recommendations"]
        self.assertEqual(len(picks), 25)

        categories = [p["category"] for p in picks]
        self.assertEqual(categories.count("NASDAQ"), 10)
        self.assertEqual(categories.count("KOSPI"), 5)
        self.assertEqual(categories.count("KOSDAQ"), 5)
        self.assertEqual(categories.count("ETF"), 5)

        for pick in picks:
            self.assertIn("symbol", pick)
            self.assertIn("name_kr", pick)
            self.assertIn("reason", pick)
            self.assertIn("conviction_weight", pick)

    def test_consult_investor_on_specific_asset(self):
        # Warren Buffett on Samsung Electronics
        res_buffett = consult_investor_on_specific_asset("warren-buffett", "삼성전자")
        self.assertIn("워런 버핏", res_buffett["investor_name_kr"])
        self.assertEqual(res_buffett["asset"], "삼성전자")
        self.assertTrue(len(res_buffett["opinion"]) > 20)

        # Jim Simons on SPY ETF
        res_simons = consult_investor_on_specific_asset("jim-simons", "SPY")
        self.assertIn("짐 사이먼스", res_simons["investor_name_kr"])
        self.assertEqual(res_simons["asset"], "SPY")
        self.assertIn("정량적", res_simons["opinion"])


if __name__ == "__main__":
    unittest.main()
