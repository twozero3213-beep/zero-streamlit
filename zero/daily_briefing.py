"""Automatic daily briefing: public numbers and headlines only, no AI commentary.

It is the fallback that keeps a briefing arriving every day when nobody (no AI session) wrote one. The text
reprices ZERO's reference holdings with public delayed quotes (the same formula as the website's refresh),
lists the latest official macro observations saved in the research desk, and collects fresh headlines from
public news feeds. It gives no forecast, trade, allocation or risk-limit advice and has no order, account
or recipient authority; delivery is zero.daily_delivery's job.
"""
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import re
from urllib.parse import quote
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from zero.language_filter import sanitize_text

KST = timezone(timedelta(hours=9))
FEEDS = (('미국', 'stock market OR S&P 500 OR Federal Reserve OR Treasury yields when:1d', 'hl=en-US&gl=US&ceid=US:en'),
         ('한국', '코스피 OR 증시 OR 환율 OR 금리 when:1d', 'hl=ko&gl=KR&ceid=KR:ko'))
FEED_LIMIT = 2_000_000
WEEKDAYS = '월화수목금토일'
MACRO_FIRST = ('VIXCLS', 'DGS10', 'DGS2', 'US_CPI', 'US_PAYROLL', 'US_UNEMPLOYMENT', 'KR_CPI', 'KR_UNEMPLOYMENT')
LIMITS = ('가격 기준 참고 평가입니다. 수수료·세금·배당·환율 손익과 실제 결제 현금은 반영하지 않았습니다.',
          '시세는 공개 제공자의 지연 값일 수 있고, 거시 지표는 공식 발표 시점까지의 마지막 관측입니다.',
          '헤드라인은 검색 결과 제목만 모은 것이며 본문을 읽거나 사실을 검증한 것이 아닙니다.',
          'AI 해설·전망·매매 판단은 없습니다. 주문·리밸런싱·손실 한도 승인 권한도 없습니다.')


def _number(value):
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if number == number and abs(number) != float('inf') else None


def live_portfolio(portfolio, live):
    """Reprice the saved reference holdings; None unless every quote and the FX rate are present."""
    scope = ((portfolio or {}).get('summary') or {}).get('zero_portfolio') or {}
    quotes = {f"{q.get('market')}:{q.get('symbol')}": q for q in (live or {}).get('quotes') or []}
    funds, capital = scope.get('remaining_funds_by_currency') or {}, _number(scope.get('capital_krw'))
    fx = _number(((live or {}).get('fx') or {}).get('usd_krw'))
    holdings = scope.get('holdings')
    if scope.get('state') != 'REFERENCE' or not holdings or not capital or capital <= 0 or not isinstance(holdings, list):
        return None
    cash = {currency: _number(funds.get(currency)) for currency in ('KRW', 'USD')}
    if None in cash.values() or (cash['USD'] or any(row.get('market') == 'US' for row in holdings)) and not (fx and fx > 0):
        return None
    rows, held = [], 0.0
    for row in holdings:
        quote = quotes.get(f"{row.get('market')}:{row.get('symbol')}") or {}
        price, quantity, saved = _number(quote.get('price')), _number(row.get('quantity')), _number(row.get('current_price'))
        currency = row.get('currency')
        if currency not in ('KRW', 'USD') or quote.get('currency') != currency or not price or price <= 0 or not quantity or quantity <= 0:
            return None
        value_krw = quantity * price * (fx if currency == 'USD' else 1)
        held += value_krw
        rows.append({'name': row.get('name') or row.get('symbol'), 'symbol': row.get('symbol'), 'currency': currency, 'price': price,
                     'value_krw': value_krw, 'change_percent': (price / saved - 1) * 100 if saved and saved > 0 else None})
    total = held + cash['KRW'] + cash['USD'] * (fx or 0)
    for row in rows:
        row['weight_percent'] = row['value_krw'] / total * 100
    times = sorted(q['market_time'] for q in quotes.values() if q.get('market_time'))
    return {'total_krw': total, 'gain_krw': total - capital, 'return_percent': (total / capital - 1) * 100, 'fx': fx, 'rows': rows,
            'oldest_market_time': times[0] if times else None, 'newest_market_time': times[-1] if times else None}


def macro_rows(desk, limit=8):
    """Latest official observations, the market-moving ones first."""
    rows = {row.get('id'): row for row in (desk or {}).get('macro') or [] if isinstance(row, dict)}
    order = [key for key in MACRO_FIRST if key in rows] + [key for key in rows if key not in MACRO_FIRST]
    return [{'name': rows[key].get('name') or key, 'unit': rows[key].get('unit') or '', 'value': rows[key].get('latest_value'),
             'previous': rows[key].get('previous_value'), 'period': rows[key].get('latest_period'),
             'limitations': rows[key].get('limitations') or [], 'retrieved_at': rows[key].get('retrieved_at')} for key in order[:limit]]


def _clean(text):
    """One markdown-safe line: the report renderer treats | [ ] * specially."""
    return re.sub(r'\s+', ' ', re.sub(r'[|*\[\]]', lambda m: {'|': '/', '[': '(', ']': ')'}.get(m.group(), ''), text or '')).strip()


def _fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0 ZERO-Briefing/1'}), timeout=20) as response:
        return response.read(FEED_LIMIT)


def headlines(at, *, fetch=_fetch, per_feed=4, max_age_hours=36):
    """Fresh headlines per market as dicts; a feed that fails yields no rows and is reported in `failed`."""
    found, failed = [], []
    for market, query, parameters in FEEDS:
        try:
            root = ET.fromstring(fetch(f'https://news.google.com/rss/search?q={quote(query)}&{parameters}'))
        except Exception:
            failed.append(market)
            continue
        rows = []
        for item in root.iter('item'):
            link, title = (item.findtext('link') or '').strip(), sanitize_text(_clean(item.findtext('title')))
            source = sanitize_text(_clean(item.findtext('source')))
            try:
                published = parsedate_to_datetime(item.findtext('pubDate') or '').astimezone(KST)
            except (TypeError, ValueError):
                continue
            if not link.startswith('https://') or not title or not 0 <= (at - published).total_seconds() <= max_age_hours * 3600:
                continue
            if source and title.endswith(' - ' + source):
                title = title[:-len(source) - 3]
            rows.append({'market': market, 'title': title, 'publisher': source or '출처 미표시', 'link': link, 'published_at': published})
        found.extend(sorted(rows, key=lambda r: r['published_at'], reverse=True)[:per_feed])
    return found, failed


def _plain(value):
    """An observation as shown to a reader: at most 2 decimals, '—' when absent."""
    number = _number(value)
    return '—' if value in (None, '', 'None') else f'{number:,.2f}'.rstrip('0').rstrip('.') if number is not None else _clean(str(value))


def _won(value):
    return f'{value:,.0f}원'


def _signed(value, digits=2):
    return f'{value:+,.{digits}f}'


def build(at, *, live=None, saved=None, macro=(), news=(), failed=()):
    """Return (report, kakao_summary). `live` is live_portfolio()'s result, `saved` the saved reference scope."""
    day = at.astimezone(KST)
    lines = [f'**ZERO 자동 브리핑 · {day:%Y-%m-%d}({WEEKDAYS[day.weekday()]}) {day:%H:%M} KST**', '',
             '공개 자료의 숫자와 헤드라인을 자동으로 모은 보고서입니다. AI 해설·전망·매매 판단은 없습니다.', '', '**1. ZERO 참고 포트폴리오**', '']
    if live:
        times = f"{live['oldest_market_time'][:16].replace('T', ' ')} ~ {live['newest_market_time'][:16].replace('T', ' ')} UTC" if live['oldest_market_time'] else '미확인'
        lines += ['| 항목 | 값 |', '|---|---|', f"| 추정 평가금액 | {_won(live['total_krw'])} |",
                  f"| 시작 원금 대비 | {_signed(live['return_percent'])}% ({_signed(live['gain_krw'], 0)}원) |",
                  f"| 환율(USD/KRW) | {live['fx']:,.2f} |", f'| 시세 시각 | {times} |', '',
                  '| 종목 | 비중 | 현재가 | 저장 기준가 대비 |', '|---|---|---|---|']
        for row in sorted(live['rows'], key=lambda r: -r['weight_percent']):
            move = '—' if row['change_percent'] is None else f"{_signed(row['change_percent'])}%"
            lines.append(f"| {_clean(row['name'])} | {row['weight_percent']:.1f}% | {row['price']:,.2f} {row['currency']} | {move} |")
    elif saved:
        amount = _number(saved.get('total_value_krw'))
        saved_value = _won(amount) if amount is not None and amount >= 0 else '미확인'
        lines += ['실시간 시세를 가져오지 못해 마지막 저장 기준을 표시합니다.', '', '| 항목 | 값 |', '|---|---|',
                  f"| 저장 평가금액 | {saved_value} |", f"| 기준 시각 | {_clean(str(saved.get('observed_at') or '미확인'))} |"]
    else:
        lines.append('포트폴리오 자료를 확인하지 못했습니다.')
    lines += ['', '**2. 거시 지표 (공식 원천 최신 관측)**', '']
    if macro:
        lines += ['| 지표 | 최신 | 이전 | 기간 |', '|---|---|---|---|'] + [
            f"| {_clean(row['name'])} | {_plain(row['value'])} {_clean(row['unit'])} | {_plain(row['previous'])} | {_clean(str(row['period']))} |" for row in macro]
    else:
        lines.append('저장된 거시 지표를 읽지 못했습니다.')
    for row in macro:
        if 'RECENT_PUBLIC_SOURCE_UPDATE_FAILED' in row.get('limitations', []):
            lines.append(f"- {_clean(row['name'])}: 갱신 실패 · 이전 저장값입니다. 원래 조회 시각: {_clean(str(row.get('retrieved_at') or '미확인'))}")
    lines += ['', '**3. 헤드라인 (자동 수집, 최근 36시간)**', '']
    lines += [f"- [{row['title']}]({row['link']}) · {row['publisher']} · {row['published_at']:%m-%d %H:%M}" for row in news] or ['수집된 헤드라인이 없습니다.']
    if failed:
        lines += ['', '- 수집 실패: ' + ', '.join(failed)]
    lines += ['', '**4. 한계**', ''] + ['- ' + text for text in LIMITS]
    parts = [f'ZERO 자동 브리핑 {day:%m/%d}']
    if live:
        parts.append(f"평가 {live['total_krw'] / 1e6:,.1f}백만원({_signed(live['return_percent'])}%)")
    vix = next((r for r in macro if r['name'].startswith('VIX')), None)
    if vix:
        parts.append(f"VIX {_plain(vix['value'])}")
    if news:  # a Korean headline reads best on KakaoTalk; fall back to the first one
        title = next((r for r in news if r['market'] == '한국'), news[0])['title']
        parts.append(title if len(title) <= 40 else title[:39] + '…')
    return '\n'.join(lines), (' · '.join(parts + ['상세는 메일'])[:180])
