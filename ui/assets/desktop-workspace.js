/* Scoped ledger projections never change account math; owner book reads are explicit and separate. */
(function(root){
'use strict';
const routes=['portfolio','research','workbench'];
const panelMode=(width,view)=>routes.includes(view)&&width>=1024?(width>=1280?3:2):0;
function pageRows(rows,page){const pages=Math.max(1,Math.ceil(rows.length/10)),current=Math.max(0,Math.min(Number.isInteger(page)?page:0,pages-1));return {page:current,pages,items:rows.slice(current*10,current*10+10)};}
function saveFocus(doc,host){const element=doc.activeElement;if(!element||!host.contains(element))return null;return {element,key:element.dataset?.desktopFocus,start:typeof element.selectionStart==='number'?element.selectionStart:null,end:element.selectionEnd,direction:element.selectionDirection};}
function restoreFocus(doc,saved,host){if(!saved)return;const element=saved.element.isConnected?saved.element:[...host.querySelectorAll('[data-desktop-focus]')].find(e=>e.dataset.desktopFocus===saved.key);if(!element||element.closest('[hidden]')||!element.getClientRects().length)return;element.focus({preventScroll:true});if(saved.start!==null&&typeof element.setSelectionRange==='function')element.setSelectionRange(saved.start,saved.end,saved.direction);}
if(typeof module!=='undefined'&&module.exports)module.exports={panelMode,pageRows,saveFocus,restoreFocus};
if(!root.document)return;
const doc=root.document,make=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;},byId=id=>doc.getElementById(id);
let lastInput=null,lastInputView=null,resizing=false;
let enabled=true,active=0,scheduled=false,page=0,fingerprint='',selected='US:SPY',chosen=false,range='1Y',chart=null,chartKey='',moved=null,docked=false,ownerBook=null,ownerBookKey=null;
const workspace=make('section','desktop-workspace');workspace.id='desktop-workspace';workspace.hidden=true;workspace.setAttribute('aria-label','투자 멀티 패널');
const left=make('aside','desktop-assets'),leftHead=make('header','desktop-panel-head'),title=make('h2','','내 자산'),detail=make('button','secondary-button','자산 상세');detail.type='button';leftHead.append(title,detail);
const depositNote=make('p','desktop-deposit-note'),metrics=make('dl','desktop-metrics'),basis=make('p','desktop-scope','ZERO 참고 원장 · 예수금은 연결 계좌 별도 범위'),holdTitle=make('h3','','보유 종목'),list=make('ul','desktop-holdings'),empty=make('p','muted-note'),pager=make('nav','desktop-pager'),previous=make('button','secondary-button','이전'),pageText=make('span'),next=make('button','secondary-button','다음');
pager.setAttribute('aria-label','멀티 패널 보유 종목 페이지');previous.type=next.type='button';pager.append(previous,pageText,next);left.append(leftHead,metrics,depositNote,basis,holdTitle,list,empty,pager);
const center=make('section','desktop-center');center.id='desktop-center';
const analysis=make('section','desktop-analysis'),analysisHead=make('header','desktop-panel-head'),stockTitle=make('h2','','공개 참고 차트'),period=make('select'),openStock=make('button','secondary-button','종목 상세'),plot=make('div','desktop-chart'),book=make('section','desktop-orderbook');
period.setAttribute('aria-label','멀티 패널 차트 기간');for(const value of ['1M','1Y','5Y']){const o=make('option','',value);o.value=value;period.append(o);}period.value=range;openStock.type='button';analysisHead.append(stockTitle,period,openStock);book.title='호가 공급자 연결 전입니다. 공개 지연 시세를 주문 호가로 표시하지 않습니다.';book.append(make('span','','호가 · 공급자 연결 전'));analysis.append(analysisHead,book,plot);center.append(analysis);
const right=make('aside','desktop-office'),officeHead=make('header','desktop-panel-head'),officeTitle=make('h2','','내 사무실'),officeLink=make('button','secondary-button','넓게 보기'),officeBody=make('div','desktop-office-body');officeBody.id='desktop-office-body';officeLink.type='button';officeHead.append(officeTitle,officeLink);right.append(officeHead,officeBody,make('p','desktop-social-note','가상 직원·잡담 · 금융 계산과 별개'));workspace.append(left,center,right);
const main=byId('main');if(!main||!byId('lobby-view'))return;main.append(workspace);
const lobby=byId('lobby-view'),officeMarker=doc.createComment('office original position');lobby.before(officeMarker);
const toggle=make('button','secondary-button desktop-mode-toggle','단일 화면');toggle.type='button';toggle.setAttribute('aria-pressed','true');doc.querySelector('.mts-subnav')?.append(toggle);
const current=()=>root.ZERO?.currentView?.()||doc.documentElement.dataset.zeroView||'lobby';
function sourceText(source){return {text:source?.textContent?.trim()||'미확인',full:source?.dataset.full||source?.querySelector?.('[data-full]')?.dataset.full||source?.title||source?.textContent?.trim()||'미확인'};}
function readRows(){return [...(byId('holding-list')?.children||[])].flatMap(item=>{if(!/^(US:[A-Z][A-Z0-9.-]{0,14}|KR:[A-Z0-9]{6})$/.test(item.dataset.key||''))return [];const button=item.querySelector('.position-button'),fields=item.querySelectorAll('.position-summary dd');return [{key:item.dataset.key,label:button?.querySelector('.ticker')?.textContent?.trim()||item.dataset.key,value:sourceText(fields[0]),profit:sourceText(fields[1]),hint:item.querySelector('.position-details')?.textContent?.trim()||'현재 자산 화면의 가격·수량 근거를 확인하세요.'}];});}
function renderAssets(){
 if(!active)return;
 const rows=readRows(),values=[['ZERO 총자산 · 참고','observed-assets-total'],['누적수익률 · 참고','zero-total-return'],['보유종목 평가액','holdings-value'],['예수금 · 연결 계좌','mts-deposit']].map(([label,id])=>({label,...sourceText(byId(id))}));
 const depositBasis=byId('mts-deposit-note')?.textContent?.trim()||'예수금 근거 미확인',demo=!byId('demo-exit')?.hidden||root.ZERO?.getPortfolio?.()?.context?.data_kind==='DEMO';
 if(!chosen&&rows.length){selected=rows[0].key;chosen=true;}
 const mark=JSON.stringify([values,rows,page,selected,depositBasis,demo]);if(mark===fingerprint)return;fingerprint=mark;const focused=saveFocus(doc,left);
 depositNote.textContent=depositBasis;basis.textContent=(demo?'시연 자료 · ':'')+'ZERO 참고 원장 · 예수금은 연결 계좌 별도 범위';
 metrics.replaceChildren();for(const value of values){const field=make('div'),label=make('dt','',value.label),amount=make('dd','num-t',value.text);amount.tabIndex=0;amount.dataset.desktopFocus='metric:'+value.label;amount.dataset.full=value.full;amount.title=value.full;field.append(label,amount);metrics.append(field);}
 const model=pageRows(rows,page);page=model.page;list.replaceChildren();
 for(const row of model.items){const li=make('li'),button=make('button','desktop-holding'),name=make('strong','',row.label),value=make('span','num-t',row.value.text),profit=make('small','',row.profit.text);button.type='button';button.dataset.desktopHint=row.hint;button.dataset.identity=row.key;button.dataset.desktopFocus='row:'+row.key;button.setAttribute('aria-pressed',String(row.key===selected));value.dataset.full=row.value.full;value.title=row.value.full;profit.title=row.profit.full;button.append(name,value,profit);button.addEventListener('click',()=>{selected=row.key;chosen=true;fingerprint='';renderAssets();showChart();});li.append(button);list.append(li);}
 empty.hidden=rows.length>0;empty.textContent='보유 원장을 확인한 자료가 없습니다. 자산 상세에서 저장 자료와 시연 화면을 확인하세요.';pager.hidden=rows.length===0;pageText.textContent=(model.page+1)+' / '+model.pages;previous.disabled=model.page===0;next.disabled=model.page===model.pages-1;
 restoreFocus(doc,focused,left);if(current()==='portfolio')showChart();
}
function disposeChart(){chart?.destroy();chart=null;chartKey='';}
function showChart(){
 if(!active||current()!=='portfolio'){disposeChart();return;}
 if(ownerBookKey!==selected&&root.ZEROOwnerFinance?.getSession?.()){ownerBook?.destroy();ownerBook=root.ZEROOwnerFinance.mountBook(book,selected);ownerBookKey=ownerBook?selected:null;}
 const key=selected+':'+range;if(chartKey===key&&chart)return;disposeChart();stockTitle.textContent=selected+' · 공개 참고';
 if(!root.ZEROTechnicalChart){plot.textContent='차트 모듈을 불러오지 못했습니다. 종목 상세에서 다시 확인하세요.';return;}
 plot.replaceChildren();chart=root.ZEROTechnicalChart.mount(plot,{identity:selected,range});chartKey=key;
}
function restoreCenter(){if(moved){moved.marker.replaceWith(moved.view);moved=null;}}
function office(on){
 if(on){if(lobby.parentElement!==officeBody)officeBody.append(lobby);lobby.hidden=false;lobby.dataset.desktopDocked='true';root.ZEROLobby?.setDocked?.(true);docked=true;}
 else if(docked){lobby.removeAttribute('data-desktop-docked');officeMarker.after(lobby);lobby.hidden=current()!=='lobby';root.ZEROLobby?.setDocked?.(false);docked=false;}
}
function sync(){
 scheduled=false;const view=current(),focused=saveFocus(doc,main)||(resizing&&lastInputView===view&&lastInput?.isConnected&&doc.activeElement===doc.body?saveFocus({activeElement:lastInput},main):null),mode=enabled?panelMode(root.innerWidth,view):0;resizing=false;
 toggle.hidden=!routes.includes(view)||root.innerWidth<1024;toggle.textContent=enabled?'단일 화면':'멀티 패널';toggle.setAttribute('aria-pressed',String(enabled));
 const changed=mode!==active;active=mode;workspace.hidden=!mode;doc.documentElement.dataset.zeroDesktop=String(Boolean(mode));workspace.dataset.columns=String(mode);
 if(!mode){disposeChart();restoreCenter();office(false);restoreFocus(doc,focused,main);if(changed)root.dispatchEvent?.(new Event('resize'));return;}
 if(view==='portfolio'){restoreCenter();analysis.hidden=false;renderAssets();showChart();}
 else {disposeChart();analysis.hidden=true;if(moved?.view.id!==view+'-view'){restoreCenter();const target=byId(view+'-view');if(target){const marker=doc.createComment('investment original position');target.before(marker);center.append(target);moved={view:target,marker};}}if(moved)moved.view.hidden=false;renderAssets();}
 office(mode===3);restoreFocus(doc,focused,workspace);if(changed)root.dispatchEvent?.(new Event('resize'));
}
function schedule(event){if(event?.type==='resize')resizing=true;if(scheduled)return;scheduled=true;queueMicrotask(sync);}
previous.addEventListener('click',()=>{page--;fingerprint='';renderAssets();});next.addEventListener('click',()=>{page++;fingerprint='';renderAssets();});
doc.addEventListener('zero-finance-ready',()=>{ownerBookKey=null;if(active&&current()==='portfolio')showChart();});
period.addEventListener('change',()=>{range=period.value;showChart();});openStock.addEventListener('click',()=>root.ZEROExplore?.openCompany?.(selected));officeLink.addEventListener('click',()=>root.ZERO?.navigate?.('lobby'));
toggle.addEventListener('click',()=>{enabled=!enabled;schedule();});detail.addEventListener('click',()=>{enabled=false;root.ZERO?.navigate?.('portfolio');schedule();});
new MutationObserver(()=>{if(active){fingerprint='';renderAssets();}}).observe(byId('portfolio-view'),{childList:true,subtree:true,characterData:true});
doc.addEventListener('focusin',event=>{const e=event.target;if(main.contains(e)&&e.matches?.('input,textarea,select,[contenteditable="true"]')){lastInput=e;lastInputView=current();}else lastInput=null;});
doc.addEventListener('pointerdown',event=>{if(lastInput&&!lastInput.contains(event.target))lastInput=null;},true);
doc.addEventListener('zero-view-changed',schedule);doc.addEventListener('zero-ready',schedule);root.addEventListener('resize',schedule);doc.addEventListener('DOMContentLoaded',schedule);
root.ZERODesktop={sync:schedule};schedule();
})(typeof window==='undefined'?globalThis:window);