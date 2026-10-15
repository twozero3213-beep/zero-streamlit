/* Public display projections only; no account or strategy inputs enter this cache. */
(function(root){
'use strict';
const SPECS={ES_FUTURES:['US','FUTURES','ES=F','S&P 500 선물'],NQ_FUTURES:['US','FUTURES','NQ=F','Nasdaq 100 선물'],SP500:['US','SPOT','^GSPC','S&P 500'],NASDAQ:['US','SPOT','^IXIC','Nasdaq 종합'],DOW:['US','SPOT','^DJI','Dow Jones'],KOSPI:['KR','SPOT','^KS11','KOSPI'],KOSDAQ:['KR','SPOT','^KQ11','KOSDAQ'],KOSPI200_FUTURES:['KR','FUTURES',null,'KOSPI 200 선물']};
const CALENDAR='https://www.nasdaq.com/market-activity/earnings',states=['AVAILABLE','STALE','UNAVAILABLE'];
const clock=(value,now)=>typeof value==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now+300000;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=1e15;
function validate(data,now=Date.now()){
 if(!data||data.schema_version!==1||data.scope!=='PUBLIC_ANALYSIS_FEED'||!['AVAILABLE','PARTIAL','STALE','UNAVAILABLE'].includes(data.state)||data.orders_authorized!==false||data.allocation_changes_authorized!==false||!clock(data.checked_at,now)||!Array.isArray(data.indices)||data.indices.length!==8||!data.cache||data.cache.ttl_seconds!==3600)return null;
 if(data.fetched_at===null&&data.expires_at!==null)return null;
 if(data.fetched_at!==null&&(!clock(data.fetched_at,now)||!clock(data.expires_at,now+3600000)||Date.parse(data.expires_at)-Date.parse(data.fetched_at)!==3600000))return null;
 const seen=new Set(),indices=[];
 for(const row of data.indices){const spec=row&&typeof row.id==='string'&&Object.hasOwn(SPECS,row.id)?SPECS[row.id]:null;if(!spec||seen.has(row.id)||row.market!==spec[0]||row.kind!==spec[1]||row.symbol!==spec[2]||!states.includes(row.state))return null;seen.add(row.id);
  const source=spec[2]?'https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(spec[2]):null;
  if(row.source_url!==source)return null;
  if(row.state==='UNAVAILABLE'){if(row.price!==null||row.previous_close!==null||row.change_percent!==null||row.market_time!==null)return null;}
  else if(!positive(row.price)||row.previous_close!==null&&!positive(row.previous_close)||!clock(row.market_time,now)||now-Date.parse(row.market_time)>8*86400000||row.change_percent!==null&&(typeof row.change_percent!=='number'||!Number.isFinite(row.change_percent)||row.previous_close===null||Math.abs((row.price/row.previous_close-1)*100-row.change_percent)>0.00001))return null;
  indices.push({id:row.id,market:spec[0],kind:spec[1],symbol:spec[2],name:spec[3],state:row.state,price:row.price,previous_close:row.previous_close,change_percent:row.change_percent,market_time:row.market_time,source_url:source});
 }
 const earnings=data.earnings;if(!earnings||!states.includes(earnings.state)||earnings.source_url!==CALENDAR||!Array.isArray(earnings.events)||earnings.events.length>30||earnings.state==='UNAVAILABLE'&&earnings.events.length)return null;
 if(earnings.state!=='UNAVAILABLE'&&(!clock(earnings.fetched_at,now)||now-Date.parse(earnings.fetched_at)>3600000))return null;
 const events=[];for(const event of earnings.events){if(!event||!/^[A-Z][A-Z0-9.-]{0,9}$/.test(event.symbol)||typeof event.company!=='string'||!event.company.length||event.company.length>100||/[<>\x00-\x1f]/.test(event.company)||event.source_url!==CALENDAR||!/^\d{4}-\d{2}-\d{2}$/.test(event.date)||!Number.isFinite(Date.parse(event.date))||new Date(Date.parse(event.date)).toISOString().slice(0,10)!==event.date||!['BEFORE_MARKET','AFTER_MARKET','UNKNOWN'].includes(event.time))return null;events.push({...event});}
 return {state:data.state,fetched_at:data.fetched_at,expires_at:data.expires_at,checked_at:data.checked_at,indices,earnings:{state:earnings.state,source_url:CALENDAR,events}};
}
function chatter(data,now=Date.now()){
 if(!data||!data.fetched_at||now-Date.parse(data.fetched_at)>3600000)return [];
 return data.indices.filter(row=>row.state==='AVAILABLE'&&Number.isFinite(row.change_percent)).slice(0,3).map(row=>row.name+' '+(row.kind==='FUTURES'?'선물 시세':'현물 지수')+'는 비교 가격보다 '+Math.abs(Math.trunc(row.change_percent*100)/100).toFixed(2)+'% '+(row.change_percent>0?'높게':row.change_percent<0?'낮게':'같게')+' 관측됐어요. 지연 자료부터 차분히 확인해요.');
}
if(typeof module!=='undefined'&&module.exports)module.exports={validate,chatter,SPECS};
if(!root.document)return;
const doc=root.document,make=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
let saved=null,pending=null,failed=false;
const stamp=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value))+' KST':'미확인';
const digits=value=>(Math.trunc(value*100)/100).toLocaleString('ko-KR',{maximumFractionDigits:2});
function detail(){if(!saved)return;const dialog=make('dialog','analysis-source-dialog'),title=make('h2','','시장 자료의 출처와 시각'),close=make('button','secondary-button','닫기');close.type='button';dialog.append(title,make('p','','1시간 캐시 · 공개 지연 시세 · 실적 일정은 예상이며 변경될 수 있습니다.'));
 for(const row of saved.indices){const line=make('p','',row.name+' · '+(row.kind==='FUTURES'?'선물':'현물')+' · '+(row.state==='UNAVAILABLE'?'공급자 미연결 또는 확인 실패':'관측 '+stamp(row.market_time)+' · 원값 '+row.price));if(row.source_url){const link=make('a','',' 원자료');link.href=row.source_url;link.target='_blank';link.rel='noopener noreferrer';line.append(link);}dialog.append(line);}
 const link=make('a','','Nasdaq 실적 발표 원문');link.href=CALENDAR;link.target='_blank';link.rel='noopener noreferrer';dialog.append(link,close);doc.body.append(dialog);close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();close.focus();}
function paint(){const host=doc.getElementById('analysis-content'),status=doc.getElementById('analysis-status');if(!host||!status)return;host.replaceChildren();
 status.textContent=saved?(failed?'새로 확인하지 못해 이전 자료 표시 · ':'')+'수집 '+stamp(saved.fetched_at)+' · 1시간 캐시 · 지연 가능':'시장 자료를 확인하지 못했습니다. 다시 확인해 주세요.';
 if(!saved)return;
 const quotes=make('section','analysis-card'),heading=make('h3','','지수와 선물'),grid=make('div','analysis-quote-grid');quotes.append(heading,grid);
 for(const row of saved.indices){const item=make('div','analysis-quote'),label=make('span','',row.name),value=make('strong','',row.price===null?'연결 전':digits(row.price)+' pt'),change=make('small','',row.change_percent===null?'변동 미확인':(row.change_percent>0?'+':'')+digits(row.change_percent)+'%');item.title=row.name+' · '+(row.kind==='FUTURES'?'선물':'현물')+' · '+stamp(row.market_time)+(row.state==='STALE'?' · 이전 자료':'');if(row.price!==null){value.classList.add('num-t');value.dataset.full=String(row.price)+' pt';value.title='전체 값 '+row.price+' pt';value.tabIndex=0;}item.append(label,value,change);grid.append(item);}
 const calendar=make('section','analysis-card'),calendarTitle=make('h3','','실적 발표 일정');calendar.append(calendarTitle);
 if(saved.earnings.state==='UNAVAILABLE')calendar.append(make('p','muted-note','검증된 예정 일정이 아직 연결되지 않았습니다.'));
 else if(!saved.earnings.events.length)calendar.append(make('p','muted-note','제공자 범위에 예정 일정이 없습니다.'));
 else for(const e of saved.earnings.events.slice(0,3))calendar.append(make('p','analysis-event',e.date+' · '+e.symbol+' '+e.company+' · '+({BEFORE_MARKET:'장 시작 전',AFTER_MARKET:'장 마감 후',UNKNOWN:'시간 미확인'}[e.time])));
 const trends=make('section','analysis-card');trends.append(make('h3','','시장 흐름 요약'));const lines=chatter(saved);for(const line of lines.slice(0,2))trends.append(make('p','analysis-trend',line));if(!lines.length)trends.append(make('p','muted-note','새로운 가격 근거를 확인한 뒤 요약합니다.'));
 const source=make('button','secondary-button analysis-source','출처·관측 시각 전체 보기');source.type='button';source.addEventListener('click',detail);host.append(quotes,calendar,trends,source);
}
function endpoint(){const base=doc.querySelector('meta[name="zero-lobby-api"]')?.content;return base==='https://zero-lobby.zero-cloudflare.workers.dev'?`${base}/api/analysis-feed`:'api/analysis-feed';}
async function boundedJSON(response){
 const reader=response.body?.getReader();if(!reader){const text=await response.text();if(text.length>100000)throw Error('ANALYSIS_INVALID');return JSON.parse(text);}
 const chunks=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000)throw Error('ANALYSIS_INVALID');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
async function load(force=false){if(pending)return pending;if(!force&&saved&&Date.now()<Date.parse(saved.expires_at))return saved;
 pending=(async()=>{try{const response=await root.fetch(endpoint(),{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('ANALYSIS_UNAVAILABLE');const data=validate(await boundedJSON(response));if(!data)throw Error('ANALYSIS_INVALID');saved=data;failed=false;return saved;}catch(_){failed=true;return null;}finally{pending=null;if(root.ZERO?.currentView?.()==='analysis')paint();}})();return pending;
}
function open(){paint();return load();}
doc.getElementById('analysis-retry')?.addEventListener('click',()=>load(true));
root.ZEROAnalysis={open,load,chatter:()=>chatter(saved),current:()=>saved};
root.setInterval(()=>{if(!doc.hidden&&['analysis','lobby'].includes(root.ZERO?.currentView?.()))load();},60000);
if(root.ZERO?.currentView?.()==='analysis')open();
})(typeof window==='undefined'?globalThis:window);
