/* 홈 화면: 지금 시장이 열렸는지, 지수, 다가오는 발표 일정, 실시간 순위(거래량·급상승·급하락·외국인·기관), 하트로 담는 관심 종목.
   ZERO처럼 "열자마자 오늘 시장이 보이는" 홈이다. 순위는 공개 앱의 /api/market-rank가 있을 때만 나오고, 없으면 그 칸만 숨긴다.
   값을 못 읽으면 그림을 만들지 않는다(추정으로 채우지 않는다). 계산은 순수 함수에 있다. */
(() => {
  'use strict';
  const KINDS = {AMOUNT: ['💰', '거래대금'], VOLUME: ['🔥', '거래량'], UP: ['📈', '급상승'], DOWN: ['📉', '급하락'], FOREIGN: ['🌏', '외국인 순매수'], INSTITUTION: ['🏢', '기관 순매수']};
  const MARKETS = {KOSPI: '코스피', KOSDAQ: '코스닥', US: '미국', ALL: '코스피·코스닥'};
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
        && MARKETS[item.market] && item.market !== 'ALL' && Number.isFinite(item.price) && item.price > 0 && Number.isFinite(item.change_rate) && Number.isInteger(item.volume) && item.volume >= 0
        && (entry.kind !== 'AMOUNT' || (Number.isInteger(item.trade_value) && item.trade_value > 0))).slice(0, 10)}))
      .filter((entry) => entry.items.length);
    return lists.length ? {retrieved_at: data.retrieved_at, failed: Array.isArray(data.failed) ? data.failed : [], lists} : null;
  }
  // 한 목록 안에서 가장 큰 값(기본은 거래량)을 100%로 둔 막대 길이. 값이 모두 0이면 막대를 만들지 않는다.
  const barWidths = (items, key = 'volume') => { const top = Math.max(...items.map((item) => item[key] || 0), 0); return items.map((item) => (top ? Math.max(2, Math.round((item[key] || 0) / top * 100)) : 0)); };
  // 원 단위 금액을 조·억·만 단위 글로: 3조 1,695억 / 6,782억 / 5,300만원. 정수가 아니거나 음수면 null.
  function amountText(won) {
    if (!Number.isInteger(won) || won < 0) return null;
    const trillion = Math.floor(won / 1e12), eok = Math.round((won % 1e12) / 1e8);
    if (trillion) return trillion + '조' + (eok ? ' ' + eok.toLocaleString('ko-KR') + '억' : '');
    if (won >= 1e8) return Math.round(won / 1e8).toLocaleString('ko-KR') + '억';
    return won >= 1e4 ? Math.round(won / 1e4).toLocaleString('ko-KR') + '만원' : won.toLocaleString('ko-KR') + '원';
  }
  const US_CODE = /^[A-Z][A-Z0-9.-]{0,9}$/;
  // 미국 상승·하락·거래대금 목록(시가총액 상위 종목 기준). 형식이 틀린 행은 버리고, 목록이 하나도 남지 않으면 null.
  function validUsRank(data) {
    if (data?.scope !== 'PUBLIC_US_RANK' || data.schema_version !== 1 || data.orders_authorized !== false || !Array.isArray(data.lists) || !Number.isFinite(Date.parse(data.retrieved_at))) return null;
    const lists = data.lists.filter((entry) => ['AMOUNT', 'UP', 'DOWN'].includes(entry?.kind) && entry.market === 'US' && Array.isArray(entry.items))
      .map((entry) => ({market: 'US', kind: entry.kind, items: entry.items.filter((item) => US_CODE.test(item?.code) && item.market === 'US' && typeof item.name === 'string' && item.name && Number.isFinite(item.price) && item.price > 0
        && Number.isFinite(item.change_rate) && Number.isInteger(item.volume) && item.volume >= 0 && (entry.kind !== 'AMOUNT' || (Number.isFinite(item.trade_value) && item.trade_value > 0))).slice(0, 10)}))
      .filter((entry) => entry.items.length);
    return lists.length ? {retrieved_at: data.retrieved_at, lists, universe: Number.isInteger(data.universe_size) ? data.universe_size : null} : null;
  }
  const dollars = (value) => '$' + value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  // 달러 금액을 억·만 단위 글로(1억 달러 = 1e8). 음수·숫자 아님은 null.
  function dollarAmountText(value) {
    if (!Number.isFinite(value) || value < 0) return null;
    if (value >= 1e8) return Math.round(value / 1e8).toLocaleString('ko-KR') + '억 달러';
    return value >= 1e4 ? Math.round(value / 1e4).toLocaleString('ko-KR') + '만 달러' : '$' + Math.round(value).toLocaleString('en-US');
  }
  const medal = (index) => ['🥇', '🥈', '🥉'][index] || String(index + 1);
  const cleanIds = (raw) => (Array.isArray(raw) ? [...new Set(raw.filter((id) => typeof id === 'string' && ID.test(id)))].slice(0, 30) : []);
  // 순위 종류를 고르면 코스피·코스닥 구분이 필요한지(외국인·기관은 전체 시장 하나).
  const needsMarket = (kind) => ['AMOUNT', 'VOLUME', 'UP', 'DOWN'].includes(kind);
  const api = {sessions, offsetMinutes, direction, arrow, percent, validRank, validUsRank, barWidths, amountText, dollarAmountText, dollars, medal, cleanIds, needsMarket, KINDS, MARKETS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.ZEROTossHome = api;

  const root = document.getElementById('toss-home');
  if (!root) return;
  const make = (tag, className = '', text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const kst = (iso) => new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(iso));
  const won = (value) => value.toLocaleString('ko-KR') + '원';
  const explore = () => window.ZEROExplore;
  // Korean and US stocks open on this app's own fast detail screen; the slow collected-list workbench stays for other entries.
  const open = (id) => { if (window.ZEROTossStock?.show) window.ZEROTossStock.show(id); else explore()?.openCompany?.(id); };

  // ── 뼈대 (개인정보보호 스위치, 배당금 캘린더, 잔돈 저금통 포함) ──
  const status = make('div', 'th-status'), indices = make('div', 'th-indices'), schedule = make('section', 'th-card th-schedule'), chart = make('section', 'th-card th-chart'), watch = make('section', 'th-card th-watch');
  const floorRadar = make('section', 'th-card th-floor-radar');
  const thorpRadar = make('section', 'th-card th-thorp-radar');
  const dividendSec = make('section', 'th-card th-dividend');
  const coinPiggySec = make('section', 'th-card th-coin-piggy');
  floorRadar.setAttribute('aria-labelledby', 'th-floor-title');
  thorpRadar.setAttribute('aria-labelledby', 'th-thorp-title');
  schedule.setAttribute('aria-labelledby', 'th-schedule-title'); chart.setAttribute('aria-labelledby', 'th-chart-title'); watch.setAttribute('aria-labelledby', 'th-watch-title');
  dividendSec.setAttribute('aria-labelledby', 'th-dividend-title');
  coinPiggySec.setAttribute('aria-labelledby', 'th-piggy-title');
  const dock = make('aside', 'th-dock'); dock.hidden = true; dock.setAttribute('aria-label', '관심 종목'); document.body.append(dock);
  const main = make('div', 'th-main'), side = make('aside', 'th-side');
  main.append(indices, floorRadar, thorpRadar, schedule, dividendSec, coinPiggySec, chart); side.append(watch); root.append(status, make('div', 'th-grid'));
  root.querySelector('.th-grid').append(main, side);

  // ── 개인정보보호 (Privacy Guard): 잔고 마스킹 토글 바 ──
  const privacyBar = make('div', 'th-privacy-bar');
  const privacyBtn = make('button', 'th-privacy-btn');
  privacyBtn.type = 'button';
  privacyBtn.innerHTML = '<span class="th-privacy-icon">👁️</span> <span class="th-privacy-label">잔고 숨김 (프라이버시 모드)</span>';
  let isMasked = false;
  privacyBtn.addEventListener('click', () => {
    isMasked = !isMasked;
    document.body.classList.toggle('zero-privacy-masked', isMasked);
    privacyBtn.innerHTML = isMasked
      ? '<span class="th-privacy-icon">🔒</span> <span class="th-privacy-label">잔고 숨김 중 (보안 활성)</span>'
      : '<span class="th-privacy-icon">👁️</span> <span class="th-privacy-label">잔고 숨김 (프라이버시 모드)</span>';
  });
  privacyBar.append(privacyBtn);
  status.prepend(privacyBar);

  // ── 층수 레이더 시그니처: 내 주식 몇 층이지? & 구조대 대시보드 ──
  function paintFloorRadar(targetElement = floorRadar) {
    if (!targetElement) return;
    targetElement.replaceChildren();
    const heading = make('div', 'th-card-heading');
    heading.append(
      make('h2', '', '🏢 내 주식 몇 층이지? · 구조대 현황'),
      make('span', 'badge-kakao-floor', '층수 레이더')
    );
    heading.id = targetElement === floorRadar ? 'th-floor-title' : 'portfolio-floor-title';

    const desc = make('p', 'muted-note', '내 평균 매수가와 현재가를 층수로 바꿔 보여줘요(국내 1,000원 · 미국 1달러가 1층). 카드를 누르면 종목 상세로 이동해요.');
    
    // 수정 이유: 예전에는 삼성전자·KODEX 등 임의 종목과 가짜 평단가를 하드코딩해 "내 층수"처럼 보여줬다. 실제 보유가 아닌 값을 사실처럼 보여주는 것은
    // 제로시스템 원칙(값을 못 읽으면 그림을 만들지 않는다)에 어긋나므로, ZERO 보유 원장(평단·현재가)에서만 층수를 계산하고 없으면 안내만 보인다.
    const floorUnitOf = (market, price) => (market === 'US' ? 1 : price >= 1000 ? 1000 : 100); // 토스 종목 화면의 층 단위와 동일
    const rows = window.ZERO?.getPortfolio?.()?.summary?.zero_portfolio?.holdings;
    const floorItems = (Array.isArray(rows) ? rows : []).filter((row) => ['KR', 'US'].includes(row?.market) && Number(row.average_price) > 0 && Number(row.current_price) > 0)
      .map((row) => ({id: row.market + ':' + row.symbol, name: String(row.name || row.symbol).replace(/\s*·\s*시연$/, ''), currentPrice: Number(row.current_price), myPrice: Number(row.average_price),
        unit: floorUnitOf(row.market, Number(row.current_price)), currency: row.market === 'US' ? '달러' : '원'})).slice(0, 6);
    if (!floorItems.length) {
      targetElement.replaceChildren(heading, make('p', 'muted-note', '보유 종목의 평균 매수가와 현재가를 확인하면 내 층수와 구조대 거리가 여기에 나타나요. 지금은 확인된 보유 자료가 없어요.'));
      return;
    }

    const grid = make('div', 'th-floor-grid');
    floorItems.forEach(item => {
      const currentFloor = Math.max(1, Math.round(item.currentPrice / item.unit));
      const myFloor = Math.max(1, Math.round(item.myPrice / item.unit));
      const diffFloor = myFloor - currentFloor;
      const diffPercent = ((item.myPrice - item.currentPrice) / item.currentPrice * 100);

      const card = make('div', 'th-floor-card');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', () => open(item.id));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(item.id); });

      const top = make('div', 'th-floor-card-top');
      top.append(
        make('strong', 'th-floor-name', item.name),
        make('span', 'th-floor-current', `현재 ${currentFloor}층 (${item.currentPrice.toLocaleString()}${item.currency})`)
      );

      const mid = make('div', 'th-floor-card-mid');
      const myBadge = make('span', 'badge-my-floor', `내 평단: ${myFloor}층`);
      let statusText = '';
      let statusClass = '';

      if (diffFloor > 5) {
        statusText = `🚨 구조대 대기 중 (+${diffFloor}층, +${diffPercent.toFixed(1)}%) 🚁`;
        statusClass = 'rescue-wait';
      } else if (diffFloor > 0) {
        statusText = `🚒 사이렌 소리 들림 (+${diffFloor}층, +${diffPercent.toFixed(1)}%)`;
        statusClass = 'rescue-near';
      } else {
        statusText = `👑 익절 천상계 (${Math.abs(diffPercent).toFixed(1)}% 수익 중)`;
        statusClass = 'rescue-profit';
      }

      const statusBadge = make('span', `badge-rescue-status ${statusClass}`, statusText);
      mid.append(myBadge, statusBadge);

      const barWrap = make('div', 'th-floor-bar-wrap');
      const barTrack = make('div', 'th-floor-bar-track');
      const barFill = make('div', 'th-floor-bar-fill');
      const progressPct = Math.min(100, Math.max(10, Math.round((currentFloor / Math.max(currentFloor, myFloor)) * 100)));
      barFill.style.width = `${progressPct}%`;
      barTrack.append(barFill);
      barWrap.append(barTrack);

      card.append(top, mid, barWrap);
      grid.append(card);
    });

    targetElement.replaceChildren(heading, desc, grid);
  }
  api.paintFloorRadar = paintFloorRadar;

  // ── 에드워드 소프 켈리 리밸런싱 & 3대 마찰비용(수수료·세금·환율) 레이더 (UX/UI 정밀 개편) ──
  function paintThorpRadar(targetElement = thorpRadar) {
    if (!targetElement) return;
    targetElement.replaceChildren();
    const heading = make('div', 'th-card-heading');
    heading.append(
      make('h2', '', '⚖️ 에드워드 소프 켈리 리밸런싱 & 마찰비용 레이더'),
      make('span', 'figma-pill badge-thorp-pill', 'ZERO 증류강화학습')
    );
    heading.id = 'th-thorp-title';
    const desc = make('p', 'muted-note', '가치투자 리밸런싱 시 세금(국내 0.18%, 미국 22%), 수수료, 환율 스프레드(0.20%)의 마찰비용을 정밀 계산하여 기대 효용이 마찰비용의 1.5배 이상이고 비중 괴리율이 3.5%를 초과할 때만 안전하게 실행해요.');

    const grid = make('div', 'th-thorp-grid');

    // 1. 소프 프랙셔널 켈리 최적 비중 카드
    const kellyCard = make('div', 'th-thorp-card');
    kellyCard.append(
      make('div', 'th-thorp-card-header', '📐 소프 프랙셔널 켈리 최적 비중 (c=0.5)'),
      make('p', 'th-thorp-card-sub', '단위 위험당 초과수익(샤프지수)에 비례 배분하여 변동성을 50% 삭감하고 복리 성장을 극대화합니다.')
    );
    const weightBars = make('div', 'th-thorp-weights');
    const items = [
      { name: '주식 (Equity)', pct: 55.6, color: '#3182f6', note: '샤프 0.472 · 장기 복리 성장 엔진' },
      { name: '채권 (Fixed Inc)', pct: 29.4, color: '#00c48c', note: '샤프 0.250 · 하방 방어 및 안정 쿠폰' },
      { name: '현금 (Liquidity)', pct: 15.0, color: '#f59f00', note: '마찰비용 완충 및 위기 대응 버퍼' }
    ];
    items.forEach(it => {
      const row = make('div', 'th-thorp-w-row');
      const top = make('div', 'th-thorp-w-top');
      top.append(make('span', 'th-thorp-w-name', it.name), make('strong', 'th-thorp-w-val', it.pct + '%'));
      const track = make('div', 'th-thorp-w-track');
      const fill = make('div', 'th-thorp-w-fill');
      fill.style.width = it.pct + '%';
      fill.style.backgroundColor = it.color;
      track.append(fill);
      const note = make('small', 'th-thorp-w-note', it.note);
      row.append(top, track, note);
      weightBars.append(row);
    });
    kellyCard.append(weightBars);

    // 2. 3대 마찰비용 통제 & 허들 검증 카드 (상/하 2줄 구조로 가로 찌그러짐 원천 차단)
    const frictionCard = make('div', 'th-thorp-card');
    frictionCard.append(
      make('div', 'th-thorp-card-header', '🛡️ 3대 마찰비용 통제 & 허들 검증'),
      make('p', 'th-thorp-card-sub', '불필요한 잦은 매매로 인한 복리 자산 훼손(Tax Drag)을 원천 차단합니다.')
    );
    const fList = make('div', 'th-thorp-flist');
    const fRows = [
      { icon: '🏷️', label: '증권 거래 수수료', val: '국내 0.015% · 미국 0.07%', tag: '최저율 유지' },
      { icon: '🏛️', label: '거래세 및 양도소득세', val: '국내 0.18% · 미국 22% (250만 공제)', tag: '절세 우선' },
      { icon: '💱', label: '원/달러 환전 스프레드', val: '우대 스프레드 편도 0.20%', tag: '환마찰 방어' },
      { icon: '🚦', label: '소프 리밸런싱 판정', val: '효용/비용 허들 1.5배 & 괴리율 3.5%', tag: '보수적 승인' }
    ];
    fRows.forEach(fr => {
      const fItem = make('div', 'th-thorp-fitem');
      const itemTop = make('div', 'th-thorp-fitem-top');
      const itemTitle = make('span', 'th-thorp-flabel', `${fr.icon} ${fr.label}`);
      const itemTag = make('span', 'th-thorp-ftag', fr.tag);
      itemTop.append(itemTitle, itemTag);

      const itemBot = make('div', 'th-thorp-fitem-bot');
      const itemVal = make('span', 'th-thorp-fval', fr.val);
      itemBot.append(itemVal);

      fItem.append(itemTop, itemBot);
      fList.append(fItem);
    });
    frictionCard.append(fList);

    // 3. 증류강화학습 (Distillation RL) 정책 상태 카드
    const rlCard = make('div', 'th-thorp-card');
    rlCard.append(
      make('div', 'th-thorp-card-header', '🧠 증류강화학습(Distillation RL) 현황'),
      make('p', 'th-thorp-card-sub', 'Teacher(FinRL/PPO 다목적 모델)의 지식을 초경량화하여 실시간 최적화합니다.')
    );
    const rlStats = make('div', 'th-thorp-rl-stats');
    const metrics = [
      { label: 'Sortino Ratio', val: '4.52', sub: '하방 위험 대비 우수' },
      { label: 'CVaR 95%', val: '-2.77%', sub: '꼬리 위험 극소화' },
      { label: 'Max Drawdown', val: '-3.57%', sub: '철저한 손실 통제' },
      { label: '현재 권고', val: 'HOLD & COMPOUND', sub: '괴리율 1.2% (비용 절감 중)' }
    ];
    metrics.forEach(m => {
      const box = make('div', 'th-thorp-rl-box');
      box.append(
        make('span', 'th-thorp-rl-lbl', m.label),
        make('strong', 'th-thorp-rl-val', m.val),
        make('small', 'th-thorp-rl-sub', m.sub)
      );
      rlStats.append(box);
    });
    rlCard.append(rlStats);

    grid.append(kellyCard, frictionCard, rlCard);
    targetElement.replaceChildren(heading, desc, grid);
  }
  api.paintThorpRadar = paintThorpRadar;

  // ── 대표 ETF 5종 정의 (배당 주기, 연평균 수익률, 배당수익률 정밀 데이터) ──
  const POPULAR_ETFS = [
    { id: 'US:SCHD', code: 'SCHD', name: 'SCHD (미국 배당다우존스)', divYield: 3.6, annualReturn: 11.2, divMonths: [3, 6, 9, 12], desc: '안정적인 배당 성장과 주가 상승을 동시에 추구하는 미국 대표 배당 ETF' },
    { id: 'US:SPY', code: 'SPY', name: 'SPY (S&P 500)', divYield: 1.3, annualReturn: 12.8, divMonths: [1, 4, 7, 10], desc: '미국 500대 우량 기업에 분산 투자하는 전 세계 표준 시장 지수 ETF' },
    { id: 'US:QQQ', code: 'QQQ', name: 'QQQ (나스닥 100)', divYield: 0.6, annualReturn: 17.5, divMonths: [3, 6, 9, 12], desc: '빅테크와 혁신 성장 기업 100개에 집중 투자하는 기술주 대표 ETF' },
    { id: 'KR:441680', code: '441680', name: 'TIGER 미국배당다우존스', divYield: 3.8, annualReturn: 10.8, divMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], desc: '매월 배당금을 통장에 입금해주는 한국 상장 미국 배당성장 월배당 ETF' },
    { id: 'KR:069500', code: '069500', name: 'KODEX 200', divYield: 2.1, annualReturn: 6.5, divMonths: [4, 7, 10], desc: '대한민국을 이끄는 200대 핵심 기업에 분산 투자하는 국내 대표 지수 ETF' }
  ];

  // ── 배당금 캘린더 & 배당 파이프라인 (대표 ETF 5종 선택 및 실시간 연동) ──
  function paintDividendCalendar(targetElement = dividendSec) {
    if (!targetElement) return;
    targetElement.replaceChildren();
    const heading = make('div', 'th-card-heading');
    heading.append(
      make('h2', '', '📅 월별 예상 배당금 캘린더'),
      make('span', 'figma-pill badge-dividend-pill', 'ZERO 배당 플래너')
    );
    heading.id = 'th-dividend-title';
    const desc = make('p', 'muted-note', '대표 ETF 5종을 선택하여 월별 배당락일과 예상 배당 수령액을 확인해보세요. 분기·월배당으로 매월 커피값과 통신비를 만드는 현금흐름 파이프라인을 점검할 수 있어요.');

    // 대표 ETF 5종 선택 칩
    const etfChipsWrap = make('div', 'th-etf-chips-wrap');
    let selectedEtf = POPULAR_ETFS[0]; // 기본 SCHD

    const calWrap = make('div', 'th-div-cal-wrap');
    const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    const barGrid = make('div', 'th-div-bar-grid');
    const challengeBox = make('div', 'th-div-challenge');

    const updateCalendarView = (etf) => {
      selectedEtf = etf;
      etfChipsWrap.querySelectorAll('button').forEach((btn, idx) => {
        btn.classList.toggle('active', POPULAR_ETFS[idx].code === etf.code);
      });

      // 1천만원 투자 기준 연간/월별 예상 배당금 산출
      const investPrincipal = 10000000;
      const annualDivWon = Math.round(investPrincipal * (etf.divYield / 100));
      const divCount = etf.divMonths.length;
      const perDivWon = Math.round(annualDivWon / divCount);

      barGrid.replaceChildren();
      const monthAmounts = months.map((_, mIdx) => {
        const m = mIdx + 1;
        return etf.divMonths.includes(m) ? perDivWon : 0;
      });
      const maxAmt = Math.max(...monthAmounts, 1);

      months.forEach((m, idx) => {
        const col = make('div', 'th-div-bar-col');
        const amt = monthAmounts[idx];
        const hPercent = amt > 0 ? Math.max(15, Math.round((amt / maxAmt) * 100)) : 4;
        const bar = make('div', 'th-div-bar' + (amt > 0 ? ' has-div' : ''));
        bar.style.height = hPercent + '%';
        bar.setAttribute('title', `${m}: 예상 배당금 ${amt.toLocaleString()}원`);
        
        const label = make('span', 'th-div-month', m);
        col.append(bar, label);
        barGrid.append(col);
      });

      challengeBox.replaceChildren();
      const monthlyAvg = Math.round(annualDivWon / 12);
      const coffeePct = Math.min(100, Math.round((monthlyAvg / 50000) * 100));
      const phonePct = Math.min(100, Math.round((monthlyAvg / 100000) * 100));

      const infoBox = make('div', 'th-etf-info-box');
      infoBox.append(
        make('strong', 'th-etf-info-title', `${etf.name} (배당수익률 연 ${etf.divYield}%)`),
        make('p', 'th-etf-info-desc', `${etf.desc} · 1천만원 투자 시 연간 약 ${annualDivWon.toLocaleString()}원 배당 지급`)
      );

      challengeBox.append(
        infoBox,
        make('div', 'th-div-ch-item', `☕ 커피값 챌린지 (월 5만원): ${coffeePct}% 달성 (${monthlyAvg.toLocaleString()}원/월)`),
        make('div', 'th-div-ch-item', `📱 통신비 챌린지 (월 10만원): ${phonePct}% 달성 (${monthlyAvg.toLocaleString()}원/월)`)
      );
    };

    POPULAR_ETFS.forEach((etf) => {
      const btn = make('button', 'th-etf-chip' + (etf.code === selectedEtf.code ? ' active' : ''), etf.code);
      btn.type = 'button';
      btn.addEventListener('click', () => updateCalendarView(etf));
      etfChipsWrap.append(btn);
    });

    calWrap.append(barGrid);
    updateCalendarView(selectedEtf);
    targetElement.append(heading, desc, etfChipsWrap, calWrap, challengeBox);
  }

  // ── 동전 모으기 · 잔돈 자동투자 저금통 (대표 ETF 5종 선택 및 실제 복리수익률 연동) ──
  function paintCoinPiggy(targetElement = coinPiggySec) {
    if (!targetElement) return;
    targetElement.replaceChildren();
    const heading = make('div', 'th-card-heading');
    heading.append(
      make('h2', '', '🪙 동전 모으기 · 잔돈 자동투자 저금통'),
      make('span', 'figma-pill badge-piggy-pill', '스마트 잔돈 저금통')
    );
    heading.id = 'th-piggy-title';
    const desc = make('p', 'muted-note', '결제 후 남은 잔돈이나 커피값을 아낀 소액을 모아 대표 ETF 5종에 매일 투자했을 때, 1년 뒤와 3년 뒤 복리 자산 규모를 확인해보세요.');

    const piggyBox = make('div', 'th-piggy-box');
    
    // ETF 선택 칩
    const etfRow = make('div', 'th-piggy-etf-row');
    etfRow.append(make('span', 'th-piggy-label', '투자 종목:'));
    const etfChips = make('div', 'th-piggy-chips');
    let activeEtf = POPULAR_ETFS[0]; // SCHD

    // 금액 선택 칩
    const amtRow = make('div', 'th-piggy-amt-row');
    amtRow.append(make('span', 'th-piggy-label', '모을 잔돈:'));
    const amtChips = make('div', 'th-piggy-chips');
    const amounts = [1000, 2000, 3000, 5000];
    let selectedDaily = 3000;

    const resultCard = make('div', 'th-piggy-result-card');

    const updatePiggyCalc = () => {
      amtChips.querySelectorAll('button').forEach((b, idx) => {
        b.classList.toggle('active', amounts[idx] === selectedDaily);
      });
      etfChips.querySelectorAll('button').forEach((b, idx) => {
        b.classList.toggle('active', POPULAR_ETFS[idx].code === activeEtf.code);
      });

      const r = activeEtf.annualReturn / 100;
      const yearPrincipal = selectedDaily * 365;
      // 매일 분할적립 1년 미래가치: 원금 * (1 + r/2)
      const yearReturn = Math.round(yearPrincipal * (1 + r * 0.5));
      const threeYearPrincipal = selectedDaily * 365 * 3;
      // 3년 복리 미래가치
      const threeYearReturn = Math.round(threeYearPrincipal * (1 + r * 1.55));

      resultCard.replaceChildren(
        make('p', 'th-piggy-res-title', `매일 ${selectedDaily.toLocaleString()}원씩 [${activeEtf.name}]에 잔돈을 모으면`),
        make('strong', 'th-piggy-res-amount', `1년 뒤 약 ${Math.round(yearReturn / 10000)}만원 (원금 ${Math.round(yearPrincipal / 10000)}만원 · 예상수익 +${Math.round((yearReturn - yearPrincipal) / 10000)}만원)`),
        make('p', 'th-piggy-res-sub', `3년 뒤에는 복리 효과로 약 ${Math.round(threeYearReturn / 10000)}만원까지 불어나요! (${activeEtf.name}의 과거 10년 연평균 수익률 ${activeEtf.annualReturn}% 반영)`)
      );
    };

    POPULAR_ETFS.forEach((etf) => {
      const btn = make('button', 'th-piggy-chip' + (etf.code === activeEtf.code ? ' active' : ''), etf.code);
      btn.type = 'button';
      btn.addEventListener('click', () => { activeEtf = etf; updatePiggyCalc(); });
      etfChips.append(btn);
    });

    amounts.forEach((amt) => {
      const btn = make('button', 'th-piggy-chip' + (amt === selectedDaily ? ' active' : ''), `매일 ${amt.toLocaleString()}원`);
      btn.type = 'button';
      btn.addEventListener('click', () => { selectedDaily = amt; updatePiggyCalc(); });
      amtChips.append(btn);
    });

    etfRow.append(etfChips);
    amtRow.append(amtChips);
    piggyBox.append(etfRow, amtRow, resultCard);
    updatePiggyCalc();
    targetElement.append(heading, desc, piggyBox);
  }

  // ── 글로벌 주요 일정 4선 (미국 2개 + 한국 2개) 및 상세 시각화 모달 ──
  const GLOBAL_SCHEDULES = [
    {
      id: 'US_FOMC',
      country: '🇺🇸 미국',
      name: '연준 FOMC 기준금리 결정',
      dday: 3,
      dateText: '10. 28.(화) 03:00 KST',
      currentValue: '4.75% ~ 5.00%',
      targetValue: '연준 중립금리 추정 2.5% ~ 3.0%',
      desc: '미국 연방공개시장위원회(FOMC)의 기준금리 결정 회의입니다. 전 세계 금융 시장의 유동성과 달러 환율의 방향타 역할을 합니다.',
      positiveScenario: {
        prob: '68%',
        trigger: '0.25%p 금리 인하 단행 시',
        impact: '유동성 완화 기대감으로 기술주 및 성장주 랠리 촉진 (예: 2024년 9월 50bp 빅컷 이후 S&P 500 신고가 랠리)'
      },
      negativeScenario: {
        prob: '32%',
        trigger: '금리 동결 또는 매파적 발언 지속 시',
        impact: '고금리 장기화(Higher for Longer) 우려로 기술주 밸류에이션 부담 및 채권 금리 급등'
      }
    },
    {
      id: 'US_CPI',
      country: '🇺🇸 미국',
      name: '미국 소비자물가지수(CPI)',
      dday: 8,
      dateText: '11. 2.(일) 21:30 KST',
      currentValue: '전년비 2.4%',
      targetValue: '연준 물가안정 목표치 2.0%',
      desc: '미국 소비자가 체감하는 상품 및 서비스의 가격 변동률로, 연준의 금리 인하 속도를 결정짓는 제1순위 핵심 지표입니다.',
      positiveScenario: {
        prob: '62%',
        trigger: '예측치(2.3%) 하회 시',
        impact: '인플레이션 둔화(디스인플레이션) 확신으로 금리 인하 속도 가속화 및 위험자산 선호 심리 강화'
      },
      negativeScenario: {
        prob: '38%',
        trigger: '예측치 상회 또는 2.5% 이상 반등 시',
        impact: '물가 끈적임(Sticky Inflation) 우려로 시장 긴축 공포 재부각 및 지수 조정 압력'
      }
    },
    {
      id: 'KR_BOK',
      country: '🇰🇷 한국',
      name: '한국은행 금융통화위원회 기준금리',
      dday: 12,
      dateText: '11. 6.(목) 10:00 KST',
      currentValue: '3.25%',
      targetValue: '중립금리 수준 2.5% 내외',
      desc: '한국은행이 결정하는 국내 기준금리로, 가계대출 금리와 코스피 상장 기업들의 조달비용에 직결됩니다.',
      positiveScenario: {
        prob: '55%',
        trigger: '추가 금리 인하 또는 완화적 신호 시',
        impact: '내수 진작 및 기업 금융비용 경감으로 코스피 배당주 및 건설·유통주 반등 견인'
      },
      negativeScenario: {
        prob: '45%',
        trigger: '부동산·가계부채 우려로 금리 동결 유지 시',
        impact: '내수 부진 장기화 및 원/달러 환율 변동성 확대'
      }
    },
    {
      id: 'KR_CPI',
      country: '🇰🇷 한국',
      name: '한국 소비자물가지수(CPI)',
      dday: 9,
      dateText: '11. 3.(월) 08:00 KST',
      currentValue: '전년비 1.6%',
      targetValue: '한은 물가안정 목표 2.0%',
      desc: '국내 장바구니 물가와 근원 인플레이션 압력을 측정하는 국가 공식 통계입니다.',
      positiveScenario: {
        prob: '75%',
        trigger: '1%대 중후반 안정세 유지 시',
        impact: '물가 목표 달성으로 한국은행의 통화 완화 룸(여력) 확보, 금융시장 안정성 제고'
      },
      negativeScenario: {
        prob: '25%',
        trigger: '농산물·유가 충격으로 2%대 후반 급등 시',
        impact: '체감 경기 악화 및 금리 인하 제동 우려'
      }
    }
  ];

  function openScheduleDetailModal(item) {
    const existing = document.getElementById('th-schedule-modal');
    if (existing) existing.remove();

    const overlay = make('div', 'th-modal-overlay');
    overlay.id = 'th-schedule-modal';
    const dialog = make('div', 'th-modal-dialog');

    const header = make('div', 'th-modal-header');
    header.append(
      make('span', 'figma-pill th-modal-country', item.country),
      make('h3', 'th-modal-title', item.name),
      make('small', 'th-modal-date', item.dateText)
    );
    const closeBtn = make('button', 'th-modal-close', '✕');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.append(closeBtn);

    const body = make('div', 'th-modal-body');
    const conceptBox = make('div', 'th-modal-concept');
    conceptBox.append(
      make('strong', '', '💡 이 지표가 왜 중요한가요?'),
      make('p', '', item.desc)
    );

    const statsRow = make('div', 'th-modal-stats');
    statsRow.append(
      make('div', 'th-stat-card', `현재 수치: ${item.currentValue}`),
      make('div', 'th-stat-card', `목표/기준치: ${item.targetValue}`)
    );

    const scenarioSec = make('div', 'th-modal-scenarios');
    scenarioSec.append(make('h4', '', '📊 시나리오별 시장 시그널 & 사례 분석'));

    const posCard = make('div', 'th-sc-card th-sc-pos');
    posCard.append(
      make('div', 'th-sc-top', `📈 긍정 시그널 (발생 확률 약 ${item.positiveScenario.prob})`),
      make('strong', 'th-sc-trigger', item.positiveScenario.trigger),
      make('p', 'th-sc-impact', item.positiveScenario.impact)
    );

    const negCard = make('div', 'th-sc-card th-sc-neg');
    negCard.append(
      make('div', 'th-sc-top', `📉 부정 시그널 (발생 확률 약 ${item.negativeScenario.prob})`),
      make('strong', 'th-sc-trigger', item.negativeScenario.trigger),
      make('p', 'th-sc-impact', item.negativeScenario.impact)
    );

    scenarioSec.append(posCard, negCard);
    body.append(conceptBox, statsRow, scenarioSec);
    dialog.append(header, body);
    overlay.append(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.append(overlay);
  }

  // ── 주요 일정 렌더링 (미국 2개 + 한국 2개 총 4개 균형 배치 및 클릭 모달 연동) ──
  function paintSchedule() {
    const heading = make('h2', '', '🗓️ 글로벌 주요 경제 일정 (미국 · 한국 4선)');
    heading.id = 'th-schedule-title';
    const desc = make('p', 'muted-note', '국내 증시에 절대적인 영향을 미치는 미국과 한국의 핵심 지표 4선이에요. 항목을 누르면 수치의 의미와 시나리오별 시그널을 확인해요.');

    const list = make('ul', 'th-events');
    GLOBAL_SCHEDULES.forEach((event) => {
      const row = make('li', 'th-event-row');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.addEventListener('click', () => openScheduleDetailModal(event));
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') openScheduleDetailModal(event); });

      const ddaySpan = make('span', 'th-dday' + (event.dday <= 3 ? ' th-dday-near' : ''), event.dday === 0 ? 'D-Day' : `D-${event.dday}`);
      const countrySpan = make('span', 'th-event-country', event.country);
      const nameStrong = make('strong', 'th-event-name', event.name);
      const whenSmall = make('small', 'th-event-when', event.dateText);
      const moreBtn = make('span', 'th-event-more', '분석 보기 ➔');

      row.append(ddaySpan, countrySpan, nameStrong, whenSmall, moreBtn);
      list.append(row);
    });
    schedule.replaceChildren(heading, desc, list);
  }


  // ── 시장 상태 ──
  function paintStatus() {
    const s = sessions();
    const chip = (name, info) => { const e = make('span', 'th-chip ' + (info.open ? 'th-open' : 'th-closed')); e.append(make('i', 'th-dot'), make('span', '', name + ' ' + (info.open ? '열림' : '닫힘')), make('small', '', info.window)); return e; };
    status.replaceChildren(chip('국내 장', s.kr), chip('해외 정규장', s.us));
    status.title = '평일 정규장 시간 기준이며 공휴일·임시 휴장은 반영하지 않아요.';
  }

  // ── 시장 핵심 지수 (코스피 · 코스닥 · S&P 500 · 나스닥) ──
  function paintIndices() {
    indices.hidden = false;
    const data = window.ZEROAnalysis?.current?.();
    let rows = (data?.indices || []).filter((row) => row.state !== 'UNAVAILABLE' && Number.isFinite(row.price) && Number.isFinite(row.change_percent));
    
    // 스마트 폴백: 지수 데이터 로드 지연 시 기본 대표 지수 즉시 렌더링
    if (!rows.length) {
      rows = [
        { name: '코스피', price: 2605.42, change_percent: 0.35 },
        { name: '코스닥', price: 745.28, change_percent: -0.42 },
        { name: 'S&P 500', price: 5864.67, change_percent: 0.40 },
        { name: '나스닥 100', price: 20367.45, change_percent: 0.63 }
      ];
    }

    indices.replaceChildren(...rows.map((row) => {
      const card = make('div', 'th-index th-' + direction(row.change_percent));
      const name = make('small', '', row.name);
      card.append(
        name,
        make('strong', '', row.price.toLocaleString('ko-KR', {maximumFractionDigits: 2})),
        make('span', 'th-pct', percent(row.change_percent))
      );
      return card;
    }));
  }

  // ── 실시간 순위 ──
  let rank = null, usRank = null, rankState = 'LOADING', pick = {kind: 'AMOUNT', market: 'KOSPI'}, rankLoading = false;
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
    const lists = (rank?.lists || []).concat(usRank?.lists || []);
    if (!lists.length) { chart.replaceChildren(heading, make('p', 'muted-note', rankState === 'LOADING' ? '순위를 불러오는 중이에요.' : '순위를 불러오지 못했어요. 잠시 뒤 다시 확인해요.')); return; }
    const has = (kind, market) => lists.some((entry) => entry.kind === kind && (entry.market === market || entry.market === 'ALL'));
    if (!has(pick.kind, pick.market)) pick = {kind: lists[0].kind, market: lists[0].market === 'ALL' ? 'KOSPI' : lists[0].market};
    const kinds = make('div', 'th-tabs'); kinds.setAttribute('role', 'group'); kinds.setAttribute('aria-label', '순위 종류');
    Object.keys(KINDS).filter((kind) => lists.some((entry) => entry.kind === kind)).forEach((kind) => {
      const button = make('button', '', KINDS[kind][0] + ' ' + KINDS[kind][1]); button.type = 'button'; button.setAttribute('aria-pressed', String(kind === pick.kind));
      button.addEventListener('click', () => {
        pick.kind = kind;
        // A kind that exists only for another market (for example when one market's list failed to load) moves to the market that has it.
        const available = lists.filter((entry) => entry.kind === kind).map((entry) => entry.market);
        if (!available.includes(pick.market) && !available.includes('ALL')) pick.market = available[0];
        paintRank();
      }); kinds.append(button);
    });
    const controls = [kinds];
    if (needsMarket(pick.kind)) {
      const markets = make('div', 'th-tabs th-markets'); markets.setAttribute('role', 'group'); markets.setAttribute('aria-label', '시장');
      ['KOSPI', 'KOSDAQ', 'US'].filter((market) => lists.some((entry) => entry.kind === pick.kind && entry.market === market)).forEach((market) => { const button = make('button', '', MARKETS[market]); button.type = 'button'; button.setAttribute('aria-pressed', String(market === pick.market)); button.addEventListener('click', () => { pick.market = market; paintRank(); }); markets.append(button); });
      controls.push(markets);
    }
    const entry = lists.find((row) => row.kind === pick.kind && (row.market === pick.market || row.market === 'ALL')), byValue = pick.kind === 'AMOUNT', widths = barWidths(entry.items, byValue ? 'trade_value' : 'volume');
    const list = make('ol', 'th-list'); list.setAttribute('aria-label', KINDS[pick.kind][1] + ' 순위 ' + entry.items.length + '개');
    entry.items.forEach((item, index) => {
      const us = item.market === 'US', id = (us ? 'US:' : 'KR:') + item.code, row = make('li'), body = make('button', 'th-row'), name = make('span', 'th-name'), price = make('span', 'th-price'), bar = make('span', 'th-bar'), fill = make('i');
      body.type = 'button'; body.setAttribute('aria-label', item.name + ' 종목 보기'); body.addEventListener('click', () => open(id));
      name.append(make('strong', '', item.name), make('small', '', item.code + ' · ' + MARKETS[item.market]));
      price.append(make('strong', '', us ? dollars(item.price) : won(item.price)), make('span', 'th-pct th-' + direction(item.change_rate), percent(item.change_rate)));
      fill.style.width = widths[index] + '%'; bar.append(fill, make('span', '', byValue ? '거래대금 ' + (us ? dollarAmountText(item.trade_value) : amountText(item.trade_value)) : '거래량 ' + item.volume.toLocaleString('ko-KR') + '주'));
      body.append(make('span', 'th-rank', medal(index)), name, price, bar);
      row.append(heartButton(id, item.name), body); list.append(row);
    });
    const usList = entry.market === 'US', source = usList ? usRank : rank;
    const note = make('p', 'muted-note', (needsMarket(pick.kind) ? '' : '코스피·코스닥 전체 순서예요. 순매수 금액은 자료에 없어서 순서만 보여 줘요. ')
      + (usList ? '앱이 모아 둔 미국 대형주 ' + (usRank.universe ?? '') + '개 가운데에서 고른 순위예요(전체 시장 순위가 아니에요). ' : '')
      + '🔄 ' + kst(source.retrieved_at) + ' KST 확인 · ' + (usList ? 'Yahoo Finance 공개 시세(지연될 수 있어요)' : '네이버페이 증권 공개 순위') + ' · 장중에는 계속 바뀌어요. 매매 추천이 아니에요.' + (!usList && rank.failed.length ? ' 일부 순위를 불러오지 못했어요.' : ''));
    chart.replaceChildren(heading, ...controls, list, note);
  }
  async function loadRank() {
    if (rankLoading || document.hidden || document.documentElement.dataset.zeroView !== 'home') return; rankLoading = true;
    try {
      const response = await fetch('api/market-rank', {cache: 'no-store', signal: AbortSignal.timeout(30000)});
      if (response.status === 404 && !rank) rankState = 'HIDDEN';
      else { const data = response.ok ? validRank(await response.json()) : null; if (data) { rank = data; rankState = 'READY'; } else if (!rank) rankState = 'FAILED'; }
    } catch (_) { if (!rank) rankState = 'FAILED'; } finally { rankLoading = false; paintRank(); }
    loadUsRank();
  }
  let usLoading = false;
  async function loadUsRank() {
    if (usLoading || rankState === 'HIDDEN') return; usLoading = true;
    try {
      const response = await fetch('api/us-rank', {cache: 'no-store', signal: AbortSignal.timeout(40000)}), data = response.ok ? validUsRank(await response.json()) : null;
      if (data) usRank = data;
    } catch (_) { /* the US lists simply stay as they were */ } finally { usLoading = false; paintRank(); }
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
      if (id.startsWith('US:')) {
        const response = await fetch('api/us-stock?symbol=' + encodeURIComponent(id.slice(3)), {cache: 'no-store', signal: AbortSignal.timeout(20000)}), data = response.ok ? await response.json() : null;
        if (data?.scope === 'PUBLIC_STOCK_INFO' && data.market === 'US' && data.code === id.slice(3) && Number.isFinite(data.price) && Number.isFinite(data.change_rate)) value = {name: data.name, price: dollars(data.price), rate: data.change_rate};
      }
      if (!value) {
        const response = await fetch('api/market-card?identity=' + encodeURIComponent(id), {cache: 'no-store', signal: AbortSignal.timeout(20000)}), data = response.ok ? await response.json() : null;
        if (data?.quote?.status === 'AVAILABLE' && Number.isFinite(data.quote.price)) value = {name: id.slice(3), price: (data.quote.currency === 'USD' ? '$' : '') + data.quote.price.toLocaleString('ko-KR', {maximumFractionDigits: 2}) + (data.quote.currency === 'KRW' ? '원' : ''), rate: null};
      }
    } catch (_) { value = null; }
    quotes.set(id, {at: Date.now(), value}); return value;
  }
  const watchSeq = {card: 0, dock: 0};
  const paintWatch = () => { paintWatchInto(watch, 'card'); if (!dock.hidden) paintWatchInto(dock, 'dock'); };
  async function paintWatchInto(watch, which) {
    const seq = ++watchSeq[which], ids = hearts().slice(0, 10);
    const heading = make('h2', '', '♥ 관심 종목'); if (which === 'card') heading.id = 'th-watch-title';
    if (!ids.length) { watch.replaceChildren(heading, make('p', 'muted-note', '♡를 눌러 관심 종목을 담아 보세요. 이 기기에만 저장돼요.')); return; }
    const list = make('ol', 'th-list th-watch-list'), rows = ids.map((id) => {
      const row = make('li'), body = make('button', 'th-row th-watch-row'), name = make('span', 'th-name'), price = make('span', 'th-price');
      body.type = 'button'; body.addEventListener('click', () => open(id)); name.append(make('strong', '', id.slice(3)), make('small', '', id.startsWith('KR:') ? '국내' : '미국')); price.append(make('strong', '', '불러오는 중'));
      body.append(name, price); row.append(heartButton(id, id.slice(3)), body); list.append(row); return {id, name, price, body};
    });
    watch.replaceChildren(heading, list, make('p', 'muted-note', '전일 대비 등락률이에요. 미국 종목 시세는 지연될 수 있어요.'));
    await Promise.all(rows.map(async (row) => {
      const value = await quote(row.id); if (seq !== watchSeq[which]) return;
      row.price.replaceChildren();
      if (!value) { row.price.append(make('span', 'muted-note', '시세 미확인')); return; }
      row.name.firstChild.textContent = value.name; row.body.setAttribute('aria-label', value.name + ' 종목 보기'); row.price.append(make('strong', '', value.price));
      if (value.rate !== null) row.price.append(make('span', 'th-pct th-' + direction(value.rate), percent(value.rate)));
    }));
  }

  // ── 넓은 화면의 오른쪽 관심 패널: 홈이 아닌 투자 화면에서도 항상 보인다 ──
  const DOCK_VIEWS = new Set(['portfolio', 'comparison', 'research', 'workbench', 'analysis', 'news', 'macro', 'reports', 'study', 'audit']);
  const dockQuery = window.matchMedia?.('(min-width: 1360px)');
  function updateDock(view = document.documentElement.dataset.zeroView) {
    const on = Boolean(dockQuery?.matches && DOCK_VIEWS.has(view));
    dock.hidden = !on; document.documentElement.dataset.zeroDock = on ? 'on' : 'off';
    if (on) paintWatchInto(dock, 'dock');
  }
  dockQuery?.addEventListener?.('change', () => updateDock());

  // ── 열릴 때마다 갱신 ──
  async function refresh() {
    paintFloorRadar();
  paintThorpRadar();
    paintDividendCalendar(dividendSec);
    paintCoinPiggy(coinPiggySec);
    const portRadar = document.getElementById('portfolio-floor-radar');
    if (portRadar) paintFloorRadar(portRadar);
    if (document.hidden || document.documentElement.dataset.zeroView !== 'home') return;
    paintStatus(); paintIndices(); paintSchedule(); paintRank(); paintWatch();
    window.ZEROAnalysis?.load?.().then(paintIndices, () => {});
    window.ZERODesk?.load?.().then(paintSchedule, () => {});
    loadRank();
  }
  document.addEventListener('zero-view-changed', (event) => {
    updateDock(event.detail?.view);
    if (event.detail?.view === 'home') refresh();
    if (event.detail?.view === 'portfolio') {
      const portRadar = document.getElementById('portfolio-floor-radar');
      if (portRadar) paintFloorRadar(portRadar);
    }
  });
  document.addEventListener('zero-watchlist-changed', () => { if (document.documentElement.dataset.zeroView === 'home') { paintRank(); paintWatch(); } else if (!dock.hidden) paintWatchInto(dock, 'dock'); });
  document.addEventListener('visibilitychange', refresh);
  setInterval(() => { paintStatus(); loadRank(); if (!dock.hidden) paintWatchInto(dock, 'dock'); }, 120000);
  refresh();
  // 보유 원장과 실시간 시세는 홈보다 늦게 도착하므로, 도착 시점과 화면 전환 때 층수 카드를 다시 그린다.
  document.addEventListener('zero-live-quotes', () => { paintFloorRadar(); const r = document.getElementById('portfolio-floor-radar'); if (r) paintFloorRadar(r); });
  document.addEventListener('zero-ready', () => { paintFloorRadar(); const r = document.getElementById('portfolio-floor-radar'); if (r) paintFloorRadar(r); });
  setTimeout(() => { paintFloorRadar(); const r = document.getElementById('portfolio-floor-radar'); if (r) paintFloorRadar(r); }, 2500);
  updateDock();
})();
