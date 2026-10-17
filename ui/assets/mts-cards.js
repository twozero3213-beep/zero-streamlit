/* Public display cards only: observed prices are never account returns or order instructions. */
(function(root){
'use strict';
const identityOK=value=>typeof value==='string'&&/^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[0-9A-Z]{6})$/.test(value);
const price=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=1e15;
const day=(time,market)=>new Intl.DateTimeFormat('en-CA',{timeZone:market==='KR'?'Asia/Seoul':'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time*1000));
function chartModel(chart,identity,now=Date.now(),range=null){
 if(!identityOK(identity)||!chart||chart.schema_version!==1||chart.identity!==identity||!['AVAILABLE','STALE'].includes(chart.status)||!['1D','1W','1M','3M','1Y','5Y'].includes(chart.range)||range&&chart.range!==range||!['1m','60m','1d'].includes(chart.interval)||chart.basis!=='UNADJUSTED_PROVIDER_COMPLETED_OHLCV'||chart.market!==identity.slice(0,2)||chart.currency!==(chart.market==='KR'?'KRW':'USD')||!Array.isArray(chart.bars)||chart.bars.length<1||chart.bars.length>2200)return null;
 const clock=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now;
 if(!clock(chart.checked_at)||!clock(chart.retrieved_at)||Date.parse(chart.retrieved_at)>Date.parse(chart.checked_at))return null;
 try{const url=new URL(chart.source_url),symbol=identity.slice(3),expected=chart.market==='KR'?[symbol+'.KS',symbol+'.KQ']:[symbol.replaceAll('.','-')];if(url.protocol!=='https:'||!['query1.finance.yahoo.com','query2.finance.yahoo.com'].includes(url.hostname)||url.port||url.username||url.password||url.hash||[...url.searchParams.keys()].some(key=>!['range','interval','includePrePost'].includes(key))||!expected.some(value=>url.pathname==='/v8/finance/chart/'+value))return null;}catch(_){return null;}
 if(chart.bars.some((bar,index)=>!bar||!Number.isFinite(bar.time)||bar.time<=0||bar.time*1000>Date.parse(chart.retrieved_at)||index>0&&bar.time<=chart.bars[index-1].time||!['open','high','low','close'].every(key=>price(bar[key]))||bar.low>bar.open||bar.low>bar.close||bar.high<bar.open||bar.high<bar.close||bar.low>bar.high||!(bar.volume===null||typeof bar.volume==='number'&&Number.isFinite(bar.volume)&&bar.volume>=0)))return null;
 const closes=new Map();for(const bar of chart.bars){const date=day(bar.time,chart.market);if(chart.interval==='1d'&&closes.has(date))return null;closes.set(date,bar);}const sessions=[...closes.entries()],last=chart.bars.at(-1),previous=sessions.at(-2),change=previous?(last.close/previous[1].close-1)*100:null;
 return {identity,currency:chart.currency,status:chart.status==='STALE'||chart.error_code==='DISPLAY_SNAPSHOT_OLDER'?'STALE':'AVAILABLE',range:chart.range,interval:chart.interval,price:last.close,as_of:new Date(last.time*1000).toISOString(),retrieved_at:chart.retrieved_at,source_url:chart.source_url,change_percent:Number.isFinite(change)?change:null,change_label:chart.interval==='1d'?'직전 완료일 대비':'전 거래일 관측 대비',change_dates:previous?[previous[0],sessions.at(-1)[0]]:null,bars:chart.bars.map(bar=>({time:bar.time,close:bar.close}))};
}
function sparkPoints(bars){
 if(!Array.isArray(bars)||bars.length<2||bars.length>2200||bars.some((bar,index)=>!bar||!price(bar.close)||!Number.isFinite(bar.time)||index>0&&bar.time<=bars[index-1].time))return '';
 const low=Math.min(...bars.map(bar=>bar.close)),high=Math.max(...bars.map(bar=>bar.close)),start=bars[0].time,span=bars.at(-1).time-start;
 return bars.map(bar=>((bar.time-start)/span*72+2).toFixed(2)+','+(high===low?16:28-(bar.close-low)/(high-low)*24).toFixed(2)).join(' ');
}
function createLoader({fetch:read,now=Date.now,onChange=()=>{}}){
 const cache=new Map();let queue=[],active=0,visible=[];
 function peek(identity){const entry=cache.get(identity);return entry&&entry.until>now()?entry.model:null;}
 function pump(){while(active<2&&queue.length){const identity=queue.shift(),old=cache.get(identity);if(old&&(old.pending||old.until>now()))continue;
  if(cache.size>=120){const oldest=[...cache].find(([key,value])=>!value.pending&&!visible.includes(key));if(oldest)cache.delete(oldest[0]);}
  const entry={pending:true,model:null,until:0};cache.set(identity,entry);active++;
  (async()=>{try{const response=await read('api/chart?identity='+encodeURIComponent(identity)+'&range=1M',{method:'GET',cache:'no-store',credentials:'same-origin',redirect:'error',signal:typeof AbortSignal!=='undefined'?AbortSignal.timeout(4000):undefined});if(!response.ok)throw Error('SERIES_UNAVAILABLE');const data=await response.json();entry.model=chartModel(data,identity,now(),'1M');entry.until=now()+(entry.model?300000:60000);}catch(_){entry.until=now()+60000;}finally{entry.pending=false;active--;pump();onChange();}})();
 }}
 function setVisible(identities){visible=[...new Set(identities.filter(identityOK))].slice(0,10);queue=visible.filter(identity=>{const entry=cache.get(identity);return !entry||!entry.pending&&entry.until<=now();});pump();}
 return {peek,setVisible};
}
if(typeof module!=='undefined'&&module.exports)module.exports={chartModel,sparkPoints,createLoader,identityOK};
if(!root.document)return;
const document=root.document,records=new Set(),byItem=new WeakMap(),observed=new WeakSet();let scheduled=false;
const make=(tag,cls,text)=>{const element=document.createElement(tag);if(cls)element.className=cls;if(text!==undefined)element.textContent=text;return element;};
const loader=createLoader({fetch:(...args)=>root.fetch(...args),onChange:()=>schedule()});
const cut=value=>{const [whole,fraction='']=value.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:20}).split('.');return whole+'.'+fraction.slice(0,2).padEnd(2,'0');};
const money=(value,currency)=>new Intl.NumberFormat('ko-KR',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(cut(value)));
function fullNumber(element,full){element.classList.add('num-t');element.tabIndex=0;element.dataset.full=full;element.title='전체 값 '+full;element.setAttribute('aria-label',element.textContent+', 전체 값 '+full);return element;}
const stamp=value=>{const time=Date.parse(value);return Number.isFinite(time)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(time):'시각 미확인';};
function visible(item){if(!item.isConnected||item.hidden||!item.getClientRects().length)return false;for(let parent=item;parent;parent=parent.parentElement)if(parent.hidden||parent.inert)return false;const style=root.getComputedStyle(item),rect=item.getBoundingClientRect();return style.display!=='none'&&style.visibility==='visible'&&rect.bottom>0&&rect.top<root.innerHeight;}
function paint(record,model){
 const {options,quote}=record;quote.replaceChildren();const raw=typeof options.current_price==='string'&&options.current_price.trim()?Number(options.current_price):options.current_price,existing=price(raw)&&['USD','KRW'].includes(options.currency),value=existing?raw:model?.price,currency=existing?options.currency:model?.currency;
 const figures=make('span','mts-card-figures');const priceNode=make('strong','mts-card-price',price(value)&&currency?money(value,currency):'가격 미확인');if(price(value)&&currency)fullNumber(priceNode,String(value)+' '+currency);figures.append(priceNode);
 const change=model?.change_percent,rate=make('span','mts-card-change',Number.isFinite(change)?(change>0?'+':'')+cut(change)+'%':'등락 미확인');if(Number.isFinite(change))fullNumber(rate,String(change)+'%');if(Number.isFinite(change))rate.classList.add(change>0?'mts-up':change<0?'mts-down':'mts-flat');rate.title=(Number.isFinite(change)?'전체 값 '+String(change)+'% · ':'')+(model?.change_dates?model.change_label+' · '+model.change_dates.join(' → ')+' · 완료 관측 가격 기준':'서로 다른 거래일의 가격 근거가 필요해요.');figures.append(rate);
 const basis=existing?'저장 시세':model?'완료 가격':'가격 이력';const time=existing?options.as_of||options.price_as_of||options.market_time:model?.as_of;figures.append(make('small','mts-card-time',(model?.status==='STALE'?'이전 자료 · ':'')+basis+' · '+stamp(time)));quote.append(figures);
 const points=model?sparkPoints(model.bars):'';
 if(points){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),line=document.createElementNS(svg.namespaceURI,'polyline');svg.setAttribute('viewBox','0 0 76 32');svg.setAttribute('role','img');svg.setAttribute('aria-label',(options.name||options.symbol||options.identity)+' · '+model.range+' 실제 완료 가격 '+model.bars.length+'개');svg.classList.add('mts-card-spark');line.setAttribute('points',points);line.setAttribute('fill','none');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','1.7');svg.append(line);quote.append(svg);}else quote.append(make('small','mts-card-spark-empty','이력 미확인'));
 quote.title=(model?model.change_label+' · 완료 가격 '+money(model.price,model.currency)+' · 관측 '+model.as_of+' · '+model.source_url+' · 조회 '+model.retrieved_at:options.source_label||'확인된 실제 가격 이력만 표시해요.');
}
function refreshNow(){scheduled=false;if(document.hidden){loader.setVisible([]);return;}const view=document.documentElement.dataset.zeroView||root.ZERO?.currentView?.();const shown=[];
 for(const record of records){if(!record.item.isConnected){records.delete(record);continue;}if(!['research','portfolio'].includes(view)||!visible(record.item))continue;if(shown.length<10)shown.push(record);}
 const identities=[];for(const record of shown){const provided=chartModel(record.options.chart,record.options.identity);const model=provided||loader.peek(record.options.identity);paint(record,model);if(!provided)identities.push(record.options.identity);}loader.setVisible(identities);
}
function schedule(){if(scheduled)return;scheduled=true;(root.requestAnimationFrame||((callback)=>setTimeout(callback,0)))(refreshNow);}
function refresh(){loader.setVisible([]);schedule();}
function decorate(item,options){let record=byItem.get(item);if(!record){const quote=make('span','mts-card-quote');item.append(quote);record={item,quote,options:{}};records.add(record);byItem.set(item,record);item.classList.add('mts-card');}record.options={...options};paint(record,chartModel(options.chart,options.identity));schedule();return record.quote;}
function create(options){const item=make('li','research-rank mts-explore-card'),button=make('button','research-company mts-card-open'),label=make('span','mts-card-name');button.type='button';button.dataset.companyId=options.identity;label.append(make('strong','',options.name||options.symbol||'종목'),make('small','mts-card-meta',options.subtitle||options.symbol||''));button.append(label);button.addEventListener('click',()=>options.onOpen?.());item.append(button);const quote=decorate(item,options);button.append(quote);return item;}
function observe(container){if(container&&!observed.has(container)){observed.add(container);new MutationObserver(changes=>{if(changes.some(change=>change.type==='childList'&&change.target===container||change.type==='attributes'&&byItem.has(change.target)))schedule();}).observe(container,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});}refresh();}
const api={decorate,create,observe,refresh};root.MTSCards=api;root.ZEROMTSCards=api;
document.addEventListener('zero-view-changed',refresh);document.addEventListener('zero-page-changed',refresh);document.addEventListener('visibilitychange',refresh);root.addEventListener('resize',refresh);
})(typeof window==='undefined'?globalThis:window);
