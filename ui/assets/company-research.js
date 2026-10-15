'use strict';
// Public research is loaded separately from account money and cannot authorize an order.
const companyResearch = {data: null, market: 'SP500', search: '', promise: null, failed: false,sort:'market_cap',descending:true,currency:'NATIVE',annualPeriod:'',quarterPeriod:'',desk:null};
const researchSortLabels={market_cap:'시가총액',rank:'원자료 순위',rank_change:'순위 변동',revenue:'연간 매출',operating_income:'연간 영업이익',operating_margin:'영업이익률',per:'PER',pbr:'PBR',psr:'PSR',net_margin_percent:'분기 순이익률',net_profit_growth_percent:'전 분기 이익 변화'};
// Sources that share a label and the same check minute collapse into one line with the rest folded away.
function groupSources(list){
  const groups=new Map();
  (Array.isArray(list)?list:[]).forEach((source)=>{const key=source.label+'|'+String(source.retrieved_at).slice(0,16);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(source);});
  return [...groups.values()];
}
function sourceLine(group){
  const first=group[0],p=node('p');
  p.append(researchLink(first.label,first.url),node('span','market-label','확인 '+stamp(first.retrieved_at)+' KST'));
  if(group.length>1){
    const more=node('details','source-more');more.append(node('summary','','같은 출처 '+(group.length-1)+'건 더 보기'));
    group.slice(1).forEach((source,index)=>{const row=node('p');row.append(researchLink(source.label+' '+(index+2),source.url));more.append(row);});
    p.append(more);
  }
  return p;
}
function researchSortValue(row,data,desk,key,annualPeriod,quarterPeriod){
  const company=data?.companies?.find(c=>c.id===row.id),detail=desk?.companies?.find(c=>c.id===row.id),f=company?.financials||{};
  if(['market_cap','rank','rank_change'].includes(key))return row[key];
  if(company?.kind==='ETF')return null;
  // Financial ordering shares a declared period and currency; a conversion does not repair mismatched fiscal years.
  if(['revenue','operating_income','operating_margin'].includes(key)){if(!annualPeriod||f.period_end!==annualPeriod||f.currency!==row.currency)return null;return key==='operating_margin'?number(f.revenue)>0&&Number.isFinite(number(f.operating_income))?number(f.operating_income)/number(f.revenue)*100:null:f[key];}
  if(['per','pbr','psr'].includes(key))return number(detail?.ratios?.[key])>0?detail.ratios[key]:null;
  return detail?.quarterly_margins?.find(q=>q.period===quarterPeriod)?.[key]??null;
}
function researchSortedRows(rows,data,desk,key,descending,annualPeriod,quarterPeriod){return window.ZEROExploreMath?.sortStockRows?.(rows,row=>researchSortValue(row,data,desk,key,annualPeriod,quarterPeriod),descending)||rows;}
function researchDisplayMoney(value,currency){const math=window.ZEROExploreMath,target=companyResearch.currency==='NATIVE'?currency:companyResearch.currency,fx=window.ZERO?.getPortfolio?.()?.summary?.fx,converted=math?.stockConvert?.(value,currency,target,fx);return target===currency?money(value,currency):converted===null||converted===undefined?money(value,currency)+' · 환산 미확인':money(converted,target)+' ('+money(value,currency)+')';}
function researchControls(data,u){
  const toolbar=document.querySelector?.('#research-view .table-toolbar');if(!toolbar)return;
  if(!document.getElementById('research-sort-metric')){
    const controls=node('div','stock-analytics-controls');const select=(id,label,options,action)=>{const group=node('label','',label+' '),input=node('select');input.id=id;input.setAttribute('aria-label',label);options.forEach(([value,text])=>{const option=node('option','',text);option.value=value;input.append(option);});input.addEventListener('change',action);group.append(input);controls.append(group);return input;};
    select('research-sort-metric','정렬 지표',Object.entries(researchSortLabels),async event=>{companyResearch.sort=event.target.value;if(['per','pbr','psr','net_margin_percent','net_profit_growth_percent'].includes(companyResearch.sort))companyResearch.desk=await window.ZERODesk?.load();renderResearch();});
    const direction=node('button','stock-button','큰 순');direction.id='research-sort-direction';direction.type='button';direction.addEventListener('click',()=>{companyResearch.descending=!companyResearch.descending;renderResearch();});controls.append(direction);
    select('research-display-currency','금액 통화',[['NATIVE','원통화'],['KRW','원화 KRW'],['USD','달러 USD']],event=>{companyResearch.currency=event.target.value;renderResearch();});
    select('research-annual-period','연간 종료일',[],event=>{companyResearch.annualPeriod=event.target.value;renderResearch();});select('research-quarter-period','제공 분기',[],event=>{companyResearch.quarterPeriod=event.target.value;renderResearch();});toolbar.append(controls);
  }
  const etf=companyResearch.market==='ETF',sort=document.getElementById('research-sort-metric');
  [...sort.options].forEach(option=>{option.disabled=etf&&!['market_cap','rank','rank_change'].includes(option.value);option.textContent=option.value==='market_cap'&&etf?'운용자산(AUM)':researchSortLabels[option.value];});
  if(etf&&!['market_cap','rank','rank_change'].includes(companyResearch.sort)){companyResearch.sort='market_cap';companyResearch.descending=true;}
  const currency=document.getElementById('research-display-currency');currency.disabled=etf;currency.parentElement.hidden=etf;
  const annual=[...new Set((data?.companies||[]).filter(c=>u?.rows.some(row=>row.id===c.id)&&c.financials?.currency===u.rows[0]?.currency).map(c=>c.financials?.period_end).filter(Boolean))].sort().reverse(),quarters=[...new Set((companyResearch.desk?.companies||[]).flatMap(c=>c.quarterly_margins?.map(q=>q.period)||[]))].sort().reverse();
  const periods=(id,values,key)=>{const select=document.getElementById(id);if(!values.includes(companyResearch[key]))companyResearch[key]=values[0]||'';select.replaceChildren();(values.length?values:['']).forEach(value=>{const option=node('option','',value||'근거 없음');option.value=value;select.append(option);});select.value=companyResearch[key];};periods('research-annual-period',annual,'annualPeriod');periods('research-quarter-period',quarters,'quarterPeriod');
  document.getElementById('research-sort-metric').value=companyResearch.sort;document.getElementById('research-display-currency').value=companyResearch.currency;const direction=document.getElementById('research-sort-direction');direction.textContent=companyResearch.descending?'큰 순 ↓':'작은 순 ↑';direction.setAttribute('aria-label',researchSortLabels[companyResearch.sort]+' '+(companyResearch.descending?'내림차순':'오름차순')+' · 누르면 방향 변경');
  ['research-annual-period','research-quarter-period'].forEach(id=>{const input=document.getElementById(id);input.disabled=etf;if(etf){input.replaceChildren(node('option','','ETF 기업 재무 N/A'));input.parentElement.hidden=true;}});if(etf)document.getElementById('research-display-currency').value='NATIVE';
  document.getElementById('research-annual-period').parentElement.hidden=etf||!['revenue','operating_income','operating_margin'].includes(companyResearch.sort);document.getElementById('research-quarter-period').parentElement.hidden=etf||!['net_margin_percent','net_profit_growth_percent'].includes(companyResearch.sort);
}
let companyRenderSequence = 0;
const visibleCopy = (text) => String(text ?? '').replaceAll('모의', '');
const researchMoney = (value, currency) => Number.isFinite(number(value)) ? format(number(value) / 100000000, 1) + (currency === 'KRW' ? '억원' : '억 달러') : '미확인';
function renderETFResearch(data,u) {
  const list=$('#research-ranks');list.replaceChildren();list.setAttribute('aria-label','ETF 운용자산 AUM 순위');
  $('#research-title').textContent='ETF 운용자산(AUM) 순위';
  $('#research-intro').textContent='미국 상장 ETF · 자산규모 기준';
  const failed=companyResearch.failed||u?.reason_codes?.includes('PROVIDER_REQUEST_FAILED');
  $('#research-status').textContent=(failed?(u?.rows?.length?'최근 연결 실패 · 이전 자료 표시 · ':'최근 연결 실패 · '):'')+'AUM 기준일 '+(u?.market_date||'미공개')+' · 확인 시각 '+(u?.collected_at?stamp(u.collected_at)+' KST':'미확인');
  $('#research-date').hidden=true;$('#research-basis').hidden=true;
  const evidence=$('#research-etf-evidence');evidence.replaceChildren(node('p','muted-note','제공자의 미국 상장 ETF 운용자산(AUM) 상위 50 목록입니다. 전체 상장 ETF 대조와 운용사별 독립 검증은 완료하지 않았습니다. '+(u?.status||'UNAVAILABLE')),
    node('p','muted-note','AUM 원천 기준일 '+(u?.market_date||'제공 자료에서 미확인')+' · 조회 시각을 기준일로 바꾸지 않습니다. 원자료 확인 '+(u?.collected_at?stamp(u.collected_at)+' KST':'미확인')),
    node('p','muted-note','ETF 기업 매출·영업이익·PER 정렬은 N/A입니다. ETF 이름을 누르면 5년 차트·MDD와 ETF 구성을 확인합니다. SPY는 S&P500 ETF 대용이며 지수 자체가 아닙니다.'));
  if(u?.source_url)evidence.append(researchLink('AUM 순위 출처',u.source_url));
  const rows=researchSortedRows((u?.rows||[]).filter(row=>window.ZEROExploreMath?.searchable?window.ZEROExploreMath.searchable(row,companyResearch.search):(row.name+' '+row.symbol).toLowerCase().includes(companyResearch.search)),data,null,companyResearch.sort,companyResearch.descending,'','');
  rows.forEach(row=>{
    if(window.MTSCards){list.append(researchChartPreview(window.MTSCards.create({identity:row.id,name:row.name,symbol:row.symbol,currency:row.currency,subtitle:row.symbol+' · ETF · AUM '+money(row.market_cap,'USD'),onOpen:()=>showCompany(row.id,null,{range:'5Y',interval:'1d'})}),row));return;}
    const item=node('li','research-rank'),button=node('button','research-company');button.type='button';button.dataset.companyId=row.id;
    const title=node('span','research-company-name');title.append(node('strong','',row.name),node('span','market-label',row.symbol+' · ETF'));
    const values=node('span','research-rank-value etf-aum');values.append(node('strong','','AUM '+money(row.market_cap,'USD')),node('span','market-label','제공자 자산규모 순위 '+row.rank+'위'));
    researchChartPreview(item,row);button.append(node('span','research-rank-number',format(row.rank)),title,values);button.addEventListener('click',()=>showCompany(row.id,null,{range:'5Y',interval:'1d'}));item.append(button);list.append(item);
  });
  window.MTSCards?.observe(list);
  $('#research-empty').hidden=rows.length>0;$('#research-empty').textContent=u?.rows?.length?'검색 결과가 없습니다.':'ETF 50 순위 자료가 없습니다. 주요 ETF 바로가기는 순위와 별도로 이용할 수 있습니다.';
  $('#research-count').textContent=(u?.rows?.length||0)+' / '+(u?.requested_count||50)+'개 · 운용자산(AUM) · 원문 USD · 제공자 순위 보존 · '+(u?.status||'UNAVAILABLE');
  const major=$('#research-etf-shortcuts');major.replaceChildren();
  ['TQQQ','SPY','SCHD','JEPQ','JEPI','SPYD','HDV','VYM','NOBL'].forEach(symbol=>{const button=node('button','peer-button',symbol==='SPY'?'SPY · S&P500 ETF 대용':symbol);button.type='button';button.dataset.etfReference=symbol;button.addEventListener('click',()=>showCompany('US:'+symbol,null,{range:'5Y',interval:'1d'}));major.append(button);});
}
async function loadResearch(force = false) {
  if (companyResearch.promise) return companyResearch.promise;
  // Navigation reuses source-stamped session data; only an explicit reload fetches again.
  if (companyResearch.data && force !== true) return companyResearch.data;
  $('#research-status').textContent = '기업 자료를 불러오는 중입니다.';
  $('#research-reload').disabled = true;
  companyResearch.promise = (async () => {
    const response = await fetch('api/research', {cache: 'no-store'});
    if (!response.ok) throw Error('RESEARCH_UNAVAILABLE');
    const data = await response.json();
    if (data.scope !== 'PUBLIC_COMPANY_RESEARCH' || data.authority !== 'RESEARCH_ONLY'
      || data.orders_authorized !== false || data.allocation_changes_authorized !== false
      || !Array.isArray(data.universes) || !Array.isArray(data.companies)) throw Error('RESEARCH_INVALID');
    companyResearch.data = data; companyResearch.failed = false; renderResearch(); return data;
  })().catch(() => { companyResearch.failed = true; renderResearch(); return null; })
    .finally(() => { companyResearch.promise = null; $('#research-reload').disabled = false; });
  return companyResearch.promise;
}
function researchLink(label, url) {
  const a = node('a', 'research-link', label);
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error(); a.href = parsed.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  catch (_) { return node('span', 'muted-note', label + ' · 출처 미확인'); }
  return a;
}
function renderResearch() {
  const data = companyResearch.data, u = data?.universes.find((item) => item.id === companyResearch.market);
  researchControls(data,u);
  $('#research-etf-major').hidden=companyResearch.market!=='ETF';
  $('#research-etf-details').hidden=companyResearch.market!=='ETF';
  if(companyResearch.market==='ETF')return renderETFResearch(data,u);
  $('#research-date').hidden=false;$('#research-basis').hidden=false;
  $('#research-title').textContent='오늘의 기업 순위';
  $('#research-intro').textContent='시가총액으로 보는 시장 · 기업을 누르면 사업과 실적을 확인합니다.';
  $('#research-ranks').setAttribute('aria-label','기업 시가총액 순위');
  const list = $('#research-ranks'); list.replaceChildren();
  $('#research-status').textContent = data?.state === 'RECORDED'
    ? '수집 ' + stamp(data.generated_at) + ' KST · 기업 ' + format(data.companies.filter((c) => c.kind === 'COMPANY').length) + '개 · 연간 재무 확인 ' + format(data.coverage?.financial_company_count) + '개'
    : '저장된 기업 연구 자료가 없습니다.';
  if (companyResearch.failed) $('#research-status').textContent = '최근 연결 실패 · ' + (data ? '이전 자료 표시 · ' + $('#research-status').textContent : '기업 자료 없음') + ' · 다시 불러오기를 눌러주세요.';
  $('#research-basis').textContent = companyResearch.market === 'SP500'
    ? 'SPY 편입종목에서 파생한 공개 목록의 기업 시가총액 순위입니다. 알려진 복수 주식 종류는 한 기업으로 묶고 제공된 시가총액 중 큰 값을 사용합니다. 공식 S&P 라이선스 목록·기업 전체 주식 종류 대조는 미검증입니다.'
    : '공개 제공자의 보통주 상장종목 시가총액 순위입니다. 우선주는 이름 규칙으로 제외합니다. 다른 주식 종류를 합산한 발행회사 전체 시가총액 순위와 다를 수 있습니다.';
  $('#research-date').replaceChildren(node('span', '', '가격 기준 거래일 ' + (u?.market_date || '제공 자료에서 미확인') + ' · 변동은 직전 보관일 대비'));
  if (u?.source_url) $('#research-date').append(researchLink('순위 출처', u.source_url));
  const rows = researchSortedRows((u?.rows || []).filter((row) => window.ZEROExploreMath?.searchable?window.ZEROExploreMath.searchable(row,companyResearch.search):(row.name+' '+row.symbol).toLowerCase().includes(companyResearch.search)),data,companyResearch.desk,companyResearch.sort,companyResearch.descending,companyResearch.annualPeriod,companyResearch.quarterPeriod);
  rows.forEach((row) => {
    if(window.MTSCards){const value=researchSortValue(row,data,companyResearch.desk,companyResearch.sort,companyResearch.annualPeriod,companyResearch.quarterPeriod);list.append(researchChartPreview(window.MTSCards.create({identity:row.id,name:row.name,symbol:row.symbol,currency:row.currency,subtitle:row.symbol+' · '+(companyResearch.sort==='market_cap'?'시총 '+researchDisplayMoney(row.market_cap,row.currency):researchSortLabels[companyResearch.sort]+' '+(Number.isFinite(number(value))?format(value,2):'근거 없음')),onOpen:()=>showCompany(row.id)}),row));return;}
    const item = node('li', 'research-rank');
    const button = node('button', 'research-company'); button.type = 'button'; button.dataset.companyId = row.id;
    const rank = node('span', 'research-rank-number', format(row.rank));
    const title = node('span', 'research-company-name'); title.append(node('strong', '', row.name), node('span', 'market-label', row.symbol));
    const values = node('span', 'research-rank-value'); values.append(node('strong', '', researchDisplayMoney(row.market_cap, row.currency)));
    if(companyResearch.sort!=='market_cap'){const value=researchSortValue(row,data,companyResearch.desk,companyResearch.sort,companyResearch.annualPeriod,companyResearch.quarterPeriod),text=['revenue','operating_income'].includes(companyResearch.sort)?researchDisplayMoney(value,row.currency):Number.isFinite(number(value))?format(value,2)+(['per','pbr','psr'].includes(companyResearch.sort)?'배':['operating_margin','net_margin_percent','net_profit_growth_percent'].includes(companyResearch.sort)?'%':''):'근거 없음';values.append(node('span','market-label',researchSortLabels[companyResearch.sort]+' '+text));}
    const change = row.rank_change;
    values.append(node('span', 'market-label', change === null || change === undefined ? '비교 기록 없음' : change === 0 ? '순위 동일' : (change > 0 ? '상승 ' : '하락 ') + format(Math.abs(change)) + '위'));
    researchChartPreview(item,row);button.append(rank, title, values); button.addEventListener('click', () => showCompany(row.id)); item.append(button); list.append(item);
  });
  window.MTSCards?.observe(list);
  $('#research-empty').hidden = rows.length > 0;
  $('#research-empty').textContent = u?.status === 'UNAVAILABLE' ? '이 시장의 순위 자료를 확인하지 못했습니다.' : '검색 결과가 없습니다.';
  $('#research-count').textContent = (u?.rows.length || 0) + ' / ' + (u?.requested_count || ({KOSPI:50,KOSDAQ:50,SP500:100}[companyResearch.market])) + '개 · '+researchSortLabels[companyResearch.sort]+' '+(companyResearch.descending?'내림차순':'오름차순')+' · 원자료 순위 유지 · 미확인 값 마지막';
  if(['revenue','operating_income','operating_margin'].includes(companyResearch.sort))$('#research-count').textContent+=' · 동일 종료일 '+(companyResearch.annualPeriod||'미확인');
  if(['per','pbr','psr'].includes(companyResearch.sort))$('#research-count').textContent+=' · 제공자 지표의 가격·분모 기준일 대조 전';
  if(companyResearch.currency!=='NATIVE'){const fx=window.ZERO?.getPortfolio?.()?.summary?.fx;$('#research-count').textContent+=window.ZEROExploreMath?.stockFX(fx)!==null&&fx?' · 현재 참고 환율 관측 '+stamp(fx.observed_at)+' · 조회 '+stamp(fx.retrieved_at)+' · 연간 실적 환산은 과거 환율 아님':' · 신선한 참고 환율 없음';}
}
function researchSection(title, texts) {
  const section = node('section', 'company-section'); section.append(node('h3', '', title));
  if (!texts?.length) section.append(node('p', 'muted-note', '확인된 근거 없음 · 조사 대기'));
  else { const list = node('ul'); texts.forEach((text) => list.append(node('li', '', visibleCopy(text)))); section.append(list); }
  return section;
}
function researchChartPreview(item, row) {
  if(!window.ZEROTechnicalChart)return item;
  const preview=node('button','research-chart-preview','차트 미리보기');preview.type='button';preview.setAttribute('aria-label',row.name+' 차트 미리보기');preview.addEventListener('click',()=>window.ZEROTechnicalChart.open({identity:row.id,name:row.name,range:'1Y'}));item.append(preview);return item;
}
async function showCompany(identity, destination = null, options = {}) {
  if (!destination && window.ZEROExplore) return window.ZEROExplore.openCompany(identity,options);
  const dialog = $('#company-dialog'), content = destination || $('#company-content');
  if (!destination) { $('#company-title').textContent = identity.split(':')[1]; if (!dialog.open) dialog.showModal(); }
  content.replaceChildren(node('p', '', '기업 자료를 불러오는 중입니다.'));
  // A fast second click or closed dialog must not be overwritten by an older request.
  if (!destination) dialog.dataset.identity = identity;
  content.dataset.identity = identity;
  const request = String(++companyRenderSequence); content.dataset.researchRequest = request;
  const current = () => destination ? content.isConnected && content.dataset.identity === identity && content.dataset.researchRequest === request : dialog.open && dialog.dataset.identity === identity;
  const [data, desk] = await Promise.all([companyResearch.data || loadResearch(), window.ZERODesk?.load()]);
  if (!current()) return;
  const company = data?.companies.find((c) => c.id === identity || c.symbols?.some((s) => c.market + ':' + s === identity));
  const detail = desk?.companies?.find((c) => c.id === company?.id);
  content.replaceChildren();
  if (!company) { content.append(node('p', '', '이 종목의 사업·재무 설명은 아직 조사되지 않았습니다. 확인되지 않은 내용을 대신 표시하지 않습니다.')); return; }
  if (!destination) $('#company-title').textContent = visibleCopy(company.name);
  if(window.ZEROTechnicalChart){const preview=node('button','stock-button','차트 미리보기');preview.type='button';preview.addEventListener('click',()=>window.ZEROTechnicalChart.open({identity:company.id,name:company.name,range:'1Y'}));content.append(preview);}
  content.append(node('p', 'company-classification', company.symbol + ' · ' + (company.kind === 'ETF' ? 'ETF · 펀드' : '기업') + ' · ' + (company.industry || '산업 미확인')));
  content.append(node('p', 'company-overview', visibleCopy(detail?.description_excerpt ? '토스 제공 사업 설명 발췌: ' + detail.description_excerpt : company.overview)));
  if (company.kind === 'COMPANY') content.append(node('p', 'muted-note', '공개 제공자 요약 · 원문 공시 및 사업별 매출 비중의 독립 대조 전입니다. 아래 전망은 검증 과제이며 수익 예측이 아닙니다.'));
  content.append(researchSection(company.kind === 'ETF' ? '어디에 투자하고 어떻게 수익을 얻나' : '사업과 수익 구조', company.business_model));
  if (detail) content.append(companyDetailSection(detail));
  if (company.kind === 'ETF') {
    const placeholder=node('section','company-section');placeholder.append(node('p','muted-note','공개 구성종목 자료를 확인하는 중입니다.'));content.append(placeholder);
    window.ZEROFunds?.section(company.id).then((section)=>{if(current())placeholder.replaceWith(section);});
  }
  if (company.kind === 'ETF') content.append(node('p', 'muted-note', 'ETF 자체에는 일반 기업의 매출·영업이익 순위를 적용하지 않습니다. 운용사 기업의 실적과도 다릅니다.'));
  else {
    const f = company.financials || {}, comparison = company.industry_comparison || {};
    const financial = node('section', 'company-section'); financial.append(node('h3', '', '연간 실적과 산업 내 비교'));
    financial.append(node('p', 'muted-note', '회계기간 종료 ' + (f.period_end || '미확인') + ' · 통화 ' + (f.currency || '미확인') + ' · 예상치·최근 12개월 수치 제외'));
    const metrics = node('dl', 'company-financials');
    [['매출액',researchMoney(f.revenue,f.currency)],['영업이익',researchMoney(f.operating_income,f.currency)],['매출 순위',comparison.revenue_rank ? comparison.revenue_rank + '위' : '비교 근거 부족'],['영업이익 순위',comparison.operating_income_rank ? comparison.operating_income_rank + '위' : '비교 근거 부족']].forEach(([label,value]) => {const group=node('div');group.append(node('dt','',label),node('dd','',value));metrics.append(group);});
    financial.append(metrics, node('p', 'muted-note', '동일 산업·회계기간 종료일·통화로 비교 가능한 수집 기업 ' + format(comparison.peer_count || 0) + '개가 상대 표본입니다. 산업 전체 순위와 다르며 비교 기업이 2개 미만이면 순위를 보류합니다.'));
    if (f.source_url) financial.append(researchLink('연간 재무표 원문',f.source_url)); content.append(financial);
    const peers = node('section','company-section');peers.append(node('h3','','같은 산업의 비교 기업'));
    (comparison.peer_ids || []).forEach((id) => {const peer=data.companies.find((c)=>c.id===id);if(!peer)return;const button=node('button','peer-button',peer.name);button.type='button';button.addEventListener('click',()=>showCompany(id));peers.append(button);});
    if (!(comparison.peer_ids || []).length) peers.append(node('p','muted-note','비교 기업 근거 없음'));
    peers.append(node('p','muted-note','같은 산업으로 분류된 비교 기업입니다. 제품·고객이 실제로 겹치는 직접 경쟁사 여부는 별도 연구가 필요합니다.'));content.append(peers);
  }
  content.append(researchSection('미래 사업성 · 다음에 확인할 조건',company.drivers),researchSection('수익성을 훼손할 위험',company.risks));
  const sources=node('section','company-section');sources.append(node('h3','','근거와 확인 시각'));
  if (!company.sources?.length) sources.append(node('p','muted-note','이번 수집에서 확인한 출처 없음 · 공식 자료 대조 대기'));
  groupSources(company.sources).forEach((group)=>sources.append(sourceLine(group)));
  content.append(sources);
}
function companyDetailSection(detail) {
  // The benchmark's formatter is local to its renderer; company details own
  // this small formatter so a loaded quarterly value cannot abort the dialog.
  const detailPercent = (value) => (number(value) > 0 ? '+' : '') + format(value, 2) + '%';
  const section=node('section','company-section');section.append(node('h3','','회사별 사업·재무 상세'));
  section.append(node('p','muted-note',(detail.industry||'산업 미확인')+' · 설립 '+(detail.established_year||'근거 없음')+'년 · 제공자 공개 자료 · 독립 공시 대조 전'));
  if(detail.homepage_url)section.append(researchLink('제공 자료의 회사 홈페이지',detail.homepage_url));
  const segments=detail.segments||{};section.append(node('h4','','어디에서 매출이 발생하나'));
  section.append(node('p','muted-note','사업 구성 기준 '+(segments.as_of||'미확인')+' · 회계연도 '+(segments.fiscal_year||'미확인')+' · 기존 연간 실적의 종료일과 다를 수 있습니다.'));
  const table=node('table','detail-table'),head=node('thead'),headrow=node('tr');['사업·제품','매출 비중'].forEach(t=>headrow.append(node('th','',t)));head.append(headrow);table.append(head);
  const body=node('tbody');(segments.rows||[]).forEach(row=>{const tr=node('tr');tr.append(node('td','',row.name+(row.product?' · '+row.product:'')),node('td','',Number.isFinite(number(row.weight_percent))?format(number(row.weight_percent),2)+'%':'근거 없음'));body.append(tr);});table.append(body);section.append(table);
  if(!segments.rows?.length)section.append(node('p','muted-note','사업별 매출 비중 근거 없음'));
  const major=[...(segments.rows||[])].filter(r=>Number.isFinite(number(r.weight_percent))).sort((a,b)=>number(b.weight_percent)-number(a.weight_percent))[0];
  if(major)section.append(node('p','','주요 수익원은 '+major.name+'입니다. 이 사업의 판매량·판매 가격·반복 계약이 늘어도 매출원가와 투자 비용이 더 빠르게 증가하면 이익은 줄 수 있습니다. 다음 실적에서 해당 사업의 성장과 이익률이 함께 개선되는지 확인합니다.'));
  section.append(node('h4','','가격과 실적을 비교하는 지표'));
  const values=node('dl','company-financials');[['PER',detail.ratios?.per],['PBR',detail.ratios?.pbr],['PSR',detail.ratios?.psr]].forEach(([label,v])=>{const group=node('div');group.append(node('dt','',label),node('dd','',number(v)>0?format(number(v),2)+'배':'계산·해석 보류'));values.append(group);});section.append(values,node('p','muted-note','제공자의 현재 지표입니다. 주가 기준일·세부 분모 산식은 미확인입니다. PER은 주가/주당순이익, PBR은 주가/주당순자산, PSR은 주가/주당매출이며 다른 회계기간의 숫자를 섞어 비교하지 않습니다.'));
  section.append(node('h4','','분기 수익성의 변화'));
  const marginTable=node('table','detail-table'),mh=node('thead'),mr=node('tr');['제공 회계기간','순이익률','순이익 변화'].forEach(t=>mr.append(node('th','',t)));mh.append(mr);marginTable.append(mh);const mb=node('tbody');
  (detail.quarterly_margins||[]).slice(-8).reverse().forEach(row=>{const tr=node('tr');tr.append(node('td','',row.period),node('td','',Number.isFinite(number(row.net_margin_percent))?format(number(row.net_margin_percent),2)+'%':'근거 없음'),node('td','',Number.isFinite(number(row.net_profit_growth_percent))?detailPercent(row.net_profit_growth_percent):'근거 없음'));mb.append(tr);});marginTable.append(mb);section.append(marginTable,node('p','muted-note','순이익률=순이익/매출×100. 변화율은 제공자의 전 분기 비교값이며 전년 동기 성장률과 다릅니다. 금융업·적자 전환·일회성 손익은 별도 해석이 필요합니다.'));
  section.append(node('h4','','사업을 비교할 기업'));
  const peers=node('ul');(detail.peers||[]).forEach(p=>peers.append(node('li','',p.name)));section.append(peers,node('p','muted-note','토스가 산업 비교 대상으로 제시한 회사들입니다. 동일 제품·고객을 두고 경쟁하는 직접 경쟁사로 확정하지 않습니다. 제품, 고객군, 가격 결정력과 공시를 대조해야 합니다.'));
  const sources=node('details','source-details');sources.append(node('summary','','상세 자료의 출처·조회 시각'));groupSources(detail.sources).forEach(group=>sources.append(sourceLine(group)));section.append(sources);
  return section;
}
$('#company-close').addEventListener('click',()=>$('#company-dialog').close());
$('#research-reload').addEventListener('click',()=>loadResearch(true));
$('#research-search').addEventListener('input',(event)=>{companyResearch.search=event.target.value.trim().toLowerCase();renderResearch();});
document.querySelectorAll('[data-research-market]').forEach((button)=>button.addEventListener('click',()=>{companyResearch.market=button.dataset.researchMarket;document.querySelectorAll('[data-research-market]').forEach((other)=>{other.classList.toggle('active',other===button);other.setAttribute('aria-pressed',String(other===button));});renderResearch();}));
window.ZEROResearch = {load:loadResearch,current:()=>companyResearch.data,open:showCompany,renderInto:(identity,destination)=>showCompany(identity,destination),link:researchLink};
