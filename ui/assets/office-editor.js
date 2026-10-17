/* Owner-only draft editor. The shared layout validator remains the save authority. */
(() => {
  'use strict';
  const LABELS={desk:'책상',server:'서버',billboard:'전광판',meeting:'회의 테이블',partition:'칸막이',plant:'화분',coffee:'커피',guestbook:'방명록',portal:'광장 문',sofa:'소파',standingdesk:'스탠딩 책상',chair:'의자',bookshelf:'책장',cabinet:'수납장',lamp:'조명',rug:'러그',whiteboard:'화이트보드',water:'정수기',printer:'프린터',arcade:'아케이드'};
  const SIZES={desk:[2,1],server:[1,2],billboard:[4,1],meeting:[3,2],partition:[1,2],plant:[1,1],coffee:[1,1],guestbook:[1,1],portal:[1,1],sofa:[2,1],standingdesk:[1,1],chair:[1,1],bookshelf:[2,1],cabinet:[2,1],lamp:[1,1],rug:[3,2],whiteboard:[2,1],water:[1,1],printer:[1,1],arcade:[1,1]};
  const THEMES=['wallstreet','boutique','startup','nordic','japandi','library','botanical','industrial','coastal','night'];
  const COLORS=['ink','blue','sage','sand','rose'];
  const clone=value=>structuredClone(value);
  const TILED_LIMIT=100*1024;
  function parseTiledJSON(text,schema){if(typeof text!=='string'||text.length>TILED_LIMIT||new TextEncoder().encode(text).length>TILED_LIMIT||!schema?.fromTiled)return null;try{return schema.fromTiled(JSON.parse(text));}catch(_){return null;}}
  function footprint(object){const size=SIZES[object.kind];if(!size)return null;return object.rotation===90||object.rotation===270?[size[1],size[0]]:size;}
  function occupied(layout,x,y){return layout?.objects.find(object=>{const size=footprint(object);return size&&x>=object.x&&x<object.x+size[0]&&y>=object.y&&y<object.y+size[1];})||null;}
  function placementError(layout,object){const size=footprint(object);if(!size||!Number.isInteger(object.x)||!Number.isInteger(object.y)||object.x<0||object.y<0||object.x+size[0]>16||object.y+size[1]>10)return 'OUT_OF_BOUNDS';for(let y=object.y;y<object.y+size[1];y++)for(let x=object.x;x<object.x+size[0];x++){const other=occupied(layout,x,y);if(other&&other.id!==object.id)return 'OVERLAP';}return null;}
  function createController({schema,session,request,emit=()=>{}}){
    let epoch=0,state={draft:null,revision:null,owner:null,busy:false,error:null,conflict:false,dirty:false,saved:false};
    const current=()=>state.owner&&session()?.nick===state.owner;
    const publish=(generation,values)=>{if(generation===epoch&&current())Object.assign(state,values);};
    function reset(){epoch++;state={draft:null,revision:null,owner:null,busy:false,error:null,conflict:false,dirty:false,saved:false};}
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
      state.owner=owner;state.busy=true;state.error=null;state.saved=false;const generation=++epoch;
      try{const value=await request('/me/office-layout');if(generation!==epoch||!current())return false;
        if(!Number.isSafeInteger(value.revision)||value.revision<0||error(value.layout)){state.error='LAYOUT_RESPONSE_INVALID';return false;}
        state.draft=clone(value.layout);state.revision=value.revision;state.dirty=false;state.conflict=false;return true;
      }catch(failure){publish(generation,{error:failure?.code==='UNAUTHORIZED'?'UNAUTHORIZED':'LOAD_FAILED'});return false;}
      finally{publish(generation,{busy:false});}
    }
    function change(mutator,strict=false){if(!current()||!state.draft||state.busy)return false;const draft=clone(state.draft);const problem=mutator(draft)||(strict?error(draft):null);if(problem){state.error=problem;return false;}epoch++;state.draft=draft;state.dirty=true;state.saved=false;state.error=error(draft);return true;}
    function place(kind,x,y,style={}){return change(layout=>{if(!Object.hasOwn(SIZES,kind)||!validStyle(style)||style.rotation!==undefined&&![0,90,180,270].includes(style.rotation))return 'LAYOUT_INVALID';const id=Math.max(0,...layout.objects.map(o=>o.id))+1;if(!Number.isSafeInteger(id)||id>(schema()?.MAX_ID||2147483647)||layout.objects.length>=(schema()?.MAX_OBJECTS||60))return 'OBJECT_LIMIT';const object={id,kind,x,y,rotation:style.rotation??0,variant:style.variant??0,color:style.color??'ink'},problem=placementError(layout,object);if(problem)return problem;layout.objects.push(object);});}
    function validStyle(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(!Object.hasOwn(value,'variant')||Number.isInteger(value.variant)&&value.variant>=0&&value.variant<5)&&(!Object.hasOwn(value,'color')||COLORS.includes(value.color));}
    function moveError(id,x,y,generation=epoch){
      if(generation!==epoch)return 'DRAFT_CHANGED';if(!current()||!state.draft||state.busy)return 'LOAD_REQUIRED';
      const draft=clone(state.draft),object=draft.objects.find(o=>o.id===id);if(!object)return 'SELECT_OBJECT';
      Object.assign(object,{x,y});return placementError(draft,object)||error(draft);
    }
    function move(id,x,y,generation=epoch){if(!current()||!state.draft||state.busy)return false;const problem=moveError(id,x,y,generation);if(problem){state.error=problem;return false;}const previous=state.draft.objects.find(o=>o.id===id);if(previous.x===x&&previous.y===y){state.error=state.conflict?'REVISION_CONFLICT':null;return true;}return change(layout=>{Object.assign(layout.objects.find(o=>o.id===id),{x,y});},true);}
    function style(id,value){return change(layout=>{if(!validStyle(value)||Object.keys(value).some(key=>!['variant','color'].includes(key)))return 'LAYOUT_INVALID';const object=layout.objects.find(o=>o.id===id);if(!object)return 'SELECT_OBJECT';Object.assign(object,value);});}
    function rotate(id){return change(layout=>{const object=layout.objects.find(o=>o.id===id);if(!object)return 'SELECT_OBJECT';object.rotation=(object.rotation+90)%360;return placementError(layout,object);});}
    function remove(id){return change(layout=>{const index=layout.objects.findIndex(o=>o.id===id);if(index<0)return 'SELECT_OBJECT';layout.objects.splice(index,1);});}
    function theme(value){return change(layout=>{if(!THEMES.includes(value))return 'LAYOUT_INVALID';layout.theme=value;});}
    function importLayout(layout,generation=epoch){
      if(generation!==epoch||!current()||!state.draft||state.busy)return false;
      const canonical=schema()?.validate(layout);
      if(!canonical||canonical.version!==1||!Array.isArray(canonical.objects)){state.error='IMPORT_INVALID';return false;}
      epoch++;state.draft=clone(canonical);state.dirty=true;state.saved=false;state.error=state.conflict?'REVISION_CONFLICT':null;return true;
    }
    async function save(){
      if(!current()||!state.draft||state.busy||state.conflict)return false;
      const problem=error(state.draft);if(problem){state.error=problem;return false;}
      const generation=epoch,layout=clone(state.draft),revision=state.revision;state.busy=true;state.error=null;state.saved=false;
      try{const value=await request('/me/office-layout',{method:'PUT',body:{layout,revision}});if(generation!==epoch||!current())return false;
        if(!Number.isSafeInteger(value.revision)||value.revision<=revision||error(value.layout)){state.error='LAYOUT_RESPONSE_INVALID';return false;}
        state.draft=clone(value.layout);state.revision=value.revision;state.dirty=false;state.conflict=false;state.saved=true;emit({layout:clone(value.layout),revision:value.revision});return true;
      }catch(failure){publish(generation,{error:failure?.code==='UNAUTHORIZED'?'UNAUTHORIZED':failure?.code==='REVISION_CONFLICT'||failure?.code==='LAYOUT_STALE'||failure?.status===409?'REVISION_CONFLICT':'SAVE_FAILED',conflict:failure?.status===409||['REVISION_CONFLICT','LAYOUT_STALE'].includes(failure?.code)});return false;}
      finally{publish(generation,{busy:false});}
    }
    return {load,save,reset,place,move,moveError,style,rotate,remove,theme,importLayout,ticket:()=>epoch,validation:()=>state.draft?error(state.draft):'LOAD_REQUIRED',snapshot:()=>clone(state)};
  }
  function createPreviewPainter({render,makeCanvas,commit,fail=()=>{}}){
    let generation=0,queued=null,busy=false,key=null,flight=null;
    async function drain(){busy=true;try{while(queued){const job=queued;queued=null;try{const frame=makeCanvas();await render(frame,job.layout);if(job.generation===generation)commit(frame);}catch(_){if(job.generation===generation){key=null;fail();}}}}finally{busy=false;}}
    function paint(layout){
      if(!layout){generation++;queued=null;key=null;commit(null);return flight||Promise.resolve();}
      const next=JSON.stringify(layout);if(next===key)return flight||Promise.resolve();
      key=next;queued={generation:++generation,layout:clone(layout)};if(!busy)flight=drain();return flight;
    }
    return {paint,invalidate:()=>{key=null;}};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={createController,createPreviewPainter,parseTiledJSON,TILED_LIMIT,footprint,occupied,placementError,LABELS};
  if(typeof document==='undefined')return;
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const THEME_LABELS={wallstreet:'월스트리트',boutique:'부티크',startup:'스타트업',nordic:'노르딕',japandi:'재팬디',library:'라이브러리',botanical:'보태니컬',industrial:'인더스트리얼',coastal:'코스탈',night:'나이트'};
  const COLOR_LABELS={ink:'잉크',blue:'블루',sage:'세이지',sand:'샌드',rose:'로즈'};
  const STYLE_LABELS={coffee:['클래식','물탱크형','드립','와이드 바','디스플레이'],chair:['쿠션 의자 · 앞','우드 의자 · 앞','쿠션 의자 · 옆','우드 의자 · 옆','쿠션 의자 · 뒤'],sofa:['소파 · 앞','쿠션 벤치','소파 · 뒤','우드 벤치'],plant:['기본 화분','잎 화분','선인장','큰 화분','행잉 화분'],bookshelf:['단일 책장','이중 책장'],meeting:['회의 테이블','커피 테이블']};
  const COLORABLE=new Set(['desk','standingdesk','sofa','chair','coffee','guestbook','portal','server','billboard','partition','cabinet','lamp','rug','water','printer','arcade']);
  const styleName=(value,index)=>{const options=STYLE_LABELS[value];return options?options[index%options.length]:'기본 모양';};
  const messages={UNAUTHORIZED:'로그인한 대표님만 편집할 수 있어요.',SCHEMA_UNAVAILABLE:'배치 도구를 아직 불러오지 못했어요.',LOAD_REQUIRED:'사무실 배치를 먼저 불러오세요.',LOAD_FAILED:'불러오지 못했어요. 다시 시도해 주세요.',SAVE_FAILED:'저장하지 못했어요. 배치는 그대로예요.',REVISION_CONFLICT:'다른 화면에서 배치가 바뀌었어요. 초안은 보존했어요. 다시 불러오기로 최신 배치를 확인하세요.',DRAFT_RELOAD_CONFIRM:'초안을 교체하려면 다시 불러오기 확인이 필요해요.',DRAFT_CHANGED:'편집 중 배치가 바뀌어 이동을 취소했어요.',OUT_OF_BOUNDS:'격자 안에 놓아 주세요. 가구는 원래 자리에 있어요.',OVERLAP:'다른 가구와 겹쳐요. 가구는 원래 자리에 있어요.',SELECT_OBJECT:'먼저 가구를 선택하세요.',OBJECT_LIMIT:'가구를 더 놓을 공간이 없어요.',LAYOUT_RESPONSE_INVALID:'서버 배치를 확인하지 못했어요.',MISSING_PORTAL:'광장 문은 정확히 한 개 놓아 주세요.',MISSING_GUESTBOOK:'방명록은 정확히 한 개 놓아 주세요.',SPAWN_BLOCKED:'시작 위치 (8,9)를 비워 주세요.',SPAWN_UNREACHABLE:'시작 위치에서 문·방명록과 가구에 갈 길을 비워 주세요.',LAYOUT_INVALID:'가구 범위·겹침·문·방명록·시작 위치의 길을 확인하세요.'};
  const controller=createController({schema:()=>window.ZEROOfficeLayout,session:()=>window.ZEROLobbyUsers?.session(),request:(path,options)=>window.ZEROLobbyUsers.request(path,options),emit:detail=>document.dispatchEvent(new CustomEvent('zero-office-layout',{detail}))});
  const modal=make('dialog','office-editor');modal.setAttribute('aria-labelledby','office-editor-title');
  const header=make('header','office-editor-head'),title=make('h2','','사무실 꾸미기'),cancel=make('button','secondary-button','취소');title.id='office-editor-title';cancel.type='button';header.append(title,cancel);
  const themeTitle=make('h3','office-editor-section-title','사무실 분위기'),themes=make('div','office-editor-themes');themes.setAttribute('role','group');themes.setAttribute('aria-label','사무실 분위기 10가지');
  const toolbar=make('div','office-editor-toolbar'),selectTool=make('button','secondary-button','선택'),move=make('button','secondary-button office-editor-move','옮기기'),rotate=make('button','secondary-button','회전'),remove=make('button','secondary-button','삭제');for(const button of [selectTool,move,rotate,remove])button.type='button';toolbar.append(selectTool,move,rotate,remove);
  const palette=make('div','office-editor-palette'),paletteNav=make('nav','office-editor-palette-nav'),previous=make('button','secondary-button','이전 가구'),page=make('span'),next=make('button','secondary-button','다음 가구');palette.setAttribute('role','group');palette.setAttribute('aria-label','가구 종류 20가지');paletteNav.setAttribute('aria-label','가구 팔레트 페이지');previous.type=next.type='button';paletteNav.append(previous,page,next);
  const stylePanel=make('section','office-editor-style-panel'),styleTitle=make('h3','office-editor-section-title'),variants=make('div','office-editor-variants'),colors=make('div','office-editor-colors');variants.setAttribute('role','group');variants.setAttribute('aria-label','가구 모양 5가지');colors.setAttribute('role','group');colors.setAttribute('aria-label','가구 색상 5가지');stylePanel.append(styleTitle,variants,colors);
  const help=make('p','office-editor-help','가구를 끌어 옮기세요. 방향키: 칸 이동 · Enter: 선택·배치 · 옮기기: 목적지 선택 · Shift+방향키: 한 칸 이동 · Esc: 이동 취소');help.id='office-editor-help';
  const region=make('div','office-editor-grid-wrap'),surface=make('div','office-editor-surface'),preview=make('canvas','office-editor-preview'),grid=make('div','office-editor-grid'),ghost=make('div','office-editor-ghost');preview.width=640;preview.height=400;preview.setAttribute('aria-hidden','true');ghost.hidden=true;ghost.setAttribute('aria-hidden','true');grid.setAttribute('role','grid');grid.setAttribute('aria-label','16열 10행 사무실 배치');grid.setAttribute('aria-describedby',help.id);grid.setAttribute('aria-rowcount','10');grid.setAttribute('aria-colcount','16');surface.append(preview,grid,ghost);region.append(surface);
  const note=make('p','office-editor-status');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
  const actions=make('footer','office-editor-actions'),retry=make('button','secondary-button','다시 불러오기'),save=make('button','primary-button office-editor-save','저장');retry.type=save.type='button';actions.append(retry,save);const workspace=make('div','office-editor-workspace'),mapPanel=make('section','office-editor-map'),catalog=make('aside','office-editor-catalog');mapPanel.setAttribute('aria-label','가구 배치 작업 공간');catalog.setAttribute('aria-label','가구와 분위기 선택');mapPanel.append(region,help,note);catalog.append(themeTitle,themes,toolbar,palette,paletteNav,stylePanel);workspace.append(mapPanel,catalog);modal.append(header,workspace,actions);document.body.append(modal);
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
  let selected=null,kind=null,variant=0,color='ink',rotation=0,palettePage=0,focus=152,moving=false,drag=null,suppressClick=false,artFrame=0,dragFrame=0;
  function picture(button,node,label){if(node){node.setAttribute('aria-hidden','true');button.append(node);}button.append(make('span','',label));button.setAttribute('aria-label',label);}
  function art(value,v=variant,c=color,r=rotation){return window.ZEROOfficeArt?.preview(value,v,c,r)||null;}
  function focusCell(){grid.querySelectorAll('button')[focus]?.focus();}
  function choose(object){selected=object?.id??null;if(object){variant=object.variant??0;color=object.color??'ink';rotation=object.rotation;}}
  function activate(x,y){
    if(suppressClick){suppressClick=false;return;}
    focus=y*16+x;
    if(moving){if(controller.move(selected,x,y))moving=false;}
    else if(kind)controller.place(kind,x,y,{variant,color,rotation});
    else choose(occupied(controller.snapshot().draft,x,y));
    draw();focusCell();
  }
  function applyStyle(values){if(selected!==null){if(!controller.style(selected,values)){draw();return;}}if(values.variant!==undefined)variant=values.variant;if(values.color!==undefined)color=values.color;draw();}
  function draw(){
    const activeElement=document.activeElement,focusedGroup=[themes,palette,variants,colors].find(node=>node===activeElement?.parentElement),focusedIndex=focusedGroup?Array.from(focusedGroup.children).indexOf(activeElement):-1,focusedGrid=activeElement?.parentElement?.parentElement===grid;
    const state=controller.snapshot(),disabled=state.busy||!state.draft,object=state.draft?.objects.find(item=>item.id===selected),active=object?.kind||kind||'desk';
    if(selected!==null&&!object)selected=null;
    previewPainter.paint(state.draft);save.disabled=disabled||state.conflict||Boolean(controller.validation());retry.disabled=state.busy;
    move.disabled=remove.disabled=disabled||selected===null;rotate.disabled=disabled||selected===null&&!kind;move.setAttribute('aria-pressed',String(moving));selectTool.disabled=disabled;selectTool.setAttribute('aria-pressed',String(!kind&&!moving));
    note.textContent=state.busy?'요청 중…':state.error?(messages[state.error]||messages.LAYOUT_INVALID):moving?'목적지 칸을 선택하세요. Esc로 이동을 취소할 수 있어요.':state.dirty?'저장 전 초안 · 저장을 눌러야 적용돼요.':state.saved?'저장했어요.':'가구를 선택하거나 아래 빈칸에 놓아 보세요.';
    themes.replaceChildren();for(const value of THEMES){const button=make('button','office-editor-theme');button.type='button';button.disabled=disabled;button.setAttribute('aria-pressed',String(state.draft?.theme===value));picture(button,window.ZEROOfficeArt?.themePreview(value),window.ZEROOfficeArt?.themes?.[value]?.label||THEME_LABELS[value]);button.addEventListener('click',()=>{stopDrag();controller.theme(value);draw();themes.children[THEMES.indexOf(value)]?.focus();});themes.append(button);}
    palette.replaceChildren();const size=window.innerWidth<768?4:6,kinds=Object.keys(LABELS),pages=Math.ceil(kinds.length/size);palettePage=Math.min(palettePage,pages-1);
    for(const value of kinds.slice(palettePage*size,(palettePage+1)*size)){const button=make('button','office-editor-furniture');button.type='button';button.disabled=disabled;button.setAttribute('aria-pressed',String(kind===value));picture(button,art(value,value===active?variant:0,value===active?color:'ink',value===active?rotation:0),LABELS[value]+' · '+SIZES[value].join('×')+'칸');button.addEventListener('click',()=>{stopDrag();if(kind!==value){variant=0;color='ink';rotation=0;}kind=value;selected=null;moving=false;draw();focusCell();});palette.append(button);}
    previous.disabled=state.busy||palettePage===0;next.disabled=state.busy||palettePage===pages-1;page.textContent=(palettePage+1)+' / '+pages;
    const shapeLabels=STYLE_LABELS[active]||[],hasColors=COLORABLE.has(active);styleTitle.textContent=LABELS[active]+(shapeLabels.length&&hasColors?' 모양과 색상':shapeLabels.length?' 모양':hasColors?' 색상':' · 회전으로 방향을 바꿀 수 있어요.')+(selected!==null?' · 선택한 가구':' · 놓을 가구');variants.replaceChildren();colors.replaceChildren();variants.hidden=!shapeLabels.length;colors.hidden=!hasColors;variants.style.gridTemplateColumns='repeat('+Math.max(1,shapeLabels.length)+',minmax(0,1fr))';variants.setAttribute('aria-label','가구 모양 '+shapeLabels.length+'가지');
    for(let index=0;index<shapeLabels.length;index++){const button=make('button','office-editor-style');button.type='button';button.disabled=disabled||!kind&&selected===null;button.setAttribute('aria-pressed',String(variant%shapeLabels.length===index));picture(button,art(active,index),shapeLabels[index]);button.addEventListener('click',()=>{applyStyle({variant:index});variants.children[index]?.focus();});variants.append(button);}
    for(const value of hasColors?COLORS:[]){const button=make('button','office-editor-color');button.type='button';button.disabled=disabled||!kind&&selected===null;button.dataset.color=value;if(window.ZEROOfficeArt?.colors?.[value])button.style.borderBottomColor=window.ZEROOfficeArt.colors[value];button.setAttribute('aria-pressed',String(color===value));picture(button,art(active,variant,value),COLOR_LABELS[value]);button.addEventListener('click',()=>{applyStyle({color:value});colors.children[COLORS.indexOf(value)]?.focus();});colors.append(button);}
    grid.replaceChildren();for(let y=0;y<10;y++){const row=make('div','office-editor-grid-row');row.setAttribute('role','row');grid.append(row);for(let x=0;x<16;x++){
      const item=occupied(state.draft,x,y),cell=make('button','office-editor-cell');cell.type='button';cell.disabled=disabled;cell.tabIndex=y*16+x===focus?0:-1;cell.append(make('span','office-editor-cell-label',item&&item.x===x&&item.y===y?LABELS[item.kind]:x===8&&y===9?'시작':''));cell.setAttribute('role','gridcell');cell.setAttribute('aria-rowindex',String(y+1));cell.setAttribute('aria-colindex',String(x+1));cell.setAttribute('aria-label',(y+1)+'행 '+(x+1)+'열 '+(item?LABELS[item.kind]+' · '+styleName(item.kind,item.variant??0)+' · '+COLOR_LABELS[item.color??'ink']+' · '+item.rotation+'도':'빈 타일')+(x===8&&y===9?' · 시작 위치':''));cell.setAttribute('aria-selected',String(Boolean(item)&&item.id===selected));if(item)cell.dataset.kind=item.kind;
      cell.addEventListener('click',()=>activate(x,y));
      cell.addEventListener('keydown',event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation?.();stopDrag();moving=false;kind=null;draw();focusCell();return;}
        if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(x,y);return;}
        const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;event.preventDefault();
        if(event.shiftKey&&selected!==null){const value=controller.snapshot().draft.objects.find(o=>o.id===selected);if(value&&controller.move(value.id,value.x+delta[0],value.y+delta[1]))focus=(value.y+delta[1])*16+value.x+delta[0];draw();focusCell();return;}
        focus=Math.max(0,Math.min(9,y+delta[1]))*16+Math.max(0,Math.min(15,x+delta[0]));grid.querySelectorAll('button').forEach((node,index)=>node.tabIndex=index===focus?0:-1);focusCell();
      });row.append(cell);
    }}
    if(focusedGroup)focusedGroup.children[focusedIndex]?.focus({preventScroll:true});if(focusedGrid)grid.querySelectorAll('button')[focus]?.focus({preventScroll:true});
  }
  function point(event){const viewport=region.getBoundingClientRect();if(event.clientX<viewport.left||event.clientX>=viewport.left+viewport.width||event.clientY<viewport.top||event.clientY>=viewport.top+viewport.height)return null;const rect=surface.getBoundingClientRect(),x=Math.floor((event.clientX-rect.left)*16/rect.width),y=Math.floor((event.clientY-rect.top)*10/rect.height);return x>=0&&x<16&&y>=0&&y<10?{x,y}:null;}
  function stopDrag(){const previous=drag;drag=null;ghost.hidden=true;if(dragFrame){window.cancelAnimationFrame?.(dragFrame);dragFrame=0;}if(previous)grid.releasePointerCapture?.(previous.pointerId);}
  function dragPreview(){const position=point(drag);ghost.hidden=!position;if(!position)return;const x=position.x-drag.offsetX,y=position.y-drag.offsetY;ghost.style.left=x*44+'px';ghost.style.top=y*44+'px';ghost.dataset.valid=String(!controller.moveError(drag.id,x,y,drag.ticket));}
  function scrollDrag(){
    dragFrame=0;if(!drag?.active)return;const rect=region.getBoundingClientRect(),edge=(position,size)=>position<0||position>=size?0:position<30?-8:position>size-30?8:0;
    region.scrollLeft=Math.max(0,Math.min((region.scrollWidth||704)-(region.clientWidth||rect.width),(region.scrollLeft||0)+edge(drag.clientX-rect.left,rect.width)));
    region.scrollTop=Math.max(0,Math.min((region.scrollHeight||440)-(region.clientHeight||rect.height),(region.scrollTop||0)+edge(drag.clientY-rect.top,rect.height)));
    dragPreview();dragFrame=window.requestAnimationFrame(scrollDrag);
  }
  grid.addEventListener('pointerdown',event=>{
    if(event.isPrimary===false||drag||event.button!==0||kind||controller.snapshot().busy)return;
    const layout=controller.snapshot().draft,position=point(event),object=position&&occupied(layout,position.x,position.y);if(!object)return;
    event.preventDefault();choose(object);moving=false;focus=object.y*16+object.x;
    drag={pointerId:event.pointerId,id:object.id,offsetX:position.x-object.x,offsetY:position.y-object.y,startX:event.clientX,startY:event.clientY,clientX:event.clientX,clientY:event.clientY,active:false,ticket:controller.ticket()};
    ghost.replaceChildren();const image=art(object.kind);if(image)ghost.append(image);const size=footprint(object);ghost.style.width=size[0]*44+'px';ghost.style.height=size[1]*44+'px';
    grid.querySelectorAll('button').forEach((cell,index)=>cell.setAttribute('aria-selected',String(occupied(layout,index%16,Math.floor(index/16))?.id===selected)));
    grid.setPointerCapture?.(event.pointerId);
  });
  grid.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!drag.active&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<6)return;
    event.preventDefault();drag.active=true;drag.clientX=event.clientX;drag.clientY=event.clientY;dragPreview();if(!dragFrame)dragFrame=window.requestAnimationFrame(scrollDrag);
  });
  grid.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;const finished=drag,position=point(event);stopDrag();
    if(finished.active){suppressClick=true;window.setTimeout(()=>{suppressClick=false;},0);if(position&&controller.move(finished.id,position.x-finished.offsetX,position.y-finished.offsetY,finished.ticket))focus=(position.y-finished.offsetY)*16+position.x-finished.offsetX;}
    draw();if(finished.active&&!position)note.textContent='격자 밖에 놓아 이동을 취소했어요. 가구는 원래 자리에 있어요.';focusCell();
  });
  grid.addEventListener('pointercancel',event=>{if(drag&&event.pointerId===drag.pointerId){stopDrag();draw();}});grid.addEventListener('lostpointercapture',event=>{if(drag&&event.pointerId===drag.pointerId){stopDrag();draw();}});
  async function load(discard=false){stopDrag();const pending=controller.load({discard});draw();await pending;draw();}
  async function open(){if(modal.open)return true;if(!window.ZEROLobbyUsers?.session())return false;controller.reset();kind=null;selected=null;moving=false;variant=rotation=0;color='ink';draw();modal.showModal();await load();return true;}
  cancel.addEventListener('click',()=>modal.close());modal.addEventListener('cancel',event=>{if(drag||moving||kind){event.preventDefault();stopDrag();moving=false;kind=null;draw();}});modal.addEventListener('close',()=>{stopDrag();controller.reset();selected=null;kind=null;moving=false;draw();});
  retry.addEventListener('click',()=>{const state=controller.snapshot();if(state.dirty&&!window.confirm('저장하지 않은 초안을 버리고 최신 배치를 불러올까요?'))return;moving=false;load(true);});
  save.addEventListener('click',async()=>{stopDrag();const pending=controller.save();draw();await pending;draw();});
  selectTool.addEventListener('click',()=>{stopDrag();kind=null;moving=false;draw();focusCell();});move.addEventListener('click',()=>{stopDrag();kind=null;moving=!moving;draw();focusCell();});
  rotate.addEventListener('click',()=>{stopDrag();if(selected!==null){if(controller.rotate(selected))rotation=controller.snapshot().draft.objects.find(o=>o.id===selected).rotation;}else if(kind)rotation=(rotation+90)%360;draw();});remove.addEventListener('click',()=>{stopDrag();if(controller.remove(selected)){selected=null;moving=false;}draw();});
  previous.addEventListener('click',()=>{palettePage--;draw();});next.addEventListener('click',()=>{palettePage++;draw();});
  document.addEventListener('zero-office-art-ready',()=>{previewPainter.invalidate();if(!modal.open||drag||artFrame)return;artFrame=window.requestAnimationFrame(()=>{artFrame=0;if(modal.open&&!drag)draw();});});
  document.addEventListener('zero-session-changed',()=>{stopDrag();controller.reset();if(modal.open)modal.close();draw();mount();});window.addEventListener('resize',()=>{if(modal.open){stopDrag();draw();}});
  function mount(){
    for(const [id,ownOnly]of [['company-content',false],['lobby-meta',true]]){const host=id==='lobby-meta'?document.querySelector('.lobby-meta'):document.getElementById(id);if(!host)continue;let button=host.querySelector('[data-office-layout-edit]');if(!button){button=make('button','secondary-button office-editor-launch','사무실 꾸미기');button.type='button';button.dataset.officeLayoutEdit='true';button.addEventListener('click',()=>{if(ownOnly&&window.ZEROLobby?.state?.mode!=='own')return;open();});host.append(button);}const hidden=!window.ZEROLobbyUsers?.session()||(ownOnly&&window.ZEROLobby?.state?.mode!=='own');if(button.hidden!==hidden)button.hidden=hidden;}
  }
  window.ZEROOfficeEditor={open};new MutationObserver(mount).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-mode']});mount();
})();
