/* Page existing sections without hiding overflowing content or moving it into a dialog. */
(() => {
  'use strict';
  function sectionModel(count,page){return {count,current:Math.max(0,Math.min(page,Math.max(0,count-1)))};}
  if(typeof module!=='undefined'&&module.exports)module.exports={sectionModel};
  if(typeof document==='undefined')return;
  const make=(tag,cls,text)=>{const element=document.createElement(tag);if(cls)element.className=cls;if(text)element.textContent=text;return element;};
  const controllers=[];
  for(const view of document.querySelectorAll('main > .view')){
    if(['lobby-view','plaza-view'].includes(view.id))continue;
    const body=make('div','viewport-pages-body'),nav=make('nav','viewport-controls'),previous=make('button','secondary-button','이전'),select=make('select'),next=make('button','secondary-button','다음'),status=make('span','viewport-page-count');
    nav.setAttribute('aria-label','본문 섹션 페이지');select.setAttribute('aria-label','볼 내용 선택');status.setAttribute('aria-live','polite');
    previous.type=next.type='button';
    const listView=['macro-view','news-view'].includes(view.id), listGroup=listView?make('div','viewport-section-group'):null;
    if(listGroup)body.append(listGroup);
    for(const child of [...view.children]){
      if(child.tagName==='DIALOG')continue;
      if(listGroup){listGroup.append(child);continue;}
      if(child.classList.contains('pager')&&body.lastElementChild){
        const prior=body.lastElementChild;
        if(prior.classList.contains('viewport-section-group'))prior.append(child);
        else {const group=make('div','viewport-section-group');prior.replaceWith(group);group.append(prior,child);body.append(group);}
      }else body.append(child);
    }
    nav.append(previous,select,status,next);view.append(body,nav);view.classList.add('viewport-paged');
    let page=0,selected=null,scheduled=false;
    const label=(element,index)=>element.querySelector('h2,h3')?.textContent||element.getAttribute('aria-label')||({'team-grid':'팀 구성','office-directory':'팀별 담당 업무','news-list':'뉴스 목록','macro-list':'경제 지표','research-ranks':'종목 순위','company-content':'투자회사','community-list':'커뮤니티'}[element.id])||'내용 '+(index+1);
    function apply(){
      const sections=[...body.children].filter(element=>!element.hidden&&element.tagName!=='DIALOG');
      const retained=sections.indexOf(selected);page=sectionModel(sections.length,retained<0?page:retained).current;selected=sections[page]||null;
      select.replaceChildren();
      sections.forEach((element,index)=>{element.classList.add('viewport-section-page');element.classList.toggle('viewport-page-away',index!==page);const option=make('option','',label(element,index));option.value=String(index);select.append(option);});
      select.value=String(page);previous.disabled=page===0;next.disabled=page>=sections.length-1;select.disabled=sections.length<2;
      status.textContent=sections.length?(page+1)+' / '+sections.length:'';
      nav.hidden=sections.length<2;
    }
    function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;apply();});}
    function change(target){selected=null;page=target;apply();body.scrollTop=0;window.ZEROMTSCards?.refresh?.();window.dispatchEvent?.(new Event('resize'));select.focus?.({preventScroll:true});}
    previous.addEventListener('click',()=>change(page-1));next.addEventListener('click',()=>change(page+1));select.addEventListener('change',()=>change(Number(select.value)));
    new MutationObserver(records=>{if(records.some(record=>record.type==='childList'||record.target!==body))schedule();}).observe(body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    controllers.push(schedule);apply();
  }
  document.addEventListener('zero-view-changed',()=>controllers.forEach(update=>update()));
})();
