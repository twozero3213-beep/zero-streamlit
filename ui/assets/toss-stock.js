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
  // 일별 종가를 작은 선 그래프 좌표로(날짜순, 숫자가 아닌 점은 버림). 두 점 미만이면 null.
  function chartPoints(daily, width = 600, height = 180, pad = 8) {
    const rows = (Array.isArray(daily) ? daily : []).filter((row) => /^20\d{2}-\d{2}-\d{2}$/.test(row?.date) && num(row.close) !== null && row.close > 0).sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length < 2) return null;
    const values = rows.map((row) => row.close), low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
    return {rows, low, high, points: rows.map((row, index) => [pad + (width - 2 * pad) * index / (rows.length - 1), pad + (height - 2 * pad) * (1 - (row.close - low) / span)])};
  }
  // 응답 검증. 형식이 틀리면 null.
  function validInfo(data, code) {
    if (data?.scope !== 'PUBLIC_STOCK_INFO' || data.schema_version !== 1 || data.orders_authorized !== false || data.code !== code || data.unit !== 'SHARES'
      || typeof data.name !== 'string' || !data.name || num(data.price) === null || data.price <= 0 || num(data.change) === null || num(data.change_rate) === null
      || !data.facts || typeof data.facts !== 'object' || !Array.isArray(data.investors) || !Number.isFinite(Date.parse(data.retrieved_at))) return null;
    const investors = data.investors.filter((row) => /^20\d{2}-\d{2}-\d{2}$/.test(row?.date) && [row.individual, row.foreign, row.institution].every(Number.isInteger)).slice(0, 10);
    const daily = (Array.isArray(data.daily) ? data.daily : []).filter((row) => /^20\d{2}-\d{2}-\d{2}$/.test(row?.date) && Number.isInteger(row.close) && row.close > 0).slice(-120);
    const peers = (Array.isArray(data.peers) ? data.peers : []).filter((row) => /^[0-9A-Z]{6}$/.test(row?.code) && typeof row.name === 'string' && row.name && ['KOSPI', 'KOSDAQ'].includes(row.market) && num(row.price) > 0 && num(row.change_rate) !== null).slice(0, 5);
    return {...data, investors, daily, peers};
  }
  // 뉴스·공시 응답 검증: 제목·언론사·시각·네이버 뉴스 주소만. 형식이 틀린 행은 버리고, 틀린 응답은 null.
  const ARTICLE = /^https:\/\/n\.news\.naver\.com\/mnews\/article\/\d{3}\/\d{10}$/, STAMP = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
  function validNews(data, code) {
    if (data?.scope !== 'PUBLIC_STOCK_NEWS' || data.schema_version !== 1 || data.orders_authorized !== false || data.code !== code || !Array.isArray(data.news) || !Array.isArray(data.disclosures) || !Number.isFinite(Date.parse(data.retrieved_at))) return null;
    const text = (value) => typeof value === 'string' && value.trim() && !/[<>\uFFFD]/.test(value);
    return {...data,
      news: data.news.filter((row) => text(row?.title) && text(row.publisher) && ARTICLE.test(row.url) && STAMP.test(row.published_at)).slice(0, 10),
      disclosures: data.disclosures.filter((row) => text(row?.title) && text(row.source) && STAMP.test(row.published_at)).slice(0, 10)};
  }
  const api = {rangePosition, shares, investorBars, validInfo, validNews, direction, chartPoints};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.ZEROTossStock = {...api, show: (id) => showStandalone(id)};

  const make = (tag, className = '', text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const won = (value) => value.toLocaleString('ko-KR') + '원';
  const pct = (rate) => ({up: '▲ ', down: '▼ ', flat: '■ '}[direction(rate)]) + Math.abs(rate).toFixed(2) + '%';
  const kst = (iso) => new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(iso));
  const cache = new Map();
  let standaloneId = '', standaloneFrom = '', activeTab = 'quote', token = 0;  // standaloneId: 홈 순위·관심·같은 업종에서 방금 누른 종목. 느린 기존 종목 화면(목록 불러오기) 없이 이 화면이 바로 연다.
  const newsCache = new Map();
  const identity = () => { try { return new URLSearchParams((window.location.hash.split('?')[1]) || '').get('identity') || ''; } catch (_) { return ''; } };

  function rangeBar(label, low, high, price) {
    const position = rangePosition(low, high, price); if (position === null) return null;
    const box = make('div', 'ts-range'), track = make('span', 'ts-track'), dot = make('b', 'ts-dot'), ends = make('span', 'ts-ends');
    box.setAttribute('role', 'img'); box.setAttribute('aria-label', label + ' 범위 ' + won(low) + '에서 ' + won(high) + ', 현재 ' + Math.round(position * 100) + '% 위치');
    dot.style.left = (position * 100).toFixed(1) + '%'; track.append(dot);
    ends.append(make('span', 'th-down', won(low)), make('strong', '', label), make('span', 'th-up', won(high)));
    box.append(ends, track); return box;
  }
  function lineChart(daily) {
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
  const TABS = [['quote', '💹 시세'], ['trade', '👥 거래현황'], ['info', '🏷️ 종목정보'], ['news', '📰 뉴스·공시']];
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
  function paintNews(panel, data) {
    panel.replaceChildren();
    const section = (title, rows, render, empty) => { const box = make('div', 'ts-news-section'); box.append(make('h3', '', title)); if (!rows.length) box.append(make('p', 'muted-note', empty)); else { const list = make('ul', 'ts-news'); rows.forEach((row) => list.append(render(row))); box.append(list); } return box; };
    panel.append(section('📰 뉴스', data.news, (row) => { const item = make('li'), link = make('a', 'ts-news-title', row.title); link.href = row.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(link, make('small', '', row.publisher + ' · ' + kst(row.published_at))); return item; }, data.failed.includes('news') ? '뉴스를 불러오지 못했어요.' : '최근 뉴스가 없어요.'));
    panel.append(section('📋 공시', data.disclosures, (row) => { const item = make('li'); item.append(make('span', 'ts-news-title', row.title), make('small', '', row.source + ' · ' + kst(row.published_at))); return item; }, data.failed.includes('disclosures') ? '공시를 불러오지 못했어요.' : '최근 공시가 없어요.'));
    panel.append(make('p', 'muted-note', '제목만 모은 목록이에요. 기사 본문은 누르면 네이버 뉴스에서 열려요. 🔄 ' + kst(data.retrieved_at) + ' KST 확인 · 투자 추천이 아니에요.'));
  }
  async function loadNews(panel, id) {
    const code = id.slice(3), hit = newsCache.get(id);
    if (hit && Date.now() - hit.at < 300000 && hit.data) { paintNews(panel, hit.data); return; }
    panel.replaceChildren(make('p', 'muted-note', '뉴스·공시를 불러오는 중이에요.'));
    try {
      const response = await fetch('api/stock-news?code=' + code, {cache: 'no-store', signal: AbortSignal.timeout(25000)}), data = response.ok ? validNews(await response.json(), code) : null;
      newsCache.set(id, {at: Date.now(), data});
      if (panel.isConnected) { if (data) paintNews(panel, data); else panel.replaceChildren(make('p', 'muted-note', '뉴스·공시를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.')); }
    } catch (_) { if (panel.isConnected) panel.replaceChildren(make('p', 'muted-note', '뉴스·공시를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.')); }
  }
  function build(data, id, standalone = false) {
    const facts = data.facts, box = make('section', 'ts-facts'); box.dataset.identity = id; box.setAttribute('aria-label', data.name + ' 핵심 숫자');
    if (standalone) {
      box.dataset.standalone = 'true';
      const title = make('div', 'ts-title'); title.append(make('h2', '', data.name), make('small', '', id.slice(3) + ' · 국내'));
      const more = make('button', 'secondary-button ts-more', '🧪 분석·모의 매매 화면'); more.type = 'button';
      more.title = '수집한 기업 목록에 있는 종목만 열려요.'; more.addEventListener('click', () => { standaloneId = ''; window.ZEROExplore?.openCompany?.(id); });
      box.append(title, more);
    }
    const head = make('div', 'ts-head'), dir = direction(data.change), price = make('div', 'ts-price');
    price.append(make('strong', '', won(data.price)), make('span', 'th-' + dir, '어제보다 ' + (data.change > 0 ? '+' : '') + data.change.toLocaleString('ko-KR') + '원 (' + Math.abs(data.change_rate).toFixed(2) + '%)'));
    const heart = make('button', 'th-heart'), sync = () => { const on = window.ZEROExplore?.favorites?.().includes(id); heart.textContent = on ? '♥' : '♡'; heart.classList.toggle('th-on', Boolean(on)); heart.setAttribute('aria-pressed', String(Boolean(on))); heart.setAttribute('aria-label', data.name + ' 관심 종목' + (on ? ' 해제' : ' 담기')); };
    heart.type = 'button'; heart.addEventListener('click', () => { try { window.ZEROExplore?.toggleFavorite?.(id); } catch (error) { heart.title = error.message === 'WATCHLIST_LIMIT' ? '관심 종목은 최대 30개예요.' : '저장하지 못했어요.'; } sync(); }); sync();
    head.append(price, heart); box.append(head);
    if (standalone) { const chart = lineChart(data.daily); if (chart) box.append(chart); }
    // 시세 탭
    const quote = make('div', 'ts-panel'), ranges = [rangeBar('1일', facts.low, facts.high, data.price), rangeBar('52주', facts.low52, facts.high52, data.price)].filter(Boolean);
    if (ranges.length) { const wrap = make('div', 'ts-ranges'); wrap.append(...ranges); quote.append(wrap); }
    const chips = [['💰 시가총액', facts.market_cap], ['📦 거래량', Number.isInteger(facts.volume) ? facts.volume.toLocaleString('ko-KR') + '주' : null], ['💵 거래대금', facts.trading_value]].filter(([, value]) => value);
    if (chips.length) quote.append(chipGrid(chips));
    quote.append(make('p', 'muted-note', '🔄 ' + kst(data.retrieved_at) + ' KST 확인 · 네이버페이 증권 공개 시세 · 장중에는 바뀌어요.'));
    const panels = {quote, trade: tradePanel(data), info: infoPanel(data), news: make('div', 'ts-news-panel')};
    const tabs = make('div', 'ts-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', data.name + ' 정보');
    const show = (key) => {
      activeTab = key;
      tabs.querySelectorAll('button').forEach((button) => { const on = button.dataset.tab === key; button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1; if (on) button.scrollIntoView?.({inline: 'nearest', block: 'nearest'}); });
      Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== key; });
      if (key === 'news' && !panels.news.dataset.loaded) { panels.news.dataset.loaded = 'true'; loadNews(panels.news, id); }
    };
    TABS.forEach(([key, label]) => { const [icon, ...rest] = label.split(' '), button = make('button'); button.append(make('span', 'ts-tab-icon', icon), ' ' + rest.join(' ')); button.type = 'button'; button.dataset.tab = key; button.setAttribute('role', 'tab'); button.addEventListener('click', () => show(key)); tabs.append(button); });
    tabs.addEventListener('keydown', (event) => { const keys = TABS.map(([key]) => key), at = keys.indexOf(activeTab), step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (step) { show(keys[(at + step + keys.length) % keys.length]); tabs.querySelector('[aria-selected="true"]').focus(); event.preventDefault(); } });
    box.append(tabs, ...Object.values(panels)); show(TABS.some(([key]) => key === activeTab) ? activeTab : 'quote');
    return box;
  }
  function skeleton(target, text) { const note = make('p', 'stock-empty ts-loading', text); target.replaceChildren(note); return note; }
  function showStandalone(id) {
    if (!/^KR:[0-9A-Z]{6}$/.test(id)) { window.ZEROExplore?.openCompany?.(id); return; }
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
    const standalone = Boolean(standaloneId), id = standaloneId || identity(), match = /^KR:([0-9A-Z]{6})$/.exec(id);
    const current = target?.querySelector(':scope > .ts-facts');
    if (!target || (!quote && !standalone) || !match) { current?.remove(); return; }
    if (!force && current?.dataset.identity === id) return;
    const mine = ++token;
    try {
      let hit = cache.get(id);
      if (force || !hit || Date.now() - hit.at > 60000) {
        const response = await fetch('api/stock-info?code=' + match[1], {cache: 'no-store', signal: AbortSignal.timeout(25000)}), data = response.ok ? validInfo(await response.json(), match[1]) : null;
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
