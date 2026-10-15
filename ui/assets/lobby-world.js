/* ZERO office rules around pinned javascript-astar: no network, prices, orders or account access. */
(function (make) {
  if (typeof module === 'object' && module.exports) module.exports = make(require('./vendor-astar.js'));
  else window.ZEROLobbyWorld = make({Graph: window.Graph, astar: window.astar});
})(function (search) {
  'use strict';
  const CELL = 2, WIDTH = 160, HEIGHT = 100;
  const FICTION_NOTICE='가상 직원의 연출 대사 · 실제 계좌 확인 결과 아님';
  function validateChatterSeed(rows) {
    const fields=['id','team','persona','market','time','weather','text'];
    if (!Array.isArray(rows)||rows.length!==50) return null;
    for (let i=0;i<rows.length;i++) {
      const row=rows[i];
      if (!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==fields.length||!fields.every(key=>Object.hasOwn(row,key))||row.id!==i+1||!['all','zero_team','my_office'].includes(row.team)||!['common','value','momentum','dividend','risk'].includes(row.persona)||!['any','bull','bear','sideways'].includes(row.market)||!['morning_coffee','lunch_hungry','afternoon','night_overtime','late_comfort'].includes(row.time)||!['any','clear','cloud','fog','rain','snow','storm','cold','hot'].includes(row.weather)||typeof row.text!=='string'||!row.text.trim()||row.text.length>500||/[<>\x00-\x1f\x7f]/.test(row.text)) return null;
      if (/[{}]/.test(row.text.replace(/\{(?:trend_keyword|weather)\}/g,''))) return null;
    }
    return Object.freeze(rows.map(row=>Object.freeze({...row})));
  }
  function chatterContext(logic, context, npc={}) {
    const hour=logic.kstParts(context.now || new Date()).hour;
    const time=hour<6||hour>=23?'late_comfort':hour<11?'morning_coffee':hour<13?'lunch_hungry':hour<18?'afternoon':'night_overtime';
    const own=context.mode==='own',official=context.mode==='zero',visible=own||official;
    const personas={VALUE:'value',TREND:'momentum',DIVIDEND:'dividend',VOLATILITY:'risk'};
    return {time,team:official?'zero_team':own?'my_office':'common',persona:visible?(personas[npc.strategy_persona]||personas[npc.persona]||(official?personas[npc.display_persona]:null)||'common'):'common',weather:logic.weatherKind(context.weather?.code)||'unknown',market:marketContext(context.market_quote,Number(context.now||new Date()))};
  }
  function marketContext(quote,now=Date.now()) {
    if(!quote||typeof quote!=='object'||typeof quote.price!=='number'||!Number.isFinite(quote.price)||quote.price<=0||typeof quote.previous_close!=='number'||!Number.isFinite(quote.previous_close)||quote.previous_close<=0||typeof quote.market_time!=='string'||!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(quote.market_time)||typeof quote.source_url!=='string'||!/^https:\/\/query[12]\.finance\.yahoo\.com\/v8\/finance\/chart\/(?:%5EKS11|%5EGSPC)$/.test(quote.source_url)||!Number.isFinite(now))return 'unknown';
    const time=Date.parse(quote.market_time);if(!Number.isFinite(time)||time>now+300000||now-time>72*3600000)return 'unknown';
    const change=(quote.price/quote.previous_close-1)*100;if(!Number.isFinite(change))return 'unknown';
    // Roundoff at exactly +/-0.5% must not turn a neutral reference interval into a direction.
    return change>0.5+1e-10?'bull':change< -0.5-1e-10?'bear':'sideways';
  }
  function safeTrendData(logic,data) {
    if(data?.schema_version!==1||typeof data.fallback!=='boolean'||!Array.isArray(data.safe_keywords)||data.safe_keywords.length>200||typeof data.safe_keyword!=='string') return null;
    const seen=new Set(),safe_keywords=data.safe_keywords.map(value=>logic.safeTrendKeyword(value)).filter(value=>{if(!value||seen.has(value.toLowerCase()))return false;seen.add(value.toLowerCase());return true;}).slice(0,10);
    const safe_keyword=logic.safeTrendKeyword(data.safe_keyword);
    const trusted=!!safe_keyword&&safe_keywords.includes(safe_keyword);
    return {safe_keyword:trusted?safe_keyword:safe_keywords[0]||null,safe_keywords,fallback:data.fallback||!trusted};
  }
  function seededChatter(logic, context, recent, rng) {
    const seed=validateChatterSeed(context.seed); if (!seed) return null;
    const scene=chatterContext(logic,context,context.npc),temp=context.weather?.temp;
    const weathers=[scene.weather]; if (typeof temp==='number'&&Number.isFinite(temp)) { if(temp<=3) weathers.push('cold'); else if(temp>=29) weathers.push('hot'); }
    const safe=logic.safeTrendKeyword(context.safe_keyword),fallback=context.trendFallback!==false||!safe;
    const keyword=safe||'잠깐 휴식';
    const weather={clear:'맑음',cloud:'흐림',fog:'안개',rain:'비',snow:'눈',storm:'천둥',unknown:'날씨 확인 전'}[scene.weather];
    const choices=seed.filter(row=>(row.team==='all'||row.team===scene.team)&&(row.persona==='common'||row.persona===scene.persona)&&row.time===scene.time&&(row.market==='any'||row.market===scene.market)&&(row.weather==='any'||weathers.includes(row.weather))&&!(fallback&&row.text.includes('{trend_keyword}')&&/검색|실시간|트렌드|화제|들썩/.test(row.text)))
      .map(row=>row.text.replace(/\{trend_keyword\}/g,()=>keyword).replace(/\{weather\}/g,()=>row.weather==='cold'?'쌀쌀함':row.weather==='hot'?'더움':weather)).filter(text=>!recent.includes(text));
    return choices.length?choices[Math.min(choices.length-1,Math.floor(rng()*choices.length))]:null;
  }
  function createWorld(npcs, space, floor, layout, layoutApi) {
    const saved=layoutApi?.validate(layout);
    if(saved){
      const tiles=layoutApi.collision(saved);
      if(Array.isArray(tiles)&&tiles.length===16&&tiles.every(column=>Array.isArray(column)&&column.length===10&&column.every(value=>value===0||value===1||value===false||value===true))){
        const grid=Array.from({length:WIDTH/CELL},(_,x)=>Array.from({length:HEIGHT/CELL},(_,y)=>tiles[Math.floor(x*CELL/10)][Math.floor(y*CELL/10)]?1:0));
        const world={grid,graph:new search.Graph(grid),floor:{minX:1,maxX:159,minY:1,maxY:99},layout:saved,layers:{collision:grid,objects:saved.objects},locations:[]};
        // The shared validator checks paths from tile (8,9); keep actors in that same component.
        const visited=new Set(),area=[],start=cell({x:85,y:95}),queue=grid[start.x]?.[start.y]?[start]:[];
        visited.add(start.x+','+start.y);
        for(let i=0;i<queue.length;i++){const p=queue[i];area.push(point(world,p));for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=p.x+dx,ny=p.y+dy,k=nx+','+ny;if(grid[nx]?.[ny]&&!visited.has(k)){visited.add(k);queue.push({x:nx,y:ny});}}}
        if(area.length){
          world.spawns=area;
          saved.objects.filter(o=>['coffee','sofa','meeting','billboard'].includes(o.kind)).forEach(o=>{const position=objectApproach(world,o,area[0]);if(position)world.locations.push({id:o.kind+':'+o.id,kind:o.kind,activity:o.kind==='coffee'?'coffee':'idle',position});});
          return world;
        }
      }
    }
    const grid = Array.from({length: WIDTH / CELL}, (_, x) => Array.from({length: HEIGHT / CELL}, (_, y) =>
      x * CELL <= floor.maxX && (x + 1) * CELL >= floor.minX && y * CELL <= floor.maxY && (y + 1) * CELL >= floor.minY ? 1 : 0));
    // SkyOffice Game.ts (MIT) separates collidable objects from interaction locations; no upstream code/assets copied.
    const objects=[];
    const block = (id,left, top, right, bottom) => {objects.push({id,left,top,right,bottom,collides:true});grid.forEach((column, x) => column.forEach((_, y) => {
      const px = (x + .5) * CELL, py = (y + .5) * CELL;
      if (px >= left && px <= right && py >= top && py <= bottom) grid[x][y] = 0;
    }));};
    block('meeting-table',60, 26, 100, 36);
    npcs.filter(npc => npc.kind !== 'manager').forEach(npc => {
      const p = npc.home || npc.pos; block('desk:'+npc.id,p.x - 3, p.y - 3, p.x + 3, p.y - 1);
    });
    if (space?.props?.includes('coffee')) block('coffee',3, 25, 12, 34);
    if (space?.props?.includes('sofa')) block('sofa',145, 53, 158, 59);
    const locations=[{id:'meeting',activity:'reading',position:{x:80,y:40}},{id:'window',activity:'reading',position:{x:144,y:32}},{id:'review',activity:'reading',position:{x:96,y:62}}];
    if(space?.props?.includes('coffee'))locations.unshift({id:'coffee',activity:'coffee',position:{x:15,y:32}});
    return {grid, graph: new search.Graph(grid), floor,layers:{collision:grid,objects},locations};
  }
  const OBJECT_SIZE={desk:[2,1],server:[1,2],billboard:[4,1],meeting:[3,2],partition:[1,2],plant:[1,1],coffee:[1,1],guestbook:[1,1],portal:[1,1],sofa:[2,1],standingdesk:[1,1]};
  function objectBounds(object){let [w,h]=OBJECT_SIZE[object.kind];if(object.rotation===90||object.rotation===270)[w,h]=[h,w];return {left:object.x*10,top:object.y*10,right:(object.x+w)*10,bottom:(object.y+h)*10};}
  function objectAt(world,position){return world.layout?.objects.find(object=>{const b=objectBounds(object);return position.x>=b.left&&position.x<b.right&&position.y>=b.top&&position.y<b.bottom;})||null;}
  function spawn(world,preferred,occupied=[]){
    const points=world.spawns||world.graph.nodes.filter(n=>!n.isWall()).map(n=>point(world,n));
    if(canStand(world,preferred)&&points.some(p=>cell(p).x===cell(preferred).x&&cell(p).y===cell(preferred).y)&&!occupied.some(other=>Math.hypot(other.x-preferred.x,other.y-preferred.y)<(world.layout?10:4)))return {...preferred};
    let best=null,score=Infinity;
    for(const p of points){if(!canStand(world,p)||occupied.some(other=>Math.hypot(other.x-p.x,other.y-p.y)<(world.layout?10:4)))continue;const d=Math.hypot(p.x-preferred.x,p.y-preferred.y);if(d<score){score=d;best=p;}}
    return best?{...best}:null;
  }
  function objectApproach(world,object,from){
    const actual=world.layout?.objects.find(row=>row.id===object?.id);if(!actual)return null;
    const b=objectBounds(actual),cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
    const sides=[{x:cx,y:b.bottom+1},{x:b.left-1,y:cy},{x:cx,y:b.top-1},{x:b.right+1,y:cy}];
    const preferred=(actual.rotation||0)/90;
    const perimeter=[...sides];for(let x=b.left+5;x<b.right;x+=10)perimeter.push({x,y:b.top-1},{x,y:b.bottom+1});for(let y=b.top+5;y<b.bottom;y+=10)perimeter.push({x:b.left-1,y},{x:b.right+1,y});
    const candidates=perimeter.filter(p=>canStand(world,p)&&(!world.spawns||world.spawns.some(s=>cell(s).x===cell(p).x&&cell(s).y===cell(p).y))&&(!from||Math.hypot(p.x-from.x,p.y-from.y)<.01||route(world,from,p).length));
    if(['desk','standingdesk'].includes(actual.kind)&&candidates.includes(sides[preferred]))return {...sides[preferred]};
    candidates.sort((a,b)=>Math.hypot(a.x-(from?.x||cx),a.y-(from?.y||cy))-Math.hypot(b.x-(from?.x||cx),b.y-(from?.y||cy)));
    return candidates[0]?{...candidates[0]}:null;
  }
  const cell = p => ({x: Math.max(0, Math.min(WIDTH/CELL-1, Math.floor(p.x / CELL))), y: Math.max(0, Math.min(HEIGHT/CELL-1, Math.floor(p.y / CELL)))});
  function canStand(world, p) {
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
    const f = world.floor, c = cell(p);
    return p.x >= f.minX && p.x <= f.maxX && p.y >= f.minY && p.y <= f.maxY && world.grid[c.x][c.y] === 1;
  }
  function canTraverse(world,from,to) {
    if(!canStand(world,from)||!canStand(world,to))return false;
    const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/(CELL/2)));
    for(let i=1;i<=steps;i++)if(!canStand(world,{x:from.x+(to.x-from.x)*i/steps,y:from.y+(to.y-from.y)*i/steps}))return false;
    return true;
  }
  function nearestNode(world, p) {
    const at = cell(p), direct = world.graph.grid[at.x][at.y]; if (!direct.isWall()) return direct;
    let best = null, distance = Infinity;
    world.graph.nodes.forEach(node => {
      if (node.isWall()) return;
      const d = Math.hypot((node.x + .5) * CELL - p.x, (node.y + .5) * CELL - p.y);
      if (d < distance) { best = node; distance = d; }
    });
    return best;
  }
  const point = (world, n) => ({x: Math.max(world.floor.minX, Math.min(world.floor.maxX, (n.x + .5) * CELL)), y: Math.max(world.floor.minY, Math.min(world.floor.maxY, (n.y + .5) * CELL))});
  function route(world, from, to) {
    if(!canStand(world,from)||!to||!Number.isFinite(to.x)||!Number.isFinite(to.y))return [];
    const start = nearestNode(world, from), end = nearestNode(world, to);
    if (!start || !end) return [];
    const nodes = search.astar.search(world.graph, start, end);
    if (start !== end && !nodes.length) return [];
    const points = [point(world, start), ...nodes.map(n => point(world, n))];
    if (canStand(world, to)) points.push({x: to.x, y: to.y});
    const path=points.filter((p, index) => {
      const before = index ? points[index - 1] : from, after = points[index + 1];
      if (Math.hypot(p.x - before.x, p.y - before.y) < .01) return false;
      return !after || (p.x - before.x) * (after.y - p.y) !== (p.y - before.y) * (after.x - p.x);
    });
    let previous=from;for(const waypoint of path){if(!canTraverse(world,previous,waypoint))return [];previous=waypoint;}
    return path;
  }
  // Park et al., generative_agents Persona.move (Apache-2.0): architectural perceive/plan/execute separation only, no LLM or source copied.
  function perceiveNpc(world,npc,scene) {
    const now=scene.now,state=npc.behavior?.state||'WORK',until=npc.behavior?.until||0;
    const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,a.y-b.y):Infinity;
    return {phase:'PERCEIVE',now,allowed:!npc.hidden&&Number.isFinite(now)&&scene.active===true&&!scene.paused&&!scene.hidden&&!scene.reduced&&canStand(world,npc.pos),state,until,due:now>=until,at_home:distance(npc.pos,npc.home)<0.5,moving:!!npc.motion,speaking:scene.speaking===true,player_near:distance(npc.pos,scene.player)<12,stationary:!world.layout&&(npc.kind==='manager'||npc.kind==='product'),room_busy:scene.roaming>=3,hour:scene.hour,
      locations:world.locations.filter(point=>canStand(world,point.position)&&distance(point.position,scene.player)>=6&&!(scene.reserved||[]).some(position=>distance(point.position,position)<4)).map(point=>({...point,position:{...point.position}}))};
  }
  function planNpc(npc,seen,rng=Math.random) {
    const base={phase:'PLAN',now:seen.now,state:seen.state,until:seen.until,activity:npc.behavior?.activity||(npc.kind==='staff'?'typing':'reading'),target:npc.behavior?.target?{...npc.behavior.target}:undefined};
    if(!seen.allowed||seen.moving||seen.speaking||seen.player_near)return {...base,intent:'WAIT'};
    if(seen.stationary)return {...base,intent:'WORK'};
    if(seen.state==='REST'&&!seen.due)return {...base,intent:'REST'};
    if(seen.state==='BLOCKED'&&!seen.due)return {...base,intent:'WAIT'};
    if(!seen.at_home)return {...base,intent:'RETURN',target:{...npc.home},activity:npc.homeActivity||(npc.kind==='staff'?'typing':'reading')};
    if(seen.room_busy||!seen.locations.length)return {...base,intent:'WORK'};
    const coffee=seen.hour>=6&&seen.hour<11?seen.locations.find(point=>(point.kind||point.id)==='coffee'):null;
    const sofa=seen.hour>=11&&seen.hour<13?seen.locations.find(point=>point.kind==='sofa'):null;
    const goal=coffee||sofa||seen.locations[Math.min(seen.locations.length-1,Math.max(0,Math.floor(rng()*seen.locations.length)))];
    return {...base,intent:'WALK',target:{...goal.position},activity:goal.activity};
  }
  function executeNpc(world,npc,plan) {
    const base={phase:'ACT',intent:plan.intent,state:plan.state,until:plan.until,activity:plan.activity,target:plan.target?{...plan.target}:undefined,path:[]};
    if(['WAIT','REST'].includes(plan.intent))return base;
    if(plan.intent==='WORK')return {...base,state:'WORK',until:0};
    if(!['WALK','RETURN'].includes(plan.intent))return {...base,state:'BLOCKED',until:plan.now+3000};
    if(!canStand(world,plan.target))return {...base,state:'BLOCKED',until:plan.now+3000};
    const path=route(world,npc.pos,plan.target);
    if(!path.length)return {...base,state:'BLOCKED',until:plan.now+3000};
    return {...base,state:plan.intent==='RETURN'?'RETURN':'MOVE',target:{...plan.target},until:0,path};
  }
  function rankUsers(rows) {
    const seen = new Set();
    const users = (Array.isArray(rows) ? rows : []).filter(row => {
      if (typeof row?.nick !== 'string' || !/^[0-9A-Za-z_가-힣]{2,12}$/.test(row.nick) || typeof row.return_percent !== 'number' || !Number.isFinite(row.return_percent)) return false;
      const key = row.nick.normalize('NFKC').toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true;
    }).map(row => ({nick: row.nick, percent: row.return_percent, staffCount: Number.isInteger(row.staff_count) && row.staff_count >= 0 ? row.staff_count : null}))
      .sort((a, b) => b.percent - a.percent || a.nick.localeCompare(b.nick, 'ko'));
    let rank = 0; return users.map((row, index) => { if (!index || row.percent !== users[index - 1].percent) rank = index + 1; return {...row, rank}; });
  }
  const DAY_CHAT = {
    morning: ['오늘 커피는 제가 내릴게요.', '아침에 창문을 여니 정신이 좀 드네요.', '오늘은 작은 일부터 하나씩 해 볼래요.', '책상 정리하고 시작하니까 기분이 달라요.', '물 한 잔 마시고 시작할게요.'],
    day: ['점심 먹고 잠깐 걸으니 눈이 덜 피곤해요.', '오늘 점심 메뉴, 아직 고민 중이에요.', '회의 전에 커피 한 잔 어때요?', '잠깐 스트레칭하고 다시 볼게요.', '이어폰을 빼니 사무실 소리가 들리네요.'],
    evening: ['퇴근 전에 책상부터 정리할게요.', '저녁은 집에서 먹을까, 나가서 먹을까?', '오늘도 한 가지씩 배웠네요.', '이제 어깨에 힘을 좀 빼도 되겠어요.', '마지막으로 창밖 한 번 보고 올게요.'],
    night: ['늦은 시간엔 따뜻한 차가 좋더라고요.', '화면에서 눈을 떼고 먼 곳을 잠깐 볼게요.', '내일을 위해 기록은 짧게 정리할래요.', '밤 사무실은 키보드 소리가 더 크게 들리네요.', '커피 대신 물 한 잔 더 마실게요.']
  };
  function chooseChatter(logic, context, persona, recent, rng = Math.random) {
    recent=(Array.isArray(recent)?recent:[]).slice(-12);
    const marketLines=(Array.isArray(context.analysis_lines)?context.analysis_lines:[]).filter(line=>typeof line==='string'&&line.length<=180&&!/[<>]/.test(line)&&!recent.includes(line));
    if(marketLines.length&&rng()<0.18)return marketLines[Math.min(marketLines.length-1,Math.floor(rng()*marketLines.length))];
    const seeded=seededChatter(logic,context,recent,rng); if(seeded) return seeded;
    const parts = logic.kstParts(context.now || new Date());
    const phase = logic.daypart(parts.hour), extras = DAY_CHAT[phase] || DAY_CHAT.day;
    const study = context.level >= 7 ? ['학교를 졸업했네요! 숫자의 출처도 잊지 마세요.'] : context.level > 1 ? ['퀴즈를 하나씩 풀면 모르는 말이 줄어들어요.', '오늘 배운 내용을 다음 설명에서 써 봐요.'] : ['주식이 처음이면 입문 학교부터 같이 시작해요.', '매수는 사기, 매도는 팔기예요. 학교에서 연습해 봐요.'];
    const pool = [...new Set([...logic.timeLines(parts), ...logic.dayLines(parts), ...logic.weatherLines(context.weather), ...persona, ...extras, ...study])];
    const holiday = logic.holidayNote(context.now || new Date(), context.holidays || logic.KR_HOLIDAYS); if (holiday) pool.push(holiday);
    // A missing/stale seed must not turn unconfirmed fallback subjects into observed trends.
    const contextPool = [...logic.timeLines(parts), ...logic.trendLines(context.trendFallback!==false?[]:context.trends || [])];
    const selected = rng() < 0.65 ? contextPool : pool;
    const fresh = selected.filter(line => !recent.includes(line)), rest = pool.filter(line => !recent.includes(line));
    const choices = fresh.length ? fresh : rest.length ? rest : selected;
    return choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
  }
  function chatReply(text, recent, rng = Math.random) {
    const pool = /커피|차|음료|물 한 잔/.test(text) ? ['저는 따뜻한 걸로 부탁해요.', '저도 한 잔 같이 마실래요.', '마시고 잠깐 쉬었다 와요.'] : /점심|저녁|메뉴|먹/.test(text) ? ['저는 오늘 국밥이 당겨요.', '먹고 산책까지 하면 좋겠어요.', '메뉴 정하면 저도 불러 주세요.'] : /학교|퀴즈|매수|배운/.test(text) ? ['모르면 다시 읽고 풀어도 괜찮아요.', '맞힌 이유까지 알아야 오래 기억나요.', '다음 레벨도 같이 해 봐요.'] : ['좋아요, 천천히 해 봐요.', '저도 잠깐 쉬었다가 이어갈게요.', '이야기하니 분위기가 좀 풀리네요.', '오늘도 한 가지씩 해 나가요.'];
    const fresh = pool.filter(line => !recent.includes(line)), choices = fresh.length ? fresh : pool;
    return choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
  }
  return {CELL, FICTION_NOTICE, validateChatterSeed, chatterContext, marketContext, safeTrendData, createWorld, canStand, canTraverse, route, spawn,objectAt,objectApproach,perceiveNpc,planNpc,executeNpc,rankUsers, chooseChatter, chatReply};
});
