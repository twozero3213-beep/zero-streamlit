/* Section pages preserve live DOM nodes; oversized sections open in a scrollable dialog. */
(() => {
  'use strict';
  function sectionModel(count,page){return {count,current:Math.max(0,Math.min(page,Math.max(0,count-1)))};}
  if(typeof module!=='undefined'&&module.exports)module.exports={sectionModel};
  if(typeof document==='undefined')return;
  const make=(tag,cls,text)=>{const element=document.createElement(tag);if(cls)element.className=cls;if(text)element.textContent=text;return element;};
  const dialog=make('dialog','viewport-content-dialog'),head=make('div','viewport-dialog-head'),title=make('h2','', '전체 내용'),close=make('button','secondary-button','닫기'),content=make('div');
  dialog.setAttribute('aria-label','현재 섹션 전체 내용');close.type='button';head.append(title,close);dialog.append(head,content);document.body.append(dialog);
  let moved=null;
  function restore(){
    if(!moved)return;const {element,marker,button}=moved;moved=null;
    marker.replaceWith(element);button.focus?.({preventScroll:true});window.dispatchEvent?.(new Event('resize'));
  }
  close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',restore);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  const controllers=[];
  for(const view of document.querySelectorAll('main > .view')){
    if(view.id==='lobby-view')continue;
    const body=make('div','viewport-pages-body'),preview=make('section','viewport-overflow-preview'),previewTitle=make('h2'),previewNote=make('p','muted-note','화면보다 긴 내용입니다. 아래 전체 내용 버튼에서 모든 자료와 작업 버튼을 확인하세요.'),nav=make('nav','viewport-controls'),previous=make('button','secondary-button','이전'),select=make('select'),next=make('button','secondary-button','다음'),detail=make('button','secondary-button viewport-detail','전체 내용');
    nav.setAttribute('aria-label','본문 섹션 페이지');select.setAttribute('aria-label','볼 내용 선택');
    for(const button of [previous,next,detail])button.type='button';
    // A list's own pager stays on the same section page as its items.
    for(const child of [...view.children]){
      if(child.tagName==='DIALOG')continue;
      if(child.classList.contains('pager')&&body.lastElementChild){
        const prior=body.lastElementChild;
        if(prior.classList.contains('viewport-section-group'))prior.append(child);
        else {const group=make('div','viewport-section-group');prior.replaceWith(group);group.append(prior,child);body.append(group);}
      }else body.append(child);
    }
    preview.append(previewTitle,previewNote);preview.hidden=true;nav.append(previous,select,next,detail);view.append(body,preview,nav);view.classList.add('viewport-paged');
    let page=0,selected=null,scheduled=false;
    const label=(element,index)=>element.querySelector('h2,h3')?.textContent||element.getAttribute('aria-label')||({'team-grid':'팀 구성','office-directory':'팀별 담당 업무','news-list':'뉴스 목록','macro-list':'경제 지표','research-ranks':'종목 순위','company-content':'투자회사','community-list':'커뮤니티'}[element.id])||'내용 '+(index+1);
    function apply(){
      if(moved&&moved.marker.parentElement===body)return;
      const sections=[...body.children].filter(element=>!element.hidden&&element.tagName!=='DIALOG');
      const retained=sections.indexOf(selected);page=sectionModel(sections.length,retained<0?page:retained).current;selected=sections[page]||null;
      select.replaceChildren();
      sections.forEach((element,index)=>{element.classList.add('viewport-section-page');element.classList.toggle('viewport-page-away',index!==page);const option=make('option','',label(element,index));option.value=String(index);select.append(option);});
      select.value=String(page);previous.disabled=page===0;next.disabled=page>=sections.length-1;select.disabled=sections.length<2;
      preview.hidden=true;
      let overflow=Boolean(selected&&selected.scrollHeight>body.clientHeight);
      if(selected&&typeof getComputedStyle==='function'){
        const boundary=body.getBoundingClientRect();
        for(const action of selected.querySelectorAll('button,a,input,select,textarea')){
          if(!action.getClientRects().length)continue;const rect=action.getBoundingClientRect();
          if(rect.bottom>boundary.bottom||rect.top<boundary.top)overflow=true;
          for(let parent=action.parentElement;parent&&parent!==body;parent=parent.parentElement){
            if(!['hidden','clip','auto','scroll'].includes(getComputedStyle(parent).overflowY))continue;
            const bounds=parent.getBoundingClientRect();if(rect.bottom>bounds.bottom||rect.top<bounds.top)overflow=true;
          }
        }
      }
      body.classList.toggle('viewport-overflow',overflow);body.inert=overflow;preview.hidden=!overflow;previewTitle.textContent=selected?label(selected,page):'';
      detail.disabled=!selected;detail.hidden=!selected;
      nav.hidden=!sections.length;
    }
    function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;apply();});}
    function change(target){selected=null;page=target;apply();select.focus?.({preventScroll:true});}
    previous.addEventListener('click',()=>change(page-1));next.addEventListener('click',()=>change(page+1));select.addEventListener('change',()=>change(Number(select.value)));
    detail.addEventListener('click',()=>{
      if(!selected)return;const marker=make('div','viewport-dialog-placeholder');selected.replaceWith(marker);moved={element:selected,marker,button:detail};title.textContent=label(selected,page);content.replaceChildren(selected);dialog.showModal();
      window.dispatchEvent?.(new Event('resize'));
    });
    new MutationObserver(records=>{if(records.some(record=>record.type==='childList'||record.target!==body))schedule();}).observe(body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(schedule).observe(body);
    controllers.push(schedule);apply();
  }
  window.addEventListener('resize',()=>controllers.forEach(update=>update()));
  document.addEventListener('zero-view-changed',()=>{if(dialog.open)dialog.close();controllers.forEach(update=>update());});
})();
