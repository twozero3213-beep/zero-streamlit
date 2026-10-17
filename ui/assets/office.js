/* Fictional office characters show canonical roles; only recorded jobs show activity. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const chiefs = ['GREENBLATT','THORP','BOGLE','WALL_STREET_CHIEF_ANALYST','QUANT_RESEARCH_CHIEF','GLOBAL_MACRO_CHIEF','PORTFOLIO_CONSTRUCTION_CHIEF','EXECUTION_OPERATIONS_CHIEF','DATA_ENGINEERING_CHIEF','MODEL_VALIDATION_CHIEF'];
  const products = ['UX_UI_CHIEF','INVESTMENT_VISUALIZATION','FRONTEND_ACCESSIBILITY','USABILITY_VALIDATION'];
  const departmentNames = {ZERO_FINAL_MANAGER:'총괄실',GREENBLATT:'가치 리서치',THORP:'위험·검증',BOGLE:'비용·지수투자',WALL_STREET_CHIEF_ANALYST:'기업·전략',QUANT_RESEARCH_CHIEF:'퀀트 연구',GLOBAL_MACRO_CHIEF:'글로벌 거시',PORTFOLIO_CONSTRUCTION_CHIEF:'포트폴리오 구성',EXECUTION_OPERATIONS_CHIEF:'실행·운영',DATA_ENGINEERING_CHIEF:'데이터',MODEL_VALIDATION_CHIEF:'독립 모형 검증',PRODUCT_QUALITY_TEAM:'제품 품질'};
  const types = {NEWS_REVIEW:'뉴스 근거 검토',COMPANY_RESEARCH:'기업 리서치',PORTFOLIO_EXPLANATION:'포트폴리오 설명',UI_REVIEW:'화면 사용성 검토'};
  const statusNames = {QUEUED:'접수 · 실행 대기',RUNNING:'진행 기록 있음',RECORDED:'결과 제출됨',BLOCKED:'보류',FAILED:'실행 실패',ATTENTION_REQUIRED:'진행 확인 필요'};
  const authorities = ['orders_authorized','allocation_changes_authorized','independent_validation_completed','model_training_completed'];
  const publicKeys = 'schema_version scope authority state updated_at revision processing_policy orders_authorized allocation_changes_authorized independent_validation_completed model_training_completed jobs'.split(' ');
  const jobKeys = 'id actor_id job_type status created_at updated_at started_at finished_at result_summary evidence_count error_code'.split(' ');
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
  const stamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  const clockLabel = value => stamp(value) ? new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) + ' KST' : '기록 시각 미확인';
  const text = (value, limit = 4000) => typeof value === 'string' && value.length <= limit ? value : '';
  const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
  const node = (tag, className = '', content) => { const element = document.createElement(tag); element.className = className; if (content !== undefined) element.textContent = content; return element; };
  let rosterSource = null, actors = [], queue = null, selected = null, selectedDepartment = 'ALL', requestEpoch = 0, loadPromise = null, pending = null, submitting = false;
  const actorButtons = new Map(), rooms = new Map(), clicks = new Map();

  function parseActors(team) {
    if (!team || !exact(team.roles, chiefs) || team.operating_policy?.manager?.id !== 'ZERO_FINAL_MANAGER') throw Error('ROSTER');
    const policy = team.operating_policy, list = [];
    const add = (raw, department, kind, principle, alternative) => {
      if (!raw || typeof raw.id !== 'string' || !text(raw.name,240) || list.some(actor => actor.id === raw.id)) throw Error('ROSTER');
      const affiliations = (Array.isArray(team.company_policy?.teams) ? team.company_policy.teams : []).filter(group => group.staff_ids?.includes(raw.id) || group.owners?.includes(raw.id)).map(group => text(group.name,120)).filter(Boolean);
      list.push({id:raw.id,name:raw.name,department,kind,principles:[text(principle),text(alternative), '근거가 없으면 미확인으로 남기고, 제출 결과와 독립 검증을 구분합니다.'].filter(Boolean),affiliations});
    };
    add(policy.manager,'ZERO_FINAL_MANAGER','총괄',policy.manager.instruction,policy.manager.outputs?.[0]);
    for (const id of chiefs) {
      const role = team.roles[id];
      add({...role,id},id,'수석 자문',role.mandate,role.requires?.[0]);
      if (!Array.isArray(role.support_staff)) throw Error('ROSTER');
      for (const staff of role.support_staff) {
        if (staff.owner !== id) throw Error('ROSTER');
        add(staff,id,'실무',staff.work_order?.instruction || staff.mandate,staff.missing_evidence?.[0]);
      }
    }
    if (!Array.isArray(policy.product_staff) || policy.product_staff.length !== products.length) throw Error('ROSTER');
    policy.product_staff.forEach((staff,index) => {
      if (staff.id !== products[index]) throw Error('ROSTER');
      add(staff,'PRODUCT_QUALITY_TEAM','제품 품질',staff.instruction,staff.outputs?.[0]);
    });
    if (list.length < 38) throw Error('ROSTER');
    rosterSource=team;
    return list;
  }

  function validateView(data) {
    if (!exact(data,publicKeys) || data.schema_version !== 1 || data.scope !== 'VIRTUAL_OFFICE_QUEUE'
        || data.authority !== 'RESEARCH_REQUESTS_ONLY' || authorities.some(key => data[key] !== false)
        || !['DAILY_0900_KST_AFTER_BRIEFING','HOURLY_RESEARCH_QUEUE'].includes(data.processing_policy)
        || !['EMPTY','AVAILABLE','UNCONFIGURED','UNAVAILABLE'].includes(data.state) || !Array.isArray(data.jobs) || data.jobs.length > 128) throw Error('QUEUE');
    if (['UNCONFIGURED','UNAVAILABLE'].includes(data.state)) {
      if (data.jobs.length || data.revision !== null || data.updated_at !== null) throw Error('QUEUE');
    } else if (!stamp(data.updated_at) || Date.parse(data.updated_at) > Date.now() + 1000 || !Number.isInteger(data.revision) || data.revision < data.jobs.length || data.revision > 1000000 || (data.state === 'EMPTY') !== (data.jobs.length === 0)) throw Error('QUEUE');
    const ids = new Set();
    for (const job of data.jobs) {
      if (!exact(job,jobKeys) || !uuid(job.id) || ids.has(job.id) || !actors.some(actor => actor.id === job.actor_id)
          || !Object.hasOwn(types,job.job_type) || !Object.hasOwn(statusNames,job.status)
          || !stamp(job.created_at) || !stamp(job.updated_at) || Date.parse(job.created_at) > Date.parse(job.updated_at)
          || Date.parse(job.updated_at) > Date.parse(data.updated_at) || !Number.isInteger(job.evidence_count) || job.evidence_count < 0 || job.evidence_count > 12
          || (job.result_summary !== null && (!text(job.result_summary,1600) || /[\x00-\x1f\x7f]/.test(job.result_summary)))
          || (job.error_code !== null && (typeof job.error_code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(job.error_code)))) throw Error('QUEUE');
      if (job.status === 'QUEUED' && (job.started_at !== null || job.finished_at !== null || job.result_summary !== null || job.evidence_count !== 0 || job.error_code !== null)) throw Error('QUEUE');
      if (job.status !== 'QUEUED' && (!stamp(job.started_at) || Date.parse(job.started_at) < Date.parse(job.created_at) || Date.parse(job.started_at) > Date.parse(job.updated_at))) throw Error('QUEUE');
      if (['RUNNING','ATTENTION_REQUIRED'].includes(job.status) && (job.finished_at !== null || job.result_summary !== null || job.evidence_count !== 0 || job.error_code !== null)) throw Error('QUEUE');
      if (['RECORDED','BLOCKED','FAILED'].includes(job.status) && (!stamp(job.finished_at) || Date.parse(job.finished_at) !== Date.parse(job.updated_at) || !job.result_summary || job.status === 'RECORDED' && (job.evidence_count < 1 || job.error_code !== null) || job.status !== 'RECORDED' && job.error_code === null)) throw Error('QUEUE');
      ids.add(job.id);
    }
    return data;
  }

  const SVG_NS='http://www.w3.org/2000/svg';
  let WORLD_WIDTH=0,WORLD_HEIGHT=0,floorKey='',floorRooms=[],meetingRoom=null,chairpersonRoom=null;
  const sceneActors=new Map(),directoryMembers=new Map(),motionAnimations=new Set();
  const shirtColors=['#245f8d','#428f88','#bd8252','#626b8f','#a15f6a','#596f80','#537e67','#6c8f99','#9b8057','#5875a0','#855f8b','#346b76'];
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let motionPaused=false,sceneInView=true,zoom=1,world=null,fit=null,meetingTimer=null,meetingTask=null,meetingDue=0,meetingRemaining=0,meetingIndex=0,meetingRecordsOnly=false,meetingPhase='REPORT';
  const excerpt=(value,limit=260)=>value.length>limit?value.slice(0,limit-1)+'…':value;
  const isLeader=actor=>actor.id==='ZERO_FINAL_MANAGER'||chiefs.includes(actor.id)||actor.id==='UX_UI_CHIEF';
  const svgNode=(tag,attributes={},content)=>{const element=document.createElementNS(SVG_NS,tag);for(const [key,value]of Object.entries(attributes))element.setAttribute(key,value);if(content!==undefined)element.textContent=content;return element;};
  const rect=(parent,x,y,width,height,fill,attributes={})=>{const element=svgNode('rect',{x,y,width,height,fill,...attributes});parent.append(element);return element;};
  const polygon=(parent,points,fill,stroke='#0000')=>{const element=svgNode('polygon',{points:points.map(p=>p.x+','+p.y).join(' '),fill,stroke,'stroke-width':1});parent.append(element);return element;};
  const line=(parent,x1,y1,x2,y2,stroke,width=1)=>parent.append(svgNode('line',{x1,y1,x2,y2,stroke,'stroke-width':width}));
  function floorGeometry(width,height){
    const gap=32,roomHeight=300,ratio=Math.max(1,width-8)/Math.max(1,height-24),columns=ratio>=1.35?6:3,wingRows=Math.ceil(6/columns),rows=wingRows*2+1;
    const roomWidth=Math.round(Math.max(300,Math.min(680,(ratio*(rows*(roomHeight+gap)+80)-(columns+1)*gap)/columns))/8)*8;
    return {gap,roomHeight,roomWidth,columns,wingRows,rows,key:columns+':'+roomWidth};
  }
  function layoutFloor(width,height){
    const geometry=floorGeometry(width,height),{gap,roomHeight,roomWidth,columns,wingRows,rows}=geometry;
    floorKey=geometry.key;WORLD_WIDTH=columns*(roomWidth+gap)+gap;WORLD_HEIGHT=rows*(roomHeight+gap)+80;
    const flow=['ZERO_FINAL_MANAGER','DATA_ENGINEERING_CHIEF','GREENBLATT','WALL_STREET_CHIEF_ANALYST','QUANT_RESEARCH_CHIEF','GLOBAL_MACRO_CHIEF','THORP','MODEL_VALIDATION_CHIEF','PORTFOLIO_CONSTRUCTION_CHIEF','BOGLE','EXECUTION_OPERATIONS_CHIEF','PRODUCT_QUALITY_TEAM'];
    floorRooms=flow.map((id,index)=>({id,x:gap+(index%6%columns)*(roomWidth+gap),y:80+(Math.floor(index%6/columns)+(index<6?0:wingRows+1))*(roomHeight+gap),width:roomWidth,height:roomHeight,door:'left'}));
    meetingRoom={id:'MEETING',x:gap,y:80+wingRows*(roomHeight+gap),width:(columns-1)*(roomWidth+gap)-gap,height:roomHeight,door:'left'};
    chairpersonRoom={id:'CHAIRPERSON',x:gap+(columns-1)*(roomWidth+gap),y:meetingRoom.y,width:roomWidth,height:roomHeight,door:'left'};
  }
  function roomLayout(list=actors){
    if(!floorKey)layoutFloor(1400,720);
    return floorRooms;
  }
  function seatLayout(list=actors){
    const layouts=roomLayout(list),used=new Map();let leader=0;
    return list.map(actor=>{
      if(isLeader(actor)){const index=leader++,x=meetingRoom.x+90+(index%6)*(meetingRoom.width-180)/5,y=meetingRoom.y+(index<6?112:276);return {id:actor.id,room:'MEETING',x,y};}
      const room=layouts.find(item=>item.id===actor.department),index=used.get(room.id)||0;used.set(room.id,index+1);
      const columns=list.filter(member=>member.department===room.id&&!isLeader(member)).length>4?3:2;
      return {id:actor.id,room:room.id,x:room.x+70+(index%columns)*(room.width-140)/(columns-1),y:room.y+180+Math.floor(index/columns)*95};
    });
  }
  function roomDoor(room){return {x:room.x,y:room.y+(room.id==='CHAIRPERSON'?224:120)};}
  // Every journey shares the same door, clear room lane and outer corridor.
  function officeExitRoute(room,point){
    const door=roomDoor(room),laneX=room.x+16,outsideX=room.x-12;
    return [point,{x:laneX,y:point.y},{x:laneX,y:door.y},door,{x:outsideX,y:door.y},{x:outsideX,y:room.y-8},{x:20,y:room.y-8}];
  }
  function officeVisitRoute(from,point,to,destination){
    return [...officeExitRoute(from,point),{x:20,y:to.y-8},...officeExitRoute(to,destination).reverse()];
  }
  // Illustrated commutes never create a job or a meeting decision.
  function officeMeetingRoute(record){
    const room=roomLayout().find(item=>item.id===record.actor.department);
    return officeVisitRoute(meetingRoom,record.point,room,{x:room.x+80,y:room.y+120});
  }
  function officeRouteFrames(route,origin,start,end){
    const lengths=route.map((point,index)=>index?Math.hypot(point.x-route[index-1].x,point.y-route[index-1].y):0),total=lengths.reduce((a,b)=>a+b,0);let distance=0;
    return route.map((point,index)=>{distance+=lengths[index];return {offset:start+(end-start)*(total?distance/total:0),transform:'translate('+(point.x-origin.x)+'px, '+(point.y-origin.y)+'px)'};});
  }
  function drawPlant(parent,x,y){
    rect(parent,x-10,y-4,20,18,'#b79570',{rx:3});
    for(const [dx,dy,angle]of [[-7,-17,-36],[7,-22,36],[-3,-31,-18],[5,-37,23]])parent.append(svgNode('ellipse',{cx:x+dx,cy:y+dy,rx:7,ry:14,fill:dy%2?'#518776':'#6f9a80',transform:'rotate('+angle+' '+(x+dx)+' '+(y+dy)+')'}));
  }
  function drawDesk(parent,seat,actor,reserved=false){
    const x=seat.x-35,y=seat.y-25;
    rect(parent,x+5,y+14,64,10,'#a48d6b',{rx:2});rect(parent,x+6,y+22,4,12,'#748384');rect(parent,x+60,y+22,4,12,'#748384');
    polygon(parent,[{x,y},{x:x+70,y},{x:x+78,y:y+12},{x:x+8,y:y+12}],reserved?'#cebfa4':'#e6dac0','#b6a88f');
    polygon(parent,[{x:x+8,y:y+12},{x:x+78,y:y+12},{x:x+78,y:y+18},{x:x+8,y:y+18}],'#bbaa8c');
    const monitor=svgNode('g',{'class':'office-screen','data-office-screen':reserved?'reserved-'+actor.id:actor.id});
    rect(monitor,x+22,y-23,30,22,'#264857',{rx:2});rect(monitor,x+25,y-20,24,16,reserved?'#789390':'#a1d2ce',{rx:1});
    line(monitor,x+29,y-15,x+43,y-15,'#e5f6e9',2);line(monitor,x+29,y-11,x+39,y-11,'#e5f6e9',2);monitor.append(svgNode('circle',{cx:x+47,cy:y-6,r:2,'class':'office-screen-light',fill:'#547981'}));parent.append(monitor);
    rect(parent,x+30,y+2,24,4,'#93a7a6',{rx:1});rect(parent,x+11,y-1,6,8,'#faf5e5',{rx:1});
    rect(parent,seat.x-14,seat.y-7,28,20,reserved?'#8f9990':'#477c87',{rx:5});rect(parent,seat.x-17,seat.y-4,5,16,'#345c6b',{rx:2});rect(parent,seat.x+12,seat.y-4,5,16,'#345c6b',{rx:2});
  }
  function drawRoom(svg,room){
    const layer=svgNode('g',{'class':'office-department-room','data-office-room':room.id}),{x,y,width,height}=room;
    rect(layer,x+8,y+10,width,height,'#19394b',{rx:7,opacity:.18});
    rect(layer,x,y,width,height,'#f0e8d6',{'class':'office-room-floor',rx:5,stroke:'#587b86','stroke-width':3});
    for(let tile=40;tile<width;tile+=40)line(layer,x+tile,y+5,x+tile,y+height-5,'#e2d7c2',.7);
    for(let tile=40;tile<height;tile+=40)line(layer,x+5,y+tile,x+width-5,y+tile,'#e2d7c2',.7);
    polygon(layer,[{x,y},{x:x+width,y},{x:x+width+8,y:y+8},{x:x+8,y:y+8}],'#7c9aa2');
    rect(layer,x,y,8,height,'#94adb1');rect(layer,x+width-8,y,8,height,'#577b87');
    const doorSize=64;
    if(room.door==='top'||room.door==='bottom'){const dy=room.door==='top'?y:y+height-4;rect(layer,x+width/2-doorSize/2,dy,doorSize,8,'#d3e0d9');line(layer,x+width/2-doorSize/2,dy,x+width/2-doorSize/2,dy+(room.door==='top'?32:-32),'#69908f',2);}
    else{const dx=room.door==='left'?x:x+width-8,dy=roomDoor(room).y-doorSize/2;rect(layer,dx,dy,8,doorSize,'#d3e0d9');line(layer,dx,dy,dx+(room.door==='left'?32:-32),dy,'#69908f',2);}
    rect(layer,x+width-165,y+85,52,36,'#b89568',{rx:3});rect(layer,x+width-160,y+90,42,26,'#dce8d7');line(layer,x+width-156,y+111,x+width-124,y+98,'#699d8a',3);
    rect(layer,x+30,y+88,76,12,'#b99d7b',{rx:2});for(let book=0;book<5;book++)rect(layer,x+34+book*13,y+70,9,18,shirtColors[(book+Math.floor(x/600))%shirtColors.length]);
    const inbox=svgNode('g',{'class':'office-room-inbox','data-office-inbox':room.id,visibility:'hidden'});rect(inbox,x+width-130,y+height-72,100,42,'#fff9e9',{rx:5,stroke:'#aac0b4'});inbox.append(svgNode('text',{x:x+width-80,y:y+height-46,'class':'office-room-inbox-count','text-anchor':'middle',fill:'#345f69','font-size':14},'접수 기록'));layer.append(inbox);
    layer.append(svgNode('text',{x:x+20,y:y+25,'class':'office-room-title',fill:'#284e61','font-weight':750,'font-size':20},departmentNames[room.id]||'휴게실'));
    if(room.id==='LOUNGE'){
      rect(layer,x+50,y+120,210,62,'#b79878',{rx:12});rect(layer,x+50,y+120,210,16,'#97775d',{rx:8});
      rect(layer,x+115,y+210,72,35,'#d6b991',{rx:7});drawPlant(layer,x+width-35,y+height-35);
      layer.append(svgNode('text',{x:x+20,y:y+49,fill:'#64786f','font-size':13},'업무 공간과 구분된 휴식 공간'));svg.append(layer);rooms.set(room.id,layer);return;
    }
    const members=actors.filter(actor=>actor.department===room.id),owner=members.find(isLeader),staff=members.filter(actor=>!isLeader(actor));
    layer.append(svgNode('text',{x:x+20,y:y+44,'class':'office-room-description',fill:'#54717a','font-size':12},excerpt((owner||members[0])?.principles[0]||'확인된 직무의 근거와 결과를 검토합니다.',29)));
    layer.append(svgNode('text',{x:x+20,y:y+62,'class':'office-room-headcount',fill:'#476b70','font-size':12},'팀 '+members.length+'명 · 방 '+staff.length+'명 · 정원 미정'));
    layer.append(svgNode('text',{x:x+width-12,y:y+height-9,'class':'office-room-reservation',fill:'#657870','font-size':11,'text-anchor':'end'},owner?'팀장 '+excerpt(owner.name,18)+' · 중앙 회의석':'제품 품질 4개 직무'));
    if(owner){const reserved={x:x+width-36,y:y+73};rect(layer,reserved.x-10,reserved.y-6,20,14,'#bdc4b7',{rx:3});line(layer,reserved.x-10,reserved.y+10,reserved.x+10,reserved.y+10,'#9dafa7',2);}
    if(!staff.length){drawDesk(layer,{x:x+200,y:y+150},owner||members[0],true);layer.append(svgNode('text',{x:x+200,y:y+208,fill:'#64786f','font-size':14,'text-anchor':'middle'},'총괄은 중앙 회의석에서 협의합니다'));drawPlant(layer,x+55,y+height-45);}
    else{drawPlant(layer,x+width-23,y+height-24);if(owner){drawDesk(layer,{x:x+width-80,y:y+90},owner,true);}}
    svg.append(layer);rooms.set(room.id,layer);
  }
  function drawOffice(svg){
    rect(svg,4,4,WORLD_WIDTH-8,WORLD_HEIGHT-8,'#d0d9cc',{rx:12,stroke:'#64838a','stroke-width':2});
    for(let x=32;x<WORLD_WIDTH;x+=40)line(svg,x,8,x,WORLD_HEIGHT-8,'#bdc9bd',.7);
    for(let y=32;y<WORLD_HEIGHT;y+=40)line(svg,8,y,WORLD_WIDTH-8,y,'#bdc9bd',.7);
    roomLayout().forEach(room=>drawRoom(svg,room));
    const {x,y,width,height}=meetingRoom,hall=svgNode('g',{'class':'office-conference','data-office-room':'MEETING'});
    rect(hall,x,y,width,height,'#deebe5',{rx:6,stroke:'#568b96','stroke-width':3});
    hall.append(svgNode('text',{x:x+width/2,y:y+32,'class':'office-central-title','text-anchor':'middle',fill:'#285569','font-size':24,'font-weight':750},'ZERO 중앙 회의실'));
    hall.append(svgNode('text',{x:x+width/2,y:y+55,'class':'office-room-description','text-anchor':'middle',fill:'#456a70','font-size':13},'총괄 + 11개 팀장 · 회의 연출'));
    rect(hall,x+70,y+150,width-140,52,'#cfb58c',{rx:24,stroke:'#b89e75','stroke-width':2});
    rect(hall,x+78,y+154,width-156,40,'#e9d8b5',{rx:18});
    hall.append(svgNode('text',{x:x+width/2,y:y+180,'text-anchor':'middle',fill:'#705b3d','font-size':18,'font-weight':750},'ZERO'));
    rect(hall,x-4,roomDoor(meetingRoom).y-32,8,64,'#d0d9cc');
    drawPlant(hall,x+width-24,y+60);svg.append(hall);rooms.set('MEETING',hall);
  }

  function figure(actor,index,point){
    const outer=svgNode('g',{'class':'office-figure',transform:'translate('+point.x+' '+point.y+')','data-office-figure':actor.id}),travel=svgNode('g',{'class':'office-travel'}),person=svgNode('g',{'class':'office-person',transform:'scale(1)'});
    outer.append(travel);travel.append(svgNode('ellipse',{cx:0,cy:1,rx:13,ry:4,fill:'#213f44',opacity:.16}),person);
    // Canonical IDs keep portraits stable across scene/board ordering and queue updates.
    const identityIndex=actors.map(member=>member.id).sort().indexOf(actor.id);
    if(identityIndex>=0)index=identityIndex;
    const skin=['#e5b086','#ba7d5d','#eec7a6','#d49c74','#ac7256','#f0d4b6','#935c43','#efba96'][index%8],hair=['#383634','#b2aba0','#795542','#252f35','#c79265','#5a2f2a','#e3ddd0'][Math.floor(index/8)%7],shirt=actor.id==='OFFICE_OWNER'?'#234d84':shirtColors[Math.floor(index/5)%shirtColors.length],trim=actor.id==='OFFICE_OWNER'?'#edc45c':'#ebefe9',ink='#303a3e';
    outer.setAttribute('data-office-face',skin+':'+hair);
    const pixel=(x,y,width,height,fill,group=person)=>group.append(svgNode('rect',{x,y,width,height,fill}));
    const path=(group,d,stroke=ink,fill='none')=>group.append(svgNode('path',{d,stroke,fill,'stroke-width':1.5,'stroke-linecap':'round','stroke-linejoin':'round'}));
    pixel(-10,-15,8,12,'#364651');pixel(2,-15,8,12,'#364651');pixel(-12,-5,10,5,'#253341');pixel(2,-5,11,5,'#253341');
    const outfit=svgNode('g',{'class':'office-outfit'}),style=index%5;
    outer.setAttribute('data-office-outfit',['suit','cardigan','vest','hoodie','striped-shirt'][style]);person.append(outfit);
    pixel(-12,-34,24,20,shirt,outfit);pixel(-15,-32,5,14,style===2?trim:shirt,outfit);pixel(10,-32,5,14,style===2?trim:shirt,outfit);
    if(style===0){
      path(outfit,'M -5 -34 L 0 -24 L 5 -34',trim,trim);
      path(outfit,'M -8 -34 L -4 -24 L -8 -20 M 8 -34 L 4 -24 L 8 -20','#172f40');
      path(outfit,'M 0 -30 L -2 -27 L 0 -18 L 2 -27 Z',hair,hair);
      pixel(6,-25,4,2,trim,outfit);
    }else if(style===1){
      pixel(-3,-34,6,20,trim,outfit);path(outfit,'M -6 -34 L -3 -26 M 6 -34 L 3 -26',hair);
      for(const y of [-25,-21,-17])pixel(4,y,2,2,trim,outfit);
    }else if(style===2){
      path(outfit,'M -7 -34 L 0 -23 L 7 -34',trim,trim);
      pixel(-1,-30,2,7,hair,outfit);path(outfit,'M 0 -22 L 0 -15',hair);
      pixel(-9,-20,5,1,trim,outfit);pixel(4,-20,5,1,trim,outfit);
    }else if(style===3){
      path(outfit,'M -11 -31 Q -13 -39 0 -39 Q 13 -39 11 -31 L 5 -33 Q 0 -29 -5 -33 Z',hair,shirt);
      path(outfit,'M -4 -32 L -4 -26 M 4 -32 L 4 -26',trim);
      path(outfit,'M -7 -21 L -5 -24 L 5 -24 L 7 -21 L 7 -17 L -7 -17 Z',trim);
    }else{
      for(const y of [-30,-25,-20])pixel(-11,y,22,2,trim,outfit);
      path(outfit,'M -5 -34 Q 0 -27 5 -34',hair);
    }
    pixel(-14,-21,5,5,skin);pixel(10,-21,5,5,skin);
    pixel(-4,-37,8,7,skin);pixel(-10,-51,20,17,skin);pixel(-12,-47,3,8,skin);pixel(9,-47,3,8,skin);
    pixel(-10,-54,20,5,hair);
    if(index%4===0){pixel(-11,-50,4,9,hair);pixel(7,-50,4,9,hair);}
    else if(index%4===1){path(person,'M -10 -49 L -5 -54 L 9 -50 L 4 -47 Z',hair,hair);}
    else if(index%4===2){pixel(-11,-51,5,8,hair);pixel(-6,-50,8,3,hair);}
    else{pixel(7,-51,4,10,hair);pixel(-10,-52,6,5,hair);}
    const eyes=svgNode('g',{'class':'office-eyes'});person.append(eyes);
    const eyePaths=['M -7 -44 h 3 M 4 -44 h 3','M -7 -43 Q -5 -47 -3 -43 M 3 -43 Q 5 -47 7 -43','M -7 -46 L -3 -44 M 3 -44 L 7 -46','M -7 -44 h 3 M 3 -46 v 3','M -7 -45 L -3 -43 M 3 -43 L 7 -45'];
    path(eyes,eyePaths[index%5]);
    const mouth=svgNode('g',{'class':'office-mouth'});person.append(mouth);
    const mouthPaths=['M -3 -38 h 6','M -3 -39 Q 0 -35 3 -39','M -3 -38 Q 0 -40 3 -38','M -3 -38 L 1 -38 L 3 -40','M -2 -39 Q 0 -36 2 -39 Z','M -4 -39 Q 0 -34 4 -39 Z','M -3 -37 L 0 -39 L 3 -37','M -2 -39 L 2 -39 L 2 -37 L -2 -37 Z','M -4 -38 Q -1 -36 1 -38 L 4 -38'];
    path(mouth,mouthPaths[Math.floor(index/5)%9],'#754633');
    if(index%7===0){path(person,'M -8 -46 h 7 v 5 h -7 Z M 1 -46 h 7 v 5 h -7 Z M -1 -44 h 2','#374958');}
    const hands=svgNode('g',{'class':'office-typing-hands'});person.append(hands);pixel(-16,-24,6,4,skin,hands);pixel(11,-24,6,4,skin,hands);
    return {outer,travel};
  }

  const officeOwner={id:'OFFICE_OWNER',name:'ZERO',department:'CHAIRPERSON',kind:'의장'};
  let ownerScene=null,ownerEncounter=null,chatTurn=0,socialClock=0;
  function sanitizeKoreanEnglish(text) {
    if (typeof text !== 'string') return '';
    let cleaned = text.replace(/[^\uAC00-\uD7A3\u3131-\u3163\u1100-\u11FFA-Za-z0-9\s.,!?'"~:;\(\)\[\]\/\-–—+%·\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/gu, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    if (!/[가-힣A-Za-z]/.test(cleaned)) return '';
    return cleaned;
  }
  const teamChatRecent=[],teamChatCache=new Map(),encounterCooldown=new Map();
  // Social visits stay outside the canonical roster, meeting reports and job assignees.
  function ownerTour(){
    const home={x:chairpersonRoom.x+chairpersonRoom.width/2,y:chairpersonRoom.y+264},route=[home,{...home,room:'CHAIRPERSON',pause:6500}],stops=[];
    let previous=chairpersonRoom,point=home;
    for(const room of [meetingRoom,...roomLayout(),chairpersonRoom]){
      let destination=room.id==='CHAIRPERSON'?home:room.id==='MEETING'?{x:room.x+80,y:room.y+120}:{x:room.x+room.width-70,y:room.y+240};
      route.push(...officeVisitRoute(previous,point,room,destination));
      if(room.id==='MEETING'){route.push({x:room.x+room.width-28,y:destination.y},{x:room.x+room.width-28,y:room.y+266},{x:room.x+80,y:room.y+266});destination=route.at(-1);}
      if(room.id!=='CHAIRPERSON')route.push({...destination,room:room.id,pause:6500});
      previous=room;point=destination;
    }
    let elapsed=0;const frames=[{time:0,transform:'translate(0px, 0px)'}];
    route.forEach((point,index)=>{
      const previous=route[Math.max(0,index-1)];elapsed+=Math.hypot(point.x-previous.x,point.y-previous.y)/160*1000;
      const transform='translate('+(point.x-home.x)+'px, '+(point.y-home.y)+'px)';frames.push({time:elapsed,transform});
      if(point.pause){const start=elapsed;elapsed+=point.pause;stops.push({room:point.room,start,end:elapsed});frames.push({time:elapsed,transform});}
    });
    return {duration:elapsed,frames:frames.map(({time,transform})=>({offset:time/elapsed,transform})),stops,home};
  }
  function drawChairperson(svg){
    const {x,y,width,height}=chairpersonRoom,layer=svgNode('g',{'class':'office-chairperson-room','data-office-room':'CHAIRPERSON'});
    rect(layer,x,y,width,height,'#e6edf2',{rx:8,stroke:'#71899c','stroke-width':3});
    rect(layer,x+10,y+10,width-20,52,'#f8fbff',{rx:5});
    layer.append(svgNode('text',{x:x+20,y:y+36,fill:'#264d72','font-size':24,'font-weight':800},'ZERO 의장실'));
    layer.append(svgNode('text',{x:x+20,y:y+58,fill:'#49667b','font-size':13},'의장 ZERO · 직원 직무와 별도'));
    rect(layer,x+26,y+84,130,64,'#b5936a',{rx:8});rect(layer,x+38,y+90,106,44,'#eadcc7',{rx:4});
    rect(layer,x+48,y+99,42,26,'#466d89',{rx:3});rect(layer,x+103,y+104,26,18,'#faf8ef');
    rect(layer,x+width-100,y+90,70,94,'#83a6b7',{rx:10});rect(layer,x+width-94,y+98,58,26,'#aec5cf',{rx:5});
    rect(layer,x-4,roomDoor(chairpersonRoom).y-32,8,64,'#d3e0d9');
    drawPlant(layer,x+36,y+height-32);drawPlant(layer,x+width-30,y+76);
    svg.append(layer);rooms.set('CHAIRPERSON',layer);
  }
  function renderOwner(svg,hotspots){
    const tour=ownerTour(),person=figure(officeOwner,45,tour.home),button=node('button','office-owner');
    person.outer.removeAttribute('data-office-figure');person.outer.setAttribute('class','office-owner-figure');person.outer.setAttribute('data-office-owner-figure','ZERO');
    const badge=svgNode('path',{d:'M -5 -29 L 5 -29 L 5 -24 L -5 -24 Z',fill:'#edc45c'});person.outer.querySelector('.office-person').append(badge);
    button.type='button';button.dataset.officeOwner='ZERO';button.dataset.owner='ZERO';button.style.left=(tour.home.x-90)+'px';button.style.top=(tour.home.y-76)+'px';
    const bubble=node('span','office-actor-bubble'),duty=node('span','office-actor-duty','다들 수고 많아요. 잠깐 쉬어 가요.'),label=node('span','office-actor-label');
    bubble.append(duty);label.append(node('span','office-actor-name','ZERO'),node('span','office-actor-role','의장 · 일상 순회'));
    button.append(bubble,label);button.setAttribute('aria-label','ZERO 의장 · 의장실과 일상 순회 보기');
    button.addEventListener('click',()=>{selectedDepartment='CHAIRPERSON';$('office-department').value=selectedDepartment;filterDepartment();});
    svg.append(person.outer);hotspots.append(button);ownerScene={button,figure:person.outer,travel:person.travel,bubble,duty,tour,animations:[]};
  }
  function updateOwnerSpeech(){
    if(!ownerScene)return;const record=ownerScene,time=(record.animation?.currentTime||0)%record.tour.duration;
    const stop=record.tour.stops.find(stop=>time>=stop.start&&time<=stop.end);
    const lines=['다들 수고 많아요. 잠깐 쉬어 가요.','커피 한잔할까요? 오늘 점심은 어땠어요?','서로 도와가며 천천히 해봐요.','좋은 하루 보내요. 물도 한잔 챙겨요.'];
    record.duty.textContent=ownerEncounter?ownerEncounter.lines[ownerEncounter.remaining>3500?0:1][0]:stop?.room==='CHAIRPERSON'?'잠깐 쉬었다가 팀에 인사하러 갈게요.':lines[Math.max(0,record.tour.stops.indexOf(stop))%lines.length];
    record.bubble.hidden=meetingRecordsOnly||(!stop&&!ownerEncounter);
    record.button.setAttribute('aria-label','ZERO 의장 · '+(stop?.room==='MEETING'?'중앙 회의실':stop?.room==='CHAIRPERSON'?'ZERO 의장실':departmentNames[stop?.room]||'팀 사이 이동')+' · 일상 순회 연출');
  }
  function releaseEncounter(){
    if(!ownerEncounter)return;
    const pair=[ownerScene,ownerEncounter.record];ownerEncounter=null;
    for(const record of pair){record.figure.classList.remove('is-chatting');record.button.classList.remove('is-chatting');if(motionAllowed())for(const animation of record.animations)animation.play();}
    fitScene();
  }
  function updateEncounters(delta){
    if(!motionAllowed()||!ownerScene||meetingRecordsOnly)return;
    socialClock+=delta;
    if(ownerEncounter){
      const firstHalf=ownerEncounter.remaining>3500;ownerEncounter.remaining-=delta;
      if(ownerEncounter.remaining<=0){releaseEncounter();updateSceneVisibility(true);}
      else if(firstHalf!==(ownerEncounter.remaining>3500))updateSceneVisibility(true);
      return;
    }
    updateOwnerSpeech();
    const position=record=>{const box=record.figure.getBoundingClientRect();return {x:box.left+box.width/2,y:box.bottom};};
    const owner=position(ownerScene),range=84*world.getBoundingClientRect().width/WORLD_WIDTH;
    const nearby=[...sceneActors.values()].filter(record=>!latestJob(record.actor)&&socialClock-(encounterCooldown.get(record.actor.id)??-Infinity)>90000)
      .map(record=>{const point=position(record);return {record,distance:Math.hypot(point.x-owner.x,point.y-owner.y)};}).filter(item=>item.distance<range).sort((a,b)=>a.distance-b.distance)[0]?.record;
    if(!nearby)return;
    const encouragement={
      ZERO_FINAL_MANAGER:'여러 팀 의견을 챙기느라 고생이 많아요. 혼자 다 짊어지지 마세요.',
      GREENBLATT:'가치와 재무 근거를 꼼꼼히 살피는 일이 쉽지 않죠. 서두르지 않아도 괜찮아요.',
      THORP:'위험과 손실 한도를 살피느라 긴장되죠. 잠깐 어깨도 풀어 주세요.',
      BOGLE:'작은 비용과 세금까지 챙기는 그 꼼꼼함을 응원해요.',
      WALL_STREET_CHIEF_ANALYST:'기업과 산업을 넓게 보느라 애쓰고 있어요. 다른 관점도 함께 나눠 봐요.',
      QUANT_RESEARCH_CHIEF:'퀀트 실험은 뜻대로 안 될 때도 있죠. 하나씩 확인하며 가요.',
      GLOBAL_MACRO_CHIEF:'거시 흐름은 변수가 참 많죠. 쉬어 가며 차근차근 살펴봐요.',
      PORTFOLIO_CONSTRUCTION_CHIEF:'여러 자산의 균형을 고민하느라 고생이 많아요. 같이 생각해 봐요.',
      EXECUTION_OPERATIONS_CHIEF:'원장과 운영 절차를 꼼꼼히 살피느라 애쓰고 있어요. 무리하지 마세요.',
      DATA_ENGINEERING_CHIEF:'자료의 날짜와 출처를 챙기는 일, 손이 많이 가죠. 천천히 확인해요.',
      MODEL_VALIDATION_CHIEF:'모형을 다시 의심하고 검증하는 일도 소중해요. 편하게 의견 주세요.',
      PRODUCT_QUALITY_TEAM:'작은 불편까지 살피느라 고생이 많아요. 이용자 관점에서 함께 고민해요.'
    };
    ownerEncounter={record:nearby,remaining:7000,lines:[[encouragement[nearby.actor.department]||'오늘도 무리하지 말고 차근차근 해요.','고마워요, ZERO. 막히는 부분은 팀과 함께 이야기해 볼게요.'],['잠깐 물 한잔 챙겨요. 다음에 또 이야기해요.','좋아요. ZERO도 쉬어 가면서 다녀요!']]};
    encounterCooldown.set(nearby.actor.id,socialClock);
    for(const record of [ownerScene,nearby]){for(const animation of record.animations)animation.pause();record.figure.classList.add('is-chatting');record.button.classList.add('is-chatting');}
    updateSceneVisibility(true);
    fitChatter();
  }
  function fitChatter(){
    if(!world||meetingRecordsOnly||!sceneVisible())return;
    const map=$('office-map').getBoundingClientRect(),scale=world.getBoundingClientRect().width/WORLD_WIDTH,placements=[];
    const occupied=[],speakers=[ownerScene,ownerEncounter?.record,...sceneActors.values()];let crowded=false;
    for(const record of new Set(speakers)){
      if(!record||record.button.classList.contains('is-muted')||(record===ownerScene?record.bubble.hidden:!record.button.classList.contains('show-bubble')&&!record.button.classList.contains('is-speaking')))continue;
      const actor=record.button.getBoundingClientRect(),bubble=record.bubble.getBoundingClientRect();
      const preferredX=Math.max(map.left+4,Math.min(actor.left+90*scale-bubble.width/2,map.right-bubble.width-4));
      const preferredY=Math.max(map.top+4,Math.min(record===ownerEncounter?.record?actor.top+170*scale:actor.top+18*scale-bubble.height,map.bottom-bubble.height-24));
      const xs=[preferredX,map.left+4,map.right-bubble.width-4,...occupied.flatMap(item=>[item.left-bubble.width-4,item.left+item.width+4])].filter(x=>x>=map.left+4&&x+bubble.width<=map.right-4).sort((a,b)=>Math.abs(a-preferredX)-Math.abs(b-preferredX));
      const ys=[preferredY,map.top+4,map.bottom-bubble.height-24,...occupied.flatMap(item=>[item.top-bubble.height-4,item.top+item.height+4])].filter(y=>y>=map.top+4&&y+bubble.height<=map.bottom-24).sort((a,b)=>Math.abs(a-preferredY)-Math.abs(b-preferredY));
      let position;
      for(const left of xs){
        const top=ys.find(y=>!occupied.some(item=>left<item.left+item.width+4&&left+bubble.width+4>item.left&&y<item.top+item.height+4&&y+bubble.height+4>item.top));
        if(top!==undefined){position={left,top};break;}
      }
      if(!position)crowded=true;
      const {left,top}=position||{left:preferredX,top:preferredY};
      occupied.push({left,top,width:bubble.width,height:bubble.height});placements.push({record,left,top,actor,width:bubble.width,height:bubble.height});
    }
    if(crowded&&placements.length){
      // Dense mobile speech packs into balanced columns instead of covering another sentence.
      const width=Math.max(...placements.map(item=>item.width)),count=Math.max(1,Math.floor((map.width-4)/(width+4)));
      const columns=Array.from({length:count},()=>({height:0,items:[]}));
      for(const item of [...placements].sort((a,b)=>b.height-a.height)){
        const column=columns.reduce((a,b)=>a.height<=b.height?a:b);column.items.push(item);column.height+=item.height+4;
      }
      if(columns.every(column=>column.height-4<=map.height-28))columns.forEach((column,index)=>{
        let top=map.top+4;
        for(const item of column.items.sort((a,b)=>a.actor.top-b.actor.top)){
          item.left=map.left+4+index*(width+4);item.top=top;top+=item.height+4;
        }
      });
    }
    for(const {record,left,top,actor}of placements){record.bubble.style.left=(left-actor.left)/scale+'px';record.bubble.style.top=(top-actor.top)/scale+'px';record.bubble.style.bottom='auto';}
  }
  function actorBubble(actor,preserve=false){
    const job=latestJob(actor),available=queue&&['EMPTY','AVAILABLE'].includes(queue.state);
    const logic=window.ZEROLobbyLogic,world=window.ZEROLobbyWorld,publicScene=window.ZEROLobby?.state;
    if(!meetingRecordsOnly&&!job&&logic&&world?.chooseChatter){
      if(preserve&&teamChatCache.has(actor.id))return teamChatCache.get(actor.id);
      const rawLine=world.chooseChatter(logic,{now:new Date(),weather:publicScene?.weather,trends:publicScene?.trends||[],trendFallback:publicScene?.trendFallback!==false,level:1},[],teamChatRecent);
      const line=(typeof sanitizeKoreanEnglish==='function'?sanitizeKoreanEnglish(rawLine):rawLine)||rawLine;
      teamChatRecent.push(line);if(teamChatRecent.length>12)teamChatRecent.shift();
      const chat={text:line,status:available?'요청 대기':'진행 미확인',detail:'가상 직원의 일상 대사 · 실제 업무 처리나 계좌 확인 결과가 아닙니다. '+line};teamChatCache.set(actor.id,chat);return chat;
    }
    return {text:job&&available?types[job.job_type]:excerpt(actor.principles[0]||'직무 원칙',24),status:available?job?statusNames[job.status]:'요청 대기':'진행 미확인',detail:job?.result_summary||actor.principles[0]||''};
  }
  function policyDescription(){
    if(!queue||!['EMPTY','AVAILABLE'].includes(queue.state))return {label:'업무 처리 상태 미확인',note:'저장된 요청과 실행 기록을 확인하지 못했습니다. 실제 처리 상태를 확인한 뒤 표시합니다.',receipt:'접수 후 실제 실행자가 작업을 시작하면 상태가 바뀝니다.'};
    if(queue.processing_policy==='HOURLY_RESEARCH_QUEUE')return {label:'24시간 요청 접수 · 매시간 정기 처리',note:'실제 실행 기록 기준 · 컴퓨터/Codex 실행 필요. 매시간 15분(KST)에 오래된 요청부터 최대 3건을 처리하며 09시 브리핑 처리도 유지합니다. 대기량과 조사 시간에 따라 지연될 수 있습니다.',receipt:'접수되었습니다. 실제 실행 대기 중이며 매시간 정기 처리합니다. 컴퓨터/Codex 실행과 대기량에 따라 처리 시각이 달라질 수 있습니다.'};
    return {label:'요청 접수 · 오전 09:00 브리핑 뒤 처리',note:'현재 저장된 정책은 오전 09:00 KST 브리핑 뒤 순차 처리입니다. 접수와 실제 실행을 구분하며 결과 제출은 독립 검증이나 투자 승인을 뜻하지 않습니다.',receipt:'접수되었습니다. 실제 실행 대기 중이며 오전 09:00 브리핑 뒤 순서대로 처리합니다.'};
  }
  function renderPolicy(){
    const policy=policyDescription();if($('office-service-state'))$('office-service-state').textContent=policy.label;if($('office-processing-note'))$('office-processing-note').textContent=policy.note;
    const next=officeNextProcessing(queue?.processing_policy);if($('office-schedule-time'))$('office-schedule-time').textContent='현재 '+clockLabel(new Date().toISOString())+' · '+(next&&queue&&['EMPTY','AVAILABLE'].includes(queue.state)?'다음 정기 확인 '+clockLabel(next):'정기 확인 시각 미확인');
  }
  function renderDirectory(){
    const container=$('office-directory');if(!container)return;
    if(!directoryMembers.size){
      container.replaceChildren();
      for(const [id,name]of Object.entries(departmentNames)){
        const team=node('section','office-directory-team'),heading=node('div','office-directory-heading'),title=node('h3','',name),focus=node('button','office-directory-zoom','부서 방 보기');
        team.dataset.department=id;focus.type='button';focus.addEventListener('click',()=>{selectedDepartment=id;$('office-department').value=selectedDepartment;filterDepartment();$('office-map').scrollIntoView?.({block:'nearest',behavior:reducedMotion?.matches?'auto':'smooth'});});heading.append(title,focus);team.append(heading);
        const members=node('div','office-directory-members');
        for(const actor of actors.filter(actor=>actor.department===id)){
          const card=node('article','office-directory-member'),nameNode=node('h4','',actor.name),role=node('p','office-directory-role',actor.kind+' · '+(isLeader(actor)?'중앙 회의석':'부서 근무석')),principle=node('p','office-directory-principle',actor.principles[0]||''),status=node('p','office-directory-status'),result=node('p','office-directory-result'),request=node('button','office-directory-request','업무 요청');
          request.type='button';request.setAttribute('aria-haspopup','dialog');request.setAttribute('aria-controls','office-request-dialog');request.setAttribute('aria-label',actor.name+'에게 업무 요청');request.addEventListener('click',()=>openActor(actor));
          card.append(nameNode,role,principle,status,result,request);members.append(card);directoryMembers.set(actor.id,{status,result,card});
        }
        team.append(members);container.append(team);
      }
    }
    for(const actor of actors){
      const record=directoryMembers.get(actor.id);if(!record)continue;
      const job=latestJob(actor),recorded=latestJob(actor,'RECORDED'),state=actorState(actor);record.status.textContent=state==='UNKNOWN'?'진행 기록 확인 필요':job?types[job.job_type]+' · '+statusNames[job.status]:'접수한 새 요청 없음';
      record.status.dataset.jobStatus=state;record.result.textContent=recorded?.result_summary?'최근 제출 기록 · '+recorded.result_summary:'';record.result.hidden=!recorded?.result_summary;
    }
  }
  function renderActors(relayout=false){
    const map=$('office-map'),selector=$('office-department'),assignee=$('office-assignee'),selectedId=selected?.id,times=new Map([...sceneActors.values()].map(record=>[record.actor.id,record.animations[0]?.currentTime]));
    times.set('OFFICE_OWNER',ownerScene?.animation?.currentTime);ownerEncounter=null;
    layoutFloor(map.clientWidth||1200,map.clientHeight||720);
    if(!relayout){clearTimeout(meetingTimer);meetingTimer=null;meetingTask=null;meetingPhase='REPORT';}
    for(const animation of motionAnimations)animation.cancel();motionAnimations.clear();
    map.replaceChildren();selector.replaceChildren();assignee.replaceChildren();actorButtons.clear();sceneActors.clear();rooms.clear();directoryMembers.clear();if(!relayout)teamChatCache.clear();
    actors.forEach(actor=>{const option=node('option','',actor.name);option.value=actor.id;assignee.append(option);});
    for(const [id,name]of [['ALL','전체 사무실'],['MEETING','중앙 회의실'],...Object.entries(departmentNames),['CHAIRPERSON','ZERO 의장실']]){const option=node('option','',name);option.value=id;selector.append(option);}
    fit=node('div','office-scene-fit');world=node('div','office-scene-world');
    world.style.width=WORLD_WIDTH+'px';world.style.height=WORLD_HEIGHT+'px';map.dataset.floorLayout=floorKey;
    const svg=svgNode('svg',{viewBox:'0 0 '+WORLD_WIDTH+' '+WORLD_HEIGHT,'class':'office-scene-svg','aria-hidden':'true'});drawOffice(svg);
    const furniture=svgNode('g'),people=svgNode('g'),hotspots=node('div','office-hotspots'),layout=seatLayout();
    actors.forEach((actor,index)=>{
      const seat=layout.find(item=>item.id===actor.id),point={x:seat.x,y:seat.y};if(!isLeader(actor))drawDesk(furniture,seat,actor);
      else rect(furniture,seat.x-18,seat.y-12,36,24,'#557f8b',{rx:7});
      const person=figure(actor,index,point);people.append(person.outer);
      const button=node('button','office-actor');button.type='button';button.dataset.officeActor=actor.id;button.dataset.department=actor.department;button.dataset.room=seat.room;
      button.style.left=(point.x-90)+'px';button.style.top=(point.y-76)+'px';button.title=actor.name+' · '+actor.kind+' · '+departmentNames[actor.department];button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','office-request-dialog');
      const bubble=node('span','office-actor-bubble'),duty=node('span','office-actor-duty'),status=node('span','office-actor-status'),label=node('span','office-actor-label');
      bubble.append(duty,status);label.dataset.short=departmentNames[actor.department]||'';label.append(node('span','office-actor-name',actor.name),node('span','office-actor-role',departmentNames[actor.department]+' · '+actor.kind));button.append(bubble,label);
      button.addEventListener('click',()=>openActor(actor));hotspots.append(button);actorButtons.set(actor.id,button);sceneActors.set(actor.id,{actor,button,figure:person.outer,travel:person.travel,point,duty,bubble,animations:[]});
    });
    svg.append(furniture,people);drawChairperson(svg);renderOwner(svg,hotspots);world.append(svg,hotspots);fit.append(world);map.append(fit);
    const hint=node('p','office-scene-hint','이동·대화는 가상 연출 · ZERO 의장과 직원 선택 · 업무는 별도 요청');map.append(hint);
    // The toolbar's native department selector is the single room navigator.
    let central=$('office-central-roster');if(!central){central=node('nav','office-central-roster');central.id='office-central-roster';central.setAttribute('aria-label','중앙 팀장 선택');$('office-records')?.append(central);}central.replaceChildren();
    for(const actor of actors.filter(isLeader)){const button=node('button','',actor.name+' · '+departmentNames[actor.department]);button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','office-request-dialog');button.addEventListener('click',()=>openActor(actor));central.append(button);}
    if($('team-meeting-state')&&!$('office-actual-meeting')){const link=node('button','office-reload','실제 자문회의 제출 현황 보기');link.id='office-actual-meeting';link.type='button';link.addEventListener('click',()=>{const target=$('team-meeting-state');for(let parent=target?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;target?.scrollIntoView?.({block:'center',behavior:reducedMotion?.matches?'auto':'smooth'});});$('office-meeting')?.append(link);}
    selector.value=selectedDepartment;$('office-roster-count').textContent=actors.length+'개 직무 · 12개 팀 사무실 · 별도 ZERO 의장실 · 중앙 회의 12명';$('office-empty').hidden=true;
    selected=actors.find(actor=>actor.id===(relayout?selectedId:'ZERO_FINAL_MANAGER'));renderDirectory();selectActor(selected);filterDepartment();if(!relayout)showMeetingReport(0);startSceneMotion();startOwnerMotion();if(relayout)for(const record of [...sceneActors.values(),ownerScene]){const elapsed=times.get(record.actor?.id||'OFFICE_OWNER');if(Number.isFinite(elapsed))for(const animation of record.animations)animation.currentTime=elapsed;}syncMotion();
  }
  function selectActor(actor){
    if(!actor)return;selected=actor;
    for(const [id,button]of actorButtons)button.classList.toggle('is-selected',id===actor.id);
    renderInspector();renderQueue();
  }
  function renderInspector(){
    if(!selected||!$('office-focus-name'))return;const job=latestJob(selected),recorded=latestJob(selected,'RECORDED'),state=actorState(selected);
    $('office-focus-kind').textContent=selected.kind+' · 가상 직무';$('office-focus-name').textContent=selected.name;$('office-focus-role').textContent=departmentNames[selected.department];
    $('office-focus-status').textContent=state==='UNKNOWN'?'진행 기록 확인 필요':job?statusNames[job.status]:'접수한 새 요청 없음';$('office-focus-status').dataset.jobStatus=state;
    $('office-focus-principle').textContent=selected.principles[0]||'';$('office-focus-result').textContent=state==='UNKNOWN'?'현재 요청·제출 기록을 확인하지 못했습니다.':recorded?.result_summary?'최근 제출 · '+recorded.result_summary:job?types[job.job_type]+' · '+clockLabel(job.updated_at):'접수한 새 요청이 없습니다.';
  }
  function filterDepartment(){
    selectedDepartment=$('office-department').value||'ALL';zoom=1;
    if($('office-central-roster'))$('office-central-roster').hidden=selectedDepartment!=='MEETING';
    for(const record of sceneActors.values()){const match=selectedDepartment==='ALL'||selectedDepartment==='MEETING'&&isLeader(record.actor)||record.actor.department===selectedDepartment;record.button.classList.toggle('is-muted',!match);record.figure.classList.toggle('is-muted',!match);}
    for(const [id,room]of rooms)room.classList.toggle('is-muted',selectedDepartment!=='ALL'&&id!==selectedDepartment);
    for(const button of world?.querySelectorAll('.office-room-lead-request')||[])button.hidden=button.dataset.department!==selectedDepartment;
    updateSceneVisibility();fitScene();
  }
  function fitScene(){
    if(!world||!fit)return;const map=$('office-map'),overview=selectedDepartment==='ALL';
    if(floorGeometry(map.clientWidth||1200,map.clientHeight||720).key!==floorKey&&!ownerEncounter){renderActors(true);return;}
    const area=overview?{x:0,y:0,width:WORLD_WIDTH,height:WORLD_HEIGHT}:selectedDepartment==='CHAIRPERSON'?chairpersonRoom:selectedDepartment==='MEETING'?meetingRoom:roomLayout().find(room=>room.id===selectedDepartment);
    if(!area)return;map.classList.toggle('office-overview',overview);
    const viewportWidth=Math.max(1,(map.clientWidth||1200)-8),viewportHeight=Math.max(1,(map.clientHeight||720)-24);
    const base=Math.min(viewportWidth/(area.width+(overview?0:70)),viewportHeight/(area.height+(overview?0:80))),scale=Math.min(1.65,base)*zoom;
    world.style.transform='scale('+scale+')';world.style.setProperty('--office-scene-scale',scale);world.style.setProperty('--office-label-font',Math.min(26,Math.max(13,(overview?10:14)/scale))+'px');world.style.setProperty('--office-meta-font',Math.min(22,Math.max(11,(overview?10:12)/scale))+'px');
    world.style.setProperty('--office-speech-font',((map.clientWidth<600?12:13)/scale)+'px');world.style.setProperty('--office-speech-width',(Math.min(map.clientWidth<600?148:200,viewportWidth-8)/scale)+'px');
    world.style.setProperty('--office-room-title-font',Math.min(38,Math.max(20,11/scale))+'px');world.style.setProperty('--office-summary-font',Math.min(48,14/scale)+'px');world.style.setProperty('--office-phone-font',(11/scale)+'px');world.style.setProperty('--office-summary-meta-font',Math.min(42,12/scale)+'px');
    fit.style.width=(WORLD_WIDTH*scale)+'px';fit.style.height=(WORLD_HEIGHT*scale)+'px';map.scrollTo?.({left:overview?0:Math.max(0,(area.x+area.width/2)*scale-viewportWidth/2),top:overview?0:Math.max(0,(area.y+area.height/2)*scale-viewportHeight/2),behavior:'auto'});
    if($('office-zoom-out'))$('office-zoom-out').disabled=zoom<=.8;if($('office-zoom-in'))$('office-zoom-in').disabled=zoom>=2.5;
  }
  function setZoom(value){zoom=Math.max(.8,Math.min(2.5,value));fitScene();}
  function startMeeting(){selectedDepartment='MEETING';if(!actors.length)return;$('office-department').value='MEETING';filterDepartment();}
  function finishMeeting(){selectedDepartment='ALL';$('office-department').value='ALL';filterDepartment();}
  function meetingReports(){
    const available=queue&&['EMPTY','AVAILABLE'].includes(queue.state),saved=available?queue.jobs.filter(job=>['RECORDED','BLOCKED','FAILED'].includes(job.status)&&job.result_summary):[],recorded=saved.filter(job=>job.status==='RECORDED');
    const metadata=job=>'저장된 '+statusNames[job.status]+' 요약 · 공개 ID '+job.id+' · 제출자 '+(actors.find(actor=>actor.id===job.actor_id)?.name||job.actor_id)+' · 종료 '+clockLabel(job.finished_at)+' · 근거 '+job.evidence_count+'개 · 독립 검증 별도';
    const reports=actors.filter(isLeader).map(actor=>{
      const job=saved.filter(job=>actors.some(member=>member.department===actor.department&&member.id===job.actor_id)).sort((a,b)=>Date.parse(b.finished_at)-Date.parse(a.finished_at)||a.id.localeCompare(b.id))[0];
      const source=job?metadata(job):available?'상시 직무 원칙 · 보고할 실제 제출 기록 없음':'상시 직무 원칙 · 실행 기록 미확인';
      const missing=actor.id==='UX_UI_CHIEF'?' 개발 커밋·공유 현황 기록은 미확인입니다.':'';
      return {actor,copy:job?.result_summary||(meetingRecordsOnly?(available?'보고할 실제 제출 기록 없음.':'업무 기록을 확인하지 못했습니다.')+missing:actor.principles[0]||'확인된 직무 원칙'),source};
    });
    const manager=actors.find(actor=>actor.id==='ZERO_FINAL_MANAGER');
    if(manager){const job=recorded.filter(job=>job.actor_id===manager.id).sort((a,b)=>Date.parse(b.finished_at)-Date.parse(a.finished_at)||a.id.localeCompare(b.id))[0];
      // The final phase reports saved manager output; role animation cannot imply consensus.
      reports.push({actor:manager,copy:(job?'총괄 제출 기록 · '+job.result_summary:available?'총괄 결론 기록 없음 · 승인·매매 미실행.':'총괄 결론 기록 미확인 · 승인·매매 미실행.')+' 현재 공개 대기열의 실제 제출 기록 '+(available?recorded.length+'건':'미확인')+' · 독립 검증·실제 합의 별도.',source:'총괄 최근 제출 결과 · '+(job?metadata(job):available?'총괄 결론 기록 없음':'총괄 결론 기록 미확인')});
    }
    return reports;
  }
  function updateSceneVisibility(preserve=false){
    if(ownerEncounter&&(meetingRecordsOnly||latestJob(ownerEncounter.record.actor)))releaseEncounter();
    const report=meetingReports()[meetingIndex],eligible=actors.filter(actor=>selectedDepartment==='ALL'||selectedDepartment==='MEETING'&&isLeader(actor)||actor.department===selectedDepartment),bubbles=new Set();
    if(meetingRecordsOnly&&report&&eligible.includes(report.actor))bubbles.add(report.actor.id);
    const maxBubbles=Math.min(5,eligible.length);
    if(ownerEncounter&&eligible.includes(ownerEncounter.record.actor))bubbles.add(ownerEncounter.record.actor.id);
    const startIndex=(chatTurn*5)%Math.max(1,eligible.length);
    for(let i=0;i<eligible.length&&bubbles.size<maxBubbles;i++){
      const candidate=eligible[(startIndex+i)%eligible.length];
      if(candidate)bubbles.add(candidate.id);
    }
    for(const record of sceneActors.values()){
      const inRoom=selectedDepartment==='MEETING'?isLeader(record.actor):record.actor.department===selectedDepartment;
      {const chat=actorBubble(record.actor,preserve||!motionAllowed());record.duty.textContent=ownerEncounter?.record===record?ownerEncounter.lines[ownerEncounter.remaining>3500?0:1][1]:chat.text;record.bubble.title=ownerEncounter?.record===record?'ZERO와 나누는 가상 일상 대화':chat.detail;}
      record.button.classList.toggle('show-bubble',bubbles.has(record.actor.id));
      record.button.classList.toggle('show-label',selectedDepartment!=='ALL'&&inRoom);
    }
    updateOwnerSpeech();fitChatter();
    for(const [id,room]of rooms){const count=room.querySelector?.('.office-room-headcount');if(!count)continue;const members=actors.filter(actor=>actor.department===id),available=queue&&['EMPTY','AVAILABLE'].includes(queue.state),pending=available?queue.jobs.filter(job=>members.some(actor=>actor.id===job.actor_id)&&job.status==='QUEUED').length:null;count.textContent='팀 '+members.length+'명 · 방 '+members.filter(actor=>!isLeader(actor)).length+'명 · '+(pending===null?'진행 미확인':pending?'대기 '+pending+'건':'새 요청 없음')+' · 정원 미정';}
  }
  function sceneVisible(){
    if(document.hidden||$('office-scene-surface')?.hidden)return false;
    for(let parent=$('office-map');parent;parent=parent.parentElement)if(parent.hidden)return false;
    const bounds=$('office-map').getBoundingClientRect();return sceneInView&&bounds.bottom>0&&bounds.top<window.innerHeight;
  }
  function motionAllowed(){return !motionPaused&&sceneVisible()&&!reducedMotion?.matches;}
  function startSceneMotion(){
    const clock=document.timeline?.currentTime;let index=0;
    for(const record of sceneActors.values()){
      const phaseIndex=index++;if(!record.travel.animate||!record.button.animate)continue;
      const point=record.point;
      const dx=phaseIndex%2?-20:20;
      const away='translate('+dx+'px, 4px)',home='translate(0px, 0px)';
      let duration=9200+(phaseIndex%5)*400,delay=-(phaseIndex*977%duration),frames=[{offset:0,transform:home},{offset:.1,transform:home},{offset:.28,transform:away},{offset:.42,transform:away},{offset:.62,transform:home},{offset:1,transform:home}],easing='cubic-bezier(.77,0,.175,1)';
      if(isLeader(record.actor)){
        const route=officeMeetingRoute(record),outStart=84500,outEnd=outStart+12000,backStart=outEnd+20000;duration=backStart+12000;delay=0;easing='linear';
        frames=[{offset:0,transform:home},{offset:2000/duration,transform:away},{offset:5000/duration,transform:home},...officeRouteFrames(route,point,outStart/duration,outEnd/duration),...officeRouteFrames([...route].reverse(),point,backStart/duration,1)];
      }
      const timing={duration,delay,iterations:Infinity,easing};
      // One clock and identical tracks keep the visible person, label and tap target together.
      for(const target of [record.travel,record.button]){const animation=target.animate(frames,timing);if(Number.isFinite(clock))animation.startTime=clock;motionAnimations.add(animation);record.animations.push(animation);}
      record.figure.classList.add('is-scene-cycle');record.figure.style.setProperty('--office-cycle-duration',duration+'ms');record.figure.style.setProperty('--office-cycle-delay',delay+'ms');
    }
  }
  function startOwnerMotion(){
    if(!ownerScene?.travel.animate||!ownerScene.button.animate)return;
    const {tour}=ownerScene,timing={duration:tour.duration,iterations:Infinity,easing:'linear'};
    for(const target of [ownerScene.travel,ownerScene.button]){const animation=target.animate(tour.frames,timing);if(Number.isFinite(document.timeline?.currentTime))animation.startTime=document.timeline.currentTime;motionAnimations.add(animation);ownerScene.animations.push(animation);if(target===ownerScene.travel)ownerScene.animation=animation;}
  }
  function scheduleMeeting(task,delay){
    clearTimeout(meetingTimer);meetingTask=task;meetingRemaining=delay;meetingDue=Date.now()+delay;if(motionAllowed())meetingTimer=setTimeout(()=>{meetingTimer=null;meetingTask=null;task();},delay);
  }
  // One 5-second clock moves the overview to the next five speakers in every meeting phase.
  function rotateChatter(){chatTurn=(chatTurn+1)%Math.max(1,actors.length);updateSceneVisibility();}
  function showMeetingReport(index,advance=true){
    if(meetingPhase!=='REPORT'){renderMeetingPhase();updateSceneVisibility();return;}
    const reports=meetingReports();if(!reports.length)return;meetingIndex=index%reports.length;const report=reports[meetingIndex];
    if($('office-meeting'))$('office-meeting').hidden=$('office-board')?!$('office-board').hidden:false;
    if($('office-meeting-label'))$('office-meeting-label').textContent='회의 연출 · '+report.source+' · 실제 실행 상태는 저장 기록';
    if($('office-meeting-speaker'))$('office-meeting-speaker').textContent=report.actor.name+' · '+(meetingIndex+1)+' / '+reports.length;
    if($('office-meeting-copy')){$('office-meeting-copy').textContent=excerpt(report.copy,95);$('office-meeting-copy').title=report.copy;}
    if($('office-meeting-detail'))$('office-meeting-detail').textContent=report.source+' · '+report.copy;
    for(const record of sceneActors.values()){record.figure.classList.toggle('is-speaking',meetingRecordsOnly&&record.actor.id===report.actor.id);record.button.classList.toggle('is-speaking',meetingRecordsOnly&&record.actor.id===report.actor.id);}
    updateSceneVisibility();if(advance)scheduleMeeting(()=>meetingIndex+1<reports.length?showMeetingReport(meetingIndex+1):changeMeetingPhase('RETURN',12000,()=>changeMeetingPhase('DESK',20000,()=>changeMeetingPhase('ARRIVAL',12000,()=>{meetingPhase='REPORT';showMeetingReport(0);}))),6500);
  }
  function renderMeetingPhase(){
    const labels={RETURN:'부서로 복귀하는 중',DESK:'부서에서 업무 원칙 확인',ARRIVAL:'팀장들이 중앙으로 모이는 중'};
    if($('office-meeting-label'))$('office-meeting-label').textContent='회의 연출 · '+labels[meetingPhase]+' · 실제 실행 상태는 저장 기록';
    if($('office-meeting-speaker'))$('office-meeting-speaker').textContent='다음 보고 준비';
    if($('office-meeting-copy'))$('office-meeting-copy').textContent='이동은 화면 연출입니다. 실제 업무 완료와 투자 결정은 저장된 결과가 있을 때만 표시합니다.';
    for(const record of sceneActors.values()){record.figure.classList.remove('is-speaking');record.button.classList.remove('is-speaking');}
  }
  function changeMeetingPhase(phase,delay,next){meetingPhase=phase;renderMeetingPhase();scheduleMeeting(next,delay);}
  function syncMotion(){
    const allowed=motionAllowed();world?.classList.toggle('office-motion-paused',!allowed);
    const held=new Set(ownerEncounter?[...ownerScene.animations,...ownerEncounter.record.animations]:[]),clock=document.timeline?.currentTime;
    for(const animation of motionAnimations){
      if(!allowed||held.has(animation))animation.pause();
      else if(animation.playState==='paused'){const elapsed=animation.currentTime;animation.play();if(Number.isFinite(clock)&&Number.isFinite(elapsed))animation.startTime=clock-elapsed;}
    }
    if(!allowed){if(meetingTimer!==null&&meetingTask)meetingRemaining=Math.max(0,meetingDue-Date.now());clearTimeout(meetingTimer);meetingTimer=null;}
    else if(meetingTask&&meetingTimer===null)scheduleMeeting(meetingTask,meetingRemaining);
  }
  function toggleMotion(){motionPaused=!motionPaused;$('office-pause').textContent=motionPaused?'움직임 재개':'움직임 멈추기';$('office-pause').setAttribute('aria-pressed',motionPaused?'true':'false');syncMotion();}

  function latestJob(actor, status) {
    // A newer request must not replace the last actual submission in result views.
    return queue?.jobs.filter(job=>job.actor_id===actor.id&&(!status||job.status===status)).sort((a,b)=>Date.parse(status==='RECORDED'?b.finished_at:b.updated_at)-Date.parse(status==='RECORDED'?a.finished_at:a.updated_at)||a.id.localeCompare(b.id))[0];
  }

  function renderActorFacts(actor) {
    const bubble=$('office-bubble');if(!actor||!bubble)return;
    let facts=bubble.querySelector('.office-actor-facts');if(!facts){facts=node('span','office-actor-facts');bubble.append(facts);}
    const available=queue&&['EMPTY','AVAILABLE'].includes(queue.state),recorded=latestJob(actor,'RECORDED'),job=latestJob(actor),now=new Date().toISOString();
    const minutes=(start,end)=>stamp(start)&&stamp(end)&&Date.parse(end)>=Date.parse(start)?Math.floor((Date.parse(end)-Date.parse(start))/60000)+'분':'미확인';
    const result=recorded?recorded.result_summary+' · 제출 '+clockLabel(recorded.finished_at)+' · 근거 '+recorded.evidence_count+'개':available?'실제 제출 기록 없음':'실제 제출 기록 미확인';
    const timing=job?'접수 '+clockLabel(job.created_at)+' · 시작 '+clockLabel(job.started_at)+' · 종료 '+clockLabel(job.finished_at)+' · 대기 '+minutes(job.created_at,job.started_at||(job.status==='QUEUED'?now:null))+' · 실행 '+minutes(job.started_at,job.finished_at||(job.status==='RUNNING'?now:null)):'접수·시작·종료 시각 미확인 · 대기·실행 시간 미확인';
    facts.replaceChildren();
    // The public schema carries neither billing data nor a verified cost estimate.
    for(const [label,value]of [['최근 실제 제출',result],['현재 요청의 시간',timing],['비용','비용 미확인 · 공개 기록에 비용 정보 없음']]){const row=node('span');row.append(node('strong','',label),node('span','',value));facts.append(row);}
  }

  function actorState(actor) { return queue && ['EMPTY','AVAILABLE'].includes(queue.state) ? latestJob(actor)?.status || 'IDLE' : 'UNKNOWN'; }

  function renderQueue() {
    const available=queue && ['EMPTY','AVAILABLE'].includes(queue.state), list=$('office-jobs');
    $('office-status').textContent=available ? (queue.jobs.length ? '요청 '+queue.jobs.length+'건 · '+clockLabel(queue.updated_at) : '접수한 요청이 없습니다') : '업무 진행 상태 확인 필요';
    $('office-submit').disabled=submitting || !available || !selected;
    $('office-assignee').disabled=submitting;
    $('office-job-type').disabled=submitting;
    $('office-instruction').disabled=submitting;
    $('office-scope').disabled=submitting;$('office-deadline').disabled=submitting;
    $('office-team-assignment').disabled=submitting;
    if (selected) $('office-selected-status').textContent=available ? latestJob(selected) ? statusNames[latestJob(selected).status] : '접수한 새 요청 없음' : '진행 기록 확인 필요';
    for (const actor of actors) {
      const button=actorButtons.get(actor.id), job=latestJob(actor);
      if (!button) continue;
      button.dataset.jobStatus=actorState(actor);
      button.querySelector('.office-actor-status').textContent=available ? job ? ({QUEUED:'실제 요청 · 대기',RUNNING:'실제 실행 중',RECORDED:'결과 제출됨',BLOCKED:'보류',FAILED:'실행 실패',ATTENTION_REQUIRED:'진행 확인 필요'})[job.status] : '상시 업무' : '실행 미확인';
      button.setAttribute('aria-label',actor.name+' · '+actor.kind+' · '+button.querySelector('.office-actor-status').textContent+' · 직무와 기록 보기');
      const record=sceneActors.get(actor.id);if(record){record.figure.dataset.jobStatus=button.dataset.jobStatus;record.figure.classList.toggle('is-working',button.dataset.jobStatus==='RUNNING');const bubble=actorBubble(actor,!motionAllowed());record.duty.textContent=bubble.text;record.bubble.title=bubble.detail;}
      const screen=world?.querySelector('[data-office-screen="'+actor.id+'"]');if(screen)screen.dataset.jobStatus=button.dataset.jobStatus;
    }
    renderActorFacts(selected);renderInspector();renderDirectory();renderPolicy();renderOfficeMetrics();renderOfficeBoard();renderOfficeStaffLedger();if(actors.length)showMeetingReport(meetingIndex,false);
    list.replaceChildren();
    if (!available) { list.append(node('li','office-job-empty','기록을 확인하지 못했습니다. 마지막 접수·진행 상태를 완료로 표시하지 않습니다.')); return; }
    if (!queue.jobs.length) { list.append(node('li','office-job-empty','캐릭터를 눌러 원칙을 읽고, 조사할 일을 요청해 보세요.')); return; }
    [...queue.jobs].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||a.id.localeCompare(b.id)).slice(0,8).forEach(job=>{
      const actor=actors.find(item=>item.id===job.actor_id), item=node('li','office-job');
      item.append(node('strong','',types[job.job_type]),node('span','office-job-state',statusNames[job.status]),node('p','office-job-meta',actor.name+' · '+clockLabel(job.updated_at)));
      if (job.result_summary) { const details=node('details','office-job-result'); details.append(node('summary','','제출 결과 · 근거 '+job.evidence_count+'개'),node('p','',job.result_summary),node('small','','실행자의 제출 기록 · 독립 검증 별도')); item.append(details); }
      list.append(item);
    });
    if (queue.jobs.length>8) list.append(node('li','office-job-empty','최근 8건 표시 · 전체 접수 '+queue.jobs.length+'건'));
  }

  function openActor(actor, instruction) {
    if(submitting)return;
    selectActor(actor);
    const count=clicks.get(actor.id)||0; clicks.set(actor.id,count+1);
    $('office-selected-name').textContent=actor.name;
    $('office-assignee').value=actor.id;
    $('office-bubble').textContent=actor.principles[count%actor.principles.length];
    $('office-selected-role').textContent=actor.kind+' · '+departmentNames[actor.department]+(actor.affiliations.length ? ' · 함께 맡는 부서: '+actor.affiliations.join(', ') : '');
    $('office-selected-status').textContent=latestJob(actor) ? statusNames[latestJob(actor).status] : '접수한 새 요청 없음';
    for (const [id,button] of actorButtons) button.classList.toggle('is-selected',id===actor.id);
    $('office-instruction').value=instruction || '';$('office-scope').value='';$('office-deadline').value='';
    $('office-team-assignment').hidden=actor.id!=='ZERO_FINAL_MANAGER';
    const choices=$('office-team-choices');choices.replaceChildren();
    for(const [id,name]of Object.entries(departmentNames).filter(([id])=>id!=='ZERO_FINAL_MANAGER')){
      const head=actors.find(member=>member.id===id)||actors.find(member=>member.id==='UX_UI_CHIEF'&&id==='PRODUCT_QUALITY_TEAM');if(!head)continue;
      const label=node('label','office-team-choice'),check=node('input');check.type='checkbox';check.name='office-responsible';check.value=head.id;label.append(check,node('span','',name));choices.append(label);
    }
    $('office-request-feedback').textContent='접수 후 실제 실행자가 작업을 시작하면 상태가 바뀝니다. '+policyDescription().label;
    $('office-job-type').value=actor.department==='PRODUCT_QUALITY_TEAM' ? 'UI_REVIEW' : actor.id==='ZERO_FINAL_MANAGER' ? 'NEWS_REVIEW' : 'COMPANY_RESEARCH';
    renderQueue();
    const dialog=$('office-request-dialog'); if (!dialog.open) dialog.showModal();
    // Let the owner read the selected role before the editor; focusing it scrolls past long principles.
    $('office-request-close').focus({preventScroll:true});
    dialog.scrollTop=0;
  }

  function sceneLoading(state) {
    const cover=$('office-loading');if(!cover)return;
    const busy=state==='loading';
    $('office-map').setAttribute('aria-busy',String(busy));cover.hidden=state==='ready';
    $('office-loading-ring').hidden=!busy;
    $('office-loading-label').textContent=busy?'로딩 중…':'사무실을 불러오지 못했어요';
    $('office-loading-note').textContent=busy?'ZERO 팀 사무실과 직원들을 준비하고 있어요.':'연결 상태를 확인하고 다시 시도해 주세요.';
    $('office-loading-retry').hidden=busy;
  }

  async function load() {
    const epoch=++requestEpoch;
    if(!actors.length)sceneLoading('loading');
    const results=await Promise.allSettled([
      actors.length ? Promise.resolve(null) : fetch('api/team',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('ROSTER');return response.json();}),
      fetch('api/office',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('QUEUE');return response.json();})
    ]);
    if (epoch!==requestEpoch) return;
    // Let the loading cover paint before constructing the first SVG scene, including cached responses.
    if(!actors.length&&typeof requestAnimationFrame==='function')await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if (epoch!==requestEpoch) return;
    try {
      if (!actors.length) { if(results[0].status!=='fulfilled')throw Error('ROSTER'); actors=parseActors(results[0].value); renderActors(); }
      if (results[1].status!=='fulfilled')throw Error('QUEUE');
      queue=validateView(results[1].value); renderQueue();
    } catch (_) {
      queue=null; renderQueue();
      if (!actors.length) { $('office-empty').hidden=false; $('office-empty').textContent='직무 명부를 확인하지 못했습니다. 확인된 역할만 사무실에 표시합니다.'; }
    } finally {
      if(epoch===requestEpoch)sceneLoading($('office-map').querySelector('.office-scene-world')?'ready':'error');
    }
  }

  async function submit(event) {
    event.preventDefault(); if (submitting || !selected || !queue || !['EMPTY','AVAILABLE'].includes(queue.state)) return;
    let instruction;const jobType=$('office-job-type').value;
    try{instruction=buildOfficeInstruction($('office-instruction').value,$('office-scope').value,$('office-deadline').value);}catch(error){$('office-request-feedback').textContent=error.message;return;}
    if(!Object.hasOwn(types,jobType))return;
    const chosen=selected.id==='ZERO_FINAL_MANAGER'?[...$('office-team-choices').querySelectorAll('input:checked')].map(input=>input.value):[];
    const assignees=chosen.length?chosen:[selected.id];if(assignees.some(id=>!actors.some(actor=>actor.id===id)))return;
    const signature=JSON.stringify([assignees,jobType,instruction]);
    if(!pending||pending.signature!==signature)pending={signature,jobs:assignees.map(actor_id=>({schema_version:1,request_id:crypto.randomUUID(),actor_id,job_type:jobType,instruction})),accepted:new Set()};
    const batch=pending;
    submitting=true; renderQueue(); $('office-request-feedback').textContent='비공개 업무 요청을 접수하고 있습니다.';
    try {
      ++requestEpoch;
      for(const sent of batch.jobs){
        if(batch.accepted.has(sent.request_id))continue;
        try{
          const response=await fetch('api/office/jobs',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(sent)});
          if(!response.ok)throw Error('SUBMIT');const view=validateView(await response.json());
          if(!view.jobs.some(job=>job.id===sent.request_id&&job.actor_id===sent.actor_id&&job.job_type===sent.job_type))throw Error('ACK');
          queue=view;batch.accepted.add(sent.request_id);
        }catch(_){/* An uncertain receipt keeps its UUID for the next attempt. */}
      }
      const count=batch.accepted.size,total=batch.jobs.length;
      $('office-request-feedback').textContent=count===total?total+'건 접수 확인 · '+policyDescription().receipt:total+'건 중 '+count+'건 접수 확인 · 나머지는 접수 여부 미확인입니다. 같은 내용으로 다시 누르면 확인되지 않은 동일 요청만 재확인합니다.';
      if(count===total){$('office-instruction').value='';$('office-scope').value='';$('office-deadline').value='';pending=null;}
    } finally { submitting=false; renderQueue(); }
  }

  async function requestResearch({identity,instruction,job_type='COMPANY_RESEARCH'}={}) {
    if (!Object.hasOwn(types,job_type) || typeof instruction!=='string' || typeof identity!=='string' || !/^(?:US|KR):[A-Z0-9.-]{1,24}$/.test(identity)) return false;
    const value=identity+' · '+instruction; if (!value.trim() || value.length>1000 || /[\x00-\x1f\x7f]/.test(value)) return false;
    if (!actors.length) await load();
    const actor=actors.find(item=>item.id==='COMPANY_RESEARCH_ANALYST') || actors.find(item=>item.id==='QUANT_RESEARCH_CHIEF');
    if (!actor) return false;
    if (window.ZERO?.currentView?.()!=='team') window.ZERO?.navigate?.('team');
    openActor(actor,value); $('office-job-type').value=job_type; return true;
  }

  function renderOfficeMetrics() {
    if (!actors.length) return;
    const available = queue && ['EMPTY','AVAILABLE'].includes(queue.state), jobs = available ? queue.jobs : null;
    const departments = Object.entries(departmentNames);
    const snapshots = departments.map(([id,name]) => {
      const members = actors.filter(actor => actor.department === id), stats = officeQueueMetrics(jobs,members.map(actor => actor.id));
      const capacity = officeRoomCapacity(rosterSource?.company_policy?.teams,id,name,members.map(actor => actor.id));
      const ledger=officeStaffLedgerData(jobs,members.map(actor=>actor.id));
      return {id,name,members,stats,capacity,ledger};
    });
    const longest = Math.max(0,...snapshots.map(team => team.stats.oldestMinutes || 0)), recentSample=Math.max(0,...snapshots.map(team=>team.ledger.weekRecorded||0));
    const minutes = value => value === null ? '기록 없음' : value < 60 ? Math.round(value)+'분' : (value/60).toFixed(1)+'시간';
    const percent = value => value === null ? '기록 없음' : (value*100).toFixed(1)+'%';
    const flow = $('office-flow-teams');if(flow)flow.replaceChildren();
    let overlays = world?.querySelector('.office-room-summaries');
    if(world&&!overlays){overlays=node('div','office-room-summaries');world.append(overlays);}
    overlays?.replaceChildren();
    const scale = Number(world?.style.transform?.match(/scale\(([^)]+)\)/)?.[1]) || 1;
    world?.style.setProperty('--office-summary-font',Math.min(48,14/scale)+'px');
    world?.style.setProperty('--office-summary-meta-font',Math.min(42,12/scale)+'px');
    for(const team of snapshots){
      const {id,name,members,stats,capacity,ledger}=team, bottleneck=stats.queued>0&&longest>0&&stats.oldestMinutes===longest;
      const warnings=jobs?.some(job=>members.some(actor=>actor.id===job.actor_id)&&['BLOCKED','FAILED','ATTENTION_REQUIRED'].includes(job.status)),roomState=stats.known?(bottleneck?'bottleneck':stats.queued||warnings?'warning':'normal'):'';
      const stateLabel=stats.known?({normal:'정상',warning:'주의',bottleneck:'최장 대기'})[roomState]:'미확인';
      const staffing='배치 '+members.length+' / '+(capacity===null?'정원 미정':'정원 '+capacity)+(capacity!==null&&members.length<capacity?' · 인원 부족':'');
      const pending=stats.known?(stats.total?'대기 '+stats.queued+'건 · 최장 '+(stats.oldestMinutes===null?'대기 없음':minutes(stats.oldestMinutes)):'기록 없음'):'상태 미확인';
      const focus=()=>{selectedDepartment=id;$('office-department').value=id;filterDepartment();};
      if(flow){const item=node('button','office-flow-team');item.type='button';item.dataset.bottleneck=String(bottleneck);item.dataset.roomState=roomState;item.append(node('strong','',name),node('span','',stateLabel+' · '+pending));if(stats.total){const bar=node('meter');bar.min=0;bar.max=100;bar.value=stats.submissionRate*100;bar.setAttribute('aria-label',name+' 결과 제출 '+stats.submitted+' / 접수 '+stats.total);item.append(bar);}item.addEventListener('click',focus);flow.append(item);}
      const room=roomLayout().find(room=>room.id===id);
      if(room&&overlays){const badge=node('button','office-room-summary');badge.type='button';badge.style.left=(room.x+18)+'px';badge.style.top=(room.y+14)+'px';badge.style.width=(room.width-36)+'px';badge.dataset.bottleneck=String(bottleneck);badge.dataset.roomState=roomState;badge.setAttribute('aria-label',name+' · '+staffing+' · '+pending+' · 방 확대');badge.append(node('strong','',name),node('span','',staffing),node('span','',stateLabel+' · '+pending));badge.addEventListener('click',focus);overlays.append(badge);
        const owner=members.find(isLeader);if(owner){const request=node('button','office-room-lead-request','팀장 · 중앙 회의 연출석 → 업무 맡기기');request.type='button';request.dataset.department=id;request.style.left=(room.x+room.width-180)+'px';request.style.top=(room.y+76)+'px';request.style.width='170px';request.hidden=selectedDepartment!==id;request.setAttribute('aria-label',owner.name+'에게 업무 요청');request.addEventListener('click',()=>openActor(owner));overlays.append(request);}
        if(capacity!==null&&capacity>members.length){const empty=node('div','office-team-vacancies');empty.style.left=(room.x+24)+'px';empty.style.top=(room.y+room.height-46)+'px';for(let index=0;index<Math.min(3,capacity-members.length);index++){const chair=node('span','office-empty-chair','빈');chair.title='근거가 있는 빈 자리';empty.append(chair);}overlays.append(empty);}
      }
      const section=[...($('office-directory')?.querySelectorAll('.office-directory-team')||[])].find(element=>element.dataset.department===id);
      if(section){let capacityNode=section.querySelector('.office-directory-capacity');if(!capacityNode){capacityNode=node('p','office-directory-capacity');section.querySelector('.office-directory-heading').append(capacityNode);}capacityNode.textContent=staffing;
        let metricsNode=section.querySelector('.office-team-metrics');if(!metricsNode){metricsNode=node('dl','office-team-metrics');section.querySelector('.office-directory-heading').append(metricsNode);}metricsNode.replaceChildren();
        const fields=[['처리 대기',pending],['결과 제출 / 접수',stats.known?(stats.total?stats.submitted+' / '+stats.total+' · '+percent(stats.submissionRate):'기록 없음'):'상태 미확인'],['평균 접수→제출',stats.known?minutes(stats.averageMinutes):'상태 미확인'],['만료 / 접수',stats.known?(stats.total?stats.expired+' / '+stats.total+' · '+percent(stats.expiryRate):'기록 없음'):'상태 미확인'],['최근 7일 제출',stats.known?(stats.total?ledger.weekRecorded+'건':'기록 없음'):'상태 미확인']];
        for(const [label,value]of fields){const item=node('div');item.append(node('dt','',label),node('dd','',value));metricsNode.append(item);}
      }
      const roomNode=rooms.get(id);if(roomNode){
        // Compare only this validated KST seven-day sample; absent samples keep the floor neutral.
        roomNode.dataset.recordsKnown=String(available&&recentSample>0);roomNode.dataset.recordedWeek=String(ledger.weekRecorded||0);roomNode.dataset.bottleneck=String(bottleneck);roomNode.dataset.roomState=roomState;
        roomNode.style.setProperty('--office-room-brightness',recentSample>0?String(.94+.12*(ledger.weekRecorded/recentSample)):'1');
        const inbox=roomNode.querySelector('.office-room-inbox'),count=roomNode.querySelector('.office-room-inbox-count');
        if(inbox)inbox.setAttribute('visibility',available&&stats.queued>0?'visible':'hidden');if(count)count.textContent=available&&stats.queued>0?'접수 '+stats.queued+'건':'';
      }
    }
  }

  // Insert inside office.js's IIFE; call both renderers from renderQueue().
  function officeStaffLedgerData(jobs, actorIds, now = Date.now()) {
    if (!Array.isArray(jobs)) return {known:false,total:null,recorded:null,todayRecorded:null,weekRecorded:null,waitMinutes:null,runMinutes:null};
    const ids = new Set(actorIds), rows = jobs.slice(0,128).filter(job => ids.has(job.actor_id));
    const recorded = rows.filter(job => job.status === 'RECORDED');
    const day = new Date(now + 9*3600000).toISOString().slice(0,10), midnight = Date.parse(day+'T00:00:00+09:00');
    const inPeriod = start => recorded.filter(job => stamp(job.finished_at) && Date.parse(job.finished_at) >= start && Date.parse(job.finished_at) <= now).length;
    const average = (start, end) => {
      const durations = recorded.filter(job => stamp(job[start]) && stamp(job[end])).map(job => (Date.parse(job[end])-Date.parse(job[start]))/60000).filter(value => Number.isFinite(value) && value >= 0);
      return durations.length ? durations.reduce((sum,value) => sum+value,0)/durations.length : null;
    };
    return {known:true,total:rows.length,recorded:recorded.length,todayRecorded:inPeriod(midnight),weekRecorded:inPeriod(midnight-6*86400000),waitMinutes:average('created_at','started_at'),runMinutes:average('started_at','finished_at')};
  }

  function renderOfficeBoard() {
    const container = $('office-board'); if (!container) return;
    const available = queue && ['EMPTY','AVAILABLE'].includes(queue.state), rows = available ? queue.jobs.slice(0,128) : [], now = Date.now();
    container.replaceChildren();
    container.append(node('p','office-board-note',available ? '현재 공개 대기열 '+rows.length+'건 · 최대 128건 · 제출 결과는 독립 검증 별도' : '공개 작업 기록을 확인하지 못했습니다. 진행 상태는 미확인입니다.'));
    const columns = [['접수',['QUEUED']],['실행 중',['RUNNING']],['결과 제출',['RECORDED']],['만료·보류',['BLOCKED','FAILED','ATTENTION_REQUIRED']]];
    const grid = node('div','office-board-grid');
    for (const [label,statuses] of columns) {
      const jobs = rows.filter(job => statuses.includes(job.status)), column = node('section','office-board-column'), list = node('ul','office-board-list');
      column.append(node('h3','',label+(available ? ' · '+jobs.length+'건' : ' · 미확인')));
      for (const job of [...jobs].sort((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at))) {
        const actor = actors.find(item => item.id === job.actor_id); if (!actor) continue;
        const card = node('li','office-board-job'), button = node('button','office-board-actor');
        const ended = ['RECORDED','BLOCKED','FAILED'].includes(job.status), end = ended ? Date.parse(job.finished_at) : now;
        const elapsed = (end-Date.parse(job.created_at))/60000;
        const elapsedLabel = Number.isFinite(elapsed) && elapsed >= 0 ? (ended ? job.status==='RECORDED' ? '접수→제출 ' : '접수→종료 ' : '접수 후 ')+Math.floor(elapsed)+'분' : '경과 시간 미확인';
        card.dataset.jobStatus = job.status;
        // Reuse the canonical actor index so the read-only card face matches its scene character.
        const face=svgNode('svg',{'class':'office-board-face',viewBox:'-24 -60 48 64','aria-hidden':'true'}),portrait=figure(actor,actors.indexOf(actor),{x:0,y:0}).outer;
        portrait.removeAttribute('data-office-figure');portrait.setAttribute('class','office-board-person');face.append(portrait);
        button.append(face,node('span','office-board-identity',actor.name+' · 직무와 기록 보기'),node('strong','office-board-type',types[job.job_type]),node('span','office-board-status',statusNames[job.status]),node('span','office-board-elapsed',elapsedLabel));
        button.type = 'button'; button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-controls','office-request-dialog'); button.addEventListener('click',() => openActor(actor));
        card.append(button); list.append(card);
      }
      if (!jobs.length) list.append(node('li','office-job-empty',available ? '해당 작업 기록 없음' : '작업 기록 미확인'));
      column.append(list); grid.append(column);
    }
    container.append(grid,node('p','office-board-note','만료·보류 칸에는 실행 실패와 진행 확인 필요 기록도 표시합니다. 개별 상태를 확인해 주세요.'));
  }

  function renderOfficeStaffLedger() {
    const container = $('office-staff-ledger'); if (!container) return;
    const available = queue && ['EMPTY','AVAILABLE'].includes(queue.state), jobs = available ? queue.jobs : null, now = Date.now();
    const total = officeStaffLedgerData(jobs,actors.map(actor => actor.id),now), minutes = value => value===null ? '기록 없음' : value.toLocaleString('ko-KR',{maximumFractionDigits:1})+'분';
    container.replaceChildren();
    container.append(node('p','office-ledger-summary',total.known ? '오늘 제출 '+total.todayRecorded+'건 (KST) · 현재 공개 제출 '+total.recorded+'건' : '오늘 제출·직원별 제출 기록 미확인'));
    container.append(node('p','office-ledger-note','현재 공개 대기열 최대 128건의 RECORDED 기록 기준 · 최근 7일은 한국 시간 오늘과 앞선 6일 · 과거 전체 실적은 미확인'));
    container.append(node('p','office-ledger-cost','비용 미확인 · 토큰·비용 원장이 연결되어 있지 않습니다.'));
    if (total.known && !total.recorded) container.append(node('p','office-job-empty','현재 공개 대기열에 제출 기록이 없습니다.'));
    if (!actors.length) { container.append(node('p','office-job-empty','직원 명부를 확인하지 못했습니다.')); return; }
    const scroll = node('div','office-ledger-scroll'), table = node('table','office-ledger-table'), header = node('tr'), head = node('thead'), body = node('tbody');
    table.append(node('caption','','직원별 제출 기록 · 소요 시간은 제출 기록의 평균'));
    for (const label of ['직원','오늘 제출','최근 7일 제출','공개 제출','접수→시작','시작→제출']) { const cell = node('th','',label); cell.scope='col'; header.append(cell); }
    head.append(header); table.append(head);
    for (const actor of actors) {
      const data = officeStaffLedgerData(jobs,[actor.id],now), row = node('tr','office-ledger-row'), name = node('th','',actor.name); name.scope='row'; row.dataset.actorId=actor.id; row.append(name);
      for (const value of [data.todayRecorded,data.weekRecorded,data.recorded]) row.append(node('td','',value===null ? '미확인' : value+'건'));
      row.append(node('td','',data.known ? minutes(data.waitMinutes) : '미확인'),node('td','',data.known ? minutes(data.runMinutes) : '미확인')); body.append(row);
    }
    table.append(body); scroll.append(table); container.append(scroll);
  }

  function buildOfficeInstruction(completion, scope = '', deadline = '') {
    const values = [completion,scope,deadline];
    if (values.some(value => typeof value !== 'string' || /[\p{Cc}\p{Cf}\u2028\u2029\u034f]/u.test(value))) throw Error('요청은 숨은 문자와 줄바꿈 없이 입력해 주세요.');
    const [goal,range,due] = values.map(value => value.trim());
    if (goal.length < 10 || /알아서/.test(goal)) throw Error('완료 조건을 10자 이상으로 구체적으로 입력해 주세요. “알아서” 대신 제출할 결과를 적어 주세요.');
    const instruction = '완료 조건: '+goal+(range ? ' | 범위: '+range : '')+(due ? ' | 기한: '+due : '');
    if (instruction.length > 1000) throw Error('완료 조건·범위·기한을 합쳐 1,000자 이내로 입력해 주세요.');
    return instruction;
  }
  function officeNextProcessing(policy, now = Date.now()) {
    if(!Number.isFinite(now)||!['HOURLY_RESEARCH_QUEUE','DAILY_0900_KST_AFTER_BRIEFING'].includes(policy))return null;
    if(policy==='HOURLY_RESEARCH_QUEUE'){const next=new Date(now);next.setUTCMinutes(15,0,0);if(next.getTime()<=now)next.setUTCHours(next.getUTCHours()+1);return next.toISOString();}
    const korea=new Date(now+9*3600000),next=Date.UTC(korea.getUTCFullYear(),korea.getUTCMonth(),korea.getUTCDate());return new Date(next<=now?next+86400000:next).toISOString();
  }
  function officeQueueMetrics(jobs, actorIds, now = Date.now()) {
    if (!Array.isArray(jobs)) return {known:false,total:0,queued:0,submitted:0,expired:0,oldestMinutes:null,submissionRate:null,averageMinutes:null,expiryRate:null};
    const ids = new Set(actorIds), rows = jobs.filter(job => ids.has(job.actor_id));
    const waiting = rows.filter(job => job.status === 'QUEUED'), submitted = rows.filter(job => job.status === 'RECORDED'), expired = rows.filter(job => job.status === 'ATTENTION_REQUIRED');
    const durations = submitted.map(job => (Date.parse(job.finished_at) - Date.parse(job.created_at)) / 60000).filter(value => Number.isFinite(value) && value >= 0);
    return {known:true,total:rows.length,queued:waiting.length,submitted:submitted.length,expired:expired.length,
      oldestMinutes:waiting.length ? Math.max(...waiting.map(job => Math.max(0,(now - Date.parse(job.created_at))/60000))) : null,
      submissionRate:rows.length ? submitted.length / rows.length : null,
      averageMinutes:durations.length ? durations.reduce((sum,value) => sum + value,0) / durations.length : null,
      expiryRate:rows.length ? expired.length / rows.length : null};
  }
  function officeRoomCapacity(groups, department, name, memberIds) {
    // The public policy lists roles, without an approved staffing capacity.
    return null;
  }

  if (!$('office-panel')) return;
  $('office-department').addEventListener('change',filterDepartment);
  $('office-focus-request')?.addEventListener('click',()=>{if(selected)openActor(selected);});
  $('office-demo')?.addEventListener('click',startMeeting);
  $('office-meeting-exit')?.addEventListener('click',finishMeeting);
  $('office-meeting-mode')?.addEventListener('click',()=>{meetingRecordsOnly=!meetingRecordsOnly;$('office-meeting-mode').textContent=meetingRecordsOnly?'상시 담당 업무 보기':'실제 기록 보고 보기';$('office-meeting-mode').setAttribute('aria-pressed',String(meetingRecordsOnly));showMeetingReport(meetingIndex,false);updateSceneVisibility();});
  $('office-pause')?.addEventListener('click',toggleMotion);
  $('office-zoom-out')?.addEventListener('click',()=>setZoom(zoom-.2));
  $('office-zoom-in')?.addEventListener('click',()=>setZoom(zoom+.2));
  $('office-zoom-reset')?.addEventListener('click',finishMeeting);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitScene).observe($('office-map'));
  else window.addEventListener('resize',fitScene);
  if(typeof IntersectionObserver!=='undefined')new IntersectionObserver(entries=>{sceneInView=entries[0]?.isIntersecting??true;syncMotion();}).observe($('office-map'));
  reducedMotion?.addEventListener?.('change',syncMotion);
  const map=$('office-map');let drag=null;
  map.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'||event.target.closest?.('button')||event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:map.scrollLeft,top:map.scrollTop};map.setPointerCapture?.(event.pointerId);map.classList.add('is-panning');});
  map.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;map.scrollLeft=drag.left-(event.clientX-drag.x);map.scrollTop=drag.top-(event.clientY-drag.y);});
  const stopPan=()=>{if(drag)map.releasePointerCapture?.(drag.id);drag=null;map.classList.remove('is-panning');};
  map.addEventListener('pointerup',stopPan);map.addEventListener('pointercancel',stopPan);
  const adjacentRoom=direction=>{const ids=['MEETING',...roomLayout().map(room=>room.id),'CHAIRPERSON'],index=ids.indexOf(selectedDepartment);$('office-department').value=ids[(Math.max(0,index)+direction+ids.length)%ids.length];filterDepartment();};
  map.addEventListener('keydown',event=>{if(event.target!==map||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();adjacentRoom(event.key==='ArrowRight'?1:-1);});
  let touchOrigin=null;
  map.addEventListener('touchstart',event=>{const touch=event.touches[0];touchOrigin=touch&&map.clientWidth<600&&!event.target.closest?.('button')&&selectedDepartment!=='ALL'?{x:touch.clientX,y:touch.clientY}:null;},{passive:true});
  map.addEventListener('touchend',event=>{const start=touchOrigin,touch=event.changedTouches[0];touchOrigin=null;if(!start||!touch)return;const dx=touch.clientX-start.x,dy=touch.clientY-start.y;if(Math.abs(dx)>80&&Math.abs(dx)>Math.abs(dy)*1.5)adjacentRoom(dx<0?1:-1);},{passive:true});
  $('office-assignee').addEventListener('change',()=>{if(submitting)return;const actor=actors.find(item=>item.id===$('office-assignee').value);if(actor){const kind=$('office-job-type').value;openActor(actor,$('office-instruction').value);$('office-job-type').value=kind;}});
  $('office-request-form').addEventListener('submit',submit);
  $('office-lobby-request').addEventListener('click',()=>{const actor=actors.find(item=>item.id==='ZERO_FINAL_MANAGER');if(actor)openActor(actor);});
  const switchOfficeView=board=>{$('office-board').hidden=!board;$('office-scene-surface').hidden=board;$('office-meeting').hidden=board;$('office-view-board').setAttribute('aria-pressed',String(board));$('office-view-scene').setAttribute('aria-pressed',String(!board));if(!board)fitScene();syncMotion();};
  $('office-view-board').addEventListener('click',()=>switchOfficeView(true));$('office-view-scene').addEventListener('click',()=>switchOfficeView(false));
  document.addEventListener?.('zero-view-changed',event=>{if(event.detail?.view==='team'){finishMeeting();switchOfficeView(false);loadPromise=load();loadPromise.catch(()=>{});}syncMotion();});
  $('office-request-close').addEventListener('click',()=>$('office-request-dialog').close());
  $('office-reload').addEventListener('click',()=>{if(!submitting)load();});
  $('office-loading-retry')?.addEventListener('click',()=>{if(!submitting)load();});
  $('office-request-dialog').addEventListener('close',()=>{if(!submitting)$('office-instruction').value='';});
  window.ZEROOffice={load,requestResearch};
  const visible=()=>!document.hidden && !$('team-view')?.hidden;
  setInterval(()=>{updateEncounters(150);fitChatter();},150);
  setInterval(()=>{if(visible() && motionAllowed())rotateChatter();},5000);
  setInterval(()=>{if(visible() && !submitting){loadPromise=load();loadPromise.catch(()=>{});}},30000);
  document.addEventListener?.('visibilitychange',()=>{syncMotion();if(visible() && !submitting)load();});
  if(visible()){loadPromise=load(); loadPromise.catch(()=>{});}
})();
