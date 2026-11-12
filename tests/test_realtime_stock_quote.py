# -*- coding: utf-8 -*-
"""Unit tests for real-time stock quote provider (network is mocked)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import unittest
from unittest.mock import call, patch
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
        self.original_env_loader = rq._get_zero_env
        loader = patch.object(rq, "_get_zero_env", return_value={})
        loader.start()
        self.addCleanup(loader.stop)

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


    def test_prefixed_invalid_symbols_never_reach_providers(self):
        a, b, c, d = _all_sources_down()
        with a as toss, b as kis, c as naver, d as yahoo:
            for symbol in ("US:BAD&X", "US:", "US:123456", "KR:NVDA", "KR:005930/other"):
                with self.subTest(symbol=symbol):
                    code, body = rq.get_quote_response("/api/market/quote?identity=" + rq.urlencode({"x": symbol})[2:])
                    self.assertEqual((code, body.get("error")), (400, "SYMBOL_INVALID"))
            for provider in (toss, kis, naver, yahoo):
                provider.assert_not_called()

    def test_batch_over_limit_is_rejected_before_deduplication_or_providers(self):
        a, b, c, d = _all_sources_down()
        with a as toss, b as kis, c as naver, d as yahoo:
            for raw in (",".join(["NVDA"] * 31), "NVDA" + "," * 30):
                code, body = rq.get_quote_response("/api/market/quote?symbols=" + raw)
                self.assertEqual((code, body.get("error")), (400, "QUOTE_BATCH_LIMIT"))
            for provider in (toss, kis, naver, yahoo):
                provider.assert_not_called()

    def test_batch_validation_is_atomic(self):
        a, b, c, d = _all_sources_down()
        with a as toss, b as kis, c as naver, d as yahoo:
            with self.assertRaisesRegex(ValueError, "^SYMBOL_INVALID$"):
                rq.fetch_multiple_quotes(["NVDA", "KR:BAD"])
            for provider in (toss, kis, naver, yahoo):
                provider.assert_not_called()

    def test_batch_deduplicates_normalized_symbols_and_accepts_30(self):
        a, b, c, d = _all_sources_down()
        with a, b, c as naver, d as yahoo:
            self.assertEqual(rq.fetch_multiple_quotes(["NVDA", "US:NVDA"]), {})
            yahoo.assert_called_once_with("NVDA", "US", "USD")
            naver.assert_not_called()
            code, body = rq.get_quote_response("/api/market/quote?symbols=" + ",".join("S" + str(i) for i in range(30)))
            self.assertEqual(code, 200)
            self.assertEqual(len(body["missing"]), 30)

    def test_fallback_preserves_explicit_market(self):
        with patch.object(rq, "_fetch_from_toss", return_value={}), patch.object(rq, "fetch_stock_quote", return_value=None) as fallback:
            rq.fetch_multiple_quotes(["US:NVDA", "KR:005930"])
        self.assertEqual(fallback.call_args_list, [call("US:NVDA"), call("KR:005930")])

    def test_cache_prunes_expired_entries_and_caps_512(self):
        rq._QUOTE_CACHE.update({"S" + str(i): (_quote("S" + str(i), 1, "US", "USD"), 1015) for i in range(512)})
        rq._QUOTE_CACHE["EXPIRED"] = (_quote("EXPIRED", 1, "US", "USD"), 999)
        a, b, c, d = _all_sources_down()
        with a, b, c, d as yahoo, patch.object(rq.time, "time", return_value=1000):
            yahoo.return_value = _quote("NVDA", 10, "US", "USD")
            self.assertEqual(rq.fetch_stock_quote("NVDA")["symbol"], "NVDA")
        self.assertEqual(len(rq._QUOTE_CACHE), 512)
        self.assertNotIn("EXPIRED", rq._QUOTE_CACHE)
        self.assertNotIn("S0", rq._QUOTE_CACHE)
        self.assertIn("NVDA", rq._QUOTE_CACHE)

    def test_empty_env_does_not_use_cached_broker_tokens(self):
        with patch.dict(rq._TOSS_TOKEN_CACHE, {"token": "SYNTHETIC", "expires_at": 10**20}), patch.dict(rq._KIS_TOKEN_CACHE, {"token": "SYNTHETIC", "expires_at": 10**20}), patch.object(rq.urllib.request, "urlopen") as http:
            self.assertIsNone(rq._get_toss_token({}))
            self.assertIsNone(rq._get_kis_token({})[0])
            http.assert_not_called()

    def test_unsupported_saved_holding_preserves_default_quotes_and_other_holdings(self):
        class Store:
            def snapshot(self):
                return {"holdings": [{"market": "US", "symbol": "123"}, {"market": "US", "symbol": "AAPL"}]}
        a, b, c, d = _all_sources_down()
        with a, b, c as naver, d as yahoo:
            naver.side_effect = lambda code: _quote(code, 71000) if code == "005930" else None
            yahoo.side_effect = lambda code, market, currency: _quote(code, 200, market, currency) if code == "AAPL" else None
            try:
                code, body = rq.get_live_quotes_endpoint(Store())
            except ValueError:
                self.fail("An unsupported saved holding aborted quote refresh")
        self.assertEqual(code, 200)
        self.assertEqual({row["symbol"] for row in body["quotes"]}, {"005930", "AAPL"})
        yahoo.assert_any_call("AAPL", "US", "USD")

    def test_live_quotes_chunks_saved_holdings_without_private_reads(self):
        class Store:
            def snapshot(self):
                return {"holdings": [{"symbol": "S" + str(i)} for i in range(35)]}
        with patch.object(rq, "fetch_multiple_quotes", return_value={}) as fetch:
            code, body = rq.get_live_quotes_endpoint(Store())
        self.assertEqual(code, 503)
        self.assertEqual([len(item.args[0]) for item in fetch.call_args_list], [30, 11])
        self.assertEqual(len({symbol for item in fetch.call_args_list for symbol in item.args[0]}), 41)

    def test_router_never_returns_unexpected_exception_text(self):
        with patch.object(rq, "fetch_stock_quote", side_effect=RuntimeError("SYNTHETIC_PRIVATE_PROVIDER_TEXT")):
            code, body = rq.get_quote_response("/api/market/quote?symbol=NVDA")
        self.assertEqual((code, body.get("error")), (400, "QUOTE_REQUEST_INVALID"))

    def test_public_loader_never_reads_files_or_broker_environment(self):
        with patch("builtins.open", side_effect=AssertionError("PRIVATE_FILE_READ")), patch("pathlib.Path.is_file", side_effect=AssertionError("PRIVATE_FILE_CHECK")), patch.dict("os.environ", {"TOSS_APP_KEY": "SYNTHETIC", "TOSS_SECRET_KEY": "SYNTHETIC", "KIS_MOCK_APP_KEY": "SYNTHETIC", "KIS_MOCK_APP_SECRET": "SYNTHETIC"}, clear=True):
            self.assertEqual(self.original_env_loader(), {})

if __name__ == "__main__":
    unittest.main()
