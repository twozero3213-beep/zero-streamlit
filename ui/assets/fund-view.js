'use strict';
// Both endpoints expose public references only; loading them never refreshes a broker.
const fundUI = {benchmark: null, benchmarkPromise: null, fundsPromise: null, institutionsPromise:null};
const fund$ = (id) => document.getElementById(id);
const fundNumber = (value) => value === null || value === undefined || value === '' ? NaN : Number(value);
const fundAssetLabels = {STOCK:'주식',REIT:'리츠',TREASURY_BILL:'미국 단기 국채',FUTURES:'선물',SWAP:'스왑',ELN:'주가연계증권',COLLATERAL:'담보 자산',PHYSICAL_GOLD:'실물 금',CASH:'현금',OTHER:'기타 자산'};
const fundReasons = {PARTIAL_COVERAGE:'일부 편입 항목만 확보했습니다.',SOURCE_UNAVAILABLE:'발행사 자료를 확보하지 못했습니다.',HOLDINGS_DATE_UNAVAILABLE:'편입 기준일이 확인되지 않았습니다.',WEIGHTS_UNAVAILABLE:'일부 자산의 비중이 확인되지 않았습니다.',IDENTITY_UNVERIFIED:'편입 자산의 식별자를 독립 대조하지 못했습니다.',REVISION_DETECTED:'같은 기준일의 발행사 자료에 수정 기록이 있습니다.',PREVIOUS_SNAPSHOT_UNAVAILABLE:'비교할 이전 기록이 없습니다.',PARTIAL_SNAPSHOT:'현재 또는 이전 기록이 일부 자료여서 신규·제외 판단을 보류합니다.',SNAPSHOT_UNAVAILABLE:'현재 또는 이전 편입 자료가 없습니다.',SOURCE_BASIS_CHANGED:'출처 자료의 기준이 달라 비교를 보류합니다.',WEIGHT_BASIS_CHANGED:'비중의 계산 기준이 달라 비교를 보류합니다.'};
function fundExact(value) {
  const text=String(value??'');if(!/^[+-]?\d+(\.\d+)?$/.test(text)||!Number.isFinite(Number(text)))return '근거 없음';
  const parts=text.split('.'),fraction=(parts[1]||'').replace(/0+$/,'');
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction?'.'+fraction:'');
}
function fundPercent(value, points = false) {return Number.isFinite(fundNumber(value))?fundExact(value)+(points?'%p':'%'):'근거 없음';}
function fundFilterRows(rows,changes,direction='ALL',small=false,quantity=false,threshold=0.05) {
  const deltas=new Map(changes.map(row=>[row.id,quantity?(row.state==='AVAILABLE'?row.change_quantity:null):row.change_percentage_points]));
  return rows.filter((row)=>{const raw=deltas.get(row.id),delta=fundNumber(raw);
    if(direction==='INCREASED'&&!(delta>0)||direction==='DECREASED'&&!(delta<0))return false;
    return !small||Number.isFinite(delta)&&(quantity?delta!==0:fundMeetsThreshold(raw,threshold));
  });
}
function fundDecimalDifference(current,previous) {
  const values=[current,previous];if(values.some(value=>typeof value!=='string'||value.length>80||! /^[+-]?\d+(\.\d+)?$/.test(value)))return null;
  const scale=Math.max(...values.map(value=>(value.split('.')[1]||'').length));
  const integer=value=>{const sign=value.startsWith('-')?-1n:1n,[whole,fraction='']=value.replace(/^[+-]/,'').split('.');return sign*BigInt(whole+fraction.padEnd(scale,'0'));};
  const difference=integer(current)-integer(previous),digits=(difference<0n?-difference:difference).toString().padStart(scale+1,'0');
  const text=scale?(digits.slice(0,-scale)+'.'+digits.slice(-scale)).replace(/\.?0+$/,''):digits;
  return (difference<0n?'-':'')+(text||'0');
}
function fundMeetsThreshold(value,threshold) {
  return fundNumber(fundDecimalDifference(String(value??'').replace(/^-/,''),String(threshold)))>=0;
}
function fundMagnitudeOrder(a,b,key) {
  const first=a[key],last=b[key],valid=value=>typeof value==='string'&&Number.isFinite(fundNumber(value));
  const delta=valid(first)&&valid(last)?fundNumber(fundDecimalDifference(last.replace(/^-/,''),first.replace(/^-/,''))):valid(first)?-1:valid(last)?1:0;
  return Math.sign(delta)||a.name.localeCompare(b.name)||String(a.id||a.name).localeCompare(String(b.id||b.name));
}
function institutionActivity(before,after) {
  const oldRows=before?.rows||[],newRows=after?.rows||[];
  const result={state:'UNAVAILABLE',increased:[],decreased:[],appeared:[],disappeared:[],available_count:0,unavailable_count:0,ambiguous_count:0,small_change_count:0};
  if(!before?.holdings_as_of||!after?.holdings_as_of||before.holdings_as_of>=after.holdings_as_of||!oldRows.length||!newRows.length){result.unavailable_count=newRows.length;return result;}
  const group=rows=>{const names=new Map();rows.forEach(row=>{if(!names.has(row.name))names.set(row.name,[]);names.get(row.name).push(row);});return names;},first=group(oldRows),last=group(newRows);
  result.state='LIMITED';
  for(const name of new Set([...first.keys(),...last.keys()])){
    const prior=first.get(name)||[],current=last.get(name)||[];
    if(prior.length>1||current.length>1){result.unavailable_count+=1;result.ambiguous_count+=1;continue;}
    if(!prior.length){result.appeared.push(current[0]);continue;}
    if(!current.length){result.disappeared.push(prior[0]);continue;}
    const old=prior[0].ownership_percent,now=current[0].ownership_percent,change=fundDecimalDifference(now,old);
    if(change===null||![old,now].every(value=>fundNumber(value)>=0&&fundNumber(value)<=100)){result.unavailable_count+=1;continue;}
    result.available_count+=1;
    if(!fundMeetsThreshold(change,'0.01')){result.small_change_count+=1;continue;}
    (fundNumber(change)>0?result.increased:result.decreased).push({...current[0],previous_ownership_percent:old,change_percentage_points:change});
  }
  ['increased','decreased'].forEach(key=>result[key].sort((a,b)=>fundMagnitudeOrder(a,b,'change_percentage_points')));
  ['appeared','disappeared'].forEach(key=>result[key].sort((a,b)=>fundMagnitudeOrder(a,b,'value_krw_100m')));
  return result;
}
function fundWeightChanges(rows,comparison,canCompare,threshold) {
  const result={state:'UNAVAILABLE',can_compare:canCompare,threshold,increased:[],decreased:[],appeared:[],disappeared:[],available_count:0,unavailable_count:0,small_change_count:0};
  if(!canCompare){result.unavailable_count=rows.length;return result;}
  const records=new Map(rows.map(row=>[row.id,row]));
  for(const change of comparison.weight_changes){
    const row=records.get(change.id),delta=fundDecimalDifference(change.weight_percent,change.previous_weight_percent);
    if(!row||delta===null||fundDecimalDifference(row.weight_percent,change.weight_percent)!=='0'||fundDecimalDifference(change.change_percentage_points,'0')!==delta){result.unavailable_count+=1;continue;}
    result.available_count+=1;
    if(!fundMeetsThreshold(delta,threshold)){result.small_change_count+=1;continue;}
    (fundNumber(delta)>0?result.increased:result.decreased).push({...row,...change,change_percentage_points:delta});
  }
  if(result.available_count)result.state='AVAILABLE';
  ['increased','decreased'].forEach(key=>result[key].sort((a,b)=>fundMagnitudeOrder(a,b,'change_percentage_points')));
  return result;
}
function fundWeightActivity(fund) {
  const result=fundWeightChanges(fund.rows,fund.comparison,fundCanCompare(fund),'0.05');
  if(result.can_compare){
    const rows=new Map(fund.rows.map(row=>[row.id,row]));
    result.appeared=fund.comparison.new_ids.map(id=>rows.get(id)||{id,name:id});result.disappeared=fund.comparison.exited_ids.map(id=>({id,name:id}));
    ['appeared','disappeared'].forEach(key=>result[key].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id)));
  }return result;
}
function institutionWeightActivity(before,after,comparison) {
  const names=institutionActivity(before,after),canCompare=names.state==='LIMITED'&&comparison?.state==='LIMITED'&&comparison.basis==='EXACT_DISCLOSED_NAME_MATCH'&&comparison.previous_holdings_as_of===before.holdings_as_of;
  const result=fundWeightChanges(after?.rows||[],comparison,canCompare,'0.01');
  if(canCompare){result.appeared=names.appeared;result.disappeared=names.disappeared;result.unavailable_count+=names.ambiguous_count;if(result.state==='AVAILABLE')result.state='LIMITED';}
  return result;
}
function renderWeightActivity(container,activity,institution) {
  const box=node('div',institution?'institution-weight-activity':'fund-weight-activity');box.append(node('h3','','공시 비중 변화 · 상위 10'),
    node('p','muted-note','증가·감소는 비중 차이 절대값 '+activity.threshold+'%p 이상을 전체 비교한 뒤 크기순으로 표시합니다. 가격·환율·자산군 규모 변화가 포함되므로 실제 매매를 뜻하지 않습니다.'));
  if(institution)box.append(node('p','fund-coverage','종목명이 일치하는 항목만 제한적으로 비교하며 중복 이름은 보류합니다. 이름 출현·누락은 신규 편입·전량 매도의 근거가 아니며, 공시 평가액순으로 표시합니다.'));
  else box.append(node('p','muted-note','같은 출처·자산 신원의 전체 기록만 비교합니다. 공시 목록 출현·누락은 이름순이며 실제 신규 매수·전량 매도를 증명하지 않습니다.'));
  const change=row=>row.name+' · 비중 '+fundPercent(row.previous_weight_percent)+' → '+fundPercent(row.weight_percent)+' · 차이 '+fundPercent(row.change_percentage_points,true);
  renderFundActivityCards(box,[['비중 증가',activity.increased,change,activity.can_compare&&activity.available_count>0],['비중 감소',activity.decreased,change,activity.can_compare&&activity.available_count>0],[institution?'공시에 새로 나타난 이름':'공시에 새로 나타난 자산',activity.appeared,row=>row.name+' · 공시 비중 '+fundPercent(row.weight_percent),activity.can_compare],[institution?'공시에서 빠진 이름':'공시에서 빠진 자산',activity.disappeared,row=>institution?row.name+' · 이전 공시 비중 '+fundPercent(row.weight_percent):row.id+' · 이전 자산명 미확인',activity.can_compare]],activity.can_compare);
  box.append(node('p','fund-coverage','비중 비교 가능 '+activity.available_count+'개 · 비교 보류 '+activity.unavailable_count+'개 · 작은 변화·같은 비중으로 제외 '+activity.small_change_count+'개. 누락된 비중을 변화 없음으로 처리하지 않습니다.'));container.append(box);
}
function renderFundActivityCards(container,cards,available) {
  const grid=node('div','fund-activity-grid');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px';
  cards.forEach(([title,items,text,canCompare=available])=>{
    const card=node('div','fund-activity-list'),list=node('ol');card.style.overflowWrap='anywhere';card.append(node('h4','',title));
    items.slice(0,10).forEach(item=>list.append(node('li','',text(item))));
    if(!items.length)list.append(node('li','muted-note',canCompare?'표시 기준에 맞는 공시 변화 없음':'비교 근거 부족 · 판단 보류'));
    card.append(list,node('p','muted-note',canCompare?items.length+'개 중 최대 10개 표시':'비교 불가'));grid.append(card);
  });container.append(grid);
}
function renderInstitutionActivity(container,activity,threshold) {
  const box=node('div','institution-activity');box.append(node('h3','','공시 지분율 변화 · 상위 10'),
    node('p','muted-note','전후 공시의 같은 종목명만 제한적으로 비교합니다. 지분율 증가·감소는 차이 절대값 0.01%p 이상을 전체 비교 뒤 크기순으로, 이름 출현·누락은 해당 연도 공시 평가액순으로 표시합니다. 발행주식 수 변화·유상증자·자사주 소각 등이 섞일 수 있어 실제 거래로 해석하지 않습니다. 가격 보정 금액은 근거가 없어 계산하지 않습니다.'));
  const valuation=row=>'공시 평가액 '+fundExact(row.value_krw_100m)+'억원',change=row=>row.name+' · 지분율 '+fundPercent(row.previous_ownership_percent)+' → '+fundPercent(row.ownership_percent)+' · 차이 '+fundPercent(row.change_percentage_points,true)+' · '+valuation(row);
  renderFundActivityCards(box,[['지분율 증가',activity.increased,change,activity.state==='LIMITED'&&activity.available_count>0],['지분율 감소',activity.decreased,change,activity.state==='LIMITED'&&activity.available_count>0],['공시에 새로 나타난 이름',activity.appeared,row=>row.name+' · 올해 '+valuation(row)],['공시에서 빠진 이름',activity.disappeared,row=>row.name+' · 작년 '+valuation(row)]],activity.state==='LIMITED');
  box.append(node('p','fund-coverage','비교 보류 '+activity.unavailable_count+'개 · 지분율 누락·중복 이름은 변화 없음으로 처리하지 않습니다. 작은 변화·같은 지분율로 제외 '+activity.small_change_count+'개.'),
    node('p','muted-note','공시 목록의 이름 출현·누락은 신규 편입·전량 매도를 뜻하지 않습니다. 회사명 변경·표기 차이도 포함될 수 있습니다.'));
  if(threshold)box.append(node('p','fund-coverage','해외 공시는 10억원 미만 종목을 생략하여 목록 출현·누락에 기준선 변화가 포함될 수 있습니다.'));container.append(box);
}
function fundChangeControls(container,disabled,onChange,quantity=false,threshold='0.05') {
  const group=node('div','desk-controls fund-filter-controls'),label=node('label','',quantity?'공시 수량 변화':'비중 변화'),select=node('select');
  [['ALL','전체 항목'],['INCREASED',quantity?'수량 증가':'비중 증가'],['DECREASED',quantity?'수량 감소':'비중 감소']].forEach(([value,text])=>{const option=node('option','',text);option.value=value;select.append(option);});
  select.disabled=disabled;label.append(select);
  const smallLabel=node('label','desk-check fund-small-change-filter'),checkbox=node('input');checkbox.type='checkbox';checkbox.disabled=disabled;checkbox.checked=!disabled;
  smallLabel.append(checkbox,document.createTextNode(quantity?'수량 변화만 보기 · 차이 0·비교 보류 숨김':'비중 변화만 보기 · 절대 차이 '+threshold+'%p 미만·비교 보류 숨김'));
  select.addEventListener('change',onChange);checkbox.addEventListener('change',onChange);group.append(label,smallLabel);container.append(group);
  return {select,checkbox};
}
function fundPublicURL(value) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.')||/^[\d.]+$/.test(url.hostname)||url.hostname.includes(':')
      ||/(^|\.)localhost$|\.(local|internal|lan|home|corp|test|invalid)$/i.test(url.hostname))return null;
    for(const [key,value]of url.searchParams)if(/token|secret|passw|passwd|api.?key|credential|auth|access.?key|signature|session|cookie/i.test(key)||/^code$/i.test(key)||/\b(?:sk-|AKIA|Bearer\s)[A-Za-z0-9]/i.test(value))return null;
    if(/(?:token|secret|auth|session)=/i.test(url.hash))return null;
    return url.href;
  }catch(_){return null;}
}
function fundSource(label,value) {
  const url=fundPublicURL(value);if(!url)return node('span','muted-note',label+' · 안전한 공개 원문 링크 근거 없음');
  const link=node('a','research-link',label);link.href=url;link.target='_blank';link.rel='noopener noreferrer';return link;
}
function fundBenchmarkValid(data) {
  const keys=['state','schema_version','scope','symbol','currency','price_basis','as_of','capital_krw','start','latest_usd','krw_common','sources','expense_treatment','exclusions','leverage','source_attested_only','independent_validation_completed','actual_profit_verified','orders_authorized','allocation_changes_authorized'];
  if(!data||Object.keys(data).length!==keys.length||!keys.every((key)=>Object.hasOwn(data,key))
    ||data.state!=='AVAILABLE'||data.schema_version!==1||data.scope!=='TQQQ_ETF_CLOSE_REFERENCE'||data.symbol!=='TQQQ'||data.currency!=='USD'
    ||data.price_basis!=='SPLIT_ADJUSTED_CLOSE_EX_DIVIDENDS'||fundNumber(data.capital_krw)!==100000000
    ||data.source_attested_only!==true||data.independent_validation_completed!==false||data.actual_profit_verified!==false
    ||data.orders_authorized!==false||data.allocation_changes_authorized!==false
    ||data.expense_treatment!=='FUND_OPERATING_EXPENSES_REFLECTED_IN_PRICE'
    ||data.leverage?.daily_target_multiple!==3||data.leverage?.long_term_multiple_guaranteed!==false)return false;
  const start=data.start?.market_date,latest=data.latest_usd?.market_date,common=data.krw_common?.market_date;
  return [start,latest,common].every((value)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value)))
    &&start<=common&&common<=latest
    &&['return_percent','reference_value_krw','gain_krw'].every((key)=>Number.isFinite(fundNumber(data.latest_usd?.[key]))&&Number.isFinite(fundNumber(data.krw_common?.[key])))
    &&fundNumber(data.latest_usd.reference_value_krw)>0&&fundNumber(data.krw_common.reference_value_krw)>0
    &&fundPublicURL(data.sources?.prices)!==null&&fundPublicURL(data.sources?.fx)!==null;
}
// On a hosted refresh the saved TQQQ comparison is repriced with the live quote the main screen already fetched.
function liveFundBenchmark(data) {
  const reprice=window.ZEROExploreMath?.liveBenchmark;
  return reprice&&window.ZEROLive?reprice(data,window.ZEROLive,'TQQQ','etf_close'):data;
}
function renderFundBenchmark(data) {
  if(!fund$('tqqq-panel'))return;
  const available=fundBenchmarkValid(data);fund$('tqqq-content').hidden=!available;fund$('tqqq-empty').hidden=available;
  if(!available){fund$('tqqq-empty').textContent='TQQQ의 가격·환율 비교 근거 없음. 공개 기록을 확인한 뒤 페이지를 다시 열어 주세요.';fund$('tqqq-basis').textContent='확인되지 않은 가격·환율로 참고 평가액을 채우지 않습니다.';return;}
  data=liveFundBenchmark(data);
  const live=data.live,latest=data.latest_usd,common=data.krw_common,first=data.start;
  fund$('tqqq-basis').textContent='소수점 수량을 가정한 전액 투자 참고값 · 시작 미국 거래일 '+first.market_date+(live?' · 공개 지연 시세로 새로고침 · 시세 확인 '+stamp(live.checked_at)+' KST':' · 공개 자료 기록 '+stamp(data.as_of)+' KST')+' · 금액·수익률은 소수 둘째 자리까지 표시';
  fund$('tqqq-price-return').textContent=format(latest.return_percent,2)+'%';
  fund$('tqqq-price-return').className=fundNumber(latest.return_percent)>0?'gain':fundNumber(latest.return_percent)<0?'loss':'';
  fund$('tqqq-price-period').textContent=first.market_date+' → '+latest.market_date+(live?' 미국 시세(지연 가능) · ETF 현재 가격수익률':' 미국 거래일 · ETF 종가 가격수익률');
  fund$('tqqq-fixed-value').textContent=format(latest.reference_value_krw,2)+'원';
  fund$('tqqq-fixed-gain').textContent='환율 고정 참고 차액 '+format(latest.gain_krw,2)+'원';
  fund$('tqqq-krw-value').textContent=format(common.reference_value_krw,2)+'원';
  fund$('tqqq-krw-return').textContent=(live?'지연 환율 반영 참고 수익률(공식 환율 아님) ':'공식 환율 반영 참고 수익률 ')+format(common.return_percent,2)+'%';
  fund$('tqqq-fx-period').textContent=(live?'공개 지연 환율 '+format(common.end_usd_krw,2)+'원 반영 · 시세 시각 '+stamp(live.market_time)+' KST':'가격·공식 환율 공통 관측일 '+common.market_date+' · 달러 가격의 최근 거래일과 다릅니다.');
  fund$('tqqq-assumptions').textContent='기존 ZERO 첫 매수 기록 '+stamp(first.recorded_at)+' KST의 미국 날짜 종가를 시작점으로 삼습니다. 그날 ZERO가 TQQQ를 매수·보유했다는 뜻은 아닙니다. 시작 종가 '+fundExact(latest.start_etf_close)+' USD, '+(live?'현재 시세 ':'최근 종가 ')+fundExact(latest.etf_close)+' USD입니다. '+(live?'새로고침 때 공개 지연 시세와 지연 환율(공식 환율 아님)로 다시 계산했으며, 시작 환율 ':'공통 관측일 계산은 시작 환율 ')+fundExact(common.start_usd_krw)+'원/USD와 '+(live?'현재 지연 환율 ':'해당일 환율 ')+fundExact(common.end_usd_krw)+'원/USD를 사용합니다.';
  const sources=fund$('tqqq-sources');sources.replaceChildren();
  sources.append(node('p','muted-note','시작 가격 자료 확인 '+stamp(first.price_retrieved_at)+' KST · 시작 공식 환율 자료 확인 '+stamp(first.fx_retrieved_at)+' KST'));
  [['ETF 종가 원문',data.sources.prices,'가격 확인 '+stamp(latest.price_retrieved_at)+' KST'],['공식 원·달러 환율',data.sources.fx,'공통 가격 확인 '+stamp(common.price_retrieved_at)+' KST · 환율 확인 '+stamp(common.fx_retrieved_at)+' KST']].forEach(([label,url,time])=>{const p=node('p','fund-source');p.append(fundSource(label,url),node('span','muted-note',time));sources.append(p);});
}
function loadFundBenchmark() {
  if(fundUI.benchmarkPromise)return fundUI.benchmarkPromise;
  if(fund$('tqqq-empty'))fund$('tqqq-empty').textContent='공개 TQQQ 가격·환율 비교 기록을 불러오는 중입니다.';
  fundUI.benchmarkPromise=(async()=>{const response=await fetch('api/tqqq',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();fundUI.benchmark=data;renderFundBenchmark(data);return data;})().catch(()=>{fundUI.benchmarkPromise=null;renderFundBenchmark(null);return null;});
  return fundUI.benchmarkPromise;
}
function loadPublicFunds() {
  if(fundUI.fundsPromise)return fundUI.fundsPromise;
  fundUI.fundsPromise=(async()=>{
    const response=await fetch('api/funds',{cache:'no-store'});if(!response.ok)throw Error();
    const data=await response.json(),keys=['schema_version','scope','collected_at','funds','orders_authorized','allocation_changes_authorized','state','record_day','authority','source_attested_only','independent_validation_completed','coverage'];
    if(!data||Object.keys(data).length!==keys.length||!keys.every((key)=>Object.hasOwn(data,key))||data.schema_version!==1
      ||data.scope!=='PUBLIC_FUND_HOLDINGS'||data.authority!=='HOLDINGS_HISTORY_ONLY'
      ||data.orders_authorized!==false||data.allocation_changes_authorized!==false
      ||data.source_attested_only!==true||data.independent_validation_completed!==false||!Array.isArray(data.funds))throw Error();
    return data;
  })().catch(()=>{fundUI.fundsPromise=null;return null;});
  return fundUI.fundsPromise;
}
function fundCanCompare(fund) {
  const comparison=fund?.comparison;
  return fund?.completeness==='COMPLETE'&&comparison?.state==='AVAILABLE'&&comparison.basis==='PREVIOUS_RECORDED_HOLDINGS_DATE'
    &&typeof comparison.previous_holdings_as_of==='string'&&comparison.previous_holdings_as_of<fund.holdings_as_of
    &&Array.isArray(comparison.reason_codes)&&comparison.reason_codes.every((reason)=>reason==='REVISION_DETECTED')
    &&['new_ids','exited_ids','weight_changes'].every((key)=>Array.isArray(comparison[key]));
}
function fundComparableQuantity(row,change) {
  return change?.state==='AVAILABLE'&&change.quantity_unit==='SHARES'&&row?.quantity_unit==='SHARES'
    &&['STOCK','REIT'].includes(row.asset_category)&&[change.previous_reported_quantity,change.reported_quantity].every(value=>Number.isFinite(fundNumber(value))&&fundNumber(value)>=0)
    &&fundDecimalDifference(row.reported_quantity,change.reported_quantity)==='0'&&fundDecimalDifference(change.reported_quantity,change.previous_reported_quantity)===change.change_quantity;
}
function fundQuantityActivity(fund) {
  const result={state:'UNAVAILABLE',can_compare:fundCanCompare(fund),increased:[],decreased:[],appeared:[],disappeared:[],available_count:0,unavailable_count:0,unchanged_count:0};
  if(!result.can_compare){result.unavailable_count=fund.rows.length;return result;}
  const comparison=fund.comparison,rows=new Map(fund.rows.map(row=>[row.id,row])),changes=Array.isArray(comparison.quantity_changes)?comparison.quantity_changes:[];
  result.appeared=comparison.new_ids.map(id=>rows.get(id)||{id,name:id});result.disappeared=comparison.exited_ids.map(id=>({id,name:id}));
  for(const change of changes){
    const row=rows.get(change.id);if(!fundComparableQuantity(row,change)){result.unavailable_count+=1;continue;}
    result.available_count+=1;
    if(fundNumber(change.change_quantity)===0){result.unchanged_count+=1;continue;}
    (fundNumber(change.change_quantity)>0?result.increased:result.decreased).push({...row,...change});
  }
  if(!changes.length)result.unavailable_count=comparison.weight_changes.length;
  if(result.available_count)result.state='AVAILABLE';
  ['increased','decreased'].forEach(key=>result[key].sort((a,b)=>fundMagnitudeOrder(a,b,'change_quantity')));
  ['appeared','disappeared'].forEach(key=>result[key].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id)));
  return result;
}
function renderFundActivity(container,activity) {
  const box=node('div','fund-activity');box.append(node('h3','','공시 수량 변화 · 상위 10'),
    node('p','muted-note','수량 증가·감소는 전체 기록에서 같은 자산 신원·주식 수 단위를 확인한 항목의 수량 차이 절대값순입니다. 같은 수량(차이 0)은 제외하며, 공시 목록 출현·누락은 이름순으로 최대 10개 표시합니다. 비중은 가격 효과가 섞인 참고값입니다. 분할·ETF 설정·환매는 보정하지 않았으며 수량 변화가 매니저의 실제 매매를 증명하지 않습니다.'));
  const change=row=>row.name+' · 수량 '+fundExact(row.previous_reported_quantity)+' → '+fundExact(row.reported_quantity)+'주 · 차이 '+fundExact(row.change_quantity)+'주 · 현재 비중 '+fundPercent(row.weight_percent)+' · 참고';
  renderFundActivityCards(box,[['공시 수량 증가',activity.increased,change,activity.state==='AVAILABLE'],['공시 수량 감소',activity.decreased,change,activity.state==='AVAILABLE'],['공시에 새로 나타난 자산',activity.appeared,row=>row.name+' · '+(row.symbol||row.id),activity.can_compare],['공시에서 빠진 자산',activity.disappeared,row=>row.id+' · 이전 자산명 미확인',activity.can_compare]],activity.state==='AVAILABLE');
  box.append(node('p','fund-coverage','수량 비교 가능 '+activity.available_count+'개 · 비교 보류 '+activity.unavailable_count+'개 · 같은 공시 수량 '+activity.unchanged_count+'개. 수량 누락·단위 변경·계약·원금 단위는 주식 수로 비교하지 않습니다.'),
    node('p','muted-note','공시 목록의 출현·누락을 실제 신규 매수·전량 매도로 해석하지 않습니다. 첫 기록·일부 목록·출처 기준 불일치는 비교 불가입니다.'));container.append(box);
}
function fundHoldingGroups(fund,rows) {
  if(fund.weight_basis!=='MIXED_NAV_AND_NOTIONAL')return [{title:fund.weight_basis==='NOTIONAL_EXPOSURE'?'발행사 보고 명목 노출':'발행사 보고 편입자산',rows}];
  return [{title:'선물·스왑 · 명목 노출 기준',rows:rows.filter((row)=>['FUTURES','SWAP'].includes(row.asset_category))},
    {title:'담보·단기 국채·현금 · 순자산 기준 보고값',rows:rows.filter((row)=>['COLLATERAL','TREASURY_BILL','CASH'].includes(row.asset_category))},
    {title:'그 밖의 자산 · 비중 기준 개별 확인',rows:rows.filter((row)=>!['FUTURES','SWAP','COLLATERAL','TREASURY_BILL','CASH'].includes(row.asset_category))}].filter((group)=>group.rows.length);
}
function renderFundRows(container,fund,rows,canCompare) {
  const comparison=fund.comparison||{},changes=new Map((canCompare?comparison.weight_changes:[]).map((row)=>[row.id,row]));
  const newIds=new Set(canCompare?comparison.new_ids:[]),quantities=new Map((canCompare&&Array.isArray(comparison.quantity_changes)?comparison.quantity_changes:[]).map(row=>[row.id,row]));
  fundHoldingGroups(fund,rows).forEach((group)=>{
    const title=node('h4','fund-group-title',group.title);container.append(title);
    const wrapper=node('div','fund-table-scroll');wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label',group.title+' 편입자산 표 · 좌우 스크롤 가능');
    const table=node('table','fund-holdings-table'),caption=node('caption','',group.title+' · 보고 수량과 비중 참고값');
    const head=node('thead'),header=node('tr');['편입자산','코드','종류','현재 보고 수량','이전 수량','수량 차이','현재 비중 · 참고','이전 비중 · 참고','비중 차이 %p · 참고'].forEach((label)=>{const th=node('th','',label);th.scope='col';header.append(th);});head.append(header);
    const body=node('tbody');group.rows.forEach((row)=>{
      const tr=node('tr'),name=node('th','fund-asset-name',row.name);name.scope='row';
      if(newIds.has(row.id))name.append(node('span','fund-row-note','이전 기록에 없었음'));
      const change=changes.get(row.id),quantity=quantities.get(row.id),known=canCompare&&fundComparableQuantity(row,quantity),unit={SHARES:'주',CONTRACTS:'계약',PAR_VALUE:'원금·액면 단위',UNKNOWN:'단위 미확인'}[row.quantity_unit]||'단위 미확인';
      tr.append(name,node('td','',row.symbol||'코드 근거 없음'),node('td','',fundAssetLabels[row.asset_category]||'종류 근거 없음'),node('td','fund-number',fundExact(row.reported_quantity)+' · '+unit),node('td','fund-number',known?fundExact(quantity.previous_reported_quantity)+'주':'비교 보류'),node('td','fund-number',known?fundExact(quantity.change_quantity)+'주':'비교 보류'),node('td','fund-number',fundPercent(row.weight_percent)),node('td','fund-number',canCompare?fundPercent(change?.previous_weight_percent):'비교 보류'),node('td','fund-number',canCompare?fundPercent(change?.change_percentage_points,true):'비교 보류'));body.append(tr);
    });
    table.append(caption,head,body);wrapper.append(table);container.append(wrapper);
  });
}
async function fundSection(identity) {
  const section=node('section','company-section fund-section');section.append(node('h3','','발행사 편입자산과 이전 기록'));
  try {
    const data=await loadPublicFunds(),fund=data?.funds.find((item)=>item.id===identity);
    if(!fund||!Array.isArray(fund.rows)){section.append(node('p','muted-note','이 ETF의 발행사 편입자산 근거 없음. 공개 기록을 확인한 뒤 페이지를 다시 열어 주세요.'));return section;}
    const complete={COMPLETE:'전체 목록으로 기록됨',PARTIAL:'일부 목록만 확보됨',UNAVAILABLE:'자료 없음'}[fund.completeness]||'범위 미확인';
    if(identity==='US:SPY')section.append(node('p','muted-note','S&P500은 SPY ETF를 대체 지표로 표시합니다. 지수 자체의 직접 보유 목록과 구분합니다.'));
    section.append(node('p','muted-note','편입 기준일 '+(fund.holdings_as_of||'근거 없음')+' · 실제 자료 확인 '+stamp(fund.collected_at)+' KST'),
      node('p','fund-coverage',complete+' · 확보된 항목 '+fund.rows.length+'개 · 독립 전체 대조는 미완료'));
    section.append(fundSource('발행사 편입자산 원문',fund.source_url));
    const basis={NAV_WEIGHT:'펀드 순자산 대비 비중',NOTIONAL_EXPOSURE:'계약의 명목 노출 비중',MIXED_NAV_AND_NOTIONAL:'선물 명목 노출과 담보 순자산 비중의 혼합',ISSUER_REPORTED:'발행사가 보고한 비중 · 세부 정의는 원문 확인'}[fund.weight_basis]||'비중 기준 근거 없음';
    section.append(node('p','muted-note','비중 기준: '+basis));
    if(fund.weight_basis==='MIXED_NAV_AND_NOTIONAL')section.append(node('p','fund-weight-note','선물·스왑의 명목 노출과 담보 자산의 순자산 비중은 다른 기준입니다. 합계 100%로 맞추지 않으며 지수 계약을 회사 주식 보유로 해석하지 않습니다. 음수나 100% 초과 값도 원문 보고값입니다.'));
    if(fund.rows.some((row)=>row.asset_category==='ELN'))section.append(node('p','muted-note','주가연계증권(ELN)은 기초지수 이름을 포함할 수 있습니다. 해당 지수나 회사를 직접 보유한 주식으로 바꾸지 않습니다.'));
    if(fund.rows.some((row)=>row.asset_category==='PHYSICAL_GOLD'))section.append(node('p','muted-note','실물 금은 회사 주식 목록이나 기업 매출·이익의 비교 대상이 아닙니다. 비중 값이 없으면 100%로 채우지 않습니다.'));
    const reasons=Array.from(new Set(fund.coverage_reason_codes||[]));if(reasons.length){const list=node('ul','fund-limitations');reasons.forEach((reason)=>list.append(node('li','',fundReasons[reason]||'추가 자료 한계는 원문 확인이 필요합니다.')));section.append(list);}
    const canCompare=fundCanCompare(fund),comparison=fund.comparison||{};
    section.append(node('p','fund-comparison-status',canCompare?'비교 가능한 이전 편입 기준일 '+comparison.previous_holdings_as_of+' · 동일한 출처·비중 기준의 전체 기록 비교':'이전 편입 기준일 '+(comparison.previous_holdings_as_of||'근거 없음')+' · 첫 기록이거나 전체·동일 기준 비교가 확인되지 않아 이전 비중·신규·제외 판단을 보류합니다.'));
    if(!canCompare)section.append(node('p','muted-note','일부 목록에서 보이지 않는 자산을 펀드에서 제외됐다고 판단하지 않습니다.'));
    const activity=fundWeightActivity(fund);renderWeightActivity(section,activity,false);
    const quantityDetail=node('details','fund-difference');quantityDetail.append(node('summary','','공시 수량 변화 보기'));renderFundActivity(quantityDetail,fundQuantityActivity(fund));section.append(quantityDetail);
    section.append(node('p','muted-note','비중 차이는 퍼센트포인트(%p)입니다. 주가수익률이 아니며 펀드 매니저의 실제 매매를 확인한 기록도 아닙니다.'));
    if((comparison.reason_codes||[]).includes('REVISION_DETECTED'))section.append(node('p','muted-note',fundReasons.REVISION_DETECTED));
    if(!fund.rows.length){section.append(node('p','muted-note','표시할 편입자산 근거 없음'));return section;}
    const searchId='fund-search-'+String(identity).replace(/[^A-Za-z0-9]/g,'-'),label=node('label','fund-search-label','확보된 전체 항목 검색'),input=node('input');input.type='search';input.id=searchId;input.placeholder='자산명·코드·종류 검색';input.autocomplete='off';label.htmlFor=searchId;label.append(input);section.append(label);
    const count=node('p','muted-note'),tables=node('div','fund-tables'),more=node('button','secondary-button','20개 더 보기');more.type='button';let shown=20;
    const controls=fundChangeControls(section,!activity.available_count,()=>{shown=20;render();});
    const render=()=>{
      const query=input.value.trim().toLowerCase();
      const matching=fund.rows.filter((row)=>(row.name+' '+(row.symbol||'')+' '+(fundAssetLabels[row.asset_category]||'')).toLowerCase().includes(query));
      const filtered=fundFilterRows(matching,canCompare?comparison.weight_changes:[],controls.select.value,controls.checkbox.checked);
      tables.replaceChildren();renderFundRows(tables,fund,filtered.slice(0,shown),canCompare);
      count.textContent='확보 '+fund.rows.length+'개 · 검색 '+matching.length+'개 · 변화 필터 후 '+filtered.length+'개 · 현재 '+Math.min(shown,filtered.length)+'개 표시';
      if(!filtered.length)tables.append(node('p','muted-note','검색 결과가 없습니다.'));more.hidden=shown>=filtered.length;
    };
    input.addEventListener('input',()=>{shown=20;render();});more.addEventListener('click',()=>{shown+=20;render();});
    section.append(count,node('p','muted-note fund-scroll-hint','작은 화면에서는 표를 좌우로 밀거나, 표에 초점을 두고 방향키로 읽을 수 있습니다.'),tables,more);render();return section;
  }catch(_){section.append(node('p','muted-note','편입자산을 표시할 근거가 부족합니다. 공개 기록을 확인한 뒤 페이지를 다시 열어 주세요.'));return section;}
}
async function loadInstitutions() {
  if(!fundUI.institutionsPromise)fundUI.institutionsPromise=(async()=>{
    const response=await fetch('api/institutions',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();
    const keys=['schema_version','scope','state','collected_at','institutions','authority','source_attested_only','independent_validation_completed','orders_authorized','allocation_changes_authorized'];
    if(!data||Object.keys(data).length!==keys.length||!keys.every((key)=>Object.hasOwn(data,key))||data.schema_version!==1
      ||data.scope!=='PUBLIC_INSTITUTION_HOLDINGS'||data.authority!=='ANNUAL_DISCLOSURE_HISTORY_ONLY'
      ||data.source_attested_only!==true||data.independent_validation_completed!==false||data.orders_authorized!==false
      ||data.allocation_changes_authorized!==false||!Array.isArray(data.institutions)||data.institutions.length>2)throw Error();
    return data;
  })().catch(()=>{fundUI.institutionsPromise=null;return null;});return fundUI.institutionsPromise;
}
function renderInstitutionRows(container,rows,changes) {
  const map=new Map(changes.map((row)=>[row.id,row])),wrapper=node('div','fund-table-scroll');wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','국민연금 연간 종목 공시 · 좌우 스크롤 가능');
  const table=node('table','fund-holdings-table');table.append(node('caption','','공시 자산군 내 비중 · 이름이 일치하는 전년도 항목 비교'));
  const head=node('thead'),tr=node('tr');['종목명','공시 순번','현재 비중','이전 비중','차이 %p','평가액 · 억원','회사 지분율'].forEach((label)=>{const th=node('th','',label);th.scope='col';tr.append(th);});head.append(tr);
  const body=node('tbody');rows.forEach((row)=>{const line=node('tr'),name=node('th','fund-asset-name',row.name),change=map.get(row.id);name.scope='row';
    line.append(name,node('td','fund-number',String(row.source_rank)),node('td','fund-number',fundPercent(row.weight_percent)),node('td','fund-number',fundPercent(change?.previous_weight_percent)),node('td','fund-number',fundPercent(change?.change_percentage_points,true)),node('td','fund-number',fundExact(row.value_krw_100m)),node('td','fund-number',fundPercent(row.ownership_percent)));body.append(line);});
  table.append(head,body);wrapper.append(table);container.append(wrapper);
}
async function institutionSection() {
  const section=node('section','panel fund-section');section.append(node('h2','','국민연금 · 연간 공시의 비중 변화'),node('p','muted-note','연말 보유목록을 다음 해 3분기에 공개합니다. 국내·해외주식은 각각의 자산군 내 비중이며, 회사 지분율과 다릅니다. 실시간 보유나 실제 매매 기록은 아닙니다.'));
  const data=await loadInstitutions();
  if(!data||data.state!=='RECORDED'||!data.institutions.length){section.append(node('p','muted-note','국민연금 연간 공시 자료를 아직 확보하지 못했습니다.'));return section;}
  data.institutions.forEach((institution)=>{
    const detail=node('details','source-details institution-detail');detail.open=institution.id==='KR:NPS_DOMESTIC';detail.append(node('summary','',institution.name));
    const snapshots=institution.snapshots||[],current=snapshots.at(-1),comparison=institution.comparison||{},changes=comparison.state==='LIMITED'?comparison.weight_changes:[];
    if(!current){detail.append(node('p','muted-note','이 자산군의 연간 종목 자료 없음'));section.append(detail);return;}
    detail.append(node('p','muted-note','공시 기준 '+current.holdings_as_of+' · 원자료 확인 '+stamp(current.collected_at)+' KST · 이전 연말 '+(comparison.previous_holdings_as_of||'근거 없음')),
      node('p','muted-note','종목명만 제공되어 회사 식별을 독립 검증하지 못했습니다. 중복 이름은 비교에서 제외하며, 새로 편입되거나 제외됐다고 판단하지 않습니다.'));
    snapshots.forEach((snapshot)=>detail.append(fundSource(snapshot.holdings_as_of+' 공식 공시',snapshot.source_url)));
    if(snapshots.some((snapshot)=>(snapshot.coverage_reason_codes||[]).includes('SOURCE_REPORTING_THRESHOLD')))detail.append(node('p','fund-coverage','해외주식 공시는 10억원 미만 종목을 생략합니다. 목록의 비중을 더해 100%로 맞추지 않습니다.'));
    snapshots.filter((snapshot)=>(snapshot.coverage_reason_codes||[]).includes('SOURCE_WEIGHT_TOTAL_EXCEEDS_100')).forEach((snapshot)=>{const total=snapshot.rows.reduce((sum,row)=>sum+(Number.isFinite(fundNumber(row.weight_percent))?fundNumber(row.weight_percent):0),0);detail.append(node('p','fund-coverage',snapshot.holdings_as_of+' 공시 목록 비중 합계 '+total.toFixed(4)+'% · 100%를 초과하여 분모·제외 항목 대조를 보류했습니다. 원문 비중을 재계산하거나 100%로 맞추지 않았습니다.'));});
    if(snapshots.some((snapshot)=>(snapshot.coverage_reason_codes||[]).includes('SOURCE_REFRESH_FAILED')))detail.append(node('p','muted-note','최근 공개자료 재확인에 실패하여 이전 자료와 원래 확인 시각을 유지했습니다.'));
    const weightActivity=institutionWeightActivity(snapshots.at(-2),current,comparison);renderWeightActivity(detail,weightActivity,true);
    const ownershipDetail=node('details','fund-difference');ownershipDetail.append(node('summary','','공시 지분율 변화 보기'));renderInstitutionActivity(ownershipDetail,institutionActivity(snapshots.at(-2),current),snapshots.some(snapshot=>(snapshot.coverage_reason_codes||[]).includes('SOURCE_REPORTING_THRESHOLD')));detail.append(ownershipDetail);
    const label=node('label','fund-search-label','공시 종목 검색'),input=node('input');input.type='search';input.placeholder='종목명 검색';input.setAttribute('aria-label',institution.name+' 공시 종목 검색');label.append(input);detail.append(label);
    const count=node('p','muted-note'),tables=node('div','fund-tables'),more=node('button','secondary-button','20개 더 보기');more.type='button';let shown=20;
    const controls=fundChangeControls(detail,!weightActivity.available_count,()=>{shown=20;render();},false,'0.01');
    const render=()=>{const matching=current.rows.filter((row)=>row.name.toLowerCase().includes(input.value.trim().toLowerCase())),filtered=fundFilterRows(matching,changes,controls.select.value,controls.checkbox.checked,false,0.01);
      tables.replaceChildren();renderInstitutionRows(tables,filtered.slice(0,shown),changes);count.textContent='확보 '+current.rows.length+'개 · 검색 '+matching.length+'개 · 변화 필터 후 '+filtered.length+'개 · 현재 '+Math.min(shown,filtered.length)+'개 표시';more.hidden=shown>=filtered.length;
      if(!filtered.length)tables.append(node('p','muted-note','조건에 맞는 종목이 없습니다.'));};
    input.addEventListener('input',()=>{shown=20;render();});more.addEventListener('click',()=>{shown+=20;render();});
    detail.append(count,node('p','muted-note','비중 차이는 %p이며 가격 변동·환율·자산군 규모 변화를 포함할 수 있습니다. 실제 매수·매도를 확인한 자료가 아닙니다.'),tables,more);render();section.append(detail);
  });return section;
}
window.ZEROFunds={loadBenchmark:loadFundBenchmark,section:fundSection,institutions:institutionSection};
if(fund$('tqqq-panel'))loadFundBenchmark();
// A refresh on the main screen fetched new quotes: reprice the already loaded TQQQ comparison with them.
document.addEventListener?.('zero-live-quotes',()=>{if(fundUI.benchmark)renderFundBenchmark(fundUI.benchmark);});
if(fund$('institution-panel'))institutionSection().then((section)=>fund$('institution-panel')?.replaceChildren(section)).catch(()=>{fund$('institution-panel')?.replaceChildren(node('p','muted-note','국민연금 연간 공시 자료를 표시하지 못했습니다.'));});
