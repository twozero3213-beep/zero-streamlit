/* 발견: 종목 검색, 실시간 순위, 시가총액 순 목록. 종목 화면: 가격, 차트, 핵심 숫자, 투자자별 매매, 회사 소개, 뉴스. */
(() => {
  'use strict';
  const C = window.ZeroCore, U = window.ZeroUI, D = window.ZeroData;
  const {el} = U;
  const discoverRoot = document.getElementById('view-discover'), stockRoot = document.getElementById('view-stock');
  const UNIVERSES = [['SP500', '미국 100'], ['KOSPI', '코스피 50'], ['KOSDAQ', '코스닥 50'], ['ETF', 'ETF 50']];

  // ---- 검색(머리의 검색창) --------------------------------------------------------------------
  const input = document.getElementById('search'), results = document.getElementById('search-results');
  const searchStatus = document.getElementById('search-status');
  let searchTimer = null, searchToken = 0, activeSearch = -1;

  function closeSearch() {
    ++searchToken; clearTimeout(searchTimer); activeSearch = -1;
    results.hidden = true; results.replaceChildren();
    input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-busy', 'false');
    input.removeAttribute('aria-activedescendant');
    if (searchStatus) searchStatus.textContent = '';
  }

  async function runSearch() {
    const token = ++searchToken;
    const query = input.value.trim();
    if (!query) { closeSearch(); return; }
    const research = await D.research();
    if (token !== searchToken || query !== input.value.trim()) return;
    const found = C.searchCompanies(research?.companies, query);
    results.replaceChildren(...(found.length
      ? found.map((company, index) => el('li', {role: 'presentation'}, el('a', {id: 'search-option-' + index, role: 'option', 'aria-selected': 'false', tabindex: '-1', href: '#stock/' + company.id, onclick: () => { input.value = ''; closeSearch(); }},
        el('strong', {text: company.name}), el('small', {text: company.symbol + ', ' + (company.market === 'US' ? '미국' : '한국')}))))
      : [el('li', {class: 'empty', text: '찾는 종목이 목록에 없어요. 이름이나 코드를 다시 확인해 주세요.'})]));
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-busy', 'false');
    if (searchStatus) searchStatus.textContent = '검색 결과 ' + found.length + '개예요.';
  }

  input.addEventListener('input', () => { closeSearch(); if (input.value.trim()) input.setAttribute('aria-busy', 'true'); searchTimer = setTimeout(runSearch, 150); });
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { input.value = ''; closeSearch(); }
    if (event.key === 'Tab') closeSearch();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const options = [...results.querySelectorAll('a')];
      if (results.hidden || !options.length) return;
      event.preventDefault();
      activeSearch = event.key === 'ArrowDown' ? (activeSearch + 1) % options.length : (activeSearch < 0 ? options.length - 1 : (activeSearch - 1 + options.length) % options.length);
      options.forEach((option, index) => option.setAttribute('aria-selected', String(index === activeSearch)));
      input.setAttribute('aria-activedescendant', 'search-option-' + activeSearch);
      options[activeSearch].scrollIntoView({block: 'nearest'});
    }
    if (event.key === 'Enter') { event.preventDefault(); const options = [...results.querySelectorAll('a')]; (options[activeSearch] || options[0])?.click(); }
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

  // ---- 분쟁 레이더 ----------------------------------------------------------------------------
  // 토스·카카오(다음 금융)는 5% 보고·공개매수·경영권 소송을 따로 모아 보여 주지 않는다(검토자료 전략리서치-20261114).
  // DART 공개 RSS에서 신호가 되는 공시만 골라 회사별 점수로 묶고, 쉬운 설명 아래에 원래 공시명과 접수 시각을 둔다.
  const CASES = [
    ['고려아연과 영풍', '2024년 2월 20일, 영풍이 주주총회 위임장을 모으기 시작했어요.', '2024년 9월 공개매수 보도', 205],
    ['SM엔터테인먼트', '2022년 2월 28일, 얼라인파트너스가 위임장을 모으기 시작했어요.', '2023년 2월 하이브·카카오 인수전', 344],
    ['한미사이언스', '2024년 1월 12일, 최대주주 변경 계약과 제3자배정 증자가 공시됐어요.', '2024년 1월 17일 가처분 보도', 5],
    ['한진칼', '2018년 11월 15일, 그레이스홀딩스가 경영 참여 목적으로 9%를 보고했어요.', '보도', 0]
  ];
  const hot = (level) => level === '경보' || level === '분쟁 진행';

  function signalRow(signal) {
    return el('li', {class: 'row'}, el('span', {class: 'row-main stacked'},
      el('strong', {text: signal.label}),
      el('small', {text: signal.report}),
      el('small', {text: (signal.outside ? '제출: ' + signal.filer + '(회사가 아닌 주주)' : '제출: 회사') + ', ' + (U.timeText(signal.at) || '시각 미확인') + ' 접수'}),
      el('a', {href: signal.url, target: '_blank', rel: 'noopener noreferrer', text: 'DART 원문 보기'})),
      el('span', {class: 'chip chip-off', text: '+' + signal.points}));
  }

  function radarCompany(entry, limit = 4) {
    const name = entry.stock_code ? el('a', {href: '#stock/KR:' + entry.stock_code, text: entry.company}) : el('span', {text: entry.company});
    const related = (entry.related || []).filter((item) => item.stock_code);
    return el('div', {class: 'radar-company'},
      el('div', {class: 'radar-head'}, el('strong', {class: 'radar-name'}, name),
        el('span', {class: 'chip ' + (hot(entry.level) ? 'chip-on' : 'chip-off'), text: entry.level + ' ' + entry.score + '점'})),
      el('ul', {class: 'rows'}, entry.signals.slice(0, limit).map(signalRow)),
      related.length ? el('p', {class: 'note'}, '함께 볼 회사: ', ...related.map((item) => el('a', {href: '#stock/KR:' + item.stock_code, text: item.name}))) : null);
  }

  function radarRules(data) {
    return [
      el('details', {class: 'details'}, el('summary', {text: '점수는 이렇게 매겨요'}),
        el('p', {text: '최근 ' + data.window_days + '일 공시에서 아래 신호를 더해요. 30점 관찰, 60점 경보, 90점 분쟁 진행이에요.'}),
        el('p', {text: '공개매수 50, 법원에 주총 소집 신청 40, 경영 참여 목적 5% 보고 35, 경영권 소송 35, 최대주주 변경 30, 위임장 권유 25, 소송 판결 15, 주주제안 15, 해명 공시 10, 증자와 자사주 5점이에요.'}),
        el('p', {text: '5% 보고와 위임장은 회사가 아닌 주주가 냈을 때만 세요. 최대주주의 가족이 낸 보고도 여기에 들어갈 수 있어요.'}),
        el('p', {text: '점수는 지난 사례 4건으로 맞춘 초안이라 틀릴 수 있어요. 지켜보는 회사는 ' + (data.watch || []).map((item) => item.name).join(', ') + '이고, 오늘 공시된 모든 회사도 함께 봐요.'})),
      el('details', {class: 'details'}, el('summary', {text: '지난 분쟁은 뉴스보다 공시가 먼저였어요'}),
        ...CASES.map(([name, first, headline, days]) => el('p', {}, el('strong', {text: name + ': '}), first + ' ' + (days ? headline + '보다 ' + days + '일 먼저였어요.' : headline + '와 같은 날이었어요.'))))
    ];
  }

  async function radarBlock(host, section) {
    const data = await D.governance();
    if (data?.scope !== 'GOVERNANCE_RADAR') { section.hidden = true; return; }
    const companies = data.companies || [];
    host.replaceChildren(
      el('p', {text: '경영권·지분 다툼의 첫 신호는 뉴스보다 DART 공시에 먼저 떠요. 고려아연 분쟁은 공개매수 보도보다 205일 먼저 위임장 공시가 있었어요.'}),
      ...(companies.length ? companies.slice(0, 6).map((entry) => radarCompany(entry)) : [U.empty('최근 ' + data.window_days + '일 동안 분쟁 신호가 된 공시가 없어요.')]),
      ...radarRules(data),
      U.note('자료: ' + data.source + ', ' + (U.timeText(data.retrieved_at) || '') + ' 확인. 공시 원문은 DART에서 보세요. 투자 권유가 아니에요.'));
  }

  function showDiscover() {
    const rankHost = el('div', {class: 'slot'}, U.loading()), universeHost = el('div', {class: 'slot'}, U.loading()), radarHost = el('div', {class: 'slot'}, U.loading());
    const radar = U.section('분쟁 레이더', radarHost);
    discoverRoot.replaceChildren(
      el('h1', {class: 'page-title', text: '발견'}),
      el('div', {class: 'columns'},
        el('div', {class: 'column'}, radar, U.section('실시간 순위', rankHost)),
        el('div', {class: 'column'}, U.section('시가총액 순', universeHost))));
    radarBlock(radarHost, radar);
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
      el('p', {class: 'chart-summary'}, RANGES.find(([key]) => key === range)[1] + ' 동안 ', U.change((last / first - 1) * 100), el('small', {text: ' 배당 제외 가격 기준'})),
      box,
      el('p', {class: 'note'}, data.basis === C.YAHOO_DAILY_CLOSE_BASIS ? '주식 분할을 반영한 종가 기준이고 배당 보정은 하지 않았어요. 차트 그리기: '
        : '공급자가 보낸 종가 기준이고 배당 보정은 하지 않았어요. 이 구간의 주식 분할 반영 여부는 별도로 확인하지 않았어요. 차트 그리기: ', el('a', {href: 'https://www.tradingview.com/', target: '_blank', rel: 'noopener noreferrer', text: 'TradingView Lightweight Charts'})));
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

  async function drawStockDrawdown(host, id, token) {
    const data = await U.api('api/chart?identity=' + encodeURIComponent(id) + '&range=1Y', 300);
    if (token !== stockToken || !host.isConnected) return;
    const risk = data?.identity === id ? C.chartDrawdown(data) : {state: 'UNAVAILABLE'};
    if (risk.state !== 'AVAILABLE') {
      host.replaceChildren(U.section('1년 최대 낙폭', U.note('1년 일봉의 기준·기간·누락을 확인하지 못해 표시를 보류해요.')));
      return;
    }
    const day = (at) => el('span', {class: 'nowrap', text: new Date(at).toISOString().slice(0, 10)});
    // 먼저 쉬운 한 문장, 기간·종가 수·출처는 '기준 보기'에 접어 둔다.
    host.replaceChildren(U.section('1년 최대 낙폭',
      el('p', {class: 'hero-line'}, '1년 동안 가장 비쌌을 때와 비교해 최대 ', el('strong', {class: 'tone-down', text: C.percentText(-risk.percent)}), '까지 내려갔었어요.'),
      el('p', {class: 'note'}, '고점 ', day(risk.peakAt), ', 저점 ', day(risk.troughAt)),
      el('details', {class: 'details'}, el('summary', {text: '기준 보기'}),
        el('p', {}, day(risk.startAt), '부터 ', day(risk.endAt), '까지 종가 ' + risk.count + '개, ' + risk.currency + ' 기준이에요.'),
        el('p', {text: (risk.splitAdjusted ? '주식 분할을 반영한 종가로' : '받은 종가 그대로') + ' 계산했고 배당·환율·세금·수수료는 넣지 않았어요. 장중 가격이나 빠진 거래일 때문에 실제 낙폭과 조금 다를 수 있어요.'}),
        el('p', {}, el('a', {href: risk.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Yahoo Finance 일봉 출처'})))));
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
    // 공시 말투 '동사는'은 '이 회사는'으로 바꾼다.
    const sentence = (text) => String(text).replace(/^[가-힣 ]{2,12}: /, '').replace(/^동사(는|의|가)/, (_, josa) => '이 회사' + josa);
    // 원문에서 쉼표로 끊겨 들어온 문장은 뜻이 반쯤 잘려 보여서 뺀다.
    const whole = (line) => !/[,，]\s*$/.test(String(line));
    if (company.overview && !/확인하지 못했/.test(company.overview)) parts.push(el('p', {text: sentence(company.overview)}));
    const financials = company.financials;
    if (financials?.status === 'AVAILABLE') {
      const money = (value) => { const n = C.num(value); return Number.isFinite(n) ? (financials.currency === 'USD' ? '$' + (n / 1e9).toLocaleString('en-US', {maximumFractionDigits: 1}) + 'B' : C.wonText(n)) : null; };
      parts.push(el('dl', {class: 'facts'}, fact('매출(' + (financials.fiscal_year || '최근') + '년)', money(financials.revenue)), fact('영업이익', money(financials.operating_income))));
    }
    const etf = company.kind === 'ETF';
    const lists = [[etf ? '무엇을 따라가나요' : '돈을 버는 방식', company.business_model], [etf ? '값을 움직이는 것' : '실적을 움직이는 것', company.drivers], ['조심할 점', company.risks]];
    lists.forEach(([label, lines]) => {
      const kept = Array.isArray(lines) ? lines.filter(whole).slice(0, 2) : [];
      if (kept.length) parts.push(el('h3', {class: 'sub-title', text: label}), ...kept.map((line) => el('p', {text: sentence(line)})));
    });
    if (!parts.length) return null;
    return U.section(etf ? '어떤 상품인가요' : '어떤 회사인가요', ...parts, U.note((company.industry ? company.industry + (etf ? '. ' : ' 업종. ') : '') + '공개 자료를 정리한 설명이고 독립 검증 전이에요.'));
  }

  async function showStock(id) {
    const token = ++stockToken;
    redrawChart = null;
    ++chartToken;
    if (chartHandle) { chartHandle.remove(); chartHandle = null; }
    if (!/^(KR:[0-9A-Z]{6}|US:[A-Z][A-Z0-9.-]{0,14})$/.test(id)) { stockRoot.replaceChildren(U.empty('종목을 찾지 못했어요.')); return; }
    const [market, code] = id.split(':'), kr = market === 'KR';
    stockRoot.replaceChildren(el('a', {class: 'back', href: '#discover'}, U.icon('back', 18), '발견'), U.loading());

    const [quoteMap, research, info, card, decade, radar] = await Promise.all([
      U.quotes([id]), D.research(),
      kr ? U.api('api/stock-info?code=' + code, 60) : null,
      U.api('api/market-card?identity=' + encodeURIComponent(id), 120),
      kr ? null : D.decade(),
      kr ? D.governance() : null
    ]);
    if (token !== stockToken) return;
    const company = research?.companies?.find((item) => item.id === id);
    const quote = quoteMap.get(id);
    const name = quote?.name || info?.name || company?.name || code;
    document.title = name + ' | ZERO';
    const snapshot = C.stockSnapshot(quote, card, info);
    const price = snapshot?.price ?? NaN;
    const currency = kr ? 'KRW' : 'USD';
    const percent = snapshot?.changePercent ?? undefined;

    const head = el('header', {class: 'stock-head'},
      el('div', {}, el('h1', {class: 'page-title', text: name}), el('p', {class: 'stock-code', text: code + ', ' + (kr ? '한국' : '미국')})),
      U.heartButton(id, name));
    const priceLine = el('p', {class: 'stock-price'}, el('strong', {text: C.priceText(price, currency) || '시세 미확인'}), percent === undefined ? null : U.change(percent));
    const stamp = U.timeText(snapshot?.at);

    const chartHost = el('div', {class: 'slot'});
    const drawdownHost = el('div', {}, U.section('1년 최대 낙폭', U.loading('일봉을 확인하는 중이에요')));
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

    // 미국 종목은 공개 숫자 자료가 없어 10년 비교 계산에서 함께 얻은 최근 1년 배당수익률만 보여 준다.
    const dividend = C.num(decade?.items?.find((item) => item.symbol === code)?.dividend_yield_percent);
    const usFacts = !kr && Number.isFinite(dividend) ? U.section('핵심 숫자',
      el('dl', {class: 'facts'}, fact('배당수익률(최근 1년)', C.cut2(dividend) + '%')),
      U.note('최근 1년 동안 받은 주당 배당을 지금 가격으로 나눈 값이에요. 자료: Yahoo Finance.')) : null;

    // 이 회사에 최근 분쟁 신호가 있으면 종목 화면 위쪽에 묶어 보여 준다(카카오 검토의 '종목 머리 배지').
    const dispute = kr && radar?.scope === 'GOVERNANCE_RADAR' ? (radar.companies || []).find((entry) => entry.stock_code === code || entry.company === name) : null;
    const disputeBlock = dispute ? U.section('분쟁 신호', radarCompany(dispute, 3), el('a', {class: 'button ghost', href: '#discover', text: '분쟁 레이더 전체 보기'})) : null;
    // 증권사 리포트는 모아 오지 않는다. 목록 사이트들이 자동 수집을 금지해서 원문 사이트로만 연결한다.
    const researchLinks = kr ? U.section('증권사 리포트',
      el('ul', {class: 'rows'}, [['네이버페이 증권 리서치', 'https://stock.naver.com/research/company'], ['한경 컨센서스', 'https://consensus.hankyung.com/analysis/list'], ['한국IR협의회 기업리서치(무료 보고서)', 'https://www.kirs.or.kr/research/research.html']]
        .map(([label, href]) => el('li', {class: 'row'}, el('a', {class: 'row-main', href, target: '_blank', rel: 'noopener noreferrer', text: label})))),
      U.note('ZERO는 리포트를 모아 오지 않고 원문 사이트로 연결해요. 종목 이름으로 찾아보세요.')) : null;

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
        el('div', {class: 'column'}, disputeBlock, chartBlock, factBlock || usFacts, drawdownHost, investorBlock(info?.investors)),
        el('div', {class: 'column'}, companyBlock(company), newsHost, researchLinks, peerBlock)));
    drawChart(chartHost, id, range);
    drawStockDrawdown(drawdownHost, id, token);

    // 회사 뉴스는 연구 자료의 회사(미국은 GOOG 같은 다른 기호 포함)에만 있다. ETF를 물으면 서버가 거절한다.
    const listed = research?.companies?.some((item) => item.kind === 'COMPANY' && (item.id === id || (!kr && item.symbols?.includes(code))));
    const [stockNews, companyNews] = await Promise.all([
      kr ? U.api('api/stock-news?code=' + code, 300) : null,
      listed ? U.api('api/company-news?identity=' + encodeURIComponent(id), 600) : null
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
