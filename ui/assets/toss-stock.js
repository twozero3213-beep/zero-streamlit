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
  // 응답 검증. 형식이 틀리면 null.
  function validInfo(data, code) {
    if (data?.scope !== 'PUBLIC_STOCK_INFO' || data.schema_version !== 1 || data.orders_authorized !== false || data.code !== code || data.unit !== 'SHARES'
      || typeof data.name !== 'string' || !data.name || num(data.price) === null || data.price <= 0 || num(data.change) === null || num(data.change_rate) === null
      || !data.facts || typeof data.facts !== 'object' || !Array.isArray(data.investors) || !Number.isFinite(Date.parse(data.retrieved_at))) return null;
    const investors = data.investors.filter((row) => /^20\d{2}-\d{2}-\d{2}$/.test(row?.date) && [row.individual, row.foreign, row.institution].every(Number.isInteger)).slice(0, 10);
    return {...data, investors};
  }
  const api = {rangePosition, shares, investorBars, validInfo, direction};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.ZEROTossStock = api;

  const make = (tag, className = '', text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const won = (value) => value.toLocaleString('ko-KR') + '원';
  const pct = (rate) => ({up: '▲ ', down: '▼ ', flat: '■ '}[direction(rate)]) + Math.abs(rate).toFixed(2) + '%';
  const kst = (iso) => new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(iso));
  const cache = new Map();
  const identity = () => { try { return new URLSearchParams((window.location.hash.split('?')[1]) || '').get('identity') || ''; } catch (_) { return ''; } };

  function rangeBar(label, low, high, price) {
    const position = rangePosition(low, high, price); if (position === null) return null;
    const box = make('div', 'ts-range'), track = make('span', 'ts-track'), dot = make('b', 'ts-dot'), ends = make('span', 'ts-ends');
    box.setAttribute('role', 'img'); box.setAttribute('aria-label', label + ' 범위 ' + won(low) + '에서 ' + won(high) + ', 현재 ' + Math.round(position * 100) + '% 위치');
    dot.style.left = (position * 100).toFixed(1) + '%'; track.append(dot);
    ends.append(make('span', 'th-down', won(low)), make('strong', '', label), make('span', 'th-up', won(high)));
    box.append(ends, track); return box;
  }
  function build(data, id) {
    const facts = data.facts, box = make('section', 'ts-facts'); box.dataset.identity = id; box.setAttribute('aria-label', data.name + ' 핵심 숫자');
    const head = make('div', 'ts-head'), dir = direction(data.change), price = make('div', 'ts-price');
    price.append(make('strong', '', won(data.price)), make('span', 'th-' + dir, '어제보다 ' + (data.change > 0 ? '+' : '') + data.change.toLocaleString('ko-KR') + '원 (' + Math.abs(data.change_rate).toFixed(2) + '%)'));
    const heart = make('button', 'th-heart'), sync = () => { const on = window.ZEROExplore?.favorites?.().includes(id); heart.textContent = on ? '♥' : '♡'; heart.classList.toggle('th-on', Boolean(on)); heart.setAttribute('aria-pressed', String(Boolean(on))); heart.setAttribute('aria-label', data.name + ' 관심 종목' + (on ? ' 해제' : ' 담기')); };
    heart.type = 'button'; heart.addEventListener('click', () => { try { window.ZEROExplore?.toggleFavorite?.(id); } catch (error) { heart.title = error.message === 'WATCHLIST_LIMIT' ? '관심 종목은 최대 30개예요.' : '저장하지 못했어요.'; } sync(); }); sync();
    head.append(price, heart); box.append(head);
    const ranges = [rangeBar('1일', facts.low, facts.high, data.price), rangeBar('52주', facts.low52, facts.high52, data.price)].filter(Boolean);
    if (ranges.length) { const wrap = make('div', 'ts-ranges'); wrap.append(...ranges); box.append(wrap); }
    const chips = [['💰 시가총액', facts.market_cap], ['📦 거래량', Number.isInteger(facts.volume) ? facts.volume.toLocaleString('ko-KR') + '주' : null], ['💵 거래대금', facts.trading_value],
      ['🌏 외국인 비중', num(facts.foreign_rate) !== null ? facts.foreign_rate.toFixed(2) + '%' : null], ['PER', num(facts.per) !== null ? facts.per + '배' : null], ['PBR', num(facts.pbr) !== null ? facts.pbr + '배' : null],
      ['🎁 배당수익률', num(facts.dividend_yield) !== null ? facts.dividend_yield + '%' : null]].filter(([, value]) => value);
    if (chips.length) { const grid = make('dl', 'ts-chips'); chips.forEach(([label, value]) => { const cell = make('div'); cell.append(make('dt', '', label), make('dd', '', String(value))); grid.append(cell); }); box.append(grid); }
    if (data.investors.length) {
      const table = make('div', 'ts-investors'), title = make('h3', '', '👥 개인·외국인·기관 순매수 (주)'), latest = investorBars(data.investors[0]), bars = make('div', 'ts-bars');
      latest.forEach((part) => { const row = make('div', 'ts-bar-row'), fill = make('i', 'th-bg-' + part.dir); fill.style.width = part.width + '%'; row.append(make('span', '', part.name), make('span', 'ts-bar-track', ''), make('strong', 'th-' + part.dir, shares(part.value))); row.querySelector('.ts-bar-track').append(fill); bars.append(row); });
      const scroll = make('div', 'ts-table-wrap'), grid = make('table', 'ts-table'), body = make('tbody'), top = make('thead'), headRow = make('tr');
      ['일자', '개인', '외국인', '기관'].forEach((label) => headRow.append(make('th', '', label))); top.append(headRow);
      data.investors.forEach((row) => { const tr = make('tr'); tr.append(make('td', '', row.date.slice(2).replaceAll('-', '.'))); [row.individual, row.foreign, row.institution].forEach((value) => tr.append(make('td', 'th-' + direction(value), shares(value)))); body.append(tr); });
      grid.append(top, body); scroll.append(grid); table.append(title, bars, scroll); box.append(table);
    }
    box.append(make('p', 'muted-note', '🔄 ' + kst(data.retrieved_at) + ' KST 확인 · 네이버페이 증권 공개 시세 · 순매수는 주식 수이며 금액이 아니에요. 장중에는 바뀌어요.'));
    return box;
  }
  let busy = false;
  async function sync() {
    const target = document.getElementById('stock-workbench'), quote = document.getElementById('stock-quote'), id = identity(), match = /^KR:([0-9A-Z]{6})$/.exec(id);
    const current = target?.querySelector(':scope > .ts-facts');
    if (!target || !quote || !match) { current?.remove(); return; }
    if (current?.dataset.identity === id) return;
    if (busy) return; busy = true;
    try {
      let hit = cache.get(id);
      if (!hit || Date.now() - hit.at > 60000) {
        const response = await fetch('api/stock-info?code=' + match[1], {cache: 'no-store', signal: AbortSignal.timeout(25000)}), data = response.ok ? validInfo(await response.json(), match[1]) : null;
        hit = {at: Date.now(), data}; cache.set(id, hit);
      }
      if (identity() !== id) return;
      target.querySelector(':scope > .ts-facts')?.remove();
      if (hit.data) quote.after(build(hit.data, id));
    } catch (_) { /* the screen simply stays as it was */ } finally { busy = false; }
  }
  const watch = () => { const target = document.getElementById('stock-workbench'); if (target) new MutationObserver(() => sync()).observe(target, {childList: true}); };
  window.addEventListener('hashchange', sync);
  document.addEventListener('zero-view-changed', (event) => { if (event.detail?.view === 'workbench') setTimeout(sync, 300); });
  document.addEventListener('zero-watchlist-changed', () => { const box = document.querySelector('#stock-workbench > .ts-facts'); if (box) { box.remove(); sync(); } });
  setInterval(() => { if (!document.hidden && document.documentElement.dataset.zeroView === 'workbench') { cache.clear(); const box = document.querySelector('#stock-workbench > .ts-facts'); if (box) { box.remove(); sync(); } } }, 60000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { watch(); sync(); }); else { watch(); sync(); }
})();
