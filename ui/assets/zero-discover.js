/* 발견: 종목 검색, 실시간 순위, 시가총액 순 목록. 종목 화면: 가격, 차트, 핵심 숫자, 투자자별 매매, 회사 소개, 뉴스. */
(() => {
  'use strict';
  const C = window.ZeroCore, U = window.ZeroUI, D = window.ZeroData;
  const {el} = U;
  const discoverRoot = document.getElementById('view-discover'), stockRoot = document.getElementById('view-stock');
  const UNIVERSES = [['SP500', '미국 100'], ['KOSPI', '코스피 50'], ['KOSDAQ', '코스닥 50'], ['ETF', 'ETF 50']];

  // ---- 검색(머리의 검색창) --------------------------------------------------------------------
  const input = document.getElementById('search'), results = document.getElementById('search-results');
  let searchTimer = null, searchToken = 0;

  function closeSearch() { ++searchToken; clearTimeout(searchTimer); results.hidden = true; results.replaceChildren(); input.setAttribute('aria-expanded', 'false'); }

  async function runSearch() {
    const token = ++searchToken;
    const query = input.value.trim();
    if (!query) { closeSearch(); return; }
    const research = await D.research();
    if (token !== searchToken || query !== input.value.trim()) return;
    const found = C.searchCompanies(research?.companies, query);
    results.replaceChildren(...(found.length
      ? found.map((company) => el('li', {role: 'option'}, el('a', {href: '#stock/' + company.id, onclick: () => { input.value = ''; closeSearch(); }},
        el('strong', {text: company.name}), el('small', {text: company.symbol + ', ' + (company.market === 'US' ? '미국' : '한국')}))))
      : [el('li', {class: 'empty', text: '찾는 종목이 목록에 없어요. 이름이나 코드를 다시 확인해 주세요.'})]));
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('input', () => { closeSearch(); searchTimer = setTimeout(runSearch, 150); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { input.value = ''; closeSearch(); }
    if (event.key === 'Enter') { event.preventDefault(); results.querySelector('a')?.click(); }
  });
  document.addEventListener('click', (event) => { if (!event.target.closest('.search')) closeSearch(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.target.closest('input, textarea, select, [contenteditable]')) { event.preventDefault(); input.focus(); }
  });

  // ---- 발견 화면 ------------------------------------------------------------------------------
  const state = {kind: 'UP', market: 'KOSPI', universe: 'SP500'};

  async function rankBlock(host) {
    const data = await D.rank();
    if (!data) { host.replaceChildren(U.empty('실시간 순위는 공개 앱에서만 볼 수 있어요.')); return; }
    const kinds = [...new Set(data.lists.map((entry) => entry.kind))];
    if (!kinds.includes(state.kind)) state.kind = kinds[0];
    const markets = data.lists.filter((entry) => entry.kind === state.kind).map((entry) => entry.market);
    if (!markets.includes(state.market)) state.market = markets[0];
    const entry = data.lists.find((item) => item.kind === state.kind && item.market === state.market);
    const widest = Math.max(...entry.items.map((item) => Math.abs(item.change_rate)), 0.01);
    const rows = entry.items.map((item, index) => {
      const bar = el('span', {class: 'bar-fill tone-bg-' + C.direction(item.change_rate)});
      bar.style.setProperty('width', Math.max(2, Math.abs(item.change_rate) / widest * 100).toFixed(1) + '%');
      return U.stockRow({
        id: 'KR:' + item.code, name: (index + 1) + '. ' + item.name, sub: C.RANK_MARKETS[item.market] || '',
        value: C.priceText(item.price, 'KRW'), percent: item.change_rate, extra: el('span', {class: 'row-bar'}, bar), heart: true
      });
    });
    host.replaceChildren(
      U.segmented(kinds.map((kind) => [kind, C.RANK_KINDS[kind]]), state.kind, (kind) => { state.kind = kind; rankBlock(host); }, '순위 종류'),
      markets.length > 1 ? U.segmented(markets.map((market) => [market, C.RANK_MARKETS[market]]), state.market, (market) => { state.market = market; rankBlock(host); }, '시장') : null,
      el('ul', {class: 'rows'}, rows),
      U.note((data.source || '공개 순위') + ', ' + (C.ageText(data.retrievedAt) || '시각 미확인') + ' 확인. 막대는 등락률 크기예요.'));
  }

  async function universeBlock(host) {
    const research = await D.research();
    const universe = research?.universes?.find((item) => item.id === state.universe);
    const picker = U.segmented(UNIVERSES, state.universe, (id) => { state.universe = id; universeBlock(host); }, '목록');
    if (!universe?.rows?.length) { host.replaceChildren(picker, U.empty('목록을 불러오지 못했어요.')); return; }
    const rows = universe.rows.slice(0, 30).map((row) => {
      const cap = C.num(row.market_cap);
      return U.stockRow({
        id: row.id, name: row.rank + '. ' + row.name, sub: row.symbol,
        value: Number.isFinite(cap) ? (row.currency === 'USD' ? '$' + (cap / 1e9).toLocaleString('en-US', {maximumFractionDigits: 0}) + 'B' : C.wonText(cap)) : '시가총액 미확인',
        heart: true
      });
    });
    const day = (universe.collected_at || '').slice(0, 10);
    host.replaceChildren(picker, el('ul', {class: 'rows'}, rows), U.note('시가총액이 큰 순서예요' + (day ? '(' + day + ' 수집).' : '.') + ' 순위는 사라는 뜻이 아니에요.'));
  }

  function showDiscover() {
    const rankHost = el('div', {class: 'slot'}, U.loading()), universeHost = el('div', {class: 'slot'}, U.loading());
    discoverRoot.replaceChildren(
      el('h1', {class: 'page-title', text: '발견'}),
      el('div', {class: 'columns'},
        el('div', {class: 'column'}, U.section('실시간 순위', rankHost)),
        el('div', {class: 'column'}, U.section('시가총액 순', universeHost))));
    rankBlock(rankHost);
    universeBlock(universeHost);
  }

  // ---- 종목 화면 ------------------------------------------------------------------------------
  const RANGES = [['1M', '1개월'], ['3M', '3개월'], ['1Y', '1년'], ['5Y', '5년']];
  let chartHandle = null, stockToken = 0, chartToken = 0, redrawChart = null;

  function cssColor(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  async function drawChart(host, id, range) {
    const token = ++chartToken;
    host.replaceChildren(U.loading('차트를 불러오는 중이에요'));
    const data = await U.api('api/chart?identity=' + encodeURIComponent(id) + '&range=' + range, 300);
    if (token !== chartToken || !host.isConnected) return;
    const bars = (data?.bars || []).filter((bar) => Number.isFinite(bar?.time) && C.num(bar.close) > 0);
    if (chartHandle) { chartHandle.remove(); chartHandle = null; }
    if (data?.status !== 'AVAILABLE' || bars.length < 2 || !window.LightweightCharts) { host.replaceChildren(U.empty('이 기간의 차트 자료가 없어요.')); return; }
    const first = C.num(bars[0].close), last = C.num(bars[bars.length - 1].close), dir = C.direction(last - first);
    const tone = cssColor(dir === 'down' ? '--down' : '--up');
    const box = el('div', {class: 'chart-box'});
    host.replaceChildren(
      el('p', {class: 'chart-summary'}, RANGES.find(([key]) => key === range)[1] + ' 동안 ', U.change((last / first - 1) * 100)),
      box,
      el('p', {class: 'note'}, '종가 기준이고 배당·액면분할 보정은 하지 않았어요. 차트 그리기: ', el('a', {href: 'https://www.tradingview.com/', target: '_blank', rel: 'noopener noreferrer', text: 'TradingView Lightweight Charts'})));
    chartHandle = window.LightweightCharts.createChart(box, {
      height: 260, autoSize: true,
      layout: {background: {color: 'transparent'}, textColor: cssColor('--sub'), fontFamily: 'Pretendard, sans-serif'},
      grid: {vertLines: {visible: false}, horzLines: {color: cssColor('--line')}},
      rightPriceScale: {borderVisible: false}, timeScale: {borderVisible: false, timeVisible: range === '1M'},
      handleScroll: false, handleScale: false
    });
    // 원화는 소수 없이, 달러는 둘째 자리까지.
    const won = id.startsWith('KR:');
    const series = chartHandle.addAreaSeries({lineColor: tone, topColor: tone + '33', bottomColor: tone + '00', lineWidth: 2, priceLineVisible: false,
      priceFormat: {type: 'price', precision: won ? 0 : 2, minMove: won ? 1 : 0.01}});
    series.setData(bars.map((bar) => ({time: bar.time, value: C.num(bar.close)})));
    chartHandle.timeScale().fitContent();
  }

  function fact(label, value) { return value === null || value === undefined ? null : el('div', {}, el('dt', {text: label}), el('dd', {text: value})); }

  // 52주 최저~최고 사이에서 지금 가격의 위치.
  function rangeBar(low, high, price) {
    if (![low, high, price].every(Number.isFinite) || !(high > low)) return null;
    const dot = el('i', {});
    dot.style.setProperty('left', (Math.min(1, Math.max(0, (price - low) / (high - low))) * 100).toFixed(1) + '%');
    return el('div', {class: 'range'},
      el('span', {class: 'range-track'}, dot),
      el('span', {class: 'range-ends'}, el('small', {text: '52주 최저 ' + C.priceText(low, 'KRW')}), el('small', {text: '최고 ' + C.priceText(high, 'KRW')})));
  }

  // 최근 5거래일 투자자별 순매수(주식 수). 막대 길이는 그 5일 안에서 가장 큰 값 기준.
  function investorBlock(rows) {
    const recent = (rows || []).slice(0, 5).filter((row) => ['individual', 'foreign', 'institution'].every((key) => Number.isFinite(row[key])));
    if (!recent.length) return null;
    const widest = Math.max(...recent.flatMap((row) => [row.individual, row.foreign, row.institution].map(Math.abs)), 1);
    const cell = (value) => {
      const bar = el('span', {class: 'mini-bar tone-bg-' + C.direction(value)});
      bar.style.setProperty('width', Math.max(2, Math.abs(value) / widest * 100).toFixed(1) + '%');
      return el('td', {}, bar, el('small', {class: 'tone-' + C.direction(value), text: (value > 0 ? '+' : '') + Math.round(value / 1000).toLocaleString('ko-KR') + '천'}));
    };
    const table = el('table', {class: 'flow'},
      el('thead', {}, el('tr', {}, el('th', {scope: 'col', text: '날짜'}), el('th', {scope: 'col', text: '개인'}), el('th', {scope: 'col', text: '외국인'}), el('th', {scope: 'col', text: '기관'}))),
      el('tbody', {}, recent.map((row) => el('tr', {}, el('th', {scope: 'row', text: String(row.date).slice(5)}), cell(row.individual), cell(row.foreign), cell(row.institution)))));
    return U.section('누가 사고 팔았나', el('div', {class: 'table-scroll'}, table), U.note('최근 5거래일 순매수 주식 수예요. 빨강은 산 쪽, 파랑은 판 쪽이 많았다는 뜻이에요.'));
  }

  function newsBlock(title, items) {
    const rows = items.filter((item) => item?.title).slice(0, 6).map((item) => {
      const meta = [item.publisher || item.source, C.ageText(item.published_at)].filter(Boolean).join(', ');
      const body = [el('strong', {text: U.plain(item.title)}), meta ? el('small', {text: meta}) : null];
      return el('li', {class: 'row'}, /^https:\/\//.test(item.url || '')
        ? el('a', {class: 'row-main stacked', href: item.url, target: '_blank', rel: 'noopener noreferrer'}, ...body)
        : el('span', {class: 'row-main stacked'}, ...body));
    });
    return rows.length ? U.section(title, el('ul', {class: 'rows'}, rows)) : null;
  }

  function companyBlock(company) {
    if (!company) return null;
    const parts = [];
    // 자료 앞에 붙은 분류 표시("업종 기반 검토: ")는 떼고 문장만 보여 준다.
    const sentence = (text) => String(text).replace(/^[가-힣 ]{2,12}: /, '');
    if (company.overview && !/확인하지 못했/.test(company.overview)) parts.push(el('p', {text: sentence(company.overview)}));
    const financials = company.financials;
    if (financials?.status === 'AVAILABLE') {
      const money = (value) => { const n = C.num(value); return Number.isFinite(n) ? (financials.currency === 'USD' ? '$' + (n / 1e9).toLocaleString('en-US', {maximumFractionDigits: 1}) + 'B' : C.wonText(n)) : null; };
      parts.push(el('dl', {class: 'facts'}, fact('매출(' + (financials.fiscal_year || '최근') + '년)', money(financials.revenue)), fact('영업이익', money(financials.operating_income))));
    }
    const lists = [['돈을 버는 방식', company.business_model], ['실적을 움직이는 것', company.drivers], ['조심할 점', company.risks]];
    lists.forEach(([label, lines]) => {
      if (Array.isArray(lines) && lines.length) parts.push(el('h3', {class: 'sub-title', text: label}), ...lines.slice(0, 2).map((line) => el('p', {text: sentence(line)})));
    });
    if (!parts.length) return null;
    return U.section('어떤 회사인가요', ...parts, U.note((company.industry ? company.industry + ' 업종. ' : '') + '공개 자료를 정리한 설명이고 독립 검증 전이에요.'));
  }

  async function showStock(id) {
    const token = ++stockToken;
    redrawChart = null;
    ++chartToken;
    if (chartHandle) { chartHandle.remove(); chartHandle = null; }
    if (!/^(KR:[0-9A-Z]{6}|US:[A-Z][A-Z0-9.-]{0,14})$/.test(id)) { stockRoot.replaceChildren(U.empty('종목을 찾지 못했어요.')); return; }
    const [market, code] = id.split(':'), kr = market === 'KR';
    stockRoot.replaceChildren(el('a', {class: 'back', href: '#discover'}, U.icon('back', 18), '발견'), U.loading());

    const [quoteMap, research, info, card] = await Promise.all([
      U.quotes([id]), D.research(),
      kr ? U.api('api/stock-info?code=' + code, 60) : null,
      U.api('api/market-card?identity=' + encodeURIComponent(id), 120)
    ]);
    if (token !== stockToken) return;
    const company = research?.companies?.find((item) => item.id === id);
    const quote = quoteMap.get(id);
    const name = quote?.name || info?.name || company?.name || code;
    const price = quote?.price ?? (card?.quote?.status === 'AVAILABLE' ? C.num(card.quote.price) : info ? C.num(info.price) : NaN);
    const currency = kr ? 'KRW' : 'USD';
    const percent = quote?.changePercent ?? (info && Number.isFinite(info.change_rate) ? info.change_rate : undefined);

    const head = el('header', {class: 'stock-head'},
      el('div', {}, el('h1', {class: 'page-title', text: name}), el('p', {class: 'stock-code', text: code + ', ' + (kr ? '한국' : '미국')})),
      U.heartButton(id, name));
    const priceLine = el('p', {class: 'stock-price'}, el('strong', {text: C.priceText(price, currency) || '시세 미확인'}), percent === undefined ? null : U.change(percent));
    const stamp = U.timeText(quote?.at || card?.quote?.as_of);

    const chartHost = el('div', {class: 'slot'});
    let range = '3M';
    const chartBlock = el('section', {class: 'block'},
      U.segmented(RANGES, range, (next) => { range = next; drawChart(chartHost, id, range); }, '차트 기간'), chartHost);
    redrawChart = () => drawChart(chartHost, id, range);

    const facts = info?.facts;
    const factBlock = facts ? U.section('핵심 숫자',
      rangeBar(C.num(facts.low52), C.num(facts.high52), price),
      el('dl', {class: 'facts'},
        fact('시가총액', facts.market_cap ? facts.market_cap + '원' : null),
        fact('PER', Number.isFinite(facts.per) ? C.cut2(facts.per) + '배' : null),
        fact('PBR', Number.isFinite(facts.pbr) ? C.cut2(facts.pbr) + '배' : null),
        fact('배당수익률', Number.isFinite(facts.dividend_yield) ? C.cut2(facts.dividend_yield) + '%' : null),
        fact('외국인 보유', Number.isFinite(facts.foreign_rate) ? C.cut2(facts.foreign_rate) + '%' : null),
        fact('거래대금', facts.trading_value ? facts.trading_value + '원' : null)),
      U.note((info.source?.label || '공개 시세') + ' 기준이에요. PER은 주가가 이익의 몇 배인지, PBR은 순자산의 몇 배인지를 뜻해요.')) : null;

    const peers = (info?.peers || []).filter((peer) => /^[0-9A-Z]{6}$/.test(peer?.code));
    const peerBlock = peers.length ? U.section('같은 업종 종목', el('ul', {class: 'rows'}, peers.map((peer) => U.stockRow({
      id: 'KR:' + peer.code, name: peer.name, sub: peer.market || '', value: C.priceText(C.num(peer.price), 'KRW'), percent: Number.isFinite(peer.change_rate) ? peer.change_rate : undefined
    })))) : null;

    const newsHost = el('div', {});
    stockRoot.replaceChildren(
      el('a', {class: 'back', href: '#discover'}, U.icon('back', 18), '발견'),
      head, priceLine,
      U.note(stamp ? stamp + ' 기준, 공개 시세라 조금 늦을 수 있어요.' : '시세 기준 시각을 확인하지 못했어요.'),
      el('div', {class: 'columns'},
        el('div', {class: 'column'}, chartBlock, factBlock, investorBlock(info?.investors)),
        el('div', {class: 'column'}, companyBlock(company), newsHost, peerBlock)));
    drawChart(chartHost, id, range);

    const [stockNews, companyNews] = await Promise.all([
      kr ? U.api('api/stock-news?code=' + code, 300) : null,
      U.api('api/company-news?identity=' + encodeURIComponent(id), 600)
    ]);
    if (token !== stockToken) return;
    newsHost.replaceChildren(...[
      newsBlock('뉴스', stockNews?.news?.length ? stockNews.news : companyNews?.items || []),
      newsBlock('공시', stockNews?.disclosures || [])
    ].filter(Boolean));
  }

  document.addEventListener('zero-theme-changed', () => { if (!stockRoot.hidden && chartHandle) redrawChart?.(); });

  U.route('discover', {title: () => '발견', show: showDiscover});
  U.route('stock', {tab: 'discover', title: (arg) => arg.split(':')[1] || '종목', show: showStock});
})();
