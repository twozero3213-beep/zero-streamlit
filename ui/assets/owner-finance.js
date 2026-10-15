/* Private same-origin finance adapter. Public builds carry an empty endpoint. */
(function(root){
  'use strict';
  const doc=root.document,meta=doc?.querySelector('meta[name="zero-owner-finance-api"]');
  if(meta?.content!=='api/finance')return;
  const issued=new WeakMap(),responses=new WeakMap();let current=null,expiryTimer=null,epoch=0;
  function clear(){epoch++;current=null;root.clearTimeout(expiryTimer);expiryTimer=null;doc.dispatchEvent(new root.Event('zero-session-changed'));}
  function session(){return current&&Date.parse(current.expires_at)>Date.now()?current.session_id:null;}
  async function request(route,body){
    if(route!=='status'&&!session()){clear();throw Error('FINANCE_OWNER_REQUIRED');}
    const generation=epoch,owner=current;
    const controller=new root.AbortController(),timeout=root.setTimeout(()=>controller.abort(),route==='account'?45000:15000);
    try{
      const response=await root.fetch(`api/finance/${route}`,{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,
        headers:body?{'Content-Type':'application/json','X-Zero-CSRF':current?.csrf_token||''}:{},...(body?{body:JSON.stringify(body)}:{})});
      if(generation!==epoch||route!=='status'&&owner!==current)throw Error('FINANCE_STALE_RESPONSE');
      if(response.status===401||response.status===403)clear();
      if(!response.ok||!response.headers.get('Content-Type')?.startsWith('application/json')||Number(response.headers.get('Content-Length'))>1000000)throw Error();
      const text=await response.text();if(text.length>1000000)throw Error();
      if(generation!==epoch||route!=='status'&&owner!==current)throw Error('FINANCE_STALE_RESPONSE');
      const result=JSON.parse(text);
      if(result&&typeof result==='object')responses.set(result,{generation,owner});
      return result;
    }finally{root.clearTimeout(timeout);}
  }
  const gateway={
    prepare:d=>request('preview',d),
    approve:p=>request('approve',{intent_id:p.intent_id,confirmed:true,approval_challenge:p.approval_challenge,draft_hash:p.draft_hash}),
    submit:(id,token)=>request('submit',{intent_id:id,approval:token}),
    reconcile:id=>request('reconcile',{intent_id:id}),
    async recover(){
      const result=await request('status');
      if(!session()||result.session_id!==current.session_id||result.provider!==current.provider||!Array.isArray(result.journal?.orders))throw Error('FINANCE_CONTEXT_CHANGED');
      return result.journal.orders.find(order=>['UNKNOWN','ACK','PARTIAL'].includes(order.state))||null;
    },
    evidence(d,result){
      const proof=responses.get(result);
      if(!session()||!proof||proof.generation!==epoch||proof.owner!==current||!result||root.ZEROMTSOrders.draftKey(result.draft)!==root.ZEROMTSOrders.draftKey(d))throw Error('FINANCE_BINDING_INVALID');
      const status={PARTIAL:'PARTIAL_FILLED'}[result.state]||result.state;
      const e={schema_version:1,scope:'MTS_ORDER_STATUS',source:current.provider,draft_key:root.ZEROMTSOrders.draftKey(d),session_id:session(),checked_at:new Date().toISOString(),order_id:result.intent_id,
        status,confirmed:['ACK','PARTIAL_FILLED','FILLED','CANCELED','REJECTED'].includes(status),filled_quantity:result.cumulative_quantity,execution_authorized:false};
      issued.set(e,epoch);return e;
    }
  };
  function mountBook(target,identity){
    if(!session()||!target||!/^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[A-Z0-9]{6})$/.test(identity))return null;
    let alive=true,turn=0;
    const element=(tag,text)=>{const e=doc.createElement(tag);e.textContent=text;return e;};
    const button=element('button','계좌 호가 조회'),copy=element('span','공개 참고 차트와 별개 · 소유자 계좌의 공식 호가를 조회합니다.');button.type='button';button.className='secondary-button';
    function reset(){turn++;copy.textContent='계좌 인증 변경 · 호가를 지웠습니다.';button.disabled=true;}
    button.addEventListener('click',async()=>{
      const owner=session(),generation=++turn;if(!alive||!owner)return;button.disabled=true;copy.textContent='공식 호가 조회 중';
      try{
        const data=await request('orderbook?identity='+encodeURIComponent(identity));
        if(!alive||generation!==turn||session()!==owner)return;
        const book=data.orderbook;
        if(data.provider!=='TOSS'||book?.symbol!==identity.slice(3)||book.state!=='AVAILABLE'||book.currency!==({US:'USD',KR:'KRW'})[identity.slice(0,2)]||!Array.isArray(book.asks)||!Array.isArray(book.bids))throw Error();
        const levels=side=>book[side].slice(0,3).map(level=>{
          if(typeof level.price!=='string'||typeof level.volume!=='string'||!/^\d+(?:\.\d+)?$/.test(level.price)||!/^\d+(?:\.\d+)?$/.test(level.volume))throw Error();
          return level.price+' × '+level.volume;
        }).join(' / ');
        copy.textContent='매도 '+levels('asks')+' · 매수 '+levels('bids')+' '+book.currency+' · '+book.timestamp;
      }catch(_){if(alive&&generation===turn)copy.textContent='호가를 확인하지 못했습니다. 다시 조회하세요.';}
      finally{if(alive&&generation===turn)button.disabled=false;}
    });
    target.title='공식 계좌 호가 · 주문 승인이나 체결 근거로 자동 사용하지 않습니다.';target.replaceChildren(button,copy);
    doc.addEventListener('zero-session-changed',reset);
    return {destroy(){alive=false;turn++;doc.removeEventListener('zero-session-changed',reset);target.replaceChildren();}};
  }
  async function connect(){
    clear();const turn=epoch;
    try{
      const status=await request('status');
      if(!status||typeof status.session_id!=='string'||typeof status.csrf_token!=='string'||!['TOSS','KIS_MOCK'].includes(status.provider)||!(Date.parse(status.expires_at)>Date.now()))throw Error();
      if(turn!==epoch)return false;
      current=status;root.clearTimeout(expiryTimer);
      expiryTimer=root.setTimeout(clear,Math.min(2147483647,Date.parse(status.expires_at)-Date.now()));
      root.ZEROMTSOrders?.configure({getSession:session,verifyEvidence:e=>issued.get(e)===epoch,gateway});
      root.ZEROAccountAudit?.configure({getSession:session,getAudit:async()=>{const result=await request('account');return result.audit;}});
      doc.dispatchEvent(new root.Event('zero-finance-ready'));return true;
    }catch(_){if(turn===epoch)clear();return false;}
  }
  root.ZEROOwnerFinance=Object.freeze({connect,getSession:session,disconnect:clear,mountBook});
  connect();
})(window);
