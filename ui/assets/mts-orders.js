/* Owner gateway is optional and server-authenticated. Defaults remain draft-only.
 * Every mutation requires a fresh server preflight and a draft-bound approval.
 * Social identity or JSON evidence flags never grant broker authority.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZEROMTSOrders=api;
})(typeof window==='object'?window:globalThis,function(root){
  'use strict';
  const currencies={US:'USD',KR:'KRW'},mounted=new WeakMap();let configured={},nextId=0;
  const labels={TRUSTED_EVIDENCE_REQUIRED:'검증된 서버 근거가 필요합니다.',SESSION_REQUIRED:'본인 계좌의 확인된 세션이 필요합니다.',EVIDENCE_INVALID:'사전 확인 근거를 대조하지 못했습니다.',EVIDENCE_EXPIRED:'근거가 오래됐습니다. 새 근거로 다시 확인하세요.',LEDGER_UNVERIFIED:'입출금·비용·환율·미결제 원장을 확인해야 합니다.',CASH_UNKNOWN:'통화별 결제 현금·예약 금액이 미확인입니다.',COST_UNKNOWN:'예상 수수료·세금·환전 비용이 미확인입니다.',COST_EXCEEDS_PROCEEDS:'예상 비용이 매도대금보다 큽니다.',QUOTE_UNVERIFIED:'현재 주문 판단에 사용할 시세 근거가 미확인입니다.',CASH_INSUFFICIENT:'결제 현금에서 예약 금액을 뺀 잔액이 부족합니다.',POSITION_INSUFFICIENT:'확인된 매도 가능 수량이 부족합니다.',MARKET_PRICE_UNBOUNDED:'시장가는 최종 가격·필요 금액을 확정할 수 없습니다.'};
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const exact=(x,required)=>object(x)&&Object.keys(x).length===required.length&&required.every(k=>Object.hasOwn(x,k));
  const text=x=>typeof x==='string'&&x.length>0&&x.length<=256&&!/[\u0000-\u001f\u007f]/.test(x);
  function decimal(value,scale=8){
    if(typeof value!=='string'||value.length>30||!/^\d+(?:\.\d+)?$/.test(value))throw Error('MTS_DECIMAL_INVALID');
    const [whole,fraction='']=value.split('.');if(fraction.length>scale)throw Error('MTS_DECIMAL_INVALID');
    return {units:BigInt(whole+fraction),scale:fraction.length};
  }
  function decimalText(value){
    const negative=value.units<0n,digits=(negative?-value.units:value.units).toString().padStart(value.scale+1,'0');
    const s=value.scale?digits.slice(0,-value.scale)+'.'+digits.slice(-value.scale):digits;
    return (negative?'-':'')+(s.includes('.')?s.replace(/0+$/,'').replace(/\.$/,''):s);
  }
  const aligned=(a,scale)=>a.units*10n**BigInt(scale-a.scale);
  function add(a,b,subtract=false){const scale=Math.max(a.scale,b.scale);return {units:aligned(a,scale)+(subtract?-1n:1n)*aligned(b,scale),scale};}
  const compare=(a,b)=>{const scale=Math.max(a.scale,b.scale),x=aligned(a,scale),y=aligned(b,scale);return x<y?-1:x>y?1:0;};
  const multiply=(a,b)=>({units:a.units*b.units,scale:a.scale+b.scale});
  function normalizeDraft(raw){
    if(!exact(raw,['draft_id','identity','currency','side','order_type','quantity','limit_price'])||!text(raw.draft_id)||!/^[A-Za-z0-9_-]{1,36}$/.test(raw.draft_id)||typeof raw.identity!=='string'||!/^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[A-Z0-9]{6})$/.test(raw.identity))throw Error('MTS_DRAFT_INVALID');
    const market=raw.identity.slice(0,2);if(raw.currency!==currencies[market]||!['BUY','SELL'].includes(raw.side)||!['LIMIT','MARKET'].includes(raw.order_type))throw Error('MTS_DRAFT_INVALID');
    let quantity;try{quantity=decimal(raw.quantity,6);}catch(_){throw Error('MTS_QUANTITY_INVALID');}
    if(quantity.units<=0n||(quantity.units%10n**BigInt(quantity.scale)!==0n&&!(market==='US'&&raw.side==='SELL'&&raw.order_type==='MARKET')))throw Error('MTS_QUANTITY_INVALID');
    let limit=null;
    if(raw.order_type==='LIMIT'){
      try{limit=decimal(raw.limit_price,market==='KR'?0:4);}catch(_){throw Error('MTS_PRICE_INVALID');}
      if(limit.units<=0n||market==='US'&&compare(limit,decimal('1'))>=0&&limit.scale>2)throw Error('MTS_PRICE_INVALID');
    }else if(raw.limit_price!==null)throw Error('MTS_PRICE_INVALID');
    return Object.freeze({draft_id:raw.draft_id,identity:raw.identity,currency:raw.currency,side:raw.side,order_type:raw.order_type,quantity:decimalText(quantity),limit_price:limit?decimalText(limit):null});
  }
  const draftKey=d=>JSON.stringify(normalizeDraft(d));
  function timestamp(value){
    if(typeof value!=='string'||value.length>64||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw Error('MTS_TIME_INVALID');
    const n=Date.parse(value),day=Date.parse(value.slice(0,10)+'T00:00:00Z');if(!Number.isFinite(n)||!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==value.slice(0,10))throw Error('MTS_TIME_INVALID');return n;
  }
  function boundEvidence(d,e,ctx,scope){
    if(ctx.trusted!==true)throw Error('TRUSTED_EVIDENCE_REQUIRED');
    if(!text(ctx.session_id))throw Error('SESSION_REQUIRED');
    if(!object(e)||e.schema_version!==1||e.scope!==scope||!['TOSS','KIS_MOCK'].includes(e.source)||e.execution_authorized!==false||e.draft_key!==draftKey(d)||e.session_id!==ctx.session_id)throw Error('EVIDENCE_INVALID');
    const checked=timestamp(e.checked_at);if(!Number.isFinite(ctx.now)||checked>ctx.now||ctx.now-checked>60000)throw Error('EVIDENCE_EXPIRED');
    return checked;
  }
  function preflight(raw,evidence,context={}){
    const d=normalizeDraft(raw),ctx={now:Date.now(),...context},result={state:'PREVIEW_ONLY',checks_state:'HOLD',simulation:false,execution_authorized:false,ledger_verified:false,currency:d.currency,notional:null,total:null,available:null,blockers:[]};
    try{
      boundEvidence(d,evidence,ctx,'MTS_ORDER_PREFLIGHT');
      const e=evidence;
      result.simulation=e.source==='KIS_MOCK';
      if(!exact(e,['schema_version','scope','source','draft_key','session_id','account_ref','checked_at','expires_at','execution_authorized','ledger','cash','position','costs','quote'])||!text(e.account_ref))throw Error('EVIDENCE_INVALID');
      if(timestamp(e.expires_at)<=ctx.now||timestamp(e.expires_at)-timestamp(e.checked_at)>60000)throw Error('EVIDENCE_EXPIRED');
      if(!exact(e.ledger,['verified','whole_account_verified','cashflow_verified','fx_verified','unsettled_verified'])||!Object.values(e.ledger).every(x=>x===true))throw Error('LEDGER_UNVERIFIED');
      if(!exact(e.cash,['basis','currency','settled','reserved','unsettled'])||e.cash.basis!=='SETTLED_CASH_BEFORE_RESERVATIONS'||e.cash.currency!==d.currency)throw Error('CASH_UNKNOWN');
      let settled,reserved;try{settled=decimal(e.cash.settled);reserved=decimal(e.cash.reserved);decimal(e.cash.unsettled);}catch(_){throw Error('CASH_UNKNOWN');}
      const available=add(settled,reserved,true);result.available=decimalText(available);
      if(!exact(e.costs,['currency','fee','tax','fx'])||e.costs.currency!==d.currency)throw Error('COST_UNKNOWN');
      let costs;try{costs=add(add(decimal(e.costs.fee),decimal(e.costs.tax)),decimal(e.costs.fx));}catch(_){throw Error('COST_UNKNOWN');}
      if(!exact(e.quote,['identity','currency','price','as_of','delayed'])||e.quote.identity!==d.identity||e.quote.currency!==d.currency||e.quote.delayed!==false)throw Error('QUOTE_UNVERIFIED');
      const quoteTime=timestamp(e.quote.as_of);if(quoteTime>ctx.now||ctx.now-quoteTime>60000)throw Error('QUOTE_UNVERIFIED');
      const quote=decimal(e.quote.price);if(quote.units<=0n)throw Error('QUOTE_UNVERIFIED');
      const qty=decimal(d.quantity),price=d.limit_price===null?quote:decimal(d.limit_price),notional=multiply(qty,price),total=add(notional,costs,d.side==='SELL');
      result.notional=decimalText(notional);result.total=decimalText(total);
      if(d.side==='BUY'&&compare(available,total)<0)result.blockers.push('CASH_INSUFFICIENT');
      if(d.side==='SELL'){
        if(!exact(e.position,['identity','sellable'])||e.position.identity!==d.identity||compare(decimal(e.position.sellable),qty)<0)result.blockers.push('POSITION_INSUFFICIENT');
        if(total.units<0n)result.blockers.push('COST_EXCEEDS_PROCEEDS');
      }
      if(d.order_type==='MARKET')result.blockers.push('MARKET_PRICE_UNBOUNDED');
      if(!result.blockers.length)result.checks_state='PASS';
    }catch(error){const code=error.message;result.blockers.push(Object.hasOwn(labels,code)?code:'EVIDENCE_INVALID');}
    return result;
  }
  function orderStatus(raw,e,context={}){
    const d=normalizeDraft(raw),ctx={now:Date.now(),...context},unknown={state:'UNKNOWN',simulation:false,execution_authorized:false,ledger_verified:false,filled_quantity:null};
    try{
      const checked=boundEvidence(d,e,ctx,'MTS_ORDER_STATUS');
      if(!exact(e,['schema_version','scope','source','draft_key','session_id','checked_at','order_id','status','confirmed','filled_quantity','execution_authorized'])||!text(e.order_id)||e.confirmed!==true)return unknown;
      const qty=e.filled_quantity===null?null:decimal(e.filled_quantity,6),requested=decimal(d.quantity);
      if(qty&&compare(qty,requested)>0)return unknown;
      let state='UNKNOWN';
      if(['ACK','PENDING'].includes(e.status)&&(!qty||qty.units===0n))state='ACK';
      if(qty?.units>0n){
        if(e.status==='PARTIAL_FILLED'&&compare(qty,requested)<0)state='PARTIAL_FILLED';
        if(e.status==='FILLED'&&compare(qty,requested)===0)state='FILLED';
      }
      if(qty&&['REJECTED','CANCELED'].includes(e.status))state=e.status;
      return {state,simulation:e.source==='KIS_MOCK',execution_authorized:false,ledger_verified:false,filled_quantity:qty?decimalText(qty):null,checked_at:checked,order_id:e.order_id};
    }catch(_){return unknown;}
  }
  function configure(options){
    if(!object(options)||Object.keys(options).some(k=>!['getSession','getEvidence','verifyEvidence','gateway'].includes(k))||Object.entries(options).some(([k,v])=>k==='gateway'?!object(v)||['prepare','approve','submit','reconcile','evidence'].some(name=>typeof v[name]!=='function'):typeof v!=='function'))throw Error('MTS_OPTIONS_INVALID');
    configured={...options};
  }
  function mount(company,target,options={}){
    if(!target||!root.document||!object(company)||typeof company.id!=='string'||!/^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[A-Z0-9]{6})$/.test(company.id))return null;
    mounted.get(target)?.destroy();
    const opts={...configured,...options},doc=root.document,number=++nextId;
    const el=(tag,cls,copy)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(copy!==undefined)n.textContent=copy;return n;};
    const ticket=el('details','mts-orders panel'),summary=el('summary','','매수·매도 초안'),form=el('form','mts-order-form');
    const badge=el('p','mts-order-blocked','실제 제출 차단 · 주문 초안과 예상 금액만 확인합니다.'),status=el('p','mts-order-status','수량과 가격을 입력해 사전 근거를 확인하세요.'),estimate=el('p','mts-order-estimate');
    const feedback=el('div','mts-order-feedback');feedback.dataset.state='idle';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.setAttribute('aria-atomic','true');
    function notify(state,copy){feedback.dataset.state=state;feedback.replaceChildren(el('span','mts-order-feedback-message',copy));}
    const fields={};
    function field(name,label,type){const wrap=el('label','mts-order-field',label),input=el(type==='select'?'select':'input');input.dataset.field=name;input.id='mts-order-'+number+'-'+name;wrap.setAttribute('for',input.id);if(type!=='select'){input.type='text';input.inputMode='decimal';input.maxLength=30;input.autocomplete='off';}fields[name]=input;wrap.append(input);return wrap;}
    const sides=el('div','mts-order-sides'),buy=el('button','','매수'),sell=el('button','','매도');buy.type=sell.type='button';sides.setAttribute('aria-label','주문 방향');sides.append(buy,sell);
    const controls=el('div','mts-order-fields'),kind=field('order_type','주문 종류','select'),quantity=field('quantity','수량','text'),price=field('limit_price','지정 가격 · '+currencies[company.id.slice(0,2)],'text');
    for(const [value,copy] of [['LIMIT','지정가'],['MARKET','시장가 · 금액 미확정']]){const option=el('option','',copy);option.value=value;fields.order_type.append(option);}fields.order_type.value='LIMIT';
    controls.append(kind,quantity,price);
    const check=el('button','secondary-button','사전 확인'),live=el('button','primary-button','실제 제출 차단');check.type=live.type='button';live.disabled=true;live.dataset.liveSubmit='blocked';live.setAttribute('aria-describedby','mts-order-'+number+'-blocked');badge.id='mts-order-'+number+'-blocked';
    const receipt=el('button','secondary-button','체결 상태 조회');receipt.type='button';receipt.hidden=true;
    const recover=el('button','secondary-button','저장된 미해결 주문 확인');recover.type='button';recover.hidden=typeof opts.gateway?.recover!=='function';
    let side='BUY',draftId,epoch=0,destroyed=false,lastStatus=null,prepared=null,submitted=null,sending=false;
    function newId(){return root.crypto?.randomUUID?.()||null;}
    draftId=newId();
    function session(){try{const s=opts.getSession?.();return text(s)?s:null;}catch(_){return null;}}
    function draft(){return normalizeDraft({draft_id:draftId,identity:company.id,currency:currencies[company.id.slice(0,2)],side,order_type:fields.order_type.value,quantity:fields.quantity.value,limit_price:fields.order_type.value==='MARKET'?null:fields.limit_price.value});}
    function invalidate(copy='주문 조건을 변경했습니다. 사전 근거를 다시 확인하세요.'){
      epoch++;draftId=newId();lastStatus=null;prepared=null;submitted=null;live.disabled=true;live.textContent='실제 제출 차단';live.dataset.liveSubmit='blocked';receipt.hidden=true;check.disabled=false;estimate.textContent='';status.textContent=copy;
      feedback.dataset.state='idle';feedback.replaceChildren();
    }
    function changed(){invalidate();}
    function setSide(value){side=value;buy.setAttribute('aria-pressed',String(side==='BUY'));sell.setAttribute('aria-pressed',String(side==='SELL'));changed();}
    buy.addEventListener('click',()=>setSide('BUY'));sell.addEventListener('click',()=>setSide('SELL'));
    buy.setAttribute('aria-pressed','true');sell.setAttribute('aria-pressed','false');
    fields.quantity.addEventListener('input',changed);fields.limit_price.addEventListener('input',changed);
    fields.order_type.addEventListener('change',()=>{fields.limit_price.disabled=fields.order_type.value==='MARKET';if(fields.limit_price.disabled)fields.limit_price.value='';changed();});
    const connected=()=>!destroyed&&ticket.isConnected!==false;
    function same(generation,key,owner){try{return connected()&&epoch===generation&&session()===owner&&draftKey(draft())===key;}catch(_){return false;}}
    function invalidDraft(){status.textContent='올바른 수량과 지정 가격을 입력하세요.';notify('blocked','입력 확인 필요 · 미제출');}
    async function verify(e,d){try{return typeof opts.verifyEvidence==='function'&&await opts.verifyEvidence(e,d)===true;}catch(_){return false;}}
    async function precheck(){
      let d;try{d=draft();}catch(_){invalidDraft();return;}
      const generation=++epoch,key=draftKey(d),owner=session();check.disabled=true;estimate.textContent='';status.textContent='사전 근거 확인 중 · 실제 주문은 보내지 않습니다.';
      notify('checking','근거 확인 중 · 미제출');
      if(opts.gateway){await prepareLive(d,generation,key,owner);return;}
      let e=null,trusted=false;
      try{if(owner&&typeof opts.getEvidence==='function')e=await opts.getEvidence(d);if(!same(generation,key,owner))return;trusted=await verify(e,d);if(!same(generation,key,owner))return;
        const result=preflight(d,e,{trusted,session_id:owner,now:Date.now()});
        estimate.textContent=result.notional===null?'예상 금액은 미확인입니다.':'예상 매매대금 '+result.notional+' '+d.currency+(d.side==='BUY'?' · 비용 포함 지출 참고 ':' · 비용 차감 후 수령 참고 ')+result.total+' '+d.currency+' · 예약 차감 후 결제 현금 '+result.available+' '+d.currency;
        status.textContent=(result.simulation?'모의 · ':'')+(result.checks_state==='PASS'?'근거 확인됨 · PREVIEW ONLY · 실제 주문 미제출입니다.':result.blockers.map(code=>labels[code]||labels.EVIDENCE_INVALID).join(' '));
        notify(result.checks_state==='PASS'?'preview':'blocked',(result.simulation?'모의 · ':'')+(result.checks_state==='PASS'?'검토 완료 · 미제출':'검토 보류 · 미제출'));
      }catch(_){if(connected()&&epoch===generation){status.textContent='사전 확인 근거를 받지 못했습니다. 실제 제출은 차단되어 있습니다.';notify('blocked','확인 실패 · 미제출');}}
      finally{if(connected()&&epoch===generation)check.disabled=false;}
    }
    async function prepareLive(d,generation,key,owner){
      prepared=null;live.disabled=true;live.dataset.liveSubmit='blocked';
      try{
        if(!owner)throw Error();
        const result=await opts.gateway.prepare(d);
        if(!same(generation,key,owner))return;
        const valid=object(result)&&draftKey(result.draft)===key&&text(result.intent_id)&&/^[0-9a-f]{64}$/.test(result.draft_hash);
        if(!valid)throw Error();
        if(result.state==='PREPARED'&&text(result.approval_challenge)&&Number.isFinite(result.expires_at)&&result.expires_at*1000>Date.now()&&result.expires_at*1000-Date.now()<=120000){
          prepared=result;live.disabled=false;live.textContent='확인한 조건으로 주문 승인·전송';live.dataset.liveSubmit='approval-required';
          badge.textContent='소유자 전용 서버 · 아래 버튼을 누르면 이 조건으로 실제 주문을 승인하고 전송합니다.';
          estimate.textContent=d.side+' · '+d.identity+' · '+d.quantity+'주 · '+(d.limit_price||'시장가')+' '+d.currency;
          status.textContent='서버 원장·위험 기준 확인됨 · 주문 조건을 확인한 뒤 직접 승인하세요.';notify('preview','승인 대기 · 미제출');
        }else{invalidate('검토 보류 · 원장·현금·비용·위험 기준을 확인하고 다시 사전 확인하세요. 승인 응답이 유실된 경우 새 초안으로 확인합니다.');notify('blocked','검토 보류 · 미제출');}
      }catch(_){if(same(generation,key,owner)){status.textContent='소유자 서버 확인 실패 · 다시 사전 확인하세요.';notify('blocked','확인 실패 · 미제출');}}
      finally{if(same(generation,key,owner))check.disabled=false;}
    }
    async function submitLive(){
      if(sending||!prepared||live.disabled||prepared.expires_at*1000<=Date.now())return;
      const d=draft(),key=draftKey(d),owner=session(),generation=epoch,p=prepared;prepared=null;sending=true;live.disabled=true;check.disabled=true;live.dataset.liveSubmit='blocked';
      notify('checking','사용자 승인·전송 중 · 반복해서 누르지 마세요.');
      try{
        const approval=await opts.gateway.approve(p);
        if(!same(generation,key,owner))return;
        if(approval.state!=='APPROVED'||approval.intent_id!==p.intent_id||!text(approval.approval_token))throw Error();
        submitted=p.intent_id;
        const result=await opts.gateway.submit(p.intent_id,approval.approval_token);
        if(!same(generation,key,owner))return;
        await updateOrderEvidence(opts.gateway.evidence(d,result));
      }catch(_){if(same(generation,key,owner)){status.textContent='전송 결과 미확인 · 자동 재전송하지 않습니다. 주문 상태를 대조하세요.';notify('unknown','상태 미확인 · 재전송 차단');}}
      finally{sending=false;if(same(generation,key,owner)){receipt.hidden=!submitted;check.disabled=!!submitted;}}
    }
    async function reconcileLive(){
      if(!submitted||sending)return;
      const generation=epoch,d=draft(),key=draftKey(d),owner=session(),id=submitted;receipt.disabled=true;
      try{const result=await opts.gateway.reconcile(id);if(same(generation,key,owner))await updateOrderEvidence(opts.gateway.evidence(d,result));}
      catch(_){if(same(generation,key,owner))notify('unknown','상태 조회 실패 · 재전송 차단 · 다시 조회할 수 있습니다.');}
      finally{if(same(generation,key,owner))receipt.disabled=false;}
    }
    async function recoverLive(){
      if(sending||typeof opts.gateway?.recover!=='function')return;
      const owner=session(),generation=++epoch;recover.disabled=true;
      try{
        const result=await opts.gateway.recover();
        if(!connected()||epoch!==generation||session()!==owner)return;
        if(!result){status.textContent='저장된 미해결 주문이 없습니다. 새 초안을 사전 확인하세요.';return;}
        const restored=normalizeDraft(result.draft);
        if(restored.identity!==company.id){status.textContent='다른 종목의 미해결 주문이 있습니다. '+restored.identity+'의 주문 화면에서 대조하세요.';return;}
        side=restored.side;draftId=restored.draft_id;fields.order_type.value=restored.order_type;fields.quantity.value=restored.quantity;fields.limit_price.value=restored.limit_price||'';fields.limit_price.disabled=restored.order_type==='MARKET';
        buy.setAttribute('aria-pressed',String(side==='BUY'));sell.setAttribute('aria-pressed',String(side==='SELL'));
        prepared=null;submitted=result.intent_id;lastStatus=null;live.disabled=true;check.disabled=true;receipt.hidden=false;
        status.textContent='저장된 미해결 주문을 복원했습니다. 체결 상태 조회로 대조하세요. 재전송하지 않습니다.';notify('unknown','저장 상태 복원 · 재전송 차단');
      }catch(_){if(connected()&&epoch===generation)status.textContent='저장 주문 조회 실패 · 다시 확인하세요.';}
      finally{if(connected()&&epoch===generation)recover.disabled=false;}
    }
    async function updateOrderEvidence(e){
      let d;try{d=draft();}catch(_){return false;}
      const generation=epoch,key=draftKey(d),owner=session(),trusted=await verify(e,d);
      if(!same(generation,key,owner))return false;
      let result=orderStatus(d,e,{trusted,session_id:owner,now:Date.now()});
      if(lastStatus&&result.checked_at<lastStatus.checked_at)return false;
      if(lastStatus){
        const allowed={ACK:['ACK','PARTIAL_FILLED','FILLED','REJECTED','CANCELED'],PARTIAL_FILLED:['PARTIAL_FILLED','FILLED','REJECTED','CANCELED'],FILLED:['FILLED'],REJECTED:['REJECTED'],CANCELED:['CANCELED']};
        const lostQuantity=lastStatus.filled_quantity!==null&&(result.filled_quantity===null||compare(decimal(result.filled_quantity),decimal(lastStatus.filled_quantity))<0);
        if(result.order_id!==lastStatus.order_id||result.simulation!==lastStatus.simulation||!allowed[lastStatus.state].includes(result.state)||lostQuantity)result={state:'UNKNOWN',simulation:false};
      }
      const copy={ACK:'접수 확인 · 체결 아님',PARTIAL_FILLED:'부분 체결 확인',FILLED:'체결 완료 확인',UNKNOWN:'상태 미확인 · 체결로 반영하지 않음',REJECTED:'주문 거절 확인',CANCELED:'취소 확인 · 기존 부분 체결 여부 별도 대조'};
      status.textContent=(result.simulation?'모의 · ':'')+(copy[result.state]||copy.UNKNOWN)+(opts.gateway?' · 원장 반영은 별도 대조':' · 원장 반영·실제 제출 권한 없음');
      const feedbackStates={ACK:'ack',PARTIAL_FILLED:'partial',FILLED:'filled',UNKNOWN:'unknown',REJECTED:'rejected',CANCELED:'canceled'};
      notify(feedbackStates[result.state]||'unknown',(result.simulation?'모의 · ':'')+(copy[result.state]||copy.UNKNOWN));
      // Unknown/rejected transitions must not erase the last confirmed high-water state.
      if(result.checked_at!==undefined&&result.state!=='UNKNOWN')lastStatus=result;return true;
    }
    function onSession(){fields.quantity.value='';fields.limit_price.value='';invalidate('로그인 정보가 변경됐습니다. 현금·원장 근거를 다시 확인하세요.');}
    live.addEventListener('click',submitLive);receipt.addEventListener('click',reconcileLive);recover.addEventListener('click',recoverLive);
    function onReady(){Object.assign(opts,configured);recover.hidden=typeof opts.gateway?.recover!=='function';onSession();}
    doc.addEventListener('zero-finance-ready',onReady);
    check.addEventListener('click',precheck);form.addEventListener('submit',event=>{event.preventDefault();precheck();});
    form.append(badge,sides,controls,estimate,check,live,receipt,recover,feedback,status);ticket.append(summary,form);target.append(ticket);
    doc.addEventListener('zero-session-changed',onSession);
    const controller={draft,precheck,submitLive,reconcileLive,recoverLive,updateOrderEvidence,destroy(){destroyed=true;epoch++;doc.removeEventListener('zero-session-changed',onSession);doc.removeEventListener('zero-finance-ready',onReady);ticket.remove();if(mounted.get(target)===controller)mounted.delete(target);}};
    mounted.set(target,controller);return controller;
  }
  return Object.freeze({normalizeDraft,draftKey,preflight,orderStatus,configure,mount});
});
