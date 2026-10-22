'use strict';
// Public desk data has no order or allocation authority.
const researchDesk = {data: null, annual: null, promise: null, failed: false, candle: null, loadedAt: 0};
const desk$ = (id) => document.getElementById(id);
const deskNum = (value) => value === null || value === undefined || value === '' ? NaN : Number(value);
const deskText = (value, fallback = '근거 없음') => typeof value === 'string' && value.trim() ? value : fallback;
function deskExact(value) {
  const text = String(value ?? '');
  if (!/^-?\d+(\.\d+)?$/.test(text) || !Number.isFinite(Number(text))) return '근거 없음';
  const parts = text.split('.');
  const fraction = (parts[1] || '').replace(/0+$/, '');
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
}
function deskLink(label, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')
      || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || /(^|\.)localhost$|\.local$/i.test(url.hostname)) throw Error();
    const link = node('a', 'research-link', label); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  } catch (_) { return node('span', 'muted-note', label + ' · 공개 출처 미확인'); }
}
function deskFields(container, rows, className = 'desk-metrics') {
  const list = node('dl', className);
  rows.forEach(([label, value]) => { const group = node('div'); group.append(node('dt', '', label), node('dd', '', value)); list.append(group); });
  container.append(list);
}

// 한국어와 영어, 숫자 외 외래 문자 정제
function cleanDeskText(text, fallback = '근거 없음') {
  if (typeof text !== 'string' || !text.trim()) return fallback;
  let cleaned = text.replace(/[^\uAC00-\uD7A3\u3131-\u3163\u1100-\u11FFA-Za-z0-9\s.,!?'"~:;\(\)\[\]\/\-–—+%·\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/gu, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

// 5개 단위 직관적 페이징 UI 생성
const DESK_PAGE_SIZE = 5;
let macroCurrentPage = 1, newsCurrentPage = 1;

function renderDeskPagination(container, totalItems, pageSize, currentPage, onPageChange) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return;
  const nav = node('nav', 'desk-pagination');
  nav.setAttribute('aria-label', '페이지 이동');

  const prev = node('button', '', '‹ 이전');
  prev.type = 'button';
  prev.disabled = currentPage <= 1;
  prev.addEventListener('click', () => onPageChange(currentPage - 1));
  nav.append(prev);

  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);

  for (let p = startPage; p <= endPage; p++) {
    const btn = node('button', p === currentPage ? 'active' : '', String(p));
    btn.type = 'button';
    if (p === currentPage) btn.setAttribute('aria-current', 'page');
    const target = p;
    btn.addEventListener('click', () => onPageChange(target));
    nav.append(btn);
  }

  const next = node('button', '', '다음 ›');
  next.type = 'button';
  next.disabled = currentPage >= totalPages;
  next.addEventListener('click', () => onPageChange(currentPage + 1));
  nav.append(next);

  const info = node('span', 'page-indicator', currentPage + ' / ' + totalPages + ' (' + totalItems + '건)');
  nav.append(info);
  container.append(nav);
}
function deskNotes(container, items) {
  if (!Array.isArray(items) || !items.length) return;
  const detail = node('details', 'desk-details'); detail.append(node('summary', '', '자료의 범위와 한계'));
  const list = node('ul'); items.forEach((item) => list.append(node('li', '', deskText(item)))); detail.append(list); container.append(detail);
}
function deskChips(labels) {
  const row = node('div', 'desk-fact-chips'); labels.forEach((label) => row.append(node('span', '', label))); return row;
}
function deskRefreshNote() {
  const check = researchDesk.data?.refresh;
  if (!check) return '';
  if (check.state === 'UPDATING') return ' · 공식 공개 자료 확인 중 · 기존 자료를 먼저 표시합니다.';
  return ' · 자동 확인 ' + (check.checked_at ? stamp(check.checked_at) + ' KST' : '미완료') + (check.failed?.length ? ' · 일부 출처 실패, 기존 값·시각 유지' : ' · 15분 주기') + ' · 발표 전 수치는 바뀌지 않습니다.';
}
function updateDeskDataStatus() {
  const data = researchDesk.data;
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const recorded = data?.generated_at && Number.isFinite(Date.parse(data.generated_at))
    ? new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(data.generated_at)) : null;
  const base = data ? '자료 묶음 기록 ' + stamp(data.generated_at) + ' KST · 개별 관측일과 발표일은 아래에 표시합니다.' : '확인된 자료가 없습니다. 다시 불러오기를 눌러 주세요.';
  const old = recorded && recorded !== today ? ' 기록 날짜가 오늘과 다릅니다. 현재 시점의 실시간 자료로 해석하지 마세요.' : '';
  ['study-data-status', 'macro-data-status', 'news-data-status'].forEach((id) => {
    const element = desk$(id); if (!element) return;
    element.textContent = (researchDesk.failed ? '최근 불러오기 실패 · ' : '') + base + old + deskRefreshNote();
    element.classList.toggle('desk-stale', Boolean(old || researchDesk.failed));
  });
  researchDesk.onStatus?.();
}
async function loadDesk(force = false) {
  if (researchDesk.promise) return researchDesk.promise;
  if (researchDesk.data && !force && Date.now() - researchDesk.loadedAt < 60000) return researchDesk.data;
  document.querySelectorAll('[data-desk-reload]').forEach((button) => { button.disabled = true; });
  ['study-data-status','macro-data-status','news-data-status'].forEach((id) => { if (desk$(id)) desk$(id).textContent = '공개 자료를 불러오는 중입니다.'; });
  researchDesk.promise = (async () => {
    const response = await fetch('api/desk', {cache: 'no-store'});
    if (!response.ok) throw Error('DESK_UNAVAILABLE');
    const data = await response.json();
    if (data.scope !== 'PUBLIC_RESEARCH_DESK' || data.authority !== 'PUBLIC_EDUCATION_AND_RESEARCH'
      || data.orders_authorized !== false || data.allocation_changes_authorized !== false
      || !['companies','macro','news','charts'].every((key) => Array.isArray(data[key]))) throw Error('DESK_INVALID');
    const changed = JSON.stringify(data) !== JSON.stringify(researchDesk.data);
    researchDesk.data = data; researchDesk.failed = false; researchDesk.loadedAt = Date.now();
    try { researchDesk.annual = await window.ZEROResearch?.load(force); } catch (_) { researchDesk.annual = null; }
    if (changed || force) renderDesk(); else updateDeskDataStatus();
    return data;
  })().catch(() => { researchDesk.failed = true; renderDesk(); return null; })
    .finally(() => { researchDesk.promise = null; document.querySelectorAll('[data-desk-reload]').forEach((button) => { button.disabled = false; }); });
  return researchDesk.promise;
}
function deskCleanBars(bars, now = Date.now()) {
  const dates = new Map();
  (Array.isArray(bars) ? bars : []).forEach((bar) => {
    const time = Date.parse(bar.at);
    const prices = ['open','high','low','close'].map((key) => deskNum(bar[key]));
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(String(bar.at)) || !Number.isFinite(time) || time > now
      || prices.some((value) => !Number.isFinite(value) || value <= 0)
      || prices[1] < Math.max(prices[0], prices[3]) || prices[2] > Math.min(prices[0], prices[3]) || prices[1] < prices[2]) return;
    const volume = deskNum(bar.volume);
    dates.set(time, {at: bar.at, open: prices[0], high: prices[1], low: prices[2], close: prices[3], volume: Number.isFinite(volume) && volume >= 0 ? volume : null});
  });
  return Array.from(dates.entries()).sort((a,b) => a[0]-b[0]).map((entry) => entry[1]);
}
function deskAggregateBars(bars, minutes, market) {
  const formatter = new Intl.DateTimeFormat('en-CA', {timeZone: market === 'US' ? 'America/New_York' : 'Asia/Seoul', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const groups = new Map();
  [...bars].sort((a,b) => Date.parse(a.at)-Date.parse(b.at)).forEach((bar) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(bar.at)).map((part) => [part.type,part.value]));
    const minute = Number(parts.hour)*60+Number(parts.minute), session = market === 'US' ? 570 : 540;
    const key = parts.year+'-'+parts.month+'-'+parts.day+':'+Math.floor((minute-session)/minutes);
    const previous = groups.get(key);
    if (!previous) groups.set(key, {...bar, count:1, last_at:bar.at});
    else { previous.high=Math.max(previous.high,bar.high); previous.low=Math.min(previous.low,bar.low); previous.close=bar.close; previous.volume=previous.volume===null||bar.volume===null?null:previous.volume+bar.volume; previous.count++; previous.last_at=bar.at; }
  });
  return Array.from(groups.values());
}
function deskMovingAverage(bars, period) {
  let sum=0;
  return bars.map((bar,index) => { sum+=bar.close; if(index>=period)sum-=bars[index-period].close; return index+1>=period?sum/period:null; });
}
function deskLearningBars(interval) {
  const start=Date.UTC(2024,0,2,0,0), step=interval==='1d'?86400000:60000;
  return Array.from({length:100},(_,index)=>{const open=100+index*.25+Math.sin(index*.4)*4,close=open+Math.sin(index*.7)*2;return {at:new Date(start+index*step).toISOString(),open,high:Math.max(open,close)+1.5,low:Math.min(open,close)-1.2,close,volume:1000+index*10};});
}
function deskSVG(tag, attributes = {}, text) {
  const element=document.createElementNS('http://www.w3.org/2000/svg',tag);
  Object.entries(attributes).forEach(([key,value])=>element.setAttribute(key,String(value)));
  if(text!==undefined)element.textContent=String(text); return element;
}
function deskAxisLeft(low, high) {
  // Reserve space for the complete 16px mobile tick, including decimals and signs.
  const longest=Math.max(...Array.from({length:5},(_,index)=>format(high-(high-low)*index/4,2).length));
  return Math.max(76,longest*10+16);
}
function deskPriceTick(at, interval, narrow) {
  if(!narrow)return stamp(at,true);
  const options=interval==='1d'?{month:'2-digit',day:'2-digit'}:{hour:'2-digit',minute:'2-digit',hourCycle:'h23'};
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',...options}).formatToParts(new Date(at)).map((part)=>[part.type,part.value]));
  return interval==='1d'?parts.month+'.'+parts.day:parts.hour+':'+parts.minute;
}
function deskAxes(svg, low, high, width, height, left, top, bottom) {
  for(let index=0;index<5;index++){const y=top+(height-top-bottom)*index/4,value=high-(high-low)*index/4;
    svg.append(deskSVG('line',{x1:left,y1:y,x2:width-12,y2:y,class:'desk-gridline'}),deskSVG('text',{x:left-8,y:y+4,'text-anchor':'end',class:'desk-axis'},format(value,2)));}
}
function deskReadCandle(bars, index, currency, learning) {
  const bar=bars[index]; if(!bar||!desk$('study-candle-reading'))return;
  desk$('study-candle-reading').textContent=(learning?'학습용 시각 ':'' )+stamp(bar.at)+' KST · 시가 '+format(bar.open,2)+' · 고가 '+format(bar.high,2)+' · 저가 '+format(bar.low,2)+' · 종가 '+format(bar.close,2)+' '+currency+' · 거래량 '+(bar.volume===null?'근거 없음':format(bar.volume))+(bar.count?' · 포함된 1분 봉 '+bar.count+'개':'');
  document.querySelectorAll('#study-price-chart [data-bar-index]').forEach((element)=>element.classList.toggle('desk-candle-selected',Number(element.dataset.barIndex)===index));
}
function renderStudyChart() {
  const container=desk$('study-price-chart'); if(!container)return;container.replaceChildren();
  const id=desk$('study-company').value, interval=desk$('study-interval').value, learning=desk$('study-learning').checked;
  const baseInterval=interval==='1d'?'1d':'1m';
  const record=researchDesk.data?.charts.find((chart)=>chart.id===id&&chart.interval===baseInterval);
  let all=learning?deskLearningBars(baseInterval):deskCleanBars(record?.bars);
  if(interval==='10m'||interval==='60m')all=deskAggregateBars(all,Number(interval.slice(0,-1)),record?.market||id.split(':')[0]);
  const chartWidth=Math.max(320,Math.min(920,container.clientWidth||920));
  const bars=all.slice(chartWidth<560?-60:-100),offset=all.length-bars.length,currency=learning?'학습 단위':deskText(record?.currency,'통화 미확인');
  const caption=desk$('study-chart-status'), range=desk$('study-candle-index');
  range.disabled=!bars.length; range.max=String(Math.max(0,bars.length-1)); range.value=String(Math.max(0,bars.length-1));
  researchDesk.candle={bars,currency,learning};
  if(!bars.length){container.append(node('p','chart-empty','선택한 종목·주기의 가격 근거 없음. 공개 제공자 자료를 다시 불러오거나 학습용 그래프를 직접 켜 주세요.'));caption.textContent='가격 이력 없음 · 값이나 봉을 만들어 실제 자료로 표시하지 않습니다.';desk$('study-candle-reading').textContent='읽을 가격 근거 없음';return;}
  caption.replaceChildren(node('span','',learning?'학습용으로 만든 그래프 · 실제 종목 가격과 무관 · 단위도 학습 단위입니다.':'제공자 OHLC · 액면분할·배당 독립 보정 미검증 · 확인 '+stamp(record.retrieved_at)+' KST'));
  if(!learning&&record?.source_url)caption.append(deskLink('가격 출처',record.source_url));
  caption.append(node('span','','표시 '+stamp(bars[0].at)+' ~ '+stamp(bars[bars.length-1].last_at||bars[bars.length-1].at)+' KST · '+bars.length+'개 관측 봉'+(baseInterval==='1m'&&interval!=='1m'?' · 1분 자료를 거래일별 정규장 시작 기준으로 합산 · 빠진 분은 채우지 않으며 불완전 구간이 포함될 수 있습니다.':'')));
  const averages=baseInterval==='1d'?[5,20,60].filter((period)=>desk$('study-ma-'+period).checked).map((period)=>({period,values:deskMovingAverage(all,period).slice(offset),color:{5:'#2866c7',20:'#19766a',60:'#ad7832'}[period]})):[];
  const values=bars.flatMap((bar)=>[bar.low,bar.high]).concat(averages.flatMap((entry)=>entry.values.filter((value)=>value!==null)));
  let low=Math.min(...values),high=Math.max(...values);const pad=(high-low||high*.01)*.08;low-=pad;high+=pad;
  const width=chartWidth,height=330,left=deskAxisLeft(low,high),top=16,bottom=46,plot=width-left-12,step=plot/bars.length;
  const y=(price)=>top+(high-price)/(high-low)*(height-top-bottom),x=(index)=>left+step*(index+.5);
  const svg=deskSVG('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-labelledby':'study-svg-title study-svg-desc'});
  svg.append(deskSVG('title',{id:'study-svg-title'},(learning?'학습용 ':desk$('study-company').selectedOptions[0].textContent+' ')+interval+' 캔들 차트'),deskSVG('desc',{id:'study-svg-desc'},'몸통은 시가와 종가, 꼬리는 고가와 저가입니다. 빨강은 종가가 시가 이상, 파랑은 시가 미만입니다. 아래 봉 선택 슬라이더에서 방향키로 각 봉의 정확한 값을 읽을 수 있습니다.'));
  deskAxes(svg,low,high,width,height,left,top,bottom);
  bars.forEach((bar,index)=>{const group=deskSVG('g',{'data-bar-index':index,class:bar.close>=bar.open?'desk-candle-up':'desk-candle-down'});
    group.append(deskSVG('title',{},stamp(bar.at)+' · 시가 '+format(bar.open,2)+' · 고가 '+format(bar.high,2)+' · 저가 '+format(bar.low,2)+' · 종가 '+format(bar.close,2)));
    group.append(deskSVG('line',{x1:x(index),x2:x(index),y1:y(bar.high),y2:y(bar.low)}),deskSVG('rect',{x:x(index)-Math.max(1,step*.3),y:Math.min(y(bar.open),y(bar.close)),width:Math.max(2,step*.6),height:Math.max(2,Math.abs(y(bar.open)-y(bar.close)))}));
    group.addEventListener('pointerenter',()=>{range.value=String(index);deskReadCandle(bars,index,currency,learning);});
    group.addEventListener('click',()=>{range.value=String(index);deskReadCandle(bars,index,currency,learning);});svg.append(group);});
  averages.forEach((entry)=>{const points=entry.values.map((value,index)=>value===null?null:x(index)+','+y(value)).filter(Boolean);if(points.length)svg.append(deskSVG('polyline',{points:points.join(' '),fill:'none',stroke:entry.color,'stroke-width':2,'aria-label':entry.period+'일 이동평균'}));});
  svg.append(deskSVG('text',{x:left,y:height-12,class:'desk-axis'},deskPriceTick(bars[0].at,baseInterval,chartWidth<560)),deskSVG('text',{x:width-12,y:height-12,'text-anchor':'end',class:'desk-axis'},deskPriceTick(bars[bars.length-1].at,baseInterval,chartWidth<560)));
  container.append(svg);deskReadCandle(bars,bars.length-1,currency,learning);
  document.dispatchEvent(new CustomEvent('zero-desk-rendered'));
  desk$('study-ma-note').textContent=baseInterval==='1d'?'일봉 종가의 최근 5·20·60개 관측 평균입니다. 각 시점 이전 봉만 사용하며 필요한 관측 수가 없으면 선을 표시하지 않습니다.':'이동평균 설명은 일봉에서 확인합니다. 분봉은 짧은 기간의 흐름과 잡음을 보여 줍니다.';
}
function renderStudyCompany() {
  const container=desk$('study-company-evidence');if(!container)return;container.replaceChildren();
  const id=desk$('study-company').value,company=researchDesk.data?.companies.find((item)=>item.id===id);
  const annual=researchDesk.annual?.companies?.find((item)=>item.id===id||item.symbols?.some((symbol)=>item.market+':'+symbol===id));
  container.append(node('h3','','선택한 실제 회사의 확인 자료'));
  if(!company&&!annual){container.append(node('p','muted-note','이 회사의 공개 재무·비율 근거 없음. 아래 학습용 회사의 숫자와 섞어 해석하지 마세요.'));return;}
  container.append(node('p','muted-note',(company?.name||annual?.name||id)+' · '+id+' · '+(company?.industry||annual?.industry||'업종 미확인')));
  const financial=annual?.financials||{},ratios=company?.ratios||{};
  const amount=(value)=>Number.isFinite(deskNum(value))?deskExact(value)+' '+(financial.currency||'통화 미확인'):'근거 없음';
  deskFields(container,[['연간 매출',amount(financial.revenue)],['연간 영업이익',amount(financial.operating_income)],['제공자 PER',deskExact(ratios.per)],['제공자 PBR',deskExact(ratios.pbr)],['제공자 PSR',deskExact(ratios.psr)],['실제 EPS·BPS·ROE','분모·기간 근거 없음 · 계산 보류']]);
  container.append(node('p','muted-note','연간 실적 기간 종료 '+(financial.period_end||'근거 없음')+' · 연간/최근 12개월 값은 혼합하지 않습니다. 제공자 현재 비율의 계산 기준일과 EPS 기간은 미검증입니다. 기업 전체가 독립 분석·검증된 것으로 해석하지 않습니다.'));
  if(financial.source_url)container.append(deskLink('연간 재무 출처',financial.source_url));
  if(company?.quarterly_margins?.length){const detail=node('details','desk-details');detail.append(node('summary','','분기별 순이익률·성장률 보기'));company.quarterly_margins.forEach((row)=>detail.append(node('p','muted-note',row.period+' · 순이익률 '+(Number.isFinite(deskNum(row.net_margin_percent))?deskExact(row.net_margin_percent)+'%':'근거 없음')+' · 순이익 성장률 '+(Number.isFinite(deskNum(row.net_profit_growth_percent))?deskExact(row.net_profit_growth_percent)+'%':'근거 없음'))));detail.append(node('p','muted-note','이익이 적자에서 흑자로 바뀌거나 이전 이익이 0·음수이면 성장률의 해석과 산식을 별도로 확인합니다.'));container.append(detail);}
  const sourceGroups=new Map();(company?.sources||[]).forEach((item)=>{const key=item.label+'|'+String(item.retrieved_at).slice(0,16);if(!sourceGroups.has(key))sourceGroups.set(key,[]);sourceGroups.get(key).push(item);});
  sourceGroups.forEach((group)=>{const item=group[0],p=node('p','desk-source');p.append(deskLink(item.label||'기업 자료 출처',item.url),node('span','muted-note','확인 '+stamp(item.retrieved_at)+' KST'));if(group.length>1){const more=node('details','source-more');more.append(node('summary','','같은 출처 '+(group.length-1)+'건 더 보기'));group.slice(1).forEach((entry,index)=>{const row=node('p');row.append(deskLink((entry.label||'기업 자료 출처')+' '+(index+2),entry.url));more.append(row);});p.append(more);}container.append(p);});
  deskNotes(container,company?.limitations);
}
function deskCalculateExample() {
  if(!desk$('study-price'))return;
  const price=deskNum(desk$('study-price').value),eps=deskNum(desk$('study-eps').value),bps=deskNum(desk$('study-bps').value),profit=deskNum(desk$('study-profit').value),equity=deskNum(desk$('study-equity').value);
  desk$('study-per-result').textContent=price>0&&eps>0?format(price/eps,4)+'배':'계산 보류 · 주가·EPS 양수 필요';
  desk$('study-pbr-result').textContent=price>0&&bps>0?format(price/bps,4)+'배':'계산 보류 · 주가·BPS 양수 필요';
  desk$('study-roe-result').textContent=Number.isFinite(profit)&&equity>0?format(profit/equity*100,4)+'%':'계산 보류 · 평균 자기자본 양수 필요';
}
function deskHistorySVG(history, title) {
  const points=(Array.isArray(history)?history:[]).filter((row)=>Number.isFinite(deskNum(row.value))&&typeof row.period==='string').slice().sort((a,b)=>a.period.localeCompare(b.period));
  if(!points.length)return node('p','chart-empty','이 지수의 이력 근거 없음');
  const width=window.innerWidth<560?Math.max(300,window.innerWidth-80):700,height=210,top=16,bottom=36,values=points.map((row)=>Number(row.value));
  let low=Math.min(...values),high=Math.max(...values);const pad=(high-low||Math.abs(high)*.01||1)*.1;low-=pad;high+=pad;
  const left=deskAxisLeft(low,high);
  const x=(index)=>left+(width-left-12)*(points.length===1?.5:index/(points.length-1)),y=(value)=>top+(high-value)/(high-low)*(height-top-bottom);
  const svg=deskSVG('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':title+' 실제 관측 이력, '+points[0].period+'부터 '+points[points.length-1].period+'까지 '+points.length+'개'});
  svg.append(deskSVG('title',{},title+' 실제 관측 이력'),deskSVG('desc',{},'공개 자료의 관측값만 표시합니다. 관측점 사이 연결은 중간 시점의 값을 추정한 것이 아닙니다.'));
  deskAxes(svg,low,high,width,height,left,top,bottom);
  if(points.length>1)svg.append(deskSVG('polyline',{points:points.map((row,index)=>x(index)+','+y(Number(row.value))).join(' '),fill:'none',stroke:'#2866c7','stroke-width':2}));
  else svg.append(deskSVG('circle',{cx:x(0),cy:y(values[0]),r:4,fill:'#2866c7'}));
  svg.append(deskSVG('text',{x:left,y:height-10,class:'desk-axis'},points[0].period),deskSVG('text',{x:width-12,y:height-10,class:'desk-axis','text-anchor':'end'},points[points.length-1].period));return svg;
}
function deskControl(id, fallback = '') { return desk$(id)?.value ?? fallback; }
function deskMacroCategory(item) {
  if (/PAYROLL|EMPLOYMENT|UNEMPLOYMENT|WAGES/.test(item.id)) return 'EMPLOYMENT';
  if (/CPI|PPI|PCE/.test(item.id)) return 'INFLATION';
  return /VIX|DGS/.test(item.id) ? 'MARKETS' : 'ACTIVITY';
}
function deskFilterMacro(items, search = '', country = 'ALL', category = 'ALL') {
  const query = search.trim().toLowerCase();
  return items.filter((item) => (country === 'ALL' || item.country === country)
    && (category === 'ALL' || deskMacroCategory(item) === category)
    && (item.name + ' ' + item.id + ' ' + item.basis).toLowerCase().includes(query));
}
function renderMacro() {
  const container = desk$('macro-list'); if (!container) return; container.replaceChildren();
  const value = (number) => Number.isFinite(deskNum(number)) ? format(number, 3) : '근거 없음';
  const rows = deskFilterMacro(researchDesk.data?.macro || [], deskControl('macro-search'), deskControl('macro-country', 'ALL'), deskControl('macro-category', 'ALL'));
  if (desk$('macro-empty')) desk$('macro-empty').hidden = rows.length > 0;
  if (desk$('macro-count')) desk$('macro-count').textContent = '📊 ' + rows.length + '개 지표 · 눌러서 자세히';
  
  const totalPages = Math.ceil(rows.length / DESK_PAGE_SIZE);
  if (macroCurrentPage > totalPages && totalPages > 0) macroCurrentPage = 1;
  const start = (macroCurrentPage - 1) * DESK_PAGE_SIZE;
  const pageRows = rows.slice(start, start + DESK_PAGE_SIZE);

  pageRows.forEach((item) => {
    const card = node('details', 'desk-indicator'), summary = node('summary', 'desk-indicator-summary'); card.dataset.id = item.id;
    const heading = node('span', 'desk-indicator-heading'), values = node('span', 'desk-indicator-values');
    const cleanName = cleanDeskText(item.name);
    heading.append(node('strong', '', cleanName), node('span', 'muted-note', ({US:'미국', KR:'한국', GLOBAL:'세계'}[item.country] || item.country) + ' · 관측 ' + deskText(item.latest_period, '날짜 미확인')));
    values.append(node('strong', '', value(item.latest_value) + ' ' + deskText(item.unit, '단위 미확인')), node('span', 'muted-note', '직전 ' + value(item.previous_value) + ' ' + deskText(item.unit, '')));
    summary.append(heading, values); card.append(summary);
    const body = node('div', 'desk-indicator-body');
    body.append(deskChips(['📅 ' + ({MONTHLY:'월간', QUARTERLY:'분기', DAILY:'일간'}[item.frequency] || '주기 미확인'), '🔧 ' + ({SA:'계절조정', NSA:'계절조정 안 함', NOT_APPLICABLE:'계절조정 해당 없음', UNVERIFIED:'계절조정 미검증'}[item.seasonal_adjustment] || '계절조정 미확인'), '📐 ' + deskText(item.basis)]), node('p', '', cleanDeskText(item.explanation)), deskHistorySVG(item.history, cleanName));
    const statistics = item.statistics || {}, notes = ['관측 대상 기간과 발표일·조회일은 다릅니다. 발표 후 수정될 수 있으며 최신 수정값은 당시 알 수 있었던 값과 다를 수 있습니다.'];
    let zone = null;
    if (statistics.available) {
      const distribution = node('details', 'desk-details desk-statistics'); distribution.append(node('summary', '', '과거 평균·중앙값·범위'));
      deskFields(distribution, [['평균', value(statistics.mean)], ['중앙값', value(statistics.median)], ['하위 25% 경계', value(statistics.p25)], ['상위 25% 경계', value(statistics.p75)], ['실제 표본 수', deskExact(statistics.sample_count)], ['확보한 표본 기간', deskText(statistics.start_period) + ' ~ ' + deskText(statistics.end_period)]]);
      notes.push('과거 분포는 최근 ' + statistics.window_years + '년 요청 창에서 실제 확보한 표본입니다. 모든 지표에 10년 이력이 있다는 뜻은 아닙니다. 분위수는 선형 보간 Type 7이며 표시값만 소수 셋째 자리까지 반올림합니다.'); body.append(distribution);
      const latest = deskNum(item.latest_value), p25 = deskNum(statistics.p25), p75 = deskNum(statistics.p75);
      if (Number.isFinite(latest) && Number.isFinite(p25) && Number.isFinite(p75)) zone = latest < p25 ? 'LOW' : latest > p75 ? 'HIGH' : 'MID';
      body.append(node('p', 'desk-range', {LOW: '과거 표본의 하위 25% 경계보다 낮습니다.', HIGH: '과거 표본의 상위 25% 경계보다 높습니다.', MID: '과거 표본의 가운데 50% 범위에 있습니다.'}[zone] || '분포 위치 근거 없음'));
    } else body.append(node('p', 'muted-note', '장기 분포 통계 근거 없음 · 누락된 이력을 추정해 채우지 않습니다.'));
    const meaning = node('div', 'desk-meaning'), cards = node('div', 'desk-meaning-cards');
    [['HIGH', '⬆️ 높을 때', item.above_range], ['LOW', '⬇️ 낮을 때', item.below_range]].forEach(([key, label, text]) => {
      const card = node('div', 'desk-meaning-card' + (zone === key ? ' desk-meaning-now' : '')), head = node('strong', '', label);
      if (zone === key) head.append(node('span', 'desk-meaning-badge', '👉 지금'));
      card.append(head, node('p', '', deskText(text))); cards.append(card);
    });
    meaning.append(node('p', 'desk-meaning-title', '🤔 높거나 낮으면 무엇을 확인할까?'), cards, node('p', 'muted-note', '과거 범위는 설명을 위한 배경이며 매매 기준이나 미래 전망이 아닙니다.')); body.append(meaning);
    body.append(deskChips(['🗓️ 발표 ' + deskText(item.last_release_date, '미확인'), '🔄 확인 ' + stamp(item.retrieved_at) + ' KST'].concat(item.next_release_kst ? ['⏭️ 다음 발표 ' + stamp(item.next_release_kst) + ' KST · 변경 가능'] : [])));
    const links = node('p', 'desk-source'); if (item.source_url) links.append(deskLink('통계 원문', item.source_url)); if (item.release_url) links.append(deskLink('발표 일정·원문', item.release_url)); body.append(links);
    deskNotes(body, notes.concat(Array.isArray(item.limitations) ? item.limitations : [])); card.append(body); container.append(card);
  });

  renderDeskPagination(container, rows.length, DESK_PAGE_SIZE, macroCurrentPage, (p) => {
    macroCurrentPage = p;
    renderMacro();
    container.scrollIntoView?.({behavior: 'smooth', block: 'nearest'});
  });
  document.dispatchEvent(new CustomEvent('zero-macro-rendered'));
}
function deskInstitution(source) {
  const id = source.id || source.source_id || '';
  return id.startsWith('bok-') ? 'BOK' : id.startsWith('fed-') ? 'FED' : id.startsWith('bis-') ? 'BIS' : id.startsWith('toss-') ? 'TOSS' : 'OTHER';
}
function deskReportKind(kind) {
  return /EDUCATION/.test(kind || '') ? 'EDUCATION' : kind === 'POLICY_RELEASE' ? 'POLICY_RELEASE' : 'MACRO_RESEARCH';
}
function deskSourceLibraryValid(library) {
  // Index metadata is a reading queue, never proof of a completed source review.
  return library?.schema_version === 1 && library.learning_authority === 'SOURCE_REVIEW_ONLY'
    && library.model_training === false && library.orders === false && library.full_text_review_count === 0
    && Array.isArray(library.sources) && Array.isArray(library.review_candidates);
}
function deskReportRows(library, query = '', institution = 'ALL', kind = 'ALL', sort = 'NEWEST') {
  if (!deskSourceLibraryValid(library)) return [];
  const search = query.trim().toLowerCase(), records = new Map();
  library.sources.forEach((source) => (Array.isArray(source.records) ? source.records : []).forEach((record) => {
    if (record.access !== 'INDEX_ONLY' || !record.id || records.has(record.id)) return;
    const row = {...record, source};
    if ((institution === 'ALL' || deskInstitution(source) === institution)
      && (kind === 'ALL' || deskReportKind(record.kind || source.kind) === kind)
      && (deskText(record.title, '') + ' ' + source.label).toLowerCase().includes(search)) records.set(record.id, row);
  }));
  const date = (record) => Date.parse(record.published_at || record.published_date || '') || 0;
  return Array.from(records.values()).sort((a, b) => {
    // Unknown publication dates stay last in either direction; check time is not publication time.
    const first = date(a), second = date(b); if (!first || !second) return first ? -1 : second ? 1 : a.id.localeCompare(b.id);
    return (sort === 'OLDEST' ? first - second : second - first) || a.id.localeCompare(b.id);
  });
}
function deskPublication(record) { return record.published_at ? stamp(record.published_at) + ' KST' : deskText(record.published_date, '발표일 미확인') + (record.published_date ? ' · 발표 시각 미확인' : ''); }
function deskNewsBody(item) {
  const body = node('div', 'desk-news-body');
  if (Array.isArray(item.core_sentences) && item.core_sentences.length === 5) {
    const list = node('ol', 'desk-news-core'); item.core_sentences.forEach((text, index) => {
      const row = node('li'); row.append(node('span', 'desk-sentence-type', index < 3 ? '사실 요약 · 원문 대조' : index === 3 ? '영향 경로 · 해석' : '다음 확인'), node('p', '', text)); list.append(row);
    }); body.append(list);
  } else body.append(node('p', 'muted-note', '확인된 다섯 문장 요약이 없습니다.'));
  const glossary = node('details', 'desk-details'); glossary.append(node('summary', '', '경제 용어 쉽게 읽기'));
  const terms = node('dl', 'desk-glossary'); (item.glossary || []).forEach((entry) => terms.append(node('dt', '', entry.term), node('dd', '', entry.meaning + (entry.example ? ' 예: ' + entry.example : '')))); glossary.append(terms); if (item.glossary?.length) body.append(glossary);
  const scenarios = node('details', 'desk-details'); scenarios.append(node('summary', '', '앞으로 확인할 세 가지 조건'));
  ['base', 'worse', 'better'].forEach((key) => {
    const scenario = item.scenarios?.[key]; if (!scenario) return; const section = node('section', 'desk-scenario');
    section.append(node('h4', '', {base:'기본 조건', worse:'부담이 커지는 조건', better:'여건이 나아지는 조건'}[key]), node('p', 'muted-note', '기간 ' + deskText(scenario.timeframe) + ' · 전제 ' + deskText(scenario.premise)), node('p', '', deskText(scenario.text))); scenarios.append(section);
  }); scenarios.append(node('p', 'muted-note', '발생 확률이나 확정 예측이 아닙니다. 뒤에 확인된 사실과 전제를 함께 대조합니다.')); body.append(scenarios);
  const sources = node('div', 'desk-news-sources'); (item.sources || []).forEach((entry) => {
    const row = node('p', 'desk-source'); row.append(deskLink(entry.label || '원문', entry.url), node('span', 'muted-note', '확인 ' + stamp(entry.retrieved_at) + ' KST')); sources.append(row);
  }); body.append(sources); deskNotes(body, item.limitations); return body;
}
function deskReviewedInstitution(item) {
  const hosts = (item.sources || []).map((source) => { try { return new URL(source.url).hostname; } catch (_) { return ''; } });
  return hosts.some((host) => /(^|\.)bok\.or\.kr$/.test(host)) ? 'BOK' : hosts.some((host) => /(^|\.)federalreserve\.gov$/.test(host)) ? 'FED' : hosts.some((host) => /(^|\.)bis\.org$/.test(host)) ? 'BIS' : hosts.some((host) => /(^|\.)toss\.im$|(^|\.)tossinvest\.com$/.test(host)) ? 'TOSS' : 'OTHER';
}
function renderBriefingSources() {
  const container = desk$('source-library-list'), status = desk$('source-library-status'); if (!container || !status) return; container.replaceChildren();
  const library = researchDesk.data?.briefing_sources;
  if (!deskSourceLibraryValid(library)) { status.textContent = '보고서 목록을 확인하지 못했습니다. 자료 다시 불러오기로 확인해 주세요.'; return; }
  const institution = deskControl('report-institution', 'ALL'), kind = deskControl('report-kind', 'ALL'), search = deskControl('report-search');
  const rows = deskReportRows(library, search, institution, kind, deskControl('report-sort', 'NEWEST'));
  const failed = library.sources.filter((source) => source.status === 'FAILED' || source.error_code).length;
  status.textContent = '목록 확인 ' + stamp(library.as_of) + ' KST · 출처 ' + library.sources.length + '곳' + (failed ? ' · 조회 실패 ' + failed + '곳' : '') + ' · 목록 항목은 본문 검토 전입니다.' + deskRefreshNote();
  if (desk$('report-count')) desk$('report-count').textContent = rows.length + '개 자료 · 제목을 눌러 발표일·출처·확인 범위 보기';
  if (desk$('report-empty')) desk$('report-empty').hidden = rows.length > 0;
  const highlights = (researchDesk.data?.news || []).filter((item) => (institution === 'ALL' || deskReviewedInstitution(item) === institution)
    && (item.title + ' ' + item.category).toLowerCase().includes(search.toLowerCase()));
  if (highlights.length && kind === 'ALL') {
    const reviewed = node('details', 'desk-reviewed-section'); reviewed.append(node('summary', '', '화면에서 읽는 확인 요약'), node('p', 'muted-note', '원문에서 확인한 짧은 요약입니다. 아래 수집 목록 전체를 검토했다는 뜻은 아닙니다.'));
    highlights.filter((item) => deskReviewedInstitution(item) !== 'OTHER').forEach((item) => { const detail = node('details', 'desk-reviewed-item'), head = node('summary'); head.append(node('strong', '', item.title), node('span', 'muted-note', '발표 ' + deskText(item.release_date))); detail.append(head, deskNewsBody(item)); reviewed.append(detail); }); container.append(reviewed);
  }
  const sourceStrip = node('details', 'desk-source-overview'), sourceGrid = node('div', 'desk-source-strip');
  sourceStrip.append(node('summary', '', '수집 출처와 조회 상태 · ' + library.sources.length + '곳'));
  library.sources.filter((source) => institution === 'ALL' || deskInstitution(source) === institution).forEach((source) => {
    const group = node('div', 'desk-source-card'); group.append(deskLink(deskText(source.label, '공개 출처'), source.url), node('span', 'muted-note', source.error_code || source.status === 'FAILED' ? '목록 조회 실패 · 기존 자료 확인 필요' : (source.records || []).filter((r) => r.access === 'INDEX_ONLY').length + '개 목록 · 본문 검토 전')); sourceGrid.append(group);
  }); sourceStrip.append(sourceGrid); container.append(sourceStrip);
  // The report list already has its own pager (2 per page on mobile, 4 on desktop); a second outer slice hid reports.
  const list = node('div', 'desk-report-rows'); list.id = 'report-records-list'; rows.forEach((record) => {
    const button = node('button', 'desk-library-row'), main = node('span', 'desk-library-main'), metadata = node('span', 'desk-library-date'); button.type = 'button';
    const cleanTitle = cleanDeskText(record.title, '제목 미확인');
    main.append(node('strong', '', cleanTitle), node('span', 'desk-library-meta', deskText(record.source.label) + ' · ' + ({MACRO_RESEARCH:'경제 연구', POLICY_RELEASE:'정책 발표', EDUCATION:'투자 공부'}[deskReportKind(record.kind)] || '공개 자료')));
    metadata.append(node('span', '', record.published_date || '발표일 미확인'), node('span', 'desk-library-state', '본문 검토 전'));
    button.setAttribute('data-institution', deskInstitution(record.source)); button.setAttribute('data-kind', deskReportKind(record.kind || record.source.kind)); button.setAttribute('data-published', record.published_date || '');
    button.append(main, metadata); button.addEventListener('click', () => openDeskReport(record.id)); list.append(button);
  }); container.append(list);
  document.dispatchEvent(new CustomEvent('zero-reports-rendered'));
  if (!rows.length && !desk$('report-empty')) container.append(node('p', 'table-empty', '검색 조건에 맞는 자료가 없습니다.'));
}
function openDeskReport(id) {
  const record = deskReportRows(researchDesk.data?.briefing_sources).find((row) => row.id === id); if (!record) return false;
  let dialog = desk$('desk-report-dialog'); if (!dialog) { dialog = node('dialog', 'desk-report-dialog'); dialog.id = 'desk-report-dialog'; dialog.setAttribute('aria-labelledby', 'desk-report-title'); document.body.append(dialog); }
  const focus = document.activeElement; dialog.replaceChildren(); const head = node('div', 'desk-report-head'), title = node('h2', '', record.title), close = node('button','icon-button icon-close','닫기'); title.id = 'desk-report-title'; close.type = 'button';close.title='닫기';close.setAttribute('aria-label','창 닫기'); close.addEventListener('click', () => dialog.close()); head.append(title, close);
  const body = node('div', 'desk-report-body'); body.append(node('p', 'muted-note', deskText(record.source.label) + ' · 수집 목록'));
  const kind = window.ZERODeskVisuals?.KINDS?.[deskReportKind(record.kind || record.source.kind)];
  body.append(deskChips(['📅 발표 ' + deskPublication(record), '🔄 목록 확인 ' + stamp(record.retrieved_at) + ' KST', kind ? kind.join(' ') : '📄 ' + deskText(record.kind)]));
  // 목록만 확인했고 본문은 읽지 않았다는 사실을 단계 그림으로 보여 준다.
  const steps = node('ol', 'desk-read-steps'); steps.setAttribute('aria-label', '읽기 단계: 제목·발표일·원문 주소 확인, 본문과 첨부 PDF 검토 전, 요약·투자 결론 없음');
  [['done', '✅', '제목'], ['done', '✅', '발표일'], ['done', '✅', '원문 주소'], ['todo', '⏳', '본문 검토 전'], ['none', '🚫', '요약·결론 없음']].forEach(([state, icon, label]) => {
    const step = node('li', 'desk-step-' + state); step.append(node('span', 'desk-step-icon', icon), node('span', '', label)); steps.append(step);
  });
  body.append(steps, deskLink('📖 보고서 원문에서 읽기', record.url));
  if (record.content_changed_at) body.append(node('p', 'muted-note', '목록 변경 확인 ' + stamp(record.content_changed_at) + ' KST · 새 발표나 본문 수정이 확인됐다는 뜻은 아닙니다.'));
  dialog.append(head, body); dialog.onclose = () => { if (focus?.isConnected) focus.focus(); }; if (!dialog.open) dialog.showModal(); close.focus(); return true;
}
function renderNews() {
  const container = desk$('news-list'); if (!container) return; container.replaceChildren();
  const all = researchDesk.data?.news || [], category = desk$('news-category');
  if (category) { const selected = category.value, keys = Array.from(new Set(all.map((item) => item.category))).sort();
    if (category.dataset.categories !== keys.join('|')) { category.replaceChildren(); const first = node('option', '', '모든 뉴스'); first.value = 'ALL'; category.append(first); keys.forEach((key) => { const option = node('option', '', key); option.value = key; category.append(option); }); category.value = keys.includes(selected) ? selected : 'ALL'; category.dataset.categories = keys.join('|'); }
  }
  const search = deskControl('news-search').trim().toLowerCase(), selected = deskControl('news-category', 'ALL');
  const rows = all.filter((item) => (selected === 'ALL' || item.category === selected) && (item.title + ' ' + item.category + ' ' + (item.core_sentences || []).join(' ')).toLowerCase().includes(search)).slice().sort((a, b) => String(b.release_date || '').localeCompare(String(a.release_date || '')));
  if (desk$('news-empty')) desk$('news-empty').hidden = rows.length > 0;
  if (desk$('news-count')) desk$('news-count').textContent = rows.length + '건 · 5개씩 표시 · 눌러서 다섯 문장·경제 용어·시나리오 보기';
  const outline = desk$('news-outline'); if (outline) outline.hidden = true;

  const totalPages = Math.ceil(rows.length / DESK_PAGE_SIZE);
  if (newsCurrentPage > totalPages && totalPages > 0) newsCurrentPage = 1;
  const start = (newsCurrentPage - 1) * DESK_PAGE_SIZE;
  const pageRows = rows.slice(start, start + DESK_PAGE_SIZE);

  pageRows.forEach((item, index) => {
    const card = node('details', 'desk-news'); card.id = 'news-item-' + (start + index); const summary = node('summary', 'desk-news-summary');
    const cleanTitle = cleanDeskText(item.title);
    const cleanPreview = cleanDeskText(item.core_sentences?.[0], '확인 요약 없음');
    summary.append(node('span', 'desk-news-meta', item.category + ' · 발표 ' + deskText(item.release_date)), node('strong', '', cleanTitle), node('span', 'desk-news-preview', cleanPreview)); card.append(summary);
    const body = deskNewsBody(item); body.prepend(node('p', 'muted-note', '사건 ' + deskText(item.event_date) + ' · 발표 ' + deskText(item.release_date) + ' · 자료 확인 ' + stamp(item.retrieved_at) + ' KST')); card.append(body); container.append(card);
  });

  renderDeskPagination(container, rows.length, DESK_PAGE_SIZE, newsCurrentPage, (p) => {
    newsCurrentPage = p;
    renderNews();
    container.scrollIntoView?.({behavior: 'smooth', block: 'nearest'});
  });
}
function deskNvdaFilingMetrics(charts, now = Date.now()) {
  // Fixed published FY2026 denominators; a current price must not precede the filing.
  const record = (Array.isArray(charts) ? charts : []).find((chart) => chart.id === 'US:NVDA' && chart.interval === '1d');
  const formatter = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const parts = (time) => Object.fromEntries(formatter.formatToParts(new Date(time)).map((part) => [part.type,part.value]));
  const day = (part) => part.year+'-'+part.month+'-'+part.day;
  const current = parts(now), today = day(current), closed = Number(current.hour)*60+Number(current.minute)>=960;
  const completed = deskCleanBars(record?.bars, now).filter((bar) => {const date=day(parts(bar.at));return date<today || date===today&&closed;});
  const latest = completed[completed.length-1], priceDate = latest ? day(parts(latest.at)) : null;
  const price = latest && priceDate >= '2026-02-25' ? latest.close : null;
  const reportedEPS=4.90, computedEPS=120067/24514, bps=157293/24304, averageEquity=(79327+157293)/2, roe=120067/averageEquity*100;
  return {reportedEPS,computedEPS,bps,averageEquity,roe,price,priceDate,record,per:price===null?null:price/reportedEPS,pbr:price===null?null:price/bps};
}
function renderNvdaFilingExample() {
  const container=desk$('study-nvda-example');if(!container)return;container.replaceChildren();
  const metric=deskNvdaFilingMetrics(researchDesk.data?.charts), value=(number,digits=2)=>number===null?'근거 없음':format(number,digits);
  container.append(node('p','muted-note','학습용 계산 · NVIDIA FY2026 공식 공시의 고정 분모 · 회계기간 종료 2026-01-25 · SEC 제출 2026-02-25'));
  deskFields(container,[['공시 희석 EPS',value(metric.reportedEPS)+' USD / 주'],['BPS · 기말 보통주 기준',value(metric.bps,4)+' USD / 주'],['ROE · 기초·기말 평균 기준',value(metric.roe,2)+'%'],['PER · FY2026 EPS 기준',metric.per===null?'근거 없음':value(metric.per)+'배'],['PBR · FY2026 BPS 기준',metric.pbr===null?'근거 없음':value(metric.pbr)+'배']]);
  const formulas=node('dl','desk-lessons');
  [['희석 EPS 산식','순이익 120,067백만 USD ÷ 희석 가중평균 주식 수 24,514백만 주 = 약 '+value(metric.computedEPS,4)+' USD / 주. 공시의 반올림된 희석 EPS는 4.90 USD입니다.'],['BPS 산식','기말 자기자본 157,293백만 USD ÷ 기말 발행·유통 보통주 24,304백만 주 = 약 '+value(metric.bps,4)+' USD / 주. 공시상 발행 우선주는 없습니다.'],['ROE 산식','순이익 120,067백만 USD ÷ [(기초 자기자본 79,327 + 기말 자기자본 157,293)백만 USD ÷ 2] × 100 = 약 '+value(metric.roe)+'%.'],['가격과 연결한 산식',metric.price===null?'공시 제출일 이후에 관측한 완료 일봉 종가의 근거가 없어 PER·PBR 계산을 보류합니다.':metric.priceDate+' 미국 거래일 종가 '+value(metric.price,4)+' USD ÷ 공시 희석 EPS 4.90 USD = PER '+value(metric.per)+'배; 같은 종가 ÷ BPS '+value(metric.bps,4)+' USD = PBR '+value(metric.pbr)+'배.']].forEach(([label,text])=>formulas.append(node('dt','',label),node('dd','',text)));
  container.append(formulas,node('p','muted-note','백만 단위는 나눗셈에서 상쇄됩니다. EPS는 기간의 희석 가중평균 주식 수, BPS는 기말 보통주 수를 사용합니다. 이 PER·PBR은 FY2026 고정 실적을 사용한 참고 계산이며 최근 12개월 TTM 또는 제공자의 현재 PER과 다릅니다. 일봉은 제공자 자료이고 수정주가의 독립 대조 전입니다.'),node('p','muted-note','ROE는 100%를 넘을 수 있습니다. 평균 자기자본이 작거나 자사주 매입으로 줄면 값이 커질 수 있으므로 미래의 수익성과 효율을 보장하지 않습니다. 아래 수치의 표시 반올림과 계산 원본을 구분해 읽습니다.'));
  const sources=node('p','desk-source');sources.append(deskLink('NVIDIA FY2026 SEC 공시', 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm'));
  if(metric.price!==null&&metric.record?.source_url)sources.append(deskLink('가격 자료 출처',metric.record.source_url));container.append(sources);
  if(metric.price!==null)container.append(node('p','muted-note','가격 관측일 '+metric.priceDate+' · 자료 확인 '+stamp(metric.record.retrieved_at)+' KST · 보고서 이후 가격과 과거 연간 분모를 연결한 학습 계산입니다.'));
}

function renderDesk() {updateDeskDataStatus();renderStudyChart();renderStudyCompany();renderNvdaFilingExample();renderMacro();renderNews();renderBriefingSources();}
function compactMacroFilters(){
  const search=desk$('macro-search')?.closest('label'),country=desk$('macro-country')?.closest('label'),category=desk$('macro-category')?.closest('label'),controls=country?.parentElement;
  const intro=desk$('macro-title')?.nextElementSibling,status=desk$('macro-data-status');
  if(!search||!country||!category||!controls||!window.matchMedia)return;
  // Keep the existing desktop fields in place; only mobile moves them into one native disclosure.
  const detail=node('details','macro-filter-details'),summary=node('summary','','🔎 검색·필터·안내'),body=node('div','macro-filter-fields');detail.append(summary,body);
  const moved=[intro,status,search,country,category].filter(Boolean),markers=moved.map((element)=>{const marker=document.createComment('macro filter position');element.before(marker);return marker;});
  controls.append(detail);
  const query=window.matchMedia('(max-width: 680px)');
  const adapt=()=>{detail.hidden=!query.matches;moved.forEach((element,index)=>{
    // A stale or failed data warning stays on screen instead of hiding inside the fold.
    if(query.matches&&!(element===status&&status.classList.contains('desk-stale')))body.append(element);else markers[index].after(element);});};
  const label=()=>{const parts=['macro-country','macro-category'].map(id=>desk$(id)).filter(select=>select.value!=='ALL').map(select=>select.selectedOptions[0]?.textContent),text=desk$('macro-search').value.trim();
    if(text)parts.unshift('“'+text+'”');summary.textContent=parts.length?'🔎 '+parts.join(' · '):'🔎 검색·필터·안내';};
  ['macro-country','macro-category'].forEach(id=>desk$(id).addEventListener('change',label));desk$('macro-search').addEventListener('input',label);
  researchDesk.onStatus=adapt;query.addEventListener?.('change',adapt);adapt();label();
}
compactMacroFilters();
['study-company','study-interval','study-learning','study-ma-5','study-ma-20','study-ma-60'].forEach((id)=>desk$(id)?.addEventListener('change',()=>{renderStudyChart();if(id==='study-company')renderStudyCompany();}));
desk$('study-candle-index')?.addEventListener('input',(event)=>{const current=researchDesk.candle;if(current)deskReadCandle(current.bars,Number(event.target.value),current.currency,current.learning);});
['study-price','study-eps','study-bps','study-profit','study-equity'].forEach((id)=>desk$(id)?.addEventListener('input',deskCalculateExample));
['macro-search','macro-country','macro-category'].forEach((id)=>desk$(id)?.addEventListener(id==='macro-search'?'input':'change',()=>{macroCurrentPage=1;renderMacro();}));
['news-search','news-category'].forEach((id)=>desk$(id)?.addEventListener(id==='news-search'?'input':'change',()=>{newsCurrentPage=1;renderNews();}));
['report-search','report-institution','report-kind','report-sort'].forEach((id)=>desk$(id)?.addEventListener(id==='report-search'?'input':'change',renderBriefingSources));
document.querySelectorAll('[data-desk-reload]').forEach((button)=>button.addEventListener('click',()=>loadDesk(true)));
desk$('study-example')?.addEventListener('submit',(event)=>event.preventDefault());
if(desk$('study-price'))deskCalculateExample();
renderNvdaFilingExample();
if(typeof ResizeObserver!=='undefined'&&desk$('study-price-chart')){let previousWidth=0;new ResizeObserver(()=>{const width=Math.round(desk$('study-price-chart').clientWidth);if(width&&width!==previousWidth){previousWidth=width;if(researchDesk.data||desk$('study-learning').checked)renderStudyChart();}}).observe(desk$('study-price-chart'));}
function pollDesk() {
  if (document.hidden || !['macro','news','reports'].includes(document.documentElement?.dataset.zeroView)) return;
  loadDesk();
}
if (typeof setInterval !== 'undefined') setInterval(pollDesk, 15000);
document.addEventListener?.('visibilitychange', pollDesk);
window.ZERODesk={macro:()=>researchDesk.data?.macro||[],macroCategory:deskMacroCategory,dailySeries:(id)=>{const record=researchDesk.data?.charts.find((chart)=>chart.id===id&&chart.interval==='1d');return {bars:deskCleanBars(record?.bars),currency:deskText(record?.currency,'통화 미확인')};},load:loadDesk,render:renderDesk,renderReports:renderBriefingSources,openReport:openDeskReport,open:async()=>{await loadDesk();}};
