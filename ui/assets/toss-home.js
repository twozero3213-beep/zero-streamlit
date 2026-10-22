/* 홈 화면: 지금 시장이 열렸는지, 지수, 다가오는 발표 일정, 실시간 순위(거래량·급상승·급하락·외국인·기관), 하트로 담는 관심 종목.
   토스증권처럼 "열자마자 오늘 시장이 보이는" 홈이다. 순위는 공개 앱의 /api/market-rank가 있을 때만 나오고, 없으면 그 칸만 숨긴다.
   값을 못 읽으면 그림을 만들지 않는다(추정으로 채우지 않는다). 계산은 순수 함수에 있다. */
(() => {
  'use strict';
  const KINDS = {VOLUME: ['🔥', '거래량'], UP: ['📈', '급상승'], DOWN: ['📉', '급하락'], FOREIGN: ['🌏', '외국인 순매수'], INSTITUTION: ['🏢', '기관 순매수']};
  const MARKETS = {KOSPI: '코스피', KOSDAQ: '코스닥', ALL: '코스피·코스닥'};
  const ID = /^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[A-Z0-9]{6})$/;

  // 지정한 시간대가 UTC보다 몇 분 앞서는지. 서머타임까지 반영하려고 직접 계산한다.
  function offsetMinutes(timeZone, ms) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'})
      .formatToParts(new Date(ms)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
    return Math.round((Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(ms / 1000) * 1000) / 60000);
  }
  const clock = (timeZone, ms) => {
    const local = new Date(ms + offsetMinutes(timeZone, ms) * 60000);
    return {day: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes()};
  };
  const hhmm = (minutes) => String(Math.floor(((minutes % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((minutes % 60) + 60) % 60).padStart(2, '0');
  // 국내 정규장 09:00~15:30(KST, 평일), 미국 정규장 현지 09:30~16:00(평일). 공휴일·임시 휴장은 반영하지 않는다.
  function sessions(ms = Date.now()) {
    const kr = clock('Asia/Seoul', ms), us = clock('America/New_York', ms), gap = offsetMinutes('Asia/Seoul', ms) - offsetMinutes('America/New_York', ms);
    const weekday = (day) => day >= 1 && day <= 5;
    return {
      kr: {open: weekday(kr.day) && kr.minutes >= 540 && kr.minutes < 930, window: '09:00 ~ 15:30'},
      us: {open: weekday(us.day) && us.minutes >= 570 && us.minutes < 960, window: hhmm(570 + gap) + ' ~ ' + hhmm(960 + gap)}};
  }
  // 한국식 색: 오르면 빨강, 내리면 파랑.
  const direction = (rate) => (rate > 0 ? 'up' : rate < 0 ? 'down' : 'flat');
  const arrow = (rate) => ({up: '▲', down: '▼', flat: '■'}[direction(rate)]);
  const percent = (rate) => arrow(rate) + ' ' + Math.abs(rate).toFixed(2) + '%';
  function validRank(data) {
    if (data?.schema_version !== 1 || data.scope !== 'PUBLIC_MARKET_RANK' || data.orders_authorized !== false || data.amounts_included !== false
      || !Array.isArray(data.lists) || !Number.isFinite(Date.parse(data.retrieved_at))) return null;
    const lists = data.lists.filter((entry) => KINDS[entry?.kind] && MARKETS[entry.market] && Array.isArray(entry.items))
      .map((entry) => ({market: entry.market, kind: entry.kind, items: entry.items.filter((item) => /^[0-9A-Z]{6}$/.test(item?.code) && typeof item.name === 'string' && item.name
        && MARKETS[item.market] && item.market !== 'ALL' && Number.isFinite(item.price) && item.price > 0 && Number.isFinite(item.change_rate) && Number.isInteger(item.volume) && item.volume >= 0).slice(0, 10)}))
      .filter((entry) => entry.items.length);
    return lists.length ? {retrieved_at: data.retrieved_at, failed: Array.isArray(data.failed) ? data.failed : [], lists} : null;
  }
  // 한 목록 안에서 가장 큰 거래량을 100%로 둔 막대 길이. 거래량이 0이면 막대를 만들지 않는다.
  const barWidths = (items) => { const top = Math.max(...items.map((item) => item.volume), 0); return items.map((item) => (top ? Math.max(2, Math.round(item.volume / top * 100)) : 0)); };
  const medal = (index) => ['🥇', '🥈', '🥉'][index] || String(index + 1);
  const cleanIds = (raw) => (Array.isArray(raw) ? [...new Set(raw.filter((id) => typeof id === 'string' && ID.test(id)))].slice(0, 30) : []);
  // 순위 종류를 고르면 코스피·코스닥 구분이 필요한지(외국인·기관은 전체 시장 하나).
  const needsMarket = (kind) => ['VOLUME', 'UP', 'DOWN'].includes(kind);
  const api = {sessions, offsetMinutes, direction, arrow, percent, validRank, barWidths, medal, cleanIds, needsMarket, KINDS, MARKETS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.ZEROTossHome = api;

  const root = document.getElementById('toss-home');
  if (!root) return;
  const make = (tag, className = '', text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const kst = (iso) => new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(iso));
  const won = (value) => value.toLocaleString('ko-KR') + '원';
  const explore = () => window.ZEROExplore;
  const open = (id) => explore()?.openCompany?.(id);

  // ── 뼈대 ──
  const status = make('div', 'th-status'), indices = make('div', 'th-indices'), schedule = make('section', 'th-card th-schedule'), chart = make('section', 'th-card th-chart'), watch = make('section', 'th-card th-watch');
  schedule.setAttribute('aria-labelledby', 'th-schedule-title'); chart.setAttribute('aria-labelledby', 'th-chart-title'); watch.setAttribute('aria-labelledby', 'th-watch-title');
  const main = make('div', 'th-main'), side = make('aside', 'th-side');
  main.append(indices, schedule, chart); side.append(watch); root.append(status, make('div', 'th-grid'));
  root.querySelector('.th-grid').append(main, side);

  // ── 시장 상태 ──
  function paintStatus() {
    const s = sessions();
    const chip = (name, info) => { const e = make('span', 'th-chip ' + (info.open ? 'th-open' : 'th-closed')); e.append(make('i', 'th-dot'), make('span', '', name + ' ' + (info.open ? '열림' : '닫힘')), make('small', '', info.window)); return e; };
    status.replaceChildren(chip('국내 장', s.kr), chip('해외 정규장', s.us));
    status.title = '평일 정규장 시간 기준이며 공휴일·임시 휴장은 반영하지 않아요.';
  }

  // ── 지수 ──
  function paintIndices() {
    const data = window.ZEROAnalysis?.current?.();
    const rows = (data?.indices || []).filter((row) => row.state !== 'UNAVAILABLE' && Number.isFinite(row.price) && Number.isFinite(row.change_percent));
    indices.hidden = !rows.length;
    indices.replaceChildren(...rows.map((row) => {
      const card = make('div', 'th-index th-' + direction(row.change_percent)), name = make('small', '', row.name);
      card.append(name, make('strong', '', row.price.toLocaleString('ko-KR', {maximumFractionDigits: 2})), make('span', 'th-pct', percent(row.change_percent)));
      return card;
    }));
  }

  // ── 주요 일정 ──
  function paintSchedule() {
    const V = window.ZERODeskVisuals, items = window.ZERODesk?.macro?.() || [];
    const events = V ? V.upcoming(items, Date.now(), 14, (item) => window.ZERODesk?.macroCategory?.(item)).slice(0, 5) : [];
    const heading = make('h2', '', '🗓️ 주요 일정'); heading.id = 'th-schedule-title';
    if (!events.length) { schedule.replaceChildren(heading, make('p', 'muted-note', '14일 안에 예정된 발표가 없어요.')); return; }
    const list = make('ul', 'th-events');
    events.forEach((event) => {
      const row = make('li'), when = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(event.at));
      row.append(make('span', 'th-dday', event.dday === 0 ? '오늘' : event.dday === 1 ? '내일' : event.dday + '일 뒤'), make('span', 'th-event-icon', event.icon), make('strong', '', event.name), make('small', '', when));
      list.append(row);
    });
    schedule.replaceChildren(heading, list);
  }

  // ── 실시간 순위 ──
  let rank = null, rankState = 'LOADING', pick = {kind: 'VOLUME', market: 'KOSPI'}, rankLoading = false;
  const hearts = () => cleanIds(explore()?.favorites?.() || []);
  function heartButton(id, name) {
    const on = hearts().includes(id), button = make('button', 'th-heart' + (on ? ' th-on' : ''), on ? '♥' : '♡');
    button.type = 'button'; button.setAttribute('aria-pressed', String(on)); button.setAttribute('aria-label', name + ' 관심 종목' + (on ? ' 해제' : ' 담기'));
    button.addEventListener('click', () => {
      try { explore()?.toggleFavorite?.(id); } catch (error) { button.title = error.message === 'WATCHLIST_LIMIT' ? '관심 종목은 최대 30개예요.' : '저장하지 못했어요.'; }
      paintRank(); paintWatch();
    });
    return button;
  }
  function paintRank() {
    const heading = make('h2', '', '📊 실시간 차트'); heading.id = 'th-chart-title';
    if (rankState === 'HIDDEN') { chart.hidden = true; return; }
    chart.hidden = false;
    if (!rank) { chart.replaceChildren(heading, make('p', 'muted-note', rankState === 'LOADING' ? '순위를 불러오는 중이에요.' : '순위를 불러오지 못했어요. 잠시 뒤 다시 확인해요.')); return; }
    const has = (kind, market) => rank.lists.some((entry) => entry.kind === kind && (entry.market === market || entry.market === 'ALL'));
    if (!has(pick.kind, pick.market)) pick = {kind: rank.lists[0].kind, market: rank.lists[0].market === 'ALL' ? 'KOSPI' : rank.lists[0].market};
    const kinds = make('div', 'th-tabs'); kinds.setAttribute('role', 'group'); kinds.setAttribute('aria-label', '순위 종류');
    Object.keys(KINDS).filter((kind) => rank.lists.some((entry) => entry.kind === kind)).forEach((kind) => {
      const button = make('button', '', KINDS[kind][0] + ' ' + KINDS[kind][1]); button.type = 'button'; button.setAttribute('aria-pressed', String(kind === pick.kind));
      button.addEventListener('click', () => { pick.kind = kind; paintRank(); }); kinds.append(button);
    });
    const controls = [kinds];
    if (needsMarket(pick.kind)) {
      const markets = make('div', 'th-tabs th-markets'); markets.setAttribute('role', 'group'); markets.setAttribute('aria-label', '시장');
      ['KOSPI', 'KOSDAQ'].forEach((market) => { const button = make('button', '', MARKETS[market]); button.type = 'button'; button.setAttribute('aria-pressed', String(market === pick.market)); button.addEventListener('click', () => { pick.market = market; paintRank(); }); markets.append(button); });
      controls.push(markets);
    }
    const entry = rank.lists.find((row) => row.kind === pick.kind && (row.market === pick.market || row.market === 'ALL')), widths = barWidths(entry.items);
    const list = make('ol', 'th-list'); list.setAttribute('aria-label', KINDS[pick.kind][1] + ' 순위 ' + entry.items.length + '개');
    entry.items.forEach((item, index) => {
      const id = 'KR:' + item.code, row = make('li'), body = make('button', 'th-row'), name = make('span', 'th-name'), price = make('span', 'th-price'), bar = make('span', 'th-bar'), fill = make('i');
      body.type = 'button'; body.setAttribute('aria-label', item.name + ' 종목 보기'); body.addEventListener('click', () => open(id));
      name.append(make('strong', '', item.name), make('small', '', item.code + ' · ' + MARKETS[item.market]));
      price.append(make('strong', '', won(item.price)), make('span', 'th-pct th-' + direction(item.change_rate), percent(item.change_rate)));
      fill.style.width = widths[index] + '%'; bar.append(fill, make('span', '', '거래량 ' + item.volume.toLocaleString('ko-KR') + '주'));
      body.append(make('span', 'th-rank', medal(index)), name, price, bar);
      row.append(heartButton(id, item.name), body); list.append(row);
    });
    const note = make('p', 'muted-note', (needsMarket(pick.kind) ? '' : '코스피·코스닥 전체 순서예요. 순매수 금액은 자료에 없어서 순서만 보여 줘요. ')
      + '🔄 ' + kst(rank.retrieved_at) + ' KST 확인 · 네이버페이 증권 공개 순위 · 장중에는 계속 바뀌어요. 매매 추천이 아니에요.' + (rank.failed.length ? ' 일부 순위를 불러오지 못했어요.' : ''));
    chart.replaceChildren(heading, ...controls, list, note);
  }
  async function loadRank() {
    if (rankLoading || document.hidden || document.documentElement.dataset.zeroView !== 'home') return; rankLoading = true;
    try {
      const response = await fetch('api/market-rank', {cache: 'no-store', signal: AbortSignal.timeout(30000)});
      if (response.status === 404 && !rank) rankState = 'HIDDEN';
      else { const data = response.ok ? validRank(await response.json()) : null; if (data) { rank = data; rankState = 'READY'; } else if (!rank) rankState = 'FAILED'; }
    } catch (_) { if (!rank) rankState = 'FAILED'; } finally { rankLoading = false; paintRank(); }
  }

  // ── 관심 종목 ──
  const quotes = new Map();
  async function quote(id) {
    const hit = quotes.get(id); if (hit && Date.now() - hit.at < 60000) return hit.value;
    let value = null;
    try {
      if (id.startsWith('KR:')) {
        const response = await fetch('api/stock-info?code=' + id.slice(3), {cache: 'no-store', signal: AbortSignal.timeout(20000)}), data = response.ok ? await response.json() : null;
        if (data?.scope === 'PUBLIC_STOCK_INFO' && data.code === id.slice(3) && Number.isFinite(data.price) && Number.isFinite(data.change_rate)) value = {name: data.name, price: won(data.price), rate: data.change_rate};
      }
      if (!value) {
        const response = await fetch('api/market-card?identity=' + encodeURIComponent(id), {cache: 'no-store', signal: AbortSignal.timeout(20000)}), data = response.ok ? await response.json() : null;
        if (data?.quote?.status === 'AVAILABLE' && Number.isFinite(data.quote.price)) value = {name: id.slice(3), price: (data.quote.currency === 'USD' ? '$' : '') + data.quote.price.toLocaleString('ko-KR', {maximumFractionDigits: 2}) + (data.quote.currency === 'KRW' ? '원' : ''), rate: null};
      }
    } catch (_) { value = null; }
    quotes.set(id, {at: Date.now(), value}); return value;
  }
  let watchSeq = 0;
  async function paintWatch() {
    const seq = ++watchSeq, ids = hearts().slice(0, 10);
    const heading = make('h2', '', '♥ 관심 종목'); heading.id = 'th-watch-title';
    if (!ids.length) { watch.replaceChildren(heading, make('p', 'muted-note', '♡를 눌러 관심 종목을 담아 보세요. 이 기기에만 저장돼요.')); return; }
    const list = make('ol', 'th-list th-watch-list'), rows = ids.map((id) => {
      const row = make('li'), body = make('button', 'th-row th-watch-row'), name = make('span', 'th-name'), price = make('span', 'th-price');
      body.type = 'button'; body.addEventListener('click', () => open(id)); name.append(make('strong', '', id.slice(3)), make('small', '', id.startsWith('KR:') ? '국내' : '미국')); price.append(make('strong', '', '불러오는 중'));
      body.append(name, price); row.append(heartButton(id, id.slice(3)), body); list.append(row); return {id, name, price, body};
    });
    watch.replaceChildren(heading, list, make('p', 'muted-note', '국내 종목은 전일 대비, 미국 종목은 지연 시세 가격만 보여 줘요.'));
    await Promise.all(rows.map(async (row) => {
      const value = await quote(row.id); if (seq !== watchSeq) return;
      row.price.replaceChildren();
      if (!value) { row.price.append(make('span', 'muted-note', '시세 미확인')); return; }
      row.name.firstChild.textContent = value.name; row.body.setAttribute('aria-label', value.name + ' 종목 보기'); row.price.append(make('strong', '', value.price));
      if (value.rate !== null) row.price.append(make('span', 'th-pct th-' + direction(value.rate), percent(value.rate)));
    }));
  }

  // ── 열릴 때마다 갱신 ──
  async function refresh() {
    if (document.hidden || document.documentElement.dataset.zeroView !== 'home') return;
    paintStatus(); paintIndices(); paintSchedule(); paintRank(); paintWatch();
    window.ZEROAnalysis?.load?.().then(paintIndices, () => {});
    window.ZERODesk?.load?.().then(paintSchedule, () => {});
    loadRank();
  }
  document.addEventListener('zero-view-changed', (event) => { if (event.detail?.view === 'home') refresh(); });
  document.addEventListener('zero-watchlist-changed', () => { if (document.documentElement.dataset.zeroView === 'home') { paintRank(); paintWatch(); } });
  document.addEventListener('visibilitychange', refresh);
  setInterval(() => { paintStatus(); loadRank(); }, 120000);
  if (document.documentElement.dataset.zeroView === 'home') refresh();
})();
