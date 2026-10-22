// Live Korean stock rankings on the "시장" screen: 🔥 거래량, 🌏 외국인 순매수, 🏢 기관 순매수. Hosted-only extra: it needs
// this app's /api/market-rank route. The source gives rank order only, so no net-buy amount is shown or estimated.
(() => {
  'use strict';
  const KINDS = {VOLUME: ['🔥', '거래량'], FOREIGN: ['🌏', '외국인 순매수'], INSTITUTION: ['🏢', '기관 순매수']};
  const MARKETS = {KOSPI: '코스피', KOSDAQ: '코스닥', ALL: '코스피·코스닥'};
  // Keep only well-formed lists and rows; anything else means "no data", never a guess.
  function validRank(data) {
    if (data?.schema_version !== 1 || data.scope !== 'PUBLIC_MARKET_RANK' || data.orders_authorized !== false || data.amounts_included !== false
      || !Array.isArray(data.lists) || !Number.isFinite(Date.parse(data.retrieved_at))) return null;
    const lists = data.lists.filter((entry) => KINDS[entry?.kind] && MARKETS[entry.market] && Array.isArray(entry.items))
      .map((entry) => ({...entry, items: entry.items.filter((item) => /^[0-9A-Z]{6}$/.test(item?.code) && typeof item.name === 'string' && item.name
        && MARKETS[item.market] && item.market !== 'ALL' && Number.isFinite(item.price) && item.price > 0 && Number.isFinite(item.change_rate) && Number.isInteger(item.volume) && item.volume >= 0).slice(0, 10)}))
      .filter((entry) => entry.items.length);
    return lists.length ? {retrieved_at: data.retrieved_at, failed: Array.isArray(data.failed) ? data.failed : [], lists} : null;
  }
  // Bar length is the share of the list's largest volume, so the first row is not always the full width.
  const barWidths = (items) => { const top = Math.max(...items.map((item) => item.volume), 0); return items.map((item) => top ? Math.max(2, Math.round(item.volume / top * 100)) : 0); };
  const medal = (index) => ['🥇', '🥈', '🥉'][index] || String(index + 1);
  if (typeof module !== 'undefined' && module.exports) { module.exports = {validRank, barWidths, medal}; return; }

  const view = document.getElementById('analysis-view'), anchor = view?.querySelector('.analysis-panel');
  if (!view || !anchor) return;
  const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const style = make('style'); style.textContent = `
.mr-panel h2 { margin: 0 0 4px; } .mr-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.mr-tabs button { min-height: 44px; padding: 6px 14px; border: 1px solid var(--line, #e5e8eb); border-radius: 999px; background: #fff; color: #333d4b; font: inherit; font-size: 14px; cursor: pointer; }
.mr-tabs button[aria-pressed="true"] { background: #1b64da; border-color: #1b64da; color: #fff; font-weight: 700; }
.mr-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.mr-list li { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; padding: 10px 12px; border-radius: 14px; background: #f7f8fa; }
.mr-rank { font-size: 18px; font-weight: 700; text-align: center; color: #4e5968; } .mr-name { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; min-width: 0; word-break: keep-all; overflow-wrap: anywhere; }
.mr-name small { padding: 1px 6px; border-radius: 6px; background: #e8ebef; color: #4e5968; font-size: 12px; }
.mr-price { text-align: right; font-variant-numeric: tabular-nums; } .mr-price span { display: block; font-size: 13px; font-weight: 700; }
.mr-up { color: #c93b49; } .mr-down { color: #1b64da; } .mr-flat { color: #4e5968; }
.mr-bar { grid-column: 2 / -1; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #4e5968; } .mr-bar i { display: block; height: 8px; border-radius: 4px; background: #f59f00; }
.mr-panel .muted-note { word-break: keep-all; }`;
  document.head.append(style);
  const panel = make('section', 'panel mr-panel'), title = make('h2', '', '📊 지금 많이 거래되는 종목'), note = make('p', 'muted-note'), tabs = make('div', 'mr-tabs'), list = make('ol', 'mr-list'), foot = make('p', 'muted-note');
  title.id = 'market-rank-title'; panel.setAttribute('aria-labelledby', title.id); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '순위 종류');
  panel.hidden = true; panel.append(title, note, tabs, list, foot); anchor.after(panel);
  const kst = (iso) => new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(iso));
  let rank = null, chosen = 'KOSPI:VOLUME', loading = false;
  function draw() {
    if (!rank) return;
    if (!rank.lists.some((entry) => entry.market + ':' + entry.kind === chosen)) chosen = rank.lists[0].market + ':' + rank.lists[0].kind;
    tabs.replaceChildren(...rank.lists.map((entry) => {
      const key = entry.market + ':' + entry.kind, [icon, name] = KINDS[entry.kind], button = make('button', '', icon + ' ' + name + (entry.kind === 'VOLUME' ? ' · ' + MARKETS[entry.market] : ''));
      button.type = 'button'; button.setAttribute('aria-pressed', String(key === chosen)); button.addEventListener('click', () => { chosen = key; draw(); }); return button;
    }));
    const entry = rank.lists.find((row) => row.market + ':' + row.kind === chosen), widths = barWidths(entry.items);
    list.setAttribute('aria-label', KINDS[entry.kind][1] + ' 순위 ' + entry.items.length + '개');
    list.replaceChildren(...entry.items.map((item, index) => {
      const row = make('li'), name = make('span', 'mr-name'), price = make('span', 'mr-price', item.price.toLocaleString('ko-KR') + '원'), bar = make('span', 'mr-bar'), fill = make('i');
      const dir = item.change_rate > 0 ? 'up' : item.change_rate < 0 ? 'down' : 'flat';
      name.append(make('strong', '', item.name), make('small', '', MARKETS[item.market]));
      price.append(make('span', 'mr-' + dir, (dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '■ ') + Math.abs(item.change_rate).toFixed(2) + '%'));
      fill.style.width = widths[index] + '%'; bar.append(fill, make('span', '', '오늘 거래량 ' + item.volume.toLocaleString('ko-KR') + '주'));
      row.append(make('span', 'mr-rank', medal(index)), name, price, bar); return row;
    }));
    note.textContent = entry.kind === 'VOLUME' ? '오늘 거래된 주식 수가 많은 순서예요.' : KINDS[entry.kind][1].replace(' 순매수', '') + '이 많이 사들인 순서예요. 순매수 금액은 자료에 없어서 순서만 보여 줘요.';
    foot.textContent = '🔄 ' + kst(rank.retrieved_at) + ' KST 확인 · 네이버페이 증권 공개 순위 · 장중에는 계속 바뀌어요. 매매 추천이 아니에요.' + (rank.failed.length ? ' 일부 순위를 불러오지 못했어요.' : '');
    panel.hidden = false;
  }
  async function load() {
    if (loading || document.hidden || document.documentElement?.dataset.zeroView !== 'analysis') return; loading = true;
    try {
      const response = await fetch('api/market-rank', {cache: 'no-store', signal: AbortSignal.timeout(30000)});
      const data = response.ok ? validRank(await response.json()) : null;
      if (data) { rank = data; draw(); } else if (!rank) panel.hidden = true;
    } catch (_) { if (!rank) panel.hidden = true; } finally { loading = false; }
  }
  document.addEventListener('zero-view-changed', load);
  document.addEventListener('visibilitychange', load);
  load(); setInterval(load, 120000);
})();
