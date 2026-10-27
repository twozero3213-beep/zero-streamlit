# -*- coding: utf-8 -*-
"""Unit tests for real-time stock quote provider."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import unittest
from unittest.mock import patch, MagicMock
from zero.realtime_stock_quote import (
    _clean_symbol,
    fetch_stock_quote,
    fetch_multiple_quotes,
    get_quote_response,
)


class TestRealtimeStockQuote(unittest.TestCase):
    def test_clean_symbol(self):
        self.assertEqual(_clean_symbol("005930"), ("005930", "KR", "KRW"))
        self.assertEqual(_clean_symbol("KR:005930"), ("005930", "KR", "KRW"))
        self.assertEqual(_clean_symbol("NVDA"), ("NVDA", "US", "USD"))
        self.assertEqual(_clean_symbol("US:NVDA"), ("NVDA", "US", "USD"))
        with self.assertRaises(ValueError):
            _clean_symbol("INVALID!@#")

    def test_fetch_stock_quote_basic(self):
        q = fetch_stock_quote("005930")
        self.assertEqual(q["symbol"], "005930")
        self.assertEqual(q["market"], "KR")
        self.assertGreater(q["current_price"], 100000)

    def test_fetch_stock_quote_us(self):
        q = fetch_stock_quote("NVDA")
        self.assertEqual(q["symbol"], "NVDA")
        self.assertEqual(q["market"], "US")
        self.assertGreater(q["current_price"], 50)

    def test_fetch_multiple_quotes(self):
        res = fetch_multiple_quotes(["005930", "NVDA"])
        self.assertIn("005930", res)
        self.assertIn("NVDA", res)

    def test_get_quote_response_router(self):
        code, resp = get_quote_response("/api/market/quote?symbol=005930")
        self.assertEqual(code, 200)
        self.assertEqual(resp["status"], "OK")
        self.assertEqual(resp["quote"]["symbol"], "005930")

        code_multi, resp_multi = get_quote_response("/api/market/quote?symbols=005930,000660")
        self.assertEqual(code_multi, 200)
        self.assertIn("005930", resp_multi["quotes"])


if __name__ == "__main__":
    unittest.main()
