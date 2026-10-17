'use strict';
const $ = (selector) => document.querySelector(selector);
const state = {data: null, market: 'ALL', currency: 'KRW', chart: 'bars', search: '', descending: true, sortMetric:'value',selected: null, fingerprint: null, benchmarkFingerprint: null, reference: null, demo: false, savedData: null, includeCash: false};
const hostedView = document.documentElement?.dataset?.zeroHosted === 'true';
const colors = {US: '#dce9fb', KR: '#f9e4df', RESERVE: '#d8efeb'};
const number = (value) => value === null || value === undefined || value === '' ? NaN : Number(value);
// Locale setup is expensive; reuse it across holding cells and cached status polls.
const numberFormatters = new Map(), dateFormatters = new Map();
const format = (value, decimals = 0) => {
  const numeric = number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (!numberFormatters.has(decimals)) numberFormatters.set(decimals, new Intl.NumberFormat('ko-KR', {maximumFractionDigits: decimals}));
  return numberFormatters.get(decimals).format(numeric);
};
const money = (value, currency = 'KRW') => Number.isFinite(number(value)) ? (currency === 'USD' ? '$' + format(value, 2) : format(value) + '원') : '—';
const signedPercent = (value) => (number(value) > 0 ? '+' : '') + format(value, 2) + '%';
const stamp = (value, short = false) => {
  if (!value || !Number.isFinite(Date.parse(value))) return '미확인';
  const variant = Boolean(short);
  if (!dateFormatters.has(variant)) dateFormatters.set(variant, new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', ...(variant ? {} : {year: 'numeric'}), hour12: false}));
  return dateFormatters.get(variant).format(new Date(value));
};
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}
function svgNode(tag, attributes, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (text !== undefined) element.textContent = String(text);
  return element;
}
const positionKey = (row) => row.market + ':' + row.symbol;
const positionName = (row) => row.market === 'KR' && row.name ? row.name : row.symbol;
function positionButton(row) {
  const button = node('button', 'position-button');
  button.type = 'button'; button.setAttribute('aria-label', positionName(row) + ' 종목 설명 보기');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-pressed', String(state.selected === positionKey(row)));
  const secondary = row.market === 'KR' ? row.symbol : row.name && row.name !== row.symbol ? row.name : row.currency;
  button.append(node('span', 'ticker', positionName(row)), node('span', 'market-label', (row.market === 'US' ? '미국' : '한국') + ' · ' + secondary));
  button.addEventListener('click', () => { selectPosition(row); window.ZEROResearch?.open(positionKey(row)); });
  return button;
}
function notice(text) {
  const host=$('#notice'),value=String(text||'');host.replaceChildren();host.hidden=!value;if(!value)return;
  const copy=document.createElement('p');copy.textContent=value.length>160?value.slice(0,120)+'…':value;host.append(copy);
  if(value.length<=160)return;
  const more=document.createElement('button');more.type='button';more.className='secondary-button';more.textContent='안내 전체';
  more.addEventListener('click',()=>{
    let dialog=$('#notice-detail-dialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='notice-detail-dialog';dialog.className='notice-detail-dialog';dialog.setAttribute('aria-label','안내 전체 내용');document.body.append(dialog);}
    const full=document.createElement('p'),close=document.createElement('button');full.textContent=value;close.type='button';close.title='닫기';close.setAttribute('aria-label','창 닫기');close.className='icon-button icon-close';close.textContent='닫기';close.addEventListener('click',()=>{dialog.close();more.focus?.({preventScroll:true});});dialog.replaceChildren(full,close);dialog.showModal();
  });host.append(more);
}
function render(data) {
  if (!state.demo) state.savedData = data;
  // Cached status polling must not replace a keyboard-focused position or chart.
  const fingerprint = JSON.stringify([data.context?.collected_at, data.holdings, data.history, data.summary, data.allocations]);
  const changed = fingerprint !== state.fingerprint; state.fingerprint = fingerprint;
  const context = data.context || {}, connectedSummary = data.summary || {}, status = data.system_status || {};
  const scope = connectedSummary.zero_portfolio || {};
  const finite = (value) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(number(value));
  const amount = (value) => finite(value) && number(value) >= 0;
  const referenceAvailable = scope.state === 'REFERENCE' && scope.scope === 'ZERO_100M_FROZEN_PLAN_GROSS_REFERENCE'
    && number(scope.capital_krw) === 100000000 && Array.isArray(scope.holdings)
    && [scope.total_value_krw, scope.remaining_funds_krw, scope.holdings_value_krw].every(amount)
    && [scope.gross_return_percent, scope.gross_gain_krw].every(finite)
    && Math.abs(number(scope.total_value_krw) - number(scope.remaining_funds_krw) - number(scope.holdings_value_krw)) < 0.01
    && Math.abs(number(scope.gross_gain_krw) - number(scope.total_value_krw) + number(scope.capital_krw)) < 0.01
    && Math.abs(number(scope.gross_return_percent) - number(scope.gross_gain_krw) / number(scope.capital_krw) * 100) < 0.00000001;
  // Every primary table/chart uses the same budget scope. No whole-account fallback.
  const holdings = referenceAvailable ? scope.holdings : [];
  // The risk panel may use only the reference this screen itself validated.
  state.reference = referenceAvailable ? scope : null;
  const empty = !referenceAvailable && !context.collected_at;
  ($('#zero-reference-portfolio')||$('#portfolio-view')).classList.toggle('account-empty', empty);
  $('#portfolio-empty').hidden = !empty; $('#demo-exit').hidden = !state.demo;
  $('#empty-query').disabled = false;
  if (empty) notice('');
  const summary = {...connectedSummary, holdings_value_krw: referenceAvailable ? scope.holdings_value_krw : null,
    holdings_performance: referenceAvailable ? scope.holdings_performance || {} : {}};
  state.data = {...data, summary, holdings, allocations: referenceAvailable ? scope.allocations : {}, history: []};
  window.ZEROMTSPortfolio?.render(state.reference, data);
  if(window.ZERO?.currentView?.()==='audit')window.ZEROAccountAudit?.open();
  const fx = summary.fx || {}, currencies = connectedSummary.by_currency || {};
  $('#holding-count').textContent = holdings.length + '개 종목';
  $('#holdings-value').textContent = money(summary.holdings_value_krw);
  $('#investment-capital').textContent = money(context.policy_capital_krw);
  const observed = connectedSummary.observed_assets || {}, nativeCash = observed.cash_by_currency || {};
  const needsFx = number(nativeCash.USD) > 0 || (data.holdings || []).some((row) => row.market === 'US');
  const observedAvailable = observed.state === 'AVAILABLE' && observed.scope === 'OBSERVED_KR_US_ASSETS_NOT_ZERO_LEDGER' && observed.basis === 'SETTLEMENT_ADJUSTED_CASH_PLUS_LISTED_HOLDINGS'
    && [observed.cash_krw, observed.total_value_krw, nativeCash.KRW, nativeCash.USD, connectedSummary.holdings_value_krw].every(amount)
    && number(observed.total_value_krw) >= number(observed.cash_krw) && number(observed.total_value_krw) >= number(connectedSummary.holdings_value_krw)
    && (!needsFx || amount(fx.usd_krw) && number(fx.usd_krw) > 0);
  $('#observed-assets-total').textContent = referenceAvailable ? money(scope.total_value_krw) : '미확인';
  $('#observed-cash-total').textContent = referenceAvailable ? money(scope.remaining_funds_krw) : '미확인';
  $('#connected-assets-total').textContent = observedAvailable ? money(observed.total_value_krw) : '미확인';
  $('#zero-total-return').textContent = referenceAvailable ? (number(scope.gross_return_percent) > 0 ? '+' : '') + format(scope.gross_return_percent, 2) + '%' : '미확인';
  $('#zero-total-return').className = !referenceAvailable ? 'unavailable' : number(scope.gross_return_percent) > 0 ? 'gain' : number(scope.gross_return_percent) < 0 ? 'loss' : '';
  $('#zero-total-gain').textContent = referenceAvailable ? (number(scope.gross_gain_krw) > 0 ? '+' : '') + money(scope.gross_gain_krw) : '미확인';
  $('#observed-assets-status').hidden = false;
  $('#observed-assets-status').textContent = referenceAvailable
    ? '동결 계획 ' + stamp(scope.start_at) + ' KST부터 · 확정 체결 ' + format(scope.confirmed_fill_count) + '건 반영 · 수수료·세금·배당·결제·환전 내역 미확정'
    : '1억원 계획·확정 체결·현재 보유분을 대조하지 못해 ZERO 금액 집계를 보류합니다. 연결 계좌의 별도 잔액으로 대신하지 않습니다.';
  $('#reference-funds-basis').textContent = referenceAvailable
    ? '초기 참고 잔여자금 ' + money(scope.opening_reference_funds_krw) + ' = 1억원 − 동결 계획의 시작 보유 평가액 ' + money(scope.opening_holdings_value_krw) + '. 이후 확정 매매 총액을 통화별로 반영했습니다. 현재 원화 참고 잔여자금 ' + money(scope.remaining_funds_by_currency?.KRW) + ', 달러 매매대금 ' + money(scope.remaining_funds_by_currency?.USD, 'USD') + '. 실제 결제 현금·주문 가능금액은 아닙니다.'
    : '시작 계획과 확정 체결의 근거가 없으면 잔여자금을 계산하지 않습니다.';
  $('#cash-krw').textContent = observedAvailable ? money(nativeCash.KRW) : '미확인';
  $('#cash-usd').textContent = observedAvailable ? money(nativeCash.USD, 'USD') : '미확인';
  $('#cash-krw-before-settlement').textContent = amount(currencies.KRW?.cash) ? money(currencies.KRW.cash) : '미확인';
  // Use the complete backend aggregate; never divide holdings by the policy budget.
  const performance = summary.holdings_performance || {};
  const performanceAvailable = performance.state === 'AVAILABLE'
    && [performance.cost_basis_krw, performance.market_value_krw, performance.unrealized_pnl_krw, performance.unrealized_return_percent].every((value) => Number.isFinite(number(value)))
    && number(performance.cost_basis_krw) > 0 && number(performance.market_value_krw) >= 0;
  const holdingsReturn = performanceAvailable ? number(performance.unrealized_return_percent) : NaN;
  const holdingsPnl = performanceAvailable ? number(performance.unrealized_pnl_krw) : NaN;
  $('#holdings-return').textContent = Number.isFinite(holdingsReturn) ? (holdingsReturn > 0 ? '+' : '') + format(holdingsReturn, 2) + '%' : '—';
  $('#holdings-return').className = !Number.isFinite(holdingsReturn) ? 'unavailable' : holdingsReturn > 0 ? 'gain' : holdingsReturn < 0 ? 'loss' : '';
  $('#holdings-pnl').textContent = Number.isFinite(holdingsPnl) ? (holdingsPnl > 0 ? '+' : '') + money(holdingsPnl) : '—';
  $('#holdings-pnl').className = !Number.isFinite(holdingsPnl) ? 'unavailable' : holdingsPnl > 0 ? 'gain' : holdingsPnl < 0 ? 'loss' : '';
  $('#holdings-cost').textContent = performanceAvailable ? money(performance.cost_basis_krw) : '—';
  $('#holdings-performance-status').hidden = performanceAvailable;
  $('#holdings-performance-status').textContent = context.collected_at && holdings.length === 0
    ? '현재 보유분이 없어 평가수익률을 계산하지 않습니다.'
    : '평균 단가·현재 가격·환율을 모두 확인한 뒤 보유분 전체의 손익을 표시합니다.';
  [['USD', 'us'], ['KRW', 'kr']].forEach(([currency, market]) => {
    const native = performance.by_currency?.[currency] || {};
    const available = native.state === 'AVAILABLE'
      && [native.cost_basis, native.market_value, native.unrealized_pnl, native.unrealized_return_percent].every((value) => Number.isFinite(number(value)))
      && number(native.cost_basis) > 0 && number(native.market_value) >= 0;
    const nativeReturn = available ? number(native.unrealized_return_percent) : NaN;
    const nativePnl = available ? number(native.unrealized_pnl) : NaN;
    $('#holdings-return-' + market).textContent = available ? (nativeReturn > 0 ? '+' : '') + format(nativeReturn, 2) + '%' : '—';
    $('#holdings-return-' + market).className = !available ? 'unavailable' : nativeReturn > 0 ? 'gain' : nativeReturn < 0 ? 'loss' : '';
    $('#holdings-pnl-' + market).textContent = available ? '가격 기준 평가손익 ' + (nativePnl > 0 ? '+' : '') + money(nativePnl, currency) : '매입금액·현재 가격 미확인 또는 보유분 없음';
  });
  const accountReturn = number(summary.account_return_percent);
  $('#account-return').textContent = Number.isFinite(accountReturn) ? (accountReturn > 0 ? '+' : '') + format(accountReturn, 2) + '%' : '집계 보류';
  $('#account-return').className = !Number.isFinite(accountReturn) ? 'unavailable' : accountReturn > 0 ? 'gain' : accountReturn < 0 ? 'loss' : '';
  $('#policy-capital').textContent = money(context.policy_capital_krw);
  $('#fx-value').textContent = Number.isFinite(number(fx.usd_krw)) ? '1 USD = ' + format(fx.usd_krw, 2) + '원' : '미확인';
  $('#fx-date').textContent = fx.observed_at ? '환율 기준 ' + stamp(fx.observed_at) : '환율을 확인하지 못한 종목은 원화 평가를 보류합니다.';
  $('#collected-at').textContent = state.demo && context.data_kind === 'DEMO' ? '시연 자료 · 계좌 조회 없음' : context.collected_at ? '마지막 계좌 조회 ' + stamp(context.collected_at) + ' KST' : '아직 조회하지 않았습니다';
  const connected = status.connections || {};
  const observedEmpty = Boolean(context.collected_at) && (data.holdings || []).length === 0;
  // An observed empty account is a completed query; stale/partial evidence still wins.
  const live = data.live_quotes;
  const connectionText = state.demo && context.data_kind === 'DEMO' ? '시연 자료 · 실제 계좌 아님' : live ? '공개 시세 반영 · 수량은 이전 계좌 자료' : status.refreshing ? '계좌 조회 중' : status.state === 'STALE' ? '이전 조회 자료 표시 중' : status.state === 'PARTIAL' ? '일부 자료 미확인' : observedEmpty ? '조회 완료 · 보유 종목 없음' : status.state === 'EMPTY' ? '계좌 조회 준비' : '계좌 조회 완료';
  const ready = Boolean(live) || status.state === 'READY' || (status.state === 'EMPTY' && observedEmpty);
  $('#connection-status').replaceChildren(node('i', 'status-dot ' + (ready ? 'ready' : status.state === 'EMPTY' ? '' : 'stale')), document.createTextNode(connectionText));
  const important = (data.errors || []).filter((code) => ['REFRESH_FAILED', 'ACCOUNT_SNAPSHOT_INCOMPLETE', 'FX_UNAVAILABLE', 'HOLDING_PRICE_UNAVAILABLE', 'HOLDING_COST_UNAVAILABLE', 'SAVED_SNAPSHOT_INVALID', 'SNAPSHOT_SAVE_FAILED'].includes(code));
  if (context.data_kind === 'DEMO') notice('시각 검증용 합성 자료입니다. 실제 보유 자산이 아닙니다.');
  else if (important.length) notice('일부 자료를 확인하지 못했습니다. 마지막 조회 시각과 미확인 값을 확인하고 ‘계좌 새로고침’으로 다시 조회하세요.');
  else notice('');
  if (hostedView && !empty && !state.demo) notice(live
    ? '공개 시세 반영 ' + stamp(live.checked_at) + ' KST · 시세 시각 ' + stamp(live.oldest_market_time, true) + (live.newest_market_time !== live.oldest_market_time ? '~' + stamp(live.newest_market_time, true) : '') + ' (지연될 수 있음) · 보유 수량·잔여자금은 계좌 자료 ' + stamp(context.collected_at) + ' KST 기준'
    : '온라인 저장 자료 · 계좌 자료 기준 ' + stamp(context.collected_at) + ' KST · ‘시세 새로고침’으로 공개 시세를 반영합니다.');
  if (context.collected_at) $('#connection-status').title = '한국 ' + (connected.KR ? '연결 확인' : '미확인') + ' / 미국 ' + (connected.US ? '연결 확인' : '미확인');
  $('#count-all').textContent = holdings.length;
  $('#count-us').textContent = holdings.filter((row) => row.market === 'US').length;
  $('#count-kr').textContent = holdings.filter((row) => row.market === 'KR').length;
  const split = state.data.allocations?.observed_market_percent || {};
  $('#observed-us').textContent = Number.isFinite(number(split.US)) ? format(split.US, 1) + '%' : '—';
  $('#observed-kr').textContent = Number.isFinite(number(split.KR)) ? format(split.KR, 1) + '%' : '—';
  const bar = $('#observed-strip'); bar.replaceChildren();
  if (Number.isFinite(number(split.US)) && Number.isFinite(number(split.KR))) {
    ['US', 'KR'].forEach((market) => { const part = node('span'); part.style.flex = String(Math.max(0, number(split[market]))); bar.append(part); });
  }
  if (changed) { renderAllocation(holdings, summary.holdings_value_krw); renderRows(); renderHistory([]); }
  renderAllocationComparison();
  // Hosted refresh: the saved comparison is repriced with the live S&P 500 quote when one is available.
  const repriced = window.ZEROExploreMath?.liveBenchmark;
  renderBenchmark(hostedView && state.live && repriced ? repriced(data.benchmark, state.live, 'SP500', 'index_close') : data.benchmark);
  renderComparison();
}
let portfolioRequest = 0;
function showDemo() {
  portfolioRequest++;
  state.demo = true; state.live = null;
  const holdings = [
    {market:'US',symbol:'SPY',name:'S&P 500 ETF · 시연',currency:'USD',asset_class:'US_EQUITY',quantity:100,current_price:500,average_price:500,market_value:50000,market_value_krw:64000000},
    {market:'US',symbol:'BIL',name:'단기채 ETF · 시연',currency:'USD',asset_class:'US_RESERVE',quantity:100,current_price:100,average_price:100,market_value:10000,market_value_krw:12800000},
    {market:'KR',symbol:'005930',name:'삼성전자 · 시연',currency:'KRW',asset_class:'KR_EQUITY',quantity:250,current_price:80000,average_price:80000,market_value:20000000,market_value_krw:20000000}
  ];
  holdings.forEach(row => {row.computed_unrealized_pnl_native=0;row.computed_unrealized_return_percent=0;});
  const performance={state:'AVAILABLE',cost_basis_krw:96800000,market_value_krw:96800000,unrealized_pnl_krw:0,unrealized_return_percent:0};
  render({schema_version:1,context:{data_kind:'DEMO',policy_capital_krw:100000000},holdings,summary:{fx:{usd_krw:1280},zero_portfolio:{
    state:'REFERENCE',scope:'ZERO_100M_FROZEN_PLAN_GROSS_REFERENCE',capital_krw:100000000,total_value_krw:100000000,remaining_funds_krw:3200000,
    holdings_value_krw:96800000,gross_return_percent:0,gross_gain_krw:0,opening_reference_funds_krw:3200000,opening_holdings_value_krw:96800000,
    remaining_funds_by_currency:{KRW:3200000,USD:0},holdings,holdings_performance:performance,allocations:{observed_market_percent:{US:79.3388429752,KR:20.6611570248}}
  }},system_status:{state:'READY'},errors:[]});
}
async function exitDemo() {
  state.demo=false; state.fingerprint=null; state.live=null;
  if(state.savedData)render(state.savedData);
  await loadPortfolio().catch(()=>notice('저장 자료를 불러오지 못했습니다. 다시 조회해 주세요.'));
}
function renderComparison() {
  const host = $('#comparison-zero');
  if (!host) return;
  host.replaceChildren(node('h2', '', 'ZERO 참고 원장'));
  const scope = state.reference;
  if (state.demo || !scope) {
    host.append(node('p', 'muted-note', state.demo ? '시연 자료는 실제 비교에 사용하지 않습니다. 시연을 종료하면 저장된 원장을 확인할 수 있습니다.' : '검증된 ZERO 참고 원장 근거 없음 · 수익률 비교 보류'));
    return;
  }
  const metrics = node('dl', 'benchmark-metrics');
  for (const [label, value] of [['참고 총자산', money(scope.total_value_krw)], ['원장 누적 참고 수익률', signedPercent(scope.gross_return_percent)], ['참고 평가차액', money(scope.gross_gain_krw)]]) {
    const field = node('div'); field.append(node('dt', '', label), node('dd', '', value)); metrics.append(field);
  }
  host.append(metrics,
    node('p', 'muted-note', '동결 계획 시작 ' + stamp(scope.start_at) + ' KST → 원장 관측 ' + stamp(scope.observed_at) + ' KST' + (state.live ? ' · 공개 지연 시세 반영 ' + stamp(state.live.checked_at) + ' KST' : '')),
    node('p', 'muted-note', 'ZERO는 참고 현금과 확정 체결을 반영한 동결 계획 기준입니다. 아래 전액 투자 가정의 첫 매수 기록·미국 거래일·가격 및 환율 종료일과 다를 수 있습니다. 기간을 맞춘 ZERO 성과 근거가 없어 세 수익률의 우열 비교를 보류합니다. 수수료·세금·배당·결제·환전 내역 미확정.'));
}
function renderAllocationComparison() {
  const box=$('#allocation-comparison'), scope=state.reference;
  $('#allocation-basis-label').textContent=state.includeCash?'현금 포함':'현금 제외';
  $('#allocation-with-cash').setAttribute('aria-pressed',String(state.includeCash));
  $('#allocation-without-cash').setAttribute('aria-pressed',String(!state.includeCash));
  $('#allocation-with-cash').classList.toggle('active',state.includeCash);
  $('#allocation-without-cash').classList.toggle('active',!state.includeCash);
  box.replaceChildren();
  if(!scope){box.textContent='ZERO 참고 배분을 확인하면 같은 기준으로 비교합니다.';return;}
  const amounts={US_EQUITY:0,US_RESERVE:state.includeCash?number(scope.remaining_funds_krw):0,KR_EQUITY:0};
  if(scope.holdings.some(row=>!Object.hasOwn(amounts,row.asset_class)||!Number.isFinite(number(row.market_value_krw)))){
    box.textContent='종목의 자산 분류를 확인한 뒤 목표 차이를 표시합니다.';return;
  }
  scope.holdings.forEach(row=>amounts[row.asset_class]+=number(row.market_value_krw));
  const denominator=state.includeCash?number(scope.total_value_krw):number(scope.holdings_value_krw);
  const cashTarget=number(scope.opening_reference_funds_krw)/100000000*100;
  const targetOK=state.includeCash||(Number.isFinite(cashTarget)&&cashTarget>=0&&cashTarget<=16);
  const targetBase=state.includeCash?100:100-cashTarget;
  const targets={US_EQUITY:64,US_RESERVE:16-(state.includeCash?0:cashTarget),KR_EQUITY:20};
  if(!(denominator>0)){box.textContent='비교할 평가액이 없습니다.';return;}
  [['US_EQUITY','미국 주식'],['US_RESERVE',state.includeCash?'미국 단기채·참고 현금':'미국 단기채'],['KR_EQUITY','한국 주식']].forEach(([key,label])=>{
    const current=amounts[key]/denominator*100, target=targets[key]/targetBase*100, diff=current-target;
    box.append(node('p','',label+' · 현재 '+format(current,2)+'%'+(targetOK?' · 목표 '+format(target,2)+'% · 차이 '+(diff>0?'+':'')+format(diff,2)+'%p':' · 목표 현금 분리 근거 부족')));
  });
  if(!targetOK)box.append(node('p','muted-note','현금 제외 목표는 시작 참고 현금이 준비자금 목표 16% 안에 있는 경우만 환산합니다. 원안 목표는 변경하지 않습니다.'));
}
async function runPeriodComparison() {
  const button=$('#comparison-run'), result=$('#comparison-result'), range=$('#comparison-range').value, math=window.ZEROExploreMath;
  if(!['1Y','5Y'].includes(range)||!math?.alignStockCharts)return;
  button.disabled=true;result.replaceChildren(node('p','','공개 일별 종가를 불러오는 중입니다.'));
  try{
    const charts=await Promise.all(['SPY','TQQQ'].map(async symbol=>{
      const identity='US:'+symbol,response=await fetch('api/chart?identity='+identity+'&range='+range,{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const chart=response.ok?await response.json():null;
      if(!math.stockChartValid(chart,identity,range)||chart.status==='UNAVAILABLE')throw Error('CHART_UNAVAILABLE');
      return chart;
    }));
    const comparison=math.alignStockCharts(...charts);
    if(comparison.status==='UNAVAILABLE')throw Error('COMMON_HISTORY_UNAVAILABLE');
    result.replaceChildren(node('p','',comparison.start_date+' ~ '+comparison.end_date+' · 공통 거래일 · '+(comparison.status==='STALE'?'이전 저장 종가':'확인된 종가')),
      node('p','','S&P 500(SPY) '+signedPercent(comparison.first.return_percent)+' · TQQQ '+signedPercent(comparison.second.return_percent)),
      node('p','muted-note','달러 가격 기준 참고 비교입니다. 첫 매수 수익률·실제 계좌 성과·지수 자체의 수익률과 다릅니다. TQQQ는 일일 3배 상품으로 장기 수익률이 3배가 되지 않습니다.'));
  }catch(_){result.replaceChildren(node('p','','공통 기간의 가격을 확인하지 못했습니다. 다시 계산해 주세요.'));}
  finally{button.disabled=false;}
}
function holdingSortValue(row,key){
  if(key==='quantity')return number(row.quantity);if(key==='return')return number(row.computed_unrealized_return_percent);if(key==='value')return number(row.market_value_krw);
  const field={average:'average_price',current:'current_price',pnl:'computed_unrealized_pnl_native'}[key];if(!field)return NaN;
  // Monetary sorts compare one currency; unknown FX stays missing instead of mixing dollars and won.
  const converted=window.ZEROExploreMath?.stockConvert?.(row[field],row.currency,'KRW',state.data?.summary?.fx);return converted===null||converted===undefined?row.currency==='KRW'?number(row[field]):NaN:converted;
}
const holdingSortLabels={value:'평가액',quantity:'보유 수량',average:'평균 단가 · 원화 환산',current:'현재 가격 · 원화 환산',pnl:'가격 기준 평가손익 · 원화 환산',return:'종목별 수익률'};
function holdingSortControls(){
  const toolbar=document.querySelector('#portfolio-view .table-toolbar');if(!toolbar||document.getElementById('holding-sort-metric'))return;
  const label=node('label','stock-analytics-controls','보유 종목 정렬 '),select=node('select');select.id='holding-sort-metric';select.setAttribute('aria-label','보유 종목 정렬 지표');Object.entries(holdingSortLabels).forEach(([value,text])=>{const option=node('option','',text);option.value=value;select.append(option);});select.value=state.sortMetric;select.addEventListener('change',()=>{state.sortMetric=select.value;renderRows();});const direction=node('button','stock-button');direction.id='holding-sort-direction';direction.type='button';direction.addEventListener('click',()=>sortValue(false));label.append(select,direction);toolbar.append(label);
}
function renderRows() {
  holdingSortControls();
  const rows = (state.data?.holdings || []).filter((row) => (state.market === 'ALL' || row.market === state.market) && (row.symbol + ' ' + (row.name || '')).toLowerCase().includes(state.search));
  // Cross-currency sorting always uses the verified KRW valuation, never mixed units.
  rows.sort((a, b) => {
    const av = holdingSortValue(a,state.sortMetric), bv = holdingSortValue(b,state.sortMetric),tie=positionKey(a).localeCompare(positionKey(b));
    if (!Number.isFinite(av)) return Number.isFinite(bv) ? 1 : tie;
    if (!Number.isFinite(bv)) return -1;
    return (state.descending ? bv - av : av - bv)||tie;
  });
  const direction=state.descending?'큰 순':'작은 순',sortButton=$('#sort-value-mobile');if(sortButton){sortButton.textContent=direction+(state.descending?' ↓':' ↑');sortButton.setAttribute('aria-label',holdingSortLabels[state.sortMetric]+' '+direction+', 누르면 방향 변경');}
  const sortDirection=document.getElementById('holding-sort-direction');if(sortDirection){sortDirection.textContent=direction+(state.descending?' ↓':' ↑');sortDirection.setAttribute('aria-label',holdingSortLabels[state.sortMetric]+' '+direction+' · 누르면 방향 변경');}
  const header=$('#sort-value')?.parentElement;if(header)header.setAttribute('aria-sort',state.sortMetric==='value'?(state.descending?'descending':'ascending'):'none');
  const body = $('#holdings-body'), list = $('#holding-list'); body.replaceChildren(); list.replaceChildren();
  rows.forEach((row) => {
    // Both layouts show these same values; format each once before building either.
    const quantityText = format(row.quantity, 6), averageText = money(row.average_price, row.currency), currentText = money(row.current_price, row.currency);
    const displayed = state.currency === 'KRW' ? row.market_value_krw : row.market_value;
    const displayCurrency = state.currency === 'KRW' ? 'KRW' : row.currency, valueText = money(displayed, displayCurrency);
    const tr = node('tr', state.selected === positionKey(row) ? 'selected' : '');
    tr.dataset.key = positionKey(row);
    const nameCell = node('td'); nameCell.append(positionButton(row)); tr.append(nameCell);
    tr.append(node('td', 'number', quantityText));
    [averageText, currentText].forEach((text) => { const td = node('td', 'number', text); td.append(node('span', 'currency-label', row.currency)); tr.append(td); });
    const valueCell = node('td', 'number', valueText);
    valueCell.append(node('span', 'currency-label', displayCurrency)); tr.append(valueCell);
    const pnl = number(row.computed_unrealized_pnl_native), percent = number(row.computed_unrealized_return_percent);
    const signClass = !Number.isFinite(pnl) ? 'unavailable' : pnl > 0 ? 'gain' : pnl < 0 ? 'loss' : '';
    const pnlText = Number.isFinite(pnl) ? (pnl > 0 ? '+' : '') + money(row.computed_unrealized_pnl_native, row.currency) : '—';
    const percentText = Number.isFinite(percent) ? (percent > 0 ? '+' : '') + format(percent, 2) + '%' : '—';
    const pnlCell = node('td', 'number ' + signClass, pnlText);
    pnlCell.append(node('span', 'currency-label', row.currency + ' · 가격 기준')); tr.append(pnlCell);
    tr.append(node('td', 'number position-return ' + signClass, percentText));
    body.append(tr);
    // Mobile reuses the same valuation and native price-only P&L; no new return math.
    const item = node('li', tr.className + ' mts-holding-card'); item.dataset.key = positionKey(row); item.append(positionButton(row));
    window.ZEROMTSCards?.decorate?.(item, {...row, identity: positionKey(row), as_of: state.data?.context?.collected_at});
    const summary = node('dl', 'position-summary'), value = node('div'), change = node('div');
    value.append(node('dt', '', '평가액'), node('dd', '', valueText));
    const changeValue = node('dd', 'position-return ' + signClass, percentText);
    changeValue.append(node('span', 'position-pnl ' + signClass, pnlText + ' · ' + row.currency));
    change.append(node('dt', '', '종목별 수익률'), changeValue); summary.append(value, change); item.append(summary);
    const details = node('details', 'position-details'), prices = node('dl');
    details.append(node('summary', '', '수량·평균 단가·현재 가격 보기'));
    [['보유 수량', quantityText], ['평균 단가', averageText], ['현재 가격', currentText], ['가격·손익 통화', row.currency]].forEach(([label, text]) => {
      const field = node('div'); field.append(node('dt', '', label), node('dd', '', text)); prices.append(field);
    });
    details.append(prices); item.append(details); list.append(item);
  });
  $('#table-empty').hidden = rows.length > 0;
  $('#table-empty').textContent = state.search || state.market !== 'ALL' ? '조건에 맞는 보유 종목이 없습니다. 검색어나 시장 필터를 바꿔 주세요.' : state.data?.summary?.zero_portfolio?.state !== 'REFERENCE' ? 'ZERO 운용 범위를 확인한 뒤 보유 종목을 표시합니다.' : 'ZERO 참고 원장에 보유 종목이 없습니다.';
  $('#table-count').textContent = rows.length + '개 표시 / 전체 ' + (state.data?.holdings?.length || 0) + '개 종목';
  window.ZEROMTSCards?.observe?.(list);
}
function renderBenchmark(benchmark) {
  const fingerprint = JSON.stringify(benchmark || null);
  if (fingerprint === state.benchmarkFingerprint) return;
  state.benchmarkFingerprint = fingerprint;
  const latest = benchmark?.latest_usd || {}, common = benchmark?.krw_common || {}, start = benchmark?.start || {};
  const capital = number(benchmark?.capital_krw);
  const available = benchmark?.state === 'AVAILABLE' && Number.isFinite(capital) && capital > 0 && [latest.return_percent, latest.reference_value_krw, common.return_percent, common.reference_value_krw].every((value) => Number.isFinite(number(value)));
  // The reference principal comes from the same profile as its calculated values.
  $('#benchmark-title').textContent = available ? new Intl.NumberFormat('ko-KR', {notation: 'compact', maximumFractionDigits: 2}).format(capital) + '원을 S&P 500에 투자했다면' : 'S&P 500에 투자했다면';
  $('#benchmark-content').hidden = !available; $('#benchmark-empty').hidden = available;
  $('#benchmark-empty').textContent = benchmark?.state === 'INVALID' ? '비교 자료의 기준을 확인하지 못해 계산 표시를 보류합니다.' : '비교 자료를 아직 확인하지 못했습니다.';
  const live = benchmark?.live;
  $('#benchmark-basis').textContent = available ? (live ? '첫 매수 기록 기준 · 공개 지연 시세로 새로고침 · 시세 확인 ' + stamp(live.checked_at) + ' KST · 실제 체결 시각 미확인' : '첫 매수 기록 기준 · 미국 해당 거래일 종가 가정 · 실제 체결 시각 미확인') : '첫 매수 기록과 지수·환율의 기준일을 확인한 뒤 표시합니다.';
  if (!available) return;
  const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.replaceAll('-', '.') : '미확인';

  // These are provider-validated reference calculations, not account or ETF returns.
  $('#benchmark-price-return').textContent = signedPercent(latest.return_percent);
  $('#benchmark-price-return').className = number(latest.return_percent) > 0 ? 'gain' : number(latest.return_percent) < 0 ? 'loss' : '';
  $('#benchmark-price-period').textContent = date(start.market_date) + ' → ' + date(latest.market_date) + (live ? ' 미국 시세(지연 가능)' : ' 미국 종가');
  $('#benchmark-fixed-value').textContent = money(latest.reference_value_krw);
  $('#benchmark-fixed-gain').textContent = '참고 평가이익 ' + (number(latest.gain_krw) > 0 ? '+' : '') + money(latest.gain_krw) + '\n' + date(latest.market_date) + ' 기준 · 환율 고정';
  $('#benchmark-krw-value').textContent = money(common.reference_value_krw);
  $('#benchmark-krw-return').textContent = '원화 가격수익률 ' + signedPercent(common.return_percent);
  $('#benchmark-fx-period').textContent = live ? '공개 지연 환율 ' + format(common.end_usd_krw, 2) + '원 반영 · 공식 환율 아님\n시세 시각 ' + stamp(live.market_time) + ' KST' : '공식 공통 관측일 ' + date(common.market_date) + '\n최신 미국 지수일과 다를 수 있습니다.';
  $('#benchmark-assumptions').textContent = '첫 매수 기록 ' + stamp(start.recorded_at) + ' KST에 대응하는 미국 ' + date(start.market_date) + ' 종가를 시작값으로 사용합니다. 정확한 첫 체결가격·시각은 미확인입니다. ' + (live ? '새로고침 때 공개 지연 지수 시세와 지연 환율로 다시 계산했으며 공식 환율이 아닙니다.' : '지수 가격과 공식 환율이 모두 있는 공통 날짜까지만 원화 참고값을 계산합니다.') + ' 지수 시작값 ' + format(latest.start_index_close, 2) + ', ' + (live ? '현재 시세 ' : '최신 종가 ') + format(latest.index_close, 2) + '. ' + (live ? '시세 지수 ' : '공통 관측일 지수 ') + format(common.index_close, 2) + ', 원·달러 환율 ' + format(common.start_usd_krw, 2) + '원 → ' + format(common.end_usd_krw, 2) + '원.';
  const sources = $('#benchmark-sources'); sources.replaceChildren();
  [['index', 'S&P 500 지수 출처'], ['fx', '공식 원·달러 환율 출처']].forEach(([key, label]) => {
    try {
      const url = new URL(benchmark.sources?.[key]);
      if (url.protocol !== 'https:' || !['fred.stlouisfed.org', 'www.federalreserve.gov'].includes(url.hostname)) return;
      const link = node('a', '', label); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link);
    } catch (_) { /* An unavailable source URL stays absent rather than becoming a link. */ }
  });
}
function selectPosition(row) {
  const focusedList = $('#holding-list').contains(document.activeElement), focusedTable = $('#holdings-body').contains(document.activeElement);
  state.selected = positionKey(row); state.market = 'ALL'; state.search = ''; $('#search').value = '';
  setActive('[data-market]', 'market', state.market); renderRows();
  $('#holding-map').querySelectorAll('g').forEach((group) => group.classList.toggle('selected', group.dataset.key === state.selected));
  $('#holding-bars').querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.parentElement.dataset.key === state.selected)));
  const container = window.matchMedia('(max-width: 740px)').matches ? $('#holding-list') : $('#holdings-body');
  const selected = Array.from(container.children).find((item) => item.dataset.key === state.selected);
  if (focusedList || focusedTable) selected?.querySelector('button').focus({preventScroll: true});
  if (selected && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) selected.scrollIntoView({behavior: 'smooth', block: 'nearest'});
}
function renderAllocation(holdings, totalValue) {
  const cash=number(state.reference?.remaining_funds_krw);
  if(state.includeCash&&state.reference&&Number.isFinite(cash)&&cash>=0){
    totalValue=number(totalValue)+cash;
    if(cash>0)holdings=[...holdings,{market:'KR',symbol:'CASH_REFERENCE',name:'참고 잔여자금',asset_class:'US_RESERVE',market_value_krw:cash}];
  }
  const basis=state.includeCash?'현금 포함 · 참고 잔여자금':'현금 제외';
  const subtitle=$('#map-title')?.parentElement?.querySelector('p');if(subtitle)subtitle.textContent='원화 환산 평가액 기준 · '+basis;
  const list = $('#holding-bars'), chart = $('#holding-map'); list.replaceChildren();
  const valid = Number.isFinite(number(totalValue)) && number(totalValue) > 0 && holdings.some((row) => number(row.market_value_krw) > 0) && holdings.every((row) => Number.isFinite(number(row.market_value_krw)) && number(row.market_value_krw) >= 0);
  // Missing FX or any unverified value must not silently shrink the denominator.
  list.hidden = !valid || state.chart !== 'bars'; chart.toggleAttribute('hidden', true); $('#map-empty').hidden = valid;
  $('#map-empty strong').textContent = holdings.length ? '모든 종목의 평가액과 환율을 확인한 뒤 비중을 표시합니다' : '계좌를 조회하면 보유 비중이 표시됩니다';
  if (!valid) return;
  if (state.chart === 'map') { renderMap(holdings, totalValue); return; }
  [...holdings].sort((a, b) => number(b.market_value_krw) - number(a.market_value_krw)).forEach((row) => {
    const percent = number(row.market_value_krw) / number(totalValue) * 100;
    const item = node('li'); item.dataset.key = positionKey(row);
    const button = node('button', 'allocation-button'), label = node('span', 'bar-label'), values = node('span', 'bar-values', money(row.market_value_krw));
    button.type = 'button'; button.setAttribute('aria-pressed', String(state.selected === positionKey(row)));
    values.append(node('span', 'bar-percent', format(percent, 1) + '%'));
    label.append(node('span', 'bar-name', positionName(row)), values);
    const track = node('span', 'bar-track'), fill = node('span', 'bar-fill ' + (row.asset_class === 'US_RESERVE' ? 'reserve' : row.market.toLowerCase()));
    track.setAttribute('aria-hidden', 'true'); fill.style.width = Math.min(100, Math.max(0, percent)) + '%'; track.append(fill);
    button.append(label, track); if(row.symbol==='CASH_REFERENCE'){button.disabled=true;button.setAttribute('aria-label','참고 잔여자금 · 실제 결제 현금 미확정');}else button.addEventListener('click', () => { selectPosition(row); window.ZEROResearch?.open(positionKey(row)); }); item.append(button); list.append(item);
  });
}
function partition(items, x, y, width, height) {
  if (items.length === 1) return [{...items[0], x, y, width, height}];
  const total = items.reduce((sum, row) => sum + row.weight, 0);
  let at = 1, subtotal = items[0].weight, distance = Math.abs(subtotal - total / 2);
  for (let i = 1, running = subtotal; i < items.length - 1; i++) {
    running += items[i].weight;
    if (Math.abs(running - total / 2) < distance) { at = i + 1; subtotal = running; distance = Math.abs(running - total / 2); }
  }
  const fraction = subtotal / total;
  return width >= height ? [...partition(items.slice(0, at), x, y, width * fraction, height), ...partition(items.slice(at), x + width * fraction, y, width * (1 - fraction), height)] : [...partition(items.slice(0, at), x, y, width, height * fraction), ...partition(items.slice(at), x, y + height * fraction, width, height * (1 - fraction))];
}
function renderMap(holdings, totalValue) {
  const chart = $('#holding-map'); chart.replaceChildren();
  const valid = Number.isFinite(number(totalValue)) && number(totalValue) > 0 && holdings.some((row) => number(row.market_value_krw) > 0) && holdings.every((row) => Number.isFinite(number(row.market_value_krw)) && number(row.market_value_krw) >= 0);
  // SVGElement has no HTMLElement.hidden setter; change the global attribute.
  chart.toggleAttribute('hidden', !valid); $('#map-empty').hidden = valid;
  if (!valid) {
    if (holdings.length) $('#map-empty strong').textContent = '평가액을 확인한 뒤 자산 지도를 표시합니다';
    return;
  }
  const items = holdings.filter((row) => number(row.market_value_krw) > 0).map((row) => ({row, weight: number(row.market_value_krw)})).sort((a, b) => b.weight - a.weight);
  const width = Math.max(300, Math.round(chart.clientWidth));
  chart.setAttribute('viewBox', '0 0 ' + width + ' 246');
  partition(items, 0, 0, width, 246).forEach((tile) => {
    const {row, x, y, width, height} = tile;
    const group = svgNode('g', {tabindex: 0, role: 'button', 'aria-label': positionName(row) + ', 평가액 ' + money(row.market_value_krw) + ', 종목 선택'});
    group.dataset.key = positionKey(row); group.classList.toggle('selected', state.selected === positionKey(row));
    group.append(svgNode('rect', {x, y, width, height, rx: 6, fill: row.asset_class === 'US_RESERVE' ? colors.RESERVE : colors[row.market]}));
    group.append(svgNode('title', {}, positionName(row) + ' · ' + money(row.market_value_krw) + ' · ' + format(tile.weight / number(totalValue) * 100, 1) + '%'));
    if (width > 125 && height > 65) {
      const name = positionName(row), maxChars = Math.max(3, Math.floor((width - 36) / 20));
      group.append(svgNode('text', {x: x + 18, y: y + 32, class: 'symbol'}, name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name));
      group.append(svgNode('text', {x: x + 18, y: y + 55, class: 'map-value'}, money(row.market_value_krw)));
      if (height > 105) group.append(svgNode('text', {x: x + 18, y: y + height - 18, class: 'map-weight'}, format(tile.weight / number(totalValue) * 100, 1) + '%'));
    } else if (width > 90 && height > 38) group.append(svgNode('text', {x: x + 10, y: y + 25, class: 'map-value'}, positionName(row)));
    group.addEventListener('click', () => { if(row.symbol!=='CASH_REFERENCE'){selectPosition(row); window.ZEROResearch?.open(positionKey(row));} });
    group.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if(row.symbol!=='CASH_REFERENCE')selectPosition(row); } });
    chart.append(group);
  });
}
function renderHistory(history) {
  const rows = history.filter((row) => Number.isFinite(number(row.holdings_value_krw)) && Number.isFinite(Date.parse(row.observed_at))).slice(-240);
  $('#history-count').textContent = rows.length + '회 관측';
  const chart = $('#history-chart'); chart.replaceChildren(); chart.toggleAttribute('hidden', rows.length === 0); $('#history-empty').hidden = rows.length > 0;
  if (!rows.length) return;
  const values = rows.map((row) => number(row.holdings_value_krw)), low = Math.min(...values), high = Math.max(...values), span = Math.max(high - low, Math.max(high * .005, 1));
  const start = Date.parse(rows[0].observed_at), end = Date.parse(rows.at(-1).observed_at);
  const width = Math.max(300, Math.round(chart.clientWidth)); chart.setAttribute('viewBox', '0 0 ' + width + ' 190');
  const coords = rows.map((row) => ({x: rows.length === 1 ? width / 2 : 45 + (Date.parse(row.observed_at) - start) / Math.max(1, end - start) * (width - 90), y: 135 - (number(row.holdings_value_krw) - low) / span * 95, row}));
  [50, 135].forEach((y) => chart.append(svgNode('line', {x1: 45, x2: width - 45, y1: y, y2: y, stroke: '#e5ebf4', 'stroke-width': 1})));
  if (coords.length > 1) chart.append(svgNode('polyline', {points: coords.map((point) => point.x + ',' + point.y).join(' '), fill: 'none', stroke: '#2866c7', 'stroke-width': 2.5}));
  coords.forEach((point) => { const dot = svgNode('circle', {cx: point.x, cy: point.y, r: coords.length === 1 ? 5 : 2.5, fill: '#2866c7'}); dot.append(svgNode('title', {}, stamp(point.row.observed_at) + ' · ' + money(point.row.holdings_value_krw))); chart.append(dot); });
  const last = coords.at(-1);
  chart.append(svgNode('text', {x: Math.min(width - 45, last.x), y: Math.max(22, last.y - 14), class: 'history-label', 'text-anchor': coords.length === 1 ? 'middle' : 'end'}, money(last.row.holdings_value_krw)));
  chart.append(svgNode('text', {x: 45, y: 176, class: 'history-label'}, stamp(rows[0].observed_at, true)));
  if (rows.length > 1) chart.append(svgNode('text', {x: width - 45, y: 176, class: 'history-label', 'text-anchor': 'end'}, stamp(rows.at(-1).observed_at, true)));
  else chart.append(svgNode('text', {x: width / 2, y: 66, class: 'history-label', 'text-anchor': 'middle'}, '첫 관측 · 이 시점부터 기록을 쌓습니다'));
}
function setActive(selector, key, value) {
  document.querySelectorAll(selector).forEach((button) => { const active = button.dataset[key] === value; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}
// Reprice the saved reference quantities with public quotes, mirroring the backend
// aggregation. Any missing quote or FX keeps the whole saved view; no partial mix.
function livePortfolio(data, live) {
  const scope = data.summary?.zero_portfolio, quotes = new Map((live?.quotes || []).map((q) => [q.market + ':' + q.symbol, q]));
  const fx = number(live?.fx?.usd_krw), funds = scope?.remaining_funds_by_currency || {}, capital = number(scope?.capital_krw);
  if (scope?.state !== 'REFERENCE' || !Array.isArray(scope.holdings) || !scope.holdings.length || !(capital > 0)
      || ![funds.KRW, funds.USD].every((value) => Number.isFinite(number(value)))
      || (number(funds.USD) || scope.holdings.some((row) => row.market === 'US')) && !(fx > 0)) return data;
  const sums = {KRW: 0, USD: 0}, costs = {KRW: 0, USD: 0}, counts = {KRW: 0, USD: 0};
  const holdings = [];
  for (const row of scope.holdings) {
    const quote = quotes.get(positionKey(row)), price = number(quote?.price), qty = number(row.quantity), average = number(row.average_price);
    if (!quote || quote.currency !== row.currency || !(price > 0) || !(qty > 0) || !(row.currency in sums)) return data;
    const value = qty * price, costed = average > 0, currency = row.currency;
    counts[currency]++; sums[currency] += value; costs[currency] = costed && costs[currency] !== null ? costs[currency] + qty * average : null;
    holdings.push({...row, current_price: price, market_value: value, market_value_krw: currency === 'USD' ? value * fx : value,
      computed_unrealized_pnl_native: costed ? (price - average) * qty : null, computed_unrealized_return_percent: costed ? (price / average - 1) * 100 : null});
  }
  const held = sums.KRW + (counts.USD ? sums.USD * fx : 0), remaining = number(funds.KRW) + (number(funds.USD) ? number(funds.USD) * fx : 0), total = held + remaining;
  const native = (currency) => counts[currency] && costs[currency] !== null
    ? {state: 'AVAILABLE', cost_basis: costs[currency], market_value: sums[currency], unrealized_pnl: sums[currency] - costs[currency], unrealized_return_percent: (sums[currency] / costs[currency] - 1) * 100}
    : {state: 'UNAVAILABLE', cost_basis: null, market_value: null, unrealized_pnl: null, unrealized_return_percent: null};
  const costed = costs.KRW !== null && costs.USD !== null, cost = costed ? costs.KRW + (counts.USD ? costs.USD * fx : 0) : null;
  const times = live.quotes.map((q) => q.market_time).filter((value) => Number.isFinite(Date.parse(value))).sort();
  return {...data, live_quotes: {checked_at: live.checked_at, oldest_market_time: times[0] || null, newest_market_time: times.at(-1) || null},
    summary: {...data.summary, fx: fx > 0 ? {usd_krw: fx, observed_at: live.fx.market_time, retrieved_at: live.checked_at, source: 'PUBLIC_DELAYED_USD_KRW'} : data.summary.fx,
      zero_portfolio: {...scope, holdings, holdings_value_krw: held, remaining_funds_krw: remaining, total_value_krw: total,
        gross_gain_krw: total - capital, gross_return_percent: (total / capital - 1) * 100,
        holdings_performance: {...(scope.holdings_performance || {}), state: costed ? 'AVAILABLE' : 'UNAVAILABLE', cost_basis_krw: cost, market_value_krw: costed ? held : null,
          unrealized_pnl_krw: costed ? held - cost : null, unrealized_return_percent: costed ? (held / cost - 1) * 100 : null, by_currency: {KRW: native('KRW'), USD: native('USD')}},
        allocations: {...(scope.allocations || {}), observed_market_percent: held > 0 ? {US: counts.USD ? sums.USD * fx / held * 100 : 0, KR: sums.KRW / held * 100} : {US: null, KR: null}}}}};
}
let liveCheckedAt = 0, displayPolling = false, livePending = null;
function loadLiveQuotes() {
  if (livePending) return livePending;
  livePending = (async () => {
    liveCheckedAt = Date.now();
    try {
      const response = await fetch('api/live-quotes', {cache: 'no-store', signal: AbortSignal.timeout(15000)});
      const live = response.ok ? await response.json() : null;
      state.live = live?.schema_version === 1 && live.state === 'AVAILABLE' && Array.isArray(live.quotes) ? live : null;
    } catch (_) { state.live = null; }
    window.ZEROLive = state.live;
    if (typeof CustomEvent === 'function') document.dispatchEvent?.(new CustomEvent('zero-live-quotes'));
    return Boolean(state.live);
  })().finally(() => { livePending = null; });
  return livePending;
}
async function loadPortfolio() {
  if (state.demo) return;
  const request = ++portfolioRequest;
  const response = await fetch('api/portfolio', {cache: 'no-store', signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('CACHE_UNAVAILABLE');
  const data = await response.json();
  if (state.demo || request !== portfolioRequest) return;
  if (data.schema_version !== 1 || !Array.isArray(data.holdings)) throw new Error('CACHE_INVALID');
  render(hostedView && state.live ? livePortfolio(data, state.live) : data);
}
async function refresh() {
  if(window.ZERO?.currentView?.()==='portfolio')return window.ZEROCompany?.openPortfolio?.();
  if(state.demo){notice('시연을 종료한 뒤 계좌 또는 시세를 조회해 주세요.');return;}
  const button = $('#refresh'); button.disabled = true; button.querySelector('span').textContent = hostedView ? '시세 확인 중' : '계좌 조회 중';
  try {
    // The hosted screen reprices saved quantities with public quotes; only the local app can query KIS.
    const response = hostedView ? {ok: true, status: 200} : await fetch('api/refresh', {method: 'POST', cache: 'no-store'});
    const live = hostedView ? await loadLiveQuotes().catch(() => { state.live = null; return false; }) : true;
    await loadPortfolio();
    if (!live) notice('공개 시세를 모두 확인하지 못해 저장된 자료를 표시합니다. 잠시 뒤 다시 새로고침해 주세요.');
    else if (response.status === 429) notice('연속 조회를 줄이기 위해 잠시 기다린 후 다시 새로고침해 주세요.');
    else if (!response.ok) notice('계좌 조회를 완료하지 못했습니다. 확인된 이전 자료를 유지했습니다. 잠시 뒤 다시 조회해 주세요.');
  } catch (_) { notice('조회 서버에 연결하지 못했습니다. ZERO 포트폴리오 실행 상태를 확인해 주세요.'); }
  finally { button.disabled = false; button.querySelector('span').textContent = hostedView ? '시세 새로고침' : '계좌 새로고침'; }
}
// Pinned public forks behind the virtual team's research: references, never installed code.
let referencesLoaded = false;
const githubLink = (text, url, className, owner) => {
  const link = node('a', className, text);
  if (typeof url === 'string' && url.startsWith('https://github.com/' + (owner || ''))) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  return link;
};
async function loadReferences() {
  if (referencesLoaded) return; referencesLoaded = true;
  const list = $('#research-references'), status = $('#references-status');
  try {
    const response = await fetch('assets/research-references.json', {cache: 'no-store'});
    const rows = response.ok ? (await response.json())?.connections : null;
    if (!Array.isArray(rows) || !rows.length) throw new Error('REFERENCES_EMPTY');
    const names = {};
    try {
      const team = await (await fetch('api/team', {cache: 'no-store'})).json();
      for (const role of Object.values(team?.roles || {})) for (const staff of role?.support_staff || []) if (staff?.id && staff?.name) names[staff.id] = staff.name;
    } catch (_) { /* Staff IDs remain readable without the roster. */ }
    list.replaceChildren(...rows.map((row) => {
      const item = node('article', 'reference-item'), head = node('div', 'reference-head');
      head.append(githubLink(row.upstream, row.upstream_url, 'reference-name'), node('span', 'reference-meta', '★ ' + format(row.stars) + ' · ' + (row.license && row.license !== 'UNSPECIFIED' ? row.license : '라이선스 미표기')));
      item.append(head, node('p', 'reference-purpose', row.purpose || '용도 미기재'));
      const staff = (Array.isArray(row.responsible_staff) ? row.responsible_staff : []).map((id) => names[id] || id).join(', ');
      if (staff) item.append(node('p', 'reference-staff', '담당 · ' + staff));
      if (Array.isArray(row.limits) && row.limits[0]) item.append(node('p', 'reference-limit', '주의 · ' + row.limits[0]));
      item.append(githubLink('우리 포크 보기', row.fork_url, 'reference-fork', 'twozero3213-beep/'));
      return item;
    }));
    status.textContent = rows.length + '개 공개 저장소를 고정 커밋으로 연결했습니다. 설치·실행한 코드나 검증된 전략이 아니라 가상 팀이 참고하는 자료입니다.';
  } catch (_) { referencesLoaded = false; status.textContent = '연구 참고 저장소 목록을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.'; }
}
// The owner's loss-limit decision needs evidence first; this computes reference figures only.
async function runRisk() {
  const math = window.ZEROExploreMath, button = $('#risk-run'), basis = $('#risk-basis'), table = $('#risk-table');
  const scope = state.reference, total = number(scope?.total_value_krw);
  if (!math?.portfolioRisk || !scope?.holdings?.length || !(total > 0)) { table.replaceChildren(); basis.textContent = 'ZERO 참고 배분을 확인한 뒤 계산할 수 있습니다.'; return; }
  // Stale figures never stay beside a new status line.
  button.disabled = true; table.replaceChildren(); basis.textContent = '5년 일별 종가를 불러오는 중입니다.';
  try {
    // One retry per series absorbs a provider hiccup; a series is fetched once even if it is both a holding and the benchmark.
    const loaded = new Map();
    const load = async (market, symbol) => {
      const identity = market + ':' + symbol;
      if (loaded.has(identity)) return loaded.get(identity);
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch('api/chart?identity=' + identity + '&range=5Y', {cache: 'no-store'}).catch(() => null);
        const chart = response?.ok ? await response.json().catch(() => null) : null;
        if (math.stockChartValid(chart, identity, '5Y') && chart.status !== 'UNAVAILABLE') { loaded.set(identity, chart.bars); return chart.bars; }
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      throw new Error('CHART_UNAVAILABLE');
    };
    const series = [];
    for (const row of scope.holdings) series.push({market: row.market, weight: number(row.market_value_krw) / total, bars: await load(row.market, row.symbol)});
    const zero = math.portfolioRisk(series, number(scope.remaining_funds_krw) / total, math.stockSessionDate);
    const spy = math.portfolioRisk([{market: 'US', weight: 1, bars: await load('US', 'SPY')}], 0, math.stockSessionDate);
    if (zero.status !== 'AVAILABLE') throw new Error('RISK_UNAVAILABLE');
    // One fixed decimal keeps the columns aligned; format() would print 20 for 20.0.
    const pct = (value, sign = '') => Number.isFinite(value) ? sign + Math.abs(value).toFixed(1) + '%' : '—';
    const rows = [['연평균 수익률', 'cagr_percent', ''], ['변동성(연 환산)', 'volatility_percent', ''], ['최대 낙폭', 'max_drawdown_percent', '−'],
      ['1년 안 낙폭 · 보통 해(중간값)', 'one_year_drawdown_p50_percent', '−'], ['1년 안 낙폭 · 나쁜 해(95%)', 'one_year_drawdown_p95_percent', '−'],
      ['1년 안 낙폭 · 매우 나쁜 해(99%)', 'one_year_drawdown_p99_percent', '−'], ['최악의 1년 수익률', 'worst_one_year_return_percent', null], ['하루 손실 꼬리 평균(CVaR 95%)', 'cvar95_daily_percent', '−']];
    const grid = node('table'), caption = node('caption', '', 'ZERO = ZERO 참고 배분 · SPY = S&P 500 · 같은 기간 ' + zero.start_date + ' ~ ' + zero.end_date), head = node('tr');
    head.append(node('th', '', '지표'), node('th', '', 'ZERO'), node('th', '', 'SPY'));
    grid.append(caption, head);
    for (const [label, key, sign] of rows) {
      const line = node('tr'), show = (data) => sign === null ? (data[key] > 0 ? '+' : '−') + Math.abs(data[key]).toFixed(1) + '%' : pct(data[key], sign);
      line.append(node('td', '', label), node('td', '', show(zero)), node('td', '', spy.status === 'AVAILABLE' ? show(spy) : '—'));
      grid.append(line);
    }
    table.replaceChildren(grid, node('p', 'risk-exceed', '1년 안에 이만큼 떨어진 구간의 비율(ZERO 참고 배분): ' + Object.entries(zero.exceed_share_percent).map(([limit, share]) => limit + '% 이상 ' + format(share, 0) + '%').join(' · ')));
    basis.textContent = '거래일 ' + format(zero.sessions) + '일, 1년 구간 ' + format(zero.windows) + '개로 계산했습니다. 현재 비중을 처음부터 그대로 들고 있었다고 가정한 가격 기준 참고 자료이며, 검증된 백테스트나 제안값이 아닙니다. 어떤 값도 적용되지 않습니다.';
  } catch (_) { basis.textContent = '5년 가격을 모두 확인하지 못해 계산을 보류했습니다. 잠시 뒤 다시 눌러 주세요.'; }
  finally { button.disabled = false; }
}
let teamLoaded = false;
let teamRequest = 0;
const teamProductOverview = Array.from($('#team-product-list').children);
const teamEventLabels = {ONBOARDING: '최초 구성', INPUT_CHANGED: '입력 자료 변경', FILL_CONFIRMED: '체결 확인', QUARTERLY_REVIEW: '분기 검토', MODEL_CHANGED: '모델 변경', INCIDENT: '오류·사고 점검', UI_CHANGED: '화면 변경'};
const teamPriority = (value) => value === 'P0' ? 'P0 · 최우선' : value === 'P1' ? 'P1 · 후속' : '미확인';
function teamFields(parent, fields) {
  const list = node('dl', 'team-fields');
  fields.forEach(([label, value]) => {
    const values = Array.isArray(value) ? value.filter((item) => typeof item === 'string') : typeof value === 'string' ? [value] : [];
    const field = node('div'), text = node('dd');
    field.append(node('dt', '', label));
    if (values.length) { const items = node('ul'); values.forEach((item) => items.append(node('li', '', label === '배정 계기' ? teamEventLabels[item] || item : item))); text.append(items); }
    else text.textContent = label === '선행 담당' && Array.isArray(value) && value.length === 0 ? '없음' : '미확인';
    field.append(text); list.append(field);
  });
  parent.append(list);
}
function renderTeamEvidence(report, tasks, staffNames, ownerNames, event) {
  const status = $('#team-evidence-status'), content = $('#team-evidence-content');
  content.replaceChildren();
  status.textContent = '근거 없음 · 보고서 자료 미확인 · 수행 미확인 · 주문 승인 없음';
  const text = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 1000;
  const strings = (value, minimum = 0, maximum = 24) => Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every(text);
  const same = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
  const delivery = report?.delivery_standard, inputs = report?.user_values;
  // A report describes missing receipts; malformed or optimistic authority claims never become evidence.
  const valid = report && report.schema_version === 1 && report.scope === 'TEAM_EVIDENCE_GAP_REPORT' && report.authority === 'REPORT_ONLY'
    && report.event === event && report.orders_authorized === false && report.completion_verified === false && report.execution_evidence_status === 'NOT_PROVIDED'
    && Number.isInteger(report.task_count) && report.task_count === tasks.length && report.task_count <= 64
    && Array.isArray(report.tasks) && report.tasks.length === report.task_count && new Set(tasks.map((row) => row.id)).size === tasks.length
    && delivery && strings(delivery.required_evidence, 5, 5) && delivery.execution_evidence_status === 'NOT_PROVIDED'
    && delivery.completion_verified === false && delivery.independent_validation_completed === false && delivery.orders_authorized === false
    && inputs && !Array.isArray(inputs) && Object.keys(inputs).length === 2 && Object.hasOwn(inputs, 'maximum_loss_percent') && inputs.maximum_loss_percent === null
    && Object.hasOwn(inputs, 'error_free_rebalances') && inputs.error_free_rebalances === null
    && report.tasks.every((row, index) => {
      const task = tasks[index];
      return row && staffNames.has(row.id) && row.id === task.id && row.accountable_staff === row.id && row.accountable_staff === task.accountable_staff
        && text(row.name) && row.name === task.name && ownerNames.has(row.owner) && row.owner === task.owner
        && ['P0', 'P1'].includes(row.priority) && row.priority === task.priority && staffNames.has(row.reviewer) && row.reviewer !== row.id && row.reviewer === task.reviewer
        && row.execution_status === 'NOT_EXECUTED' && task.execution_status === 'NOT_EXECUTED' && task.assignment_status === 'ASSIGNED'
        && strings(row.inputs, 1, 4) && strings(row.depends_on) && row.depends_on.every((id) => staffNames.has(id)) && strings(row.outputs, 1) && strings(row.acceptance, 1)
        && ['inputs', 'depends_on', 'outputs', 'acceptance'].every((key) => same(row[key], task[key])) && same(row.missing_evidence, delivery.required_evidence);
    })
    && strings(report.next_work, 0, 3) && new Set(report.next_work).size === report.next_work.length
    && report.next_work.every((id) => report.tasks.some((row) => row.id === id && row.depends_on.length === 0));
  if (!valid) return;
  status.textContent = '근거 없음 · ' + report.task_count + '개 배정 업무 미수행 · 독립 검토 미완료 · 주문 승인 없음';
  const next = node('ol', 'team-orders'); next.id = 'team-next-work';
  content.append(node('h3', '', '다음 업무 · 최대 3개'), next);
  report.next_work.forEach((id) => {
    const row = report.tasks.find((task) => task.id === id), item = node('li'); item.dataset.taskId = row.id;
    item.append(node('h4', '', row.name), node('p', 'muted-note', teamPriority(row.priority) + ' · 책임 담당 ' + staffNames.get(row.accountable_staff) + ' · 검토자 ' + staffNames.get(row.reviewer) + ' · 미수행 · 근거 없음'));
    teamFields(item, [['필수 입력', row.inputs]]); next.append(item);
  });
  if (!report.next_work.length) next.append(node('li', 'muted-note', '다음 업무 자료 없음 · 수행 근거 없음'));
  const details = node('details', 'team-disclosure'), gaps = node('ol', 'team-orders'); gaps.id = 'team-evidence-tasks';
  details.append(node('summary', '', '전체 업무의 책임·우선순위·부족한 납품 근거'), gaps);
  report.tasks.forEach((row) => {
    const item = node('li'); item.dataset.taskId = row.id;
    item.append(node('h4', '', row.name), node('p', 'muted-note', teamPriority(row.priority) + ' · 미수행 · 근거 없음'));
    teamFields(item, [['책임 담당', staffNames.get(row.accountable_staff)], ['보고 대상', ownerNames.get(row.owner)], ['검토자', staffNames.get(row.reviewer)], ['부족한 납품 근거', row.missing_evidence]]); gaps.append(item);
  });
  content.append(details);
}
function renderCompanyPolicy(policy, staffNames) {
  const status = $('#team-company-status'), evidence = $('#team-company-evidence');
  const criteria = $('#team-company-criteria'), content = $('#team-company-disclosures');
  criteria.replaceChildren(); content.replaceChildren();
  // Additive policy failures must never break the incumbent assignment view.
  const strings = (value, count) => Array.isArray(value) && (!count || value.length === count) && value.every((item) => typeof item === 'string' && item.trim());
  const rows = (value, count) => Array.isArray(value) && value.length === count && value.every((item) => item && typeof item === 'object' && typeof item.name === 'string');
  const criteriaKeys = ['minimum_sample_count', 'maximum_drawdown', 'minimum_paper_days', 'retirement_rules'];
  const deferredCriteria = policy?.criteria && !Array.isArray(policy.criteria) && Object.keys(policy.criteria).length === criteriaKeys.length && criteriaKeys.every((key) => Object.hasOwn(policy.criteria, key) && policy.criteria[key] === null);
  const valid = policy && policy.schema_version === 1 && policy.fictional_company === true && policy.manager === 'ZERO_FINAL_MANAGER' && policy.scope === 'NEW_STRATEGY_GOVERNANCE_ONLY' && policy.mode === 'KIS_MOCK'
    && policy.criteria_status === 'DEFERRED_BY_USER' && deferredCriteria && strings(policy.principles, 5) && rows(policy.teams, 8) && rows(policy.stages, 10) && strings(policy.response_order, 6) && strings(policy.constraints)
    && Array.isArray(policy.glossary) && policy.glossary.length && policy.glossary.every((row) => row && ['term', 'name', 'pronunciation', 'meaning'].every((key) => typeof row[key] === 'string' && row[key].trim()))
    && policy.gate && ['HOLD', 'REJECT'].includes(policy.gate.decision) && policy.gate.orders_authorized === false && policy.gate.independent_validation_completed === false && policy.gate.live_trading_available === false && policy.gate.user_final_authority === true;
  status.textContent = valid && policy.gate.decision === 'REJECT' ? '새 전략 승인 거부 · 기준 미정' : valid ? '새 전략 승인 보류 · 기준 미정' : '새 전략 승인 보류 · 정책 미확인';
  evidence.textContent = valid ? '근거 없음 · 독립 검증 미완료 · 주문 승인 없음 · 계좌 전용' : '근거 없음 · 정책 자료 미확인 · 주문 승인 없음';
  teamFields(criteria, [['백테스트 최소 표본', '미정'], ['허용 낙폭 제안', '미정'], [' 운영 통과 기준', '미정'], ['중단·폐기 기준 승인', '미정']]);
  const disclosure = (label, id, tag = 'div') => {
    const details = node('details', 'team-disclosure'), body = node(tag); body.id = id;
    details.append(node('summary', '', label), body); content.append(details); return body;
  };
  if (!valid) {
    // Clear stale valid content even when the next snapshot is unavailable.
    ['principles', 'teams', 'stages', 'response', 'glossary'].forEach((key) => { const empty = node('div'); empty.id = 'team-company-' + key; empty.hidden = true; content.append(empty); });
    return;
  }
  const text = (value) => {
    if (typeof value !== 'string') return value;
    let result = value;
    [...policy.glossary].sort((a, b) => b.term.length - a.term.length).forEach((entry) => {
      const term = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp('(?<![A-Za-z])' + term + '(?![A-Za-z]|\\s*[,（(])', 'g'), () => entry.term + '(' + entry.pronunciation + ' · ' + entry.meaning + ')');
    });
    return result;
  };
  const values = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string').map(text) : text(value);
  const plan = policy.criteria_plan, inputs = plan?.user_values;
  const authorities = ['USER_INPUT', 'BACKTEST_PROPOSAL', 'BACKTEST_PROPOSAL', 'USER_INPUT', 'USER_FINAL_DECISION'];
  const planValid = plan && inputs && !Array.isArray(inputs) && Object.keys(inputs).length === 2
    && Object.hasOwn(inputs, 'maximum_loss_percent') && inputs.maximum_loss_percent === null && Object.hasOwn(inputs, 'error_free_rebalances') && inputs.error_free_rebalances === null
    && plan.user_approval_required === true && plan.proposals_applied === false && Array.isArray(plan.report) && plan.report.length === 5
    && plan.report.every((row, index) => row && row.id === index + 1 && row.authority === authorities[index] && row.proposal_value === null && row.approved === false && row.data_period === null && row.evidence_label === '근거 없음'
      && ['name', 'calculation', 'limitations'].every((key) => typeof row[key] === 'string' && row[key].trim()));
  const proposal = disclosure('기준 제안·승인 방식', 'team-company-criteria-plan');
  proposal.append(node('p', 'muted-note', '제안값은 사용자 승인 전 적용하지 않습니다. 손실 한도와 무오류 리밸런싱 횟수는 사용자가 정합니다.'));
  if (planValid) {
    // Small screens retain the complete table; name the gesture that reveals hidden evidence columns.
    proposal.append(node('p', 'muted-note company-plan-scroll-hint', '표를 좌우로 밀어 계산 방법·사용 데이터 기간·한계를 확인하세요.'));
    const scroll = node('div', 'company-plan-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', '기준 제안값과 산출 근거 표');
    const table = node('table', 'company-plan-table'), head = node('thead'), headings = node('tr'), body = node('tbody');
    ['기준', '제안값', '계산 방법', '사용 데이터 기간', '한계'].forEach((label) => { const cell = node('th', '', label); cell.setAttribute('scope', 'col'); headings.append(cell); });
    head.append(headings);
    plan.report.forEach((row) => {
      const cells = node('tr'), name = node('th', '', text(row.name)); name.setAttribute('scope', 'row');
      cells.append(name, node('td', '', row.authority === 'USER_INPUT' ? '미정' : '근거 없음'), node('td', '', text(row.calculation)), node('td', '', '근거 없음'), node('td', '', text(row.limitations))); body.append(cells);
    });
    table.append(head, body); scroll.append(table); proposal.append(scroll);
  } else proposal.append(node('p', 'muted-note', '기준 제안 자료 미확인 · 근거 없음'));
  const principles = disclosure('회사 원칙 · 5개', 'team-company-principles', 'ol');
  policy.principles.forEach((item) => principles.append(node('li', '', text(item))));
  const teams = disclosure('기능팀 · 8개 · 기존 담당 연결', 'team-company-teams');
  policy.teams.forEach((team) => {
    const row = node('section'); row.append(node('h3', '', text(team.name)));
    teamFields(row, [['역할', text(team.mandate)], ['최종 책임 담당', staffNames.get(team.accountable_owner) || (team.accountable_owner === 'ZERO_FINAL_MANAGER' ? 'ZERO 최종 관리자' : '담당 미확인')], ['기존 담당', Array.isArray(team.owners) ? team.owners.map((id) => staffNames.get(id) || (id === 'ZERO_FINAL_MANAGER' ? 'ZERO 최종 관리자' : '담당 미확인')) : undefined], ['독립성', text(team.independence)], ['거부권 범위', text(team.veto_scope)], ['보고 대상', team.reports_to === 'ZERO_FINAL_MANAGER' ? 'ZERO 최종 관리자' : '미확인']]); teams.append(row);
  });
  const stages = disclosure('검토 단계 · 10개 · 실거래 미지원', 'team-company-stages', 'ol');
  policy.stages.forEach((stage) => {
    const row = node('li'); row.append(node('h3', '', text(stage.name)));
    const unsupported = stage.availability === 'UNSUPPORTED_KIS_MOCK';
    teamFields(row, [['필요 근거', values(stage.requirements)], ['통과 기준', '미정'], ['확인 상태', unsupported ? '실거래 미지원 · 개념 단계만 유지 · 근거 없음' : '검토 미수행 · 근거 없음']]); stages.append(row);
  });
  const response = disclosure('CEO 응답 순서 · 실제 안건이 있을 때', 'team-company-response', 'ol');
  policy.response_order.forEach((item) => response.append(node('li', '', text(item))));
  const constraints = disclosure('제약과 다음 검증 과제', 'team-company-constraints');
  teamFields(constraints, [['제약', values(policy.constraints)], ['승인 보류·거부 이유', values(policy.gate.reasons)], ['다음 검증 과제', values(policy.next_tasks)]]);
  const glossary = disclosure('용어 · 발음과 뜻', 'team-company-glossary');
  teamFields(glossary, policy.glossary.map((entry) => [entry.name, entry.term + '(' + entry.pronunciation + ' · ' + entry.meaning + ')']));
}
function teamMetrics(parent, fields) {
  const list = node('dl', 'account-metrics');
  fields.forEach(([label, value, note]) => {
    const field = node('div'); field.append(node('dt', '', label), node('dd', '', value));
    if (note) field.append(node('dd', 'metric-note', note));
    list.append(field);
  });
  parent.append(list);
}
function renderManagerLearning(data) {
  const state = $('#manager-learning-state'), metrics = $('#manager-learning-metrics');
  metrics.replaceChildren(); state.textContent = '뉴스 검토 기록 미확인';
  const keys = ['schema_version', 'scope', 'authority', 'state', 'day', 'target', 'recorded_review_count', 'shortfall', 'last_as_of', 'revision_count', 'forecast_note_count', 'retrospective_note_count', 'source_attested_only', 'independent_validation_completed', 'model_training_completed', 'orders_authorized', 'allocation_changes_authorized'];
  const integer = (value, limit) => Number.isInteger(value) && value >= 0 && value <= limit;
  const dateValid = typeof data?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.day) && Number.isFinite(Date.parse(data.day + 'T00:00:00Z')) && new Date(data.day + 'T00:00:00Z').toISOString().slice(0, 10) === data.day;
  if (!data || typeof data !== 'object' || Object.keys(data).length !== keys.length || !keys.every((key) => Object.hasOwn(data, key))
      || data.schema_version !== 1 || data.scope !== 'MANAGER_NEWS_JOURNAL' || data.authority !== 'RECORDS_ONLY' || data.target !== 100 || !dateValid
      || !['UNCONFIGURED', 'EMPTY', 'RECORDED', 'UNAVAILABLE'].includes(data.state) || data.source_attested_only !== true
      || data.independent_validation_completed !== false || data.model_training_completed !== false || data.orders_authorized !== false || data.allocation_changes_authorized !== false) return;
  const fields = ['recorded_review_count', 'shortfall', 'last_as_of', 'revision_count', 'forecast_note_count', 'retrospective_note_count'];
  if (['UNCONFIGURED', 'UNAVAILABLE'].includes(data.state)) {
    if (!fields.every((key) => data[key] === null)) return;
    state.textContent = data.state === 'UNCONFIGURED' ? '뉴스 기록 경로 미설정 · 검토 수 미확인' : '뉴스 기록 확인 불가 · 검토 수 미확인'; return;
  }
  if (!integer(data.recorded_review_count, 400) || data.shortfall !== Math.max(0, 100 - data.recorded_review_count)
      || !integer(data.revision_count, 128) || !integer(data.forecast_note_count, 12) || !integer(data.retrospective_note_count, 12)) return;
  if (data.state === 'EMPTY') {
    if (data.last_as_of !== null || data.recorded_review_count !== 0 || data.revision_count !== 0 || data.forecast_note_count !== 0 || data.retrospective_note_count !== 0) return;
    state.textContent = '해당 날짜의 뉴스 검토 기록 없음';
  } else {
    const at = typeof data.last_as_of === 'string' && data.last_as_of.length <= 64 && /(?:Z|[+-]\d{2}:\d{2})$/.test(data.last_as_of) ? Date.parse(data.last_as_of) : NaN;
    if (!Number.isFinite(at) || new Date(at + 9 * 3600000).toISOString().slice(0, 10) !== data.day || data.revision_count < 1) return;
    // Recorded source access is an input declaration; no training or approval follows from a count.
    state.textContent = data.recorded_review_count >= 100 ? '목표 건수 기록됨 · 원문 열람 독립 검증 없음' : '뉴스 검토 기록 있음 · 원문 열람 독립 검증 없음';
  }
  // Reuse the account metric layout so counts stay scannable on desktop and mobile.
  teamMetrics(metrics, [['원문 검토 제출 기록', format(data.recorded_review_count, 0) + ' / 100건'], ['목표까지 부족한 기록', format(data.shortfall, 0) + '건'],
    ['기록 기준 날짜 · 시각', data.day, '한국 시간 · ' + (data.last_as_of === null ? '기록 없음' : stamp(data.last_as_of))],
    ['전망 / 사후평가 메모', data.forecast_note_count + ' / ' + data.retrospective_note_count + '개', '내용 검증 별도']]);
}
function renderTeamMeeting(data, names = new Map()) {
  const label = $('#team-meeting-state'), metrics = $('#team-meeting-metrics'), heads = $('#team-meeting-heads');
  label.textContent = '회의 제출 현황 미확인'; metrics.replaceChildren(); heads.replaceChildren();
  const keys = 'schema_version scope authority state day last_as_of revision_count event agenda_kind expected_member_count submitted_member_count missing_member_count support_count caution_count oppose_count abstain_count expected_head_count submitted_head_count missing_head_count heads manager_submitted manager_id decision reported_blocker_count reason_codes source_attested_only execution_evidence_status completion_verified independent_validation_completed orders_authorized allocation_changes_authorized'.split(' ');
  const counts = 'expected_member_count submitted_member_count missing_member_count support_count caution_count oppose_count abstain_count expected_head_count submitted_head_count missing_head_count reported_blocker_count'.split(' ');
  const headKeys = 'head_id expected_member_count submitted_member_count missing_member_count support_count caution_count oppose_count abstain_count head_report_submitted head_stance'.split(' ');
  const integer = (value, max = 64) => Number.isInteger(value) && value >= 0 && value <= max;
  const stance = (value) => ['SUPPORT', 'CAUTION', 'OPPOSE', 'ABSTAIN'].includes(value);
  const strict = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key));
  if (!strict(data, keys) || data.schema_version !== 1 || data.scope !== 'TEAM_ADVISORY_MEETING' || data.authority !== 'RECORDS_ONLY'
      || !['UNCONFIGURED','EMPTY','RECORDED','UNAVAILABLE'].includes(data.state) || data.manager_id !== 'ZERO_FINAL_MANAGER'
      || data.source_attested_only !== true || data.execution_evidence_status !== 'NOT_PROVIDED'
      || ['completion_verified','independent_validation_completed','orders_authorized','allocation_changes_authorized'].some((key) => data[key] !== false)
      || typeof data.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.day) || !Number.isFinite(Date.parse(data.day+'T00:00:00Z'))
      || new Date(data.day+'T00:00:00Z').toISOString().slice(0,10) !== data.day
      || !Array.isArray(data.reason_codes) || data.reason_codes.length > 24 || !data.reason_codes.every((code) => typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(code))) return;
  if (data.state !== 'RECORDED') {
    const empty = data.state === 'EMPTY';
    if (!counts.every((key) => data[key] === (empty ? 0 : null)) || data.last_as_of !== null || data.revision_count !== (empty ? 0 : null)
        || data.event !== null || data.agenda_kind !== null || !Array.isArray(data.heads) || data.heads.length || data.manager_submitted !== false || data.decision !== 'HOLD') return;
    label.textContent = empty ? '회의 기록 없음 · 실제 의견 제출 대기' : '회의 기록 미확인 · 제출 현황 확인 필요'; return;
  }
  const date = typeof data.last_as_of === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(data.last_as_of) ? Date.parse(data.last_as_of) : NaN;
  if (!Number.isFinite(date) || new Date(date + 9*3600000).toISOString().slice(0,10) !== data.day || !integer(data.revision_count,128) || data.revision_count < 1
      || !Object.hasOwn(teamEventLabels,data.event) || !['OPERATIONS','RESEARCH_REVIEW','NEW_STRATEGY'].includes(data.agenda_kind)
      || !counts.every((key) => integer(data[key])) || data.expected_head_count > 11
      || data.submitted_member_count + data.missing_member_count !== data.expected_member_count
      || data.submitted_head_count + data.missing_head_count !== data.expected_head_count
      || data.support_count + data.caution_count + data.oppose_count + data.abstain_count !== data.submitted_member_count
      || typeof data.manager_submitted !== 'boolean' || !['HOLD','APPROVE_PROPOSAL','REJECT'].includes(data.decision)
      || data.decision === 'APPROVE_PROPOSAL' && (!data.manager_submitted || !data.submitted_member_count || !data.submitted_head_count || data.reported_blocker_count || data.agenda_kind === 'NEW_STRATEGY')
      || !Array.isArray(data.heads) || data.heads.length !== 11 || names.size !== 11) return;
  const ids = [...names.keys()];
  if (!data.heads.every((head,index) => strict(head,headKeys) && head.head_id === ids[index]
      && headKeys.filter((key)=>key.endsWith('_count')).every((key)=>integer(head[key]))
      && head.submitted_member_count + head.missing_member_count === head.expected_member_count
      && head.support_count + head.caution_count + head.oppose_count + head.abstain_count === head.submitted_member_count
      && typeof head.head_report_submitted === 'boolean' && (head.head_report_submitted ? stance(head.head_stance) && head.expected_member_count > 0 : head.head_stance === null))) return;
  if (['expected_member_count','submitted_member_count','missing_member_count','support_count','caution_count','oppose_count','abstain_count'].some((key)=>data.heads.reduce((n,head)=>n+head[key],0)!==data[key])
      || data.heads.filter((head)=>head.expected_member_count>0).length !== data.expected_head_count
      || data.heads.filter((head)=>head.head_report_submitted).length !== data.submitted_head_count
      // A head report without submitted opinions cannot support an adopted proposal.
      || data.decision === 'APPROVE_PROPOSAL' && !data.heads.some((head)=>head.head_report_submitted && head.submitted_member_count > 0)) return;
  const decision = data.manager_submitted ? {HOLD:'보류',APPROVE_PROPOSAL:'운영·검토 제안 채택',REJECT:'거부'}[data.decision] : '총괄 결론 미제출';
  label.textContent = teamEventLabels[data.event] + ' 회의 · ' + decision + ' · ' + stamp(data.last_as_of) + ' KST';
  teamMetrics(metrics, [['팀원 의견 제출', data.submitted_member_count+' / '+data.expected_member_count+'건'], ['팀장 종합 보고',data.submitted_head_count+' / '+data.expected_head_count+'건'],
    ['반대 / 주의 의견',data.oppose_count+' / '+data.caution_count+'건'],['미제출 업무',data.missing_member_count+'건','팀장 보고 미제출 '+data.missing_head_count+'건']]);
  const details = node('details','team-disclosure'), rows = node('ul'); details.append(node('summary','','각 팀의 취합 현황'));
  data.heads.filter((head)=>head.expected_member_count).forEach((head)=>rows.append(node('li','',names.get(head.head_id)+' · 의견 '+head.submitted_member_count+'/'+head.expected_member_count+' · 반대 '+head.oppose_count+' · 주의 '+head.caution_count+' · 팀장 보고 '+(head.head_report_submitted?'제출':'미제출'))));
  details.append(rows); heads.append(details);
}
async function loadTeam(event, force = false) {
  const request = ++teamRequest;
  const selected = event || 'ONBOARDING';
  if (!force && teamLoaded === selected) return;
  try {
    const response = await fetch('api/team' + (event ? '?event=' + encodeURIComponent(event) : ''), {cache: 'no-store'}); if (!response.ok) throw new Error();
    const data = await response.json();
    // Keep a slower prior event request from relabeling the selected work orders.
    if (request !== teamRequest) return;
    const grid = $('#team-grid'); grid.replaceChildren();
    const policy = data.operating_policy || {}, manager = policy.manager || {};
    renderManagerLearning(data.manager_learning);
    renderTeamMeeting(data.meeting_status, new Map([...Object.entries(data.roles || {}).map(([id, role]) => [id, role.name]), ['PRODUCT_QUALITY_TEAM', '화면 품질팀장 · UX·UI 수석']]));
    $('#team-manager-name').textContent = typeof manager.name === 'string' ? manager.name.replaceAll('모의', '') : 'ZERO 최종 관리자';
    $('#team-manager-instruction').textContent = typeof manager.instruction === 'string' ? manager.instruction.replaceAll('모의', '') : '단일 관리자가 최종 판단을 책임집니다. 공통 업무 지시 자료는 미확인입니다.';
    $('#team-manager-outputs').replaceChildren(); teamFields($('#team-manager-outputs'), [['관리자 산출물', manager.outputs]]);
    const rules = $('#team-policy-rules'); rules.replaceChildren();
    const shared = Array.isArray(policy.shared_rules) ? policy.shared_rules.filter((rule) => typeof rule === 'string') : [];
    (shared.length ? shared : ['공통 업무 지시 자료 미확인']).forEach((rule) => rules.append(node('li', '', rule)));
    const products = Array.isArray(policy.product_staff) ? policy.product_staff.filter((staff) => staff && typeof staff === 'object') : [];
    const staffNames = new Map(Object.values(data.roles || {}).flatMap((role) => Array.isArray(role.support_staff) ? role.support_staff : []).concat(products)
      .filter((staff) => staff && typeof staff.id === 'string' && typeof staff.name === 'string').map((staff) => [staff.id, staff.name]));
    const policyNames = new Map([...staffNames, ...Object.entries(data.roles || {}).map(([id, role]) => [id, role.name]), ['PRODUCT_QUALITY_TEAM', '화면 품질팀']]);
    const investmentCount = Object.values(data.roles || {}).reduce((count, role) => count + (Array.isArray(role.support_staff) ? role.support_staff.length : 0), 0);
    $('#team-staff-count').textContent = investmentCount ? '가상 실무 ' + (investmentCount + products.length) + '개 역할 · 투자 ' + investmentCount + ' · 제품 ' + products.length + ' · 자율 실행 없음' : '가상 실무 구성 미확인 · 자율 실행 없음';
    if (products.length) {
      const list = $('#team-product-list'); list.replaceChildren();
      products.forEach((staff) => {
        const details = node('details'); details.append(node('summary', '', staff.name || '품질 담당'));
        teamFields(details, [['업무 지시', staff.instruction], ['우선순위', teamPriority(staff.priority)], ['필수 입력', staff.inputs], ['검토자', staffNames.get(staff.reviewer)], ['배정 계기', staff.triggers], ['산출물', staff.outputs], ['검수 기준', staff.acceptance]]); list.append(details);
      });
    } else $('#team-product-list').replaceChildren(...teamProductOverview);
    renderCompanyPolicy(data.company_policy, policyNames);
    const orders = $('#team-orders'); orders.replaceChildren();
    const tasks = Array.isArray(data.work_orders) ? data.work_orders.filter((task) => task && typeof task === 'object') : [];
    renderTeamEvidence(data.evidence_report, tasks, staffNames, policyNames, selected);
    tasks.forEach((task) => {
      const item = node('li'); item.append(node('h4', '', task.name || '업무 담당'));
      item.dataset.assignmentStatus = task.assignment_status || ''; item.dataset.executionStatus = task.execution_status || '';
      item.append(node('p', 'team-scope', (task.assignment_status === 'ASSIGNED' ? '업무 배정' : '배정 상태 미확인') + ' · ' + (task.execution_status === 'NOT_EXECUTED' ? '이번 배정 미수행' : '수행 상태 미확인') + (task.prerequisite_only ? ' · 선행 업무' : '')));
      const dependencies = Array.isArray(task.depends_on) ? task.depends_on.map((id) => staffNames.get(id) || '담당 이름 미확인') : task.depends_on;
      teamFields(item, [['업무 지시', task.instruction], ['책임 담당', staffNames.get(task.accountable_staff)], ['보고 대상', policyNames.get(task.owner)], ['우선순위', teamPriority(task.priority)], ['필수 입력', task.inputs], ['검토자', staffNames.get(task.reviewer)], ['배정 계기', task.triggers], ['선행 담당', dependencies], ['산출물', task.outputs], ['검수 기준', task.acceptance]]); orders.append(item);
    });
    $('#team-order-count').textContent = tasks.length ? '업무 배정 완료 · ' + tasks.length + '개 · 수행/검증 별도' : '업무 배정 자료 미확인';
    Object.values(data.roles || {}).forEach((role) => {
      const card = node('article', 'team-card'); card.append(node('h3', '', role.name || '전문 자문 책임자'), node('p', '', role.mandate || '검증된 근거와 결측을 검토합니다.'));
      // The manifest groups tasks by specialist; flatten groups into readable bullets.
      const jobs = (Array.isArray(role.team_jobs) ? role.team_jobs : Object.values(role.team_jobs || {})).flat();
      if (jobs.length) {
        card.append(node('h4', '', '함께 수행하는 업무')); const list = node('ul'); jobs.forEach((job) => list.append(node('li', '', typeof job === 'string' ? job : job.job || job.task || JSON.stringify(job)))); card.append(list);
      }
      if (Array.isArray(role.support_staff) && role.support_staff.length) {
        const details = node('details');
        details.append(node('summary', '', `실무 담당 ${role.support_staff.length}개 · 검증 공백 보기`));
        role.support_staff.forEach((staff) => {
          details.append(node('h4', '', staff.name), node('p', '', staff.mandate));
          details.append(node('p', 'team-scope', staff.coverage_status === 'PARTIAL' ? '기존 기능 재사용 · 데이터 연결과 검증 필요' : '역할 지정 · 기능 구현 필요'));
          const order = staff.work_order || {};
          teamFields(details, [['업무 지시', order.instruction], ['우선순위', teamPriority(staff.priority)], ['필수 입력', staff.inputs], ['검토자', staffNames.get(staff.reviewer)], ['배정 계기', order.triggers], ['산출물', staff.outputs], ['검수 기준', staff.acceptance]]);
          const gaps = node('ul');
          (staff.missing_evidence || []).forEach((gap) => gaps.append(node('li', '', gap)));
          details.append(gaps);
        });
        card.append(details);
      }
      card.append(node('p', 'team-scope', '근거를 제시하는 자문 역할 · 최종 판단은 단일 관리자')); grid.append(card);
    });
    teamLoaded = selected; $('#team-event').value = selected; $('#team-error').hidden = grid.children.length > 0;
  } catch (_) {
    if (request !== teamRequest) return;
    renderManagerLearning(undefined); renderTeamMeeting(undefined);
    $('#team-event').value = teamLoaded || 'ONBOARDING'; $('#team-error').hidden = false;
  }
}
$('#team-event').addEventListener('change', () => loadTeam($('#team-event').value));
const views = {
  lobby: ['ZERO 트레이딩 플로어', '지금 일하는 ZERO 팀을 보고, 내 캐릭터로 직원과 이야기해 보세요.'],
  plaza: ['실시간 광장', '다른 참가자와 캐릭터를 움직이고 공개 대화를 나누세요.'],
  company: ['내 투자회사 · 전략 직원', '직원을 고용하고 과거 데이터로 전략과 리밸런싱 제안을 확인하세요.'],
  community: ['커뮤니티', '궁금한 투자 이야기, 편하게 나눠요.'],
  analysis: ['시장 브리핑', '공개 지수·선물·발표 일정 · 1시간 캐시와 출처를 확인하세요.'],
  audit: ['회계 감사', '예수금·미결제 현금·비용·실현 손익의 원장 대조 결과를 확인하세요.'],
  portfolio: ['내 자산', '나만의 모의현금 1억원으로 주식을 매수·매도해 보세요.'],
  comparison: ['ZERO 참고 운용 · 수익률 비교', '첫 매수 기록과 각 종료일·환율 기준을 확인하세요. 기간이 다르면 같은 기간 성과로 비교하지 않습니다.'],
  research: ['주식 탐색', '미국 100 · 코스피 50 · 코스닥 50 기업을 찾아보세요.'],
  workbench: ['종목과 차트', '시세와 차트, 기업 정보를 한 화면에서 확인하세요.'],
  macro: ['경제 지표', '공식 발표값과 과거 흐름을 함께 읽어 보세요.'],
  news: ['주요 뉴스', '핵심 사실과 시장에 미치는 영향, 다음 확인 항목.'],
  reports: ['보고서 자료실', '한국은행과 주요 기관의 보고서를 바로 찾아 읽어 보세요.'],
  study: ['주식 공부', '차트와 기업 숫자를 이해하는 쉬운 연습.'],
  team: ['ZERO 팀', '역할과 책임, 실제 제출된 근거를 확인하세요.'],
  guide: ['자료 설명', '숫자의 계산 기준과 아직 확인하지 못한 범위.']
};
let currentView = 'portfolio';
const domainRoutes={investment:'portfolio',office:'lobby',plaza:'plaza',community:'community'};
function domainFor(view){return view==='plaza'||view==='community'?view:['lobby','company','study','team'].includes(view)?'office':'investment';}
let routeStarted=false,plazaReturn={view:'lobby',hash:'#lobby'},lastWorkbenchHash='';
function openDefaultStock(updateAddress = true) {
  const explore = window.ZEROExplore;
  if (explore?.restoreRoute?.()) return;
  if (lastWorkbenchHash) {
    window.history?.replaceState?.({view:'workbench'}, '', lastWorkbenchHash);
    if (explore?.restoreRoute?.()) return;
  }
  const holding = state.data?.holdings?.find(row => /^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[A-Z0-9]{6})$/.test(positionKey(row)));
  explore?.openCompany?.(holding ? positionKey(holding) : 'US:SPY', {updateAddress});
}
function closeMenu() {
  const menu = $('#more-menu');
  if (menu?.open) menu.close();
  document.querySelectorAll('.menu-open').forEach((button) => button.setAttribute('aria-expanded', 'false'));
}
function navigate(view, updateAddress = true) {
  // One route updates desktop, bottom tabs and menus together; invalid links keep the current page.
  if (!Object.hasOwn(views, view) || !$('#' + view + '-view')) return false;
  if(view==='plaza'&&currentView!=='plaza'&&routeStarted){const hash=window.location?.hash;plazaReturn={view:currentView,hash:hash?.slice(1).split('?')[0]===currentView?hash:'#'+currentView};}
  if (currentView === 'workbench' && window.location?.hash?.startsWith('#workbench?')) lastWorkbenchHash = window.location.hash;
  currentView = view;
  routeStarted=true;
  document.documentElement.dataset.zeroView = view;
  const domain=domainFor(view);document.documentElement.dataset.zeroDomain=domain;
  if ($('#mobile-view')) $('#mobile-view').value = view;
  $('#refresh').hidden = !['portfolio', 'comparison'].includes(view);
  const refreshLabel=$('#refresh').querySelector?.('span');if(refreshLabel)refreshLabel.textContent=view==='portfolio'?'내 자산 새로고침':hostedView?'시세 새로고침':'계좌 새로고침';
  document.querySelectorAll('.view').forEach((section) => { section.hidden = section.id !== view + '-view'; });
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-domain]').forEach(button=>{const active=button.dataset.domain===domain;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current',button.dataset.view===view?'page':'true');else button.removeAttribute('aria-current');});
  const subnav=document.querySelector('.mts-subnav');if(subnav)subnav.hidden=!['portfolio','comparison','research','workbench','analysis','audit'].includes(view);
  $('#page-title').textContent = views[view][0];
  $('#page-subtitle').textContent = views[view][1];
  closeMenu();
  if (updateAddress && window.history?.pushState && window.location?.hash !== '#' + view) window.history.pushState({view}, '', '#' + view);
  window.scrollTo?.({top: 0, behavior: 'auto'});
  const skip = document.querySelector('.skip-link'); if (skip) skip.href = '#page-title';
  $('#page-title').tabIndex = -1;
  $('#page-title').focus?.({preventScroll: true});
  document.querySelector('.mobile-tab.menu-open')?.classList.toggle('active', !Object.hasOwn(domainRoutes,domain));
  document.dispatchEvent?.(new CustomEvent('zero-view-changed', {detail:{view}}));
  if (['study', 'macro', 'news', 'reports'].includes(view)) window.ZERODesk?.open(view);
  if (view === 'research') window.ZEROResearch?.load();
  if (view === 'analysis') window.ZEROAnalysis?.open();
  if (view === 'audit') window.ZEROAccountAudit?.open();
  if (view === 'workbench') { window.ZEROExplore?.init(); if (updateAddress) openDefaultStock(); }
  if (view === 'portfolio') window.ZEROCompany?.openPortfolio?.();
  if (view === 'comparison') {renderComparison();(hostedView?loadLiveQuotes().catch(()=>false):Promise.resolve()).then(()=>loadPortfolio()).catch(()=>notice('ZERO 참고 자료를 불러오지 못했습니다.'));}
  if (view === 'guide') loadReferences();
  if (view === 'community') window.ZEROSocial?.openCommunity();
  if (view === 'company') window.ZEROCompany?.open();
  if (view !== 'plaza') window.ZEROSocial?.closeLounge();
  window.ZEROLobby?.setActive(view === 'lobby');
  if (view === 'lobby') { window.ZEROLobby?.open(); window.ZEROLobbyUsers?.board?.(); }
  if(view==='plaza'){const opened=window.ZEROSocial?.openLounge();if($('#plaza-status'))$('#plaza-status').textContent=opened===false?'닉네임으로 로그인한 뒤 광장에 참여하세요.':'실시간 광장 · 대화는 참가자에게 공개됩니다.';}
  if (view === 'team') loadTeam($('#team-event').value === 'ONBOARDING' ? undefined : $('#team-event').value, true);
  if (view === 'comparison' && state.data) { renderAllocation(state.data.holdings, state.data.summary.holdings_value_krw); renderHistory(state.data.history || []); }
  return true;
}
window.ZERO = {...window.ZERO, navigate, currentView: () => currentView, currentDomain:()=>domainFor(currentView),domainFor,getPortfolio: () => state.data};
document.querySelectorAll('[data-domain]').forEach(button=>{if(!button.dataset.view)button.addEventListener('click',()=>navigate(domainRoutes[button.dataset.domain]));});
$('#plaza-open')?.addEventListener('click',()=>navigate('plaza'));
document.addEventListener?.('zero-plaza-closed',()=>{
  if(currentView!=='plaza')return;
  const back=Object.hasOwn(views,plazaReturn.view)&&$('#'+plazaReturn.view+'-view')?plazaReturn:{view:'lobby',hash:'#lobby'};
  window.history?.replaceState?.({view:back.view},'',back.hash);navigate(back.view,false);
  if(back.view==='workbench')openDefaultStock(false);
});
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
  navigate(button.dataset.view);
}));
document.querySelectorAll('.menu-open').forEach((button) => {
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    const menu = $('#more-menu');
    if (!menu?.open) menu?.showModal();
    document.querySelectorAll('.menu-open').forEach((item) => item.setAttribute('aria-expanded', 'true'));
  });
});
$('#menu-close')?.addEventListener('click', closeMenu);
$('#more-menu')?.addEventListener('close', () => document.querySelectorAll('.menu-open').forEach((button) => button.setAttribute('aria-expanded', 'false')));
$('#global-watchlist')?.addEventListener('click', () => { navigate('workbench', false); window.ZEROExplore?.openWatchlist(); });
// Slash is a convenience only outside text inputs; it never steals a typing shortcut.
document.addEventListener?.('keydown', (event) => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) && !event.target?.isContentEditable) { event.preventDefault(); $('#global-search')?.focus(); }
});
function restoreRoute() {
  const view = window.location?.hash?.slice(1).split('?')[0];
  if (Object.hasOwn(views, view || '')) {
    if (!routeStarted || currentView !== view) navigate(view, false);
    if (view === 'workbench') openDefaultStock(false);
  }
}
window.addEventListener?.('popstate', restoreRoute);
window.addEventListener?.('hashchange', restoreRoute);

document.addEventListener?.('DOMContentLoaded', () => {
  restoreRoute();
  // The hosted site opens on the office; the owner's local app keeps opening on the portfolio.
  const route = window.location?.hash?.slice(1).split('?')[0];
  if (hostedView && !Object.hasOwn(views, route || '')) navigate('lobby', false);
});
$('#mobile-view')?.addEventListener('change', (event) => navigate(event.target.value));
document.querySelectorAll('[data-market]').forEach((button) => button.addEventListener('click', () => { state.market = button.dataset.market; setActive('[data-market]', 'market', state.market); renderRows(); }));
document.querySelectorAll('[data-currency]').forEach((button) => button.addEventListener('click', () => { state.currency = button.dataset.currency; setActive('[data-currency]', 'currency', state.currency); renderRows(); }));
document.querySelectorAll('[data-chart]').forEach((button) => button.addEventListener('click', () => { state.chart = button.dataset.chart; setActive('[data-chart]', 'chart', state.chart); if (state.data) renderAllocation(state.data.holdings, state.data.summary.holdings_value_krw); }));
$('#search').addEventListener('input', (event) => { state.search = event.target.value.trim().toLowerCase(); renderRows(); });
function sortValue(forceValue=false) {
  if(forceValue&&state.sortMetric!=='value'){state.sortMetric='value';state.descending=true;const select=document.getElementById('holding-sort-metric');if(select)select.value='value';}else state.descending = !state.descending;
  $('#sort-value span[aria-hidden="true"]').textContent = state.descending ? '↓' : '↑';
  $('#sort-value').parentElement.setAttribute('aria-sort', state.descending ? 'descending' : 'ascending');
  const mobile = $('#sort-value-mobile'); mobile.textContent = state.descending ? '평가액 큰 순' : '평가액 작은 순';
  mobile.setAttribute('aria-label', '원화 환산 ' + mobile.textContent + ', 누르면 ' + (state.descending ? '작은' : '큰') + ' 순으로 변경');
  renderRows();
}
$('#sort-value').addEventListener('click',()=>sortValue(true));
$('#sort-value-mobile').addEventListener('click',()=>sortValue(false));
$('#refresh').addEventListener('click', refresh);
$('#risk-run').addEventListener('click', runRisk);
$('#demo-toggle').addEventListener('click',showDemo);
$('#demo-exit').addEventListener('click',exitDemo);
$('#empty-query').addEventListener('click',()=>{
  if(hostedView){$('#empty-query-note').hidden=false;$('#empty-query-note').textContent='온라인 화면은 계좌를 직접 조회하지 않습니다. PC의 ZERO에서 계좌 조회 후 저장 자료를 게시해 주세요.';}
  else refresh();
});
$('#comparison-run').addEventListener('click',runPeriodComparison);
['allocation-with-cash','allocation-without-cash'].forEach(id=>$('#'+id).addEventListener('click',()=>{
  state.includeCash=id==='allocation-with-cash';
  if(state.data)renderAllocation(state.data.holdings,state.data.summary.holdings_value_krw);
  renderAllocationComparison();
}));
let layoutWidth = 0;
new ResizeObserver(() => {
  const width = Math.round(($('#zero-reference-portfolio')||$('#portfolio-view')).clientWidth);
  if (width && width !== layoutWidth && state.data) {
    layoutWidth = width; renderAllocation(state.data.holdings, state.data.summary.holdings_value_krw); renderHistory(state.data.history || []);
  }
}).observe($('#zero-reference-portfolio')||$('#portfolio-view'));
document.documentElement.dataset.zeroReady='true'; document.dispatchEvent?.(new CustomEvent('zero-ready'));
// Poll cached display state only; background observation never requests broker refresh.
async function pollDisplay() {
  if (document.hidden || state.demo || displayPolling || $('#refresh').disabled || window.ZERO?.currentView?.()!=='comparison') return;
  displayPolling = true;
  try {
    let quotesFailed = false;
    if (hostedView && Date.now() - liveCheckedAt >= 60000) quotesFailed = !await loadLiveQuotes();
    await loadPortfolio();
    if (quotesFailed) notice('공개 시세 갱신 실패 · 마지막 저장 자료를 표시합니다. 시세 시각을 확인해 주세요.');
  } catch (_) { notice('자료를 갱신하지 못해 마지막 확인 자료를 유지합니다. 연결 상태를 확인해 주세요.'); }
  finally { displayPolling = false; }
}
setInterval(pollDisplay, 15000);
document.addEventListener?.('visibilitychange', () => { if (!document.hidden) pollDisplay(); });
