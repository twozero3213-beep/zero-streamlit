/* Owner-only draft editor. The shared layout validator remains the save authority. */
(() => {
  'use strict';
  const LABELS={desk:'책상',server:'서버',billboard:'전광판',meeting:'회의 테이블',partition:'칸막이',plant:'화분',coffee:'커피',guestbook:'방명록',portal:'광장 문',sofa:'소파',standingdesk:'스탠딩 책상'};
  const SIZES={desk:[2,1],server:[1,2],billboard:[4,1],meeting:[3,2],partition:[1,2],plant:[1,1],coffee:[1,1],guestbook:[1,1],portal:[1,1],sofa:[2,1],standingdesk:[1,1]};
  const clone=value=>structuredClone(value);
  const TILED_LIMIT=100*1024;
  function parseTiledJSON(text,schema){if(typeof text!=='string'||text.length>TILED_LIMIT||new TextEncoder().encode(text).length>TILED_LIMIT||!schema?.fromTiled)return null;try{return schema.fromTiled(JSON.parse(text));}catch(_){return null;}}
  function footprint(object){const size=SIZES[object.kind];if(!size)return null;return object.rotation===90||object.rotation===270?[size[1],size[0]]:size;}
  function occupied(layout,x,y){return layout?.objects.find(object=>{const size=footprint(object);return size&&x>=object.x&&x<object.x+size[0]&&y>=object.y&&y<object.y+size[1];})||null;}
  function placementError(layout,object){const size=footprint(object);if(!size||!Number.isInteger(object.x)||!Number.isInteger(object.y)||object.x<0||object.y<0||object.x+size[0]>16||object.y+size[1]>10)return 'OUT_OF_BOUNDS';for(let y=object.y;y<object.y+size[1];y++)for(let x=object.x;x<object.x+size[0];x++){const other=occupied(layout,x,y);if(other&&other.id!==object.id)return 'OVERLAP';}return null;}
  function createController({schema,session,request,emit=()=>{}}){
    let epoch=0,state={draft:null,revision:null,owner:null,busy:false,error:null,conflict:false,dirty:false};
    const current=()=>state.owner&&session()?.nick===state.owner;
    const publish=(generation,values)=>{if(generation===epoch&&current())Object.assign(state,values);};
    function reset(){epoch++;state={draft:null,revision:null,owner:null,busy:false,error:null,conflict:false,dirty:false};}
    function error(layout){
      const api=schema();if(!api?.validate)return 'SCHEMA_UNAVAILABLE';const result=api.validate(layout);
      if(result===true||result?.ok===true||result?.valid===true||result?.version===1&&Array.isArray(result.objects))return null;
      if(result?.error||result?.code||result?.errors?.length)return result.error||result.code||result.errors[0]?.code||result.errors[0];
      if(!layout||!Array.isArray(layout.objects))return 'LAYOUT_INVALID';
      if(layout.objects.length>(api.MAX_OBJECTS||60))return 'OBJECT_LIMIT';
      if(layout.objects.filter(o=>o.kind==='portal').length!==1)return 'MISSING_PORTAL';
      if(layout.objects.filter(o=>o.kind==='guestbook').length!==1)return 'MISSING_GUESTBOOK';
      for(const object of layout.objects){const problem=placementError(layout,object);if(problem)return problem;}
      if(occupied(layout,8,9))return 'SPAWN_BLOCKED';
      return 'SPAWN_UNREACHABLE';
    }
    async function load({discard=false}={}){
      if(state.busy)return false;if(state.dirty&&!discard){state.error='DRAFT_RELOAD_CONFIRM';return false;}
      const owner=session()?.nick;if(!owner){reset();state.error='UNAUTHORIZED';return false;}
      state.owner=owner;state.busy=true;state.error=null;const generation=++epoch;
      try{const value=await request('/me/office-layout');if(generation!==epoch||!current())return false;
        if(!Number.isSafeInteger(value.revision)||value.revision<0||error(value.layout)){state.error='LAYOUT_RESPONSE_INVALID';return false;}
        state.draft=clone(value.layout);state.revision=value.revision;state.dirty=false;state.conflict=false;return true;
      }catch(failure){publish(generation,{error:failure?.code==='UNAUTHORIZED'?'UNAUTHORIZED':'LOAD_FAILED'});return false;}
      finally{publish(generation,{busy:false});}
    }
    function change(mutator){if(!current()||!state.draft||state.busy)return false;const draft=clone(state.draft);const problem=mutator(draft);if(problem){state.error=problem;return false;}epoch++;state.draft=draft;state.dirty=true;state.error=error(draft);return true;}
    function place(kind,x,y){return change(layout=>{if(!SIZES[kind])return 'LAYOUT_INVALID';const id=Math.max(0,...layout.objects.map(o=>o.id))+1;if(!Number.isSafeInteger(id)||id>(schema()?.MAX_ID||2147483647)||layout.objects.length>=(schema()?.MAX_OBJECTS||60))return 'OBJECT_LIMIT';const object={id,kind,x,y,rotation:0},problem=placementError(layout,object);if(problem)return problem;layout.objects.push(object);});}
    function rotate(id){return change(layout=>{const object=layout.objects.find(o=>o.id===id);if(!object)return 'SELECT_OBJECT';object.rotation=(object.rotation+90)%360;return placementError(layout,object);});}
    function remove(id){return change(layout=>{const index=layout.objects.findIndex(o=>o.id===id);if(index<0)return 'SELECT_OBJECT';layout.objects.splice(index,1);});}
    function theme(value){return change(layout=>{if(!['wallstreet','boutique','startup'].includes(value))return 'LAYOUT_INVALID';layout.theme=value;});}
    function importLayout(layout,generation=epoch){
      if(generation!==epoch||!current()||!state.draft||state.busy)return false;
      const canonical=schema()?.validate(layout);
      if(!canonical||canonical.version!==1||!Array.isArray(canonical.objects)){state.error='IMPORT_INVALID';return false;}
      epoch++;state.draft=clone(canonical);state.dirty=true;state.error=state.conflict?'REVISION_CONFLICT':null;return true;
    }
    async function save(){
      if(!current()||!state.draft||state.busy||state.conflict)return false;
      const problem=error(state.draft);if(problem){state.error=problem;return false;}
      const generation=epoch,layout=clone(state.draft),revision=state.revision;state.busy=true;state.error=null;
      try{const value=await request('/me/office-layout',{method:'PUT',body:{layout,revision}});if(generation!==epoch||!current())return false;
        if(!Number.isSafeInteger(value.revision)||value.revision<=revision||error(value.layout)){state.error='LAYOUT_RESPONSE_INVALID';return false;}
        state.draft=clone(value.layout);state.revision=value.revision;state.dirty=false;state.conflict=false;emit({layout:clone(value.layout),revision:value.revision});return true;
      }catch(failure){publish(generation,{error:failure?.code==='UNAUTHORIZED'?'UNAUTHORIZED':failure?.code==='REVISION_CONFLICT'||failure?.code==='LAYOUT_STALE'||failure?.status===409?'REVISION_CONFLICT':'SAVE_FAILED',conflict:failure?.status===409||['REVISION_CONFLICT','LAYOUT_STALE'].includes(failure?.code)});return false;}
      finally{publish(generation,{busy:false});}
    }
    return {load,save,reset,place,rotate,remove,theme,importLayout,ticket:()=>epoch,validation:()=>state.draft?error(state.draft):'LOAD_REQUIRED',snapshot:()=>clone(state)};
  }
  function createPreviewPainter({render,makeCanvas,commit,fail=()=>{}}){
    let generation=0,queued=null,busy=false,key=null,flight=null;
    async function drain(){busy=true;try{while(queued){const job=queued;queued=null;try{const frame=makeCanvas();await render(frame,job.layout);if(job.generation===generation)commit(frame);}catch(_){if(job.generation===generation){key=null;fail();}}}}finally{busy=false;}}
    function paint(layout){
      if(!layout){generation++;queued=null;key=null;commit(null);return flight||Promise.resolve();}
      const next=JSON.stringify(layout);if(next===key)return flight||Promise.resolve();
      key=next;queued={generation:++generation,layout:clone(layout)};if(!busy)flight=drain();return flight;
    }
    return {paint};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={createController,createPreviewPainter,parseTiledJSON,TILED_LIMIT,footprint,occupied,placementError,LABELS};
  if(typeof document==='undefined')return;
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const messages={IMPORT_INVALID:'100KB 이하의 ZERO 16×10 Tiled JSON(.json/.tmj)만 가져올 수 있어요. 기존 초안은 보존했어요.',UNAUTHORIZED:'로그인한 대표님만 편집할 수 있어요.',SCHEMA_UNAVAILABLE:'배치 도구를 아직 불러오지 못했어요.',LOAD_REQUIRED:'사무실 배치를 먼저 불러오세요.',LOAD_FAILED:'불러오지 못했어요. 다시 시도해 주세요.',SAVE_FAILED:'저장하지 못했어요. 배치는 그대로예요.',REVISION_CONFLICT:'다른 화면에서 배치가 바뀌었어요. 초안은 보존했어요. 새 배치를 불러오려면 초안 교체를 확인하세요.',DRAFT_RELOAD_CONFIRM:'초안을 교체하려면 다시 불러오기 확인이 필요해요.',OUT_OF_BOUNDS:'가구가 16×10 격자 밖으로 나가요.',OVERLAP:'다른 가구와 겹쳐요.',SELECT_OBJECT:'먼저 가구를 선택하세요.',OBJECT_LIMIT:'가구를 더 놓을 공간이 없어요.',LAYOUT_RESPONSE_INVALID:'서버 배치를 확인하지 못했어요.',MISSING_PORTAL:'광장 문은 정확히 한 개 놓아 주세요.',PORTAL_REQUIRED:'광장 문을 놓아 주세요.',MISSING_GUESTBOOK:'방명록은 정확히 한 개 놓아 주세요.',GUESTBOOK_REQUIRED:'방명록을 놓아 주세요.',SPAWN_BLOCKED:'시작 위치 (8,9)를 비워 주세요.',SPAWN_UNREACHABLE:'시작 위치에서 문·방명록과 가구에 갈 길을 비워 주세요.',UNREACHABLE:'시작 위치에서 문과 방명록으로 갈 길을 비워 주세요.',LAYOUT_INVALID:'가구 범위·겹침·문·방명록·시작 위치의 길을 확인하세요.'};
  const controller=createController({schema:()=>window.ZEROOfficeLayout,session:()=>window.ZEROLobbyUsers?.session(),request:(path,options)=>window.ZEROLobbyUsers.request(path,options),emit:detail=>document.dispatchEvent(new CustomEvent('zero-office-layout',{detail}))});
  const modal=make('dialog','office-editor');modal.setAttribute('aria-labelledby','office-editor-title');
  const header=make('header','office-editor-head'),title=make('h2','','사무실 꾸미기(배치 편집)'),cancel=make('button','secondary-button','취소');title.id='office-editor-title';cancel.type='button';header.append(title,cancel);
  const note=make('p','office-editor-status');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
  const toolbar=make('div','office-editor-toolbar'),theme=make('select'),themeLabel=make('label','','사무실 분위기 ');theme.setAttribute('aria-label','사무실 분위기');for(const [value,text]of [['wallstreet','월스트리트'],['boutique','부티크'],['startup','스타트업']]){const option=make('option','',text);option.value=value;theme.append(option);}themeLabel.append(theme);
  const selectTool=make('button','secondary-button','선택'),rotate=make('button','secondary-button','회전'),remove=make('button','secondary-button','삭제'),credits=make('button','secondary-button','에셋 크레딧');for(const button of [selectTool,rotate,remove,credits])button.type='button';toolbar.append(themeLabel,selectTool,rotate,remove,credits);
  const exportFile=make('button','secondary-button office-editor-export','Tiled 내보내기'),importLabel=make('label','office-editor-import','Tiled 가져오기 '),importFile=make('input','office-editor-file');exportFile.type='button';importFile.type='file';importFile.accept='.json,.tmj,application/json';importFile.setAttribute('aria-label','100KB 이하 ZERO Tiled JSON 가져오기');importLabel.append(importFile);toolbar.append(exportFile,importLabel);
  const palette=make('div','office-editor-palette'),paletteNav=make('nav','office-editor-palette-nav'),previous=make('button','secondary-button','이전 가구'),page=make('span'),next=make('button','secondary-button','다음 가구');paletteNav.setAttribute('aria-label','가구 팔레트 페이지');previous.type=next.type='button';paletteNav.append(previous,page,next);
  const region=make('div','office-editor-grid-wrap'),surface=make('div','office-editor-surface'),preview=make('canvas','office-editor-preview'),grid=make('div','office-editor-grid');preview.width=640;preview.height=400;preview.setAttribute('aria-hidden','true');grid.setAttribute('role','grid');grid.setAttribute('aria-label','16열 10행 사무실 배치, 방향키로 이동하고 Enter로 선택 또는 배치');grid.setAttribute('aria-rowcount','10');grid.setAttribute('aria-colcount','16');surface.append(preview,grid);region.append(surface);
  const actions=make('footer','office-editor-actions'),retry=make('button','secondary-button','다시 불러오기'),save=make('button','primary-button','저장');retry.type=save.type='button';actions.append(retry,save);modal.append(header,toolbar,palette,paletteNav,region,note,actions);document.body.append(modal);
  const previewPainter=createPreviewPainter({
    makeCanvas:()=>document.createElement('canvas'),
    render:(frame,layout)=>{
      const renderer=typeof window.ZEROOfficeNative?.drawLayout==='function'?window.ZEROOfficeNative:window.ZEROOfficeSprites;
      if(typeof renderer?.drawLayout!=='function')throw Error('PREVIEW_UNAVAILABLE');
      const value=clone(layout);
      // The legacy sprite renderer needs an unversioned display copy of invalid drafts.
      if(renderer===window.ZEROOfficeSprites&&!window.ZEROOfficeLayout?.validate(value))delete value.version;
      return renderer.drawLayout(frame,value);
    },
    commit:frame=>{const context=preview.getContext('2d');if(!frame){context.clearRect(0,0,preview.width,preview.height);return;}preview.width=frame.width;preview.height=frame.height;context.imageSmoothingEnabled=false;context.drawImage(frame,0,0);},
    fail:()=>{if(modal.open&&!controller.snapshot().error)note.textContent='가구 미리보기를 불러오지 못했어요. 배치 선택은 계속 사용할 수 있어요.';}
  });
  let selected=null,kind=null,palettePage=0,focus=152,importSerial=0;
  function draw(){
    const state=controller.snapshot();exportFile.disabled=state.busy||!state.draft||Boolean(controller.validation());importFile.disabled=state.busy||!state.draft;previewPainter.paint(state.draft);theme.disabled=state.busy||!state.draft;theme.value=state.draft?.theme||'wallstreet';save.disabled=state.busy||!state.draft||state.conflict||Boolean(controller.validation());retry.disabled=state.busy;
    rotate.disabled=remove.disabled=state.busy||selected===null;note.textContent=state.busy?'요청 중…':state.error?(messages[state.error]||messages.LAYOUT_INVALID):state.dirty?'저장 전 초안 · 저장을 눌러야 적용돼요.':'배치를 선택하거나 가구를 놓아 보세요.';
    palette.replaceChildren();const size=window.innerWidth<768?4:6,kinds=Object.keys(LABELS),pages=Math.ceil(kinds.length/size);palettePage=Math.min(palettePage,pages-1);
    for(const value of kinds.slice(palettePage*size,(palettePage+1)*size)){const button=make('button','office-editor-furniture',LABELS[value]+' '+SIZES[value].join('×'));button.type='button';button.disabled=state.busy||!state.draft;button.setAttribute('aria-pressed',String(kind===value));button.addEventListener('click',()=>{kind=value;selected=null;draw();grid.querySelectorAll('button')[focus]?.focus();});palette.append(button);}
    previous.disabled=palettePage===0;next.disabled=palettePage===pages-1;page.textContent=(palettePage+1)+' / '+pages;
    grid.replaceChildren();for(let y=0;y<10;y++){const row=make('div','office-editor-grid-row');row.setAttribute('role','row');grid.append(row);for(let x=0;x<16;x++){
      const object=occupied(state.draft,x,y),cell=make('button','office-editor-cell',object&&object.x===x&&object.y===y?LABELS[object.kind]:x===8&&y===9?'시작':'');cell.type='button';cell.disabled=state.busy||!state.draft;cell.tabIndex=y*16+x===focus?0:-1;const label=make('span','office-editor-cell-label',cell.textContent);cell.textContent='';cell.append(label);cell.setAttribute('role','gridcell');cell.setAttribute('aria-rowindex',String(y+1));cell.setAttribute('aria-colindex',String(x+1));cell.setAttribute('aria-label',(y+1)+'행 '+(x+1)+'열 '+(object?LABELS[object.kind]:'빈 타일')+(x===8&&y===9?' · 시작 위치':''));cell.setAttribute('aria-selected',String(object?.id===selected));if(object)cell.dataset.kind=object.kind;
      cell.addEventListener('click',()=>{focus=y*16+x;if(kind){controller.place(kind,x,y);}else selected=object?.id??null;draw();grid.querySelectorAll('button')[focus]?.focus();});
      cell.addEventListener('keydown',event=>{const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-16,ArrowDown:16}[event.key];if(delta===undefined)return;event.preventDefault();focus=event.key==='ArrowLeft'||event.key==='ArrowRight'?y*16+Math.max(0,Math.min(15,x+delta)):Math.max(0,Math.min(9,y+delta/16))*16+x;const cells=grid.querySelectorAll('button');cells.forEach((node,index)=>node.tabIndex=index===focus?0:-1);cells[focus].focus();});row.append(cell);
    }}
  }
  async function load(discard=false){const pending=controller.load({discard});draw();await pending;draw();}
  async function open(){if(modal.open)return true;if(!window.ZEROLobbyUsers?.session())return false;controller.reset();kind=null;selected=null;draw();modal.showModal();await load();return true;}
  cancel.addEventListener('click',()=>modal.close());modal.addEventListener('close',()=>{importSerial++;importFile.value='';controller.reset();selected=null;kind=null;draw();});
  retry.addEventListener('click',()=>{const state=controller.snapshot();if(state.dirty&&!window.confirm('저장하지 않은 초안을 버리고 최신 배치를 불러올까요?'))return;load(true);});
  save.addEventListener('click',async()=>{const pending=controller.save();draw();await pending;draw();});
  theme.addEventListener('change',()=>{controller.theme(theme.value);draw();});selectTool.addEventListener('click',()=>{kind=null;draw();});rotate.addEventListener('click',()=>{controller.rotate(selected);draw();});remove.addEventListener('click',()=>{if(controller.remove(selected))selected=null;draw();});
  previous.addEventListener('click',()=>{palettePage--;draw();});next.addEventListener('click',()=>{palettePage++;draw();});credits.addEventListener('click',async()=>{if(!window.ZEROOfficeSprites?.openCredits){note.textContent='에셋 크레딧을 아직 불러오지 못했어요.';return;}try{await window.ZEROOfficeSprites.openCredits();}catch(_){note.textContent='에셋 크레딧을 불러오지 못했어요. 다시 시도해 주세요.';}});
  exportFile.addEventListener('click',()=>{
    const state=controller.snapshot(),tiled=window.ZEROOfficeLayout?.toTiled(state.draft);if(!tiled){note.textContent=messages.LAYOUT_INVALID;return;}
    const text=JSON.stringify(tiled);if(new TextEncoder().encode(text).length>TILED_LIMIT){note.textContent=messages.IMPORT_INVALID;return;}
    const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),link=make('a');link.href=url;link.download='zero-office.tmj';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
  });
  importFile.addEventListener('change',async()=>{
    const file=importFile.files?.[0],serial=++importSerial,ticket=controller.ticket();if(!file)return;
    let layout=null;
    try{if(Number.isInteger(file.size)&&file.size>=0&&file.size<=TILED_LIMIT&&/\.(json|tmj)$/i.test(file.name))layout=parseTiledJSON(await file.text(),window.ZEROOfficeLayout);}catch(_){layout=null;}
    if(serial!==importSerial||ticket!==controller.ticket()||!modal.open)return;
    controller.importLayout(layout,ticket);importFile.value='';selected=null;kind=null;draw();
  });
  document.addEventListener('zero-session-changed',()=>{importSerial++;importFile.value='';controller.reset();if(modal.open)modal.close();draw();mount();});window.addEventListener('resize',()=>{if(modal.open)draw();});
  function mount(){
    for(const [id,ownOnly]of [['company-content',false],['lobby-meta',true]]){const host=id==='lobby-meta'?document.querySelector('.lobby-meta'):document.getElementById(id);if(!host)continue;let button=host.querySelector('[data-office-layout-edit]');if(!button){button=make('button','secondary-button office-editor-launch','사무실 꾸미기(배치 편집)');button.type='button';button.dataset.officeLayoutEdit='true';button.addEventListener('click',()=>{if(ownOnly&&window.ZEROLobby?.state?.mode!=='own')return;open();});host.append(button);}const hidden=!window.ZEROLobbyUsers?.session()||(ownOnly&&window.ZEROLobby?.state?.mode!=='own');if(button.hidden!==hidden)button.hidden=hidden;}
  }
  window.ZEROOfficeEditor={open};new MutationObserver(mount).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-mode']});mount();
})();
