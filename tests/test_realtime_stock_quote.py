# -*- coding: utf-8 -*-
"""Unit tests for real-time stock quote provider (network is mocked)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import unittest
from unittest.mock import patch
from zero import realtime_stock_quote as rq


def _quote(code, price, market="KR", currency="KRW", source="NAVER_REALTIME"):
    return {"symbol": code, "identity": f"{market}:{code}", "name": code, "market": market,
            "currency": currency, "current_price": price, "change": 1.0, "change_percent": 0.5,
            "previous_close": price - 1.0, "market_time": "2026-11-01T00:00:00+00:00", "source": source}


def _all_sources_down():
    return (patch.object(rq, "_fetch_from_toss", return_value={}),
            patch.object(rq, "_fetch_from_kis_kr", return_value=None),
            patch.object(rq, "_fetch_from_naver_kr", return_value=None),
            patch.object(rq, "_fetch_from_yahoo", return_value=None))


class TestRealtimeStockQuote(unittest.TestCase):
    def setUp(self):
        rq._QUOTE_CACHE.clear()

    def test_clean_symbol(self):
        self.assertEqual(rq._clean_symbol("005930"), ("005930", "KR", "KRW"))
        self.assertEqual(rq._clean_symbol("KR:005930"), ("005930", "KR", "KRW"))
        self.assertEqual(rq._clean_symbol("NVDA"), ("NVDA", "US", "USD"))
        self.assertEqual(rq._clean_symbol("US:NVDA"), ("NVDA", "US", "USD"))
        with self.assertRaises(ValueError):
            rq._clean_symbol("INVALID!@#")

    def test_live_source_is_returned_as_is(self):
        with patch.object(rq, "_fetch_from_toss", return_value={}), \
             patch.object(rq, "_fetch_from_kis_kr", return_value=None), \
             patch.object(rq, "_fetch_from_naver_kr", return_value=_quote("005930", 71000.0)), \
             patch.object(rq, "_fetch_from_yahoo", return_value=None):
            q = rq.fetch_stock_quote("005930")
        self.assertEqual(q["current_price"], 71000.0)
        self.assertEqual(q["source"], "NAVER_REALTIME")

    def test_no_source_means_no_price_never_a_made_up_one(self):
        a, b, c, d = _all_sources_down()
        with a, b, c, d:
            self.assertIsNone(rq.fetch_stock_quote("005930"))
            self.assertIsNone(rq.fetch_stock_quote("NVDA"))
            self.assertEqual(rq.fetch_multiple_quotes(["005930", "NVDA", "SPY"]), {})
        self.assertEqual(rq._QUOTE_CACHE, {}, "failed lookups must not be cached")

    def test_multiple_quotes_keep_only_real_ones(self):
        def naver(code):
            return _quote(code, 71000.0) if code == "005930" else None
        with patch.object(rq, "_fetch_from_toss", return_value={}), \
             patch.object(rq, "_fetch_from_kis_kr", return_value=None), \
             patch.object(rq, "_fetch_from_naver_kr", side_effect=naver), \
             patch.object(rq, "_fetch_from_yahoo", return_value=None):
            res = rq.fetch_multiple_quotes(["005930", "000660"])
        self.assertEqual(list(res), ["005930"])

    def test_router_reports_missing_and_unavailable(self):
        a, b, c, d = _all_sources_down()
        with a, b, c, d:
            code, resp = rq.get_quote_response("/api/market/quote?symbols=005930,NVDA")
            self.assertEqual(code, 200)
            self.assertEqual(resp["quotes"], {})
            self.assertEqual(resp["missing"], ["005930", "NVDA"])
            code, resp = rq.get_quote_response("/api/market/quote?symbol=005930")
            self.assertEqual(code, 503)
            self.assertEqual(resp["status"], "UNAVAILABLE")
            self.assertIsNone(resp["quote"])

    def test_live_quotes_unavailable_is_not_reported_available(self):
        a, b, c, d = _all_sources_down()
        with a, b, c, d:
            code, body = rq.get_live_quotes_endpoint(None)
        self.assertEqual(code, 503)
        self.assertEqual(body["state"], "UNAVAILABLE")
        self.assertEqual(body["quotes"], [])

    def test_live_quotes_has_no_invented_fx_or_benchmark(self):
        def naver(code):
            return _quote(code, 71000.0)
        with patch.object(rq, "_fetch_from_toss", return_value={}), \
             patch.object(rq, "_fetch_from_kis_kr", return_value=None), \
             patch.object(rq, "_fetch_from_naver_kr", side_effect=naver), \
             patch.object(rq, "_fetch_from_yahoo", return_value=None):
            code, body = rq.get_live_quotes_endpoint(None)
        self.assertEqual(code, 200)
        self.assertEqual(body["state"], "AVAILABLE")
        self.assertNotIn("fx", body)
        self.assertNotIn("benchmarks", body, "SPY was not fetched, so no benchmark may be shown")
        self.assertTrue(all("price" in row for row in body["quotes"]))

    def test_live_quotes_omits_previous_close_when_unknown(self):
        toss_like = {"005930": {"symbol": "005930", "identity": "KR:005930", "name": "삼성전자", "market": "KR",
                                "currency": "KRW", "current_price": 71000.0, "market_time": "t", "source": "TOSS_SECURITIES"}}
        with patch.object(rq, "_fetch_from_toss", return_value=toss_like), \
             patch.object(rq, "_fetch_from_kis_kr", return_value=None), \
             patch.object(rq, "_fetch_from_naver_kr", return_value=None), \
             patch.object(rq, "_fetch_from_yahoo", return_value=None):
            code, body = rq.get_live_quotes_endpoint(None)
        row = next(r for r in body["quotes"] if r["symbol"] == "005930")
        self.assertNotIn("previous_close", row)


if __name__ == "__main__":
    unittest.main()
