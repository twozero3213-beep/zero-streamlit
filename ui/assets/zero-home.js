/* 홈: 내 자산과 오늘 손익, 오늘 시장, 10년 전 1억을 넣었다면, 관심 종목, 실시간 순위, 다가오는 발표.
   칸마다 따로 불러와서 하나가 늦거나 실패해도 나머지는 먼저 보인다. */
(() => {
  'use strict';
  const C = window.ZeroCore, U = window.ZeroUI, D = window.ZeroData;
  const {el} = U;
  const root = document.getElementById('view-home');

  // 지수 대신 지수를 따라가는 ETF 가격을 쓴다(지수 자체의 무료 실시간 값은 연결돼 있지 않다).
  const MARKET = [
    ['KR:069500', '코스피 200', 'KODEX 200', false],
    ['KR:229200', '코스닥 150', 'KODEX 코스닥150', false],
    ['US:SPY', 'S&P 500', 'SPY', true],
    ['US:QQQ', '나스닥 100', 'QQQ', true]
  ];

  const slots = {};
  function slot(name) {
    slots[name] = el('div', {class: 'slot'}, U.loading());
    return slots[name];
  }
  function fill(name, ...children) { slots[name].replaceChildren(...children.flat().filter(Boolean)); }

  // ---- 내 자산 --------------------------------------------------------------------------------
  function summaryLine(view) {
    const moves = view.rows.map((row) => row.dayChangePercent).filter(Number.isFinite);
    if (!moves.length) return null;
    const up = moves.filter((value) => value > 0).length, down = moves.filter((value) => value < 0).length;
    if (!up && !down) return '오늘은 가진 종목이 모두 그대로예요.';
    return '오늘은 ' + view.rows.length + '종목 중 ' + up + '종목이 오르고 ' + down + '종목이 내렸어요.';
  }

  let lastAssets = null, assetToken = 0;
  function renderAssets(view) {
    if (!view) { fill('assets', U.empty('내 자산 자료를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.')); return; }
    const hidden = U.amounts.hidden();
    const today = view.todayPnl === null ? null
      : el('p', {class: 'hero-today tone-' + C.direction(view.todayPnl)},
        '오늘 ', hidden ? '가려짐' : C.signed(view.todayPnl, 0) + '원', ' (', C.percentText(view.todayPercent), ')');
    const rows = el('ul', {class: 'rows'}, view.rows.slice(0, 3).map((row) => U.stockRow({
      id: row.id, name: row.name, sub: C.cut2(row.weight) + '%',
      value: U.amounts.text(C.wonText(row.valueKrw)), percent: row.dayChangePercent ?? undefined
    })));
    const priced = U.timeText(view.pricedAt);
    fill('assets',
      el('p', {class: 'hero-total', text: U.amounts.text(C.wonText(view.total))}),
      today,
      el('p', {class: 'hero-gain'}, '처음 1억원에서 ', el('span', {class: 'tone-' + C.direction(view.gain), text: C.percentText(view.returnPercent)})),
      summaryLine(view) ? el('p', {class: 'hero-line', text: summaryLine(view)}) : null,
      rows,
      el('a', {class: 'button ghost', href: '#stocks', text: '내 주식 모두 보기'}),
      U.note('ZERO 참고 포트폴리오(모의)예요. ' + (view.live ? '공개 시세로 다시 계산했고 ' : '저장된 값이고 ') + (priced ? priced + ' 기준이에요.' : '기준 시각은 확인하지 못했어요.')));
  }

  async function paintAssets() {
    const token = ++assetToken;
    const paint = (view) => {
      if (token !== assetToken) return;
      lastAssets = view;
      renderAssets(view);
    };
    paint(await D.portfolio(paint));
  }

  // ---- 오늘 시장 ------------------------------------------------------------------------------
  function sessionChip(label, session) {
    return el('span', {class: 'chip ' + (session.open ? 'chip-on' : 'chip-off')}, label + ' ' + (session.open ? '열림' : '닫힘'), el('small', {text: session.hours}));
  }

  async function paintMarket() {
    const now = C.sessions();
    const chips = el('div', {class: 'chips'}, sessionChip('국내 장', now.kr), sessionChip('미국 장', now.us));
    const quoteMap = await U.quotes(MARKET.map(([id]) => id));
    const rows = MARKET.filter(([id]) => quoteMap.has(id)).map(([id, label, product, chartSupported]) => {
      const quote = quoteMap.get(id), holder = el('span', {class: 'row-spark'});
      // 서버 기본 차트 목록의 SPY·QQQ만 요청하고 미등록 국내 ETF는 시세만 보여 준다.
      if (chartSupported) D.closes(id).then((values) => { const line = values && U.sparkline(values, C.direction(quote.changePercent)); if (line) holder.append(line); });
      return U.stockRow({id, name: label, sub: product, value: C.priceText(quote.price, quote.currency), percent: quote.changePercent, extra: holder});
    });
    if (!rows.length) { fill('market', chips, U.empty('시세를 불러오지 못했어요.')); return; }
    fill('market', chips, el('ul', {class: 'rows'}, rows), U.note('지수를 따라가는 ETF의 가격이에요. 한국 시간 기준이고 공휴일 휴장은 반영하지 않았어요.'));
  }

  // ---- 장 전 점검표 ----------------------------------------------------------------------------
  // 예측하지 않고, '내일 장 어떻게 되냐'에 사람들이 실제로 확인하는 밤사이 숫자와 기준 시각만 보여 준다.
  let premarketBlock = null;
  async function paintPremarket() {
    const data = await D.premarket();
    const items = data?.scope === 'PREMARKET_CHECKLIST' ? (data.items || []).filter((item) => Number.isFinite(item.price)) : [];
    if (!items.length) { premarketBlock.hidden = true; return; }
    premarketBlock.hidden = false;
    const value = (item) => item.unit === 'yield' ? item.price.toFixed(2) + '%'
      : item.price.toLocaleString('en-US', {maximumFractionDigits: 2}) + (item.unit === 'fx' ? '원' : '');
    const move = (item) => item.unit === 'yield'
      ? el('span', {class: 'change tone-' + C.direction(item.change), text: (item.change > 0 ? '+' : '') + item.change.toFixed(2) + '%p'})
      : U.change(item.change_percent);
    const latest = items.map((item) => item.market_time).sort().pop();
    fill('premarket', el('ul', {class: 'rows'}, items.map((item) => el('li', {class: 'row'},
      el('span', {class: 'row-main stacked'}, el('strong', {text: item.name}), el('small', {text: item.why})),
      el('span', {class: 'row-value'}, el('strong', {text: value(item)}), move(item))))),
      U.note('밤사이 해외 시장이에요. 내일 장을 맞히는 지표가 아니라 장 열기 전에 미리 볼 숫자예요. 전 거래일 종가와 비교했어요.'),
      U.note('자료: Yahoo Finance 공개 일봉' + (latest ? ', ' + (U.timeText(latest) || latest) + ' 기준' : '') + '. 조금 늦을 수 있어요.'));
  }

  // ---- 10년 전 1억을 넣었다면 ------------------------------------------------------------------
  async function paintDecade() {
    const data = await D.decade();
    const items = (data?.items || []).filter((item) => Number.isFinite(item.value_krw) && Number.isFinite(item.return_percent_krw));
    if (data?.scope !== 'DECADE_LUMP_SUM_REFERENCE' || !items.length) { fill('decade', U.empty('10년 비교 자료를 불러오지 못했어요.')); return; }
    const top = Math.max(...items.map((item) => item.value_krw));
    const month = (day) => day.slice(0, 7).replace('-', '년 ') + '월';
    // 큰 수익률만 보이지 않게 해마다 몇 %씩이었는지와 그 사이 가장 깊게 떨어진 폭을 같이 적는다.
    const detail = (item) => {
      const years = (Date.parse(item.end_date) - Date.parse(item.start_date)) / (365.25 * 864e5);
      const yearly = years > 1 ? (Math.pow(1 + item.return_percent_krw / 100, 1 / years) - 1) * 100 : NaN;
      const drop = C.num(item.max_drawdown_percent_krw);
      return [Number.isFinite(yearly) ? '해마다 ' + C.percentText(yearly) : null, Number.isFinite(drop) && drop > 0 ? '가장 깊게 ' + C.percentText(-drop) : null].filter(Boolean).join(', ');
    };
    const list = el('ul', {class: 'bars neutral'}, items.map((item) => {
      const bar = el('span', {class: 'bar-fill'});
      bar.style.setProperty('width', Math.max(3, item.value_krw / top * 100).toFixed(1) + '%');
      const sub = detail(item);
      return el('li', {class: 'bar-row'},
        el('span', {class: 'bar-name'}, el('strong', {text: item.label}), sub ? el('small', {text: sub}) : null),
        el('span', {class: 'bar-track'}, bar),
        el('span', {class: 'bar-value'}, el('strong', {text: C.wonText(item.value_krw)}), el('span', {class: 'tone-' + C.direction(item.return_percent_krw), text: C.percentText(item.return_percent_krw)})));
    }));
    const ends = items.map((item) => item.end_date).sort();
    fill('decade', list,
      U.note(month(items[0].start_date) + '에 1억원을 한 번에 넣고 ' + month(ends[ends.length - 1]) + '까지 들고 있었을 때예요. 배당은 다시 넣었고 환율 변화도 반영했어요. 세금과 수수료는 넣지 않았어요.'),
      U.note('가장 깊게 떨어진 폭은 그 사이 가장 높았던 달보다 원화 평가액이 얼마나 줄었는지예요(월말 기준). 지난 기록이라 앞으로도 같다는 뜻은 아니에요. 자료: Yahoo Finance 월봉과 원·달러 환율.'));
  }

  // ---- 관심 종목 ------------------------------------------------------------------------------
  let watchToken = 0;
  async function paintWatch() {
    const token = ++watchToken;
    const list = U.watch.list();
    if (!list.length) {
      fill('watch', U.empty('아직 담은 종목이 없어요. 종목 화면에서 하트를 누르면 여기에 모여요.'),
        el('div', {class: 'button-row'}, el('a', {class: 'button ghost', href: '#discover', text: '종목 찾아보기'}), el('a', {class: 'button ghost', href: '#more/study', text: '주식 입문 학교'})));
      return;
    }
    const quoteMap = await U.quotes(list.map((item) => item.id));
    if (token !== watchToken) return;
    fill('watch', el('ul', {class: 'rows'}, list.map((item) => {
      const quote = quoteMap.get(item.id);
      return U.stockRow({id: item.id, name: item.name, sub: item.id.split(':')[1], value: quote ? C.priceText(quote.price, quote.currency) : null, percent: quote ? quote.changePercent : undefined, heart: true});
    })));
  }

  // ---- 실시간 순위 ----------------------------------------------------------------------------
  let rankKind = 'UP';
  async function paintRank() {
    const data = await D.rank();
    if (!data) { fill('rank', U.empty('순위는 공개 앱에서만 볼 수 있어요.')); return; }
    const kinds = [...new Set(data.lists.map((entry) => entry.kind))];
    if (!kinds.includes(rankKind)) rankKind = kinds[0];
    const entry = data.lists.find((item) => item.kind === rankKind);
    const picker = U.segmented(kinds.map((kind) => [kind, C.RANK_KINDS[kind]]), rankKind, (kind) => { rankKind = kind; paintRank(); }, '순위 종류');
    const rows = entry.items.slice(0, 5).map((item, index) => U.stockRow({
      id: 'KR:' + item.code, name: (index + 1) + '. ' + item.name, sub: C.RANK_MARKETS[item.market] || C.RANK_MARKETS[entry.market],
      value: C.priceText(item.price, 'KRW'), percent: item.change_rate
    }));
    fill('rank', picker, el('ul', {class: 'rows'}, rows),
      el('a', {class: 'button ghost', href: '#discover', text: '순위 더 보기'}),
      U.note((data.source || '공개 순위') + ', ' + (C.ageText(data.retrievedAt) || '시각 미확인') + ' 확인'));
  }

  // ---- 다가오는 발표 --------------------------------------------------------------------------
  async function paintCalendar() {
    // 공개 앱은 발표일만 담은 가벼운 목록(calendar 경로)을 준다. 없는 곳(소유자 사이트)은 전체 지표 묶음에서 꺼낸다.
    const light = await U.api('api/calendar', 600);
    const items = C.upcoming(light?.scope === 'MACRO_RELEASE_CALENDAR' ? light.items : (await D.desk())?.macro);
    if (!items.length) { fill('calendar', U.empty('발표일이 확인된 일정이 없어요.')); return; }
    const format = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
    fill('calendar', el('ul', {class: 'rows'}, items.map((item) => el('li', {class: 'row'},
      el('a', {class: 'row-main', href: '#more/macro'},
        el('span', {class: 'row-name'}, el('strong', {text: item.name}), el('small', {text: format.format(new Date(item.at))})),
        el('span', {class: 'chip ' + (item.days <= 1 ? 'chip-on' : 'chip-off'), text: C.ddayText(item.days)}))))),
      U.note('발표일이 확인된 지표만 보여요. 일정은 바뀔 수 있어요.'));
  }

  // ---- 화면 조립 ------------------------------------------------------------------------------
  function ordered(order, block) { block.style.setProperty('order', String(order)); return block; }

  let built = false;
  function build() {
    const hide = el('button', {type: 'button', class: 'icon-button', onclick: () => U.amounts.toggle()});
    const paintHide = () => {
      hide.replaceChildren(U.icon(U.amounts.hidden() ? 'eyeOff' : 'eye'));
      hide.setAttribute('aria-label', U.amounts.hidden() ? '금액 보이기' : '금액 가리기');
    };
    paintHide();
    document.addEventListener('zero-amounts-changed', () => { paintHide(); if (lastAssets) renderAssets(lastAssets); });
    document.addEventListener('zero-theme-changed', () => { if (lastAssets) renderAssets(lastAssets); });
    const refresh = el('button', {type: 'button', class: 'icon-button', 'aria-label': '시세 새로고침', onclick: () => { U.forget('api/market/quote'); U.forget('api/live-quotes'); U.forget('api/market-rank'); paintAll(); }}, U.icon('refresh'));
    const assets = el('section', {class: 'block hero'},
      el('div', {class: 'block-head'}, el('h2', {class: 'block-title'}, '내 자산 ', el('span', {class: 'mock-tag', text: '모의 계좌'})), el('span', {class: 'block-tools'}, hide, refresh)),
      slot('assets'));
    root.replaceChildren(
      el('div', {class: 'home-heading'}, el('h1', {text: '홈'}),
        el('a', {class: 'home-research', href: '#more/reports'}, U.icon('report', 20), '기관 리서치')),
      // 넓은 화면은 두 단, 휴대폰은 한 줄로 풀고 data-order 순서로 놓는다.
      el('div', {class: 'columns home-grid'},
        el('div', {class: 'column'}, ordered(1, assets), ordered(2, U.section('오늘 시장', slot('market'))), ordered(3, premarketBlock = U.section('장 전 점검표', slot('premarket'))), ordered(7, U.section('다가오는 발표', slot('calendar')))),
        el('div', {class: 'column'}, ordered(4, U.section('10년 전 1억원을 넣었다면', slot('decade'))), ordered(5, U.section('관심 종목', slot('watch'))), ordered(6, U.section('실시간 순위', slot('rank'))))));
    document.addEventListener('zero-watch-changed', paintWatch);
    built = true;
  }

  function paintAll() { paintAssets(); paintMarket(); paintWatch(); paintRank(); }

  U.route('home', {
    title: () => '홈',
    show() {
      if (!built) { build(); paintDecade(); paintCalendar(); paintPremarket(); }
      paintAll();
    }
  });
})();
