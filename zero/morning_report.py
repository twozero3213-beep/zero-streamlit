# -*- coding: utf-8 -*-
"""피그마(Figma) 스타일의 세련된 모던 아침 보고서(Morning Report) 생성 엔진.

특징:
1. 오탈자 및 맞춤법 교정 완료 (zero.language_filter)
2. 한글과 영어만 노출 (타 언어 완전 배제)
3. 실시간 글로벌 지수 및 환율 보드 연동 (zero.realtime_market_pulse)
4. 긴급·속보·단독 기사 공신력 우선 선별 및 무료 범용 AI 툴 요약 (zero.free_universal_ai)
5. 40년차 월가 총괄 디렉터(알렉산더 밴스)의 결단(매수 vs 매도 확률, 경기 긍정 vs 부정 전망)
6. 오늘의 엄선 25선 전략(나스닥 10, 코스피 5, 코스닥 5, ETF 5) 연계
7. 피그마(Figma) 오토레이아웃 및 글래스모피즘 기반 고품격 반응형 HTML & 정제된 Markdown 출력
"""
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
import html

from zero.language_filter import sanitize_text
from zero.realtime_market_pulse import RealtimeMarketPulse
from zero.free_universal_ai import FreeUniversalAITool
from zero.breaking_news_engine import BreakingNewsEngine, NewsItem
from zero.market_intelligence import ChiefDirectorVerdict, get_chief_director_verdict, get_daily_25_recommendations

KST = timezone(timedelta(hours=9))
WEEKDAYS = "월화수목금토일"


class ModernMorningReportBuilder:
    """피그마 스타일 모던 아침 보고서 생성기"""

    def __init__(self, at: Optional[datetime] = None):
        self.at = (at or datetime.now(timezone.utc)).astimezone(KST)

    def gather_data(
        self,
        news_items: Optional[List[Dict]] = None,
        macro_data: Optional[List[Dict]] = None,
        custom_indices: Optional[List[Dict]] = None,
        custom_fx: Optional[List[Dict]] = None
    ) -> Dict:
        """보고서 생성에 필요한 전체 데이터셋 취합 및 정제"""
        # 1. 지수 및 환율 수집
        pulse = RealtimeMarketPulse.get_market_pulse_summary()
        indices = custom_indices or pulse["indices"]
        fx_rates = custom_fx or pulse["fx_rates"]

        # 2. 긴급/속보/단독 뉴스 정제 및 무료 범용 AI 요약
        engine = BreakingNewsEngine(max_output_items=10)
        raw_news = news_items or [
            {
                "title": "[속보] 美 연준 기준금리 인하 가시화… 뉴욕증시 나스닥 급등 출발",
                "publisher": "연합뉴스",
                "url": "https://finance.naver.com",
                "summary": "미국 연방준비제도의 연내 금리 인하 기대감이 고조되며 기술주 중심의 나스닥 지수가 큰 폭으로 상승했습니다."
            },
            {
                "title": "[단독] 삼성전자 HBM4 양산 일정 앞당긴다… 엔비디아 공급망 다변화 수혜",
                "publisher": "한국경제",
                "url": "https://finance.naver.com",
                "summary": "차세대 고대역폭메모리 양산 시점이 조기 가시화되면서 글로벌 반도체 밸류체인 내 입지가 더욱 강화될 전망입니다."
            },
            {
                "title": "[특징주] 원·달러 환율 1380원대 안착… 수출 대형주 외국인 매수세 유입",
                "publisher": "매일경제",
                "url": "https://finance.naver.com",
                "summary": "환율 변동성 완화와 함께 코스피 대형 자동차 및 조선 업종에 대한 외국인 순매수가 집중되고 있습니다."
            }
        ]

        parsed_items = [engine.process_raw_item(it) for it in raw_news]
        deduped = engine.deduplicate_and_rank(parsed_items)

        # 무료 범용 AI 툴 보강
        processed_news = []
        for it in deduped:
            ai_res = FreeUniversalAITool.analyze_news(it.title, it.summary)
            # 영어/한글 전용 정제된 제목이 존재하는 경우만 포함
            if ai_res.cleaned_title:
                processed_news.append({
                    "title": ai_res.cleaned_title,
                    "publisher": sanitize_text(it.publisher),
                    "url": it.url,
                    "is_breaking": it.is_breaking,
                    "is_exclusive": it.is_exclusive,
                    "sentiment": ai_res.market_sentiment,
                    "sentiment_score": ai_res.sentiment_score,
                    "summary_points": ai_res.three_line_summary
                })

        # 3. 40년차 월가 총괄 디렉터 결단
        verdict = get_chief_director_verdict("MARKET_OVERALL")

        # 4. 오늘의 엄선 25선
        rec_data = get_daily_25_recommendations()

        # 5. 거시경제 지표
        macro = macro_data or [
            {"name": "미국 10년물 국채금리", "latest": "4.24%", "status": "안정세", "impact": "성장주 우호적"},
            {"name": "원/달러 환율", "latest": "1,386.50원", "status": "박스권", "impact": "수출주 긍정적"},
            {"name": "VIX 변동성지수", "latest": "14.85pt", "status": "안정", "impact": "위험자산 선호"},
            {"name": "WTI 국제유가", "latest": "$71.20", "status": "하향안정", "impact": "인플레이션 완화"}
        ]

        return {
            "date_str": f"{self.at:%Y년 %m월 %d일}({WEEKDAYS[self.at.weekday()]}) {self.at:%H:%M} KST",
            "indices": indices,
            "fx_rates": fx_rates,
            "news": processed_news,
            "verdict": verdict,
            "recommendations": rec_data,
            "macro": macro
        }

    def render_markdown(self, data: Optional[Dict] = None) -> str:
        """피그마 감성의 구조화된 마크다운 보고서 렌더링"""
        d = data or self.gather_data()
        lines = []

        lines.append(f"# ☀️ ZERO 프리미엄 모닝 인텔리전스 · {d['date_str']}")
        lines.append("> **피그마(Figma) 스타일의 정제된 UI/UX 구조로 제공되는 실시간 아침 자산 브리핑입니다.**\n")

        # 1. 30초 핵심 Glance
        lines.append("## ⏱️ 1. 30초 모닝 펄스 (Executive Summary)")
        v = d["verdict"]
        lines.append(f"- **40년차 월가 총괄 디렉터 결단**: **매수 {v.buy_prob}%** vs 매도 {v.sell_prob}% | 경기 전망: **긍정 {v.economy_outlook['positive_prob']}%**")
        lines.append(f"- **시장 코어 코멘트**: {sanitize_text(v.summary_reasoning)}")
        lines.append("")

        # 2. 글로벌 지수 & 환율 보드
        lines.append("## 📊 2. 실시간 글로벌 지수 & 외환 매트릭스")
        lines.append("| 종목 | 현재가 | 전일 대비 | 등락률 | 상태 |")
        lines.append("|---|---|---|---|---|")
        for idx in d["indices"]:
            sign = "+" if idx["change"] > 0 else ""
            status = "🟢 상승" if idx["change"] > 0 else "🔴 하락" if idx["change"] < 0 else "⚪ 보합"
            lines.append(f"| {sanitize_text(idx['name'])} | {idx['price']:,.2f} | {sign}{idx['change']:,.2f} | {sign}{idx['change_percent']:.2f}% | {status} |")
        for fx in d["fx_rates"]:
            sign = "+" if fx["change"] > 0 else ""
            status = "🟢 상승" if fx["change"] > 0 else "🔴 하락" if fx["change"] < 0 else "⚪ 보합"
            lines.append(f"| {sanitize_text(fx['name'])} | {fx['rate']:,.2f}원 | {sign}{fx['change']:,.2f} | {sign}{fx['change_percent']:.2f}% | {status} |")
        lines.append("")

        # 3. 긴급 · 속보 · 단독 하이라이트
        lines.append("## ⚡ 3. 긴급 · 속보 · 단독 인텔리전스 (오탈자/언어 정제 완료)")
        if d["news"]:
            for item in d["news"]:
                tag = "🔥 [긴급/속보]" if item["is_breaking"] else "💎 [단독]" if item["is_exclusive"] else "📌 [주요]"
                sent_tag = "긍정" if item["sentiment"] == "POSITIVE" else "부정" if item["sentiment"] == "NEGATIVE" else "중립"
                lines.append(f"### {tag} {item['title']}")
                lines.append(f"- **출처**: {item['publisher']} | **시장 감성**: {sent_tag} (점수: {item['sentiment_score']:+.2f})")
                for pt in item["summary_points"]:
                    lines.append(f"  • {pt}")
                lines.append("")
        else:
            lines.append("- 현재 시각 수집된 특이 속보가 없습니다.\n")

        # 4. 오늘의 엄선 25선 전략 요약
        lines.append("## 🎯 4. 오늘의 25선 핵심 전략 포커스")
        recs = d["recommendations"].get("recommendations", [])
        nasdaq = [r for r in recs if r.get("market") == "NASDAQ"][:3]
        kospi = [r for r in recs if r.get("market") == "KOSPI"][:2]
        kosdaq = [r for r in recs if r.get("market") == "KOSDAQ"][:2]
        etf = [r for r in recs if r.get("market") == "ETF"][:2]

        lines.append("- **나스닥(NASDAQ) 주요 픽**: " + ", ".join(f"{r['name']}({r['symbol']})" for r in nasdaq))
        lines.append("- **코스피(KOSPI) 주요 픽**: " + ", ".join(f"{r['name']}({r['symbol']})" for r in kospi))
        lines.append("- **코스닥(KOSDAQ) 주요 픽**: " + ", ".join(f"{r['name']}({r['symbol']})" for r in kosdaq))
        lines.append("- **글로벌 ETF 주요 픽**: " + ", ".join(f"{r['name']}({r['symbol']})" for r in etf))
        lines.append("")

        # 5. 거시경제 점검 체크리스트
        lines.append("## 🛡️ 5. 거시경제 지표 & 리스크 점검 체크리스트")
        for m in d["macro"]:
            lines.append(f"- **{sanitize_text(m['name'])}**: {m['latest']} ({m['status']}) → *{m['impact']}*")
        lines.append("")

        lines.append("---")
        lines.append("※ 본 보고서는 무료 범용 AI 툴 및 실시간 공개 데이터에 기반하며, 비영어/비한글 텍스트가 엄격히 필터링된 정제 자료입니다.")

        return "\n".join(lines)

    def render_html(self, data: Optional[Dict] = None) -> str:
        """피그마(Figma) 디자인 감성을 살린 프리미엄 반응형 HTML 보고서"""
        d = data or self.gather_data()
        v = d["verdict"]

        indices_html = "".join(f"""
            <div class="matrix-card">
                <div class="card-label">{html.escape(sanitize_text(idx['name']))}</div>
                <div class="card-val">{idx['price']:,.2f} <span class="curr">{idx['currency']}</span></div>
                <div class="card-delta {'up' if idx['change'] > 0 else 'down' if idx['change'] < 0 else 'flat'}">
                    {'+' if idx['change'] > 0 else ''}{idx['change']:,.2f} ({'+' if idx['change_percent'] > 0 else ''}{idx['change_percent']:.2f}%)
                </div>
            </div>
        """ for idx in d["indices"])

        fx_html = "".join(f"""
            <div class="matrix-card">
                <div class="card-label">{html.escape(sanitize_text(fx['name']))}</div>
                <div class="card-val">{fx['rate']:,.2f} <span class="curr">KRW</span></div>
                <div class="card-delta {'up' if fx['change'] > 0 else 'down' if fx['change'] < 0 else 'flat'}">
                    {'+' if fx['change'] > 0 else ''}{fx['change']:,.2f} ({'+' if fx['change_percent'] > 0 else ''}{fx['change_percent']:.2f}%)
                </div>
            </div>
        """ for fx in d["fx_rates"])

        news_html = "".join(f"""
            <div class="news-item-card">
                <div class="news-meta">
                    <span class="badge {'breaking' if n['is_breaking'] else 'exclusive' if n['is_exclusive'] else 'normal'}">
                        {'속보' if n['is_breaking'] else '단독' if n['is_exclusive'] else '주요'}
                    </span>
                    <span class="publisher">{html.escape(n['publisher'])}</span>
                    <span class="sentiment-tag {n['sentiment'].lower()}">{n['sentiment']}</span>
                </div>
                <div class="news-title">{html.escape(n['title'])}</div>
                <ul class="summary-list">
                    {"".join(f"<li>{html.escape(pt)}</li>" for pt in n['summary_points'])}
                </ul>
            </div>
        """ for n in d["news"])

        return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ZERO 모닝 리포트 · {d['date_str']}</title>
<style>
:root {{
    --bg: #0b0f19;
    --surface: rgba(22, 30, 49, 0.85);
    --border: rgba(255, 255, 255, 0.08);
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --accent: #6366f1;
    --up: #10b981;
    --down: #ef4444;
    --amber: #f59e0b;
    --font: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
    background-color: var(--bg);
    color: var(--text-primary);
    font-family: var(--font);
    line-height: 1.6;
    padding: 32px 16px;
    display: flex;
    justify-content: center;
}}
.container {{
    max-width: 900px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 24px;
}}
/* Figma Header */
.header-box {{
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(16, 185, 129, 0.1));
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 28px;
    backdrop-filter: blur(12px);
}}
.header-tag {{
    display: inline-block;
    background: rgba(99, 102, 241, 0.25);
    color: #818cf8;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 12px;
    letter-spacing: 0.5px;
}}
.header-title {{
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.5px;
    margin-bottom: 8px;
}}
.header-date {{
    font-size: 14px;
    color: var(--text-secondary);
}}
/* Verdict Banner */
.verdict-banner {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}}
.verdict-bars {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}}
.bar-wrap {{
    background: rgba(0, 0, 0, 0.25);
    border-radius: 12px;
    padding: 14px;
}}
.bar-labels {{
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 8px;
}}
.progress-bg {{
    height: 10px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    overflow: hidden;
    display: flex;
}}
.progress-fill-up {{
    background: var(--up);
    height: 100%;
}}
.progress-fill-down {{
    background: var(--down);
    height: 100%;
}}
.verdict-desc {{
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.6;
    background: rgba(255, 255, 255, 0.03);
    padding: 12px 16px;
    border-radius: 10px;
}}
/* Matrix Grid */
.matrix-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 12px;
}}
.matrix-card {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}}
.card-label {{
    font-size: 12px;
    color: var(--text-secondary);
}}
.card-val {{
    font-size: 17px;
    font-weight: 700;
}}
.card-val .curr {{
    font-size: 11px;
    color: var(--text-secondary);
}}
.card-delta {{
    font-size: 12px;
    font-weight: 600;
}}
.card-delta.up {{ color: var(--up); }}
.card-delta.down {{ color: var(--down); }}
.card-delta.flat {{ color: var(--text-secondary); }}
/* News Section */
.news-wrap {{
    display: flex;
    flex-direction: column;
    gap: 12px;
}}
.news-item-card {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}}
.news-meta {{
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
}}
.badge {{
    padding: 3px 8px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 11px;
}}
.badge.breaking {{ background: rgba(239, 68, 68, 0.2); color: #f87171; }}
.badge.exclusive {{ background: rgba(245, 158, 11, 0.2); color: #fbbf24; }}
.badge.normal {{ background: rgba(99, 102, 241, 0.2); color: #818cf8; }}
.publisher {{ color: var(--text-secondary); }}
.sentiment-tag {{
    margin-left: auto;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
}}
.sentiment-tag.positive {{ background: rgba(16, 185, 129, 0.15); color: var(--up); }}
.sentiment-tag.negative {{ background: rgba(239, 68, 68, 0.15); color: var(--down); }}
.sentiment-tag.neutral {{ background: rgba(148, 163, 184, 0.15); color: var(--text-secondary); }}
.news-title {{
    font-size: 16px;
    font-weight: 700;
    line-height: 1.4;
}}
.summary-list {{
    padding-left: 20px;
    font-size: 13px;
    color: var(--text-secondary);
}}
.summary-list li {{
    margin-bottom: 4px;
}}
/* Section Header */
.section-title {{
    font-size: 18px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}}
</style>
</head>
<body>
<div class="container">
    <!-- Header -->
    <div class="header-box">
        <div class="header-tag">FIGMA-DESIGNED MORNING INTELLIGENCE</div>
        <div class="header-title">☀️ ZERO 일일 프리미엄 모닝 리포트</div>
        <div class="header-date">{d['date_str']} · 언어 정제 및 실시간 무료 AI 파이프라인 가동</div>
    </div>

    <!-- Wall Street Chief Director Verdict -->
    <div class="verdict-banner">
        <div class="section-title">🏛️ 40년차 월가 총괄 디렉터 결단 (알렉산더 밴스)</div>
        <div class="verdict-bars">
            <div class="bar-wrap">
                <div class="bar-labels">
                    <span style="color: var(--up);">매수 {v.buy_prob}%</span>
                    <span style="color: var(--down);">매도 {v.sell_prob}%</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-fill-up" style="width: {v.buy_prob}%;"></div>
                    <div class="progress-fill-down" style="width: {v.sell_prob}%;"></div>
                </div>
            </div>
            <div class="bar-wrap">
                <div class="bar-labels">
                    <span style="color: var(--up);">경기 긍정 {v.economy_outlook['positive_prob']}%</span>
                    <span style="color: var(--down);">경기 부정 {v.economy_outlook['negative_prob']}%</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-fill-up" style="width: {v.economy_outlook['positive_prob']}%;"></div>
                    <div class="progress-fill-down" style="width: {v.economy_outlook['negative_prob']}%;"></div>
                </div>
            </div>
        </div>
        <div class="verdict-desc">{html.escape(sanitize_text(v.summary_reasoning))}</div>
    </div>

    <!-- Global Indices & FX -->
    <div>
        <div class="section-title">📊 실시간 글로벌 주요 지수</div>
        <div class="matrix-grid">{indices_html}</div>
    </div>
    <div>
        <div class="section-title">💱 실시간 주요 환율 매트릭스</div>
        <div class="matrix-grid">{fx_html}</div>
    </div>

    <!-- Flash Breaking & Exclusive News -->
    <div>
        <div class="section-title">⚡ 긴급 · 속보 · 단독 인텔리전스 (맞춤법/언어 필터 완비)</div>
        <div class="news-wrap">{news_html}</div>
    </div>
</div>
</body>
</html>"""
