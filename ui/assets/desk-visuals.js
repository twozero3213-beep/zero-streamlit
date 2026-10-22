/* 경제 지표·보고서 화면을 글보다 그림으로: 아이콘, 미니 추세선, 변화 화살표, 평소 범위 게이지, 기관 타일, 신선도 칩.
   research-desk.js가 만든 카드와 행을 그린 뒤 꾸민다. 계산은 순수 함수에 있고, 값이 없으면 그림을 만들지 않는다(추정으로 채우지 않는다). */
(() => {
  'use strict';
  // Round away binary noise (3.9 - 4.3 is -0.3999999999999999) before cutting to two decimals; the cut itself never rounds up.
  const cut = (value) => Math.trunc(Math.round(value * 1e6) / 1e4) / 100;
  const num = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value));
  const DAY = 86400000;

  // 직전 값 대비 변화. 금리·비율 지표는 퍼센트보다 같은 단위의 차이가 덜 헷갈려서 차이로 보여 준다.
  function trendOf(latest, previous) {
    const a = num(latest), b = num(previous);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const diff = cut(a - b);
    return {dir: diff > 0 ? 'UP' : diff < 0 ? 'DOWN' : 'FLAT', diff, arrow: diff > 0 ? '▲' : diff < 0 ? '▼' : '■'};
  }
  // 관측 이력을 작은 선 그래프 좌표로. 날짜순으로 정렬하고 숫자가 아닌 점은 버린다. 두 점 미만이면 null.
  function sparkPoints(history, width = 96, height = 28, pad = 3) {
    const rows = (Array.isArray(history) ? history : []).filter((row) => typeof row?.period === 'string' && Number.isFinite(num(row.value))).sort((x, y) => x.period.localeCompare(y.period));
    if (rows.length < 2) return null;
    const values = rows.map((row) => Number(row.value)), low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
    return values.map((value, index) => [pad + (width - 2 * pad) * index / (values.length - 1), pad + (height - 2 * pad) * (1 - (value - low) / span)]);
  }
  // 최신 값이 과거 분포(하위 25%~상위 25% 경계)의 어디쯤인지. 눈금은 중간 50% 범위의 양옆으로 한 칸씩 넓힌다.
  function gauge(latest, statistics) {
    const value = num(latest), p25 = num(statistics?.p25), p75 = num(statistics?.p75);
    if (!statistics?.available || ![value, p25, p75].every(Number.isFinite) || !(p75 > p25)) return null;
    const room = p75 - p25, low = p25 - room, high = p75 + room, pos = Math.min(1, Math.max(0, (value - low) / (high - low)));
    const zone = value < p25 ? 'LOW' : value > p75 ? 'HIGH' : 'MID';
    return {pos, zone, left: (p25 - low) / (high - low), right: (p75 - low) / (high - low), label: {LOW: '평소보다 낮아요', MID: '평소 범위 안이에요', HIGH: '평소보다 높아요'}[zone]};
  }
  const ICONS = {EMPLOYMENT: '💼', INFLATION: '🛒', MARKETS: '📈', ACTIVITY: '📊'};
  const categoryIcon = (category) => ICONS[category] || '📊';
  const INSTITUTIONS = {BOK: ['🏦', '한국은행'], FED: ['🏛️', '미국 연준'], BIS: ['🌍', '국제결제은행'], TOSS: ['💙', '토스'], OTHER: ['📄', '기타']};
  const KINDS = {MACRO_RESEARCH: ['📊', '경제 연구'], POLICY_RELEASE: ['📣', '정책 발표'], EDUCATION: ['🎓', '투자 공부']};
  // 발표일이 얼마나 최근인지: 7일 이내 NEW, 30일 이내 RECENT, 그 이전 OLD, 날짜를 못 읽으면 null.
  function freshness(date, now = Date.now()) {
    const time = Date.parse(date);
    if (!Number.isFinite(time)) return null;
    const days = Math.floor((now - time) / DAY);
    if (days < 0) return {key: 'NEW', days: 0, icon: '🆕', label: '새 자료'};
    return days <= 7 ? {key: 'NEW', days, icon: '🆕', label: days === 0 ? '오늘' : days + '일 전'} : days <= 30 ? {key: 'RECENT', days, icon: '🕒', label: days + '일 전'} : {key: 'OLD', days, icon: '📁', label: days > 365 ? Math.floor(days / 365) + '년 전' : Math.floor(days / 30) + '개월 전'};
  }
  // 보고서 행의 data 속성으로 기관별 건수와 가장 최근 발표일을 모은다(숨겨진 페이지의 행도 센다).
  function tally(rows) {
    const out = new Map();
    rows.forEach(({institution, published}) => {
      const key = INSTITUTIONS[institution] ? institution : 'OTHER', entry = out.get(key) || {key, count: 0, newest: ''};
      entry.count++; if (published && published > entry.newest) entry.newest = published; out.set(key, entry);
    });
    return [...out.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }
  const api = {trendOf, sparkPoints, gauge, categoryIcon, freshness, tally, INSTITUTIONS, KINDS, cut};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.ZERODeskVisuals = api;

  const node = (tag, className = '', text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const svg = (tag, attrs = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  const fmt = (value) => cut(value).toLocaleString('ko-KR', {maximumFractionDigits: 2});

  function spark(history, dir) {
    const points = sparkPoints(history); if (!points) return null;
    const element = svg('svg', {viewBox: '0 0 96 28', class: 'dv-spark dv-' + dir.toLowerCase(), role: 'img', 'aria-label': '최근 관측 추세선'});
    element.append(svg('polyline', {points: points.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' '), fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}));
    const [x, y] = points[points.length - 1]; element.append(svg('circle', {cx: x.toFixed(1), cy: y.toFixed(1), r: 3})); return element;
  }
  function meter(info) {
    const box = node('span', 'dv-gauge dv-zone-' + info.zone.toLowerCase()); box.title = info.label;
    const track = node('span', 'dv-track'), band = node('i', 'dv-band'), dot = node('b', 'dv-dot');
    band.style.left = (info.left * 100).toFixed(1) + '%'; band.style.width = ((info.right - info.left) * 100).toFixed(1) + '%'; dot.style.left = (info.pos * 100).toFixed(1) + '%';
    track.append(band, dot); box.append(track, node('small', '', info.label)); return box;
  }
  function decorateMacro() {
    const items = new Map((window.ZERODesk?.macro?.() || []).map((item) => [item.id, item]));
    document.querySelectorAll('#macro-list .desk-indicator').forEach((card) => {
      const summary = card.querySelector('summary'), item = items.get(card.dataset.id);
      if (!summary || !item || summary.querySelector('.dv-icon')) return;
      const trend = trendOf(item.latest_value, item.previous_value), dir = trend?.dir || 'FLAT';
      summary.prepend(node('span', 'dv-icon', categoryIcon(window.ZERODesk?.macroCategory?.(item))));
      const visual = node('span', 'dv-visual'), sparkline = spark(item.history, dir);
      if (sparkline) visual.append(sparkline);
      if (trend) { const chip = node('span', 'dv-chip dv-' + dir.toLowerCase(), trend.arrow + ' ' + fmt(Math.abs(trend.diff))); chip.title = '직전 발표 대비 변화'; visual.append(chip); }
      const position = gauge(item.latest_value, item.statistics); if (position) visual.append(meter(position));
      if (visual.childElementCount) summary.append(visual);
    });
  }
  function decorateReports() {
    const list = document.getElementById('report-records-list'); if (!list) return;
    const rows = [...list.querySelectorAll('.desk-library-row')];
    rows.forEach((row) => {
      if (row.querySelector('.dv-badge')) return;
      const [flag] = INSTITUTIONS[row.dataset.institution] || INSTITUTIONS.OTHER, [kindIcon, kindName] = KINDS[row.dataset.kind] || ['📄', '공개 자료'];
      const badge = node('span', 'dv-badge', flag); badge.title = (INSTITUTIONS[row.dataset.institution] || INSTITUTIONS.OTHER)[1]; row.prepend(badge);
      const state = row.querySelector('.desk-library-state'), age = freshness(row.dataset.published);
      const meta = row.querySelector('.desk-library-date'); if (!meta) return;
      const kind = node('span', 'dv-kind', kindIcon); kind.title = kindName; meta.prepend(kind);
      if (age) { const chip = node('span', 'dv-fresh dv-fresh-' + age.key.toLowerCase(), age.icon + ' ' + age.label); meta.prepend(chip); }
      if (state) { state.textContent = '👀 본문 검토 전'; }
    });
    const host = list.parentElement; host.querySelector('.dv-tiles')?.remove();
    const counts = tally(rows.map((row) => ({institution: row.dataset.institution, published: row.dataset.published})));
    if (!counts.length) return;
    const tiles = node('div', 'dv-tiles'); tiles.setAttribute('aria-label', '기관별 보고서 수');
    counts.forEach((entry) => {
      const [flag, name] = INSTITUTIONS[entry.key], tile = node('div', 'dv-tile'); tile.append(node('span', 'dv-flag', flag), node('strong', '', String(entry.count)), node('small', '', name + (entry.newest ? ' · 최근 ' + entry.newest.slice(5) : '')));
      tiles.append(tile);
    });
    list.before(tiles);
  }
  document.addEventListener('zero-macro-rendered', decorateMacro);
  document.addEventListener('zero-reports-rendered', decorateReports);
  decorateMacro(); decorateReports();
})();
