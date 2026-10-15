/* Saved owner data only. A session getter is a UI privacy gate, not server auth.
 * The protected portfolio route must independently authorize the owner. No I/O.
 * configure({getSession}) accepts an opaque session marker, never a credential.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ZEROAccountAudit=api;
})(typeof window==='object'?window:globalThis,function(root){
  'use strict';
  const fields=['deposit_balance','settlement_adjusted_cash','settled_cash','unsettled_receivables','unsettled_payables','opening_cash','deposits','withdrawals','buy_gross','sell_gross','fees','taxes','fx_in','fx_out','realized_pnl'];
  const labels={deposit_balance:'관측 예수금',settlement_adjusted_cash:'결제후 예상 현금',settled_cash:'확정 결제 현금',unsettled_receivables:'미결제 받을 금액',unsettled_payables:'미결제 지급할 금액',opening_cash:'기간 시작 현금',deposits:'기간 입금 누계',withdrawals:'기간 출금 누계',buy_gross:'결제 매수대금',sell_gross:'결제 매도대금',fees:'기간 수수료',taxes:'기간 원천징수 세금',fx_in:'환전 유입',fx_out:'환전 유출',realized_pnl:'원장 실현손익'};
  const terms=['opening_cash','deposits','withdrawals','buy_gross','sell_gross','fees','taxes','fx_in','fx_out','settled_cash'];
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
  const amount=(x,signed=false)=>x===null||typeof x==='string'&&x.length<=64&&(signed?/^-?\d{1,40}(?:\.\d{1,8})?$/:/^\d{1,40}(?:\.\d{1,8})?$/).test(x);
  const stamp=x=>typeof x==='string'&&x.length<=40&&/(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x))&&Date.now()-Date.parse(x)>=0&&Date.now()-Date.parse(x)<=300000;
  const units=x=>{const negative=x.startsWith('-'),[a,b='']=(negative?x.slice(1):x).split('.');return BigInt(a+b.padEnd(8,'0'))*(negative?-1n:1n);};
  const mounted=new WeakMap();let configured={};
  function unavailable(){return {status:'UNAVAILABLE',as_of:null,rows:[]};}
  function validProjection(data,asof){
    const keys=['schema_version','scope','status','as_of','rows','issues','execution_authorized','external_certification','independent_verification'];
    if(!exact(data,keys)||data.schema_version!==1||data.scope!=='ZERO_ACCOUNT_RECONCILIATION'||!['MATCH','MISMATCH','PARTIAL','UNAVAILABLE'].includes(data.status)||data.execution_authorized!==false||data.external_certification!==false||data.independent_verification!==false||!Array.isArray(data.rows)||data.rows.length>16||!Array.isArray(data.issues)||data.issues.length>16||data.issues.some(x=>typeof x!=='string'||!/^AUDIT_[A-Z_]+$|^CASH_IDENTITY_MISMATCH$|^LEDGER_COMPONENTS_UNAVAILABLE$|^OWNER_AUTH_REQUIRED$|^SNAPSHOT_[A-Z_]+$/.test(x)))return false;
    if(data.status==='UNAVAILABLE')return data.as_of===null&&data.rows.length===0;
    if(!stamp(data.as_of)||Date.parse(data.as_of)!==Date.parse(asof)||!data.rows.length)return false;
    const identities=new Set(),states=[];
    for(const row of data.rows){
      if(!exact(row,['provider','currency','as_of','period_start','period_end','provenance','coverage','amounts','reconciliation'])||!['KIS_MOCK','TOSS'].includes(row.provider)||!['KRW','USD'].includes(row.currency)||!stamp(row.as_of)||Date.parse(row.as_of)!==Date.parse(asof)||!exact(row.amounts,fields)||fields.some(k=>!amount(row.amounts[k],k==='realized_pnl')))return false;
      const id=row.provider+':'+row.currency;if(identities.has(id))return false;identities.add(id);
      const observed=row.provenance==='SAVED_PORTFOLIO_OBSERVATION'&&row.coverage==='OBSERVED_BALANCES_ONLY',saved=row.provenance==='SAVED_CONFIRMED_LEDGER'&&row.coverage==='WHOLE_ACCOUNT';
      if(!observed&&!saved||observed&&fields.some(k=>!['deposit_balance','settlement_adjusted_cash'].includes(k)&&row.amounts[k]!==null))return false;
      if(row.period_end!==row.as_of||observed&&row.period_start!==null||saved&&(typeof row.period_start!=='string'||row.period_start.length>40||!/(?:Z|[+-]\d\d:\d\d)$/.test(row.period_start)||!Number.isFinite(Date.parse(row.period_start))||Date.parse(row.period_start)>Date.parse(row.as_of)))return false;
      const rec=row.reconciliation;if(!exact(rec,['status','expected_cash','observed_cash','difference','reason']))return false;
      if(terms.some(k=>row.amounts[k]===null)){
        if(rec.status!=='UNAVAILABLE'||rec.reason!=='CASH_COMPONENTS_MISSING'||rec.expected_cash!==null||rec.difference!==null||rec.observed_cash!==row.amounts.settled_cash)return false;
      }else{
        const a=row.amounts,expected=units(a.opening_cash)+units(a.deposits)-units(a.withdrawals)-units(a.buy_gross)+units(a.sell_gross)-units(a.fees)-units(a.taxes)+units(a.fx_in)-units(a.fx_out),diff=units(a.settled_cash)-expected;
        if(!amount(rec.expected_cash,true)||rec.expected_cash===null||!amount(rec.difference,true)||rec.difference===null||rec.observed_cash!==a.settled_cash||units(rec.expected_cash)!==expected||units(rec.difference)!==diff||rec.reason!==null||rec.status!==(diff===0n?'MATCH':'MISMATCH'))return false;
      }
      states.push(rec.status);
    }
    return data.status===(states.includes('MISMATCH')?'MISMATCH':states.every(s=>s==='MATCH')?'MATCH':'PARTIAL');
  }
  function projectPortfolio(data){
    if(!object(data)||data.schema_version!==1||data.demo===true||!object(data.context)||data.context.demo===true||data.context.data_kind==='DEMO'||!['KIS_MOCK','TOSS'].includes(data.context.mode)||data.context.read_only!==true||!stamp(data.context.collected_at)||!object(data.system_status)||data.system_status.stale!==false||!['READY','PARTIAL'].includes(data.system_status.state)||!object(data.summary))return unavailable();
    const by=data.summary.by_currency,observed=data.summary.observed_assets;
    if(data.context.cash_basis!=='DEPOSIT_BALANCE_NOT_BUYING_POWER'||!object(by)||!object(observed)||observed.state!=='AVAILABLE'||observed.scope!=='OBSERVED_KR_US_ASSETS_NOT_ZERO_LEDGER'||observed.basis!=='SETTLEMENT_ADJUSTED_CASH_PLUS_LISTED_HOLDINGS'||!object(observed.cash_by_currency))return unavailable();
    if(['KRW','USD'].some(currency=>!object(by[currency])||!Object.hasOwn(by[currency],'cash')||!Object.hasOwn(observed.cash_by_currency,currency)||!amount(by[currency].cash)||!amount(observed.cash_by_currency[currency])))return unavailable();
    if(Object.hasOwn(data,'account_audit'))return validProjection(data.account_audit,data.context.collected_at)?data.account_audit:unavailable();
    const rows=[];
    for(const currency of ['KRW','USD']){
      const deposit=object(by[currency])?by[currency].cash??null:null,projected=observed.cash_by_currency[currency]??null;
      if(!amount(deposit)||!amount(projected))return unavailable();
      const amounts=Object.fromEntries(fields.map(k=>[k,null]));amounts.deposit_balance=deposit;amounts.settlement_adjusted_cash=projected;
      rows.push({provider:data.context.mode,currency,as_of:data.context.collected_at,period_start:null,period_end:data.context.collected_at,provenance:'SAVED_PORTFOLIO_OBSERVATION',coverage:'OBSERVED_BALANCES_ONLY',amounts,reconciliation:{status:'UNAVAILABLE'}});
    }
    return {status:'PARTIAL',as_of:data.context.collected_at,rows};
  }
  function configure(options){
    if(!object(options)||typeof options.getSession!=='function'||Object.keys(options).some(k=>!['getSession','getAudit'].includes(k))||Object.values(options).some(v=>typeof v!=='function'))throw Error('AUDIT_OPTIONS_INVALID');
    configured={...options};
  }
  function mount(target,options={}){
    mounted.get(target)?.destroy();const opts={...configured,...options},doc=root.document;let alive=true,selected=null,generation=0;
    function element(tag,cls,text){const e=doc.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;}
    function session(){try{const value=opts.getSession?.();return typeof value==='string'&&value.length>0&&value.length<=256?value:null;}catch(_){return null;}}
    function render(projection,reason,active=null){
      const section=element('section','account-audit-content'),header=element('div','account-audit-header');
      header.append(element('h2','account-audit-title','ZERO 대조'));
      const button=element('button','account-audit-refresh',opts.getAudit?'계좌 자료 다시 조회':'저장 자료 다시 확인');button.type='button';button.addEventListener('click',refresh);header.append(button);
      section.append(header,element('p','account-audit-note',opts.getAudit?'소유자 서버 원장 대조 · 외부 감사·인증 아님':'외부 감사·인증 아님 · 실계좌 연결 미설정'));
      const choices=projection.rows||[],label=element('label','account-audit-choice'),select=element('select','account-audit-select');
      label.append(element('span','','제공자 · 통화'));select.setAttribute('aria-label','대조할 제공자와 통화');
      if(!choices.some(row=>row.provider+':'+row.currency===selected))selected=choices.length?choices[0].provider+':'+choices[0].currency:null;
      if(!choices.length){select.append(element('option','','제공자 연결 전 · 통화 미확인'));select.disabled=true;}
      for(const row of choices){const option=element('option','',(row.provider==='KIS_MOCK'?'KIS 모의':'토스')+' · '+row.currency);option.value=row.provider+':'+row.currency;select.append(option);}
      select.value=selected||'';select.addEventListener('change',()=>{
        if(!active||session()!==active){render(unavailable(),'본인 인증 변경 · 저장 자료 표시를 지웠습니다.');return;}
        if(!stamp(projection.as_of)){render(unavailable(),'자료 미확인 · 저장 근거가 오래됐습니다.');return;}
        selected=select.value;render(projection,reason,active);
      });label.append(select);section.append(label);
      const row=choices.find(r=>r.provider+':'+r.currency===selected),rec=row?.reconciliation;
      const state=element('p','account-audit-state',reason||(rec?.status==='MATCH'?'현금 등식 일치 · 독립 검증 아님':rec?.status==='MISMATCH'?'현금 등식 불일치':'현금 대조 보류 · 원장 항목 미확인'));
      state.setAttribute('role','status');state.setAttribute('aria-live','polite');section.append(state);
      const dl=element('dl','account-audit-amounts');
      for(const field of fields){const value=row?.amounts[field]??null;dl.append(element('dt','',labels[field]),element('dd','',value===null?'미확인':value+' '+row.currency));}
      section.append(dl);
      const details=element('details','account-audit-source');details.open=false;details.append(element('summary','','출처·범위·계산 기준'));
      if(row){
        details.append(element('p','account-audit-note','기준 시각 '+row.as_of+' · '+(row.coverage==='WHOLE_ACCOUNT'?'저장 원장 선언 범위 · 계좌 전체':'관측 잔액 범위 · 원장 미확인')));
        if(row.period_start)details.append(element('p','account-audit-note','대조 기간 '+row.period_start+' → '+row.period_end));
        if(rec.status==='MISMATCH')details.append(element('p','account-audit-note','확정 현금 − 원장 계산값: '+rec.difference+' '+row.currency));
      }else details.append(element('p','account-audit-note','현재 본인 계좌의 저장 근거 미확인. 소셜 로그인은 계좌 소유 인증이 아닙니다. 재확인은 저장 스냅샷만 읽으며 계좌 조회를 실행하지 않습니다.'));
      details.append(element('p','account-audit-note','예수금은 입금 누계가 아니며 결제후 예상 현금은 확정 결제 현금이 아닙니다. 제공자·통화별로 분리하며 미확인은 0이 아닙니다.'),element('p','account-audit-note','현금 등식: 기간 시작 현금 + 입금 − 출금 − 결제 매수대금 + 결제 매도대금 − 수수료 − 원천징수 세금 + 환전 유입 − 환전 유출. 미결제는 별도 표시하며 합산하지 않습니다. 실현손익은 원장 제공값만 표시합니다.'),element('p','account-audit-note','ZERO의 저장 자료 산술 대조이며 외부 감사·인증이 아닙니다. FiscalAI 기업 재무자료는 증권계좌 감사 근거가 아닙니다.'));
      section.append(details);target.replaceChildren(section);
    }
    async function refresh(){
      if(!alive||target.isConnected===false)return;
      const turn=++generation;
      const active=session();if(!active){render(unavailable(),'본인 인증 필요 · 계좌 자료 미확인');return;}
      if(typeof opts.getAudit==='function'){
        render(unavailable(),'계좌 원장 조회 중 · 미확인은 0으로 처리하지 않습니다.',active);
        try{
          const projection=await opts.getAudit();
          if(!alive||turn!==generation||session()!==active)return;
          render(validProjection(projection,projection?.as_of)?projection:unavailable(),null,active);
        }catch(_){if(alive&&turn===generation&&session()===active)render(unavailable(),'조회 실패 · 다시 조회할 수 있습니다.',active);}
        return;
      }
      let data;try{data=root.ZERO?.getPortfolio?.();}catch(_){render(unavailable(),'자료 미확인 · 저장된 스냅샷을 읽지 못했습니다.');return;}
      if(session()!==active){render(unavailable(),'본인 인증을 다시 확인해 주세요.');return;}
      const projection=projectPortfolio(data);render(projection,projection.status==='UNAVAILABLE'?'자료 미확인 · 현재 범위의 저장 근거가 없습니다.':null,active);
    }
    const clear=()=>{generation++;if(alive)render(unavailable(),'본인 인증 변경 · 저장 자료 표시를 지웠습니다.');};
    root.addEventListener?.('zero-session-changed',clear);doc.addEventListener?.('zero-session-changed',clear);
    function ready(){Object.assign(opts,configured);refresh();}
    doc.addEventListener?.('zero-finance-ready',ready);
    const controller={refresh,destroy(){alive=false;doc.removeEventListener?.('zero-finance-ready',ready);root.removeEventListener?.('zero-session-changed',clear);doc.removeEventListener?.('zero-session-changed',clear);target.replaceChildren();mounted.delete(target);}};
    mounted.set(target,controller);refresh();return controller;
  }
  function open(){const target=root.document?.getElementById('account-audit');if(target)return mount(target);return null;}
  return Object.freeze({configure,mount,open,projectPortfolio});
});
