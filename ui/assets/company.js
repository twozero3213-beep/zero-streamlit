/* Private company research controls. Proposals never execute an account order. */
(() => {
  'use strict';
  const REVIEW_NOTICE='사용자 확인은 검토 기록이며 주문 승인·체결이 아닙니다. 다른 계좌를 자동 추종하지 않으며 가상 실험만 제공합니다.';
  const PERSONAS={VALUE:'가치투자형',TREND:'추세추종형',DIVIDEND:'고배당형',VOLATILITY:'변동성 제어형'};
  function staffProblem(rows){
    if(!Array.isArray(rows)||!rows.length||rows.length>20)return '직원을 1~20명 배치해 주세요.';
    if(rows.some(row=>typeof row.name!=='string'||!row.name.trim()||row.name.length>12||typeof row.team!=='string'||!row.team.trim()||row.team.length>12||!Object.hasOwn(PERSONAS,row.persona)||!Number.isFinite(row.weight)||row.weight<0||row.weight>100))return '직원 이름·팀·성향·가중치를 확인해 주세요.';
    if(Math.abs(rows.reduce((sum,row)=>sum+row.weight,0)-100)>1e-8)return '전략 가중치의 합계를 100%로 맞춰 주세요.';
    return null;
  }
  function marketCardValid(data,identity){return data?.schema_version===1&&data.identity===identity&&data.quote&&['AVAILABLE','STALE','UNAVAILABLE'].includes(data.quote.status)&&data.orderbook&&Array.isArray(data.orderbook.bids)&&Array.isArray(data.orderbook.asks)&&data.calendar&&Array.isArray(data.calendar.events);}
  if(typeof module!=='undefined'&&module.exports)module.exports={staffProblem,marketCardValid};
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),U=()=>window.ZEROLobbyUsers;
  const el=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const button=(text,run)=>{const n=el('button','secondary-button',text);n.type='button';n.addEventListener('click',run);return n;};
  let fields=0,epoch=0,marketEpoch=0,staff=[];
  function field(label,type,value,min,max){const input=el(type==='select'?'select':'input');input.id='company-field-'+(++fields);if(type!=='select')input.type=type;input.value=value??'';if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;const wrap=el('label','company-field');wrap.htmlFor=input.id;wrap.append(el('span','',label),input);return {input,wrap};}
  const pct=value=>typeof value==='number'&&Number.isFinite(value)?(Math.trunc(value*100)/100).toFixed(2)+'%':'집계 전';
  const reason=code=>({POINT_IN_TIME_FUNDAMENTALS_REQUIRED:'가치투자에는 당시 공개된 재무 자료가 필요합니다.',DIVIDEND_HISTORY_REQUIRED:'고배당 전략에는 검증된 배당 이력이 필요합니다.',INSUFFICIENT_HISTORY:'공통 가격 이력이 부족합니다.',INSUFFICIENT_COMMON_HISTORY:'관찰 준비 구간을 제외한 공통 가격 이력이 부족합니다.',FUNDAMENTAL_HISTORY_REQUIRED:'가치투자에 필요한 당시 재무 자료가 없습니다.',UNSUPPORTED_SPLIT:'주식 분할이 확인되어 미조정 가격으로 계산하지 않습니다.',SPLIT_METADATA_REQUIRED:'주식 분할 여부를 확인할 근거가 필요합니다.',STRATEGY_UNAVAILABLE:'전략 엔진 연결을 확인하지 못했습니다.',UNAUTHORIZED:'닉네임으로 로그인한 뒤 사용해 주세요.',STAFF_INVALID:'직원 설정과 가중치를 확인해 주세요.'}[code]||'자료를 확인하지 못했습니다. 설정과 연결 상태를 확인해 주세요.');
  async function request(path,options={}){if(!U()?.session())throw {code:'UNAUTHORIZED'};return U().request(path,options);}
  function clearPrivate(){epoch++;staff=[];$('company-content')?.replaceChildren();}
  document.addEventListener('zero-session-changed',()=>{clearPrivate();if(document.documentElement.dataset.zeroView==='company')open();});
  function drawStaff(list){
    list.replaceChildren();staff.forEach((row,index)=>{
      const card=el('fieldset','company-staff');card.append(el('legend','',row.name||'직원 '+(index+1)));
      const name=field('직원 이름','text',row.name),team=field('팀 이름','text',row.team),persona=field('전략 성향','select','');name.input.maxLength=12;team.input.maxLength=12;
      Object.entries(PERSONAS).forEach(([value,label])=>{const opt=el('option','',label);opt.value=value;persona.input.append(opt);});persona.input.value=row.persona;
      const weight=field('전략 가중치(%)','number',row.weight,0,100),lookback=field('관찰 거래일','number',row.params.lookback,20,200),vol=field('목표 연 변동성','number',row.params.vol_target,0.05,0.4),rebalance=field('재배분 주기(거래일)','number',row.params.rebalance_days,1,60);vol.input.step='0.01';
      [name,team,persona,weight,lookback,vol,rebalance].forEach(f=>card.append(f.wrap));
      name.input.addEventListener('input',()=>row.name=name.input.value);team.input.addEventListener('input',()=>row.team=team.input.value);persona.input.addEventListener('change',()=>row.persona=persona.input.value);
      weight.input.addEventListener('input',()=>row.weight=Number(weight.input.value));lookback.input.addEventListener('input',()=>row.params.lookback=Number(lookback.input.value));vol.input.addEventListener('input',()=>row.params.vol_target=Number(vol.input.value));rebalance.input.addEventListener('input',()=>row.params.rebalance_days=Number(rebalance.input.value));
      card.append(button('직원 고용 해제',()=>{staff.splice(index,1);drawStaff(list);}));list.append(card);
    });
  }
  function staffOffice(company,rows){
    const groups=new Map();rows.forEach(row=>{if(!groups.has(row.team))groups.set(row.team,[]);groups.get(row.team).push({name:row.name,persona:row.persona==='TREND'?'열정적':'꼼꼼함',duty:PERSONAS[row.persona]+' 전략 연구'});});
    return {company:company.name||'대표님의 회사',teams:[...groups].map(([name,members])=>({name,role:'비공개 전략 연구',leader:members[0],members:members.slice(1)}))};
  }
  async function open(){
    const target=$('company-content');if(!target)return;const generation=++epoch;target.replaceChildren(el('p','', '회사를 불러오는 중…'));
    if(!U()?.session()){target.replaceChildren(el('p','', '닉네임으로 로그인하면 회사와 전략 직원을 관리할 수 있어요.'),button('닉네임으로 시작',()=>U()?.openProfile()));return;}
    try{
      const [companyData,staffData]=await Promise.all([request('/me/company'),request('/me/staff')]);if(generation!==epoch)return;
      const company=companyData.company||companyData;staff=Array.isArray(staffData.staff)?structuredClone(staffData.staff):[];
      const name=field('투자회사 이름','text',company.name||''),note=el('p','muted-note'),list=el('div','company-staff-list');name.input.maxLength=20;
      const settings=el('section','panel');settings.append(el('h2','','내 투자회사'),name.wrap,button('회사 이름 저장',async()=>{try{await request('/me/company',{method:'PUT',body:{name:name.input.value,space:company.space}});if(generation!==epoch)return;note.textContent='회사 이름을 저장했어요.';await U().refresh();}catch(e){note.textContent=reason(e.code);}}),button('인테리어·팀 구성',()=>U()?.editOffice()),note);
      const hires=el('section','panel');hires.append(el('h2','','페르소나 직원 고용·배치'),el('p','muted-note','가치·고배당 전략은 당시의 재무·배당 근거가 있어야 실행됩니다. 자료가 없으면 임의 가격 전략으로 대체하지 않습니다.'),list);
      hires.append(button('직원 고용',()=>{if(staff.length>=20){note.textContent='최대 20명이에요.';return;}staff.push({name:'연구원 '+(staff.length+1),team:'전략팀',persona:'TREND',weight:staff.length?0:100,params:{lookback:60,vol_target:0.15,rebalance_days:20}});drawStaff(list);}),button('전략 가중치 저장',async()=>{const error=staffProblem(staff);if(error){note.textContent=error;return;}try{const saved=await request('/me/staff',{method:'PUT',body:{staff}});if(generation!==epoch)return;if(Array.isArray(saved.staff)){staff=structuredClone(saved.staff);drawStaff(list);}note.textContent='전략 배치를 저장했어요.';await U().refresh();}catch(e){note.textContent=reason(e.code);}}),button('직원을 내 사무실에 배치',()=>{const error=staffProblem(staff);if(error){note.textContent=error;return;}window.ZERO?.navigate('lobby');window.ZEROLobby?.showOwn({nick:U().session().nick,team:staffOffice(company,staff),space:company.space});}));
      const research=el('section','panel'),range=field('검증 기간','select',''),fees=field('수수료 가정(bps)','number',10,0,100),slip=field('슬리피지 가정(bps)','number',5,0,100),result=el('div','company-result');
      [['5Y','최근 5년 자료 · 준비 구간 제외']].forEach(([value,text])=>{const option=el('option','',text);option.value=value;range.input.append(option);});range.input.value='5Y';
      let runId=null;const run=button('직원 조합 백테스트',async()=>{const error=staffProblem(staff);if(error){result.textContent=error;return;}run.disabled=true;run.textContent='직원 조합 백테스트';runId=null;result.replaceChildren(el('p','','공개 가격으로 전략을 검증하고 있어요…'));
        try{const data=await request('/me/backtests',{method:'POST',body:{range:range.input.value,fee_bps:Number(fees.input.value),slippage_bps:Number(slip.input.value)}});if(generation!==epoch)return;const output=data.run||data;runId=output.id||data.id;
          if(output.state!=='AVAILABLE'){result.replaceChildren(el('p','',reason(output.reason)));return;}
          result.replaceChildren(el('h3','','과거 데이터 연구 결과 · 실제 운용 수익 아님'),el('p','',(output.start_date||output.period?.start_date||'')+' ~ '+(output.end_date||output.period?.end_date||'')),el('p','','참고 수익률 '+pct(output.metrics?.return_percent)+' · 최대 낙폭 '+pct(output.metrics?.max_drawdown_percent)));
          (output.signals||[]).slice(0,16).forEach(signal=>result.append(el('p','','검토 신호 '+signal.symbol+' · '+signal.action+' · 목표 '+pct(signal.target_weight_percent))));
          result.append(el('p','muted-note','시점 이후 자료를 과거 판단에 쓰지 않는 연구 계산입니다. 배당·환율·세금 제외 가정은 결과에서 확인하세요. 신호는 가상 실험의 검토 제안입니다. '+REVIEW_NOTICE+' 계좌 주문·리밸런싱을 실행하지 않습니다.'));
        }catch(e){if(generation===epoch){result.replaceChildren(el('p','',reason(e.code)));run.textContent='백테스트 다시 시도';}}finally{if(generation===epoch)run.disabled=false;}});
      research.append(el('h2','','백테스트·리밸런싱 신호'),el('p','muted-note',REVIEW_NOTICE),range.wrap,fees.wrap,slip.wrap,run,button('오늘의 운용 검토 완료',async()=>{if(!runId){result.append(el('p','','먼저 서버에 저장된 전략 검증 결과를 확인해 주세요.'));return;}try{await request('/me/daily-review',{method:'POST',body:{run_id:runId}});if(generation!==epoch)return;await U().refresh();result.append(el('p','','서버에서 일일 검토 기록을 확인했어요. 같은 기록은 중복 보상하지 않아요. '+REVIEW_NOTICE));}catch(e){result.append(el('p','',reason(e.code)));}}),result);
      target.replaceChildren(settings,hires,research);drawStaff(list);
    }catch(e){if(generation===epoch)target.replaceChildren(el('p','',reason(e.code)),button('다시 불러오기',open));}
  }
  async function openMarketCard(company,target){
    const generation=++marketEpoch,identity=company.id,card=el('section','market-card panel'),status=el('p','muted-note','시장 정보를 불러오는 중…');card.append(el('h2','','시세·호가·주요일정'),status);target.append(card);
    try{const response=await fetch('api/market-card?identity='+encodeURIComponent(identity),{cache:'no-store',signal:AbortSignal.timeout(15000)}),data=response.ok?await response.json():null;
      if(generation!==marketEpoch||!card.isConnected)return;if(!marketCardValid(data,identity))throw Error('MARKET_CARD_INVALID');
      const quote=data.quote;status.textContent=quote.status==='UNAVAILABLE'?'가격 제공 근거를 확인하지 못했습니다.':(quote.status==='STALE'?'이전 저장 자료 · ':'')+(quote.delayed?'공개 지연 시세':'연결 시세')+' · '+(Number.isFinite(Date.parse(quote.as_of))?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short',hour12:false}).format(new Date(quote.as_of))+' KST':'시세 시각 확인 필요');
      if(quote.status!=='UNAVAILABLE'&&Number.isFinite(Number(quote.price)))card.append(el('p','market-card-price',new Intl.NumberFormat('ko-KR',{maximumFractionDigits:20}).format(Number(quote.price))+' '+(quote.currency||'')));
      const book=el('section');book.append(el('h3','','호가'));if(data.orderbook.status==='UNAVAILABLE')book.append(el('p','muted-note','실시간 호가 제공 연결이 필요합니다. 마지막 가격으로 호가를 만들어 표시하지 않습니다.'));else{[['asks','매도'],['bids','매수']].forEach(([key,label])=>(data.orderbook[key]||[]).slice(0,5).forEach(row=>book.append(el('p','',label+' '+row.price+' · 잔량 '+row.quantity))));}card.append(book);
      const calendar=el('section');calendar.append(el('h3','','배당·실적 일정'));if(!data.calendar.events.length)calendar.append(el('p','muted-note','확인된 발표 일정이 없습니다. 추정 날짜를 일정으로 표시하지 않습니다.'));
      if(data.calendar.reason==='FUTURE_EARNINGS_UNAVAILABLE'||data.calendar.events.some(event=>event.basis==='HISTORICAL_EX_DIVIDEND_DATE'))calendar.append(el('p','muted-note','아래는 확인된 과거 배당락일입니다. 미래 배당·실적 일정 제공 연결은 아직 없습니다.'));
      data.calendar.events.slice(0,20).forEach(event=>{const row=el('p','',event.date+' · '+(event.kind==='DIVIDEND'?'배당':'실적')+(event.confirmed===false?' · 예정/변경 가능':''));if(/^https:\/\//.test(event.source_url||'')){const link=el('a','','원문');link.href=event.source_url;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}calendar.append(row);});card.append(calendar,button('시장 속보·주요 뉴스',()=>window.ZERO?.navigate('news')));
    }catch(_){if(generation===marketEpoch&&card.isConnected){
      status.textContent='시장 정보 연결을 확인하지 못했습니다. 종목 차트와 기존 저장 자료는 그대로 사용할 수 있어요.';
      const retry=button('시장 정보 다시 시도',async()=>{if(retry.disabled)return;retry.disabled=true;card.remove();await openMarketCard(company,target);});card.append(retry);
    }}
  }
  function officeFor(info){
    const team=structuredClone(info.team||{company:'',teams:[]});
    team.company=info.company?.name||team.company;
    const hires=staffOffice(info.company||{name:team.company},info.hired_staff||[]);
    hires.teams.forEach(added=>{const existing=team.teams.find(row=>row.name===added.name);if(existing)existing.members=[...(existing.members||[]),added.leader,...added.members];else team.teams.push(added);});
    return {nick:info.nick,team,space:info.company?.space||info.space};
  }
  window.ZEROCompany={open,openMarketCard,officeFor};if(document.documentElement.dataset.zeroView==='company')open();
})();
