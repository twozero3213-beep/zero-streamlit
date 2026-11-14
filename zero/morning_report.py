# -*- coding: utf-8 -*-
"""피그마(Figma) 스타일의 세련된 모던 아침 보고서(Morning Report) 생성 엔진.

특징:
1. 오탈자 및 맞춤법 교정 완료 (zero.language_filter)
2. 한글과 영어만 노출 (타 언어 완전 배제)
3. 공개 글로벌 지수 및 환율 보드 연동 (zero.realtime_market_pulse)
4. 긴급·속보·단독 기사 공신력 우선 선별 및 무료 범용 AI 툴 요약 (zero.free_universal_ai)
5. 가상 검토 관점의 자료 확인 상태와 HOLD 안내
6. 검증된 추천 자료가 없을 때 종목 선정을 보류
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
        indices = custom_indices if custom_indices is not None else pulse["indices"]
        fx_rates = custom_fx if custom_fx is not None else pulse["fx_rates"]

        # 1-1. 실시간 주요 종목 시세 (토스·한투·네이버 연동)
        stock_quotes = []
        try:
            from zero.realtime_stock_quote import fetch_multiple_quotes
            raw_quotes = fetch_multiple_quotes(["005930", "000660", "NVDA", "SPY"])
            for sym in ["005930", "000660", "NVDA", "SPY"]:
                if sym in raw_quotes:
                    stock_quotes.append(raw_quotes[sym])
        except Exception:
            pass

        # 2. 긴급/속보/단독 뉴스 정제 및 무료 범용 AI 요약
        engine = BreakingNewsEngine(max_output_items=10)
        raw_news = news_items if news_items is not None else []

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

        # 3. 가상 검토 관점
        verdict = get_chief_director_verdict("MARKET_OVERALL")

        # 4. 추천 자료 확인
        rec_data = get_daily_25_recommendations()

        # 5. 거시경제 지표
        macro = macro_data if macro_data is not None else []

        return {
            "date_str": f"{self.at:%Y년 %m월 %d일}({WEEKDAYS[self.at.weekday()]}) {self.at:%H:%M} KST",
            "indices": indices,
            "fx_rates": fx_rates,
            "stock_quotes": stock_quotes,
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
        lines.append("> **제공된 공개 자료와 확인 상태를 정리한 아침 자산 브리핑입니다.**\n")

        # 1. 30초 핵심 Glance
        lines.append("## ⏱️ 1. 30초 모닝 펄스 (Executive Summary)")
        v = d["verdict"]
        lines.append("- **가상 검토 관점**: **HOLD · 자료 미검증**. 매수·매도·경기 전망 확률은 산출하지 않았습니다.")
        lines.append(f"- **시장 코어 코멘트**: {sanitize_text(v.summary_reasoning)}")
        lines.append("")

        # 2. 글로벌 지수 & 환율 보드
        lines.append("## 📊 2. 공개 글로벌 지수 & 외환 매트릭스")
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

        if d.get("stock_quotes"):
            lines.append("## 💎 2-1. 공개 종목 시세(자료별 출처·기준 시각 확인 필요)")
            lines.append("| 종목명 (티커) | 현재가 | 전일 대비 | 등락률 | 수신 출처 |")
            lines.append("|---|---|---|---|---|")
            for stk in d["stock_quotes"]:
                chg, rate = stk.get("change"), stk.get("change_percent")
                chg_known, rate_known = chg not in (None, ""), rate not in (None, "")
                chg_text = (("+" if chg > 0 else "") + f"{chg:,.2f}") if chg_known else "미확인"
                rate_text = (("+" if rate > 0 else "") + f"{rate:.2f}%") if rate_known else "미확인"
                curr_symbol = "원" if stk.get("currency") == "KRW" else "$"
                status = "미확인" if not chg_known else "🟢 상승" if chg > 0 else "🔴 하락" if chg < 0 else "⚪ 보합"
                src = stk.get("source", "LIVE")
                lines.append(f"| {sanitize_text(stk['name'])} ({stk['symbol']}) | {stk['current_price']:,.2f}{curr_symbol} | {chg_text} | {rate_text} | {src} ({status}) |")
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
            lines.append("- 공개 뉴스 자료가 확인되지 않았습니다.\n")

        # 4. 추천 자료 확인 전략 요약
        lines.append("## 🎯 4. 추천 자료 확인 상태")
        recs = d["recommendations"].get("recommendations", [])
        nasdaq = [r for r in recs if r.get("market") == "NASDAQ"][:3]
        kospi = [r for r in recs if r.get("market") == "KOSPI"][:2]
        kosdaq = [r for r in recs if r.get("market") == "KOSDAQ"][:2]
        etf = [r for r in recs if r.get("market") == "ETF"][:2]

        if recs:
            lines.append("- **나스닥(NASDAQ) 주요 픽**: " + ", ".join(f"{r['name']}({r['symbol']})" for r in nasdaq))
            lines.append("- **코스피(KOSPI) 주요 픽**: " + ", ".join(f"{r['name']}({r['symbol']})" for r in kospi))
            lines.append("- **코스닥(KOSDAQ) 주요 픽**: " + ", ".join(f"{r['name']}({r['symbol']})" for r in kosdaq))
            lines.append("- **글로벌 ETF 주요 픽**: " + ", ".join(f"{r['name']}({r['symbol']})" for r in etf))
        else:
            lines.append("- 검증된 추천 자료가 없어 종목 선정을 보류했습니다.")
        lines.append("")

        # 5. 거시경제 점검 체크리스트
        lines.append("## 🛡️ 5. 거시경제 지표 & 리스크 점검 체크리스트")
        for m in d["macro"]:
            lines.append(f"- **{sanitize_text(m['name'])}**: {m['latest']} ({m['status']}) → *{m['impact']}*")
        lines.append("")

        lines.append("---")
        lines.append("※ 제공된 자료를 정리한 보고서입니다. 검증된 근거가 없는 관측값·확률·추천은 생성하지 않습니다.")

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

        indices_html = indices_html or "<p>지수 자료와 기준 시각을 확인하지 못했습니다.</p>"
        fx_html = fx_html or "<p>환율 자료와 기준 시각을 확인하지 못했습니다.</p>"

        stocks = []
        for stk in d.get("stock_quotes", []):
            chg, rate = stk.get("change"), stk.get("change_percent")
            chg_known, rate_known = chg not in (None, ""), rate not in (None, "")
            chg_text = (("+" if chg > 0 else "") + f"{chg:,.2f}") if chg_known else "미확인"
            rate_text = (("+" if rate > 0 else "") + f"{rate:.2f}%") if rate_known else "미확인"
            tone = "up" if chg_known and chg > 0 else "down" if chg_known and chg < 0 else "flat"
            status = "미확인" if not chg_known else "상승" if chg > 0 else "하락" if chg < 0 else "보합"
            stocks.append(f"""
            <div class="matrix-card">
                <div class="card-label">{html.escape(sanitize_text(stk['name']))} <span class="curr">({stk['symbol']})</span></div>
                <div class="card-val">{stk['current_price']:,.2f} <span class="curr">{stk['currency']}</span></div>
                <div class="card-delta {tone}">
                    {chg_text} ({rate_text}) · {status}
                </div>
                <div class="card-sub">{stk.get('source', 'LIVE')}</div>
            </div>
        """)
        stocks_html = "".join(stocks)

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

        stocks_html = stocks_html or "<p>종목 시세와 기준 시각을 확인하지 못했습니다.</p>"
        news_html = news_html or "<p>공개 뉴스 자료를 확인하지 못했습니다.</p>"

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
        <div class="header-date">{d['date_str']} · 보고서 작성 시각 · 자료별 기준 시각은 별도 확인 필요</div>
    </div>

    <!-- Simulated review role -->
    <div class="verdict-banner">
        <div class="section-title">가상 검토 관점</div>
        <p>HOLD · 자료 미검증. 매수·매도·경기 전망 확률은 산출하지 않았습니다.</p>
        <div class="verdict-desc">{html.escape(sanitize_text(v.summary_reasoning))}</div>
    </div>

    <!-- Global Indices & FX -->
    <div>
        <div class="section-title">📊 공개 글로벌 주요 지수</div>
        <div class="matrix-grid">{indices_html}</div>
    </div>
    <div>
        <div class="section-title">💱 공개 환율 매트릭스</div>
        <div class="matrix-grid">{fx_html}</div>
    </div>
    <div>
        <div class="section-title">💎 공개 종목 시세(자료별 출처·기준 시각 확인 필요)</div>
        <div class="matrix-grid">{stocks_html}</div>
    </div>

    <!-- Flash Breaking & Exclusive News -->
    <div>
        <div class="section-title">⚡ 긴급 · 속보 · 단독 인텔리전스 (맞춤법/언어 필터 완비)</div>
        <div class="news-wrap">{news_html}</div>
    </div>
</div>
</body>
</html>"""
