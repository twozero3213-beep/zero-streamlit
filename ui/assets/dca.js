/* 주식 모으기 계산기: "매달 같은 금액을 사 모았다면?"을 저장된 일봉으로 되돌려 본다.
   과거 기록을 되돌려 본 것이며 미래를 보장하지 않는다. 수수료·세금·배당·환율은 넣지 않는다. 순수 계산은 simulate에 있다. */
(() => {
  'use strict';
  // Round away binary noise (3.9 - 4.3 is -0.3999999999999999) before cutting to two decimals; the cut itself never rounds up.
  const cut = (value) => Math.trunc(Math.round(value * 1e6) / 1e4) / 100;
  const monthOf = (at) => String(at).slice(0, 7);
  // bars: oldest first, each {at, close}. One purchase on the first bar of every calendar month, fractional shares allowed.
  function simulate(bars, amount) {
    if (!Array.isArray(bars) || !(amount > 0)) return null;
    const rows = bars.filter((bar) => Number.isFinite(bar?.close) && bar.close > 0);
    const buyAt = new Set(), seen = new Set();
    rows.forEach((bar, index) => { const month = monthOf(bar.at); if (!seen.has(month)) { seen.add(month); buyAt.add(index); } });
    if (buyAt.size < 2) return null;
    let invested = 0, shares = 0;
    const lumpShares = amount * buyAt.size / rows[0].close;
    const points = rows.map((bar, index) => {
      if (buyAt.has(index)) { invested += amount; shares += amount / bar.close; }
      return {at: bar.at, invested, dca: shares * bar.close, lump: lumpShares * bar.close};
    });
    const last = points[points.length - 1], price = rows[rows.length - 1].close;
    const dcaReturn = (last.dca / last.invested - 1) * 100, lumpReturn = (last.lump / last.invested - 1) * 100;
    return {points, summary: {months: buyAt.size, invested: last.invested, dcaValue: last.dca, lumpValue: last.lump, dcaReturn, lumpReturn,
      averageCost: last.invested / shares, lastPrice: price, winner: Math.abs(dcaReturn - lumpReturn) < 0.005 ? 'TIE' : dcaReturn > lumpReturn ? 'DCA' : 'LUMP'}};
  }
  // A round starting amount near one share, so the first picture is readable for any price level.
  function niceAmount(price) {
    if (!(price > 0)) return 100;
    const base = Math.pow(10, Math.floor(Math.log10(price)));
    return Math.max(1, Math.round(price / base) * base);
  }
  const api = {simulate, niceAmount, cut};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.ZERODcaLogic = api;

  const root = document.getElementById('dca-panel');
  if (!root || !window.ZERODesk?.dailySeries) return;
  const node = (tag, className = '', text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const svgNode = (tag, attrs = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  const input = document.getElementById('dca-amount'), body = document.getElementById('dca-body'), unit = document.getElementById('dca-unit');
  let lastId = null;
  const fmt = (value) => cut(value).toLocaleString('ko-KR', {maximumFractionDigits: 2});
  const sign = (value) => (value >= 0 ? '+' : '−') + fmt(Math.abs(value)) + '%';

  function chart(points) {
    const width = 640, height = 220, left = 8, right = 8, top = 12, bottom = 22;
    const high = Math.max(...points.flatMap((p) => [p.invested, p.dca, p.lump])), low = Math.min(...points.flatMap((p) => [p.invested, p.dca, p.lump]).filter((v) => v > 0), high);
    const span = high - low || high * 0.1 || 1, x = (i) => left + (width - left - right) * i / Math.max(1, points.length - 1), y = (v) => top + (height - top - bottom) * (1 - (v - low) / span);
    const svg = svgNode('svg', {viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': '매달 사 모은 평가액, 한 번에 산 평가액, 넣은 돈의 변화 그래프'});
    [['invested', '#8a97a8', '5 4'], ['lump', '#e8833a', ''], ['dca', '#1b64da', '']].forEach(([key, color, dash]) => {
      const line = svgNode('polyline', {points: points.map((p, i) => x(i).toFixed(1) + ',' + y(p[key] || low).toFixed(1)).join(' '), fill: 'none', stroke: color, 'stroke-width': key === 'dca' ? 3 : 2, 'stroke-linejoin': 'round'});
      if (dash) line.setAttribute('stroke-dasharray', dash); svg.append(line);
    });
    return svg;
  }
  function card(emoji, label, value, extra) {
    const element = node('div', 'dca-card'); element.append(node('span', 'dca-emoji', emoji), node('small', '', label), node('strong', '', value));
    if (extra) element.append(node('em', extra.startsWith('+') ? 'gain' : extra.startsWith('−') ? 'loss' : '', extra)); return element;
  }
  function render() {
    const id = document.getElementById('study-company')?.value, data = id ? window.ZERODesk.dailySeries(id) : null;
    if (!data?.bars?.length) { body.replaceChildren(node('p', 'dca-empty', '📭 이 종목의 일봉 기록이 아직 없어요. 자료를 다시 불러와 주세요.')); return; }
    if (id !== lastId) { input.value = String(niceAmount(data.bars[data.bars.length - 1].close)); lastId = id; }
    unit.textContent = data.currency;
    const amount = Number(input.value), result = simulate(data.bars, amount);
    if (!result) { body.replaceChildren(node('p', 'dca-empty', amount > 0 ? '📅 기록이 두 달 이상 있어야 비교할 수 있어요.' : '🪙 금액을 1 이상으로 넣어 주세요.')); return; }
    const s = result.summary, winner = {DCA: '🏆 이번 기간엔 매달 모으기가 앞섰어요', LUMP: '🏆 이번 기간엔 한 번에 사는 쪽이 앞섰어요', TIE: '🤝 두 방법이 비슷했어요'}[s.winner];
    const cards = node('div', 'dca-cards');
    cards.append(card('🪙', '넣은 돈', fmt(s.invested) + ' ' + data.currency, s.months + '번 나눠서'), card('📅', '매달 모으기', fmt(s.dcaValue), sign(s.dcaReturn)), card('💰', '한 번에 사기', fmt(s.lumpValue), sign(s.lumpReturn)), card('⚖️', '평균 산 가격', fmt(s.averageCost), '지금 ' + fmt(s.lastPrice)));
    const legend = node('p', 'dca-legend'); legend.append(node('span', 'dca-dot dca-blue', '🔵 매달 모으기'), node('span', 'dca-dot dca-orange', '🟠 한 번에 사기'), node('span', 'dca-dot dca-gray', '⚪ 넣은 돈'));
    body.replaceChildren(node('p', 'dca-winner', winner), cards, chart(result.points), legend,
      node('p', 'dca-note', '저장된 일봉을 되돌려 본 결과예요. 앞으로를 보장하지 않아요. 수수료·세금·배당·환율은 빠졌고 소수점 매수를 가정했어요.'));
  }
  input.addEventListener('input', render);
  document.addEventListener('zero-desk-rendered', render);
  document.getElementById('study-company')?.addEventListener('change', render);
  window.ZERODca = {render};
  render();
})();
