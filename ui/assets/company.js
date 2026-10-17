/* Private company research controls. Proposals never execute an account order. */
(() => {
  'use strict';
  const REVIEW_NOTICE='사용자 확인은 검토 기록이며 주문 승인·체결이 아닙니다. 다른 계좌를 자동 추종하지 않으며 가상 실험만 제공합니다.';
  const PERSONAS={VALUE:'가치투자형',TREND:'추세추종형',DIVIDEND:'고배당형',VOLATILITY:'변동성 제어형'};
  // Hiring presets: default team, one-line role and a look painted by ZEROOfficeNative.
  const ROLES={VALUE:{team:'가치팀',short:'가치',desc:'싸게 거래되는 우량 기업을 찾아요.',look:{outfit:'suit',hair:'1',accessory:'glasses'}},TREND:{team:'추세팀',short:'추세',desc:'오르는 흐름을 따라가요.',look:{outfit:'hoodie',hair:'2',accessory:'cap',shoes:'red'}},DIVIDEND:{team:'배당팀',short:'배당',desc:'배당을 꾸준히 주는 종목을 봐요.',look:{outfit:'cardigan',hair:'3',shoes:'white'}},VOLATILITY:{team:'위험관리팀',short:'위험관리',desc:'흔들림이 크면 비중을 줄여요.',look:{outfit:'vest',hair:'0',accessory:'headphones',shoes:'blue'}}};
  // Integer split so the sum is exactly 100 for staffProblem.
  function evenWeights(rows){const base=Math.floor(100/rows.length),rest=100-base*rows.length;rows.forEach((row,index)=>{row.weight=base+(index<rest?1:0);});return rows;}
  function staffProblem(rows){
    if(!Array.isArray(rows)||!rows.length||rows.length>20)return '직원을 1~20명 배치해 주세요.';
    if(rows.some(row=>typeof row.name!=='string'||!row.name.trim()||row.name.length>12||typeof row.team!=='string'||!row.team.trim()||row.team.length>12||!Object.hasOwn(PERSONAS,row.persona)||!Number.isFinite(row.weight)||row.weight<0||row.weight>100))return '직원 이름·팀·성향·가중치를 확인해 주세요.';
    if(Math.abs(rows.reduce((sum,row)=>sum+row.weight,0)-100)>1e-8)return '전략 가중치의 합계를 100%로 맞춰 주세요.';
    return null;
  }
  function marketCardValid(data,identity){return data?.schema_version===1&&data.identity===identity&&data.quote&&['AVAILABLE','STALE','UNAVAILABLE'].includes(data.quote.status)&&data.orderbook&&Array.isArray(data.orderbook.bids)&&Array.isArray(data.orderbook.asks)&&data.calendar&&Array.isArray(data.calendar.events);}
  if(typeof module!=='undefined'&&module.exports)module.exports={staffProblem,marketCardValid,evenWeights};
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),U=()=>window.ZEROLobbyUsers;
  const el=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const button=(text,run)=>{const n=el('button','secondary-button',text);n.type='button';n.addEventListener('click',run);return n;};
  const avatars=new Set();let avatarFrame=null;
  function paintAvatars(time){avatarFrame=null;for(const item of avatars){if(!item.canvas.isConnected){avatars.delete(item);continue;}window.ZEROOfficeNative?.drawPerson?.(item.canvas,item.actor(),time/1000);}
    if(avatars.size&&!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches&&window.requestAnimationFrame)avatarFrame=window.requestAnimationFrame(paintAvatars);}
  function avatar(actor,label){const canvas=el('canvas','company-avatar');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',label);if(!canvas.getContext)return canvas;avatars.add({canvas,actor});if(avatarFrame===null&&window.requestAnimationFrame)avatarFrame=window.requestAnimationFrame(paintAvatars);else window.ZEROOfficeNative?.drawPerson?.(canvas,actor(),0);return canvas;}
  const lookOf=(persona,name)=>({id:name||persona,activity:'walking',appearance:ROLES[persona]?.look});
  let fields=0,epoch=0,marketEpoch=0,staff=[],paperPending=new Map(),paperActive=false,paperSelection=null;
  function portfolioContent(){return $('portfolio-view')?.querySelector('#member-portfolio')||null;}
  function companyContent(){
    return $('company-view')?.querySelector('#company-content')||null;
  }
  function showState(target,state,text,...actions){
    target.dataset.companyState=state;target.setAttribute('aria-busy',String(state==='loading'));
    const panel=el('section','panel company-state'),message=el('p','',text);message.setAttribute('role',state==='error'?'alert':'status');panel.append(message,...actions);target.replaceChildren(panel);
  }
  function showLogin(target){staff=[];showState(target,'login','로그인하면 회사와 전략 직원을 관리할 수 있어요.',button('로그인·체험하기',()=>U()?.openProfile()));}
  function field(label,type,value,min,max){const input=el(type==='select'?'select':'input');input.id='company-field-'+(++fields);if(type!=='select')input.type=type;input.value=value??'';if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;const wrap=el('label','company-field');wrap.htmlFor=input.id;wrap.append(el('span','',label),input);return {input,wrap};}
  const pct=value=>typeof value==='number'&&Number.isFinite(value)?(Math.trunc(value*100)/100).toFixed(2)+'%':'집계 전';
  const reason=code=>({POINT_IN_TIME_FUNDAMENTALS_REQUIRED:'가치투자에는 당시 공개된 재무 자료가 필요합니다.',DIVIDEND_HISTORY_REQUIRED:'고배당 전략에는 검증된 배당 이력이 필요합니다.',INSUFFICIENT_HISTORY:'공통 가격 이력이 부족합니다.',INSUFFICIENT_COMMON_HISTORY:'관찰 준비 구간을 제외한 공통 가격 이력이 부족합니다.',FUNDAMENTAL_HISTORY_REQUIRED:'가치투자에 필요한 당시 재무 자료가 없습니다.',UNSUPPORTED_SPLIT:'주식 분할이 확인되어 미조정 가격으로 계산하지 않습니다.',SPLIT_METADATA_REQUIRED:'주식 분할 여부를 확인할 근거가 필요합니다.',STRATEGY_UNAVAILABLE:'전략 엔진 연결을 확인하지 못했습니다.',UNAUTHORIZED:'로그인한 뒤 사용해 주세요.',STAFF_INVALID:'직원 설정과 가중치를 확인해 주세요.'}[code]||'자료를 확인하지 못했습니다. 설정과 연결 상태를 확인해 주세요.');
  async function request(path,options={}){if(!U()?.session())throw {code:'UNAUTHORIZED'};return U().request(path,options);}
  function portfolioEntry(target){
    const restoring=U()?.restoringSession?.();
    showState(target,restoring?'loading':'login',restoring?'로그인 정보를 확인하는 중…':'로그인하면 나만의 모의자산으로 매수·매도할 수 있어요.',...(restoring?[]:[button('로그인하기',()=>U()?.openProfile())]),button('ZERO 참고 운용 보기',()=>window.ZERO?.navigate('comparison')));
  }
  function clearPrivate(){epoch++;staff=[];paperActive=false;paperSelection=null;const target=companyContent();if(target)showLogin(target);const personal=portfolioContent();if(personal)portfolioEntry(personal);}
  document.addEventListener('zero-session-changed',()=>{clearPrivate();if(document.documentElement.dataset.zeroView==='company')open();else if(document.documentElement.dataset.zeroView==='portfolio')openPortfolio();});
  document.addEventListener('zero-view-changed',()=>{epoch++;paperActive=false;const personal=portfolioContent();if(personal&&document.documentElement.dataset.zeroView!=='portfolio')personal.replaceChildren();});
  async function mountPaper(target){
    if(!target)return;const generation=++epoch;paperActive=false;
    try{
      if(!U()){showState(target,'error','로그인 연결을 불러오지 못했어요.',button('다시 불러오기',()=>mountPaper(target)));return;}
      if(U().session()?.membership?.kind!=='MEMBER'){portfolioEntry(target);return;}
      const panel=el('section','panel company-paper member-paper');target.replaceChildren(panel);await drawPaper(panel,generation);
    }catch(e){if(generation===epoch)showState(target,'error',paperReason(e?.code),button('다시 불러오기',()=>mountPaper(target)));}
  }
  function openPortfolio(){return mountPaper(portfolioContent());}

  function drawStaff(list,onChange=()=>{}){
    list.replaceChildren();staff.forEach((row,index)=>{
      const card=el('fieldset','company-staff');card.append(el('legend','',row.name||'직원 '+(index+1)));
      const name=field('직원 이름','text',row.name),team=field('팀 이름','text',row.team),persona=field('전략 성향','select','');name.input.maxLength=12;team.input.maxLength=12;
      Object.entries(PERSONAS).forEach(([value,label])=>{const opt=el('option','',label);opt.value=value;persona.input.append(opt);});persona.input.value=row.persona;
      const weight=field('전략 가중치(%)','number',row.weight,0,100),lookback=field('관찰 거래일','number',row.params.lookback,20,200),vol=field('목표 연 변동성','number',row.params.vol_target,0.05,0.4),rebalance=field('재배분 주기(거래일)','number',row.params.rebalance_days,1,60);vol.input.step='0.01';
      const head=el('div','company-staff-head'),info=el('div','company-staff-info'),advanced=el('details','company-staff-advanced');
      head.append(avatar(()=>lookOf(row.persona,row.name),(row.name||'직원')+' 캐릭터'),info);[name,team,persona,weight].forEach(f=>info.append(f.wrap));
      advanced.append(el('summary','','고급 설정 · 관찰 기간, 변동성, 재배분 주기'));[lookback,vol,rebalance].forEach(f=>advanced.append(f.wrap));
      card.append(head,advanced);
      name.input.addEventListener('input',()=>row.name=name.input.value);team.input.addEventListener('input',()=>row.team=team.input.value);persona.input.addEventListener('change',()=>row.persona=persona.input.value);
      weight.input.addEventListener('input',()=>row.weight=Number(weight.input.value));lookback.input.addEventListener('input',()=>row.params.lookback=Number(lookback.input.value));vol.input.addEventListener('input',()=>row.params.vol_target=Number(vol.input.value));rebalance.input.addEventListener('input',()=>row.params.rebalance_days=Number(rebalance.input.value));
      card.append(button('직원 고용 해제',()=>{staff.splice(index,1);if(staff.length)evenWeights(staff);drawStaff(list,onChange);onChange();}));list.append(card);
    });
  }
  function staffOffice(company,rows){
    const groups=new Map();rows.forEach(row=>{if(!groups.has(row.team))groups.set(row.team,[]);groups.get(row.team).push({name:row.name,persona:row.persona==='TREND'?'열정적':'꼼꼼함',duty:PERSONAS[row.persona]+' 전략 연구'});});
    return {company:company.name||'대표님의 회사',teams:[...groups].map(([name,members])=>({name,role:'비공개 전략 연구',leader:members[0],members:members.slice(1)}))};
  }
  const paperMoney=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('ko-KR').format(value)+'원':'시세 확인 필요';
  const paperTime=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short',hour12:false}).format(new Date(value))+' KST':'관측 시각 확인 필요';
  const paperReason=code=>({INSUFFICIENT_CASH:'모의현금이 부족합니다. 기존 가상 지분이나 보유 주식을 먼저 정리해 주세요.',INSUFFICIENT_POSITION:'보유 수량보다 많이 팔 수 없습니다.',QUOTES_UNAVAILABLE:'유효한 공개 시세를 확인하지 못했습니다. 매매를 진행하지 않습니다.',FX_UNAVAILABLE:'유효한 USD/KRW 환율이 없어 미국 종목 매매를 진행하지 않습니다.',QUOTE_CHANGED:'시세가 바뀌었습니다. 새 시세로 금액을 확인해 주세요.',PAPER_CONFLICT:'보유 내역이 바뀌었습니다. 새로 불러온 뒤 다시 확인해 주세요.',LEGACY_ALREADY_LIQUIDATED:'이미 현금화한 기존 가상 지분입니다.',STAFF_REQUIRED:'전략 직원을 먼저 저장해 주세요.',LEGACY_PORTFOLIO_REQUIRED:'기존 연습 포트폴리오가 준비되어야 모의거래를 시작할 수 있습니다.',TRADE_INVALID:'종목과 정수 수량을 확인해 주세요.',IDEMPOTENCY_CONFLICT:'이미 사용한 거래 요청입니다. 거래 내역을 확인해 주세요.',UNAUTHORIZED:'로그인한 뒤 사용해 주세요.'}[code]||'모의투자 연결을 확인하지 못했습니다. 저장 결과와 거래 내역을 다시 확인해 주세요.');
  function pendingPaper(account_id){
    if(paperPending.has(account_id))return paperPending.get(account_id);
    try{const stored=JSON.parse(window.sessionStorage?.getItem('zero.paper.pending.'+account_id)||'null');if(stored?.account_id===account_id&&/^[0-9a-f-]{36}$/.test(stored.body?.idempotency_key||'')){paperPending.set(account_id,stored);return stored;}}catch(_){}
    return null;
  }
  function savePendingPaper(value,account_id=value?.account_id){if(value)paperPending.set(account_id,value);else paperPending.delete(account_id);try{const key='zero.paper.pending.'+account_id;if(value)window.sessionStorage?.setItem(key,JSON.stringify(value));else window.sessionStorage?.removeItem(key);}catch(_){/* In-memory replay remains available when browser storage is disabled. */}}
  function paperObservation(target,quote){
    if(!quote){target.append(el('p','muted-note','시세 확인 필요 · 평가액과 거래 가능 여부를 추정하지 않습니다.'));return;}
    target.append(el('p','muted-note','공개 지연 시세 '+new Intl.NumberFormat('ko-KR',{maximumFractionDigits:6}).format(quote.price_minor/quote.scale)+' '+quote.currency+' · '+paperTime(quote.as_of)));
    if(quote.fx)target.append(el('p','muted-note','USD/KRW '+new Intl.NumberFormat('ko-KR',{maximumFractionDigits:6}).format(quote.fx.price_minor/quote.fx.scale)+' · '+paperTime(quote.fx.as_of)));
    for(const [label,url] of [['시세 원문',quote.source],['환율 원문',quote.fx?.source]])if(typeof url==='string'&&/^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\//.test(url)){const a=el('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';target.append(a);}
  }
  function paperPreview(quote,quantity,buy){
    let n=BigInt(quote.price_minor)*BigInt(quantity),d=BigInt(quote.scale);if(quote.currency==='USD'){if(!quote.fx)return null;n*=BigInt(quote.fx.price_minor);d*=BigInt(quote.fx.scale);}
    const amount=(n+(buy?d-1n:0n))/d;return amount<=BigInt(Number.MAX_SAFE_INTEGER)?Number(amount):null;
  }
  function openPaperFor(identity=null){
    if(identity!==null&&!/^(?:US:[A-Z][A-Z0-9.-]{0,14}|KR:\d{6})$/.test(identity))return;
    paperSelection=identity;if(document.documentElement.dataset.zeroView==='portfolio'||!window.ZERO?.navigate)return openPortfolio();return window.ZERO.navigate('portfolio');
  }
  async function drawPaper(panel,generation){
    const load=Number(panel.dataset.paperGeneration||0)+1;panel.dataset.paperGeneration=String(load);
    const current=()=>generation===epoch&&panel.isConnected&&panel.dataset.paperGeneration===String(load);
    panel.replaceChildren(el('h2','','내 모의투자 · 직접 매매'),el('p','muted-note','앱 모의투자 · 실제 계좌와 분리'));
    const status=el('p','muted-note','모의투자 보유 내역을 불러오는 중…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');panel.append(status);
    try{
      const data=await request('/me/paper');if(!current())return;
      const account=data.account;if(data.scope!=='APP_PAPER_TRADING'||!account||!Number.isSafeInteger(account.account_id)||account.account_id<1||!Number.isSafeInteger(account.revision)||!Number.isSafeInteger(account.cash_krw)||!Array.isArray(account.positions)||!Array.isArray(account.legacy))throw {code:'PAPER_RESPONSE_INVALID'};
      paperActive=true;
      const account_id=account.account_id,summary=el('div','company-paper-summary');
      for(const [metric,label,value] of [['total','모의 총자산',paperMoney(account.total_krw)],['cash','사용 가능 모의현금',paperMoney(account.cash_krw)],['return','수익률',pct(account.return_percent)],['initial','시작 모의현금',paperMoney(account.initial_capital_krw)]]){const item=el('p','paper-'+metric,label+' '+value);item.dataset.paperMetric=metric;summary.append(item);}panel.append(summary);
      if(!account.positions.length&&!account.legacy.some(position=>!position.liquidated))panel.append(el('p','muted-note','보유 종목이 없어요. 원하는 종목과 수량을 선택해 모의 매수를 시작해 보세요.'));

      const basis=el('details','company-paper-basis');basis.append(el('summary','','모의거래 계산 기준'),el('p','muted-note',data.disclosure));panel.append(basis);
      if(account.cash_krw===0&&account.legacy.some(p=>!p.liquidated))panel.append(el('p','muted-note','보유 지분을 먼저 정리하면 매수할 모의현금이 생겨요.'));
      const pending=pendingPaper(account_id),controls=[],legacyButtons=[],preview=el('div','company-paper-preview'),holdings=el('div','company-paper-holdings');preview.setAttribute('aria-live','polite');
      const market=field('시장','select',''),symbol=field('종목 코드','text',''),side=field('모의 매매','select',''),quantity=field('수량(정수 주)','number',1,1,100000000);quantity.input.step='1';symbol.input.maxLength=15;symbol.input.placeholder='AAPL 또는 005930';
      for(const [input,options] of [[market.input,[['US','미국 주식'],['KR','한국 주식']]],[side.input,[['BUY','모의 매수'],['SELL','모의 매도']]]]){for(const [value,text] of options){const option=el('option','',text);option.value=value;input.append(option);}input.value=options[0][0];}
      if(paperSelection&&!pending){market.input.value=paperSelection.slice(0,2);symbol.input.value=paperSelection.slice(3);paperSelection=null;}
      const form=el('div','company-paper-form');form.append(market.wrap,symbol.wrap,side.wrap,quantity.wrap);controls.push(market.input,symbol.input,side.input,quantity.input);
      let previewEpoch=0,intent=null,busy=false,unknown=Boolean(pending);
      const lock=on=>{controls.forEach(control=>control.disabled=on);legacyButtons.forEach(control=>control.disabled=on||control.dataset.quoteUnavailable==='true');};
      async function submit(body){
        if(busy||!current())return;busy=true;lock(true);savePendingPaper({account_id,body});status.textContent='모의거래 저장 결과를 확인하는 중…';
        try{
          const result=await request('/me/paper/trades',{method:'POST',body});if(!current())return;if(!result.receipt)throw {code:'PAPER_RESPONSE_INVALID'};
          savePendingPaper(null,account_id);await drawPaper(panel,generation);if(generation===epoch&&panel.isConnected){const saved=el('p','company-paper-success','모의거래 기록 확인 · '+result.receipt.identity+' · 현금 증감 '+paperMoney(result.receipt.cash_delta_krw));saved.setAttribute('role','status');panel.append(saved);await U()?.refresh();}
        }catch(e){if(!current())return;
          // Only a durable server rejection rules out a late commit of the original request.
          if(e.terminal===true){savePendingPaper(null,account_id);unknown=false;intent=null;preview.replaceChildren();lock(false);status.textContent=paperReason(e.code);}
          else{unknown=true;preview.replaceChildren(el('p','','저장 여부가 아직 확인되지 않았습니다. 같은 요청으로 결과를 확인하세요.'),button('같은 모의거래 결과 확인',()=>submit(body)));status.textContent=paperReason(e.code);}
        }finally{busy=false;}
      }
      async function prepare(action,identity,count){
        if(busy||unknown||!current())return;
        if(!/^(?:US:[A-Z][A-Z0-9.-]{0,14}|KR:\d{6})$/.test(identity)||!Number.isSafeInteger(count)||count<1||count>100000000){status.textContent=paperReason('TRADE_INVALID');return;}
        const ownPreview=++previewEpoch;intent=null;preview.replaceChildren();status.textContent='공개 시세와 거래 금액을 확인하는 중…';
        try{
          const observation=await request('/me/paper/quote?identity='+encodeURIComponent(identity)+(action==='LIQUIDATE_LEGACY'?'&legacy=1':''));if(!current()||ownPreview!==previewEpoch)return;
          if(!observation.quote||!observation.quote_id)throw {code:'PAPER_RESPONSE_INVALID'};
          const quote=observation.quote,legacy=action==='LIQUIDATE_LEGACY',amount=legacy?observation.legacy_value_krw:paperPreview(quote,count,action==='BUY');
          if(legacy&&observation.account_revision!==account.revision)throw {code:'PAPER_CONFLICT'};
          if(!Number.isSafeInteger(amount))throw {code:'PAPER_RESPONSE_INVALID'};
          intent={action,identity,quantity:count,expected_revision:account.revision,idempotency_key:crypto.randomUUID(),quote_id:observation.quote_id};
          preview.append(el('h3','','모의거래 확인'),el('p','',identity+' · '+(legacy?'기존 가상 지분 전량 정리':(action==='BUY'?'매수 ':'매도 ')+count+'주')),el('p','','모의현금 예상 '+(action==='BUY'?'지출 ':'수령 ')+paperMoney(amount)));paperObservation(preview,quote);
          preview.append(button(legacy?'가상 지분을 모의현금으로 정리':action==='BUY'?'모의 매수 확정':'모의 매도 확정',()=>{if(intent&&ownPreview===previewEpoch)return submit(intent);}));status.textContent='시세와 금액을 확인한 뒤 모의거래를 확정해 주세요.';
        }catch(e){if(current()&&ownPreview===previewEpoch)status.textContent=paperReason(e.code);}
      }
      controls.forEach(control=>{const invalidate=()=>{if(unknown)return;previewEpoch++;intent=null;preview.replaceChildren();status.textContent='입력이 바뀌었습니다. 시세와 금액을 다시 확인해 주세요.';};control.addEventListener('input',invalidate);control.addEventListener('change',invalidate);});
      const check=button('시세·금액 확인',()=>prepare(side.input.value,market.input.value+':'+symbol.input.value.trim().toUpperCase(),Number(quantity.input.value)));controls.push(check);form.append(check);panel.append(form,preview,holdings);
      holdings.append(el('h3','','보유 내역'));
      for(const position of account.legacy){const row=el('div','company-paper-holding');row.append(el('p','',position.identity+' · 기존 가상 지분 '+position.weight_percent+'% · '+(position.liquidated?'정리 완료':paperMoney(position.value_krw))));if(!position.liquidated){paperObservation(row,position.quote);const sell=button('이 가상 지분 정리',()=>prepare('LIQUIDATE_LEGACY',position.identity,1));sell.disabled=!position.quote;sell.dataset.quoteUnavailable=String(!position.quote);legacyButtons.push(sell);row.append(sell);}holdings.append(row);}
      for(const position of account.positions){const row=el('div','company-paper-holding');row.append(el('p','',position.identity+' · '+position.quantity+'주 · '+paperMoney(position.value_krw)),el('p','muted-note','모의 취득금액 '+paperMoney(position.cost_krw)));paperObservation(row,position.quote);const sell=button('이 종목 모의 매도',()=>{market.input.value=position.identity.slice(0,2);symbol.input.value=position.identity.slice(3);side.input.value='SELL';quantity.input.value=position.quantity;return prepare('SELL',position.identity,position.quantity);});legacyButtons.push(sell);row.append(sell);holdings.append(row);}
      if(!account.positions.length)holdings.append(el('p','muted-note',account.legacy.some(position=>!position.liquidated)?'새로 매수한 종목이 없습니다. 기존 가상 지분에는 임의 주식 수량을 붙이지 않습니다.':'아직 보유한 종목이 없습니다.'));
      panel.append(button('모의투자 새로 불러오기',()=>{if(!busy)return drawPaper(panel,generation);}));
      const history=el('details','company-paper-records'),historyRows=el('div');history.append(el('summary','','모의거래 내역'),historyRows);panel.append(history);
      async function historyPage(before=null){try{const result=await request('/me/paper/trades'+(before?'?before='+before:''));if(!current())return;if(!Array.isArray(result.items))throw {code:'PAPER_RESPONSE_INVALID'};if(!before&&!result.items.length)historyRows.append(el('p','muted-note','저장된 모의거래가 없습니다.'));result.items.forEach(row=>historyRows.append(el('p','',paperTime(row.created_at)+' · '+row.identity+' · '+({BUY:'모의 매수',SELL:'모의 매도',LIQUIDATE_LEGACY:'기존 지분 정리'}[row.action]||'모의거래')+' · '+(row.unit==='SHARE'?row.quantity+'주 · ':'')+paperMoney(row.cash_delta_krw))));if(result.next_before){const more=button('이전 모의거래 더 보기',async()=>{if(more.disabled)return;more.disabled=true;more.remove();await historyPage(result.next_before);});historyRows.append(more);}}catch(e){if(current())historyRows.append(el('p','muted-note',paperReason(e.code)),button('거래 내역 다시 불러오기',()=>{historyRows.replaceChildren();return historyPage();}));}}
      const discussions=el('div','company-paper-discussions');discussions.append(el('h3','','직원 일일 보유·시장 점검'));panel.append(discussions);
      const reports=el('div');
      let reportRowsPage = 1;
      function reportRows(items){
        reports.replaceChildren();if(!items.length){reports.append(el('p','muted-note','아직 저장된 일일 점검이 없습니다. 오늘의 보유와 시장 관찰을 기록해 주세요.'));return;}
        const pageSize = 5;
        const totalPages = Math.ceil(items.length / pageSize);
        if (reportRowsPage > totalPages && totalPages > 0) reportRowsPage = 1;
        const pageItems = items.slice((reportRowsPage - 1) * pageSize, reportRowsPage * pageSize);
        pageItems.forEach(report=>{
          const details=el('details');details.append(el('summary','',report.day+' KST · '+(report.revision!==account.revision?'이전 보유 기준 · ':'현재 보유 기준 · ')+(report.state==='PARTIAL'?'시세 일부 확인 필요':'규칙 기반 관찰')),el('p','muted-note',report.notice));
          for(const text of [report.market_observation,report.hold,report.change])if(text)details.append(el('p','',text));
          (report.holdings||[]).forEach(p=>{details.append(el('p','',p.identity+' · '+(p.unit==='SHARE'?p.quantity+'주':'기존 가상 지분')+' · '+paperMoney(p.value_krw)),el('p','muted-note','현재 비중 '+pct(p.current_weight_percent)+' · '+(p.unit==='SHARE'?'취득 대비 모의 평가 변화 ':'기존 기준가 대비 가격 변화 ')+pct(p.holding_return_percent)));paperObservation(details,p.quote);if(p.market?.state==='AVAILABLE')details.append(el('p','muted-note',p.market.start_date+'~'+p.market.end_date+' · 완료 일봉 '+p.market.bars+'개 · 기간 가격 변화 '+pct(p.market.return_percent)+' · '+(p.review_focus==='CHANGE_REVIEW'?'변경 필요성 점검':'유지 근거 점검')+' · '+p.market.notice));});
          (report.staff||[]).forEach(person=>details.append(el('p','',person.name+' · '+(PERSONAS[person.persona]||person.persona)),el('p','',person.observation),el('p','',person.hold),el('p','',person.change)));reports.append(details);
        });
        if (totalPages > 1) {
          const nav = el('nav', 'desk-pagination');
          const prev = el('button', '', '‹ 이전'); prev.disabled = reportRowsPage <= 1; prev.onclick = () => { reportRowsPage--; reportRows(items); };
          const next = el('button', '', '다음 ›'); next.disabled = reportRowsPage >= totalPages; next.onclick = () => { reportRowsPage++; reportRows(items); };
          const info = el('span', 'page-indicator', reportRowsPage + ' / ' + totalPages + ' (' + items.length + '건)');
          nav.append(prev, info, next);
          reports.append(nav);
        }
      }
      const dailyStatus=el('p','muted-note');dailyStatus.setAttribute('role','status');
      const recordDaily=async()=>{if(!current()||daily.disabled||busy||unknown)return;daily.disabled=true;try{const report=await request('/me/paper/discussions',{method:'POST',body:{}});if(!current())return;reportRows([report.discussion]);dailyStatus.textContent='오늘의 실제 보유·공개 시세 관찰을 저장했습니다. 규칙 기반 기록이며 AI 대화 완료가 아닙니다.';const all=await request('/me/paper/discussions');if(current()){const items=all.items||[];if(!items.some(row=>row.day===report.discussion.day&&row.revision===report.discussion.revision))items.unshift(report.discussion);reportRows(items);}}catch(e){if(current())dailyStatus.textContent=paperReason(e.code);}finally{if(current())daily.disabled=busy||unknown;}};
      const daily=button('오늘 보유·시장 점검 기록',recordDaily);controls.push(daily);discussions.append(el('p','muted-note','오늘 처음 열면 보유·시장 관찰을 자동 저장해요. 직원이 없으면 기본 관찰만 기록해요.'),daily,dailyStatus,reports);
      status.textContent=account.total_krw===null?'일부 평가 시세를 확인하지 못했습니다. 사용 가능한 모의현금은 별도로 표시합니다.':'내 모의현금과 보유 종목을 불러왔습니다.';
      if(pending){lock(true);status.textContent='결과를 확인하지 못한 모의거래가 있습니다. 같은 요청으로 먼저 확인해 주세요.';preview.append(button('같은 모의거래 결과 확인',()=>submit(pending.body)));}
      await Promise.all([historyPage(),(async()=>{try{const rows=await request('/me/paper/discussions');if(!current())return;reportRows(rows.items||[]);const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);if(!pending&&!(rows.items||[]).some(row=>row.day===day&&row.revision===account.revision))await recordDaily();}catch(e){if(current())reports.append(el('p','muted-note',paperReason(e.code)));}})()]);
    }catch(e){if(current()){status.textContent=paperReason(e.code);panel.append(button('모의투자 연결 다시 시도',()=>drawPaper(panel,generation)));}}
  }
  async function open(){
    const target=companyContent();if(!target)return;const generation=++epoch;showState(target,'loading','회사를 불러오는 중…');
    try{
      if(!U()){showState(target,'error','로그인 연결을 불러오지 못했어요. 다시 불러와 주세요.',button('다시 불러오기',open));return;}
      if(!U().session()){showLogin(target);return;}
      const [companyData,staffData]=await Promise.all([request('/me/company'),request('/me/staff')]);if(generation!==epoch)return;
      const company=companyData.company||companyData;staff=Array.isArray(staffData.staff)?structuredClone(staffData.staff):[];
      const name=field('투자회사 이름','text',company.name||''),note=el('p','muted-note'),list=el('div','company-staff-list');name.input.maxLength=20;
      const steps=el('ol','company-steps'),hires=el('section','panel company-hires');steps.setAttribute('aria-label','투자회사 시작 순서');
      const drawSteps=()=>{const rows=[['회사 이름',!!(company.name||'').trim(),()=>name.input.focus()],['직원 고용',staff.length>0,()=>hires.scrollIntoView?.({behavior:'smooth',block:'start'})],['사무실 꾸미기',false,()=>U()?.editOffice()]];
        steps.replaceChildren(...rows.map(([label,done,go],index)=>{const item=el('li',done?'company-step done':'company-step'),action=el('button','company-step-button');action.type='button';action.append(el('b','',done?'완료':String(index+1)),el('span','',label));action.addEventListener('click',go);item.append(action);return item;}));};
      const settings=el('section','panel');settings.append(el('h2','','내 투자회사'),name.wrap,button('회사 이름 저장',async()=>{try{await request('/me/company',{method:'PUT',body:{name:name.input.value,space:company.space}});if(generation!==epoch)return;company.name=name.input.value;drawSteps();note.textContent='회사 이름을 저장했어요.';await U().refresh();}catch(e){note.textContent=reason(e.code);}}),button('인테리어·팀 구성',()=>U()?.editOffice()),note);
      const hireNote=el('p','muted-note company-hire-note'),redraw=()=>{drawStaff(list,drawSteps);drawSteps();};hireNote.setAttribute('role','status');
      const hire=persona=>{if(staff.length>=20){hireNote.textContent='직원은 최대 20명이에요.';return;}const role=ROLES[persona],same=staff.filter(row=>row.persona===persona).length+1;staff.push({name:role.short+' 연구원 '+same,team:role.team,persona,weight:0,params:{lookback:60,vol_target:0.15,rebalance_days:20}});evenWeights(staff);redraw();hireNote.textContent=role.short+' 연구원을 고용했어요. 전략 가중치는 '+staff.length+'명이 똑같이 나눴어요. 저장해야 반영돼요.';};
      const roster=el('div','company-roles');for(const [persona,role] of Object.entries(ROLES)){const card=el('button','company-role');card.type='button';card.append(avatar(()=>lookOf(persona),PERSONAS[persona]+' 캐릭터'),el('strong','',PERSONAS[persona]),el('small','',role.desc));card.addEventListener('click',()=>hire(persona));roster.append(card);}
      hires.append(el('h2','','페르소나 직원 고용·배치'),el('p','muted-note','원하는 성향을 누르면 바로 고용돼요. 이름·팀은 아래에서 바꿀 수 있어요. 가치·고배당 전략은 당시의 재무·배당 근거가 있어야 실행됩니다. 자료가 없으면 임의 가격 전략으로 대체하지 않습니다.'),roster,hireNote,list);
      hires.append(button('직원 고용',()=>hire('TREND')),button('가중치 똑같이 나누기',()=>{if(!staff.length)return;evenWeights(staff);redraw();hireNote.textContent='전략 가중치를 '+staff.length+'명이 똑같이 나눴어요.';}),button('전략 가중치 저장',async()=>{const error=staffProblem(staff);if(error){note.textContent=error;return;}try{const saved=await request('/me/staff',{method:'PUT',body:{staff}});if(generation!==epoch)return;if(Array.isArray(saved.staff)){staff=structuredClone(saved.staff);redraw();}note.textContent='전략 배치를 저장했어요.';await U().refresh();}catch(e){note.textContent=reason(e.code);}}),button('직원을 내 사무실에 배치',()=>{const error=staffProblem(staff);if(error){note.textContent=error;return;}window.ZERO?.navigate('lobby');window.ZEROLobby?.showOwn({nick:U().session().nick,team:staffOffice(company,staff),space:company.space});}));
      const research=el('section','panel'),range=field('검증 기간','select',''),fees=field('수수료 가정(bps)','number',10,0,100),slip=field('슬리피지 가정(bps)','number',5,0,100),result=el('div','company-result');
      [['5Y','최근 5년 자료 · 준비 구간 제외']].forEach(([value,text])=>{const option=el('option','',text);option.value=value;range.input.append(option);});range.input.value='5Y';
      let runId=null;const run=button('직원 조합 백테스트',async()=>{const error=staffProblem(staff);if(error){result.textContent=error;return;}run.disabled=true;run.textContent='직원 조합 백테스트';runId=null;result.replaceChildren(el('p','','공개 가격으로 전략을 검증하고 있어요…'));
        try{const data=await request('/me/backtests',{method:'POST',body:{range:range.input.value,fee_bps:Number(fees.input.value),slippage_bps:Number(slip.input.value)}});if(generation!==epoch)return;const output=data.run||data;runId=output.id||data.id;
          if(output.state!=='AVAILABLE'){result.replaceChildren(el('p','',reason(output.reason)));return;}
          result.replaceChildren(el('h3','','과거 데이터 연구 결과 · 실제 운용 수익 아님'),el('p','',(output.start_date||output.period?.start_date||'')+' ~ '+(output.end_date||output.period?.end_date||'')),el('p','','참고 수익률 '+pct(output.metrics?.return_percent)+' · 최대 낙폭 '+pct(output.metrics?.max_drawdown_percent)));
          (output.signals||[]).slice(0,16).forEach(signal=>result.append(el('p','','검토 신호 '+signal.symbol+' · '+signal.action+' · 목표 '+pct(signal.target_weight_percent))));
          result.append(el('p','muted-note','시점 이후 자료를 과거 판단에 쓰지 않는 연구 계산입니다. 배당·환율·세금 제외 가정은 결과에서 확인하세요. 신호는 가상 실험의 검토 제안입니다. '+REVIEW_NOTICE+' 계좌 주문·리밸런싱을 실행하지 않습니다.'));
        }catch(e){if(generation===epoch){result.replaceChildren(el('p','',reason(e.code)));run.textContent='백테스트 다시 시도';}}finally{if(generation===epoch)run.disabled=false;}});
      research.append(el('h2','','백테스트·리밸런싱 신호'),el('p','muted-note',REVIEW_NOTICE),el('p','muted-note','과거 전략은 저장된 연습 비중과 비교하며, 없으면 현금 100%를 기준으로 사용해요. 내 모의계좌의 현재 보유와는 별도예요.'),range.wrap,fees.wrap,slip.wrap,run,button('오늘의 운용 검토 완료',async()=>{if(!runId){result.append(el('p','','먼저 서버에 저장된 전략 검증 결과를 확인해 주세요.'));return;}try{await request('/me/daily-review',{method:'POST',body:{run_id:runId}});if(generation!==epoch)return;await U().refresh();result.append(el('p','','서버에서 일일 검토 기록을 확인했어요. 같은 기록은 중복 보상하지 않아요. '+REVIEW_NOTICE));}catch(e){result.append(el('p','',reason(e.code)));}}),result);
      const paper=el('section','panel company-paper');redraw();target.replaceChildren(steps,settings,hires,paper,research);target.dataset.companyState='ready';target.setAttribute('aria-busy','false');await drawPaper(paper,generation);
    }catch(e){if(generation===epoch){if(e?.code==='UNAUTHORIZED')showLogin(target);else showState(target,'error',reason(e?.code),button('다시 불러오기',open));}}
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
      data.calendar.events.slice(0,20).forEach(event=>{const row=el('p','',event.date+' · '+(event.kind==='DIVIDEND'?'배당':'실적')+(event.confirmed===false?' · 예정/변경 가능':''));if(/^https:\/\//.test(event.source_url||'')){const link=el('a','','원문');link.href=event.source_url;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}calendar.append(row);});card.append(calendar,button('시장 속보·주요 뉴스',()=>window.ZERO?.navigate('news')),button('이 종목 모의 매매',()=>openPaperFor(identity)));
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
  window.ZEROCompany={open,openPortfolio,mountPaper,openMarketCard,officeFor,openPaperFor,paperTradingActive:()=>paperActive};if(document.documentElement.dataset.zeroView==='company')open();else if(document.documentElement.dataset.zeroView==='portfolio')openPortfolio();
})();
