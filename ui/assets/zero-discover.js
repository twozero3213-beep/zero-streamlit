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

  // ---- 공시와 시장 관심 -----------------------------------------------------------------------
  const SIDES = {company: '회사', insider: '최대주주 쪽', holder: '주주', unknown: '관계 미확인'};
  const NEWS_CATEGORIES = {TENDER: '공개매수', CONTROL_STAKE: '지분·경영권', EARNINGS: '실적', POLICY: '정책', MARKET: '시장', OTHER: '기타'};
  const SOURCE_STATES = {AVAILABLE: '확인됨', EMPTY: '해당 자료 없음', UNAVAILABLE: '확인 실패'};
  const PUBLIC_STATES = ['AVAILABLE', 'EMPTY', 'PARTIAL', 'UNAVAILABLE'];
  const list = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
  const kstDay = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);

  function publicLink(url, label, hosts) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !hosts.includes(parsed.hostname)) return null;
      return el('a', {class: 'public-link', href: parsed.href, target: '_blank', rel: 'noopener noreferrer', text: label});
    } catch { return null; }
  }

  function deliveryNotes(data) {
    if (data.delivery !== 'SAVED_DAILY') return [];
    return [U.note('소유자 PC의 일일 갱신 때 저장한 자료예요. 저장 시각: ' + (U.timeText(data.published_at) || '미확인') + '.'),
      data.stale ? el('p', {class: 'note', role: 'status', text: '저장 자료가 하루 이상 지났어요.'}) : null].filter(Boolean);
  }

  function signalRow(signal) {
    const at = Date.parse(signal.at), today = Number.isFinite(at) && kstDay(at) === kstDay(Date.now());
    const when = [today ? '오늘' : null, U.timeText(signal.at) || '시각 미확인', '접수', signal.after_close ? '(장 시간 밖)' : null].filter(Boolean).join(' ');
    return el('li', {class: 'row'}, el('span', {class: 'row-main stacked'},
      el('strong', {text: signal.report || '공시명 미확인'}),
      signal.label ? el('small', {text: signal.label}) : null,
      signal.corrected || signal.withdrawn ? el('small', {text: [signal.corrected ? '정정 공시' : null, signal.withdrawn ? '철회·취소 공시' : null].filter(Boolean).join(', ')}) : null,
      el('small', {text: '제출: ' + (signal.filer || '제출인 미확인') + ' (' + (SIDES[signal.side] || SIDES.unknown) + '), ' + when}),
      publicLink(signal.url, 'DART 원문 보기', ['dart.fss.or.kr'])));
  }

  function radarCompany(entry) {
    const signals = list(entry.signals), code = /^[0-9A-Z]{6}$/.test(entry.stock_code || '') ? entry.stock_code : null;
    const name = code ? el('a', {href: '#stock/KR:' + code, text: entry.company || code}) : el('span', {text: entry.company || '회사명 미확인'});
    const related = list(entry.related).filter((item) => /^[0-9A-Z]{6}$/.test(item.stock_code || ''));
    const types = [...new Set(signals.map((signal) => signal.label || signal.report || '유형 미확인'))];
    return el('div', {class: 'radar-company'},
      el('div', {class: 'radar-head'}, el('strong', {class: 'radar-name'}, name), el('span', {class: 'radar-count', text: '공시 ' + signals.length + '건'})),
      U.note(types.join(', ') || '공시 유형 미확인'),
      el('details', {class: 'details'}, el('summary', {text: '공시 ' + signals.length + '건과 원문 보기'}),
        el('ul', {class: 'rows'}, signals.slice(0, 4).map(signalRow)),
        signals.length > 4 ? el('details', {class: 'details'}, el('summary', {text: '나머지 공시 ' + (signals.length - 4) + '건'}), el('ul', {class: 'rows'}, signals.slice(4).map(signalRow))) : null,
        Number.isFinite(entry.score) ? el('details', {class: 'details'}, el('summary', {text: '제목 기반 참고 점수'}), U.note(entry.score + '점. 정정·철회는 새 사건으로 가산하지 않아요. 점수는 분쟁 발생이나 수익을 예측하지 않아요.')) : null),
      related.length ? el('p', {class: 'note'}, '함께 볼 회사: ', ...related.map((item) => el('a', {href: '#stock/KR:' + item.stock_code, text: item.name || item.stock_code}))) : null);
  }

  function renderRadar(host, data, companies) {
    const source = publicLink('https://dart.fss.or.kr/', 'DART에서 공시 직접 확인', ['dart.fss.or.kr']);
    if (data?.scope !== 'GOVERNANCE_RADAR' || !PUBLIC_STATES.includes(data.state) || data.state === 'UNAVAILABLE') {
      host.replaceChildren(...deliveryNotes(data || {}), U.empty('지분·경영권 관련 공시 자료를 확인하지 못했어요. 공시 유무를 판단할 수 없어요.'), source);
      return;
    }
    const entries = companies || list(data.companies);
    const partial = data.state === 'PARTIAL';
    host.replaceChildren(...[
      ...deliveryNotes(data),
      U.note('수집 시각: ' + (U.timeText(data.retrieved_at) || '미확인') + '.'),
      U.note(typeof data.coverage === 'string' ? data.coverage : '일부 DART RSS의 공시 제목만 확인해요. 전 종목·전체 공시를 조사한 자료가 아니에요.'),
      partial ? el('p', {class: 'note', role: 'status', text: '일부 출처를 확인하지 못했어요. 확인된 공시만 표시하므로 공시 유무를 판단할 수 없어요.'}) : null,
      ...(entries.length ? entries.slice(0, 6).map(radarCompany) : [U.empty(partial ? '확인된 관련 공시를 표시할 수 없어요. DART 원문에서 확인해 주세요.' : '이번에 확인한 수집 범위에서 관련 공시를 찾지 못했어요.')]),
      entries.length > 6 ? el('details', {class: 'details'}, el('summary', {text: '나머지 회사 ' + (entries.length - 6) + '곳'}), ...entries.slice(6).map(radarCompany)) : null,
      el('details', {class: 'details'}, el('summary', {text: '자료와 참고 점수의 한계'}),
        U.note(typeof data.score_note === 'string' ? data.score_note : '제목 기반 참고 점수이며 분쟁 발생 확률이나 투자 판단이 아니에요.'),
        U.note('공시 제목의 유형을 모은 목록이에요. 소송의 당사자·결론이나 지분 다툼 여부는 원문을 읽어 확인해야 해요. 제출인 관계 분류도 틀릴 수 있어요.')),
      source].filter(Boolean));
  }

  async function radarBlock(host) {
    const data = await D.governance();
    if (!host.isConnected) return;
    renderRadar(host, data);
  }

  // 전 상장회사 명부와 저장 이력은 최근 RSS의 제한된 관찰 목록과 구분한다.
  const OWNERSHIP_CORRECTIONS = {ORIGINAL: '원 공시', CORRECTED: '정정 공시', HAS_CORRECTION: '후속 정정 있음', WITHDRAWN: '철회 공시'};
  const OWNERSHIP_PROGRESS = {REGISTRY_INCOMPLETE: '상장회사 명부 연결 미완료', BACKFILLING: '과거 구간 수집 중', COMPLETE: '요청 구간 수집 상태 확인', LATEST_INCOMPLETE: '최신 구간 수집 미완료', UNAVAILABLE: '수집 자료 미준비', BUSY: '수집 진행 중'};
  const ownershipCount = (value) => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('ko-KR') : '미확인';
  function ownershipTime(iso) {
    const stamp = typeof iso === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(iso) ? Date.parse(iso) : NaN;
    return Number.isFinite(stamp) ? new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(stamp)) + ' (한국 시각)' : '미확인';
  }
  function ownershipNumber(value, unit, signed = false) {
    return typeof value === 'number' && Number.isFinite(value) ? (signed && value > 0 ? '+' : '') + value.toLocaleString('ko-KR', {maximumFractionDigits: 12}) + unit : '미확인';
  }

  function ownershipRow(row, selectCompany, detailed = false) {
    const code = /^[0-9A-Z]{6}$/.test(row.stock_code || '') ? row.stock_code : null;
    const metrics = el('dl', {class: 'facts'},
      fact('보고서 기준 비율', ownershipNumber(row.ratio, '%')),
      fact('비율 증감', ownershipNumber(row.ratio_change, '%p', true)),
      fact('보고서 기준 주식수', ownershipNumber(row.shares, '주')),
      fact('주식수 증감', ownershipNumber(row.shares_change, '주', true)));
    return el('li', {class: 'ownership-item'},
      el('strong', {text: row.company || code || '회사명 미확인'}),
      el('p', {text: row.report || '공시명 미확인'}),
      U.note('접수일: ' + (row.received_date || '미확인') + ', 최초 탐지: ' + ownershipTime(row.detected_at) + '.'),
      U.note(OWNERSHIP_CORRECTIONS[row.correction_status] || '정정 상태 미확인'),
      detailed ? metrics : el('details', {class: 'details'}, el('summary', {text: '보고서 수치 보기'}), metrics),
      row.holder ? U.note('보고자: ' + row.holder) : null,
      row.reason ? U.note('변동 사유: ' + row.reason) : null,
      row.body_verified === false ? U.note('공시 본문은 확인하지 않았어요. 수치는 보고서 기준이며 실시간 지분을 뜻하지 않아요.') : null,
      el('div', {class: 'button-row'}, publicLink(row.url, 'DART 원문 보기', ['dart.fss.or.kr']),
        code && selectCompany ? el('button', {class: 'button ghost', type: 'button', text: '회사 장기 이력 보기', onclick: () => selectCompany(code, row.company || code)}) : null));
  }

  function ownershipHistory(host, code, name, isCurrent = () => true) {
    let token = 0, revision = null;
    const status = el('div', {role: 'status'}), content = el('div', {class: 'slot'});
    host.replaceChildren(status, content);
    async function load(page = 1) {
      const current = ++token, requestedRevision = revision;
      status.replaceChildren(U.loading('장기 공시 이력을 확인하는 중이에요'));
      const data = await U.api('api/ownership?code=' + encodeURIComponent(code) + '&page=' + page + (requestedRevision ? '&revision=' + requestedRevision : ''), 120);
      if (current !== token || !host.isConnected || !isCurrent()) return false;
      if (data?.scope !== 'OWNERSHIP_HISTORY' || data.stock_code !== code || data.page !== page || !/^[0-9a-f]{64}$/.test(data.revision || '') ||
          requestedRevision && data.revision !== requestedRevision || !Array.isArray(data.items) || data.items.length > 100) {
        status.replaceChildren(U.empty('장기 이력을 확인하지 못했거나 자료 판본이 바뀌었어요. 처음부터 다시 조회해 주세요.'),
          el('button', {class: 'button ghost', type: 'button', text: '처음부터 다시 조회', onclick: () => { revision = null; load(1); }}));
        return false;
      }
      revision = data.revision;
      const totalPages = Number.isSafeInteger(data.total_pages) && data.total_pages > 0 ? data.total_pages : 0;
      status.replaceChildren(U.note((data.company || name || code) + ' 장기 공시 이력을 확인했어요.'));
      content.replaceChildren(...[
        el('h3', {text: (data.company || name || code) + ' 장기 공시 이력'}),
        U.note('요청 기간: ' + (data.requested_from || '미확인') + ' ~ ' + (data.requested_to || '미확인') + '. 저장 공시 ' + ownershipCount(data.total_count) + '건.'),
        U.note('저장된 공시 이력이며 요청 기간 전체의 수집 완료를 뜻하지 않아요. 수집 범위를 함께 확인해 주세요.'),
        data.stale === true ? el('p', {class: 'note', role: 'status', text: '저장 자료가 오래됐거나 갱신 범위를 확인하지 못했어요. 마지막 수집 성공 시각을 확인해 주세요.'}) : null,
        data.items.length ? el('ul', {class: 'rows'}, list(data.items).map((row) => ownershipRow(row, null, true))) : U.empty('이 회사의 저장된 공시 이력이 없어요. 미수집 구간이 있을 수 있어요.'),
        totalPages ? el('div', {class: 'button-row ownership-pages'},
          el('button', {class: 'button ghost', type: 'button', text: '이전 페이지', disabled: page <= 1, onclick: () => load(page - 1)}),
          el('span', {text: page + ' / ' + totalPages + ' 페이지'}),
          el('button', {class: 'button ghost', type: 'button', text: '다음 페이지', disabled: page >= totalPages, onclick: () => load(page + 1)})) : null,
        el('button', {class: 'button ghost', type: 'button', text: '최신 판본으로 다시 조회', onclick: () => { revision = null; load(1); }})
      ].filter(Boolean));
      return true;
    }
    return {load};
  }

  async function ownershipRssFallback(host) {
    const rss = el('div', {class: 'slot'});
    host.replaceChildren(U.empty('전 상장회사 장기 감시 자료가 아직 준비되지 않았거나 조회에 실패했어요.'),
      U.note('아래는 제한된 RSS 자료예요. 전 상장회사나 장기 이력을 확인한 결과가 아니에요.'), rss);
    await radarBlock(rss);
  }

  function ownershipMonitor(host) {
    let token = 0, ready = false, registry = [], choices = [], selection = 0, chosenSearch = '';
    const refreshError = el('p', {class: 'note', role: 'status'});
    const status = el('div', {class: 'slot'}), latest = el('div', {class: 'slot'});
    const search = el('input', {id: 'ownership-search', type: 'search', placeholder: '회사명이나 6자리 종목코드', autocomplete: 'off', 'aria-controls': 'ownership-results'});
    const results = el('ul', {id: 'ownership-results', class: 'rows'}), searchStatus = el('p', {class: 'note', role: 'status'});
    const historyHost = el('div', {id: 'ownership-history', class: 'slot'});
    function selectCompany(code, name) {
      if (!/^[0-9A-Z]{6}$/.test(code)) return;
      const selected = ++selection;
      search.value = name + ' (' + code + ')'; chosenSearch = search.value; results.replaceChildren(); choices = [];
      searchStatus.replaceChildren(name + '의 장기 이력을 조회해요.');
      ownershipHistory(historyHost, code, name, () => selected === selection).load(1);
    }
    function findCompanies() {
      chosenSearch = '';
      const query = search.value.trim().toLowerCase(), queryCode = query.toUpperCase();
      choices = query ? registry.filter((company) => company.stock_code === queryCode || company.stock_code.startsWith(queryCode) || company.company.toLowerCase().includes(query))
        .sort((a, b) => Number(b.stock_code === queryCode) - Number(a.stock_code === queryCode)).slice(0, 10) : [];
      if (!choices.length && /^[0-9A-Z]{6}$/.test(queryCode)) choices = [{stock_code: queryCode, company: queryCode}];
      results.replaceChildren(...choices.map((company) => el('li', {class: 'row'}, el('button', {class: 'row-main ownership-company', type: 'button', text: company.company + ' (' + company.stock_code + ')', onclick: () => selectCompany(company.stock_code, company.company)}))));
      searchStatus.replaceChildren(query ? (choices.length ? '검색 결과 ' + choices.length + '개예요. 최대 10개를 표시해요.' : '일치하는 회사를 찾지 못했어요. 회사명이나 코드를 확인해 주세요.') : '전 상장회사 명부에서 회사명이나 종목코드로 찾아보세요.');
    }
    search.addEventListener('input', findCompanies);
    search.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { results.replaceChildren(); choices = []; }
      if (event.key === 'ArrowDown') { const first = results.querySelectorAll('button')[0]; if (first) { event.preventDefault(); first.focus(); } }
      if (event.key === 'Enter' && choices[0]) { event.preventDefault(); selectCompany(choices[0].stock_code, choices[0].company); }
    });
    async function refresh() {
      const current = ++token, data = await U.api('api/ownership', 120);
      if (current !== token || !host.isConnected) return;
      if (data?.scope !== 'OWNERSHIP_MONITOR') {
        if (!ready) await ownershipRssFallback(host);
        else {
          refreshError.replaceChildren('전 상장회사 감시 자료를 다시 확인하지 못했어요. 앞서 받은 수집 시각과 이력을 유지해요.');
          if (!refreshError.isConnected) status.append(refreshError);
        }
        return;
      }
      if (!ready) {
        ready = true;
        host.replaceChildren(status, el('div', {class: 'ownership-search'}, el('label', {for: 'ownership-search', text: '상장회사 찾기'}), search, searchStatus, results), historyHost, latest);
        searchStatus.replaceChildren('상장회사 명부를 불러오는 중이에요.');
      }
      if (!registry.length) D.ownershipCompanies().then((data) => {
        if (!host.isConnected) return;
        registry = data?.scope === 'OWNERSHIP_COMPANIES' ? list(data.companies).filter((company) => /^[0-9A-Z]{6}$/.test(company.stock_code || '') && typeof company.company === 'string') : [];
        if (registry.length) { if (!chosenSearch || search.value !== chosenSearch) findCompanies(); }
        else if (!chosenSearch) searchStatus.replaceChildren('상장회사 명부를 확인하지 못했어요. 6자리 종목코드로 직접 조회할 수 있어요.');
      });
      status.replaceChildren(...[
        ...deliveryNotes(data),
        data.stale === true ? el('p', {class: 'note', role: 'status', text: '저장 자료가 오래됐거나 갱신 범위를 확인하지 못했어요. 마지막 수집 성공 시각을 확인해 주세요.'}) : null,
        U.note('공식 상장회사 ' + ownershipCount(data.registry_total) + '곳, 감시 연결 ' + ownershipCount(data.listed_companies) + '곳, 미연결 ' + ownershipCount(data.registry_missing) + '곳.'),
        U.note('명부 기준: ' + ownershipTime(data.registry_as_of) + '.'),
        U.note('목표 기간: ' + (data.requested_from || '미확인') + ' ~ ' + (data.requested_to || '미확인') + '.'),
        U.note('수집 완료 구간: ' + ownershipCount(data.history_windows_completed) + ' / ' + ownershipCount(data.history_windows_total) + ', 미완료 구간: ' + ownershipCount(data.incomplete_windows) + '.'),
        U.note('최신 수집 완료 범위: ' + (data.latest_complete_from || '미확인') + ' ~ ' + (data.latest_complete_to || '미확인') + '.'),
        U.note('마지막 수집 시도: ' + ownershipTime(data.last_attempt_at) + '. 마지막 수집 성공: ' + ownershipTime(data.last_success_at) + '.'),
        U.note(OWNERSHIP_PROGRESS[data.progress_state] || '수집 완료 여부를 확인할 수 없어요. 미완료 구간을 확인해 주세요.'),
        data.source_error_code ? el('p', {class: 'note', role: 'status', text: data.source_error_code === 'OWNERSHIP_REGISTRY_INCOMPLETE' ? '상장회사와 공시코드가 아직 모두 연결되지 않았어요. 미연결 회사는 현재 감시 범위에서 빠져 있어요.' : '자료원 조회에 문제가 있어요. 마지막 성공 자료와 미완료 구간을 확인해 주세요.'}) : null,
        ...(Array.isArray(data.limitations) ? data.limitations.filter((item) => typeof item === 'string').map((item) => U.note(item)) : []),
        U.note('화면을 열어 둔 동안 5분마다 상태를 다시 확인해요. 화면 조회와 수집 작업의 성공 시각은 별개예요.')
      ].filter(Boolean));
      if (data.state === 'UNAVAILABLE' && !data.last_success_at) { await ownershipRssFallback(latest); return; }
      const rows = list(data.latest).slice(0, 50);
      latest.replaceChildren(el('h3', {text: '최신 접수 공시'}), U.note('저장 공시 ' + ownershipCount(data.disclosures) + '건. 접수일과 최초 탐지 시각은 서로 달라요.'),
        ...(rows.length ? [el('ul', {class: 'rows'}, rows.slice(0, 10).map((row) => ownershipRow(row, selectCompany))),
          ...(rows.length > 10 ? [el('details', {class: 'details'}, el('summary', {text: '나머지 최신 공시 ' + (rows.length - 10) + '건'}), el('ul', {class: 'rows'}, rows.slice(10).map((row) => ownershipRow(row, selectCompany))))] : [])] : [U.empty('저장된 최신 공시가 없어요. 미완료 구간이 있으면 공시 유무를 판단할 수 없어요.')]));
    }
    return {refresh};
  }

  function communityBlock(community, index) {
    const items = list(community.items), status = SOURCE_STATES[community.status] || '확인 실패';
    return el('details', {class: 'details market-community', open: index === 0},
      el('summary', {text: (community.label || '커뮤니티명 미확인') + ', ' + status}),
      U.note('조회 시각: ' + (U.timeText(community.observed_at) || '미확인') + '.'),
      ...(community.status === 'UNAVAILABLE' ? [U.empty('이 커뮤니티의 언급 자료를 확인하지 못했어요.')] : items.length ? [el('ul', {class: 'rows'}, items.map((item) => {
        const comparable = Number.isSafeInteger(item.mentions) && item.mentions >= 0 && Number.isSafeInteger(item.mentions_24h_ago) && item.mentions_24h_ago >= 0;
        const difference = comparable ? item.mentions - item.mentions_24h_ago : null;
        return el('li', {class: 'market-item'},
          el('div', {class: 'market-item-head'}, el('strong', {text: (Number.isInteger(item.rank) ? item.rank + '. ' : '') + (item.symbol || '종목 기호 미확인')}),
            el('span', {text: Number.isFinite(item.mentions) ? '언급 ' + item.mentions.toLocaleString('ko-KR') + '회' : '언급 수 미확인'})),
          el('p', {class: 'note', text: (item.name || '') + (item.name ? ', ' : '') + (Number.isFinite(item.upvotes) ? '추천 투표 ' + item.upvotes.toLocaleString('ko-KR') : '추천 투표 수 미확인')}),
          comparable ? U.note('24시간 전 ' + item.mentions_24h_ago.toLocaleString('ko-KR') + '회, 차이 ' + (difference > 0 ? '+' : '') + difference.toLocaleString('ko-KR') + '회.') : null);
      }))] : [U.empty('이번 표본에 표시할 종목이 없어요.')]),
      publicLink(community.source_url, 'ApeWisdom에서 이 표본 보기', ['apewisdom.io']));
  }

  async function marketWatchBlock(host) {
    const data = await U.api('api/market-watch', 300);
    if (!host.isConnected) return;
    const sources = [publicLink('https://apewisdom.io/', 'ApeWisdom 공개 집계 보기', ['apewisdom.io']), publicLink('https://news.google.com/', 'Google 뉴스에서 직접 확인', ['news.google.com'])];
    if (data?.scope !== 'MARKET_WATCH' || data.schema_version !== 1 || !PUBLIC_STATES.includes(data.state) || data.state === 'UNAVAILABLE') {
      host.replaceChildren(...deliveryNotes(data || {}), U.empty('시장 관심 자료를 확인하지 못했어요. 아래 출처에서 직접 확인해 주세요.'), ...sources);
      return;
    }
    const communities = list(data.communities), news = list(data.news), partial = data.state === 'PARTIAL';
    const newsRows = news.map((item) => el('li', {class: 'market-item'},
      el('strong', {text: item.title || '제목 미확인'}),
      el('p', {class: 'note', text: (NEWS_CATEGORIES[item.category] || NEWS_CATEGORIES.OTHER) + ', ' + (item.source || '언론사 미확인') + ', ' + (U.timeText(item.published_at) || '보도 시각 미확인')}),
      publicLink(item.url, 'Google 뉴스에서 보도 보기', ['news.google.com'])));
    host.replaceChildren(...[
      ...deliveryNotes(data),
      U.note('조회 시각: ' + (U.timeText(data.observed_at) || '미확인') + '. 공급자는 갱신 시각을 제공하지 않아요.'),
      partial ? el('p', {class: 'note', role: 'status', text: '일부 출처를 확인하지 못했어요. 확인된 자료만 표시해요.'}) : null,
      el('h3', {text: '커뮤니티에서 언급한 종목'}),
      U.note('제공사 최근 24시간 집계예요. 공개 게시물·댓글 표본의 종목 언급 횟수이며 커뮤니티별 표본이 겹칠 수 있어 합산하지 않아요. 추천 투표는 게시물·댓글 반응이고 매수 추천이 아니에요.'),
      ...(communities.length ? communities.map(communityBlock) : [U.empty(partial ? '커뮤니티 자료를 확인하지 못했어요.' : '이번 표본에 표시할 종목이 없어요.')]),
      el('h3', {text: '주요 소식'}),
      U.note('아래는 언론 보도이며 공식 공시가 아니에요. Google 뉴스에서 언론사와 원문을 확인해 주세요.'),
      news.length ? el('div', {}, el('ul', {class: 'rows market-news'}, newsRows.slice(0, 5)),
        news.length > 5 ? el('details', {class: 'details'}, el('summary', {text: '나머지 보도 ' + (news.length - 5) + '건'}), el('ul', {class: 'rows market-news'}, newsRows.slice(5))) : null) : U.empty(partial ? '확인된 보도를 표시할 수 없어요. 일부 출처가 응답하지 않았어요.' : '이번 조회에서 표시할 보도가 없어요.'),
      el('details', {class: 'details'}, el('summary', {text: '출처별 상태와 수집 한계'}),
        ...list(data.sources).map((item) => el('p', {class: 'note'}, (item.label || '출처명 미확인') + ': ' + (SOURCE_STATES[item.status] || '확인 실패') + ', 조회 시각: ' + (U.timeText(item.observed_at) || '미확인') + '. ',
          publicLink(item.url, '출처 보기', ['apewisdom.io', 'news.google.com']))),
        ...(Array.isArray(data.limitations) ? data.limitations.filter((item) => typeof item === 'string').map((item) => U.note(item)) : [])),
      U.note('화면을 열어 둔 동안 5분마다 다시 확인해요. 관심도와 보도는 투자 판단이나 수익 예측이 아니에요.')].filter(Boolean));
  }

  const DISCOVER_REFRESH_MS = 300000;
  let discoverTimer = null, discoverView = null, discoverCheckedAt = 0;
  function refreshDiscover() {
    clearTimeout(discoverTimer); discoverTimer = null;
    if (!discoverView?.market.isConnected || discoverRoot.hidden || document.visibilityState === 'hidden') return;
    discoverCheckedAt = performance.now();
    discoverView.ownership.refresh(); marketWatchBlock(discoverView.market);
    discoverTimer = setTimeout(refreshDiscover, DISCOVER_REFRESH_MS);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' && performance.now() - discoverCheckedAt >= DISCOVER_REFRESH_MS) refreshDiscover();
  });

  function showDiscover() {
    clearTimeout(discoverTimer);
    const rankHost = el('div', {class: 'slot'}, U.loading()), universeHost = el('div', {class: 'slot'}, U.loading());
    const radarHost = el('div', {class: 'slot'}, U.loading()), marketHost = el('div', {class: 'slot'}, U.loading());
    discoverRoot.replaceChildren(
      el('h1', {class: 'page-title', text: '발견'}),
      el('div', {class: 'columns'},
        el('div', {class: 'column'}, U.section('전 상장회사 지분 감시', radarHost), U.section('시장 관심과 주요 소식', marketHost)),
        el('div', {class: 'column'}, U.section('실시간 순위', rankHost), U.section('시가총액 순', universeHost))));
    discoverView = {ownership: ownershipMonitor(radarHost), market: marketHost};
    refreshDiscover(); rankBlock(rankHost); universeBlock(universeHost);
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

    const [quoteMap, research, info, card, decade] = await Promise.all([
      U.quotes([id]), D.research(),
      kr ? U.api('api/stock-info?code=' + code, 60) : null,
      U.api('api/market-card?identity=' + encodeURIComponent(id), 120),
      kr ? null : D.decade()
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

    const radarHost = kr ? el('div', {}, U.loading('관련 공시를 확인하는 중이에요')) : null;
    const disputeBlock = kr ? U.section('회사별 지분·경영권 공시', radarHost, el('a', {class: 'button ghost', href: '#discover', text: '전 상장회사 감시 범위와 목록 보기'})) : null;
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
    // 부가 공시 수집이 늦어도 먼저 확보한 시세와 차트를 표시한다.
    if (kr) ownershipHistory(radarHost, code, name, () => token === stockToken).load(1).then(async (ok) => {
      if (ok || token !== stockToken || !radarHost.isConnected) return;
      const data = await D.governance();
      if (token !== stockToken || !radarHost.isConnected) return;
      const rss = el('div', {class: 'slot'});
      radarHost.replaceChildren(U.note('장기 이력을 확인하지 못해 제한된 RSS 자료만 표시해요. 전 상장회사·전체 기간을 조사한 결과가 아니에요.'), rss);
      renderRadar(rss, data, list(data?.companies).filter((entry) => entry.stock_code === code || entry.company === name));
    });

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
