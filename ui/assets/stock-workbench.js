'use strict';
function stockNumber(value){return (typeof value==='number'||typeof value==='string'&&value.trim())&&Number.isFinite(Number(value))?Number(value):NaN;}
function sortStockRows(rows,value,descending=true){
  return [...rows].sort((a,b)=>{const av=stockNumber(value(a)),bv=stockNumber(value(b)),tie=String(a.id||a.market+':'+a.symbol).localeCompare(String(b.id||b.market+':'+b.symbol));return !Number.isFinite(av)?Number.isFinite(bv)?1:tie:!Number.isFinite(bv)?-1:(descending?bv-av:av-bv)||tie;});
}
function stockFX(fx,now=Date.now()){
  const rate=stockNumber(fx?.usd_krw),observed=Date.parse(fx?.observed_at),retrieved=Date.parse(fx?.retrieved_at);
  return fx?.source==='ER_API_USD_KRW'&&rate>0&&[fx.observed_at,fx.retrieved_at].every(v=>typeof v==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v))&&observed<=retrieved&&retrieved<=now&&now-observed<=172800000?rate:null;
}
function stockConvert(value,currency,target,fx,now=Date.now()){
  const amount=stockNumber(value);if(!Number.isFinite(amount)||!['USD','KRW'].includes(currency)||!['USD','KRW'].includes(target))return null;if(currency===target)return amount;
  const rate=stockFX(fx,now);if(rate===null)return null;const converted=currency==='USD'?amount*rate:amount/rate;return Number.isFinite(converted)?converted:null;
}
function stockDrawdown(bars){
  const empty={status:'UNAVAILABLE',sample_count:0,start_time:null,end_time:null,mdd_percent:null,peak_time:null,trough_time:null,recovery_time:null};
  if(!Array.isArray(bars)||bars.length<2||bars.some((b,i)=>!Number.isFinite(b?.time)||b.time<=0||!Number.isFinite(b.close)||b.close<=0||i>0&&b.time<=bars[i-1].time))return empty;
  let peak=bars[0],maximum=0,maximumPeak=null,trough=null;
  bars.forEach(bar=>{if(bar.close>peak.close)peak=bar;const loss=(1-bar.close/peak.close)*100;if(loss>maximum){maximum=loss;maximumPeak=peak;trough=bar;}});
  const recovery=trough?bars.find(bar=>bar.time>trough.time&&bar.close>=maximumPeak.close):null;
  return {status:'AVAILABLE',sample_count:bars.length,start_time:bars[0].time,end_time:bars.at(-1).time,mdd_percent:maximum,peak_time:maximumPeak?.time||null,trough_time:trough?.time||null,recovery_time:recovery?.time||null};
}
// Reprice a saved "if you had held it since the first buy" comparison (S&P 500 index or TQQQ) with a live
// public quote and FX rate. The saved record stays the fallback: any missing or invalid input returns it as is.
// Fixed-FX value = principal x price ratio; the won value uses the live (not official) FX rate.
function liveBenchmark(saved,live,key,closeKey){
  const quote=live?.benchmarks?.[key],capital=Number(saved?.capital_krw),start=Number(saved?.latest_usd?.['start_'+closeKey]),startFx=Number(saved?.krw_common?.start_usd_krw);
  const price=Number(quote?.price),rate=Number(live?.fx?.usd_krw),at=Date.parse(quote?.market_time);
  if(saved?.state!=='AVAILABLE'||!(capital>0&&start>0&&startFx>0&&price>0&&rate>0)||!Number.isFinite(at))return saved;
  const ratio=price/start,krwRatio=ratio*rate/startFx,usDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(at));
  const values=r=>({reference_value_krw:capital*r,gain_krw:capital*r-capital,return_percent:(r-1)*100});
  return {...saved,live:{checked_at:live.checked_at||null,market_time:quote.market_time,fx_time:live.fx?.market_time||null},
    latest_usd:{...saved.latest_usd,market_date:usDay,[closeKey]:price,...values(ratio),basis:'LIVE_PUBLIC_DELAYED_QUOTE_FIXED_FX'},
    krw_common:{...saved.krw_common,market_date:usDay,[closeKey]:price,end_usd_krw:rate,...values(krwRatio),basis:'LIVE_PUBLIC_DELAYED_QUOTE_AND_FX'}};
}
// Loss-limit reference for the owner, after the forked quantstats/empyrical formulas (CAGR,
// annualized volatility, max drawdown, daily CVaR) and Riskfolio-style drawdown at risk over
// rolling one-year windows. Price only, buy and hold at today's weights from the first shared
// session; never a proposal, backtest verification or applied limit.
function portfolioRisk(series,cashWeight,sessionDate){
  const empty={status:'UNAVAILABLE',reason:'INSUFFICIENT_COMMON_HISTORY'};
  if(!Array.isArray(series)||!series.length||!(cashWeight>=0)||cashWeight>=1||!series.every(row=>row.weight>0&&Array.isArray(row.bars)))return empty;
  if(Math.abs(series.reduce((sum,row)=>sum+row.weight,cashWeight)-1)>1e-6)return {...empty,reason:'WEIGHTS_INVALID'};
  const maps=series.map(row=>new Map(row.bars.filter(bar=>bar.close>0).map(bar=>[sessionDate(bar.time,row.market),bar.close])));
  const dates=[...maps[0].keys()].filter(date=>maps.every(map=>map.has(date))).sort();
  if(dates.length<260)return empty;
  const base=maps.map(map=>map.get(dates[0])),index=dates.map(date=>cashWeight+series.reduce((sum,row,i)=>sum+row.weight*maps[i].get(date)/base[i],0));
  const returns=index.slice(1).map((value,i)=>value/index[i]-1),mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const years=(Date.parse(dates.at(-1))-Date.parse(dates[0]))/(365.25*86400000);
  const drawdown=values=>{let peak=values[0],worst=0;for(const v of values){if(v>peak)peak=v;worst=Math.max(worst,1-v/peak);}return worst;};
  const tail=[...returns].sort((a,b)=>a-b).slice(0,Math.max(1,Math.floor(returns.length*0.05)));
  const windows=[];for(let i=0;i+252<=index.length;i+=5)windows.push(index.slice(i,i+252));
  const rolling=windows.map(drawdown).sort((a,b)=>a-b),quantile=q=>rolling[Math.min(rolling.length-1,Math.floor(q*(rolling.length-1)))]*100;
  return {status:'AVAILABLE',start_date:dates[0],end_date:dates.at(-1),sessions:dates.length,windows:windows.length,
    cagr_percent:(Math.pow(index.at(-1),1/years)-1)*100,
    volatility_percent:Math.sqrt(returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1))*Math.sqrt(252)*100,
    max_drawdown_percent:drawdown(index)*100,cvar95_daily_percent:-tail.reduce((a,b)=>a+b,0)/tail.length*100,
    one_year_drawdown_p50_percent:quantile(0.5),one_year_drawdown_p95_percent:quantile(0.95),one_year_drawdown_p99_percent:quantile(0.99),
    worst_one_year_return_percent:Math.min(...windows.map(w=>w.at(-1)/w[0]-1))*100,
    exceed_share_percent:Object.fromEntries([5,10,15,20,25].map(limit=>[limit,rolling.filter(value=>value*100>=limit).length/rolling.length*100]))};
}
function lightweightChartLink(identity,range,height=240){
  if(typeof identity!=='string'||!/^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[0-9]{6})$/.test(identity)||!['1D','1W','1M','3M','1Y','5Y'].includes(range)||!Number.isInteger(height)||height<160||height>360)return null;
  return './lwc?'+new URLSearchParams({identity,range,height:String(height)}).toString();
}
function stockSessionDate(time,market){return new Intl.DateTimeFormat('en-CA',{timeZone:market==='KR'?'Asia/Seoul':'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time*1000));}
// Mirrors zero.chart_history._complete: source close +10min, not a verified exchange calendar.
function stockBarCompleted(bar,market,interval,retrievedAt){
  const observed=Date.parse(retrievedAt);
  if(!bar||!Number.isInteger(bar.time)||bar.time<=0||!Number.isFinite(observed)||bar.time*1000>observed||!['US','KR'].includes(market)||!['1m','60m','1d'].includes(interval))return false;
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:market==='KR'?'Asia/Seoul':'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const parts=time=>Object.fromEntries(formatter.formatToParts(new Date(time)).map(part=>[part.type,part.value])),at=parts(bar.time*1000);
  if(['Sat','Sun'].includes(at.weekday))return false;
  if(interval!=='1d')return bar.time*1000+(interval==='1m'?60000:3600000)<=observed;
  const read=parts(observed),date=value=>value.year+value.month+value.day;
  return date(at)<date(read)||date(at)===date(read)&&Number(read.hour)*60+Number(read.minute)>=(market==='KR'?940:970);
}
function stockChartValid(data,identity,range,now=Date.now()){
  if(!data||data.schema_version!==1||data.identity!==identity||data.range!==range||!['1D','1W','1M','3M','1Y','5Y'].includes(range)||!['AVAILABLE','STALE','UNAVAILABLE'].includes(data.status)||!Array.isArray(data.bars)||data.bars.length>2200||data.basis!=='UNADJUSTED_PROVIDER_COMPLETED_OHLCV'||!['1m','60m','1d'].includes(data.interval)||!['US','KR'].includes(data.market)||data.currency!==({US:'USD',KR:'KRW'}[data.market])||!identity.startsWith(data.market+':'))return false;
  const clock=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now;
  if(!clock(data.checked_at)||data.status==='UNAVAILABLE'&&(data.bars.length||data.retrieved_at!==null)||data.status!=='UNAVAILABLE'&&(!data.bars.length||!clock(data.retrieved_at)||Date.parse(data.retrieved_at)>Date.parse(data.checked_at)))return false;
  return data.bars.every((b,index)=>Number.isFinite(b.time)&&b.time>0&&b.time*1000<=Date.parse(data.retrieved_at)&&!(index>0&&b.time<=data.bars[index-1].time)&&['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0)&&b.low<=b.open&&b.high>=b.open&&b.low<=b.close&&b.high>=b.close&&(b.volume===null||Number.isFinite(b.volume)&&b.volume>=0));
}
function alignStockCharts(first,second){
  const empty={status:'UNAVAILABLE',rows:[],first:null,second:null};
  if(!first||!second||!['3M','1Y','5Y'].includes(first.range)||first.range!==second.range||first.interval!=='1d'||second.interval!=='1d'||!stockChartValid(first,first.identity,first.range)||!stockChartValid(second,second.identity,second.range)||[first.status,second.status].includes('UNAVAILABLE'))return empty;
  const dated=chart=>chart.bars.map(bar=>({date:stockSessionDate(bar.time,chart.market),bar})),a=dated(first),b=dated(second),am=new Map(a.map(row=>[row.date,row.bar])),bm=new Map(b.map(row=>[row.date,row.bar]));
  if(am.size!==a.length||bm.size!==b.length)return empty;
  const dates=[...am.keys()].filter(date=>bm.has(date));if(dates.length<2)return empty;const start=dates[0],end=dates.at(-1),baseA=am.get(start).close,baseB=bm.get(start).close;
  // Retain each market's real troughs inside the shared bounds, including dates absent in its peer.
  const describe=(chart,entries,base)=>({identity:chart.identity,currency:chart.currency,market:chart.market,return_percent:(entries.find(r=>r.date===end).bar.close/base-1)*100,mdd:stockDrawdown(entries.filter(r=>r.date>=start&&r.date<=end).map(r=>r.bar)),retrieved_at:chart.retrieved_at});
  return {status:[first.status,second.status].includes('STALE')?'STALE':'AVAILABLE',start_date:start,end_date:end,rows:dates.map(date=>({date,first_close:am.get(date).close,second_close:bm.get(date).close,first_index:am.get(date).close/baseA*100,second_index:bm.get(date).close/baseB*100})),first:describe(first,a,baseA),second:describe(second,b,baseB)};
}
function stockOpinion(company,detail,chart){
  const f=company?.financials,annual=company?.kind==='COMPANY'&&['AVAILABLE','PARTIAL'].includes(f?.status)?{period_end:f.period_end,currency:f.currency,revenue:Number.isFinite(stockNumber(f.revenue))?stockNumber(f.revenue):null,operating_income:Number.isFinite(stockNumber(f.operating_income))?stockNumber(f.operating_income):null}:null;
  const price=chart?.identity===company?.id&&stockChartValid(chart,company.id,chart.range)&&chart.status!=='UNAVAILABLE'?chart:null;
  const view={verdict:'WITHHELD',orders_authorized:false,allocation_changes_authorized:false,annual,ratios:detail?.ratios||null,drivers:Array.isArray(company?.drivers)?company.drivers:[],risks:Array.isArray(company?.risks)?company.risks:[],mdd:stockDrawdown(price?.bars),missing:['OFFICIAL_DISCLOSURE_UNVERIFIED','VALUATION_CRITERIA_UNSET','TRADING_COSTS_UNVERIFIED'],research_status:company?.research_status||'REVIEW_PENDING'};
  view.debate=stockDebate(view);return view;
}
// Historical drawdown supplies risk observations, never economic arguments or an invented owner loss limit.
function stockDebate(view){
  const mdd=view.mdd?.status==='AVAILABLE'?view.mdd:null,f=view.annual;
  const bull=view.drivers.filter(value=>typeof value==='string'&&value.trim()).slice(0,2).map(value=>'제공자 성장 요인 · 미검증: '+value);
  const bear=view.risks.filter(value=>typeof value==='string'&&value.trim()).slice(0,2).map(value=>'제공자 위험 요인 · 미검증: '+value);
  if(f?.operating_income>0)bull.push((f.period_end||'회계기간 미확인')+' 제공자 연간 영업이익 양수 · 공시·지속성·현금흐름 확인 필요');
  if(f?.operating_income<0)bear.push((f.period_end||'회계기간 미확인')+' 제공자 연간 영업손실 · 공시·지속기간·일회성 요인 확인 필요');
  const risk=[mdd?'관측 기간 최대낙폭 '+mdd.mdd_percent.toFixed(1)+'% · 과거 관찰이며 앞으로의 손실 상한이 아님':'가격 낙폭 근거 없음 · 차트 자료 확인 필요',
    '사용자 최대 감내 손실 미정 · 이 낙폭을 견딜 수 있는지 판단 불가'];
  return {method:'RULE_BASED_EXISTING_EVIDENCE',llm:false,fictional_roles:true,independent_validation_completed:false,bull,bear,risk,conclusion:'HOLD',
    seats:{bull:'조건부 강세 · 가치 리서치(그린블라트)',bear:'조건부 약세 · 반대 검토·모형 검증',risk:'역사 위험 관찰 · 위험·검증(소프)',manager:'판단 보류 · ZERO 총괄'}};
}
function renderStockDebate(pane,debate){
  const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const existing=pane.querySelector('.stock-debate'),box=existing||make('section');box.className='stock-debate';box.replaceChildren(make('h4','ZERO 가상 팀 토론 · 조건부 검토 관점'),
    make('p','기존 제공 자료를 규칙으로 나눈 가상 직무 관점입니다. 실제 AI·전문가 회의 수행 결과가 아니며, 공시 독립 대조·매수 승인·수익 예측을 뜻하지 않습니다.'));
  const grid=make('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px;margin:16px 0';
  [[debate.seats.bull,debate.bull],[debate.seats.bear,debate.bear],[debate.seats.risk,debate.risk],
   [debate.seats.manager,['신규 매수 판단 보류(HOLD) · 관점이나 항목의 개수로 우열·승인을 결정하지 않습니다.','손실 한도·적정가치·공시·거래비용 근거가 확인되기 전에는 매수 의견을 내지 않습니다. 주문이 아닌 연구 의견입니다.']]]
    .forEach(([seat,lines])=>{const section=make('div');section.style.cssText='padding:12px 0;border-top:1px solid #eef0f3';
      const list=make('ul');(lines.length?lines:['제공된 검토 항목 없음']).forEach(line=>list.append(make('li',line)));section.append(make('strong',seat),list);grid.append(section);});
  box.append(grid);if(!existing)pane.append(box);
}
// Exchange-local session bins keep overnight gaps and different dates separate.
function aggregateBars(bars, minutes, market, now = Date.now()/1000) {
  if (minutes === 1) return bars;
  const zone = market === 'KR' ? 'Asia/Seoul' : 'America/New_York';
  const formatter = new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const groups = new Map(), session = market === 'KR' ? 540 : 570;
  bars.forEach((bar) => {
    const pieces = Object.fromEntries(formatter.formatToParts(new Date(bar.time*1000)).map(p=>[p.type,p.value]));
    const clock = Number(pieces.hour)*60+Number(pieces.minute), elapsed=clock-session;
    if (elapsed<0) return;
    const offset=elapsed%minutes, start=bar.time-offset*60, key=pieces.year+pieces.month+pieces.day+':'+Math.floor(elapsed/minutes);
    if (start+minutes*60>now) return;
    const previous=groups.get(key);
    if (!previous) groups.set(key,{...bar,time:start});
    else {previous.high=Math.max(previous.high,bar.high);previous.low=Math.min(previous.low,bar.low);previous.close=bar.close;previous.volume=previous.volume===null||bar.volume===null?null:previous.volume+bar.volume;}
  });
  return [...groups.values()];
}
function movingAverage(bars, period) {
  let sum=0;
  return bars.map((bar,index)=>{sum+=bar.close;if(index>=period)sum-=bars[index-period].close;return index+1>=period?sum/period:null;});
}
function candleColor(bar){return bar.close>bar.open?'#f04452':bar.close<bar.open?'#3182f6':'#8b95a1';}
function chartComparison(first,second){
  if(!Number.isFinite(first)||!Number.isFinite(second))return null;
  // Ignore only binary addition noise; this is arithmetic equality, not an investment threshold.
  return Math.abs(first-second)<=Number.EPSILON*Math.max(1,Math.abs(first),Math.abs(second))*20?'FLAT':first>second?'UP':'DOWN';
}
function visibleWindow(length, count, start) {
  const size=Math.min(length,Math.max(1,Math.round(count))),first=Math.max(0,Math.min(length-size,Math.round(start)));
  return {start:first,end:first+size};
}
function plotBounds(bars, averages) {
  const values=[...bars.flatMap(b=>[b.low,b.high]),...averages.flat().filter(v=>v!==null&&Number.isFinite(v))];
  const low=Math.min(...values),high=Math.max(...values),padding=Math.max((high-low)*.08,high*.001);
  return {low:low-padding,high:high+padding};
}
function chartLesson(bars,index,interval){
  const labels={'1m':'1분','10m':'10분','60m':'60분','1d':'1일'},bar=Array.isArray(bars)&&bars[index];
  if(!Number.isInteger(index)||index<0||!bar||!Object.hasOwn(labels,interval)||!Number.isFinite(bar.time)||bar.time<=0||!['open','high','low','close'].every(k=>Number.isFinite(bar[k])&&bar[k]>0)||bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close))return {state:'UNAVAILABLE'};
  // Historical selections use only this bar and earlier completed records, never later chart data.
  const averages=[5,20,60].map(period=>{
    const window=bars.slice(Math.max(0,index-period+1),index+1),valid=window.filter(b=>Number.isFinite(b.close)&&b.close>0),previous=bars.slice(Math.max(0,index-period),index),previousValid=previous.filter(b=>Number.isFinite(b.close)&&b.close>0);
    const value=window.length===period&&valid.length===period?valid.reduce((sum,b)=>sum+b.close,0)/period:null,previousValue=previous.length===period&&previousValid.length===period?previousValid.reduce((sum,b)=>sum+b.close,0)/period:null;
    return {period,samples:valid.length,value,previousValue,priceRelation:chartComparison(bar.close,value),slope:chartComparison(value,previousValue)};
  });
  const prior=bars.slice(Math.max(0,index-20),index),volumes=prior.filter(b=>Number.isFinite(b.volume)&&b.volume>=0),average=prior.length===20&&volumes.length===20?volumes.reduce((sum,b)=>sum+b.volume,0)/20:null,current=Number.isFinite(bar.volume)&&bar.volume>=0?bar.volume:null;
  return {state:'AVAILABLE',count:index+1,index,bar,intervalLabel:labels[interval],direction:bar.close>bar.open?'UP':bar.close<bar.open?'DOWN':'FLAT',body:Math.abs(bar.close-bar.open),upperWick:bar.high-Math.max(bar.open,bar.close),lowerWick:Math.min(bar.open,bar.close)-bar.low,averages,volume:{current,samples:volumes.length,average,relative:current!==null&&average>0&&Number.isFinite(current/average)?current/average:null}};
}
// Search aliases never replace the provider's display name or create a company entry.
const stockSearchAliases={
  NVDA:'엔비디아',AAPL:'애플',MSFT:'마이크로소프트',AMZN:'아마존',GOOG:'알파벳 구글',GOOGL:'알파벳 구글',
  META:'메타 페이스북',TSLA:'테슬라','BRK.B':'버크셔 버크셔해서웨이 BRK-B','BRK-B':'버크셔 버크셔해서웨이 BRK.B',
  AVGO:'브로드컴',WMT:'월마트',LLY:'일라이릴리 릴리',JPM:'제이피모건 JP모건',XOM:'엑슨모빌',V:'비자',MA:'마스터카드',
  COST:'코스트코',ORCL:'오라클',NFLX:'넷플릭스',UNH:'유나이티드헬스',JNJ:'존슨앤드존슨 존슨앤존슨',PG:'프록터앤드갬블 P&G',
  HD:'홈디포',BAC:'뱅크오브아메리카',ABBV:'애브비',KO:'코카콜라',PEP:'펩시 펩시코',AMD:'에이엠디',CRM:'세일즈포스',
  SPY:'스파이 S&P500 에스앤피500',QQQ:'큐큐큐 나스닥100',TQQQ:'티큐큐 나스닥100 일일3배',BIL:'단기국채 단기채',
    TMF:'장기국채 장기채 일일3배',UUP:'달러',VNQ:'미국리츠 부동산',GLD:'금 골드',SCHD:'슈드 미국배당',JEPQ:'제피큐 나스닥 인컴',JEPI:'제피 인컴',SPYD:'미국 고배당',HDV:'미국 고배당',VYM:'미국 고배당',NOBL:'배당귀족'
};
function searchable(company,query){
  const clean=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
  const symbols=[company.symbol,...(Array.isArray(company.symbols)?company.symbols:[])];
  const aliases=company.market==='US'?symbols.map(symbol=>Object.hasOwn(stockSearchAliases,symbol)?stockSearchAliases[symbol]:'').join(' '):'';
  return clean([company.name,company.industry,...symbols,aliases].join(' ')).includes(clean(query));
}
function relatedNews(company,article){
  // A feed query is a candidate source; only the supplied title participates in this grouping.
  const text=typeof article?.title==='string'?article.title.normalize('NFKC'):'',symbols=[company?.symbol,...(Array.isArray(company?.symbols)?company.symbols:[])].filter(s=>typeof s==='string'&&/^[A-Z0-9.-]+$/.test(s));if(!text)return false;
  const escape=value=>value.replace(/[.*+?^$()|{}[\]\\]/g,'\\$&'),word='\\p{L}\\p{N}\\p{M}_';
  const name=String(company?.name||'').normalize('NFKC').trim(),shortName=name.replace(/(?:[\s,]+(?:incorporated|inc\.?|corporation|corp\.?|limited|ltd\.?|plc|co\.?))+$/i,'').trim();
  const aliases=company?.market==='US'?symbols.flatMap(symbol=>Object.hasOwn(stockSearchAliases,symbol)?stockSearchAliases[symbol].split(/\s+/):[]):[];
  if([name,shortName,...aliases].some(value=>{
    if(!value||symbols.some(symbol=>symbol.toLowerCase()===value.toLowerCase()))return false;
    // Korean particles can follow a company name; English names must not match within another word.
    if(/[\p{Script=Hangul}\p{Script=Han}]/u.test(value))return Array.from(value).length>=2&&text.toLowerCase().includes(value.toLowerCase());
    return value.length>2&&new RegExp('(^|[^'+word+'])'+escape(value)+'(?=$|[^'+word+'])','iu').test(text);
  }))return true;
  return symbols.some(symbol=>{
    const escaped=escape(symbol);
    // Short tickers are ordinary letters/words unless the title marks them as a security.
    if(symbol.length<=2)return new RegExp('(^|[^'+word+'])\\$'+escaped+'(?=$|[^'+word+'])|\\(\\s*'+escaped+'\\s*\\)|\\b(?:NYSE|NASDAQ|AMEX|KRX)\\s*:\\s*'+escaped+'(?=$|[^'+word+'])','iu').test(text);
    return new RegExp('(^|[^'+word+'])(?:\\$)?'+escaped+'(?=$|[^'+word+'])','iu').test(text);
  });
}
function parseStockRoute(hash){
  const parts=String(hash||'').split('?'),[view,query]=parts;if(parts.length!==2||view!=='#workbench'||!query)return null;
  const values=new URLSearchParams(query),keys=['identity','tab','range','interval','compareIdentity','compareRange'];
  if([...values.keys()].some(key=>!keys.includes(key)||values.getAll(key).length!==1))return null;
  const route={identity:values.get('identity'),tab:values.get('tab')??'chart',range:values.get('range')??'5Y',interval:values.get('interval')??'1d',compareIdentity:values.get('compareIdentity'),compareRange:values.get('compareRange')??'5Y'},identity=/^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[A-Z0-9]{6})$/;
  return identity.test(route.identity||'')&&['chart','order','company','financials','fund','news','compare','opinion'].includes(route.tab)&&['1D','1W','1M','3M','1Y','5Y'].includes(route.range)&&['1m','10m','60m','1d'].includes(route.interval)&&(route.compareIdentity===null||identity.test(route.compareIdentity)&&route.compareIdentity!==route.identity)&&['3M','1Y','5Y'].includes(route.compareRange)?route:null;
}
function stockRouteHash(route){
  if(!route.identity)return '#workbench';
  const values=new URLSearchParams({identity:route.identity,tab:route.tab,range:route.range,interval:route.interval,compareRange:route.compareRange||'5Y'});if(route.compareIdentity)values.set('compareIdentity',route.compareIdentity);
  return '#workbench?'+values;
}
function companyNewsURL(value){
  try{const url=new URL(value),metadataOnly=url.protocol==='http:'&&['videos.coindesk.com','www.etf.com'].includes(url.hostname);if(typeof value!=='string'||value.length>2000||url.protocol!=='https:'&&!metadataOnly||url.username||url.password||!url.hostname.includes('.')||/^[\d.]+$/.test(url.hostname)||url.hostname.includes(':')||/(^|\.)localhost$|\.(local|internal|lan|home|corp|test|invalid)$/i.test(url.hostname))return null;
    for(const [key,value]of url.searchParams)if(/token|secret|passw|passwd|api.?key|credential|auth|access.?key|signature|session|cookie/i.test(key)||/^code$/i.test(key)||/\b(?:sk-|AKIA|Bearer\s)[A-Za-z0-9]/i.test(value))return null;
    if(/(?:token|secret|auth|session)=/i.test(url.hash))return null;return url;
  }catch(_){return null;}
}
function companyNewsValid(data,identity){
  const keys=['schema_version','scope','authority','identity','provider','query_symbol','source_url','collected_at','checked_at','status','error_code','items','orders_authorized','allocation_changes_authorized','independent_validation_completed','model_training_completed'],itemKeys=['id','title','url','publisher','published_at','published_date','retrieved_at','access','association','summary','syndication_group'];
  const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===fields.length&&fields.every(k=>Object.hasOwn(value,k));
  const clock=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now();
  if(!exact(data,keys)||data.schema_version!==1||data.scope!=='PUBLIC_COMPANY_NEWS'||data.authority!=='READ_ONLY_INDEX'||data.identity!==identity||data.provider!=='YAHOO_RSS'||typeof data.query_symbol!=='string'||!/^[A-Z0-9.-]{1,24}$/.test(data.query_symbol)||!['AVAILABLE','EMPTY','STALE','UNAVAILABLE'].includes(data.status)||!Array.isArray(data.items)||data.items.length>50||!['orders_authorized','allocation_changes_authorized','independent_validation_completed','model_training_completed'].every(k=>data[k]===false))return false;
  const source=companyNewsURL(data.source_url);if(!source||source.origin!=='https://feeds.finance.yahoo.com'||source.pathname!=='/rss/2.0/headline'||source.hash||[...source.searchParams.keys()].length!==3||source.searchParams.get('s')!==data.query_symbol||source.searchParams.get('region')!=='US'||source.searchParams.get('lang')!=='en-US')return false;
  const success=['AVAILABLE','EMPTY'].includes(data.status);
  if(success&&(data.error_code!==null||data.checked_at===null||data.collected_at===null||Date.parse(data.checked_at)!==Date.parse(data.collected_at))||!success&&data.error_code!=='PUBLIC_NEWS_UNAVAILABLE'||data.checked_at!==null&&!clock(data.checked_at)||data.collected_at!==null&&(!clock(data.collected_at)||!clock(data.checked_at)||Date.parse(data.collected_at)>Date.parse(data.checked_at))||data.status!=='UNAVAILABLE'&&data.collected_at===null||data.status==='UNAVAILABLE'&&data.collected_at!==null||data.status==='AVAILABLE'&&!data.items.length||['EMPTY','UNAVAILABLE'].includes(data.status)&&data.items.length)return false;
  const dayAt=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  return new Set(data.items.map(item=>item?.url)).size===data.items.length&&data.items.every(item=>exact(item,itemKeys)&&/^news:[a-f0-9]{24}$/.test(item.id)&&typeof item.title==='string'&&item.title.trim()&&Array.from(item.title).length<=500&&companyNewsURL(item.url)&&item.publisher==='Yahoo Finance RSS'&&item.access==='INDEX_ONLY'&&item.association==='PROVIDER_SYMBOL_QUERY'&&item.summary===null&&item.syndication_group===null&&clock(item.retrieved_at)&&Date.parse(item.retrieved_at)<=Date.parse(data.collected_at)&&(item.published_at===null||clock(item.published_at)&&Date.parse(item.published_at)<=Date.parse(item.retrieved_at))&&(item.published_date===null||typeof item.published_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item.published_date)&&Number.isFinite(Date.parse(item.published_date))&&new Date(item.published_date).toISOString().slice(0,10)===item.published_date&&(item.published_at?item.published_date===item.published_at.slice(0,10):item.published_date<=dayAt(item.retrieved_at))));
}
if(typeof module!=='undefined'&&module.exports)module.exports={lightweightChartLink,aggregateBars,movingAverage,visibleWindow,plotBounds,searchable,relatedNews,parseStockRoute,stockRouteHash,chartLesson,candleColor,companyNewsValid,stockNumber,sortStockRows,stockFX,stockConvert,stockDrawdown,stockSessionDate,stockChartValid,stockBarCompleted,alignStockCharts,stockOpinion,portfolioRisk,liveBenchmark};
if(typeof window!=='undefined') {
  window.ZEROExploreMath={aggregateBars,movingAverage,visibleWindow,plotBounds,searchable,relatedNews,stockNumber,sortStockRows,stockFX,stockConvert,stockDrawdown,stockSessionDate,stockChartValid,stockBarCompleted,alignStockCharts,stockOpinion,portfolioRisk,liveBenchmark};
  (()=>{
    const explore={catalog:[],identity:null,tab:'chart',range:'5Y',interval:'1d',kind:'candle',averages:new Set([20]),chart:null,loading:false,count:100,start:0,cursor:null,sequence:0,searchSequence:0,compareSequence:0,compareIdentity:null,compareRange:'5Y',currency:'NATIVE'};
    const favoritesKey='zero-watchlist-v1',knownETF=new Set(['SPY','BIL','UUP','VNQ','GLD','TQQQ','QQQ','TMF','SCHD','JEPQ','JEPI','SPYD','HDV','VYM','NOBL','069500','148020']);
    const companyNewsCache=new Map();let companyNewsSequence=0,orderTicket=null;
    const root=()=>document.getElementById('stock-workbench');
    const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text).replaceAll('모의','');return n;};
    const numeric=(value)=>value===null||value===undefined||value===''?NaN:Number(value);
    const fm=(value,decimals=2)=>Number.isFinite(numeric(value))?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:decimals}).format(Number(value)):'미확인';
    const cash=(value,currency)=>!Number.isFinite(stockNumber(value))?'미확인':currency==='KRW'?fm(value,0)+'원':currency==='USD'?'$'+fm(value,2):fm(value)+' · 통화 미확인';
    function favoriteIds(){try{const raw=JSON.parse(localStorage.getItem(favoritesKey)||'[]');return Array.isArray(raw)?[...new Set(raw.filter(id=>typeof id==='string'&&/^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[A-Z0-9]{6})$/.test(id)))].slice(0,30):[];}catch(_){return [];}}
    function favorite(identity){const ids=favoriteIds(),index=ids.indexOf(identity);if(index>=0)ids.splice(index,1);else if(ids.length<30)ids.push(identity);else throw Error('WATCHLIST_LIMIT');localStorage.setItem(favoritesKey,JSON.stringify(ids));return ids.includes(identity);}
    function favoriteLabel(target,active){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');svg.setAttribute('height','18');svg.setAttribute('aria-hidden','true');path.setAttribute('d','m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.8 9.7l6.4-.9Z');path.setAttribute('stroke','#3182f6');path.setAttribute('stroke-width','1.7');path.setAttribute('fill',active?'#3182f6':'none');svg.append(path);target.replaceChildren(svg,el('span','','관심종목'));target.setAttribute('aria-pressed',String(active));target.setAttribute('aria-label','관심종목 '+(active?'해제':'추가'));}
    function navigate(){orderTicket?.destroy();orderTicket=null;window.ZERO?.navigate?.('workbench',false);}
    function stockAddress(replace=false){
      // A bounded detail address restores context after reload/back; it carries no account values.
      if(window.ZERO?.currentView&&window.ZERO.currentView()!=='workbench')return;
      const hash=stockRouteHash(explore);
      if(window.location?.hash!==hash)window.history?.[replace?'replaceState':'pushState']?.({view:'workbench'},'',hash);
    }
    function button(text,action,cls='stock-button'){const b=el('button',cls,text);b.type='button';b.addEventListener('click',action);return b;}
    const currentFX=()=>window.ZERO?.getPortfolio?.()?.summary?.fx;
    function quoteBasis(chart,bar){
      // Yahoo daily timestamps identify the bar's start, not when its closing price was observed.
      return chart.interval==='1d'?stockSessionDate(bar.time,chart.market)+' '+(chart.market==='KR'?'한국':'미국')+' 거래일 · 일봉 종가':'완료 봉 '+dateLabel(bar.time,chart.market,true);
    }
    function displayMoney(value,currency){const target=explore.currency==='NATIVE'?currency:explore.currency,converted=stockConvert(value,currency,target,currentFX());return converted===null?cash(value,currency)+(target!==currency?' · 환산 미확인':''):cash(converted,target)+(target!==currency?' ('+cash(value,currency)+')':'');}
    function fxNote(){const fx=currentFX();return stockFX(fx)!==null?'참고 환율 1 USD = '+fm(fx.usd_krw)+'원 · 환율 관측 '+dateLabel(Date.parse(fx.observed_at)/1000,'KR',true)+' · 조회 '+dateLabel(Date.parse(fx.retrieved_at)/1000,'KR',true)+' · 현재 참고 환산이며 과거 환율 수익률이 아닙니다.':'신선한 공개 참고 환율 근거 없음 · 원통화만 표시합니다.';}
    function renderQuote(){
      const chart=explore.chart,quote=document.getElementById('stock-quote');if(!quote)return;const last=chart?.bars.at(-1),first=chart?.bars[0],warning=chart?.error_code==='DISPLAY_SNAPSHOT_OLDER'?'이전 저장가격 표시 · ':chart?.status==='STALE'?'최근 조회 실패 · 이전 가격 표시 · ':'';
      quote.replaceChildren(el('strong','',last?displayMoney(last.close,chart.currency):'가격 미확인'));
      if(last&&first){const change=(last.close/first.open-1)*100;quote.append(el('span',change>=0?'gain':'loss',(change>0?'+':'')+fm(change)+'% · 첫 시가 대비'),el('span','muted-note stock-quote-range','계산 범위 '+chart.range+' 조회 · '+stockSessionDate(first.time,chart.market)+' 시가 → '+stockSessionDate(last.time,chart.market)+' 종가'),el('span','muted-note',warning+'최근 '+quoteBasis(chart,last)+' · 자료 확인 '+dateLabel(Date.parse(chart.retrieved_at)/1000,'KR',true)));}
      if(explore.currency!=='NATIVE')quote.append(el('span','muted-note',fxNote()));
    }
    function renderDrawdown(target,chart,label=chart?.range||explore.range){
      if(!target)return;target.replaceChildren(el('h3','','최대 낙폭 · MDD'));const mdd=stockDrawdown(chart?.bars);
      if(mdd.status!=='AVAILABLE'){target.append(el('p','stock-empty','선택한 '+label+' 기간의 확인된 완료 종가 근거가 부족합니다. MDD 계산 보류'));return;}
      const metrics=el('dl','stock-financials'),add=(title,value)=>{const group=el('div');group.append(el('dt','',title),el('dd','',value));metrics.append(group);};
      add('관측 기간 최대 하락',fm(mdd.mdd_percent)+'%');add('고점',mdd.peak_time?stockSessionDate(mdd.peak_time,chart.market):'하락 없음');add('저점',mdd.trough_time?stockSessionDate(mdd.trough_time,chart.market):'하락 없음');add('고점 회복',mdd.recovery_time?stockSessionDate(mdd.recovery_time,chart.market):mdd.trough_time?'관측기간 내 미회복':'해당 없음');
      target.append(metrics,el('p','muted-note',(chart.status==='STALE'?'이전 저장 자료 · ':'')+label+' · '+stockSessionDate(mdd.start_time,chart.market)+' → '+stockSessionDate(mdd.end_time,chart.market)+' · '+mdd.sample_count+'개 '+chart.interval+' 완료 종가 · 자료 확인 '+dateLabel(Date.parse(chart.retrieved_at)/1000,'KR',true)),el('p','muted-note','관측한 종가의 이전 고점 대비 최대 하락률입니다. 차트 확대·이평 설정과 무관하며 생애 전체 최대 손실·미래 손실 한도가 아닙니다. 배당 제외 · 분할·수정주가 독립 대조 전'));
      if(chart.source_url)target.append(window.ZEROResearch?.link?.('MDD 가격 출처',chart.source_url));
    }
    async function catalog(){
      const data=window.ZEROResearch?.current?.()||await window.ZEROResearch?.load();
      const collected=new Map();
      // A cached research record is not ownership state; rebuild display copies from current holdings.
      (data?.companies||[]).forEach(c=>collected.set(c.id,{...c,holding:false}));
      (data?.universes||[]).filter(u=>u.id==='ETF'&&u.membership_basis==='PROVIDER_US_ETF_LIST'&&u.market_cap_basis==='PROVIDER_ETF_TOTAL_ASSETS').forEach(u=>(u.rows||[]).forEach(r=>{
        if(r.market==='US'&&r.currency==='USD'&&r.id==='US:'+r.symbol&&r.name&&!collected.has(r.id))collected.set(r.id,{id:r.id,symbol:r.symbol,symbols:[r.symbol],name:r.name,market:r.market,currency:r.currency,kind:'ETF',holding:false});
      }));
      let holdings=[];try{holdings=window.ZERO?.getPortfolio?.()?.holdings||state?.data?.holdings||[];}catch(_){}
      holdings.forEach(h=>{const id=h.market+':'+h.symbol;if(!collected.has(id))collected.set(id,{id,symbol:h.symbol,name:h.name||h.symbol,market:h.market,currency:h.currency,kind:knownETF.has(h.symbol)?'ETF':'COMPANY',holding:true});else collected.get(id).holding=true;});
      ['TQQQ','QQQ','SPY','BIL','UUP','VNQ','GLD','TMF','SCHD','JEPQ','JEPI','SPYD','HDV','VYM','NOBL'].forEach(symbol=>{const id='US:'+symbol;if(!collected.has(id))collected.set(id,{id,symbol,name:symbol==='SPY'?'SPY · S&P 500 ETF 대용':symbol,market:'US',currency:'USD',kind:'ETF'});});
      explore.catalog=[...collected.values()];return explore.catalog;
    }
    async function search(query){const list=await catalog();return list.filter(c=>searchable(c,query)).sort((a,b)=>Number(b.holding)-Number(a.holding)||a.name.localeCompare(b.name,'ko')).slice(0,40);}
    function companyById(identity){return explore.catalog.find(c=>c.id===identity||c.symbols?.some(s=>c.market+':'+s===identity));}
    function row(company){const b=button('',()=>openCompany(company.id),'stock-search-row');b.append(el('strong','',company.name),el('span','',company.symbol+' · '+(company.market==='KR'?'한국':'미국')+(company.holding?' · 보유중':'')));return b;}
    async function openWatchlist(updateAddress=true){navigate();const target=root();if(!target)return;const seq=++explore.sequence;explore.identity=null;if(updateAddress)stockAddress();target.replaceChildren(el('h2','stock-section-title','관심종목'),el('p','muted-note','이 브라우저에 최대 30개 종목을 저장합니다. 종목 화면의 별 버튼으로 추가하세요.'));await catalog();if(seq!==explore.sequence)return;const ids=favoriteIds();const list=el('div','stock-watchlist');ids.forEach(id=>{const c=companyById(id);if(c)list.append(row(c));});if(!list.childElementCount)list.append(el('p','stock-empty','아직 관심종목이 없습니다. 위 검색창에서 회사나 ETF를 찾아보세요.'));target.append(list);}
    async function openCompany(identity,options={}){
      navigate();const seq=++explore.sequence,target=root();if(!target)return;target.replaceChildren(el('p','stock-empty','종목 자료를 불러오는 중입니다.'));await catalog();if(seq!==explore.sequence)return;
      const company=companyById(identity);if(!company){target.replaceChildren(el('p','stock-empty','현재 수집한 기업·보유 종목 목록에서 찾을 수 없습니다.'));return;}
      explore.identity=company.id;explore.tab=options.tab||'chart';if(explore.tab==='fund'&&company.kind!=='ETF')explore.tab='company';explore.range=options.range||explore.range;explore.interval=options.interval||explore.interval;if(Object.hasOwn(options,'compareIdentity'))explore.compareIdentity=options.compareIdentity;if(Object.hasOwn(options,'compareRange'))explore.compareRange=options.compareRange;if(explore.compareIdentity===explore.identity)explore.compareIdentity=null;explore.chart=null;explore.opinionDetail=null;explore.cursor=null;
      if(options.updateAddress!==false)stockAddress();
      const header=el('header','stock-header'),title=el('div');title.append(el('h2','stock-title',company.name),el('p','stock-meta',company.symbol+' · '+(company.market==='KR'?'한국':'미국')+' · '+(company.kind==='ETF'?'ETF':company.industry||'기업')));
      const star=button('',()=>{try{favoriteLabel(star,favorite(company.id));}catch(error){const note=el('p','muted-note',error.message==='WATCHLIST_LIMIT'?'관심종목은 최대 30개입니다. 먼저 다른 종목을 해제하세요.':'이 브라우저에서 관심종목을 저장할 수 없습니다.');header.querySelector('.stock-favorite-notice')?.remove();note.classList.add('stock-favorite-notice');header.append(note);}},'stock-favorite');favoriteLabel(star,favoriteIds().includes(company.id));const currencyLabel=el('label','stock-currency-label','금액 통화 '),currency=el('select');currency.setAttribute('aria-label','종목 금액 표시 통화');[['NATIVE','원통화'],['KRW','원화 KRW'],['USD','달러 USD']].forEach(([value,label])=>{const option=el('option','',label);option.value=value;currency.append(option);});currency.value=explore.currency;currency.addEventListener('change',()=>{explore.currency=currency.value;renderQuote();if(['financials','opinion','compare'].includes(explore.tab))switchTab(explore.tab,false);});currencyLabel.append(currency);header.append(title,currencyLabel,star);
      const quote=el('div','stock-quote');quote.id='stock-quote';quote.append(el('strong','','가격 확인 중'),el('span','muted-note','공개 제공자 가격 · 실시간 호가와 다를 수 있습니다.'));
      const tabs=el('div','stock-detail-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','종목 상세');
      [['chart','차트'],['order','매수·매도'],['compare','두 종목 비교'],['opinion','ZERO 의견'],['company','기업정보'],['financials','재무'],...(company.kind==='ETF'?[['fund','ETF 구성']]:[]),['news','관련 뉴스']].forEach(([key,label])=>{const b=button(label,()=>switchTab(key));b.id='stock-tab-'+key;b.dataset.stockTab=key;b.setAttribute('role','tab');b.setAttribute('aria-controls','stock-tab-pane');b.setAttribute('aria-selected',String(key===explore.tab));tabs.append(b);});
      tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const list=[...tabs.querySelectorAll('button')],index=list.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?list.length-1:(index+(event.key==='ArrowRight'?1:-1)+list.length)%list.length;list[next]?.focus();list[next]?.click();});
      const pane=el('section','stock-tab-pane');pane.id='stock-tab-pane';pane.setAttribute('role','tabpanel');target.replaceChildren(header,quote,tabs,pane);
      window.ZEROCompany?.openMarketCard(company,target);
      if(explore.tab!=='chart')loadChart();
      await switchTab(explore.tab,false);
    }
    async function switchTab(tab,updateAddress=true){
      explore.tab=tab;++explore.compareSequence;const identity=explore.identity,pane=document.getElementById('stock-tab-pane'),newsSequence=++companyNewsSequence;if(!pane)return;
      if(updateAddress)stockAddress();
      pane.setAttribute('aria-labelledby','stock-tab-'+tab);
      document.querySelectorAll('[data-stock-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.stockTab===tab);b.setAttribute('aria-selected',String(b.dataset.stockTab===tab));});
      delete pane.dataset.researchRequest;
      orderTicket?.destroy();orderTicket=null;
      pane.replaceChildren();if(tab==='chart'){chartPanel(pane);if(explore.chart?.range===explore.range)rebuildChart();else await loadChart();return;}
      const company=companyById(identity);
      if(tab==='order'){
        orderTicket=window.ZEROMTSOrders?.mount(company,pane);
        const ticket=pane.querySelector('.mts-orders');if(ticket)ticket.open=true;
        if(!orderTicket)pane.append(el('p','stock-empty','주문 초안을 불러오지 못했습니다. 실제 제출은 차단되어 있습니다.'));
        return;
      }
      pane.append(el('p','muted-note','자료를 불러오는 중입니다.'));
      if(tab==='compare'){await comparisonPanel(pane,company);return;}
      if(tab==='fund'){const section=await window.ZEROFunds?.section(identity);if(explore.identity===identity&&explore.tab===tab)pane.replaceChildren(section||el('p','stock-empty','이 ETF의 구성 자료는 수집되지 않았습니다.'));return;}
      if(tab==='company'){await window.ZEROResearch?.renderInto?.(identity,pane);return;}
      if(tab==='news'){await companyNewsPane(pane,company,newsSequence);return;}
      const desk=await window.ZERODesk?.load();if(explore.identity!==identity||explore.tab!==tab)return;pane.replaceChildren();
      if(tab==='financials'){financials(pane,company,desk?.companies?.find(c=>c.id===identity));return;}
      if(tab==='opinion'){opinionPanel(pane,company,desk?.companies?.find(c=>c.id===identity));return;}
    }
    function readCompanyNews(identity,force=false){
      let entry=companyNewsCache.get(identity);if(!entry){entry={data:null,failed:false,promise:null};companyNewsCache.set(identity,entry);}
      if(entry.promise)return entry.promise;
      if(entry.data&&!force)return Promise.resolve(entry);
      // Reuse source-stamped session data; an explicit reload rereads saved data, never a broker or article body.
      entry.promise=(async()=>{const response=await fetch('api/company-news?identity='+encodeURIComponent(identity),{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(!companyNewsValid(data,identity))throw Error();entry.data=data;entry.failed=false;return entry;})().catch(()=>{entry.failed=true;return entry;}).finally(()=>{entry.promise=null;});return entry.promise;
    }
    async function companyNewsPane(pane,company,sequence,force=false){
      const identity=company.id;if(company.kind==='ETF'){pane.replaceChildren(el('p','stock-empty','회사별 기사 목록은 순위권 기업을 대상으로 수집합니다. ETF는 구성 자산·발행사 자료와 경제 뉴스를 함께 확인하세요.'),button('경제 전체 뉴스 보기',()=>window.ZERO?.navigate?.('news')));return;}
      const entry=await readCompanyNews(identity,force);
      // A late issuer response cannot overwrite a different company, tab or page.
      if(sequence!==companyNewsSequence||explore.identity!==identity||explore.tab!=='news'||window.ZERO?.currentView&&window.ZERO.currentView()!=='workbench'||document.getElementById('stock-tab-pane')!==pane)return;
      pane.replaceChildren();const heading=el('div','stock-company-news-heading');heading.append(el('h3','','기업 관련 뉴스'),button('저장 기사 다시 불러오기',()=>{pane.replaceChildren(el('p','muted-note','저장 기사 목록을 불러오는 중입니다.'));return companyNewsPane(pane,company,++companyNewsSequence,true);}));pane.append(heading);
      const data=entry.data,status=el('p','muted-note');status.id='company-news-status';status.setAttribute('role','status');
      if(!data){status.textContent='저장 기사 목록을 불러오지 못했습니다. 현재 기사 수는 미확인입니다.';pane.append(status,button('경제 전체 뉴스 보기',()=>window.ZERO?.navigate?.('news')));return;}
      const matches=data.items.filter(item=>relatedNews(company,item)),references=data.items.filter(item=>!relatedNews(company,item));
      const copy={AVAILABLE:'제목 일치 '+matches.length+'개 · 참고 후보 '+references.length+'개',EMPTY:'수집 완료 · 피드 반환 기사 0개',STALE:'최근 수집 실패 · 이전 저장 목록 · 제목 일치 '+matches.length+'개 · 참고 후보 '+references.length+'개',UNAVAILABLE:'사용 가능한 저장 기사 목록 미확인'};status.textContent=(entry.failed?'화면 불러오기 실패 · 이전 저장 목록 · ':'')+copy[data.status];pane.append(status);
      const clock=value=>value?dateLabel(Date.parse(value)/1000,'KR',true):'기록 없음';
      pane.append(el('p','stock-company-news-brief','회사명·티커가 제목에 있는 후보를 먼저 표시합니다. 본문 미확인.'));
      const notes=el('details','stock-company-news-notes');notes.append(el('summary','','수집 범위·확인 시각'),el('p','stock-company-news-clock','마지막 성공 수집 '+clock(data.collected_at)+' · '+(data.checked_at?'마지막 수집 시도 '+clock(data.checked_at):'수집 시도 기록 없음')),el('p','muted-note','Yahoo Finance RSS의 종목조회에서 반환된 최대 50개 읽기 후보입니다. 제공 피드 범위의 목록이며 인터넷 전체 뉴스를 전수 조사한 결과가 아닙니다. 제목 일치는 직접 관련성의 독립 검토 결과가 아닙니다. 원제목과 연결 원문만 제공하며 본문 요약을 만들지 않습니다.'),el('p','muted-note','자동 수집된 마지막 저장 자료입니다. 다시 불러오기는 저장 목록을 읽으며, 거시경제의 5문장 해설은 주요 뉴스에서 별도로 볼 수 있습니다.'));pane.append(notes);
      const articleFor=item=>{const article=el('article','stock-news stock-company-news-item'),title=el('h3'),url=companyNewsURL(item.url),active=url.protocol==='https:',link=el(active?'a':'span',active?'research-link':'');
        // Preserve supplied HTTP metadata for two known sources; never invent HTTPS or forward credentials.
        if(active){link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';}link.textContent=item.title;title.append(link);
        const published=item.published_at?'발행 '+clock(item.published_at):item.published_date?'발행 '+item.published_date+' · 시각 미확인':'발행일 미확인',metadata=el('details','stock-company-news-item-details');metadata.append(el('summary','','출처·목록 확인'),el('p','stock-company-news-meta','제공: Yahoo Finance RSS · 연결 도메인 '+url.hostname),el('p','stock-company-news-meta',published+' · 목록 확인 '+clock(item.retrieved_at)));if(!active)metadata.append(el('p','stock-company-news-meta','HTTPS 원문 링크 미제공'));article.append(title,el('p','stock-company-news-meta',(item.published_date?'발행 '+item.published_date:item.published_at?'발행 '+item.published_at.slice(0,10):'발행일 미확인')+' · '+url.hostname),metadata);return article;
      };
      matches.forEach(item=>pane.append(articleFor(item)));
      if(!matches.length&&data.items.length)pane.append(el('p','stock-empty','제목에 회사명·티커가 있는 기사는 없습니다. 함께 반환된 참고 후보는 아래에서 볼 수 있습니다.'));
      if(references.length){const detail=el('details','stock-company-news-references');detail.append(el('summary','','산업·참고 후보 '+references.length+'개'),el('p','muted-note','제목에 회사명·티커가 확인되지 않은 피드 후보입니다. 산업 또는 해당 기업과의 관련성은 원문에서 확인해 주세요.'));references.forEach(item=>detail.append(articleFor(item)));pane.append(detail);}
      if(!data.items.length)pane.append(el('p','stock-empty',data.status==='EMPTY'?'이번 성공 수집에서 확인한 기사가 없습니다.':'현재 기사 목록을 확인하지 못했습니다. 이전 성공 자료와 시도 시각을 구분해 주세요.'));
      pane.append(button('경제 전체 뉴스 보기',()=>window.ZERO?.navigate?.('news')));
    }
    function financials(pane,company,detail){
      // Corporate revenue multiples do not describe a fund; lead directly to its underlying assets.
      if(company.kind==='ETF'){pane.append(el('h3','','ETF는 편입자산으로 살펴보세요'),el('p','stock-empty','ETF에 개별 기업의 매출·순이익·PER를 그대로 적용하지 않습니다. 편입종목과 비중, 발행사의 기준일을 함께 확인하세요.'),button('ETF 구성 보기',()=>switchTab('fund')));return;}
      const annual=company.financials||{},metrics=el('dl','stock-financials');
      const data=[['연간 매출',displayMoney(annual.revenue,annual.currency)],['연간 영업이익',displayMoney(annual.operating_income,annual.currency)],['PER',numeric(detail?.ratios?.per)>0?fm(detail.ratios.per)+'배':'근거 없음'],['PBR',numeric(detail?.ratios?.pbr)>0?fm(detail.ratios.pbr)+'배':'근거 없음'],['PSR',numeric(detail?.ratios?.psr)>0?fm(detail.ratios.psr)+'배':'근거 없음']];
      data.forEach(([label,value])=>{const group=el('div');group.append(el('dt','',label),el('dd','',value));metrics.append(group);});
      pane.append(el('h3','','실적과 가치평가'),metrics,el('p','muted-note','연간 회계기간 종료 '+(annual.period_end||'미확인')+' · 통화 '+(annual.currency||'미확인')+'. PER·PBR·PSR은 제공자 현재 지표이며 세부 분모·가격 기준일 대조 전입니다.'));
      if(explore.currency!=='NATIVE')pane.append(el('p','muted-note',fxNote()));
      const rows=detail?.quarterly_margins||[];if(rows.length){const table=el('table','detail-table'),head=el('tr');['분기','순이익률','전 분기 이익 변화'].forEach(t=>head.append(el('th','',t)));const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');rows.slice(-8).reverse().forEach(r=>{const tr=el('tr');tr.append(el('td','',r.period),el('td','',Number.isFinite(numeric(r.net_margin_percent))?fm(r.net_margin_percent)+'%':'근거 없음'),el('td','',Number.isFinite(numeric(r.net_profit_growth_percent))?fm(r.net_profit_growth_percent)+'%':'근거 없음'));body.append(tr);});table.append(body);pane.append(el('h3','','분기 수익성'),table);}
      pane.append(el('p','muted-note','순이익률=순이익÷매출×100. 일회성 이익·적자 전환·레버리지에 따라 해석이 달라집니다. 미래 수익률을 뜻하지 않습니다.'));
      if(annual.source_url)pane.append(window.ZEROResearch.link('연간 실적 출처',annual.source_url));
      (detail?.sources||[]).forEach(s=>pane.append(window.ZEROResearch.link(s.label,s.url)));
    }
    function opinionPanel(pane,company,detail){
      explore.opinionDetail=detail;const chart=explore.chart?.identity===company.id?explore.chart:null,view=stockOpinion(company,detail,chart);pane.replaceChildren(el('h3','',company.name+' · 지금 사도 될까?'),el('p','stock-opinion-verdict','신규 매수 판단 보류 · 연구 의견'),el('p','','현재 자료로는 매수가격의 적정성과 주문 승인 조건을 확인할 수 없습니다. 확인한 사실과 다음에 조사할 조건을 연결해 봅니다.'));
      renderStockDebate(pane,view.debate);
      if(view.annual){const f=view.annual;pane.append(el('h4','','확인한 사업 실적'),el('p','',(f.period_end||'회계기간 미확인')+' 연간 매출 '+displayMoney(f.revenue,f.currency)+', 영업이익 '+displayMoney(f.operating_income,f.currency)+'. '+(f.operating_income===null?'영업이익 근거가 부족합니다.':f.operating_income<0?'이 기간에는 영업손실을 기록해 비용과 수익 구조를 먼저 확인해야 합니다.':'영업이익이 기록돼도 현재 주가의 저평가를 뜻하지 않습니다.')));}else pane.append(el('p','muted-note',company.kind==='ETF'?'ETF는 개별 회사의 매출·이익 대신 편입자산, 분배 재원, 보수와 파생상품 구조를 확인합니다.':'비교 가능한 연간 실적 근거 없음 · 공식 재무공시 확인이 필요합니다.'));
      const ratios=el('dl','stock-financials');['per','pbr','psr'].forEach(key=>{const group=el('div');group.append(el('dt','',key.toUpperCase()),el('dd','',stockNumber(view.ratios?.[key])>0?fm(view.ratios[key])+'배':'해석 보류'));ratios.append(group);});if(company.kind==='COMPANY')pane.append(ratios,el('p','muted-note','PER·PBR·PSR은 제공자 현재 지표입니다. 주가 기준일과 분모·회계기간을 독립 대조하지 않았고, 배수가 낮다는 이유만으로 매수 결론을 만들지 않습니다.'));
      const list=(title,items)=>{pane.append(el('h4','',title));const ul=el('ul');items.forEach(text=>ul.append(el('li','',text)));pane.append(items.length?ul:el('p','muted-note','확인된 근거 없음'));};
      list('긍정적으로 보려면 확인할 조건',view.drivers);list('반대 근거와 사업 위험',view.risks);
      const mdd=el('section','stock-mdd');mdd.id='stock-opinion-mdd';renderDrawdown(mdd,chart);pane.append(mdd,el('h4','','매수 결론에 부족한 근거'),el('p','','공식 공시와 현재 가격의 독립 대조, 적정가치·평가 기준, 수수료·환전비용·세금의 근거가 부족합니다. 장기 가격 낙폭은 과거 관찰이며 앞으로의 손실 상한이나 매수 신호가 아닙니다. 투자 승인 기준이 설정·검증되기 전에는 실행 가능한 매수 판정을 내리지 않습니다.'));
      if(explore.currency!=='NATIVE')pane.append(el('p','muted-note',fxNote()));
      pane.append(el('h4','','근거와 확인 시각'));const groups=new Map();[...(company.sources||[]),...(detail?.sources||[])].forEach(source=>{const key=source.label+'|'+String(source.retrieved_at).slice(0,16);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(source);});groups.forEach(group=>{const first=group[0],line=el('p');line.append(window.ZEROResearch?.link?.(first.label,first.url),el('span','market-label','확인 '+dateLabel(Date.parse(first.retrieved_at)/1000,'KR',true)));if(group.length>1){const more=el('details','source-more');more.append(el('summary','','같은 출처 '+(group.length-1)+'건 더 보기'));group.slice(1).forEach((source,index)=>{const row=el('p');row.append(window.ZEROResearch?.link?.(source.label+' '+(index+2),source.url));more.append(row);});line.append(more);}pane.append(line);});if(company.financials?.source_url)pane.append(window.ZEROResearch?.link?.('연간 실적 원문',company.financials.source_url));
      const request=el('div','stock-research-request'),label=el('label','','다음 조사 질문'),input=el('textarea');input.rows=2;input.maxLength=900;input.value=company.name+'의 공식 공시와 현재 평가 근거를 확인하고 매수 판단에 부족한 조건을 조사해 주세요.';input.setAttribute('aria-label','종목 연구 요청 질문');label.append(input);const status=el('p','muted-note');status.setAttribute('role','status');
      const submit=button('팀에 연구 요청',async()=>{if(!input.value.trim()){status.textContent='조사할 질문을 입력해 주세요.';return;}if(!window.ZEROOffice?.requestResearch){status.textContent='연구 요청 창을 아직 연결하지 못했습니다. 팀 사무실에서 기업 연구를 요청하세요.';return;}submit.disabled=true;try{const opened=await window.ZEROOffice.requestResearch({identity:company.id,instruction:input.value.trim(),job_type:'COMPANY_RESEARCH'});if(opened===false)throw Error();status.textContent='팀 사무실에서 담당자와 요청 내용을 확인하세요. 제출 상태는 실제 저장 결과를 확인합니다.';}catch(_){status.textContent='연구 요청 창을 열지 못했습니다. 다시 시도해 주세요.';}finally{submit.disabled=false;}});request.append(label,submit,status);pane.append(request,el('p','muted-note','이 화면의 연구 의견은 주문·비중 변경 권한을 가지지 않습니다. 가상의 전문가가 검토를 완료했다고 표시하지 않습니다.'));
    }
    async function comparisonPanel(pane,company){
      pane.replaceChildren(el('h3','','두 종목의 같은 기간 비교'));const controls=el('div','stock-comparison-controls'),label=el('label','','비교할 종목 '),select=el('select');select.setAttribute('aria-label','비교할 두 번째 종목');explore.catalog.filter(c=>c.id!==company.id).sort((a,b)=>a.name.localeCompare(b.name,'ko')).forEach(c=>{const option=el('option','',c.name+' · '+c.symbol+' · '+c.market);option.value=c.id;select.append(option);});
      if(!explore.catalog.some(c=>c.id===explore.compareIdentity&&c.id!==company.id))explore.compareIdentity=explore.catalog.find(c=>c.id!==company.id&&c.kind==='COMPANY')?.id||explore.catalog.find(c=>c.id!==company.id)?.id;stockAddress(true);select.value=explore.compareIdentity||'';label.append(select);const periodLabel=el('label','','비교 기간 '),period=el('select');period.setAttribute('aria-label','두 종목의 일봉 비교 기간');[['3M','3개월'],['1Y','1년'],['5Y','5년']].forEach(([value,text])=>{const option=el('option','',text);option.value=value;period.append(option);});period.value=explore.compareRange;periodLabel.append(period);controls.append(label,periodLabel);
      const result=el('section','stock-comparison-result');result.id='stock-comparison-result';result.setAttribute('aria-live','polite');pane.append(controls,result);select.addEventListener('change',()=>{explore.compareIdentity=select.value;stockAddress();loadComparison(result,company);});period.addEventListener('change',()=>{explore.compareRange=period.value;stockAddress();loadComparison(result,company);});await loadComparison(result,company);
    }
    async function loadComparison(result,company){
      const sequence=++explore.compareSequence,identity=company.id,other=companyById(explore.compareIdentity),range=explore.compareRange,current=()=>sequence===explore.compareSequence&&explore.identity===identity&&explore.tab==='compare'&&document.getElementById('stock-comparison-result')===result&&(!window.ZERO?.currentView||window.ZERO.currentView()==='workbench');result.replaceChildren(el('p','muted-note','두 종목의 완료 일봉을 확인하는 중입니다.'));
      if(!other||other.id===identity){result.replaceChildren(el('p','stock-empty','서로 다른 두 종목을 선택해 주세요.'));return;}
      try{const read=async id=>{const response=await fetch('api/chart?identity='+encodeURIComponent(id)+'&range='+range,{cache:'no-store'});if(!response.ok)throw Error();const chart=await response.json();if(!stockChartValid(chart,id,range))throw Error();return chart;};const charts=await Promise.all([read(identity),read(other.id)]);if(!current())return;const comparison=alignStockCharts(...charts);result.replaceChildren();if(comparison.status==='UNAVAILABLE'){result.append(el('p','stock-empty','공통된 완료 일봉이 2개 이상 필요합니다. 빈 날짜를 가짜 가격으로 채우지 않습니다.'));return;}
        result.append(el('p','muted-note',(comparison.status==='STALE'?'이전 저장 자료 포함 · ':'')+comparison.start_date+' → '+comparison.end_date+' · 공통 '+comparison.rows.length+'개 거래일 · 각 시장의 현지 날짜로 대응하며 종가 시각은 다릅니다.'));
        const table=el('table','detail-table'),head=el('thead'),hr=el('tr'),body=el('tbody'),tableRows=[[company,comparison.first],[other,comparison.second]].map(([c,row])=>({id:c.id,name:c.name,...row}));let sortKey=null,descending=true;const value=(row,key)=>key==='return_percent'?row.return_percent:row.mdd[key];const fill=()=>{body.replaceChildren();(sortKey?sortStockRows(tableRows,row=>value(row,sortKey),descending):tableRows).forEach(row=>{const tr=el('tr');[row.name,row.currency,fm(row.return_percent)+'%',fm(row.mdd.mdd_percent)+'%',String(row.mdd.sample_count)+'개'].forEach(text=>tr.append(el('td','',text)));body.append(tr);});};[['종목',null],['종가 통화',null],['기간 가격 변화','return_percent'],['기간 MDD','mdd_percent'],['완료 종가 표본','sample_count']].forEach(([text,key])=>{const th=el('th');th.setAttribute('scope','col');if(key){const control=button(text+' ↕',()=>{descending=sortKey===key?!descending:true;sortKey=key;[...hr.children].forEach(cell=>cell.setAttribute('aria-sort',cell===th?(descending?'descending':'ascending'):'none'));fill();});control.setAttribute('aria-label',text+' 정렬 방향 변경');th.append(control);}else th.textContent=text;hr.append(th);});head.append(hr);table.append(head,body);fill();const tableWrap=el('div','stock-comparison-table');tableWrap.tabIndex=0;tableWrap.setAttribute('role','region');tableWrap.setAttribute('aria-label','두 종목 비교 수치');tableWrap.append(table);result.append(tableWrap);
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 700 240');svg.setAttribute('role','img');svg.setAttribute('aria-label',company.name+'와 '+other.name+'의 공통 시작 종가 100 기준 가격 변화');svg.classList.add('stock-comparison-plot');const values=comparison.rows.flatMap(r=>[r.first_index,r.second_index]),low=Math.min(...values),high=Math.max(...values),span=Math.max(1,high-low),y=value=>215-(value-low)/span*190;[['first_index','#3182f6'],['second_index','#d15b45']].forEach(([key,color])=>{const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('fill','none');line.setAttribute('stroke',color);line.setAttribute('stroke-width','2');line.setAttribute('points',comparison.rows.map((r,i)=>(15+i/(comparison.rows.length-1)*670).toFixed(2)+','+y(r[key]).toFixed(2)).join(' '));svg.append(line);});result.append(svg,el('p','stock-comparison-legend','파랑 '+company.name+' · 주황 '+other.name+' · 공통 시작 종가 = 100'));
        const cards=el('div','stock-comparison-cards');charts.forEach((chart,i)=>{const section=el('section','stock-mdd');const start=comparison.start_date,end=comparison.end_date;renderDrawdown(section,{...chart,bars:chart.bars.filter(bar=>{const day=stockSessionDate(bar.time,chart.market);return day>=start&&day<=end;})},[company,other][i].name+' · '+range);cards.append(section);const last=chart.bars.at(-1);result.append(el('p','muted-note',[company,other][i].name+' 최근 완료 종가 '+displayMoney(last?.close,chart.currency)+' · 가격 기준 '+quoteBasis(chart,last)+' · 자료 확인 '+dateLabel(Date.parse(chart.retrieved_at)/1000,'KR',true)));});result.append(cards,el('p','muted-note','가격수익률·MDD는 각 원통화의 종가 기준입니다. 선은 공통 관측일만 연결하고, MDD는 공통 시작·종료 사이 각 종목의 모든 실제 봉을 포함합니다. 배당·거래비용·환율수익률 제외 · 휴장과 빠진 가격을 보간하지 않습니다.'));if(explore.currency!=='NATIVE')result.append(el('p','muted-note',fxNote()));
      }catch(_){if(current())result.replaceChildren(el('p','stock-empty','두 종목의 비교 자료를 확인하지 못했습니다. 종목 또는 기간을 바꿔 주세요.'));}
    }
    function openLightweightChart(){
      const src=lightweightChartLink(explore.identity,explore.range);if(!src)return;
      const dialog=el('dialog'),heading=el('h3','','Lightweight 차트'),frame=el('iframe');
      dialog.setAttribute('aria-label','Lightweight 차트');dialog.style.width='min(900px, 90vw)';dialog.style.height='340px';
      frame.title='완료된 공개 OHLCV Lightweight 차트';frame.height='240';frame.style.width='100%';frame.style.border='0';frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';frame.src=src;
      const close=button('닫기',()=>dialog.close()),retry=button('다시 불러오기',()=>{frame.src=src;});
      dialog.append(heading,frame,el('p','muted-note','불러오기 실패 시 다시 시도하거나 창을 닫고 기본 차트를 이용하세요. 완료 봉 · 배당 제외 · 주문 권한 없음.'),retry,close);
      dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();close.focus();
    }
    function chartPanel(pane){
      const controls=el('div','stock-controls');
      ['1D','1W','1M','3M','1Y','5Y'].forEach(r=>{const b=button({'1D':'1일','1W':'1주','1M':'1개월','3M':'3개월','1Y':'1년','5Y':'5년'}[r],()=>{explore.range=r;stockAddress();loadChart();});b.dataset.stockRange=r;controls.append(b);});
      const intervals=el('div','stock-controls');[['1m','1분'],['10m','10분'],['60m','60분'],['1d','일봉']].forEach(([key,label])=>{const b=button(label,()=>{explore.interval=key;stockAddress();explore.count=explore.chart?.bars.length||100;rebuildChart();});b.dataset.stockInterval=key;intervals.append(b);});
      const appearance=el('div','stock-controls');[['candle','캔들'],['line','라인']].forEach(([key,label])=>{const b=button(label,()=>{explore.kind=key;draw();});b.dataset.stockKind=key;appearance.append(b);});
      [5,20,60].forEach(period=>{const label=el('label','stock-ma-toggle'),check=el('input');check.type='checkbox';check.checked=explore.averages.has(period);check.addEventListener('change',()=>{check.checked?explore.averages.add(period):explore.averages.delete(period);draw();});label.append(check,el('span','',period+' 이평'));appearance.append(label);});
      const zoom=el('div','stock-controls');zoom.append(button('− 축소',()=>zoomChart(1.35)),button('+ 확대',()=>zoomChart(.75)),button('← 이전',()=>pan(-.4)),button('이후 →',()=>pan(.4)),button('전체',()=>{explore.count=explore.bars?.length||100;explore.start=0;draw();}));
      const status=el('p','stock-chart-status');status.id='stock-chart-status';status.setAttribute('role','status');
      const wrap=el('div','stock-chart-wrap'),canvas=el('canvas','stock-chart');canvas.id='stock-chart';canvas.width=800;canvas.height=350;canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','가격·거래량 차트. 좌우 키로 봉 선택, 더하기·빼기로 확대·축소, Shift와 방향키로 기간 이동');canvas.setAttribute('aria-describedby','stock-chart-readout stock-chart-status');
      const readout=el('p','stock-chart-readout');readout.id='stock-chart-readout';readout.setAttribute('aria-live','polite');
      wrap.append(canvas);const note=el('details','stock-chart-notes');note.append(el('summary','','차트 읽는 법·자료 범위'),el('p','','빨간 캔들은 종가가 시가보다 높은 봉, 파란 캔들은 낮은 봉, 회색은 두 가격이 같은 봉입니다. 가는 선은 고가·저가, 아래 막대는 거래량입니다. 이평은 최근 완료 봉 종가의 평균이며 매매 지시가 아닙니다.'),el('p','','1분·10분·60분은 오늘·1주 범위에서, 60분은 1개월에서, 일봉은 3개월·1년·5년에서 봅니다. 제공자가 준 봉만 표시하고 빈 시간을 가짜 가격으로 채우지 않습니다. 수정주가·배당의 독립 대조 전이며 일부 종목과 기간은 제공자 제한으로 없을 수 있습니다.'),el('p','','마우스·터치로 봉을 고르고 휠로 확대하세요. 키보드 좌우는 봉 선택, +/−는 확대·축소, Shift+좌우는 기간 이동입니다.'));
      const primary=el('div','stock-primary-controls');primary.append(controls,intervals);
      if(window.ZEROTechnicalChart)primary.append(button('분석 차트 · MA20/60',()=>window.ZEROTechnicalChart.open({identity:explore.identity,name:companyById(explore.identity)?.name,range:explore.range,...(explore.chart?{data:explore.chart}:{})})));
      else if(document.querySelector?.('meta[name="zero-lightweight-chart"]')?.content==='./lwc')primary.append(button('Lightweight 차트',openLightweightChart));
      const settings=el('details','stock-chart-settings');settings.append(el('summary','','차트 설정'),appearance,zoom);
      const completion=el('p','muted-note');completion.id='stock-completion-assumption';note.append(completion);
      const mdd=el('section','stock-mdd');mdd.id='stock-mdd';mdd.setAttribute('aria-live','polite');pane.append(primary,settings,status,mdd,wrap,readout,lessonPanel(),note);wireCanvas(canvas);
    }
    function lessonPanel(){
      const teacher=el('section','stock-lesson');teacher.id='stock-lesson';teacher.setAttribute('aria-labelledby','stock-lesson-title');
      const heading=el('h3','','차트 선생님');heading.id='stock-lesson-title';const brief=el('p','stock-lesson-brief','가격 기록을 불러오면 고른 봉을 함께 읽어볼게요.');brief.id='stock-lesson-brief';const averageBrief=el('p','stock-lesson-brief');averageBrief.id='stock-lesson-average';
      const detail=el('details','stock-lesson-detail');detail.append(el('summary','','이 봉을 차근차근 읽어보기'));
      const facts=el('dl','stock-lesson-facts');facts.id='stock-lesson-facts';const quiz=el('div','stock-lesson-quiz'),question=el('p','','스스로 확인: 끝 가격은 시작 가격보다 어떤가요?');
      const feedback=el('p','stock-lesson-feedback');feedback.id='stock-lesson-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
      const choices=el('div','stock-lesson-choices');[['UP','높아요'],['FLAT','같아요'],['DOWN','낮아요']].forEach(([answer,label])=>{const choice=button(label,()=>{if(!teacher.dataset.direction)return;feedback.textContent=(answer===teacher.dataset.direction?'맞아요. ':'시작과 끝 숫자를 다시 비교해 볼까요? ')+teacher.dataset.answer;});choice.disabled=true;choice.setAttribute('aria-controls','stock-lesson-feedback');choices.append(choice);});
      const source=el('p','stock-lesson-source');source.id='stock-lesson-source';const references=el('p','stock-lesson-references');
      [['평균선 더 알아보기','https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/sma'],['주식 차트 읽기','https://www.schwab.com/learn/story/how-to-read-stock-chart']].forEach(([label,url])=>references.append(window.ZEROResearch?.link?.(label,url)||el('span','',label)));
      quiz.append(question,choices,feedback);detail.append(facts,quiz,source,references);teacher.append(heading,brief,averageBrief,detail);return teacher;
    }
    function resetLesson(message){const teacher=document.getElementById('stock-lesson');if(!teacher)return;delete teacher.dataset.direction;delete teacher.dataset.lessonKey;document.getElementById('stock-lesson-brief').textContent=message;['stock-lesson-average','stock-lesson-source','stock-lesson-feedback'].forEach(id=>{document.getElementById(id).textContent='';});document.getElementById('stock-lesson-facts').replaceChildren();teacher.querySelectorAll('.stock-lesson-choices button').forEach(b=>{b.disabled=true;});}
    function teachChart(index){
      const teacher=document.getElementById('stock-lesson');if(!teacher)return;
      if(explore.loading){resetLesson('새 가격 기록을 기다리는 중이에요. 확인되면 고른 봉을 함께 읽어볼게요.');return;}
      const lesson=chartLesson(explore.bars||[],index,explore.interval),chart=explore.chart,key=[explore.identity,explore.interval,index,chart?.retrieved_at,[...explore.averages].join(',')].join('|');
      if(teacher.dataset.lessonKey===key)return;teacher.dataset.lessonKey=key;
      const facts=document.getElementById('stock-lesson-facts'),brief=document.getElementById('stock-lesson-brief'),source=document.getElementById('stock-lesson-source');facts.replaceChildren();document.getElementById('stock-lesson-feedback').textContent='';
      teacher.querySelectorAll('.stock-lesson-choices button').forEach(b=>{b.disabled=lesson.state!=='AVAILABLE';});
      if(lesson.state!=='AVAILABLE'){resetLesson('확인된 완료 봉이 없어 숫자 설명과 연습을 기다리고 있어요.');teacher.dataset.lessonKey=key;source.textContent='가격이 없을 때 예시 가격으로 차트를 채우지 않아요.';return;}
      const bar=lesson.bar,unit=chart.currency==='KRW'?'원':'달러',price=value=>fm(value,20)+' '+unit,color=lesson.direction==='UP'?'빨간 봉':lesson.direction==='DOWN'?'파란 봉':'시작과 끝이 같은 회색 봉';
      teacher.dataset.direction=lesson.direction;teacher.dataset.answer='시작 '+price(bar.open)+' → 끝 '+price(bar.close)+'인 '+color+'이에요.';
      brief.textContent=lesson.intervalLabel+'봉: 시작 '+price(bar.open)+' → 끝 '+price(bar.close)+'인 '+color+'이에요.';
      const average20=lesson.averages.find(a=>a.period===20);document.getElementById('stock-lesson-average').textContent=average20.value===null?'20봉 평균은 '+average20.samples+'/20개라 아직 부족해요.':'20봉 종가 평균은 '+price(average20.value)+'예요. 끝 가격은 '+{UP:'평균보다 높아요',DOWN:'평균보다 낮아요',FLAT:'평균과 같아요'}[average20.priceRelation]+'. '+(average20.slope===null?'직전 평균의 표본이 부족해 기울기는 아직 비교하지 않아요.':'평균은 '+{UP:'직전 봉의 평균보다 올랐어요',DOWN:'직전 봉의 평균보다 내렸어요',FLAT:'직전 봉의 평균과 같아요'}[average20.slope]+'.');
      const add=(title,text)=>facts.append(el('dt','',title),el('dd','',text));
      add('시간과 가격부터 봐요','가로는 기록된 시간 순서, 세로는 가격이에요. 선택한 봉의 기준 시간은 '+dateLabel(bar.time,chart.market,true)+'이에요. '+lesson.intervalLabel+' 단위로 묶었고, 휴장·빠진 시간을 가짜 봉으로 채우지 않아요.');
      add('몸통과 꼬리를 읽어요','몸통은 시작(시가)과 끝(종가) 사이로 '+price(lesson.body)+' 차이예요. 위꼬리 '+price(lesson.upperWick)+', 아래꼬리 '+price(lesson.lowerWick)+'는 몸통 밖의 최고·최저 가격 기록이에요. 빨간색은 그 봉의 끝이 시작보다 높다는 뜻이며 전일 종가보다 높다는 뜻은 아니에요.');
      add('이평은 평균 가격이에요',lesson.averages.map(a=>a.value===null?a.period+'봉 평균: '+a.samples+'/'+a.period+'개라 아직 부족해요.':a.period+'봉 평균: '+price(a.value)+' ('+(explore.averages.has(a.period)?'선 표시 중':'선 숨김')+').').join(' ')+' 각 평균은 선택한 봉까지의 완료 봉 종가를 더해 봉 수로 나눠요. '+(explore.interval==='1d'?'일봉의 20이평은 20개 완료 일봉의 평균이에요. 휴장일을 끼워 달력 20일로 세지 않아요.':'지금 '+lesson.intervalLabel+'봉의 20이평은 20개 완료 봉의 평균이며 20일이라는 뜻이 아니에요.'));
      add('평균선의 움직임은 이렇게 봐요','새 종가가 더해지고 가장 오래된 종가가 빠지면서 평균이 움직여요. 과거 가격을 모은 선이라 실제 가격 변화를 늦게 따라가며, 짧은 봉에서는 작은 흔들림도 눈에 잘 띄어요. 평균 위·아래와 평균의 오르내림은 지금 기록을 읽은 관찰이에요.');
      const volume=lesson.volume;add('거래량은 오간 수량이에요',volume.current===null?'선택한 봉의 거래량을 제공자가 주지 않아 크기를 비교할 수 없어요.':'선택한 봉은 '+fm(volume.current,0)+'주가 거래된 기록이에요. 같은 주식의 반복 거래도 포함하며 사람 수나 거래 금액은 아니에요. '+(volume.average===null?'직전 20봉의 거래량은 '+volume.samples+'/20개만 확인돼 평균 비교를 보류해요.':volume.relative===null?'직전 20봉 평균은 '+fm(volume.average)+'주지만 0인 평균과 배수로 비교하지 않아요.':'직전 20봉 평균 '+fm(volume.average)+'주와 비교하면 '+fm(volume.relative)+'배예요.')+' 거래량만으로 누가 왜 거래했는지는 알 수 없어요.');
      add('관찰한 것과 모르는 것을 나눠요','가격·평균·거래량에서 지금 확인한 숫자를 먼저 말해보세요. 그다음 1일·1개월·1년 범위를 바꿔 작은 움직임과 긴 흐름을 비교해 보세요. 다음 가격이나 매수·매도 시점은 이 기록만으로 정할 수 없어요. 기업정보·재무 탭에서 실적과 가치평가를, 관련 뉴스에서 배경을 함께 확인하세요.');
      source.textContent=(chart.status==='STALE'?'이전 저장가격으로 보는 연습이에요. ':'')+'선택한 봉까지 '+lesson.count+'개 완료 봉 · 자료 확인 '+dateLabel(Date.parse(chart.retrieved_at)/1000,'KR',true)+' · 소수점 둘째 자리까지 절삭해 보여 주며, 줄인 값은 눌러 전체 값을 확인할 수 있어요. 수정주가·배당의 독립 대조 전이며 실제 가격 이동 순서는 한 봉에 모두 담기지 않아요.';
    }
    async function loadChart(){
      const identity=explore.identity,range=explore.range,sequence=++explore.sequence,status=document.getElementById('stock-chart-status');
      // A new history request cannot project the previous identity or period into risk observations.
      explore.loading=true;explore.chart=null;explore.bars=[];rebuildChart();
      if(status)status.textContent='공개 가격 이력을 확인하는 중입니다.';resetLesson('새 가격 기록을 기다리는 중이에요. 확인되면 고른 봉을 함께 읽어볼게요.');
      document.querySelectorAll('[data-stock-range]').forEach(b=>{b.classList.toggle('active',b.dataset.stockRange===range);b.setAttribute('aria-pressed',String(b.dataset.stockRange===range));});
      try{const response=await fetch('api/chart?identity='+encodeURIComponent(identity)+'&range='+range,{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();
        // The quote belongs to the company, not the active tab; still reject another company's late response.
        if(sequence!==explore.sequence||explore.identity!==identity||explore.range!==range)return;
        if(!stockChartValid(data,identity,range))throw Error();
        explore.chart=data;explore.loading=false;explore.cursor=null;explore.interval=data.interval==='1m'?(explore.interval==='10m'||explore.interval==='60m'?explore.interval:'1m'):data.interval;stockAddress(true);explore.count=data.bars.length;rebuildChart();
      }catch(_){if(sequence!==explore.sequence||explore.identity!==identity||explore.range!==range)return;explore.chart=null;explore.loading=false;explore.bars=[];rebuildChart();if(status)status.textContent='이 종목의 가격 이력을 확인하지 못했습니다. 실제 가격 대신 가상 차트를 표시하지 않습니다.';}
    }
    function rebuildChart(){
      const chart=explore.chart,raw=chart?.bars||[];explore.bars=chart?.interval==='1m'&&explore.interval!=='1m'?aggregateBars(raw,parseInt(explore.interval,10),chart.market,Date.parse(chart.checked_at)/1000):raw;
      const warning=chart?.error_code==='DISPLAY_SNAPSHOT_OLDER'?'이전 저장가격 표시 · 기준시각 확인 · ':chart?.status==='STALE'?'최근 조회 실패 · 이전 가격 표시 · ':chart?.error_code==='CACHE_WRITE_FAILED'?'가격 확인됨 · 캐시 저장 실패 · ':'';
      explore.start=Math.max(0,explore.bars.length-explore.count);explore.cursor=null;
      document.querySelectorAll('[data-stock-interval]').forEach(b=>{const allowed=chart?.interval==='1m'?['1m','10m','60m']:chart?.interval?[chart.interval]:[];b.disabled=!allowed.includes(b.dataset.stockInterval);b.classList.toggle('active',b.dataset.stockInterval===explore.interval);b.setAttribute('aria-pressed',String(b.dataset.stockInterval===explore.interval));});
      renderQuote();renderDrawdown(document.getElementById('stock-mdd'),chart);
      // A late price reply updates evidence only; it must not erase a research question being typed.
      if(explore.tab==='opinion'){
        renderDrawdown(document.getElementById('stock-opinion-mdd'),chart);
        const pane=document.getElementById('stock-tab-pane'),company=companyById(explore.identity);
        if(pane?.querySelector('.stock-debate')&&company)renderStockDebate(pane,stockOpinion(company,explore.opinionDetail,chart).debate);
      }
      const status=document.getElementById('stock-chart-status');if(status){
        status.replaceChildren(el('span','',warning),el('span','',explore.bars.length?'완료 봉 '+explore.bars.length+'개 · 자료 확인 '+dateLabel(Date.parse(chart?.retrieved_at)/1000,'KR',true):'이 기간의 완료 봉을 확인하지 못했습니다.'));if(chart?.source_url){status.append(window.ZEROResearch.link('가격 출처',chart.source_url));}
      }
      const completion=document.getElementById('stock-completion-assumption');if(completion)completion.textContent=chart?.completion_assumption||'';
      draw();
    }
    function dateLabel(epoch,market,full=false){return Number.isFinite(epoch)?new Intl.DateTimeFormat('ko-KR',{timeZone:market==='KR'?'Asia/Seoul':'America/New_York',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,...(full?{year:'numeric'}:{})}).format(new Date(epoch*1000))+(market==='KR'?' 서울':' 뉴욕'):'미확인';}
    function zoomChart(factor){const length=explore.bars?.length||0;if(!length)return;const middle=explore.start+explore.count/2;explore.count=Math.max(12,Math.min(length,Math.round(explore.count*factor)));explore.start=visibleWindow(length,explore.count,middle-explore.count/2).start;draw();}
    function pan(fraction){explore.start=visibleWindow(explore.bars?.length||0,explore.count,explore.start+explore.count*fraction).start;draw();}
    function draw(){
      const canvas=document.getElementById('stock-chart');if(!canvas||explore.tab!=='chart')return;const context=canvas.getContext('2d');if(!context)return;
      const width=Math.max(280,canvas.clientWidth||800),height=350,ratio=window.devicePixelRatio||1;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);canvas.style.height=height+'px';context.scale(ratio,ratio);context.clearRect(0,0,width,height);
      const all=explore.bars||[],range=visibleWindow(all.length,explore.count,explore.start),bars=all.slice(range.start,range.end);explore.start=range.start;
      const readout=document.getElementById('stock-chart-readout');if(!bars.length){context.fillStyle='#6b7684';context.font='14px sans-serif';context.fillText('확인된 완료 봉 없음',20,60);if(readout)readout.textContent='가격 자료 없음';teachChart(-1);return;}
      const left=12,right=68,top=22,bottom=260,volumeBottom=320,plotWidth=width-left-right,step=plotWidth/bars.length;
      const averageLines=[[5,'#b78618'],[20,'#8b5cf6'],[60,'#00a38c']].filter(([period])=>explore.averages.has(period)).map(([period,color])=>({period,color,values:movingAverage(all,period).slice(range.start,range.end)}));
      // Panned history can leave an average far above the visible prices; include it in the axis.
      const {low,high}=plotBounds(bars,averageLines.map(line=>line.values));
      const y=value=>bottom-(value-low)/(high-low)*(bottom-top),x=index=>left+(index+.5)*step;
      context.font='11px sans-serif';for(let i=0;i<5;i++){const value=low+(high-low)*i/4,at=y(value);context.strokeStyle='#edf0f3';context.beginPath();context.moveTo(left,at);context.lineTo(width-right,at);context.stroke();context.fillStyle='#6b7684';context.fillText(fm(value,explore.chart?.currency==='KRW'?0:2),width-right+8,at+4);}
      const maxVolume=Math.max(1,...bars.map(b=>b.volume||0));bars.forEach((b,i)=>{const color=candleColor(b);context.strokeStyle=color;context.fillStyle=color;const px=x(i);
        if(explore.kind==='candle'){context.beginPath();context.moveTo(px,y(b.high));context.lineTo(px,y(b.low));context.stroke();context.fillRect(px-Math.max(1,Math.min(9,step*.65))/2,Math.min(y(b.open),y(b.close)),Math.max(1,Math.min(9,step*.65)),Math.max(1,Math.abs(y(b.close)-y(b.open))));}
        if(b.volume!==null){context.globalAlpha=.25;context.fillRect(px-step*.3,volumeBottom-(b.volume/maxVolume)*42,Math.max(1,step*.6),(b.volume/maxVolume)*42);context.globalAlpha=1;}
      });
      function line(values,color){context.strokeStyle=color;context.lineWidth=1.5;context.beginPath();let started=false;values.forEach((value,i)=>{if(value===null||!Number.isFinite(value)){started=false;return;}started?context.lineTo(x(i),y(value)):context.moveTo(x(i),y(value));started=true;});context.stroke();context.lineWidth=1;}
      if(explore.kind==='line')line(bars.map(b=>b.close),'#3182f6');
      averageLines.forEach(average=>line(average.values,average.color));
      context.fillStyle='#6b7684';context.fillText('거래량',left,278);context.fillText(dateLabel(bars[0].time,explore.chart?.market),left,344);const endLabel=dateLabel(bars.at(-1).time,explore.chart?.market);context.fillText(endLabel,Math.max(left,width-right-context.measureText(endLabel).width),344);
      const selected=Math.max(0,Math.min(bars.length-1,explore.cursor===null?bars.length-1:explore.cursor)),bar=bars[selected],unit=explore.chart.currency==='KRW'?'원':'달러',price=value=>fm(value,20)+' '+unit;
      if(explore.cursor!==null){context.strokeStyle='#8b95a1';context.setLineDash([3,3]);context.beginPath();context.moveTo(x(selected),top);context.lineTo(x(selected),volumeBottom);context.moveTo(left,y(bar.close));context.lineTo(width-right,y(bar.close));context.stroke();context.setLineDash([]);}
      if(readout)readout.textContent=dateLabel(bar.time,explore.chart?.market,true)+' · 시가 '+price(bar.open)+' · 고가 '+price(bar.high)+' · 저가 '+price(bar.low)+' · 종가 '+price(bar.close)+' · 거래량 '+(bar.volume===null?'미확인':fm(bar.volume,0)+'주');
      teachChart(range.start+selected);
      canvas.dataset.visibleCount=String(bars.length);canvas.dataset.plotWidth=String(plotWidth);document.querySelectorAll('[data-stock-kind]').forEach(b=>{b.classList.toggle('active',b.dataset.stockKind===explore.kind);b.setAttribute('aria-pressed',String(b.dataset.stockKind===explore.kind));});
    }
    function wireCanvas(canvas){
      const point=event=>{const rect=canvas.getBoundingClientRect(),size=Number(canvas.dataset.visibleCount)||0;explore.cursor=Math.max(0,Math.min(size-1,Math.floor((event.clientX-rect.left-12)/(Number(canvas.dataset.plotWidth)/size))));draw();};
      canvas.addEventListener('pointermove',event=>{if(event.buttons===1&&event.pointerType==='mouse'){explore.start=visibleWindow(explore.bars?.length||0,explore.count,explore.start-event.movementX/Math.max(1,canvas.clientWidth)*explore.count).start;}point(event);});canvas.addEventListener('pointerdown',point);
      canvas.addEventListener('wheel',event=>{event.preventDefault();zoomChart(event.deltaY>0?1.15:.85);},{passive:false});
      canvas.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','+','=','-','Escape','Home','End'].includes(event.key))event.preventDefault();if(event.key==='+'||event.key==='=')zoomChart(.75);else if(event.key==='-')zoomChart(1.35);else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){const sign=event.key==='ArrowLeft'?-1:1;if(event.shiftKey)pan(sign*.25);else{explore.cursor=Math.max(0,Math.min(Number(canvas.dataset.visibleCount)-1,(explore.cursor??Number(canvas.dataset.visibleCount)-1)+sign));draw();}}else if(event.key==='Home'){explore.start=0;draw();}else if(event.key==='End'){explore.start=Math.max(0,(explore.bars?.length||0)-explore.count);draw();}else if(event.key==='Escape'){explore.cursor=null;draw();}});
      if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>{if(canvas.isConnected)draw();else observer.disconnect();});observer.observe(canvas);}
    }
    function init(){
      const input=document.getElementById('global-search'),results=document.getElementById('global-search-results');if(!input||!results||input.dataset.zeroWired)return;input.dataset.zeroWired='true';input.setAttribute('aria-controls','global-search-results');input.setAttribute('aria-expanded','false');
      const dismiss=()=>{results.hidden=true;input.setAttribute('aria-expanded','false');};
      input.addEventListener('input',async()=>{const seq=++explore.searchSequence,query=input.value.trim();if(!query){dismiss();return;}const found=await search(query);if(seq!==explore.searchSequence)return;results.replaceChildren();found.slice(0,12).forEach(c=>{const option=row(c);option.setAttribute('role','option');option.addEventListener('click',dismiss);results.append(option);});if(!found.length)results.append(el('p','stock-empty','현재 수집한 기업·보유 종목에서 찾을 수 없습니다.'));results.hidden=false;input.setAttribute('aria-expanded','true');});
      input.addEventListener('keydown',event=>{if(event.key==='Escape')dismiss();else if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('button')?.focus();}else if(event.key==='Enter'){event.preventDefault();results.querySelector('button')?.click();}});
      results.addEventListener('keydown',event=>{const rows=[...results.querySelectorAll('button')],index=rows.indexOf(document.activeElement);if(event.key==='Escape'){dismiss();input.focus();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();rows[Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)))]?.focus();}});
      document.addEventListener('pointerdown',event=>{if(!results.contains(event.target)&&event.target!==input)dismiss();});
    }
    function restoreRoute(){const route=parseStockRoute(window.location?.hash);if(!route)return false;if(explore.identity!==route.identity||explore.tab!==route.tab||explore.range!==route.range||explore.interval!==route.interval||explore.compareIdentity!==route.compareIdentity||explore.compareRange!==route.compareRange)openCompany(route.identity,{...route,updateAddress:false});return true;}
    window.ZEROExplore={search,openCompany,openWatchlist,init,restoreRoute};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  })();
}
