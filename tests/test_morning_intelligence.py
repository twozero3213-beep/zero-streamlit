import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
# -*- coding: utf-8 -*-
"""모던 아침 보고서, 언어 필터, 실시간 지수/환율 및 무료 범용 AI 툴 종합 테스트."""
from datetime import datetime, timezone, timedelta
import unittest

from zero.language_filter import (
    sanitize_text,
    replace_hanja,
    correct_typos_and_spelling,
    filter_non_korean_english
)
from zero.realtime_market_pulse import RealtimeMarketPulse, MarketIndexItem, FxRateItem
from zero.free_universal_ai import FreeUniversalAITool
from zero.morning_report import ModernMorningReportBuilder

KST = timezone(timedelta(hours=9))
AT = datetime(2026, 10, 27, 8, 30, tzinfo=KST)


class LanguageFilterTests(unittest.TestCase):
    def test_hanja_to_korean_replacement(self):
        # 美, 韓, 日, 中, 株, 昇, 降 등 한자가 한글로 올바르게 치환되는지 검증
        raw = "美 연준 금리인하 기대감에 韓 증시 株 급등, 日·中 증시는 하락"
        converted = replace_hanja(raw)
        self.assertIn("미국", converted)
        self.assertIn("한국", converted)
        self.assertIn("일본", converted)
        self.assertIn("중국", converted)
        self.assertNotIn("美", converted)
        self.assertNotIn("韓", converted)

    def test_typo_and_spelling_corrections(self):
        # 잦은 금융 오탈자 교정
        raw = "[ 속보 ] 코스피지수 및 코스닥지수 급등… 원달러 환율전망 안정세"
        fixed = correct_typos_and_spelling(raw)
        self.assertIn("[속보]", fixed)
        self.assertIn("코스피 지수", fixed)
        self.assertIn("코스닥 지수", fixed)
        self.assertIn("원/달러", fixed)
        self.assertIn("환율 전망", fixed)

    def test_strict_non_korean_english_filtering(self):
        # 일본어(가나), 중국어 잔여한자, 키릴 문자 등이 완전 필터링되는지 검증
        mixed = "美 빅테크 NVDA 상승 (한국어 테스트, 日本語 テスト, Привет мир, 中文 漢字)"
        sanitized = sanitize_text(mixed)
        # 한글, 영문, 숫자, 안전 기호만 남아야 함
        self.assertIn("미국 빅테크 NVDA 상승", sanitized)
        self.assertIn("한국어 테스트", sanitized)
        self.assertNotIn("日本語", sanitized)
        self.assertNotIn("テスト", sanitized)
        self.assertNotIn("Привет", sanitized)
        self.assertNotIn("漢字", sanitized)


class RealtimeMarketPulseTests(unittest.TestCase):
    def test_market_pulse_indices_and_fx(self):
        summary = RealtimeMarketPulse.get_market_pulse_summary()
        self.assertIn("indices", summary)
        self.assertIn("fx_rates", summary)
        self.assertTrue(len(summary["indices"]) >= 4)
        self.assertTrue(len(summary["fx_rates"]) >= 2)

        kospi = next((i for i in summary["indices"] if "코스피" in i["name"] or i["symbol"] == "KOSPI"), None)
        self.assertIsNotNone(kospi)
        self.assertGreater(kospi["price"], 1000)

        usd_krw = next((f for f in summary["fx_rates"] if "USD" in f["pair"] or "달러" in f["name"]), None)
        self.assertIsNotNone(usd_krw)
        self.assertGreater(usd_krw["rate"], 1000)


class FreeUniversalAIToolTests(unittest.TestCase):
    def test_analyze_news_sentiment_and_summary(self):
        title = "[속보] 美 연준 기준금리 인하 단행… 나스닥 3% 급등 랠리"
        content = "미국 연방준비제도가 기준금리를 인하하며 글로벌 증시가 일제히 반등했습니다. 기술주 중심의 강력한 매수세가 유입되었습니다."
        res = FreeUniversalAITool.analyze_news(title, content)
        self.assertEqual(res.market_sentiment, "POSITIVE")
        self.assertTrue(res.is_urgent)
        self.assertTrue(len(res.three_line_summary) >= 2)
        self.assertIn("미국 연준", res.cleaned_title)

    def test_negative_sentiment_analysis(self):
        title = "[긴급] 중동 지정학적 위기 고조… 국제유가 폭등 및 증시 급락 쇼크"
        res = FreeUniversalAITool.analyze_news(title)
        self.assertEqual(res.market_sentiment, "NEGATIVE")
        self.assertTrue(res.is_urgent)


class ModernMorningReportTests(unittest.TestCase):
    def test_render_markdown_and_html(self):
        builder = ModernMorningReportBuilder(at=AT)
        data = builder.gather_data()

        # 마크다운 렌더링 검증
        md = builder.render_markdown(data)
        self.assertIn("ZERO 프리미엄 모닝 인텔리전스", md)
        self.assertIn("40년차 월가 총괄 디렉터 결단", md)
        self.assertIn("실시간 글로벌 지수", md)
        self.assertIn("긴급 · 속보 · 단독 인텔리전스", md)
        self.assertIn("오늘의 25선 핵심 전략 포커스", md)

        # HTML 렌더링 검증 (피그마 감성 스타일)
        html_doc = builder.render_html(data)
        self.assertIn("<!DOCTYPE html>", html_doc)
        self.assertIn("FIGMA-DESIGNED MORNING INTELLIGENCE", html_doc)
        self.assertIn("알렉산더 밴스", html_doc)
        self.assertIn("progress-fill-up", html_doc)
        self.assertIn("matrix-grid", html_doc)


if __name__ == "__main__":
    unittest.main()
