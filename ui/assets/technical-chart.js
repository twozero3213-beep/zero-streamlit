/* Completed public observations only; no tick feed, broker calls or order authority. */
(function(root){
'use strict';
const rangeMap={'1D':['1d','1m'],'1W':['5d','1m'],'1M':['1mo','60m'],'3M':['3mo','1d'],'1Y':['1y','1d'],'5Y':['5y','1d']},ranges=Object.keys(rangeMap);
const nodeMath=typeof module!=='undefined'&&module.exports?require('./stock-workbench.js'):null;
const math=()=>root.ZEROExploreMath||nodeMath;
const identityOK=value=>typeof value==='string'&&/^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[A-Z0-9]{6})$/.test(value);
function validate(data,identity,range,now=Date.now()){
 if(!identityOK(identity)||!ranges.includes(range)||!data||data.schema_version!==1||data.identity!==identity||data.range!==range||!['AVAILABLE','STALE'].includes(data.status)||data.market!==identity.slice(0,2)||data.currency!==(data.market==='KR'?'KRW':'USD')||data.basis!=='UNADJUSTED_PROVIDER_COMPLETED_OHLCV'||!['1m','60m','1d'].includes(data.interval)||!Array.isArray(data.bars)||!data.bars.length||data.bars.length>2200)return null;
 const clock=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now;
 if(!math()?.stockChartValid?.(data,identity,range,now)||typeof math()?.stockBarCompleted!=='function'||data.interval!==rangeMap[range][1])return null;
 if(!clock(data.checked_at)||!clock(data.retrieved_at)||Date.parse(data.retrieved_at)>Date.parse(data.checked_at))return null;
 try{const source=new URL(data.source_url),symbol=identity.slice(3),symbols=data.market==='KR'?[symbol+'.KS',symbol+'.KQ']:[symbol.replaceAll('.','-')];if(source.protocol!=='https:'||source.username||source.password||source.port||source.hash||!['query1.finance.yahoo.com','query2.finance.yahoo.com'].includes(source.hostname)||!symbols.some(value=>source.pathname==='/v8/finance/chart/'+value)||[...source.searchParams].length!==3||source.searchParams.getAll('range').length!==1||source.searchParams.get('range')!==rangeMap[range][0]||source.searchParams.getAll('interval').length!==1||source.searchParams.get('interval')!==rangeMap[range][1]||source.searchParams.getAll('includePrePost').length!==1||source.searchParams.get('includePrePost')!=='false')return null;}catch(_){return null;}
 if(data.bars.some((b,i)=>!b||!math().stockBarCompleted(b,data.market,data.interval,data.retrieved_at)||b.completed!==undefined&&b.completed!==true||!Number.isInteger(b.time)||b.time<=0||b.time*1000>Date.parse(data.retrieved_at)||i>0&&b.time<=data.bars[i-1].time||!['open','high','low','close'].every(key=>typeof b[key]==='number'&&Number.isFinite(b[key])&&b[key]>0&&b[key]<=1e15)||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||!(b.volume===null||typeof b.volume==='number'&&Number.isFinite(b.volume)&&b.volume>=0&&b.volume<=1e15)))return null;
 return {...data,bars:data.bars.map(b=>({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume}))};
}
function average(bars,period){let sum=0;return bars.flatMap((bar,index)=>{sum+=bar.close;if(index>=period)sum-=bars[index-period].close;return index+1<period?[]:[{time:bar.time,value:sum/period}];});}
function iframeURL(identity,range,height){return identityOK(identity)&&ranges.includes(range)&&[200,240].includes(height)?'./lwc?'+new URLSearchParams({identity,range,height:String(height)}):null;}
if(typeof module!=='undefined'&&module.exports)module.exports={validate,average,iframeURL};
if(!root.document)return;
const document=root.document;
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
let vendorPromise=null;
function loadVendor(){
 if(root.LightweightCharts?.version?.()==='4.1.3')return Promise.resolve(true);
 if(vendorPromise)return vendorPromise;
 vendorPromise=new Promise(resolve=>{
  let source;try{source=new URL('assets/vendor-lightweight-charts-4.1.3.js',document.baseURI);if(source.origin!==(root.location?.origin||new URL(document.baseURI).origin)||!['http:','https:'].includes(source.protocol)){resolve(false);return;}}catch(_){resolve(false);return;}
  const script=document.createElement('script');let settled=false,timer;
  const finish=ok=>{if(settled)return;settled=true;root.clearTimeout(timer);script.onload=script.onerror=null;if(!ok)script.remove();resolve(ok);};
  try{script.src=source.href;script.async=true;script.referrerPolicy='no-referrer';script.onload=()=>finish(root.LightweightCharts?.version?.()==='4.1.3');script.onerror=()=>finish(false);timer=root.setTimeout(()=>finish(false),6000);document.head.append(script);}catch(_){finish(false);}
 });
 return vendorPromise;
}
function mount(container,options={}){
 let alive=true,sequence=0,controller=null,chart=null,frame=null,deadline=null,model=null,ro=null,life=null,networkDeadline=null,frameGeneration=0,refreshTimer=null,refreshGeneration=0,savedTimeRange=null,selectedTime=null,refreshFailed=false;
 const shell=node('section','technical-chart'),plot=node('div','technical-chart-plot'),status=node('p','technical-chart-status','공개 완료 가격을 확인하는 중입니다.'),controls=node('div','technical-chart-controls'),evidence=node('details','technical-chart-evidence'),basis=node('details','technical-chart-basis');
 status.setAttribute('role','status');plot.setAttribute('aria-label','공개 지연·완료봉 캔들, MA20·MA60, 거래량');
 const retry=node('button','','다시 불러오기'),fallback=node('button','','기본 차트로 보기');retry.type=fallback.type='button';fallback.hidden=true;controls.append(retry,fallback);shell.append(plot,status,controls,evidence,basis);container.append(shell);
 const summary=node('summary'),readout=node('p'),cursor=node('input','technical-chart-cursor');
 cursor.type='range';cursor.min='0';cursor.step='1';cursor.setAttribute('aria-label','날짜별 가격 선택');cursor.addEventListener('input',()=>selection(Number(cursor.value)));evidence.open=true;
 const height=()=>root.innerWidth<768?200:240;
 function rememberRange(){
  if(!chart)return;
  try{const range=chart.timeScale().getVisibleRange(),valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;savedTimeRange=range&&valid(range.from)&&valid(range.to)&&range.from<range.to?{identity:options.identity,range:options.range,from:range.from,to:range.to}:null;}catch(_){savedTimeRange=null;}
 }
 function restoreRange(){
  if(!savedTimeRange||savedTimeRange.identity!==options.identity||savedTimeRange.range!==options.range)return;
  try{chart.timeScale().setVisibleRange({from:savedTimeRange.from,to:savedTimeRange.to});}catch(_){savedTimeRange=null;chart.timeScale().fitContent();}
 }
 function release(){rememberRange();++frameGeneration;if(deadline!==null){root.clearTimeout(deadline);deadline=null;}chart?.remove();chart=null;if(frame){frame.remove();frame=null;}plot.replaceChildren();}
 function selection(index){
  if(!model||!Number.isInteger(index)||index<0||index>=model.bars.length)return;
  const bar=model.bars[index];selectedTime=bar.time;
  const date=new Intl.DateTimeFormat('ko-KR',{timeZone:model.market==='US'?'America/New_York':'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(bar.time*1000));
  summary.textContent='선택봉 · '+date+' ('+(model.market==='US'?'뉴욕':'서울')+')';
  readout.textContent=['시가 '+bar.open,'고가 '+bar.high,'저가 '+bar.low,'종가 '+bar.close].map(text=>text+' '+model.currency).join(' · ')+' · 거래량 '+(bar.volume===null?'미확인':bar.volume.toLocaleString('ko-KR')+'주')+' · '+[20,60].map(period=>{const points=average(model.bars.slice(0,index+1),period);return 'MA'+period+' '+(points.length?Math.round(points.at(-1).value*100)/100+' '+model.currency:'표본 부족 ('+(index+1)+'/'+period+')');}).join(' · ');
  cursor.value=String(index);cursor.setAttribute('aria-valuetext',summary.textContent+' · 종가 '+bar.close+' '+model.currency);
 }
 function note(){
  // One short line under the chart; the full basis stays one tap away.
  const last=new Date(model.bars.at(-1).time*1000),zone=model.market==='US'?'America/New_York':'Asia/Seoul';
  status.textContent=(refreshFailed?'조회 실패 · 이전 자료 유지 · ':'')+(model.status==='STALE'||model.error_code==='DISPLAY_SNAPSHOT_OLDER'?'이전 저장 자료 · ':'')+'지연·캐시된 완료봉 · '+model.range+'/'+model.interval+' · 기준 '+new Intl.DateTimeFormat('ko-KR',{timeZone:zone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(last)+' ('+(model.market==='US'?'뉴욕':'서울')+')';
  basis.replaceChildren(node('summary','','자료 기준 자세히'),node('p','','공개 지연·완료봉 · 60초 재확인·캐시된 완료봉일 수 있음 · 정규장 종료+10분 가정·휴장/조기폐장 독립 검증 전 · '+model.range+' / '+model.interval+' · MA20·MA60은 완료 봉 수 기준 · 거래량 '+(model.bars.some(b=>b.volume===null)?'일부 미확인':'주')+' · 관측 '+new Date(model.bars.at(-1).time*1000).toISOString()+' · 조회 '+model.retrieved_at));
  const link=node('a','','가격 출처');link.href=model.source_url;link.target='_blank';link.rel='noopener noreferrer';status.append(' ',link);
  cursor.max=String(model.bars.length-1);evidence.replaceChildren(summary,cursor,readout);
  const index=model.bars.findIndex(bar=>bar.time===selectedTime);selection(index<0?model.bars.length-1:index);
 }
 function legend(){const box=node('div','technical-chart-legend');box.setAttribute('aria-hidden','true');for(const [label,color] of [['MA20','#8b5cf6'],['MA60','#009681']]){const item=node('span','',label);item.style?.setProperty?.('--line',color);box.append(item);}return box;}
 function canvas(){
  release();fallback.hidden=true;plot.dataset.engine='canvas';const el=node('canvas');el.tabIndex=0;el.setAttribute('role','img');el.setAttribute('aria-label','검증된 완료봉 캔들·MA20 보라·MA60 초록·거래량. 상세 OHLC는 차트 아래 설명에서 확인');plot.append(el);
  const width=Math.max(180,Math.min(1600,plot.clientWidth||container.clientWidth||320)),h=height(),dpr=Math.min(root.devicePixelRatio||1,2);el.width=Math.round(width*dpr);el.height=Math.round(h*dpr);el.style.width='100%';el.style.height=h+'px';const ctx=el.getContext('2d');if(!ctx){status.textContent='차트 그리기를 지원하지 않습니다. 가격 원문을 확인해 주세요.';return;}ctx.scale(dpr,dpr);
  const bars=model.bars.slice(-100),start=model.bars.length-bars.length,lines=[[20,'#8b5cf6'],[60,'#009681']].map(([period,color])=>({color,values:new Map(average(model.bars,period).map(point=>[point.time,point.value]))}));
  const values=bars.flatMap(b=>[b.high,b.low,...lines.map(line=>line.values.get(b.time)).filter(Number.isFinite)]),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.05,hi*.001),top=8,bottom=h*.66,step=(width-12)/bars.length,y=value=>bottom-(value-lo+pad)/(hi-lo+pad*2)*(bottom-top),x=i=>6+(i+.5)*step;
  const maxVolume=Math.max(1,...bars.map(b=>b.volume||0));bars.forEach((b,i)=>{ctx.strokeStyle=ctx.fillStyle=b.close>b.open?'#c93b49':b.close<b.open?'#1b64da':'#697586';ctx.beginPath();ctx.moveTo(x(i),y(b.high));ctx.lineTo(x(i),y(b.low));ctx.stroke();ctx.fillRect(x(i)-Math.max(1,step*.6)/2,Math.min(y(b.open),y(b.close)),Math.max(1,step*.6),Math.max(1,Math.abs(y(b.close)-y(b.open))));if(b.volume!==null){ctx.globalAlpha=.3;ctx.fillRect(x(i)-step*.3,h-20-b.volume/maxVolume*(h*.2),Math.max(1,step*.6),b.volume/maxVolume*(h*.2));ctx.globalAlpha=1;}});
  for(const line of lines){ctx.strokeStyle=line.color;ctx.beginPath();let started=false;bars.forEach((b,i)=>{const value=line.values.get(b.time);if(value===undefined)return;started?ctx.lineTo(x(i),y(value)):ctx.moveTo(x(i),y(value));started=true;});ctx.stroke();}
  ctx.fillStyle='#626d7b';ctx.font='11px sans-serif';ctx.fillText('MA20 · MA60 · 거래량 · 최근 '+bars.length+'봉',6,h-4);el.dataset.sampleStart=String(start);
  el.addEventListener('pointerdown',event=>{const box=el.getBoundingClientRect();if(box.width>0)selection(start+Math.max(0,Math.min(bars.length-1,Math.floor(((event.clientX-box.left)/box.width*width-6)/step))));});
  el.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=model.bars.findIndex(bar=>bar.time===selectedTime);selection(event.key==='Home'?start:event.key==='End'?model.bars.length-1:Math.max(start,Math.min(model.bars.length-1,index+(event.key==='ArrowLeft'?-1:1))));});
 }
 function visible(){const view=document.documentElement.dataset.zeroView;return !document.hidden&&shell.isConnected&&!shell.closest('[hidden],dialog:not([open])')&&(!view||['workbench','research','portfolio'].includes(view));}
 function render(forceCanvas=false){
  if(!alive||!model||!visible())return;release();note();
  const lib=root.LightweightCharts,dark=document.documentElement.dataset.zeroTheme!=='light';
  if(!forceCanvas&&lib?.version?.()==='4.1.3'){
   try{chart=lib.createChart(plot,{width:Math.max(180,plot.clientWidth||320),height:height(),layout:{background:{color:dark?'#1b1d22':'#ffffff'},textColor:dark?'#d5d9e0':'#333d4b'},grid:dark?{vertLines:{color:'#2b2f37'},horzLines:{color:'#2b2f37'}}:{},rightPriceScale:{scaleMargins:{top:.14,bottom:.28},borderColor:dark?'#2b2f37':'#d6dce5'},timeScale:{timeVisible:model.interval!=='1d',borderColor:dark?'#2b2f37':'#d6dce5'}});
    const observed=model,onSelect=event=>{if(alive&&model===observed&&visible()&&typeof event.time==='number')selection(model.bars.findIndex(bar=>bar.time===event.time));};
    chart.subscribeCrosshairMove(onSelect);chart.subscribeClick(onSelect);
    chart.addCandlestickSeries({upColor:dark?'#ff6b78':'#c93b49',downColor:dark?'#5b9bff':'#1b64da',borderUpColor:dark?'#ff6b78':'#c93b49',borderDownColor:dark?'#5b9bff':'#1b64da',wickUpColor:dark?'#ff6b78':'#c93b49',wickDownColor:dark?'#5b9bff':'#1b64da'}).setData(model.bars.map(({time,open,high,low,close})=>({time,open,high,low,close})));
    for(const [period,color] of [[20,'#8b5cf6'],[60,'#009681']])chart.addLineSeries({color,lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:''}).setData(average(model.bars,period));
    const volume=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'volume'});volume.priceScale().applyOptions({scaleMargins:{top:.78,bottom:0}});volume.setData(model.bars.filter(b=>b.volume!==null).map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'#c93b4960':'#1b64da60'})));chart.timeScale().fitContent();restoreRange();plot.dataset.engine='lightweight';fallback.hidden=true;plot.append(legend());const credit=node('a','technical-chart-credit','TradingView Lightweight Charts™');credit.href='https://www.tradingview.com/';credit.target='_blank';credit.rel='noopener noreferrer';plot.append(credit);return;
   }catch(_){release();}
  }
  if(!forceCanvas&&model.status==='AVAILABLE'&&!model.error_code&&document.querySelector('meta[name="zero-lightweight-chart"]')?.content==='./lwc'){
   frame=node('iframe');frame.title='TradingView 완료봉 캔들·MA20·MA60·거래량';frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';frame.height=String(height());frame.src=iframeURL(options.identity,options.range,height());const captured=frame,generation=frameGeneration,current=()=>alive&&model&&visible()&&frame===captured&&frameGeneration===generation;frame.addEventListener('error',()=>{if(current())canvas();});plot.append(frame);plot.dataset.engine='iframe';fallback.hidden=false;deadline=root.setTimeout(()=>{if(!current())return;deadline=null;canvas();},6000);return;
  }
  canvas();
 }
 function clearRefresh(){++refreshGeneration;root.clearTimeout(refreshTimer);refreshTimer=null;}
 function armRefresh(){clearRefresh();const generation=refreshGeneration;if(alive&&model&&visible())refreshTimer=root.setTimeout(()=>{if(generation!==refreshGeneration)return;refreshTimer=null;if(alive&&model&&visible())load();},60000);}
 async function load(){
  if(!alive||retry.disabled||!visible())return;clearRefresh();controller?.abort();controller=new AbortController();const run=++sequence;retry.disabled=true;status.textContent=model?'가격 재확인 중 · 이전 완료 자료를 표시하고 있어요.':'공개 완료 가격을 확인하는 중입니다.';
  const requestController=controller;networkDeadline=root.setTimeout(()=>requestController.abort(),4000);
  try{if(!identityOK(options.identity)||!ranges.includes(options.range))throw Error('INVALID');const response=await root.fetch('api/chart?'+new URLSearchParams({identity:options.identity,range:options.range}),{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});if(!response.ok)throw Error('UNAVAILABLE');const text=await response.text();if(text.length>2000000)throw Error('SIZE');const data=validate(JSON.parse(text),options.identity,options.range);if(!data)throw Error('INVALID');if(!alive||run!==sequence)return;model=data;refreshFailed=false;render();}
  catch(_){if(alive&&run===sequence){if(model){refreshFailed=true;note();}else status.textContent='완료 가격을 확인하지 못했습니다. 가상 가격을 표시하지 않습니다. 다시 불러올 수 있습니다.';}}
  finally{if(run===sequence){root.clearTimeout(networkDeadline);networkDeadline=null;if(alive){retry.disabled=false;armRefresh();}}}
 }
 function update(data){clearRefresh();root.clearTimeout(networkDeadline);networkDeadline=null;++sequence;controller?.abort();retry.disabled=false;model=validate(data,options.identity,options.range);refreshFailed=false;if(model)render();else{release();evidence.replaceChildren();status.textContent='검증된 완료 가격이 없습니다. 다시 불러올 수 있습니다.';}armRefresh();}
 function destroy(){if(!alive)return;alive=false;clearRefresh();++sequence;controller?.abort();root.clearTimeout(networkDeadline);networkDeadline=null;release();ro?.disconnect();life?.disconnect();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('zero-view-changed',visibility);document.removeEventListener('zero-theme-changed',visibility);root.removeEventListener('message',message);shell.remove();}
 function visibility(){if(!shell.isConnected){destroy();return;}if(!visible()){clearRefresh();++sequence;controller?.abort();root.clearTimeout(networkDeadline);networkDeadline=null;retry.disabled=false;release();return;}if(model)render();else load();armRefresh();}
 function message(event){if(frame&&event.source===frame.contentWindow&&event.data?.type==='zero-technical-ready'){root.clearTimeout(deadline);deadline=null;}}
 retry.addEventListener('click',load);fallback.addEventListener('click',()=>{if(model)canvas();});document.addEventListener('visibilitychange',visibility);document.addEventListener('zero-view-changed',visibility);document.addEventListener('zero-theme-changed',visibility);root.addEventListener('message',message);
 if(root.ResizeObserver){ro=new root.ResizeObserver(()=>{if(!shell.isConnected)destroy();else if(!visible())release();else if(model){if(chart)chart.applyOptions({width:plot.clientWidth,height:height()});else if(!frame)canvas();}});ro.observe(plot);}
 if(root.MutationObserver){life=new root.MutationObserver(()=>{if(!shell.isConnected)destroy();});life.observe(document.body,{childList:true,subtree:true});}
 loadVendor().then(ready=>{if(ready&&alive&&model&&visible()&&plot.dataset.engine!=='lightweight')render();});
 if(options.data!==undefined)update(options.data);else load();
 return {update,destroy,retry:load};
}
function open(options){const dialog=node('dialog','technical-chart-dialog'),heading=node('h2','',String(options.name||options.identity)+' · 차트 미리보기'),host=node('div'),close=node('button',' icon-button icon-close','닫기');close.type='button';close.title='닫기';close.setAttribute('aria-label','창 닫기');dialog.setAttribute('aria-label',heading.textContent);dialog.append(heading,host,close);document.body.append(dialog);dialog.showModal();const instance=mount(host,options);close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{instance.destroy();dialog.remove();},{once:true});close.focus();return {dialog,destroy:()=>dialog.close()};}
root.ZEROTechnicalChart={mount,open};
})(typeof window==='undefined'?globalThis:window);
