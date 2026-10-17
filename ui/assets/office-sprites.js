/* Licensed PNG-only office visuals. Recorded jobs and DOM identity remain outside this renderer. */
(function(global){
'use strict';
const LAYERS=['body','head','eyes','eyebrows','legs','shoes','clothes','hair','accessories'],DIRECTIONS=['down','left','right','up'];
const APPEARANCE={outfit:['shirt','hoodie','vest','cardigan','suit','jacket','knit','polo'],hair:['0','1','2','3'],shoes:['dark','white','blue','red'],accessory:['none','glasses','cap','headphones'],pet:['none','cat','dog','bird']};
const handles=new Set();let raf=null,last=0,assetsPromise=null,manifestPromise=null,mediaQuery=null;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function assetPath(value,extension='png'){
  return typeof value==='string'&&value.length<=240&&new RegExp('^/assets/sprites/[A-Za-z0-9_./-]+\\.'+extension+'$').test(value)&&!value.split('/').some(part=>part==='.'||part==='..')?value:null;
}
function assetURL(path,base=global.document?.baseURI){
  if(!assetPath(path,'(?:png|txt|md|html|json)'))throw Error('SPRITES_PATH_INVALID');
  const origin=new URL(base),resolved=new URL(path.slice(1),origin);if(!['http:','https:'].includes(resolved.protocol)||resolved.origin!==origin.origin||resolved.username||resolved.password)throw Error('SPRITES_PATH_INVALID');return resolved.href;
}
function normalizeManifest(value){
  if(!value||!Array.isArray(value.sheets))throw Error('SPRITES_MANIFEST_INVALID');
  const sheets=value.sheets.map(sheet=>({...sheet,layer:sheet.layer==='pets'?'pet':sheet.layer,frameWidth:sheet.frameWidth??value.frameWidth??64,frameHeight:sheet.frameHeight??value.frameHeight??64,framesPerDirection:sheet.framesPerDirection??sheet.columns,directions:sheet.directions??['up','left','down','right'],credit_id:sheet.credit_id}));
  if(sheets.some(sheet=>sheet.rows!==undefined&&sheet.rows!==sheet.directions.length))throw Error('SPRITES_SHEET_INVALID');
  if(Array.isArray(value.tiles))return {...value,sheets};
  const atlas=value.tiles;if(!atlas||!assetPath(atlas.path)||!Number.isInteger(atlas.tileWidth)||!Number.isInteger(atlas.tileHeight)||atlas.tileWidth<1||atlas.tileHeight<1||!Number.isInteger(atlas.spacing??0)||(atlas.spacing??0)<0)throw Error('SPRITES_TILE_INVALID');
  const records=(entries,kind)=>Object.entries(entries||{}).map(([id,entry])=>{const item=typeof entry==='string'?{path:entry}:entry;if(!item||typeof item!=='object')throw Error('SPRITES_TILE_INVALID');return {id,kind,path:item.path??atlas.path,sx:item.sx??(item.column??0)*(atlas.tileWidth+(atlas.spacing??0)),sy:item.sy??(item.row??0)*(atlas.tileHeight+(atlas.spacing??0)),sw:item.sw??atlas.tileWidth,sh:item.sh??atlas.tileHeight,credit_id:item.credit_id??atlas.credit_id,...(item.parts?{parts:item.parts.map(part=>({...part,path:part.path??item.path??atlas.path,credit_id:part.credit_id??item.credit_id??atlas.credit_id}))}:{})};});
  return {...value,sheets,tiles:[...records(value.themes,'floor'),...records(value.furniture,'object')]};
}
function paletteEntries(value){
  if(value===undefined)return [];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>256)throw Error('SPRITES_PALETTE_INVALID');
  return Object.entries(value).map(([from,to])=>{if(!/^#[a-f0-9]{6}$/i.test(from)||typeof to!=='string'||!/^#[a-f0-9]{6}$/i.test(to))throw Error('SPRITES_PALETTE_INVALID');return [parseInt(from.slice(1),16),[parseInt(to.slice(1,3),16),parseInt(to.slice(3,5),16),parseInt(to.slice(5,7),16)]];});
}
function paletteImage(image,palette){
  const entries=paletteEntries(palette);if(!entries.length)return image;
  const canvas=global.document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;if(canvas.width*canvas.height>16_000_000)throw Error('SPRITES_IMAGE_INVALID');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),colors=new Map(entries);
  for(let i=0;i<pixels.data.length;i+=4){const target=colors.get((pixels.data[i]<<16)|(pixels.data[i+1]<<8)|pixels.data[i+2]);if(target&&pixels.data[i+3]){pixels.data[i]=target[0];pixels.data[i+1]=target[1];pixels.data[i+2]=target[2];}}
  ctx.putImageData(pixels,0,0);return canvas;
}
function validateManifest(value){
  value=normalizeManifest(value);
  if(!value||value.schema_version!==1||!Array.isArray(value.sheets)||value.sheets.length>400||!Array.isArray(value.tiles)||value.tiles.length>1000||!Array.isArray(value.credits)||!value.credits.length||value.credits.length>256)throw Error('SPRITES_MANIFEST_INVALID');
  const ids=new Set(),credits=new Set();
  for(const credit of value.credits){
    if(!credit||typeof credit.id!=='string'||credits.has(credit.id)||!['CC0','CC0-1.0','CC-BY-SA-3.0','CC-BY-SA-4.0'].includes(credit.license)||!assetPath(credit.license_path,'(?:txt|md|html)')||!/^[a-f0-9]{64}$/i.test(credit.sha256||''))throw Error('SPRITES_CREDIT_INVALID');
    if(!['name','author','info'].every(key=>typeof credit[key]==='string'&&credit[key].length<=2000))throw Error('SPRITES_CREDIT_INVALID');
    const source=new URL(credit.source_url);if(source.protocol!=='https:'||source.username||source.password)throw Error('SPRITES_CREDIT_INVALID');credits.add(credit.id);
  }
  for(const sheet of value.sheets){
    if(!sheet||typeof sheet.id!=='string'||ids.has(sheet.id)||![...LAYERS,'pet'].includes(sheet.layer)||typeof sheet.variant!=='string'||!['idle','walk','sit','coffee'].includes(sheet.action)||!assetPath(sheet.path)||(sheet.layer==='pet'?!Number.isInteger(sheet.frameWidth)||!Number.isInteger(sheet.frameHeight)||sheet.frameWidth<1||sheet.frameHeight<1||sheet.frameWidth>128||sheet.frameHeight>128:sheet.frameWidth!==64||sheet.frameHeight!==64)||!Number.isInteger(sheet.framesPerDirection)||sheet.framesPerDirection<1||sheet.framesPerDirection>32||!Array.isArray(sheet.directions)||sheet.directions.length<1||sheet.directions.length>4||new Set(sheet.directions).size!==sheet.directions.length||(sheet.layer!=='pet'&&sheet.directions.length!==4)||!sheet.directions.every(dir=>DIRECTIONS.includes(dir))||!credits.has(sheet.credit_id)||sheet.fps!==undefined&&(!finite(sheet.fps)||sheet.fps<1||sheet.fps>30))throw Error('SPRITES_SHEET_INVALID');if(!['frameOffsetX','frameOffsetY'].every(key=>sheet[key]===undefined||Number.isInteger(sheet[key])&&sheet[key]>=0&&sheet[key]<=8192))throw Error('SPRITES_SHEET_INVALID');paletteEntries(sheet.palette);ids.add(sheet.id);
  }
  for(const tile of value.tiles){
    if(!tile||typeof tile.id!=='string'||ids.has(tile.id)||!['floor','object'].includes(tile.kind)||!assetPath(tile.path)||!['sx','sy','sw','sh'].every(key=>Number.isInteger(tile[key])&&tile[key]>=0)||!tile.sw||!tile.sh||tile.sw>2048||tile.sh>2048||!credits.has(tile.credit_id))throw Error('SPRITES_TILE_INVALID');
    if(tile.parts!==undefined&&(!Array.isArray(tile.parts)||tile.parts.length>24))throw Error('SPRITES_TILE_INVALID');
    for(const part of tile.parts||[])if(!part||!assetPath(part.path)||!credits.has(part.credit_id)||!['sx','sy','sw','sh','dx','dy'].every(key=>Number.isInteger(part[key])&&part[key]>=0)||!part.sw||!part.sh||!finite(part.dw??part.sw)||!finite(part.dh??part.sh)||(part.dw??part.sw)<=0||(part.dh??part.sh)<=0||part.dx+(part.dw??part.sw)>tile.sw||part.dy+(part.dh??part.sh)>tile.sh)throw Error('SPRITES_TILE_INVALID');
    ids.add(tile.id);
  }
  const creditById=new Map(value.credits.map(credit=>[credit.id,credit]));
  const pathCredits=new Map();for(const record of [...value.sheets,...value.tiles,...value.tiles.flatMap(tile=>tile.parts||[])]){const declared=creditById.get(record.credit_id)?.path;if(declared!==undefined&&declared!==record.path)throw Error('SPRITES_CREDIT_INVALID');if(pathCredits.has(record.path)&&pathCredits.get(record.path)!==record.credit_id)throw Error('SPRITES_CREDIT_INVALID');pathCredits.set(record.path,record.credit_id);}
  return value;
}
function appearanceOf(value={}){value=value&&typeof value==='object'?value:{};return Object.fromEntries(Object.entries(APPEARANCE).map(([key,list])=>[key,list.includes(value[key])?value[key]:list[0]]));}
function facingOf(value){return Number.isInteger(value)&&value>=0&&value<4?DIRECTIONS[value]:DIRECTIONS.includes(value)?value:'down';}
function actionOf(activity){return activity==='walking'?'walk':activity==='typing'?'sit':activity==='coffee'?'coffee':'idle';}
function frameRect(sheet,elapsed,facing,moving=true){
  const frame=moving?Math.floor(Math.max(0,elapsed)*(sheet.fps||8))%sheet.framesPerDirection:0;
  return {sx:(sheet.frameOffsetX||0)+frame*sheet.frameWidth,sy:(sheet.frameOffsetY||0)+Math.max(0,sheet.directions.indexOf(facingOf(facing)))*sheet.frameHeight,sw:sheet.frameWidth,sh:sheet.frameHeight};
}
const FALLBACK_FURNITURE={desk:{width:2,height:1},server:{width:1,height:2},billboard:{width:4,height:1},meeting:{width:3,height:2},partition:{width:1,height:2},plant:{width:1,height:1},coffee:{width:1,height:1},guestbook:{width:1,height:1},portal:{width:1,height:1},sofa:{width:2,height:1},standingdesk:{width:1,height:1},chair:{width:1,height:1},bookshelf:{width:2,height:1},cabinet:{width:2,height:1},lamp:{width:1,height:1},rug:{width:3,height:2},whiteboard:{width:2,height:1},water:{width:1,height:1},printer:{width:1,height:1},arcade:{width:1,height:1}};
const nodeLayout=typeof require==='function'?require('./office-layout.js'):null;
function layoutOf(value={}){
  value=value&&typeof value==='object'?value:{};
  const schema=global.ZEROOfficeLayout||nodeLayout,modern=value.version===1;
  if(modern&&schema?.validate){const validated=schema.validate(value);if(!validated)return {floor:'wallstreet',objects:[]};value=validated;}
  const definitions=schema?.FURNITURE||FALLBACK_FURNITURE,seen=new Set(),objects=[];
  for(const item of Array.isArray(value.objects)?value.objects.slice(0,modern?60:160):[]){
    if(!item||seen.has(item.id)||!(modern?Number.isInteger(item.id)&&item.id>0&&item.id<=2147483647:typeof item.id==='string'||Number.isInteger(item.id))||![item.x,item.y].every(finite)||![0,90,180,270].includes(item.rotation??0))continue;
    const rotation=item.rotation??0,rotated=rotation===90||rotation===270,definition=Object.hasOwn(definitions,item.kind)?definitions[item.kind]:null,sourceW=definition?.width??(rotated?(item.h??1):(item.w??1)),sourceH=definition?.height??(rotated?(item.w??1):(item.h??1)),w=rotated?sourceH:sourceW,h=rotated?sourceW:sourceH;
    if(modern&&!definition||!Number.isInteger(w)||!Number.isInteger(h)||w<=0||h<=0||item.x<0||item.y<0||item.x+w>16||item.y+h>10)continue;
    seen.add(item.id);objects.push({...item,w,h,sourceW,sourceH,rotation});
  }
  return {floor:typeof value.floor==='string'?value.floor:typeof value.theme==='string'?value.theme:'wood',objects};
}
function blockedCells(layout){const blocked=new Set();for(const object of layout.objects)if(object.solid!==false)for(let x=Math.floor(object.x);x<Math.ceil(object.x+object.w);x++)for(let y=Math.floor(object.y);y<Math.ceil(object.y+object.h);y++)blocked.add(y*16+x);return blocked;}
const cellOf=pos=>Math.max(0,Math.min(9,Math.floor(pos.y/10)))*16+Math.max(0,Math.min(15,Math.floor(pos.x/10)));
const centerOf=cell=>({x:(cell%16)*10+5,y:Math.floor(cell/16)*10+5});
function safePath(start,end,blocked){
  const first=cellOf(start),goal=cellOf(end);if(blocked.has(first)||blocked.has(goal))return [];
  const queue=[first],previous=new Map([[first,null]]);
  for(let i=0;i<queue.length&&!previous.has(goal);i++){
    const cell=queue[i],x=cell%16,y=Math.floor(cell/16);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,next=ny*16+nx;if(nx>=0&&nx<16&&ny>=0&&ny<10&&!blocked.has(next)&&!previous.has(next)){previous.set(next,cell);queue.push(next);}}
  }
  if(!previous.has(goal))return [];const path=[];for(let at=goal;at!==first;at=previous.get(at))path.push(centerOf(at));return path.reverse();
}
function nearestFree(pos,blocked){const cells=Array.from({length:160},(_,i)=>i).filter(i=>!blocked.has(i));cells.sort((a,b)=>Math.hypot(centerOf(a).x-pos.x,centerOf(a).y-pos.y)-Math.hypot(centerOf(b).x-pos.x,centerOf(b).y-pos.y));return cells.length?centerOf(cells[0]):null;}
function lagPoint(trail,lag=10){let remaining=lag;for(let i=trail.length-1;i>0;i--){const a=trail[i],b=trail[i-1],distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance>=remaining)return {x:a.x+(b.x-a.x)*remaining/distance,y:a.y+(b.y-a.y)*remaining/distance};remaining-=distance;}return trail[0];}
function petStep(record,target,blocked,dt){
  if(!record.pos||blocked.has(cellOf(record.pos)))record.pos=nearestFree(target,blocked);
  if(!record.pos)return null;
  const destination=blocked.has(cellOf(target))?nearestFree(target,blocked):target;if(!destination)return record.pos;
  const goal=cellOf(destination);
  if(record.goal!==goal||record.path?.some(point=>blocked.has(cellOf(point)))){record.goal=goal;record.path=safePath(record.pos,destination,blocked);}
  if(!record.path?.length&&cellOf(record.pos)===goal&&Math.hypot(destination.x-record.pos.x,destination.y-record.pos.y)>.01)record.path=[{...destination}];
  let budget=Math.min(.1,Math.max(0,dt))*28;
  while(record.path?.length&&budget>0){const next=record.path[0],distance=Math.hypot(next.x-record.pos.x,next.y-record.pos.y);if(distance<=budget){record.pos={...next};record.path.shift();budget-=distance;}else{record.pos={x:record.pos.x+(next.x-record.pos.x)*budget/distance,y:record.pos.y+(next.y-record.pos.y)*budget/distance};budget=0;}}
  return record.pos;
}
async function loadManifest(){
  if(!manifestPromise)manifestPromise=(async()=>{const response=await global.fetch(assetURL('/'+'assets/sprites/manifest.json'),{credentials:'same-origin',cache:'force-cache',redirect:'error'});if(!response.ok)throw Error('SPRITES_UNAVAILABLE');const text=await response.text();if(text.length>1_000_000)throw Error('SPRITES_MANIFEST_INVALID');return validateManifest(JSON.parse(text));})().catch(error=>{manifestPromise=null;throw error;});return manifestPromise;
}
async function loadAssets(){
  if(!assetsPromise)assetsPromise=(async()=>{
    const manifest=await loadManifest(),images=new Map();
    await Promise.all([...new Set([...manifest.sheets,...manifest.tiles,...manifest.tiles.flatMap(tile=>tile.parts||[])].map(item=>item.path))].map(async path=>{const image=new global.Image();image.src=assetURL(path);await image.decode();if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>8192||image.naturalHeight>8192)throw Error('SPRITES_IMAGE_INVALID');images.set(path,image);}));
    for(const sheet of manifest.sheets){const image=images.get(sheet.path);if(image.naturalWidth<(sheet.frameOffsetX||0)+sheet.framesPerDirection*sheet.frameWidth||image.naturalHeight<(sheet.frameOffsetY||0)+sheet.directions.length*sheet.frameHeight)throw Error('SPRITES_IMAGE_INVALID');}
    for(const tile of [...manifest.tiles,...manifest.tiles.flatMap(tile=>tile.parts||[])]){const image=images.get(tile.path);if(tile.sx+tile.sw>image.naturalWidth||tile.sy+tile.sh>image.naturalHeight)throw Error('SPRITES_IMAGE_INVALID');}
    const sheetImages=new Map(),paletteCache=new Map();for(const sheet of manifest.sheets){const key=sheet.path+'|'+JSON.stringify(sheet.palette??{});if(!paletteCache.has(key))paletteCache.set(key,paletteImage(images.get(sheet.path),sheet.palette));sheetImages.set(sheet.id,paletteCache.get(key));}
    return {manifest,images,sheetImages};
  })().catch(error=>{assetsPromise=null;throw error;});return assetsPromise;
}
function sheetOf(manifest,layer,variant,action){return manifest.sheets.find(item=>item.layer===layer&&item.variant===variant&&item.action===action)||manifest.sheets.find(item=>item.layer===layer&&item.variant===variant&&item.action==='idle')||manifest.sheets.find(item=>item.layer===layer&&item.variant==='default'&&item.action===action)||manifest.sheets.find(item=>item.layer===layer&&item.variant==='default'&&item.action==='idle')||null;}
function drawSprite(ctx,assets,sheet,pos,elapsed,facing,animated){if(!sheet)return;const frame=frameRect(sheet,elapsed,facing,animated);ctx.drawImage(assets.sheetImages?.get(sheet.id)||assets.images.get(sheet.path),frame.sx,frame.sy,frame.sw,frame.sh,pos.x-5,pos.y-9,10,10);}
// Original ZERO headset pixel graphic only: dedicated to CC0-1.0.
// This dedication excludes the renderer and all third-party LPC/Kenney artwork.
function paintHeadphones(ctx,facing){
  const direction=facingOf(facing),pixel=(color,x,y,w,h)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  pixel('#243447',26,15,12,2);pixel('#243447',24,17,2,8);pixel('#243447',38,17,2,8);
  pixel('#52677d',27,15,10,1);
  const ears=direction==='left'?[[22,23,true],[38,22,false]]:direction==='right'?[[23,22,false],[39,23,true]]:[[22,23,true],[39,23,true]];
  for(const [x,y,front] of ears){pixel('#172536',x,y,3,7);pixel('#40576e',x+1,y+1,2,5);if(front)pixel('#9bb5c9',x+1,y+1,1,2);}
  if(direction==='up')pixel('#34495e',26,17,12,2);
}
const headphoneImages=new Map();
function drawHeadphones(ctx,pos,facing){
  const direction=facingOf(facing);if(!headphoneImages.has(direction)){const canvas=global.document.createElement('canvas');canvas.width=64;canvas.height=64;paintHeadphones(canvas.getContext('2d'),direction);headphoneImages.set(direction,canvas);}
  ctx.drawImage(headphoneImages.get(direction),0,0,64,64,pos.x-5,pos.y-9,10,10);
}
function drawTile(ctx,assets,tile,x,y,w,h,rotation=0,sourceW=w,sourceH=h){if(!tile)return;const image=assets.images.get(tile.path);ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(rotation*Math.PI/180);const dw=sourceW,dh=sourceH;ctx.drawImage(image,tile.sx,tile.sy,tile.sw,tile.sh,-dw/2,-dh/2,dw,dh);for(const part of tile.parts||[])ctx.drawImage(assets.images.get(part.path),part.sx,part.sy,part.sw,part.sh,-dw/2+part.dx/tile.sw*dw,-dh/2+part.dy/tile.sh*dh,(part.dw??part.sw)/tile.sw*dw,(part.dh??part.sh)/tile.sh*dh);ctx.restore();}
function paint(ctx,assets,layout,actors,elapsed,animated,pets,dt){
  ctx.clearRect(0,0,160,100);ctx.imageSmoothingEnabled=false;
  const floor=assets.manifest.tiles.find(item=>item.kind==='floor'&&item.id===layout.floor);
  for(let y=0;y<10;y++)for(let x=0;x<16;x++)drawTile(ctx,assets,floor,x*10,y*10,10,10);
  const blocked=blockedCells(layout),drawables=layout.objects.map((object,index)=>({depth:(object.y+object.h)*10,index,draw:()=>drawTile(ctx,assets,assets.manifest.tiles.find(tile=>tile.kind==='object'&&tile.id===(object.kind||object.id)),object.x*10,object.y*10,object.w*10,object.h*10,object.rotation,object.sourceW*10,object.sourceH*10)}));
  const live=new Set();
  for(const [index,actor] of actors.slice(0,80).entries()){
    if(!actor||typeof actor.id!=='string'||!finite(actor.pos?.x)||!finite(actor.pos?.y)||actor.pos.x<0||actor.pos.x>160||actor.pos.y<0||actor.pos.y>100)continue;
    live.add(actor.id);const appearance=appearanceOf(actor.appearance),action=actionOf(actor.activity),facing=facingOf(actor.facing),pos=actor.pos;
    const bodies=assets.manifest.sheets.filter(sheet=>sheet.layer==='body'&&sheet.action==='idle'),bodyVariant=bodies.length?bodies[Array.from(actor.id).reduce((sum,c)=>sum+c.codePointAt(0),0)%bodies.length].variant:'default';
    const eyeVariants=assets.manifest.sheets.filter(sheet=>sheet.layer==='eyes'&&sheet.action==='idle'),eyeVariant=eyeVariants.length?eyeVariants[Array.from(actor.id).reduce((sum,c)=>sum+c.codePointAt(0),0)%eyeVariants.length].variant:'default';
    const headVariants=assets.manifest.sheets.filter(sheet=>sheet.layer==='head'&&sheet.action==='idle'),headVariant=headVariants.some(sheet=>sheet.variant===bodyVariant)?bodyVariant:headVariants.length?headVariants[Array.from(actor.id).reduce((sum,c)=>sum+c.codePointAt(0),0)%headVariants.length].variant:bodyVariant;
    const variants={body:bodyVariant,head:headVariant,eyes:eyeVariant,eyebrows:eyeVariant,legs:appearance.outfit,shoes:appearance.shoes,clothes:appearance.outfit,hair:appearance.hair,accessories:appearance.accessory};
    drawables.push({depth:pos.y,index:160+index,draw:()=>{for(const layer of LAYERS){if(layer==='accessories'&&appearance.accessory==='none')continue;if(layer==='accessories'&&appearance.accessory==='headphones')drawHeadphones(ctx,pos,facing);else drawSprite(ctx,assets,sheetOf(assets.manifest,layer,variants[layer],action),pos,elapsed,facing,animated);}}});
    if(appearance.pet!=='none'){
      let record=pets.get(actor.id);if(!record){record={trail:[{...pos}],pos:nearestFree(pos,blocked),path:[]};pets.set(actor.id,record);}
      const last=record.trail.at(-1);if(Math.hypot(pos.x-last.x,pos.y-last.y)>.1){record.trail.push({...pos});if(record.trail.length>256)record.trail.shift();}
      const before=record.pos?{...record.pos}:pos,pet=petStep(record,lagPoint(record.trail),blocked,animated?dt:0);
      if(pet){const dx=pet.x-before.x,dy=pet.y-before.y,direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>=0?'down':'up';drawables.push({depth:pet.y,index:300+index,draw:()=>drawSprite(ctx,assets,sheetOf(assets.manifest,'pet',appearance.pet,Math.hypot(dx,dy)>.01?'walk':'idle'),pet,elapsed,direction,animated)});}
    }else pets.delete(actor.id);
  }
  for(const id of pets.keys())if(!live.has(id))pets.delete(id);
  drawables.sort((a,b)=>a.depth-b.depth||a.index-b.index).forEach(item=>item.draw());
}
const reduced=()=>!!global.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function runnable(handle){return handle.active&&!handle.destroyed&&handle.assets&&!global.document.hidden&&!reduced();}
function schedule(){if(raf===null&&[...handles].some(runnable))raf=global.requestAnimationFrame(tick);}
function tick(time){raf=null;if(time-last>=1000/30){const dt=last?Math.min(.1,(time-last)/1000):0;last=time;for(const handle of handles)if(runnable(handle)){handle.elapsed+=dt;handle.render(dt,true);}}schedule();}
function sync(){if(![...handles].some(runnable)&&raf!==null){global.cancelAnimationFrame(raf);raf=null;last=0;}for(const handle of handles)if(handle.active&&handle.assets&&!global.document.hidden)handle.render(0,false);schedule();}
function attach(stage,{getActors=()=>[],getLayout=()=>({}),onObject=()=>{}}={}){
  const canvas=global.document.createElement('canvas');canvas.className='office-sprites-canvas';canvas.setAttribute('aria-hidden','true');stage.append(canvas);
  const ctx=canvas.getContext('2d'),handle={active:true,destroyed:false,assets:null,elapsed:0,pets:new Map(),render(dt,animated){const width=Math.max(160,Math.min(2048,Math.round((stage.clientWidth||640)*(global.devicePixelRatio||1)))),height=Math.round(width/1.6);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}ctx.setTransform(width/160,0,0,height/100,0,0);paint(ctx,handle.assets,layoutOf(getLayout()),getActors()||[],handle.elapsed,animated,handle.pets,dt);}};
  handles.add(handle);
  const click=event=>{if(!handle.assets||!handle.active||handle.destroyed||global.document.hidden||event.target?.closest?.('button,a,input,select,textarea,[role="button"]'))return;const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*16,y=(event.clientY-rect.top)/rect.height*10;const object=layoutOf(getLayout()).objects.filter(item=>x>=item.x&&x<item.x+item.w&&y>=item.y&&y<item.y+item.h).at(-1);if(object)onObject(object);};stage.addEventListener('click',click);
  const resize=new global.ResizeObserver(()=>{if(handle.assets&&!handle.destroyed&&handle.active&&!global.document.hidden)handle.render(0,false);});resize.observe(stage);
  if(handles.size===1){mediaQuery=global.matchMedia?.('(prefers-reduced-motion: reduce)');mediaQuery?.addEventListener?.('change',sync);global.document.addEventListener('visibilitychange',sync);}
  loadAssets().then(assets=>{if(handle.destroyed)return;handle.assets=assets;canvas.dataset.sprites='ready';sync();stage.classList?.add('office-sprites-ready');}).catch(()=>{if(!handle.destroyed)canvas.dataset.sprites='unavailable';});
  return {destroy(){if(handle.destroyed)return;handle.destroyed=true;handles.delete(handle);stage.removeEventListener('click',click);resize.disconnect();if(!handles.size){mediaQuery?.removeEventListener?.('change',sync);mediaQuery=null;global.document.removeEventListener('visibilitychange',sync);}handle.pets.clear();stage.classList?.remove('office-sprites-ready');canvas.remove();sync();},setActive(active){handle.active=active===true;sync();}};
}
async function drawLayout(canvas,layout,time=0){const assets=await loadAssets(),ctx=canvas.getContext('2d');canvas.width=640;canvas.height=400;ctx.setTransform(4,0,0,4,0,0);paint(ctx,assets,layoutOf(layout),[],time,false,new Map(),0);}
function creditSources(credit){
  const originals=Array.isArray(credit.original_urls)?credit.original_urls:typeof credit.original_urls==='string'?credit.original_urls.split(','):[];
  return [...new Set([credit.source_url,...originals].slice(0,21).filter(value=>{if(typeof value!=='string'||value.length>2000)return false;try{const url=new URL(value.trim());return url.protocol==='https:'&&!url.username&&!url.password;}catch(_){return false;}}).map(value=>value.trim()))];
}
const LICENSE_URI={'CC0':'https://creativecommons.org/publicdomain/zero/1.0/','CC0-1.0':'https://creativecommons.org/publicdomain/zero/1.0/','CC-BY-SA-3.0':'https://creativecommons.org/licenses/by-sa/3.0/','CC-BY-SA-4.0':'https://creativecommons.org/licenses/by-sa/4.0/'};
async function openCredits(){
  const manifest=await loadManifest(),dialog=global.document.createElement('dialog');dialog.className='office-sprites-credits';dialog.setAttribute('aria-label','스프라이트 원본·라이선스');
  const title=global.document.createElement('h2');title.textContent='스프라이트 원본·라이선스';dialog.append(title);const changes=global.document.createElement('p');changes.textContent='원본 PNG는 그대로 사용합니다. palette가 지정된 색상 변형은 브라우저에서 합성하며 원본 작가의 별도 작품이라고 표시하지 않습니다. 아래 라이선스는 개별 이미지의 기록이며 엔진 코드 전체의 라이선스를 뜻하지 않습니다.';dialog.append(changes);
  for(const credit of manifest.credits){const article=global.document.createElement('article');for(const text of [credit.name,credit.author+' · '+credit.license,credit.info,'SHA-256 '+credit.sha256]){const p=global.document.createElement('p');p.textContent=text;article.append(p);}for(const [label,url] of [...creditSources(credit).map((url,index)=>[index?'원본 출처 '+index:'원본 PNG',url]),['라이선스 URI',LICENSE_URI[credit.license]],['보관된 라이선스 기록',credit.license_path]]){const link=global.document.createElement('a');link.textContent=label;link.href=label==='보관된 라이선스 기록'?assetURL(url):url;link.target='_blank';link.rel='noopener noreferrer';article.append(link);}dialog.append(article);}
  const original=global.document.createElement('article');for(const text of ['ZERO 원본 픽셀 헤드셋 · CC0-1.0','작가: ZERO','64×64 Canvas 좌표의 아치·이어캡·하이라이트 그래픽만 CC0로 공개합니다. 외부 LPC 헤드폰 원본이 아니며 다른 이미지나 엔진 코드 전체를 재라이선스하지 않습니다.']){const p=global.document.createElement('p');p.textContent=text;original.append(p);}
  const source=new URL('assets/office-sprites.js',global.document.baseURI);if(['http:','https:'].includes(source.protocol)&&source.origin===new URL(global.document.baseURI).origin){const link=global.document.createElement('a');link.textContent='헤드셋 그래픽 원본 코드';link.href=source.href;link.target='_blank';link.rel='noopener noreferrer';original.append(link);}
  const license=global.document.createElement('a');license.textContent='CC0 라이선스 URI';license.href=LICENSE_URI['CC0-1.0'];license.target='_blank';license.rel='noopener noreferrer';original.append(license);dialog.append(original);
  const close=global.document.createElement('button');close.type='button';close.title='닫기';close.setAttribute('aria-label','창 닫기');close.className='icon-button icon-close';close.textContent='닫기';close.addEventListener('click',()=>dialog.close());dialog.append(close);dialog.addEventListener('close',()=>dialog.remove(),{once:true});global.document.body.append(dialog);dialog.showModal();close.focus();return dialog;
}
function installGuideCredits(){
  const guide=global.document?.getElementById?.('guide-view');if(!guide||global.document.getElementById('office-sprites-credit-button'))return;
  const button=global.document.createElement('button'),status=global.document.createElement('p');button.id='office-sprites-credit-button';button.type='button';button.textContent='그림 원본·라이선스';button.setAttribute('aria-haspopup','dialog');status.className='office-sprites-credit-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  button.addEventListener('click',async()=>{button.disabled=true;status.textContent='라이선스 기록을 불러오는 중입니다.';try{await openCredits();status.textContent='';button.textContent='그림 원본·라이선스';}catch(_){status.textContent='라이선스 기록을 불러오지 못했습니다. 다시 시도해 주세요.';button.textContent='라이선스 다시 불러오기';}finally{button.disabled=false;}});guide.append(button,status);
}
if(global.document?.readyState==='loading')global.document.addEventListener('DOMContentLoaded',installGuideCredits,{once:true});else installGuideCredits();
const api={attach,drawLayout,openCredits};global.ZEROOfficeSprites=api;
if(typeof module!=='undefined'&&module.exports)module.exports={...api,paintHeadphones,drawHeadphones,creditSources,assetURL,normalizeManifest,paletteEntries,paletteImage,validateManifest,assetPath,appearanceOf,facingOf,actionOf,frameRect,layoutOf,blockedCells,safePath,petStep,lagPoint,paint};
})(typeof window!=='undefined'?window:globalThis);
