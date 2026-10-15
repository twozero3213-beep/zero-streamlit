(function(root){
'use strict';
if(!root.document||root.ZERODesktopInteractions)return;
const doc=root.document,desktop=root.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
const selector='[data-desktop-hint],[data-full],[title],td,th,.company-name,.holding-name,.actor-name';
let tooltip=null,anchor=null,description=null,guide=null,returnFocus=null,button=null;
function element(tag,text){const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;return el;}
function dismiss(){
 if(anchor){if(description===null)anchor.removeAttribute('aria-describedby');else anchor.setAttribute('aria-describedby',description);}
 tooltip?.remove();tooltip=null;anchor=null;description=null;
}
function position(){
 if(!anchor?.isConnected||!desktop.matches||doc.hidden){dismiss();return;}
 const rect=anchor.getBoundingClientRect(),box=tooltip.getBoundingClientRect(),width=doc.documentElement.clientWidth||root.innerWidth,height=root.innerHeight;
 if(rect.bottom<0||rect.top>height||rect.right<0||rect.left>width){dismiss();return;}
 tooltip.style.left=Math.max(8,Math.min(rect.left,width-box.width-8))+'px';
 tooltip.style.top=Math.max(8,Math.min(rect.bottom+8+box.height>height?rect.top-box.height-8:rect.bottom+8,height-box.height-8))+'px';
}
function show(target){
 const el=target?.closest?.(selector);if(!desktop.matches||!el?.isConnected||el.closest('dialog,[aria-modal="true"],input,textarea,select,[contenteditable="true"]')){dismiss();return;}
 const text=(el.getAttribute('data-desktop-hint')||el.getAttribute('data-full')||el.getAttribute('title')||el.textContent||'').trim();
 if(!text||text.length>12000){dismiss();return;}if(el===anchor)return;
 dismiss();anchor=el;description=el.getAttribute('aria-describedby');tooltip=element('div',text);tooltip.id='zero-desktop-tooltip';tooltip.className='desktop-evidence-tooltip';tooltip.setAttribute('role','tooltip');
 el.setAttribute('aria-describedby',[description,tooltip.id].filter(Boolean).join(' '));doc.body.append(tooltip);position();
}
function editable(target){return Boolean(target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]'));}
function modal(){return Boolean(doc.querySelector('dialog[open],[aria-modal="true"]'));}
function closeGuide(){if(guide?.open)guide.close();}
function openGuide(){
 if(guide?.open){guide.focus();return;}if(modal())return;
 dismiss();returnFocus=doc.activeElement;guide=element('dialog');guide.className='desktop-shortcuts-dialog';guide.setAttribute('aria-labelledby','desktop-shortcuts-title');
 const title=element('h2','키보드 단축키');title.id='desktop-shortcuts-title';guide.append(title);
 const list=element('dl');for(const [key,label] of [['?','단축키 안내'],['Alt + 1','실전 투자 · 내 자산'],['Alt + 2','내 사무실'],['Alt + 3','실시간 광장'],['Alt + 4','커뮤니티'],['/','기존 전체 종목 검색'],['Escape','열린 안내·대화상자 닫기'],['방향키','사무실 이동 · 해당 영역에 포커스가 있을 때']])list.append(element('dt',key),element('dd',label));guide.append(list,element('p','입력 중이거나 다른 대화상자가 열려 있으면 화면 이동 단축키는 동작하지 않습니다. 브라우저·운영체제 단축키가 우선할 수 있습니다.'));
 const close=element('button','닫기');close.type='button';close.addEventListener('click',closeGuide);guide.append(close);
 const owned=guide;owned.addEventListener('close',()=>{owned.remove();if(guide===owned)guide=null;if(returnFocus?.isConnected)returnFocus.focus();});doc.body.append(owned);owned.showModal();close.focus();
}
function keydown(event){
 if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.repeat)return;
 if(event.key==='Escape'){dismiss();if(guide?.open){event.preventDefault();closeGuide();}return;}
 if(editable(event.target)||modal()||event.ctrlKey||event.metaKey||event.getModifierState?.('AltGraph'))return;
 if(event.key==='?'&&!event.altKey){event.preventDefault();openGuide();return;}
 if(desktop.matches&&event.altKey&&!event.shiftKey&&['1','2','3','4'].includes(event.key)&&typeof root.ZERO?.navigate==='function'){
  event.preventDefault();dismiss();root.ZERO.navigate(['portfolio','lobby','plaza','community'][Number(event.key)-1]);
 }
}
function over(event){if(tooltip?.contains(event.target))return;if(event.pointerType==='touch')return;show(event.target);}
function out(event){if(anchor&&!anchor.contains(event.relatedTarget)&&!tooltip?.contains(event.relatedTarget))dismiss();}
function inject(){if(button?.isConnected)return;const header=doc.querySelector('.global-header');if(!header||doc.getElementById('desktop-shortcuts'))return;button=element('button','단축키 ?');button.id='desktop-shortcuts';button.type='button';button.setAttribute('aria-label','키보드 단축키 안내');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-keyshortcuts','Shift+/');button.addEventListener('click',openGuide);header.append(button);}
function changed(){if(anchor&&(!anchor.isConnected||modal()))dismiss();inject();if(guide&&!guide.isConnected){guide=null;}}
const observer=new root.MutationObserver(changed);observer.observe(doc.documentElement,{childList:true,subtree:true});
doc.addEventListener('pointerover',over);doc.addEventListener('pointerout',out);doc.addEventListener('focusin',over);doc.addEventListener('focusout',out);doc.addEventListener('keydown',keydown);doc.addEventListener('visibilitychange',dismiss);root.addEventListener('blur',dismiss);root.addEventListener('resize',dismiss);doc.addEventListener('scroll',dismiss,true);desktop.addEventListener('change',dismiss);

root.ZERODesktopInteractions={openGuide,destroy(){dismiss();closeGuide();observer.disconnect();button?.remove();doc.removeEventListener('pointerover',over);doc.removeEventListener('pointerout',out);doc.removeEventListener('focusin',over);doc.removeEventListener('focusout',out);doc.removeEventListener('keydown',keydown);doc.removeEventListener('visibilitychange',dismiss);root.removeEventListener('blur',dismiss);root.removeEventListener('resize',dismiss);doc.removeEventListener('scroll',dismiss,true);desktop.removeEventListener('change',dismiss);delete root.ZERODesktopInteractions;}};
inject();
})(typeof window==='undefined'?globalThis:window);
