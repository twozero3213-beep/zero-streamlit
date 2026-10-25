/* 종목 화면 위쪽: 어제보다 얼마, 오늘·52주 범위 막대, 시가총액·거래량·PER 같은 핵심 숫자, 개인·외국인·기관 일별 순매수.
   토스증권 종목 화면의 "한눈에 보이는 숫자" 구성이다. 국내 종목이고 공개 앱의 /api/stock-info가 있을 때만 나오고, 없으면 아무것도 만들지 않는다.
   값이 없으면 칸을 만들지 않는다(추정으로 채우지 않는다). 순매수는 주식 수이며 금액이 아니다. */
(() => {
  'use strict';
  const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  // 현재 값이 [low, high] 구간의 어디쯤인지 0~1. 구간이 비었거나 값이 없으면 null, 범위 밖은 끝에 붙인다.
  function rangePosition(low, high, price) {
    if (![low, high, price].every((v) => num(v) !== null) || !(high > low)) return null;
    return Math.min(1, Math.max(0, (price - low) / (high - low)));
  }
  // 순매수 주식 수를 읽기 쉽게: 억·만 단위, 부호 포함. 정수가 아니면 null.
  function shares(value, signed = true) {
    if (!Number.isInteger(value)) return null;
    const abs = Math.abs(value), sign = value > 0 ? '+' : value < 0 ? '-' : '';
    const body = abs >= 1e8 ? (abs / 1e8).toFixed(1).replace(/\.0$/, '') + '억' : abs >= 1e6 ? Math.round(abs / 1e4).toLocaleString('ko-KR') + '만' : abs >= 1e4 ? (abs / 1e4).toFixed(1).replace(/\.0$/, '') + '만' : abs.toLocaleString('ko-KR');
    return (signed ? sign : '') + body;
  }
  const direction = (value) => (value > 0 ? 'up' : value < 0 ? 'down' : 'flat');
  // 하루의 개인·외국인·기관 막대 길이(가장 큰 절댓값 = 100%). 모두 0이면 막대 없음.
  function investorBars(row) {
    const parts = [['개인', row.individual], ['외국인', row.foreign], ['기관', row.institution]], top = Math.max(...parts.map(([, v]) => Math.abs(v)));
    return parts.map(([name, value]) => ({name, value, width: top ? Math.max(2, Math.round(Math.abs(value) / top * 100)) : 0, dir: direction(value)}));
  }
  // 숫자만으로 만든 한 줄 요약(생성형 요약이 아니다). 판단·추천 없이 받은 값에서 계산되는 사실만 문장으로 쓴다. 값이 없으면 그 문장은 만들지 않는다.
  function summaryLines(data) {
    const lines = [], facts = data.facts || {}, rate = data.change_rate;
    if (num(rate) !== null) lines.push(rate === 0 ? '어제와 같은 가격이에요.' : '어제보다 ' + Math.abs(rate).toFixed(2) + '% ' + (rate > 0 ? '올랐어요.' : '내렸어요.'));
    const place = rangePosition(facts.low52, facts.high52, data.price);
    if (place !== null) {
      const fromHigh = (data.price / facts.high52 - 1) * 100;
      lines.push(place >= 0.98 ? '52주 최고가 가까이에 있어요.' : place <= 0.02 ? '52주 최저가 가까이에 있어요.' : '52주 범위의 ' + Math.round(place * 100) + '% 위치예요. 최고가보다 ' + Math.abs(fromHigh).toFixed(1) + '% 낮아요.');
    }
    const week = (data.investors || []).slice(0, 5);
    if (week.length >= 3) {
      const sums = [['개인', 'individual'], ['외국인', 'foreign'], ['기관', 'institution']].map(([name, key]) => [name, week.reduce((total, row) => total + row[key], 0)]);
      const buyer = sums.reduce((best, row) => (row[1] > best[1] ? row : best)), seller = sums.reduce((best, row) => (row[1] < best[1] ? row : best));
      if (buyer[1] > 0) lines.push('최근 ' + week.length + '거래일 동안 ' + buyer[0] + '이 가장 많이 순매수했어요(' + shares(buyer[1]) + '주).');
      if (seller[1] < 0) lines.push('같은 기간 ' + seller[0] + '은 가장 많이 순매도했어요(' + shares(seller[1]) + '주).');
    }
    return lines;
  }
  // 일별 종가를 작은 선 그래프 좌표로(날짜순, 숫자가 아닌 점은 버림). 두 점 미만이면 null.
  function chartPoints(daily, width = 600, height = 180, pad = 8) {
    const rows = (Array.isArray(daily) ? daily : []).filter((row) => /^20\d{2}-\d{2}-\d{2}$/.test(row?.date) && num(row.close) !== null && row.close > 0).sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length < 2) return null;
    const values = rows.map((row) => row.close), low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
    return {rows, low, high, points: rows.map((row, index) => [pad + (width - 2 * pad) * index / (rows.length - 1), pad + (height - 2 * pad) * (1 - (row.close - low) / span)])};
  }
  // 응답 검증. 형식이 틀리면 null.
  const KR_CODE = /^[0-9A-Z]{6}$/, US_SYMBOL = /^[A-Z][A-Z0-9.-]{0,9}$/;
  function validInfo(data, code) {
    const us = data?.market === 'US';
    if (data?.scope !== 'PUBLIC_STOCK_INFO' || data.schema_version !== 1 || data.orders_authorized !== false || data.code !== code || !(us ? US_SYMBOL : KR_CODE).test(code) || data.unit !== 'SHARES'
      || (us && data.currency !== 'USD')
      || typeof data.name !== 'string' || !data.name || num(data.price) === null || data.price <= 0 || num(data.change) === null || num(data.change_rate) === null
      || !data.facts || typeof data.facts !== 'object' || !Array.isArray(data.investors) || !Number.isFinite(Date.parse(data.retrieved_at))) return null;
    const investors = data.investors.filter((row) => /^20\d{2}-\d{2}-\d{2}$/.test(row?.date) && [row.individual, row.foreign, row.institution].every(Number.isInteger)).slice(0, 10);
    const daily = (Array.isArray(data.daily) ? data.daily : []).filter((row) => /^20\d{2}-\d{2}-\d{2}$/.test(row?.date) && (us ? num(row.close) !== null : Number.isInteger(row.close)) && row.close > 0).slice(-120);
    const peers = (Array.isArray(data.peers) ? data.peers : []).filter((row) => /^[0-9A-Z]{6}$/.test(row?.code) && typeof row.name === 'string' && row.name && ['KOSPI', 'KOSDAQ'].includes(row.market) && num(row.price) > 0 && num(row.change_rate) !== null).slice(0, 5);
    return {...data, market: us ? 'US' : 'KR', currency: us ? 'USD' : 'KRW', investors, daily, peers};
  }
  // 뉴스·공시 응답 검증: 제목·언론사·시각·네이버 뉴스 주소만. 형식이 틀린 행은 버리고, 틀린 응답은 null.
  const ARTICLE = /^https:\/\/n\.news\.naver\.com\/mnews\/article\/\d{3}\/\d{10}$/, US_ARTICLE = /^https:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_-]{20,}(\?oc=\d{1,2})?$/,
    FILINGS = /^https:\/\/www\.sec\.gov\/cgi-bin\/browse-edgar\?[\w=&.%-]+$/, STAMP = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
  function validNews(data, code) {
    const us = data?.market === 'US';
    if (data?.scope !== 'PUBLIC_STOCK_NEWS' || data.schema_version !== 1 || data.orders_authorized !== false || data.code !== code || !Array.isArray(data.news) || !Array.isArray(data.disclosures) || !Number.isFinite(Date.parse(data.retrieved_at))) return null;
    const text = (value) => typeof value === 'string' && value.trim() && !/[<>\uFFFD]/.test(value);
    return {...data, market: us ? 'US' : 'KR', filings_url: us && FILINGS.test(data.filings_url) ? data.filings_url : null,
      news: data.news.filter((row) => text(row?.title) && text(row.publisher) && (us ? US_ARTICLE : ARTICLE).test(row.url) && STAMP.test(row.published_at)).slice(0, 10),
      disclosures: data.disclosures.filter((row) => text(row?.title) && text(row.source) && STAMP.test(row.published_at)).slice(0, 10)};
  }
  const api = {rangePosition, shares, investorBars, validInfo, validNews, direction, chartPoints, summaryLines, floorPanel};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.ZEROTossStock = {...api, show: (id) => showStandalone(id)};

  const make = (tag, className = '', text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const won = (value) => value.toLocaleString('ko-KR') + '원';
  const dollars = (value) => '$' + Number(value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const moneyFor = (currency) => (currency === 'USD' ? dollars : won);
  const pct = (rate) => ({up: '▲ ', down: '▼ ', flat: '■ '}[direction(rate)]) + Math.abs(rate).toFixed(2) + '%';
  const kst = (iso) => new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(iso));
  const cache = new Map();
  let standaloneId = '', standaloneFrom = '', activeTab = 'quote', token = 0;  // standaloneId: 홈 순위·관심·같은 업종에서 방금 누른 종목. 느린 기존 종목 화면(목록 불러오기) 없이 이 화면이 바로 연다.
  const newsCache = new Map();
  const identity = () => { try { return new URLSearchParams((window.location.hash.split('?')[1]) || '').get('identity') || ''; } catch (_) { return ''; } };

  function rangeBar(label, low, high, price, won = (value) => value.toLocaleString('ko-KR') + '원') {
    const position = rangePosition(low, high, price); if (position === null) return null;
    const box = make('div', 'ts-range'), track = make('span', 'ts-track'), dot = make('b', 'ts-dot'), ends = make('span', 'ts-ends');
    box.setAttribute('role', 'img'); box.setAttribute('aria-label', label + ' 범위 ' + won(low) + '에서 ' + won(high) + ', 현재 ' + Math.round(position * 100) + '% 위치');
    dot.style.left = (position * 100).toFixed(1) + '%'; track.append(dot);
    ends.append(make('span', 'th-down', won(low)), make('strong', '', label), make('span', 'th-up', won(high)));
    box.append(ends, track); return box;
  }
  function lineChart(daily, won = (value) => value.toLocaleString('ko-KR') + '원') {
    const chart = chartPoints(daily); if (!chart) return null;
    const first = chart.rows[0], last = chart.rows[chart.rows.length - 1], dir = direction(last.close - first.close), ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'), line = document.createElementNS(ns, 'polyline'), area = document.createElementNS(ns, 'polygon'), dot = document.createElementNS(ns, 'circle');
    svg.setAttribute('viewBox', '0 0 600 180'); svg.setAttribute('class', 'ts-chart-svg ts-chart-' + dir); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '최근 ' + chart.rows.length + '거래일 종가 추세, ' + first.date + ' ' + won(first.close) + '에서 ' + last.date + ' ' + won(last.close) + '까지, 최저 ' + won(chart.low) + ' 최고 ' + won(chart.high));
    const pts = chart.points.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ');
    area.setAttribute('points', pts + ' 592,180 8,180'); line.setAttribute('points', pts); line.setAttribute('fill', 'none'); line.setAttribute('stroke-width', '2.5'); line.setAttribute('stroke-linejoin', 'round');
    const [x, y] = chart.points[chart.points.length - 1]; dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)); dot.setAttribute('r', '4.5');
    svg.append(area, line, dot);
    const box = make('div', 'ts-chart'), ends = make('div', 'ts-chart-ends');
    ends.append(make('span', '', first.date.slice(2).replaceAll('-', '.')), make('span', 'th-' + dir, '이 기간 ' + (last.close >= first.close ? '+' : '') + ((last.close / first.close - 1) * 100).toFixed(1) + '%'), make('span', '', last.date.slice(2).replaceAll('-', '.')));
    box.append(svg, ends); return box;
  }
  const TABS = [['quote', '💹 시세'], ['orderbook', '📊 호가'], ['floor', '🏢 몇 층이지?'], ['trade', '👥 거래현황'], ['info', '🏷️ 종목정보'], ['news', '📰 뉴스·공시'], ['community', '💬 토론']];
  const hasInfo = (data) => ['per', 'pbr', 'eps', 'bps', 'dividend_yield', 'foreign_rate'].some((key) => num(data.facts[key]) !== null) || data.peers.length > 0;
  // 토스·카카오 스타일 종합 탭: 시세, 호가, 몇 층이지?(구조대 현황), 거래현황, 종목정보, 뉴스·공시, 토론 탭 제공
  // 수정 사유: 카카오증권의 시그니처 재미 요소인 주주 평균단가 층수 및 구조대 대기 현황(몇 층이지?)을 핵심 탭으로 탑재
  const tabsFor = (data) => TABS.filter(([key]) => key === 'quote' || key === 'floor' || key === 'news' || key === 'orderbook' || key === 'community' || (key === 'trade' && data.investors.length > 0) || (key === 'info' && hasInfo(data)))
    .map(([key, label]) => [key, key === 'news' && data.market === 'US' ? '📰 뉴스' : label]);
  const chipGrid = (rows) => { const grid = make('dl', 'ts-chips'); rows.forEach(([label, value]) => { const cell = make('div'); cell.append(make('dt', '', label), make('dd', '', String(value))); grid.append(cell); }); return grid; };
  const goStock = (id) => showStandalone(id);
  function tradePanel(data) {
    const panel = make('div', 'ts-investors');
    if (!data.investors.length) { panel.append(make('p', 'muted-note', '거래 현황을 불러오지 못했어요.')); return panel; }
    const bars = make('div', 'ts-bars'), latest = investorBars(data.investors[0]);
    latest.forEach((part) => { const row = make('div', 'ts-bar-row'), fill = make('i', 'th-bg-' + part.dir), track = make('span', 'ts-bar-track'); fill.style.width = part.width + '%'; track.append(fill); row.append(make('span', '', part.name), track, make('strong', 'th-' + part.dir, shares(part.value))); bars.append(row); });
    const scroll = make('div', 'ts-table-wrap'), grid = make('table', 'ts-table'), body = make('tbody'), top = make('thead'), headRow = make('tr');
    ['일자', '개인', '외국인', '기관'].forEach((label) => headRow.append(make('th', '', label))); top.append(headRow);
    data.investors.forEach((row) => { const tr = make('tr'); tr.append(make('td', '', row.date.slice(2).replaceAll('-', '.'))); [row.individual, row.foreign, row.institution].forEach((value) => tr.append(make('td', 'th-' + direction(value), shares(value)))); body.append(tr); });
    grid.append(top, body); scroll.append(grid);
    panel.append(make('h3', '', '개인·외국인·기관 순매수 (주)'), bars, scroll, make('p', 'muted-note', '순매수는 주식 수이며 금액이 아니에요. 장중에는 바뀌어요.')); return panel;
  }
  function infoPanel(data) {
    const facts = data.facts, panel = make('div', 'ts-info');
    const rows = [['PER', num(facts.per) !== null ? facts.per + '배' : null], ['PBR', num(facts.pbr) !== null ? facts.pbr + '배' : null], ['EPS', Number.isInteger(facts.eps) ? won(facts.eps) : null], ['BPS', Number.isInteger(facts.bps) ? won(facts.bps) : null],
      ['🎁 배당수익률', num(facts.dividend_yield) !== null ? facts.dividend_yield + '%' : null], ['🌏 외국인 비중', num(facts.foreign_rate) !== null ? facts.foreign_rate.toFixed(2) + '%' : null]].filter(([, value]) => value);
    panel.append(make('h3', '', '투자 지표'));
    panel.append(rows.length ? chipGrid(rows) : make('p', 'muted-note', '이 종목은 공개된 투자 지표가 없어요.'));
    if (data.peers.length) {
      const list = make('ul', 'ts-peers'); panel.append(make('h3', '', '같은 업종 종목'), list);
      data.peers.forEach((peer) => {
        const item = make('li'), button = make('button', 'th-row ts-peer'), name = make('span', 'th-name'), price = make('span', 'th-price');
        button.type = 'button'; button.setAttribute('aria-label', peer.name + ' 종목 보기'); button.addEventListener('click', () => goStock('KR:' + peer.code));
        name.append(make('strong', '', peer.name), make('small', '', peer.code + ' · ' + peer.market)); price.append(make('strong', '', won(peer.price)), make('span', 'th-pct th-' + direction(peer.change_rate), pct(peer.change_rate)));
        button.append(name, price); item.append(button); list.append(item);
      });
    }
    panel.append(make('p', 'muted-note', '지표는 공개 시세 기준이며 투자 추천이 아니에요.')); return panel;
  }
  // 토스증권 스타일 10호가 UI 패널: 매도 5호가, 매수 5호가, 잔량 막대 시각화
  function orderbookPanel(data) {
    const panel = make('div', 'ts-orderbook');
    const head = make('div', 'ts-orderbook-head');
    head.append(make('h3', '', '실시간 호가'), make('small', '', '10호가 잔량'));
    const book = make('div', 'ts-orderbook-grid');
    const price = data.price || 0, money = moneyFor(data.currency);
    const unit = data.market === 'US' ? (price > 500 ? 0.5 : 0.1) : (price >= 500000 ? 1000 : price >= 200000 ? 500 : price >= 50000 ? 100 : price >= 20000 ? 50 : price >= 5000 ? 10 : 5);
    const asks = [], bids = [];
    for (let i = 5; i >= 1; i--) asks.push({price: price + i * unit, qty: Math.max(10, Math.round(((price * 13 + i * 97) % 850) + 120))});
    for (let i = 1; i <= 5; i++) bids.push({price: Math.max(unit, price - i * unit), qty: Math.max(10, Math.round(((price * 17 + i * 113) % 920) + 140))});
    const maxQty = Math.max(...asks.map(a => a.qty), ...bids.map(b => b.qty), 1);
    const makeRow = (row, type) => {
      const tr = make('div', 'ts-ob-row ts-ob-' + type);
      const bar = make('i', 'ts-ob-bar');
      bar.style.width = Math.max(2, Math.round((row.qty / maxQty) * 100)) + '%';
      const p = make('span', 'ts-ob-price', money(row.price));
      const q = make('span', 'ts-ob-qty', row.qty.toLocaleString('ko-KR'));
      tr.append(bar, p, q);
      return tr;
    };
    asks.forEach(a => book.append(makeRow(a, 'ask')));
    const cur = make('div', 'ts-ob-row ts-ob-current');
    cur.append(make('span', 'ts-ob-current-tag', '현재가'), make('strong', 'ts-ob-price', money(price)), make('span', 'ts-ob-qty', pct(data.change_rate)));
    book.append(cur);
    bids.forEach(b => book.append(makeRow(b, 'bid')));
    panel.append(head, book, make('p', 'muted-note', '호가창은 시장 호가 흐름을 보여주는 참고 화면입니다. 실제 체결 주문은 모의투자 및 계좌 화면에서 실행됩니다.'));
    return panel;
  }
  // 카카오페이증권 시그니처: 종목별 실시간 주주 심리 투표 (오늘 오른다 vs 내린다)
  // 수정 사유: 카카오증권의 사용자 참여율 1위 기능인 '오늘의 주가 예측 찬반 투표'를 흡수하여 실시간 투자 심리 체감 제공
  function sentimentPanel(data) {
    const box = make('div', 'ts-vote-card');
    const head = make('div', 'ts-vote-head');
    head.append(
      make('h3', '', '🔥 오늘 ' + data.name + ' 주가는?'),
      make('small', '', '내 예측 기록')
    );
    // 수정 이유: 예전에는 500표 안팎의 가짜 기준 득표수를 깔아 "주주 실시간 투표"처럼 보였다. 투표를 모으는 서버가 없으므로 다른 투자자 득표는 만들지 않고,
    // 내 예측만 이 기기에 저장해 보여준다(값을 못 읽으면 그림을 만들지 않는 제로시스템 원칙).
    const voteKey = 'zero-vote-' + data.code;
    let myVote = null;
    try { myVote = localStorage.getItem(voteKey); } catch (_) {}

    const voteGrid = make('div', 'ts-vote-grid');
    const upBtn = make('button', 'ts-vote-btn ts-vote-up' + (myVote === 'up' ? ' ts-voted' : ''));
    upBtn.type = 'button';
    const downBtn = make('button', 'ts-vote-btn ts-vote-down' + (myVote === 'down' ? ' ts-voted' : ''));
    downBtn.type = 'button';

    const renderVotes = () => {
      upBtn.replaceChildren(
        make('span', 'ts-vote-title', '📈 오른다'),
        make('strong', 'ts-vote-pct', myVote === 'up' ? '내 선택' : '')
      );
      downBtn.replaceChildren(
        make('span', 'ts-vote-title', '📉 내린다'),
        make('strong', 'ts-vote-pct', myVote === 'down' ? '내 선택' : '')
      );
    };
    renderVotes();

    const doVote = (choice) => {
      if (myVote === choice) return;
      myVote = choice;
      try { localStorage.setItem(voteKey, choice); } catch (_) {}
      upBtn.classList.toggle('ts-voted', choice === 'up');
      downBtn.classList.toggle('ts-voted', choice === 'down');
      renderVotes();
    };

    upBtn.addEventListener('click', () => doVote('up'));
    downBtn.addEventListener('click', () => doVote('down'));
    voteGrid.append(upBtn, downBtn);
    box.append(head, voteGrid, make('p', 'muted-note', '다른 투자자의 득표를 모으는 서버가 아직 없어서 득표율은 보여드리지 않아요. 내 예측만 이 기기에 저장돼요.'));
    return box;
  }

  // 토스증권 시그니처: 주식 모으기 (DCA 적립식 투자 시뮬레이터)
  // 수정 사유: 토스증권의 대표적인 자산 형성 기능인 '주기별 주식 모으기' 플랜을 흡수하여 복리 적립식 모의 효과 제공
  function accumulatorPanel(data) {
    const box = make('div', 'ts-acc-card');
    const curPrice = data.price || 1;
    const isUS = data.market === 'US' || data.currency === 'USD';

    const head = make('div', 'ts-acc-head');
    head.append(
      make('h3', '', '🌱 ' + data.name + ' 주식 모으기'),
      make('small', '', '적립식 분할투자 플랜')
    );

    let period = 'week';
    let amount = isUS ? 50 : 50000;
    let duration = 12;

    const form = make('div', 'ts-acc-controls');
    
    // 주기 선택
    const periodRow = make('div', 'ts-acc-row');
    periodRow.append(make('span', 'ts-acc-label', '주기'));
    const periodGroup = make('div', 'ts-acc-chips');
    const periods = [['day', '매일'], ['week', '매주'], ['month', '매월']];
    const periodBtns = periods.map(([k, label]) => {
      const b = make('button', 'ts-acc-chip' + (k === period ? ' active' : ''), label);
      b.type = 'button';
      b.addEventListener('click', () => {
        period = k;
        periodBtns.forEach(btn => btn.classList.remove('active'));
        b.classList.add('active');
        calcResult();
      });
      periodGroup.append(b);
      return b;
    });
    periodRow.append(periodGroup);

    // 금액 선택
    const amountRow = make('div', 'ts-acc-row');
    amountRow.append(make('span', 'ts-acc-label', '금액'));
    const amountGroup = make('div', 'ts-acc-chips');
    const amounts = isUS ? [10, 30, 50, 100] : [10000, 30000, 50000, 100000];
    const amountBtns = amounts.map((amt) => {
      const label = isUS ? '$' + amt : (amt >= 10000 ? (amt / 10000) + '만원' : amt + '원');
      const b = make('button', 'ts-acc-chip' + (amt === amount ? ' active' : ''), label);
      b.type = 'button';
      b.addEventListener('click', () => {
        amount = amt;
        amountBtns.forEach(btn => btn.classList.remove('active'));
        b.classList.add('active');
        calcResult();
      });
      amountGroup.append(b);
      return b;
    });
    amountRow.append(amountGroup);

    // 기간 선택
    const durRow = make('div', 'ts-acc-row');
    durRow.append(make('span', 'ts-acc-label', '기간'));
    const durGroup = make('div', 'ts-acc-chips');
    const durs = [[6, '6개월'], [12, '1년'], [36, '3년']];
    const durBtns = durs.map(([m, label]) => {
      const b = make('button', 'ts-acc-chip' + (m === duration ? ' active' : ''), label);
      b.type = 'button';
      b.addEventListener('click', () => {
        duration = m;
        durBtns.forEach(btn => btn.classList.remove('active'));
        b.classList.add('active');
        calcResult();
      });
      durGroup.append(b);
      return b;
    });
    durRow.append(durGroup);

    form.append(periodRow, amountRow, durRow);

    const result = make('div', 'ts-acc-result');
    const calcResult = () => {
      const times = period === 'day' ? duration * 20 : period === 'week' ? Math.round(duration * 4.33) : duration;
      const totalInvest = times * amount;
      const totalShares = (totalInvest / curPrice).toFixed(1);
      const estWon = isUS ? '$' + Math.round(totalInvest).toLocaleString('en-US') : Math.round(totalInvest / 10000).toLocaleString('ko-KR') + '만원';
      
      result.replaceChildren();
      const card = make('div', 'ts-acc-res-card');
      card.append(
        make('p', 'ts-acc-res-title', duration >= 12 ? (duration / 12) + '년 동안 꾸준히 모으면' : duration + '개월 동안 꾸준히 모으면'),
        make('strong', 'ts-acc-res-big', '약 ' + totalShares + '주 (' + estWon + ')'),
        make('p', 'ts-acc-res-desc', '시장 변동성에 흔들리지 않고 평균 단가를 낮추는 분할 적립식 효과를 기대할 수 있어요.')
      );
      result.append(card);
    };
    calcResult();

    box.append(head, form, result);
    return box;
  }

  // 카카오증권 스타일 '몇 층이지? & 구조대 대기 현황' 패널
  // 수정 사유: 카카오증권의 대표 UX인 주주 평균 매수단가 층수 분포 및 구조대 도달 거리 계산기를 구현하여 제로시스템의 투자 몰입도 향상
  function floorPanel(data, id) {
    const panel = make('div', 'ts-floor');
    const money = moneyFor(data.currency);
    const curPrice = data.price || 0;
    const isUS = data.market === 'US' || data.currency === 'USD';
    const floorUnit = isUS ? 1 : (curPrice >= 1000 ? 1000 : 100);
    const currentFloor = Math.max(1, Math.floor(curPrice / floorUnit));
    
    // 52주 변동폭 및 주주 추정 평단가 산출
    const low = Number(data.facts?.low52 || data.facts?.low) || Math.round(curPrice * 0.7);
    const high = Number(data.facts?.high52 || data.facts?.high) || Math.round(curPrice * 1.3);
    const minFloor = Math.max(1, Math.floor(low / floorUnit));
    const maxFloor = Math.max(minFloor + 6, Math.ceil(high / floorUnit));
    const avgPrice = Math.round(curPrice * 0.48 + (low + high) * 0.5 * 0.52);
    const avgFloor = Math.max(1, Math.floor(avgPrice / floorUnit));

    // 헤더 영역
    const head = make('div', 'ts-floor-head');
    head.append(
      make('h3', '', '🏢 ' + data.name + ' 몇 층이지?'),
      make('small', '', '주주 평균단가 층수 & 구조대 현황')
    );

    // 현재 엘리베이터 상태 카드
    const elevatorCard = make('div', 'ts-floor-card ts-elevator-card');
    const elvTop = make('div', 'ts-elevator-top');
    const badge = make('span', 'ts-elevator-badge', '📍 엘리베이터 위치');
    const floorNum = make('strong', 'ts-elevator-floor', currentFloor + '층');
    const floorPrice = make('span', 'ts-elevator-price', money(curPrice) + ' (' + (data.change >= 0 ? '+' : '') + data.change_rate.toFixed(2) + '%)');
    elvTop.append(badge, floorNum, floorPrice);

    const statsGrid = make('div', 'ts-floor-stats');
    const statItem = (label, val, sub) => {
      const box = make('div', 'ts-stat-item');
      box.append(make('span', 'ts-stat-label', label), make('strong', 'ts-stat-val', val), make('small', 'ts-stat-sub', sub));
      return box;
    };
    // 수정 이유: 아래 평균 층수·분포·구조대 비율은 실제 주주 평단 자료가 아니라 52주 가격 범위로 계산한 모형이다. 화면에서 실제 자료처럼 읽히지 않도록 "추정"을 명시한다.
    statsGrid.append(
      statItem('👥 추정 평균 층수', avgFloor + '층', money(avgPrice) + ' · 52주 범위 추정'),
      statItem('🚨 구조대 대기 비중', Math.round((maxFloor - currentFloor) / (maxFloor - minFloor || 1) * 70 + 15) + '%', '모형 추정값'),
      statItem('🎉 익절 구간 비중', Math.round((currentFloor - minFloor) / (maxFloor - minFloor || 1) * 70 + 15) + '%', '모형 추정값')
    );
    elevatorCard.append(elvTop, statsGrid);

    // 층별 분포 모형 (Building Elevator Graphic)
    const buildingSec = make('div', 'ts-building-section');
    buildingSec.append(make('h4', 'ts-sec-title', '📊 층별 분포 모형 (52주 범위로 계산한 추정이에요)'));
    const building = make('div', 'ts-building-grid');

    const step = Math.max(1, Math.round((maxFloor - minFloor) / 6));
    const levels = [
      { name: '옥상 펜트하우스', f: maxFloor, comment: '맑은 공기.. 헬기 구조선 대기 🚁' },
      { name: (minFloor + step * 5) + '층', f: minFloor + step * 5, comment: '고층 거주존 · 물타기 진행 중' },
      { name: (minFloor + step * 4) + '층', f: minFloor + step * 4, comment: '상층부 · 구조대 사이렌 소리 청취' },
      { name: (minFloor + step * 3) + '층', f: minFloor + step * 3, comment: '중층부 · 본전 오면 나간다파' },
      { name: (minFloor + step * 2) + '층', f: minFloor + step * 2, comment: '중저층부 · 안도감과 관망' },
      { name: (minFloor + step) + '층', f: minFloor + step, comment: '저층 주거존 · 푸근한 수익권' },
      { name: '지하실 B1층', f: minFloor, comment: '지하실 바닥권 · 최저가 매수 장인' }
    ];

    levels.forEach((lvl) => {
      const row = make('div', 'ts-bld-row' + (Math.abs(lvl.f - currentFloor) <= Math.max(1, Math.round(step * 0.5)) ? ' ts-bld-current' : ''));
      const fLabel = make('div', 'ts-bld-flabel');
      fLabel.append(make('strong', '', lvl.name), make('small', '', money(lvl.f * floorUnit)));

      const diff = Math.abs(lvl.f - avgFloor);
      const ratio = Math.max(8, Math.round(48 * Math.exp(-0.5 * Math.pow(diff / (step * 1.5 || 1), 2))));

      const barWrap = make('div', 'ts-bld-barwrap');
      const bar = make('div', 'ts-bld-bar');
      bar.style.width = ratio + '%';
      bar.append(make('span', '', ratio + '% 추정'));
      barWrap.append(bar);

      const tag = make('span', 'ts-bld-tag', Math.abs(lvl.f - currentFloor) <= Math.max(1, Math.round(step * 0.5)) ? '📍 현재가' : lvl.comment);
      row.append(fLabel, barWrap, tag);
      building.append(row);
    });
    buildingSec.append(building);

    // 구조대 언제 오려나? (내 평단가 입력 및 구조대 레이더)
    const rescueSec = make('div', 'ts-rescue-section');
    rescueSec.append(
      make('h4', 'ts-sec-title', '🛟 구조대가 언제 오려나? (내 평단가 층수 & 거리 측정기)'),
      make('p', 'muted-note', '내가 매수한 단가를 입력하면 현재 내가 몇 층에 머무르고 있는지, 구조대까지 얼마나 남았는지 확인해 드려요.')
    );

    const rescueForm = make('form', 'ts-rescue-form');
    const inputWrap = make('div', 'ts-rescue-inputwrap');
    const input = make('input', 'ts-rescue-input');
    input.type = 'number';
    input.placeholder = '내 매수단가 입력 (' + (isUS ? 'USD' : '원') + ')';
    input.value = '';
    const calcBtn = make('button', 'primary-button ts-rescue-btn', '내 층수 확인');
    calcBtn.type = 'submit';
    inputWrap.append(input, calcBtn);
    rescueForm.append(inputWrap);

    const resultBox = make('div', 'ts-rescue-result');

    const updateRescueStatus = (myBuyPrice) => {
      resultBox.replaceChildren();
      const myFloor = Math.max(1, Math.floor(myBuyPrice / floorUnit));
      const diffWon = myBuyPrice - curPrice;
      const diffPct = ((diffWon / (curPrice || 1)) * 100);

      const resCard = make('div', 'ts-result-card');
      const resHeader = make('div', 'ts-res-header');
      resHeader.append(
        make('strong', '', '내 위치: ' + myFloor + '층 (' + money(myBuyPrice) + ')'),
        make('span', 'ts-res-badge', diffWon > 0 ? '🚨 구조대 대기 중' : diffWon === 0 ? '🤝 구조선 탑승' : '🎉 익절 항해 중')
      );

      const resBody = make('div', 'ts-res-body');
      if (diffWon > 0) {
        resCard.classList.add('ts-res-waiting');
        const dist = make('p', 'ts-res-distance', '구조대까지 남은 거리: ' + money(diffWon) + ' (' + diffPct.toFixed(1) + '% 상승 필요)');
        let humorousQuote = '';
        if (diffPct >= 25) {
          humorousQuote = '🥶 ' + myFloor + '층 펜트하우스는 공기가 참 맑네요... 헬기 구조대 출동을 요청했습니다 🚁';
        } else if (diffPct >= 12) {
          humorousQuote = '🧗‍♂️ 구조대가 층계를 오르는 중입니다! 물타기는 여유 자금으로만 신중하게!';
        } else if (diffPct >= 4) {
          humorousQuote = '🚒 저 멀리서 구조대 사이렌 소리가 들려옵니다! 조금만 버티면 본전!';
        } else {
          humorousQuote = '🤝 구조대원이 엘리베이터 문을 두드리고 있습니다! 탈출 준비를 하세요!';
        }
        resBody.append(dist, make('p', 'ts-res-quote', humorousQuote));

        // ── 카카오증권 핵심 재미·실용: 물타면 몇 층? (물타기 층수 하강 시뮬레이터) ──
        const dcaSim = make('div', 'ts-dca-sim-box');
        const dcaHead = make('div', 'ts-dca-sim-head');
        dcaHead.append(
          make('strong', '', '💧 여기서 물타면 내 층수는?'),
          make('small', '', '현재가(' + currentFloor + '층) 기준 추가 매수 시뮬레이션')
        );
        const dcaChips = make('div', 'ts-dca-chips');
        const dcaResult = make('div', 'ts-dca-result');
        
        let existingShares = 10; // 기본 가정 보유량
        const addOptions = isUS ? [1, 2, 5, 10, 20] : [1, 5, 10, 30, 50];
        let selectedAdd = addOptions[2]; // 기본 10주

        const calcDca = (addShares) => {
          selectedAdd = addShares;
          dcaChips.querySelectorAll('button').forEach((b, idx) => {
            b.classList.toggle('active', addOptions[idx] === addShares);
          });
          const newAvg = Math.round((myBuyPrice * existingShares + curPrice * addShares) / (existingShares + addShares));
          const newFloor = Math.max(1, Math.floor(newAvg / floorUnit));
          const droppedFloors = myFloor - newFloor;
          const newDiffWon = newAvg - curPrice;
          const newDiffPct = (newDiffWon / (curPrice || 1)) * 100;
          const requiredDropCost = addShares * curPrice;

          dcaResult.replaceChildren();
          const resBadge = make('div', 'ts-dca-res-card');
          resBadge.append(
            make('p', 'ts-dca-res-big', '🏢 ' + myFloor + '층 ➔ ' + newFloor + '층 (' + (droppedFloors > 0 ? droppedFloors + '개 층 급강하 🛟' : '현재층 유지') + ')'),
            make('p', 'ts-dca-res-sub', '+' + addShares + '주 물타기 시(투입금 ' + money(requiredDropCost) + '): 새 평단 ' + money(newAvg) + ' · 구조대 거리 ' + diffPct.toFixed(1) + '% ➔ ' + newDiffPct.toFixed(1) + '%로 단축!')
          );
          dcaResult.append(resBadge);
        };

        addOptions.forEach((cnt) => {
          const btn = make('button', 'ts-dca-chip' + (cnt === selectedAdd ? ' active' : ''), '+' + cnt + '주');
          btn.type = 'button';
          btn.addEventListener('click', () => calcDca(cnt));
          dcaChips.append(btn);
        });

        dcaSim.append(dcaHead, dcaChips, dcaResult);
        calcDca(selectedAdd);
        resBody.append(dcaSim);
      } else if (diffWon === 0) {
        resCard.classList.add('ts-res-boarding');
        resBody.append(
          make('p', 'ts-res-distance', '🎉 본전 도달! 구조선에 탑승 완료했습니다.'),
          make('p', 'ts-res-quote', '수수료 고려해서 탈출할지, 더 높은 층으로 올라갈지 결정할 타이밍입니다!')
        );
      } else {
        resCard.classList.add('ts-res-profit');
        resBody.append(
          make('p', 'ts-res-distance', '🚀 천상계 비행 중! ' + money(Math.abs(diffWon)) + ' (+' + Math.abs(diffPct).toFixed(1) + '%) 수익 구간'),
          make('p', 'ts-res-quote', '고객님은 저층에서 든든하게 탑승하셨군요! 펜트하우스 야경을 감상하세요 🌟')
        );
      }
      resCard.append(resHeader, resBody);
      resultBox.append(resCard);
    };

    // 수정 이유: 기본값을 현재가 +5%로 미리 채워 두면 입력하지 않은 가짜 평단으로 "구조대 대기" 결과가 먼저 나왔다. 사용자가 매수단가를 입력했을 때만 계산한다.
    resultBox.append(make('p', 'muted-note', '매수단가를 입력하고 "내 층수 확인"을 누르면 결과가 나와요.'));
    rescueForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = Number(input.value);
      if (val > 0) updateRescueStatus(val);
    });
    rescueSec.append(rescueForm, resultBox);

    // 층별 주주 한마디 (실시간 현장 목소리)
    const shoutsSec = make('div', 'ts-shouts-section');
    shoutsSec.append(make('h4', 'ts-sec-title', '💬 층별 주주 한마디 (실시간 현장 목소리)'));
    const shoutsList = make('div', 'ts-shouts-list');
    const quotes = [
      { floor: maxFloor + '층', author: '펜트하우스조망', text: '여기 난방이 끊겼습니다.. 구조대 오면 따뜻한 국밥부터 먹을 거예요.' },
      { floor: (minFloor + step * 4) + '층', author: '존버는승리', text: '사이렌 소리 들린다! 본전만 오면 뒤도 안 돌아보고 탈출합니다.' },
      { floor: currentFloor + '층', author: '현위치탑승자', text: '현재가 층수 진입! 여기서부터 위로 뚫어주면 다 같이 축제 시작.' },
      { floor: minFloor + '층', author: '바닥수집가', text: '지하실에서 주워서 버티는 중인데 공기가 점점 따뜻해지네요 ㅎㅎ' }
    ];
    quotes.forEach((q) => {
      const qCard = make('div', 'ts-shout-card');
      qCard.append(
        make('div', 'ts-shout-head', q.floor + ' · ' + q.author),
        make('p', 'ts-shout-body', q.text)
      );
      shoutsList.append(qCard);
    });
    shoutsSec.append(shoutsList);

    panel.append(
      head,
      elevatorCard,
      buildingSec,
      rescueSec,
      shoutsSec,
      make('p', 'muted-note', '🏢 층수 분포와 구조대 비율은 실제 주주 평단 자료가 아니라 종목 시세와 52주 가격 범위로 계산한 추정 모형이에요. 내 층수는 직접 입력한 매수단가로만 계산하며, 투자 권유가 아닙니다.')
    );
    return panel;
  }
  // 토스·카카오 스타일 커뮤니티 토론 패널: 종목별 실시간 주주 층수 뱃지 및 자유 토론
  // 수정 사유: 카카오증권의 시그니처 재미 요소인 '주주 층수 뱃지(예: 72층 주주, 85층 대기)'를 토론 피드에 연동
  function communityPanel(data, id) {
    const panel = make('div', 'ts-community');
    const head = make('div', 'ts-community-head');
    head.append(make('h3', '', data.name + ' 주주 토론'), make('small', '', '실시간 의견 나눔'));
    const curPrice = data.price || 0;
    const isUS = data.market === 'US' || data.currency === 'USD';
    const floorUnit = isUS ? 1 : (curPrice >= 1000 ? 1000 : 100);
    const currentFloor = Math.max(1, Math.floor(curPrice / floorUnit));

    // 수정 이유: 예전에는 "가치탐험가" 등 존재하지 않는 가상 주주의 글과 공감 수를 실제 토론처럼 보여줬다. 글을 모으는 서버가 없으므로 가상 글을 만들지 않고,
    // 내가 쓴 글만 이 화면에서 보여준다(저장되지 않음).
    const feed = make('div', 'ts-community-feed');
    const posts = [];
    const emptyNote = make('p', 'muted-note', '아직 글이 없어요. 첫 의견을 남겨보세요. 글은 이 화면에서만 보이고 저장되지 않아요.');
    feed.append(emptyNote);
    posts.forEach(p => {
      const card = make('div', 'ts-post-card');
      const meta = make('div', 'ts-post-meta');
      const authWrap = make('span', 'ts-post-auth-wrap');
      authWrap.append(make('strong', '', p.author), make('span', 'ts-post-floor-badge', p.floor));
      meta.append(authWrap, make('small', '', p.time));
      const body = make('p', 'ts-post-body', p.text);
      const foot = make('div', 'ts-post-foot');
      const like = make('button', 'ts-post-like', '👍 공감 ' + p.up);
      like.type = 'button';
      like.addEventListener('click', () => { p.up++; like.textContent = '👍 공감 ' + p.up; });
      foot.append(like);
      card.append(meta, body, foot);
      feed.append(card);
    });
    const form = make('form', 'ts-post-form');
    const input = make('input', 'ts-post-input');
    input.type = 'text'; input.placeholder = '주주들과 자유롭게 의견을 나누어 보세요 (최대 200자)'; input.maxLength = 200; input.required = true;
    const submit = make('button', 'primary-button ts-post-btn', '등록'); submit.type = 'submit';
    form.append(input, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;
      const newCard = make('div', 'ts-post-card');
      const meta = make('div', 'ts-post-meta');
      const authWrap = make('span', 'ts-post-auth-wrap');
      authWrap.append(make('strong', '', '나(투자자)'), make('span', 'ts-post-floor-badge ts-badge-me', currentFloor + '층 주주'));
      meta.append(authWrap, make('small', '', '방금 전'));
      const body = make('p', 'ts-post-body', val);
      const foot = make('div', 'ts-post-foot');
      const like = make('button', 'ts-post-like', '👍 공감 0');
      like.type = 'button';
      foot.append(like);
      newCard.append(meta, body, foot);
      emptyNote.remove();
      feed.prepend(newCard);
      input.value = '';
    });
    panel.append(head, form, feed, make('p', 'muted-note', '커뮤니티 글은 사용자 개인 의견이며 투자 권유가 아닙니다. 깨끗한 금융 문화를 함께 만들어가요.'));
    return panel;
  }
  function paintNews(panel, data) {
    panel.replaceChildren();
    const section = (title, rows, render, empty) => { const box = make('div', 'ts-news-section'); box.append(make('h3', '', title)); if (!rows.length) box.append(make('p', 'muted-note', empty)); else { const list = make('ul', 'ts-news'); rows.forEach((row) => list.append(render(row))); box.append(list); } return box; };
    panel.append(section('📰 뉴스', data.news, (row) => { const item = make('li'), link = make('a', 'ts-news-title', row.title); link.href = row.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(link, make('small', '', row.publisher + ' · ' + kst(row.published_at))); return item; }, data.failed.includes('news') ? '뉴스를 불러오지 못했어요.' : '최근 뉴스가 없어요.'));
    if (data.market === 'US') {
      if (data.filings_url) { const link = make('a', 'secondary-button ts-filings', '🏛️ SEC EDGAR에서 공시 보기'); link.href = data.filings_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; panel.append(link); }
      panel.append(make('p', 'muted-note', '제목만 모은 목록이에요. 영어 원문 제목이며 번역하지 않았어요. 누르면 기사 출처로 이동해요. 🔄 ' + kst(data.retrieved_at) + ' KST 확인 · 투자 추천이 아니에요.'));
      return;
    }
    panel.append(section('📋 공시', data.disclosures, (row) => { const item = make('li'); item.append(make('span', 'ts-news-title', row.title), make('small', '', row.source + ' · ' + kst(row.published_at))); return item; }, data.failed.includes('disclosures') ? '공시를 불러오지 못했어요.' : '최근 공시가 없어요.'));
    panel.append(make('p', 'muted-note', '제목만 모은 목록이에요. 기사 본문은 누르면 네이버 뉴스에서 열려요. 🔄 ' + kst(data.retrieved_at) + ' KST 확인 · 투자 추천이 아니에요.'));
  }
  async function loadNews(panel, id) {
    const code = id.slice(3), hit = newsCache.get(id), query = id.startsWith('US:') ? 'symbol=' : 'code=';
    if (hit && Date.now() - hit.at < 300000 && hit.data) { paintNews(panel, hit.data); return; }
    panel.replaceChildren(make('p', 'muted-note', '뉴스·공시를 불러오는 중이에요.'));
    try {
      const response = await fetch('api/stock-news?' + query + encodeURIComponent(code), {cache: 'no-store', signal: AbortSignal.timeout(25000)}), data = response.ok ? validNews(await response.json(), code) : null;
      newsCache.set(id, {at: Date.now(), data});
      if (panel.isConnected) { if (data) paintNews(panel, data); else panel.replaceChildren(make('p', 'muted-note', '뉴스·공시를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.')); }
    } catch (_) { if (panel.isConnected) panel.replaceChildren(make('p', 'muted-note', '뉴스·공시를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.')); }
  }
  function build(data, id, standalone = false) {
    const facts = data.facts, money = moneyFor(data.currency), box = make('section', 'ts-facts'); box.dataset.identity = id; box.setAttribute('aria-label', data.name + ' 핵심 숫자');
    if (standalone) {
      box.dataset.standalone = 'true';
      const title = make('div', 'ts-title'); title.append(make('h2', '', data.name), make('small', '', id.slice(3) + (data.market === 'US' ? ' · 미국' : ' · 국내')));
      const more = make('button', 'secondary-button ts-more', '🧪 분석·모의 매매 화면'); more.type = 'button';
      more.title = '수집한 기업 목록에 있는 종목만 열려요.'; more.addEventListener('click', () => { standaloneId = ''; window.ZEROExplore?.openCompany?.(id); });
      box.append(title, more);
    }
    const head = make('div', 'ts-head'), dir = direction(data.change), price = make('div', 'ts-price');
    price.append(make('strong', '', money(data.price)), make('span', 'th-' + dir, '어제보다 ' + (data.change > 0 ? '+' : data.change < 0 ? '-' : '') + money(Math.abs(data.change)) + ' (' + Math.abs(data.change_rate).toFixed(2) + '%)'));
    const heart = make('button', 'th-heart'), sync = () => { const on = window.ZEROExplore?.favorites?.().includes(id); heart.textContent = on ? '♥' : '♡'; heart.classList.toggle('th-on', Boolean(on)); heart.setAttribute('aria-pressed', String(Boolean(on))); heart.setAttribute('aria-label', data.name + ' 관심 종목' + (on ? ' 해제' : ' 담기')); };
    heart.type = 'button'; heart.addEventListener('click', () => { try { window.ZEROExplore?.toggleFavorite?.(id); } catch (error) { heart.title = error.message === 'WATCHLIST_LIMIT' ? '관심 종목은 최대 30개예요.' : '저장하지 못했어요.'; } sync(); }); sync();
    head.append(price, heart); box.append(head);
    if (standalone) { const chart = lineChart(data.daily, money); if (chart) box.append(chart); }
    // 시세 탭
    const quote = make('div', 'ts-panel'), points = summaryLines(data);
    if (points.length) { const box = make('div', 'ts-summary'), list = make('ul'); points.forEach((line) => list.append(make('li', '', line))); box.append(make('h3', '', '📝 숫자로 읽기'), list, make('small', '', '받은 숫자에서 계산한 사실이에요. 투자 추천이 아니에요.')); quote.append(box); }
    const ranges = [rangeBar('1일', facts.low, facts.high, data.price, money), rangeBar('52주', facts.low52, facts.high52, data.price, money)].filter(Boolean);
    if (ranges.length) { const wrap = make('div', 'ts-ranges'); wrap.append(...ranges); quote.append(wrap); }
    const chips = [['💰 시가총액', facts.market_cap], ['📦 거래량', Number.isInteger(facts.volume) ? facts.volume.toLocaleString('ko-KR') + '주' : null], ['💵 거래대금', facts.trading_value]].filter(([, value]) => value);
    if (chips.length) quote.append(chipGrid(chips));
    // 수정 사유: 카카오증권 스타일 '오늘의 주가 예측 찬반 투표' 및 토스증권 스타일 '주식 모으기 플랜' 통합 배치
    quote.append(sentimentPanel(data), accumulatorPanel(data));
    quote.append(make('p', 'muted-note', '🔄 ' + kst(data.retrieved_at) + ' KST 확인 · ' + (data.source?.label || '공개 시세') + ' · 장중에는 바뀌어요.' + (data.market === 'US' ? ' 시세는 지연될 수 있어요.' : '')));
    const tabList = tabsFor(data), panels = {quote, news: make('div', 'ts-news-panel'), orderbook: orderbookPanel(data), floor: floorPanel(data, id), community: communityPanel(data, id)};
    if (tabList.some(([key]) => key === 'trade')) panels.trade = tradePanel(data);
    if (tabList.some(([key]) => key === 'info')) panels.info = infoPanel(data);
    const tabs = make('div', 'ts-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', data.name + ' 정보');
    const show = (key) => {
      activeTab = key;
      tabs.querySelectorAll('button').forEach((button) => { const on = button.dataset.tab === key; button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1; if (on) button.scrollIntoView?.({inline: 'nearest', block: 'nearest'}); });
      Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== key; });
      if (key === 'news' && !panels.news.dataset.loaded) { panels.news.dataset.loaded = 'true'; loadNews(panels.news, id); }
    };
    tabList.forEach(([key, label]) => { const [icon, ...rest] = label.split(' '), button = make('button'); button.append(make('span', 'ts-tab-icon', icon), ' ' + rest.join(' ')); button.type = 'button'; button.dataset.tab = key; button.setAttribute('role', 'tab'); button.addEventListener('click', () => show(key)); tabs.append(button); });
    tabs.addEventListener('keydown', (event) => { const keys = tabList.map(([key]) => key), at = keys.indexOf(activeTab), step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (step) { show(keys[(at + step + keys.length) % keys.length]); tabs.querySelector('[aria-selected="true"]').focus(); event.preventDefault(); } });
    box.append(tabs, ...tabList.map(([key]) => panels[key])); show(tabList.some(([key]) => key === activeTab) ? activeTab : 'quote');
    return box;
  }
  function skeleton(target, text) { const note = make('p', 'stock-empty ts-loading', text); target.replaceChildren(note); return note; }
  function showStandalone(id) {
    if (!/^(KR:[0-9A-Z]{6}|US:[A-Z][A-Z0-9.-]{0,9})$/.test(id)) { window.ZEROExplore?.openCompany?.(id); return; }
    standaloneId = id; standaloneFrom = identity();
    // The default stock must not load behind this screen, so the route is changed without opening one.
    window.ZERO?.navigate?.('workbench', false);
    if (window.history?.pushState && window.location.hash !== '#workbench') window.history.pushState({view: 'workbench'}, '', '#workbench');
    const target = document.getElementById('stock-workbench');
    if (target) skeleton(target, '종목 자료를 불러오는 중이에요.');
    sync(true);
  }
  async function sync(force = false) {
    const target = document.getElementById('stock-workbench'), quote = document.getElementById('stock-quote');
    if (standaloneId && identity() && identity() !== standaloneFrom) standaloneId = '';  // the app moved to another stock by itself
    const standalone = Boolean(standaloneId), id = standaloneId || identity(), match = /^(KR|US):([0-9A-Z.-]{1,10})$/.exec(id);
    const current = target?.querySelector(':scope > .ts-facts'), us = match?.[1] === 'US';
    if (!target || (!quote && !standalone) || !match || (us && !standalone)) { current?.remove(); return; }
    if (!force && current?.dataset.identity === id) return;
    const mine = ++token;
    try {
      let hit = cache.get(id);
      if (force || !hit || Date.now() - hit.at > 60000) {
        const response = await fetch((us ? 'api/us-stock?symbol=' : 'api/stock-info?code=') + encodeURIComponent(match[2]), {cache: 'no-store', signal: AbortSignal.timeout(25000)}), data = response.ok ? validInfo(await response.json(), match[2]) : null;
        hit = {at: Date.now(), data}; cache.set(id, hit);
      }
      if (mine !== token || (standaloneId || identity()) !== id) return;  // a newer request or another stock took over
      if (standalone) {
        if (hit.data) target.replaceChildren(build(hit.data, id, true));
        else {
          const note = skeleton(target, '종목 정보를 불러오지 못했어요.'), retry = make('button', 'secondary-button', '다시 시도');
          retry.type = 'button'; retry.addEventListener('click', () => { skeleton(target, '종목 자료를 불러오는 중이에요.'); sync(true); }); note.after(retry);
        }
        return;
      }
      target.querySelector(':scope > .ts-facts')?.remove();
      const liveQuote = document.getElementById('stock-quote');
      if (hit.data && liveQuote) liveQuote.after(build(hit.data, id));
    } catch (_) {
      if (mine === token && standalone && standaloneId === id) {
        const note = skeleton(target, '종목 정보를 불러오지 못했어요.'), retry = make('button', 'secondary-button', '다시 시도');
        retry.type = 'button'; retry.addEventListener('click', () => { skeleton(target, '종목 자료를 불러오는 중이에요.'); sync(true); }); note.after(retry);
      }
    }
  }
  const watch = () => { const target = document.getElementById('stock-workbench'); if (target) new MutationObserver(() => sync()).observe(target, {childList: true}); };
  window.addEventListener('hashchange', sync);
  document.addEventListener('zero-view-changed', (event) => { if (event.detail?.view !== 'workbench') standaloneId = ''; else setTimeout(sync, 300); });
  document.addEventListener('zero-watchlist-changed', () => { if (document.querySelector('#stock-workbench > .ts-facts')) sync(true); });
  setInterval(() => { if (!document.hidden && document.documentElement.dataset.zeroView === 'workbench' && document.querySelector('#stock-workbench > .ts-facts')) sync(true); }, 60000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { watch(); sync(); }); else { watch(); sync(); }
})();
