/* Display projections only: connected deposits never change the ZERO reference ledger. */
(() => {
  'use strict';
  const amount=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1e15;
  function allocation(scope){
    if(!scope||scope.state!=='REFERENCE'||scope.scope!=='ZERO_100M_FROZEN_PLAN_GROSS_REFERENCE'||!Array.isArray(scope.holdings)||![scope.total_value_krw,scope.holdings_value_krw,scope.remaining_funds_krw].every(amount)||!(Number(scope.total_value_krw)>0))return null;
    const values={US_EQUITY:0,KR_EQUITY:0,US_RESERVE:Number(scope.remaining_funds_krw)};
    for(const row of scope.holdings){if(!row||!Object.hasOwn(values,row.asset_class)||!amount(row.market_value_krw))return null;values[row.asset_class]+=Number(row.market_value_krw);}
    const total=Number(scope.total_value_krw),holdings=Object.values(values).reduce((a,b)=>a+b,0)-Number(scope.remaining_funds_krw);
    if(Math.abs(holdings-Number(scope.holdings_value_krw))>=0.01||Math.abs(Object.values(values).reduce((a,b)=>a+b,0)-total)>=0.01)return null;
    return Object.entries(values).map(([key,value])=>({key,value,percent:value/total*100}));
  }
  function deposit(data){
    const context=data?.context, status=data?.system_status, value=data?.summary?.by_currency?.KRW?.cash;
    if(context?.data_kind==='DEMO'||context?.cash_basis!=='DEPOSIT_BALANCE_NOT_BUYING_POWER'||context?.mode!=='KIS_MOCK'||!Number.isFinite(Date.parse(context?.collected_at))||Date.parse(context.collected_at)>Date.now()||status?.connections?.KR!==true||!['READY','STALE','PARTIAL'].includes(status?.state)||!amount(value))return null;
    return {value:Number(value),currency:'KRW',mode:context.mode==='KIS_MOCK'?'모의계좌':'연결 계좌',asOf:context.collected_at,stale:status.state!=='READY'};
  }
  function render(scope,data){
    const cash=document.getElementById('mts-deposit'),note=document.getElementById('mts-deposit-note'),host=document.getElementById('mts-allocation');
    if(!cash||!host)return;
    const quote=deposit(data);
    cash.textContent=quote?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(Math.trunc(quote.value*100)/100)+'원':'연결 전';
    if(note)note.textContent=quote?quote.mode+' · 원화 · 결제 전'+(quote.stale?' · 이전 조회':''):'참고 잔여자금과 별도';
    cash.title=quote?'원화 예수금 '+String(quote.value)+'원 · '+quote.asOf+' · 주문 가능금액·결제 후 현금과 다름':'예수금을 확인한 계좌 자료가 없습니다.';
    host.replaceChildren();const rows=allocation(scope);
    if(!rows){const p=document.createElement('p');p.className='muted-note';p.textContent='배분은 보유 원장을 확인하면 표시해요.';host.append(p);return;}
    const labels={US_EQUITY:'미국 주식',KR_EQUITY:'한국 주식',US_RESERVE:'현금·단기채'},bar=document.createElement('div');bar.className='mts-allocation-track';bar.setAttribute('aria-hidden','true');
    const legend=document.createElement('ul');legend.className='mts-allocation-legend';
    for(const row of rows){const segment=document.createElement('span');segment.className='mts-allocation-'+row.key;segment.style.width=row.percent+'%';bar.append(segment);const item=document.createElement('li');item.className=segment.className;item.textContent=labels[row.key]+' '+(Math.trunc(row.percent*100)/100).toFixed(2)+'%';legend.append(item);}
    host.append(bar,legend);host.setAttribute('aria-label','ZERO 참고 자산 배분 · 참고 현금 포함 · 실제 예수금 제외');
  }
  const api={allocation,deposit,render};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.ZEROMTSPortfolio=api;
})();
