/* ZERO 화면의 계산 규칙. DOM과 네트워크를 쓰지 않아 Node에서 그대로 검사한다.
   값이 없거나 형식이 틀리면 null을 돌려주고, 화면은 그 칸을 비운다(추정으로 채우지 않는다). */
(() => {
  'use strict';

  const DAY_MS = 86400000;

  function num(value) {
    if (value === null || value === undefined || value === '') return NaN;
    return Number(value);
  }

  // 소수 둘째 자리에서 자른다(반올림하지 않는다). 3.9 - 4.3 같은 부동소수점 잡음은 먼저 걷어 낸다.
  function cut2(value) {
    return Math.trunc(Math.round(value * 1e6) / 1e4) / 100;
  }

  function direction(value) {
    return value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  }

  function signed(value, digits = 2) {
    const body = Math.abs(cut2(value)).toLocaleString('ko-KR', {minimumFractionDigits: digits, maximumFractionDigits: digits});
    return (value > 0 ? '+' : value < 0 ? '-' : '') + body;
  }

  // 차이를 부호와 함께, 소수는 필요한 만큼만(최대 둘째 자리).
  function diffText(value) {
    if (!Number.isFinite(value)) return null;
    const body = Math.abs(cut2(value)).toLocaleString('ko-KR', {maximumFractionDigits: 2});
    return (value > 0 ? '+' : value < 0 ? '-' : '') + body;
  }

  function percentText(value) {
    return Number.isFinite(value) ? signed(value) + '%' : null;
  }

  // 원화 금액: 1억 이상은 조·억, 그 아래는 원 단위 그대로.
  function wonText(value) {
    if (!Number.isFinite(value)) return null;
    const sign = value < 0 ? '-' : '', abs = Math.abs(Math.trunc(value));
    if (abs >= 1e12) {
      const jo = Math.floor(abs / 1e12), eok = Math.floor((abs % 1e12) / 1e8);
      return sign + jo.toLocaleString('ko-KR') + '조' + (eok ? ' ' + eok.toLocaleString('ko-KR') + '억' : '') + '원';
    }
    if (abs >= 1e8) {
      const eok = Math.floor(abs / 1e8), man = Math.floor((abs % 1e8) / 1e4);
      return sign + eok.toLocaleString('ko-KR') + '억' + (man ? ' ' + man.toLocaleString('ko-KR') + '만' : '') + '원';
    }
    return sign + abs.toLocaleString('ko-KR') + '원';
  }

  function priceText(value, currency) {
    if (!Number.isFinite(value)) return null;
    if (currency === 'USD') return '$' + cut2(value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return Math.trunc(value).toLocaleString('ko-KR') + '원';
  }

  // ---- 장 운영 시간 ---------------------------------------------------------------------------
  function offsetMinutes(timeZone, ms) {
    const formatter = new Intl.DateTimeFormat('en-US', {timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'});
    const parts = Object.fromEntries(formatter.formatToParts(new Date(ms)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
    const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return Math.round((local - Math.floor(ms / 1000) * 1000) / 60000);
  }

  function localClock(timeZone, ms) {
    const local = new Date(ms + offsetMinutes(timeZone, ms) * 60000);
    return {day: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes()};
  }

  function hhmm(minutes) {
    const wrapped = ((minutes % 1440) + 1440) % 1440;
    return String(Math.floor(wrapped / 60)).padStart(2, '0') + ':' + String(wrapped % 60).padStart(2, '0');
  }

  // 국내 정규장 09:00~15:30(평일), 미국 정규장 현지 09:30~16:00(평일). 공휴일과 임시 휴장은 반영하지 않는다.
  function sessions(ms = Date.now()) {
    const kr = localClock('Asia/Seoul', ms), us = localClock('America/New_York', ms);
    const gap = offsetMinutes('Asia/Seoul', ms) - offsetMinutes('America/New_York', ms);
    const weekday = (day) => day >= 1 && day <= 5;
    return {
      kr: {open: weekday(kr.day) && kr.minutes >= 540 && kr.minutes < 930, hours: '09:00~15:30'},
      us: {open: weekday(us.day) && us.minutes >= 570 && us.minutes < 960, hours: hhmm(570 + gap) + '~' + hhmm(960 + gap)}
    };
  }

  // ---- 내 주식 다시 계산 ----------------------------------------------------------------------
  // 미국 종목은 긴 상품명 대신 코드로 부른다. 한국 종목은 이름, 이름이 없으면 코드.
  function holdingName(row) {
    return row.market === 'US' ? row.symbol : row.name || row.symbol;
  }

  // quotes: Map('KR:005930' -> {price, previousClose}). fx: 원/달러. 한 종목이라도 시세가 없으면 null.
  function reprice(scope, quotes, fx) {
    if (scope?.state !== 'REFERENCE' || !Array.isArray(scope.holdings) || !scope.holdings.length) return null;
    const capital = num(scope.capital_krw), funds = scope.remaining_funds_by_currency || {};
    const cashKrw = num(funds.KRW), cashUsd = num(funds.USD);
    if (!(capital > 0) || !Number.isFinite(cashKrw) || !Number.isFinite(cashUsd)) return null;
    const needsFx = cashUsd !== 0 || scope.holdings.some((row) => row.currency === 'USD');
    if (needsFx && !(fx > 0)) return null;

    const rows = [];
    let held = 0, today = 0, todayKnown = true;
    for (const row of scope.holdings) {
      const quote = quotes.get(row.market + ':' + row.symbol);
      const price = num(quote?.price), quantity = num(row.quantity), average = num(row.average_price);
      if (!(price > 0) || !(quantity > 0) || !['KRW', 'USD'].includes(row.currency)) return null;
      const rate = row.currency === 'USD' ? fx : 1, valueKrw = price * quantity * rate;
      const previous = num(quote.previousClose);
      const dayChange = previous > 0 ? (price / previous - 1) * 100 : null;
      if (dayChange === null) todayKnown = false; else today += (price - previous) * quantity * rate;
      held += valueKrw;
      rows.push({
        id: row.market + ':' + row.symbol, name: holdingName(row), market: row.market, currency: row.currency,
        quantity, price, average: average > 0 ? average : null, valueKrw,
        returnPercent: average > 0 ? (price / average - 1) * 100 : null,
        dayChangePercent: dayChange
      });
    }
    const cash = cashKrw + cashUsd * (needsFx ? fx : 0), total = held + cash;
    rows.sort((a, b) => b.valueKrw - a.valueKrw);
    rows.forEach((row) => { row.weight = row.valueKrw / total * 100; });
    return {
      rows, held, cash, total, capital,
      gain: total - capital, returnPercent: (total / capital - 1) * 100,
      todayPnl: todayKnown ? today : null, todayPercent: todayKnown && total - today > 0 ? today / (total - today) * 100 : null
    };
  }

  // 저장된 화면 값만으로 만든 내 주식(시세를 새로 못 받았을 때).
  function savedPortfolio(scope) {
    if (scope?.state !== 'REFERENCE' || !Array.isArray(scope.holdings)) return null;
    const total = num(scope.total_value_krw), capital = num(scope.capital_krw);
    if (!(total > 0) || !(capital > 0)) return null;
    const rows = scope.holdings.map((row) => {
      const average = num(row.average_price), price = num(row.current_price), valueKrw = num(row.market_value_krw);
      return {
        id: row.market + ':' + row.symbol, name: holdingName(row), market: row.market, currency: row.currency,
        quantity: num(row.quantity), price, average: average > 0 ? average : null, valueKrw,
        returnPercent: average > 0 && price > 0 ? (price / average - 1) * 100 : null, dayChangePercent: null,
        weight: valueKrw / total * 100
      };
    }).filter((row) => Number.isFinite(row.valueKrw)).sort((a, b) => b.valueKrw - a.valueKrw);
    return {
      rows, held: num(scope.holdings_value_krw), cash: num(scope.remaining_funds_krw), total, capital,
      gain: total - capital, returnPercent: (total / capital - 1) * 100, todayPnl: null, todayPercent: null
    };
  }

  // ---- 그림용 좌표 ----------------------------------------------------------------------------
  // 숫자 배열을 작은 선 그래프 좌표로. 유효한 값이 두 개 미만이면 null.
  function sparkPoints(values, width = 96, height = 28, pad = 3) {
    const clean = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
    if (clean.length < 2) return null;
    const low = Math.min(...clean), high = Math.max(...clean), span = high - low || 1;
    return clean.map((value, index) => [
      pad + (width - 2 * pad) * index / (clean.length - 1),
      pad + (height - 2 * pad) * (1 - (value - low) / span)
    ]);
  }

  function historyValues(history) {
    return (Array.isArray(history) ? history : [])
      .filter((row) => typeof row?.period === 'string' && Number.isFinite(num(row.value)))
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((row) => Number(row.value));
  }

  // 직전 발표 대비 변화(같은 단위의 차이).
  function trendOf(latest, previous) {
    const a = num(latest), b = num(previous);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const diff = cut2(a - b);
    return {dir: direction(diff), diff};
  }

  // 최신 값이 과거 가운데 50% 범위(p25~p75)의 어디쯤인지. 눈금은 그 범위를 양옆으로 한 칸씩 넓힌다.
  function gauge(latest, statistics) {
    const value = num(latest), p25 = num(statistics?.p25), p75 = num(statistics?.p75);
    if (!statistics?.available || ![value, p25, p75].every(Number.isFinite) || !(p75 > p25)) return null;
    const room = p75 - p25, low = p25 - room, high = p75 + room;
    const zone = value < p25 ? 'low' : value > p75 ? 'high' : 'mid';
    return {
      pos: Math.min(1, Math.max(0, (value - low) / (high - low))),
      left: (p25 - low) / (high - low), right: (p75 - low) / (high - low), zone,
      label: {low: '평소보다 낮아요', mid: '평소 범위예요', high: '평소보다 높아요'}[zone]
    };
  }

  // ---- 일정 -----------------------------------------------------------------------------------
  // 다음 발표일이 확인된 지표만, 가까운 순서로. 지난 일정은 뺀다.
  function upcoming(macro, now = Date.now(), limit = 6) {
    return (Array.isArray(macro) ? macro : [])
      .map((item) => ({id: item.id, name: item.name, country: item.country, at: Date.parse(item.next_release_kst)}))
      .filter((item) => Number.isFinite(item.at) && item.at >= now - DAY_MS / 2)
      .sort((a, b) => a.at - b.at)
      .slice(0, limit)
      .map((item) => ({...item, days: daysUntil(item.at, now)}));
  }

  // 한국 날짜 기준으로 며칠 남았는지(오늘이면 0).
  function daysUntil(at, now = Date.now()) {
    const dayIndex = (ms) => Math.floor((ms + 9 * 3600000) / DAY_MS);
    return dayIndex(at) - dayIndex(now);
  }

  function ddayText(days) {
    return days <= 0 ? '오늘' : days === 1 ? '내일' : days + '일 뒤';
  }

  function ageText(date, now = Date.now()) {
    const time = Date.parse(date);
    if (!Number.isFinite(time)) return null;
    const minutes = Math.floor((now - time) / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return minutes + '분 전';
    if (minutes < 1440) return Math.floor(minutes / 60) + '시간 전';
    const days = Math.floor(minutes / 1440);
    if (days <= 30) return days + '일 전';
    return days > 365 ? Math.floor(days / 365) + '년 전' : Math.floor(days / 30) + '개월 전';
  }

  // ---- 자료 검증 ------------------------------------------------------------------------------
  const RANK_KINDS = {VOLUME: '거래량', UP: '급상승', DOWN: '급하락', FOREIGN: '외국인 순매수', INSTITUTION: '기관 순매수', AMOUNT: '거래대금'};
  const RANK_MARKETS = {KOSPI: '코스피', KOSDAQ: '코스닥', ALL: '전체'};

  function validRank(data) {
    if (data?.schema_version !== 1 || data.scope !== 'PUBLIC_MARKET_RANK' || data.orders_authorized !== false || !Array.isArray(data.lists)) return null;
    const lists = data.lists
      .filter((entry) => RANK_KINDS[entry?.kind] && RANK_MARKETS[entry.market] && Array.isArray(entry.items))
      .map((entry) => ({
        market: entry.market, kind: entry.kind,
        items: entry.items.filter((item) => /^[0-9A-Z]{6}$/.test(item?.code) && typeof item.name === 'string' && item.name
          && Number.isFinite(item.price) && item.price > 0 && Number.isFinite(item.change_rate)).slice(0, 10)
      }))
      .filter((entry) => entry.items.length);
    if (!lists.length) return null;
    return {lists, retrievedAt: data.retrieved_at, source: data.source?.label || null};
  }

  // /api/market/quote 응답을 Map('KR:005930' -> {price, previousClose, changePercent, name, currency, at})로.
  function quoteMap(data) {
    const map = new Map();
    Object.values(data?.quotes || {}).forEach((quote) => {
      const price = num(quote?.current_price);
      if (!/^(KR:[0-9A-Z]{6}|US:[A-Z][A-Z0-9.-]{0,14})$/.test(quote?.identity) || !(price > 0)) return;
      const previous = num(quote.previous_close);
      map.set(quote.identity, {
        price, previousClose: previous > 0 ? previous : null,
        changePercent: previous > 0 ? (price / previous - 1) * 100 : null,
        name: quote.name || null, currency: quote.currency === 'USD' ? 'USD' : 'KRW', at: quote.market_time || null
      });
    });
    return map;
  }

  // /api/live-quotes 응답(보유 종목 전용)을 같은 Map 모양으로.
  function liveQuoteMap(data) {
    const map = new Map();
    (Array.isArray(data?.quotes) ? data.quotes : []).forEach((quote) => {
      const price = num(quote?.price), previous = num(quote.previous_close);
      if (!['KR', 'US'].includes(quote?.market) || !quote.symbol || !(price > 0)) return;
      map.set(quote.market + ':' + quote.symbol, {
        price, previousClose: previous > 0 ? previous : null,
        changePercent: previous > 0 ? (price / previous - 1) * 100 : null,
        name: null, currency: quote.currency === 'USD' ? 'USD' : 'KRW', at: quote.market_time || null
      });
    });
    return map;
  }

  // ---- 검색 -----------------------------------------------------------------------------------
  // 이름이나 코드로 찾는다. 앞에서 맞으면 먼저, 그다음 이름 길이가 짧은 순.
  function searchCompanies(companies, query, limit = 8) {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return [];
    const scored = [];
    (Array.isArray(companies) ? companies : []).forEach((company) => {
      const name = String(company?.name || '').toLowerCase(), symbol = String(company?.symbol || '').toLowerCase();
      if (!company?.id || (!name && !symbol)) return;
      const rank = symbol === needle ? 0 : name.startsWith(needle) || symbol.startsWith(needle) ? 1 : name.includes(needle) ? 2 : -1;
      if (rank >= 0) scored.push({rank, company});
    });
    scored.sort((a, b) => a.rank - b.rank || String(a.company.name).length - String(b.company.name).length || String(a.company.id).localeCompare(String(b.company.id)));
    return scored.slice(0, limit).map((entry) => entry.company);
  }

  // ---- 계산기 ---------------------------------------------------------------------------------
  // 매달 첫 거래일에 같은 금액을 샀을 때와 처음에 한 번에 샀을 때. bars: [{at, close}] 과거순.
  function savingsPlan(bars, amount) {
    if (!Array.isArray(bars) || !(amount > 0)) return null;
    const rows = bars.filter((bar) => Number.isFinite(bar?.close) && bar.close > 0 && typeof bar.at === 'string');
    const buyAt = new Set(), seen = new Set();
    rows.forEach((bar, index) => {
      const month = bar.at.slice(0, 7);
      if (!seen.has(month)) { seen.add(month); buyAt.add(index); }
    });
    if (buyAt.size < 2) return null;
    let invested = 0, shares = 0;
    const lumpShares = amount * buyAt.size / rows[0].close;
    const points = rows.map((bar, index) => {
      if (buyAt.has(index)) { invested += amount; shares += amount / bar.close; }
      return {at: bar.at, invested, plan: shares * bar.close, lump: lumpShares * bar.close};
    });
    const last = points[points.length - 1];
    const planReturn = (last.plan / last.invested - 1) * 100, lumpReturn = (last.lump / last.invested - 1) * 100;
    return {
      points, months: buyAt.size, invested: last.invested, planValue: last.plan, lumpValue: last.lump, planReturn, lumpReturn,
      averageCost: last.invested / shares,
      winner: Math.abs(planReturn - lumpReturn) < 0.005 ? 'tie' : planReturn > lumpReturn ? 'plan' : 'lump'
    };
  }

  // 물타기: 지금 가진 것에 더 샀을 때 평균 단가와, 본전까지 필요한 상승률.
  function averageDown(heldPrice, heldQuantity, buyPrice, buyQuantity) {
    const values = [heldPrice, heldQuantity, buyPrice, buyQuantity].map(num);
    if (!values.every((value) => Number.isFinite(value) && value > 0)) return null;
    const [p1, q1, p2, q2] = values, quantity = q1 + q2, average = (p1 * q1 + p2 * q2) / quantity;
    return {
      average, quantity, cost: p2 * q2,
      beforeNeeded: (p1 / p2 - 1) * 100,
      afterNeeded: (average / p2 - 1) * 100
    };
  }

  const api = {
    num, cut2, direction, signed, diffText, percentText, wonText, priceText, sessions, reprice, savedPortfolio, sparkPoints, historyValues,
    trendOf, gauge, upcoming, daysUntil, ddayText, ageText, validRank, quoteMap, liveQuoteMap, searchCompanies, savingsPlan, averageDown,
    RANK_KINDS, RANK_MARKETS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ZeroCore = api;
})();
