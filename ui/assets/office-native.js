/* Original built-in office graphics: CC0-1.0 applies to artwork only, not external art or the whole module. */
(function(root){
'use strict';
const credits=Object.freeze([Object.freeze({id:'zero-native-office',name:'ZERO built-in dealing room and characters',author:'ZERO',license:'CC0-1.0',license_url:'https://creativecommons.org/publicdomain/zero/1.0/',source_file:'office-native.js',info:'ZERO가 직접 작성한 Canvas2D 그림 요소입니다. 모니터의 선은 장식이며 실제 시세가 아닙니다. 캐릭터 동작과 꾸미기는 업무 실적·수익률·계좌·주문 권한에 영향을 주지 않습니다.'})]);
const FURNITURE=Object.freeze({desk:[2,1],server:[1,2],billboard:[4,1],meeting:[3,2],partition:[1,2],plant:[1,1],coffee:[1,1],guestbook:[1,1],portal:[1,1],sofa:[2,1],standingdesk:[1,1]});
const COLORS={wallstreet:{floor:'#edf0ef',line:'#cfd8da',wood:'#ac8664',dark:'#263c52',accent:'#5586a8'},boutique:{floor:'#b88e69',line:'#a17a58',wood:'#dfc39d',dark:'#40554b',accent:'#bd9864'},startup:{floor:'#697f89',line:'#627782',wood:'#dcc8ac',dark:'#2d4458',accent:'#80b2c1'}};
const OUTFITS=['shirt','hoodie','vest','cardigan','suit','jacket','knit','polo'],SHOES=['dark','white','blue','red'],ACCESSORIES=['none','glasses','cap','headphones'],PETS=['none','cat','dog','bird'];
const DIRECTIONS=['down','left','right','up'],handles=new Set();let raf=null,last=null,media=null;
const localSchema=typeof require==='function'?require('./office-layout.js'):null;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function hash(value){let n=2166136261;for(const char of String(value)){n^=char.codePointAt(0);n=Math.imul(n,16777619);}return n>>>0;}
function appearanceOf(value){value=value&&typeof value==='object'?value:{};const hair=String(value.hair??'0');return {outfit:OUTFITS.includes(value.outfit)?value.outfit:'shirt',hair:['0','1','2','3'].includes(hair)?hair:'0',shoes:SHOES.includes(value.shoes)?value.shoes:'dark',accessory:ACCESSORIES.includes(value.accessory)?value.accessory:'none',pet:PETS.includes(value.pet)?value.pet:'none'};}
function facingOf(value){return Number.isInteger(value)&&value>=0&&value<4?DIRECTIONS[value]:DIRECTIONS.includes(value)?value:'down';}
function layoutOf(input){
  const schema=root.ZEROOfficeLayout||localSchema;
  if(schema?.validate){const clean=schema.validate(input);if(!clean)return {theme:'wallstreet',objects:[]};input=clean;}
  if(!input||input.version!==1||input.width!==16||input.height!==10||!COLORS[input.theme]||!Array.isArray(input.objects)||input.objects.length>60)return {theme:'wallstreet',objects:[]};
  const objects=[],ids=new Set();for(const item of input.objects){const size=FURNITURE[item?.kind];if(!size||!Number.isInteger(item.id)||item.id<1||ids.has(item.id)||!Number.isInteger(item.x)||!Number.isInteger(item.y)||![0,90,180,270].includes(item.rotation))return {theme:input.theme,objects:[]};const swap=item.rotation===90||item.rotation===270,w=size[swap?1:0],h=size[swap?0:1];if(item.x<0||item.y<0||item.x+w>16||item.y+h>10)return {theme:input.theme,objects:[]};ids.add(item.id);objects.push({...item,w,h,sourceW:size[0],sourceH:size[1]});}
  return {theme:input.theme,objects};
}
function rr(ctx,x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.12;ctx.stroke();}}
function ellipse(ctx,x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function line(ctx,points,color,width=.2){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
function text(ctx,value,x,y,size,color,align='left'){ctx.font='600 '+size+'px system-ui, sans-serif';ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(value,x,y);}
function floor(ctx,theme){
  const c=COLORS[theme];ctx.fillStyle=c.floor;ctx.fillRect(0,0,160,100);
  if(theme==='boutique'){
    for(let y=0;y<100;y+=5){const offset=(y/5)%2?8:0;for(let x=-offset;x<160;x+=16){rr(ctx,x,y,15.85,4.85,.1,(Math.floor(x/16)+y)%3?'#c39c76':'#b98d65');line(ctx,[[x+1,y+1.4],[x+13,y+1.1]],'#d1ae8c',.08);line(ctx,[[x+3,y+3.7],[x+14,y+3.3]],'#ad815b',.07);}}
    rr(ctx,54,37,52,45,3,'#d6d3ba','#b8b89e');rr(ctx,56,39,48,41,2,null,'#babba4');
  }else if(theme==='wallstreet'){
    for(let y=0;y<100;y+=10)for(let x=0;x<160;x+=10){rr(ctx,x+.12,y+.12,9.76,9.76,.1,(x+y)%30===0?'#e3e8e8':'#edf0ef');line(ctx,[[x+.4,y+8.4],[x+3,y+6.2],[x+4.2,y+6.5],[x+8.9,y+1.2]],'#dce2e2',.11);}
    rr(ctx,46,35,68,42,2,'#bdcbd0');rr(ctx,48,37,64,38,1.5,null,'#aabdc5');
  }else{
    for(let y=0;y<100;y+=2)line(ctx,[[0,y],[160,y]],y%4?'#6c828c':'#657b86',.08);
    for(let y=0;y<100;y+=10)for(let x=0;x<160;x+=10)rr(ctx,x+.2,y+.2,9.6,9.6,.2,null,'#748991');
    rr(ctx,48,36,64,43,3,'#8ea6ac');
  }
  rr(ctx,0,0,160,1.8,.2,'#293f50');line(ctx,[[0,2.2],[160,2.2]],'#bccbd2',.2);
}
const floorCache=new Map();
function backgroundFor(theme,width,height,visuals={}){
  const selected=visualAsset('floor',visuals?.floor),key=(selected?'asset:'+selected.record.id:'builtin')+':'+theme+':'+width+':'+height;if(floorCache.has(key))return floorCache.get(key);
  const canvas=root.document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.setTransform(width/160,0,0,height/100,0,0);floor(ctx,theme);previewFloor(ctx,selected);floorCache.set(key,canvas);while(floorCache.size>6)floorCache.delete(floorCache.keys().next().value);return canvas;
}
function monitor(ctx,x,y,w,h,variant=0){
  rr(ctx,x+.12,y+.25,w,h,.3,'#172b3b');rr(ctx,x+.3,y+.4,w-.6,h-.65,.12,'#183e57');
  line(ctx,[[x+.6,y+h-.7],[x+w*.35,y+h*.55],[x+w*.52,y+h*.66],[x+w*.73,y+h*.33],[x+w-.55,y+.7]],variant%2?'#83c8da':'#68a2df',.13);
  line(ctx,[[x+.5,y+h*.45],[x+w-.5,y+h*.45]],'#355975',.06);line(ctx,[[x+w*.5,y+h],[x+w*.5,y+h+.7]],'#425b6b',.24);
}
function plant(ctx,x,y,scale=1){rr(ctx,x-1.1*scale,y,2.2*scale,1.7*scale,.35,'#c69d7c');line(ctx,[[x,y],[x,y-3.4*scale]],'#476b53',.2*scale);for(const [dx,dy,rx,ry] of [[-1,-2,1.25,.7],[1,-3,1.4,.7],[-.7,-4,.8,1.1],[.7,-1.4,1.1,.6]])ellipse(ctx,x+dx*scale,y+dy*scale,rx*scale,ry*scale,dx<0?'#557b5c':'#6b936d');}
function furniture(ctx,object,theme,visual=null){
  const c=COLORS[theme],w=object.sourceW*10,h=object.sourceH*10;ctx.save();ctx.translate((object.x+object.w/2)*10,(object.y+object.h/2)*10);ctx.rotate(object.rotation*Math.PI/180);ctx.translate(-w/2,-h/2);
  if(visual){ctx.drawImage(visual.image,0,0,visual.record.width,visual.record.height,0,0,w,h);ctx.restore();return;}
  rr(ctx,.5,1,w-1,h-.8,1,'#00000012');
  switch(object.kind){
    case 'desk':
      rr(ctx,.5,3,w-1,h-3,.8,'#5c5047');rr(ctx,.3,2.5,w-.6,h-4,.8,c.wood,'#8d7762');
      for(let row=0;row<2;row++)for(let col=0;col<3;col++)monitor(ctx,2+col*5.4,-.9+row*2.75,4.8,2.45,row*3+col);
      rr(ctx,6.2,6.7,7.1,.8,.18,'#dce4e6');for(let k=0;k<7;k++)line(ctx,[[6.5+k*.9,6.9],[6.5+k*.9,7.3]],'#8f9da5',.06);ellipse(ctx,14.4,7.1,.45,.65,'#d9e2e5');rr(ctx,2,6.7,2.2,1.2,.2,'#f0eadc');text(ctx,'연출',17.7,8.6,.9,'#30465b','right');break;
    case 'standingdesk':
      rr(ctx,1.2,4,7.6,3.8,.6,c.wood);line(ctx,[[2,7],[2,9],[8,9],[8,7]],'#435b6c',.45);monitor(ctx,2,1,5.6,3.2);rr(ctx,2.2,5.2,4.2,.6,.15,'#dce4e6');break;
    case 'server':
      rr(ctx,1,1,8,18,.65,c.dark,'#61788a');for(let n=0;n<6;n++){rr(ctx,1.6,2+n*2.5,6.8,2,.2,'#425970');for(let j=0;j<4;j++)line(ctx,[[2+j,2.5+n*2.5],[2+j,3.4+n*2.5]],'#283e51',.1);ellipse(ctx,7.4,3+n*2.5,.2,.2,n%2?'#9ebfa9':'#7baed0');}break;
    case 'billboard':
      rr(ctx,.3,.3,w-.6,h-1,.7,'#20384d','#899da9');rr(ctx,1,1,w-2,h-2.5,.3,'#153248');for(let i=0;i<5;i++){line(ctx,[[2+i*7,4],[5+i*7,3],[7+i*7,5]],'#5488ac',.2);rr(ctx,2+i*7,6,5,1,.15,'#3a607e');}text(ctx,'연출 · 실제 정보는 화면 전광판',w/2,2.8,1.2,'#cee0e9','center');break;
    case 'meeting':
      for(const x of [4,14,24])for(const y of [.8,16])rr(ctx,x-2,y,4,3,.6,'#415e6b');rr(ctx,1,3,w-2,h-6,4,c.wood,'#8d7f6a');rr(ctx,12.5,7.2,5,3,.4,'#c7d3d7');rr(ctx,13,7.7,4,2,.2,'#304f65');for(const x of [6,22]){ellipse(ctx,x,7,.65,.7,'#f4eee0');line(ctx,[[x-.4,10],[x+1,10]],'#b9a38c',.2);}break;
    case 'partition':
      rr(ctx,3,.4,4,19.2,.5,'#b7c9cc','#627f89');rr(ctx,3.6,1,2.8,17.7,.2,'#c4d8d8');line(ctx,[[3.5,8],[6.4,8]],'#86a4aa',.15);rr(ctx,1.8,18,6.4,1,.2,'#627c85');break;
    case 'plant':plant(ctx,5,7,1.4);break;
    case 'coffee':
      rr(ctx,1.1,6.8,7.8,2,.4,c.wood);rr(ctx,1.7,1.2,6.6,5.8,.7,'#40505c');rr(ctx,2.3,1.8,5.4,2,.3,'#d3d9d6');ellipse(ctx,5,2.8,.55,.55,'#344451');rr(ctx,3.5,5,3,1.7,.2,'#eee7d6');line(ctx,[[3,4],[7,4]],'#889aa2',.25);break;
    case 'guestbook':
      rr(ctx,1,3,8,5.5,.6,c.wood);ctx.beginPath();ctx.moveTo(2,3.6);ctx.quadraticCurveTo(3.6,2.8,5,3.7);ctx.quadraticCurveTo(6.8,2.8,8,3.6);ctx.lineTo(8,7);ctx.quadraticCurveTo(6.5,6.4,5,7.2);ctx.quadraticCurveTo(3.5,6.4,2,7);ctx.closePath();ctx.fillStyle='#f6efdf';ctx.fill();line(ctx,[[5,3.7],[5,7.1]],'#baa98e',.12);line(ctx,[[7.5,2],[6.2,5]],'#536c7e',.25);break;
    case 'portal':
      rr(ctx,1.2,.6,7.6,8.8,1.6,'#304c64','#87a6b8');rr(ctx,2.2,1.6,5.6,6.8,1,'#c4d5d9');rr(ctx,2.6,2,4.8,6,.8,'#7199ac');line(ctx,[[5,3],[5,6],[3.7,4.8],[5,6],[6.3,4.8]],'#e9f3ee',.35);break;
    case 'sofa':
      rr(ctx,1,1,18,8,.9,'#4f626c');rr(ctx,2,2,16,5.8,1,'#81929a');for(const x of [2.7,10])rr(ctx,x,3.3,6.8,3.8,.7,'#95a4a9');rr(ctx,.5,2,2,6,.6,'#667c87');rr(ctx,17.5,2,2,6,.6,'#667c87');break;
  }
  ctx.restore();
}
let registeredPixels=0,decoders=0;const decodeWaiters=[];
const registered=new Map(),ASSET_CATEGORIES={body:'body',hair:'hair',clothes:'outfit',shoes:'shoes',accessories:'accessory',pets:'pet'};
function assetRecord(record){
  if(!record||typeof record.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(record.id)||typeof record.path!=='string'||record.path.length>240||record.path.split('/').some(part=>part==='.'||part==='..')||!Number.isInteger(record.width)||!Number.isInteger(record.height)||record.width<1||record.height<1||record.width>4096||record.height>4096||record.width*record.height>4_000_000)return null;
  const sprite=/^\/assets\/sprites\/(body|hair|clothes|shoes|accessories|pets)\/\1_[A-Za-z0-9_-]+_[A-Za-z0-9-]+\.png$/.exec(record.path),tile=/^\/assets\/tilesets\/(floors|furnitures)\/(floor|floors|furniture|furnitures)_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+\.png$/.exec(record.path);
  const tileCategory=tile?({floor:'floor',floors:'floor',furniture:'furniture',furnitures:'furniture'}[tile[2]]):null;
  if(sprite&&(record.category!==sprite[1]||record.layer!==sprite[1])||!sprite&&!tile||tile&&(record.category!==tileCategory||tile[1]!==({floor:'floors',furniture:'furnitures'}[tileCategory])||record.layer!=='tiles'))return null;
  const base=new URL(root.document.baseURI),url=new URL(record.path.slice(1),base);if(!['http:','https:'].includes(url.protocol)||url.origin!==base.origin||url.username||url.password)return null;
  return {id:record.id,path:record.path,width:record.width,height:record.height,category:record.category,layer:record.layer,url:url.href};
}
async function decodeAsset(record){
  if(decoders>=4)await new Promise(resolve=>decodeWaiters.push(resolve));else decoders++;
  let image,timer;
  try{image=new root.Image();await Promise.race([(async()=>{image.src=record.url;await image.decode();if(image.naturalWidth!==record.width||image.naturalHeight!==record.height)throw Error('NATIVE_IMAGE_INVALID');})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_IMAGE_TIMEOUT')),8000);})]);return image;}
  catch(error){if(image)image.src='';throw error;}
  finally{clearTimeout(timer);const next=decodeWaiters.shift();if(next)next();else decoders--; }
}
async function registerAssets(records){
  if(!Array.isArray(records)||records.length>128)throw Error('NATIVE_ASSETS_INVALID');
  const stats={loaded:0,failed:0,invalid:0};
  await Promise.all(records.map(async raw=>{let record;try{record=assetRecord(raw);}catch(_){record=null;}if(!record){stats.invalid++;return;}
    const key=record.category+':'+record.id,prior=registered.get(key);if(prior){if(prior.record.path!==record.path||prior.record.category!==record.category||prior.record.width!==record.width||prior.record.height!==record.height){stats.invalid++;return;}if(await prior.ready)stats.loaded++;else stats.failed++;return;}
    if(registered.size>=256||registeredPixels+record.width*record.height>16_000_000){stats.invalid++;return;}
    const entry={record,image:null,ready:null};registered.set(key,entry);registeredPixels+=record.width*record.height;entry.ready=(async()=>{try{entry.image=await decodeAsset(record);return true;}catch(_){return false;}})();if(await entry.ready)stats.loaded++;else{stats.failed++;if(registered.get(key)===entry){registered.delete(key);registeredPixels-=record.width*record.height;}}
  }));sync();return stats;
}
function registeredFor(actor,category){const key=ASSET_CATEGORIES[category],id=actor.appearance?.[key],entry=registered.get(category+':'+id);return entry?.image&&entry.record.category===category?entry:null;}
function visualAsset(category,id){if(typeof id!=='string')return null;const entry=registered.get(category+':'+id);return entry?.image&&entry.record.category===category?entry:null;}
function previewFloor(ctx,entry){if(!entry)return;for(let y=0;y<10;y++)for(let x=0;x<16;x++)ctx.drawImage(entry.image,0,0,entry.record.width,entry.record.height,x*10,y*10,10,10);}
function overlay(ctx,entry,x,y,w,h){if(!entry)return false;const {record,image}=entry,scale=Math.min(w/record.width,h/record.height),dw=record.width*scale,dh=record.height*scale;ctx.drawImage(image,0,0,record.width,record.height,x+(w-dw)/2,y+h-dh,dw,dh);return true;}
function person(ctx,actor,time,animated){
  const a=appearanceOf(actor.appearance),seed=hash(actor.id),facing=facingOf(actor.facing),walking=actor.activity==='walking',typing=actor.activity==='typing',phase=animated?time:0,stride=walking?Math.sin(phase*10+seed)*.8:0,breathe=animated?Math.sin(phase*2.1+seed)*.09:0;
  const customClothes=registeredFor(actor,'clothes'),customHair=registeredFor(actor,'hair'),customShoes=registeredFor(actor,'shoes');
  const skin=['#e5b899','#c88f70','#a97154','#eed0b2'][seed%4],hair=['#31343c','#624737','#423a36','#b19270'][seed%4],outfit={shirt:'#dbe6e5',hoodie:'#6b8c9c',vest:'#555e6f',cardigan:'#917a66',suit:'#33465c',jacket:'#637069',knit:'#b6a38a',polo:'#71908b'}[a.outfit],shoe={dark:'#293541',white:'#e0e5df',blue:'#50728f',red:'#9d5a50'}[a.shoes];
  const body=registeredFor(actor,'body');if(body){ctx.save();ctx.translate(actor.pos.x,actor.pos.y);overlay(ctx,body,-5,-11,10,12,facing);for(const category of ['shoes','clothes','hair','accessories'])overlay(ctx,registeredFor(actor,category),-5,-11,10,12,facing);ctx.restore();return;}
  ctx.save();ctx.translate(actor.pos.x,actor.pos.y);ellipse(ctx,0,.1,2.5,.7,'#1d33451c');if(facing==='left'||facing==='right')ctx.scale(.82,1);
  for(const side of [-1,1]){const offset=side*stride;rr(ctx,side<0?-1.5:.25,-2.3+offset,1.25,2.3,.35,'#3f4c5b');if(!customShoes)ellipse(ctx,side*.94,.05+offset,.8,.35,shoe);}
  ctx.translate(0,breathe);rr(ctx,-2,-6.4,4,4.5,1,customClothes?skin:outfit);rr(ctx,-1.5,-6.1,3,.45,.1,'#ffffff22');
  if(facing!=='up'&&['suit','vest','jacket','cardigan'].includes(a.outfit)){ctx.beginPath();ctx.moveTo(-1.1,-6.4);ctx.lineTo(0,-3.9);ctx.lineTo(1.1,-6.4);ctx.closePath();ctx.fillStyle='#e9e9df';ctx.fill();line(ctx,[[-1.3,-6.2],[-.4,-4.5],[-1,-3.9]],'#ffffff55',.16);if(a.outfit==='suit'){line(ctx,[[0,-6],[0,-4.5]],'#9b6d6e',.4);ellipse(ctx,.7,-2.7,.12,.12,'#c7c7bc');}}
  if(a.outfit==='hoodie'){line(ctx,[[-1.1,-5.9],[-1.3,-4.7]],'#dbe4e4',.12);line(ctx,[[1.1,-5.9],[1.3,-4.7]],'#dbe4e4',.12);rr(ctx,-1,-3.2,2,.7,.3,null,'#557787');}
  if(a.outfit==='knit')for(let y=-5.4;y<-2.2;y+=.65)line(ctx,[[-1.6,y],[1.6,y]],'#89776255',.1);
  if(a.outfit==='polo')line(ctx,[[-.7,-6.2],[0,-5.4],[.7,-6.2]],'#d1dcd5',.2);
  const armTap=typing&&animated?Math.sin(phase*12)*.25:0;
  for(const side of [-1,1]){line(ctx,[[side*1.7,-5.7],[side*(typing?2.1:2.3),typing?-4+armTap:-3.4+side*stride*.4]],outfit,.85);ellipse(ctx,side*(typing?2.1:2.3),typing?-4+armTap:-3.2+side*stride*.4,.4,.48,skin);}
  rr(ctx,-.55,-7,1.1,1.1,.3,skin);ellipse(ctx,0,-8.1,2,2.1,skin);ellipse(ctx,-1.9,-8,.35,.55,skin);ellipse(ctx,1.9,-8,.35,.55,skin);
  const profile=facing==='left'?-1:facing==='right'?1:0;
  if(facing!=='up'){
    const eyeX=profile?profile*.9:-.7,eyeY=-8.1+(seed%3)*.08;ellipse(ctx,eyeX,eyeY,.17,.22,'#293746');if(!profile)ellipse(ctx,.7,eyeY,.17,.22,'#293746');line(ctx,[[eyeX-.35,eyeY-.55],[eyeX+.25,eyeY-.65+(seed%2)*.2]],'#634c43',.15);if(!profile)line(ctx,[[.4,eyeY-.55],[1,eyeY-.6]],'#634c43',.15);
    line(ctx,[[profile*.6-.4,-7.05],[profile*.6,-6.9+(seed%3)*.07],[profile*.6+.4,-7.08]],'#8e5f51',.12);ellipse(ctx,profile?profile*1.4:0,-7.6,.2,.16,'#b37f63');
  }
  if(!customHair&&a.hair==='0'){ctx.beginPath();ctx.moveTo(-1.9,-8.6);ctx.bezierCurveTo(-2.4,-11.3,1.8,-11.2,2,-8.6);ctx.lineTo(.7,-9.5);ctx.lineTo(-1.4,-9);ctx.closePath();ctx.fillStyle=hair;ctx.fill();}
  else if(!customHair&&a.hair==='1'){ellipse(ctx,0,-9.6,2.2,1.1,hair);line(ctx,[[-1.6,-9.6],[.9,-10.1]],'#ffffff22',.22);rr(ctx,-2,-9.8,.55,2.4,.25,hair);}
  else if(!customHair&&a.hair==='2'){ellipse(ctx,0,-9.6,2.1,1,hair);for(let x=-1.5;x<=1.5;x+=.65)rr(ctx,x,-9.6,.65,1.15,.25,hair);}
  else if(!customHair){rr(ctx,-2,-9.6,.65,3.6,.3,hair);rr(ctx,1.35,-9.6,.65,3.6,.3,hair);ellipse(ctx,0,-9.9,2.2,.8,hair);}
  if(facing==='up'&&!customHair)ellipse(ctx,0,-8.8,1.9,1.5,hair);
  if(a.accessory==='glasses'&&facing!=='up'){for(const x of profile?[profile*.9]:[-.8,.8])rr(ctx,x-.55,-8.6,1.1,.8,.2,null,'#344b5e');line(ctx,[[-.3,-8.3],[.3,-8.3]],'#344b5e',.1);}
  if(a.accessory==='cap'){ellipse(ctx,0,-9.6,2.3,.9,'#4f6b84');ellipse(ctx,profile?profile*1.1:.6,-9.1,1.8,.35,'#304b65');}
  if(a.accessory==='headphones'){ctx.beginPath();ctx.ellipse(0,-8.6,2.2,1.8,0,Math.PI,Math.PI*2);ctx.strokeStyle='#344960';ctx.lineWidth=.4;ctx.stroke();for(const x of [-2,2])rr(ctx,x-.3,-8.8,.6,1.2,.25,'#38536a','#a9bfcd');}
  if(actor.activity==='coffee'){rr(ctx,2,-4,1.2,1.3,.2,'#f6eddf');ellipse(ctx,2.6,-4,.6,.2,'#765f4c');}
  for(const category of ['shoes','clothes','hair','accessories'])overlay(ctx,registeredFor(actor,category),-5,-11,10,12,facing);
  ctx.restore();
}
function blockedCells(layout){const blocked=new Set();for(const object of layout.objects)for(let x=object.x;x<object.x+object.w;x++)for(let y=object.y;y<object.y+object.h;y++)blocked.add(y*16+x);return blocked;}
const cellOf=p=>Math.max(0,Math.min(9,Math.floor(p.y/10)))*16+Math.max(0,Math.min(15,Math.floor(p.x/10)));
const centerOf=c=>({x:c%16*10+5,y:Math.floor(c/16)*10+5});
function safePath(start,end,blocked){const first=cellOf(start),goal=cellOf(end);if(blocked.has(first)||blocked.has(goal))return [];const queue=[first],prior=new Map([[first,null]]);for(let i=0;i<queue.length&&!prior.has(goal);i++){const at=queue[i],x=at%16,y=Math.floor(at/16);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,c=ny*16+nx;if(nx>=0&&nx<16&&ny>=0&&ny<10&&!blocked.has(c)&&!prior.has(c)){prior.set(c,at);queue.push(c);}}}if(!prior.has(goal))return [];const result=[];for(let at=goal;at!==first;at=prior.get(at))result.push(centerOf(at));return result.reverse();}
function nearestFree(pos,blocked){let best=null,distance=Infinity;for(let c=0;c<160;c++)if(!blocked.has(c)){const p=centerOf(c),d=Math.hypot(p.x-pos.x,p.y-pos.y);if(d<distance){best=p;distance=d;}}return best;}
function lagPoint(trail){let remaining=10;for(let i=trail.length-1;i>0;i--){const a=trail[i],b=trail[i-1],d=Math.hypot(a.x-b.x,a.y-b.y);if(d>=remaining)return {x:a.x+(b.x-a.x)*remaining/d,y:a.y+(b.y-a.y)*remaining/d};remaining-=d;}return trail[0];}
function petStep(record,target,blocked,dt){
  if(!record.pos||blocked.has(cellOf(record.pos)))record.pos=nearestFree(target,blocked);if(!record.pos)return null;
  const destination=blocked.has(cellOf(target))?nearestFree(target,blocked):target;if(!destination)return record.pos;const goal=cellOf(destination);
  if(record.goal!==goal||record.path?.some(point=>blocked.has(cellOf(point)))){record.goal=goal;record.path=safePath(record.pos,destination,blocked);}
  if(!record.path?.length&&cellOf(record.pos)===goal&&Math.hypot(destination.x-record.pos.x,destination.y-record.pos.y)>.01)record.path=[{...destination}];
  let budget=Math.max(0,Math.min(.1,dt))*24;while(record.path?.length&&budget>0){const next=record.path[0],d=Math.hypot(next.x-record.pos.x,next.y-record.pos.y);if(d<=budget){record.pos={...next};record.path.shift();budget-=d;}else{const alpha=budget/d;record.pos={x:record.pos.x+(next.x-record.pos.x)*alpha,y:record.pos.y+(next.y-record.pos.y)*alpha};budget=0;}}return record.pos;
}
function pet(ctx,kind,pos,time,animated){
  ctx.save();ctx.translate(pos.x,pos.y);const wag=animated?Math.sin(time*6)*.45:0,color=kind==='cat'?'#aa8767':kind==='dog'?'#b5a086':'#819baa';ellipse(ctx,0,0,1.8,.48,'#142b3d18');
  if(kind==='bird'){ellipse(ctx,0,-1.7,1.2,1.1,color);ellipse(ctx,-.5,-1.7,.7,.5,'#a7bcc3');ellipse(ctx,.7,-2,.13,.13,'#273c49');line(ctx,[[1,-1.9],[1.6,-1.6],[1,-1.5]],'#c6a56c',.2);line(ctx,[[-.4,-.7],[-.4,0],[.3,0],[.3,-.7]],'#9c8868',.15);}
  else{line(ctx,[[-1.3,-1.2],[-2.3,-2-wag],[-2.1,-3-wag]],color,.45);ellipse(ctx,0,-1.3,1.5,1,color);ellipse(ctx,.7,-2.5,1.05,1,color);for(const x of [-.2,1.2]){ctx.beginPath();ctx.moveTo(x,-3);ctx.lineTo(x+.1,-4+(kind==='dog'?.7:0));ctx.lineTo(x+.7,-3);ctx.closePath();ctx.fillStyle=kind==='cat'?'#89694f':'#85715f';ctx.fill();}for(const x of [-.8,.9])rr(ctx,x,-.8,.45,.8,.18,color);ellipse(ctx,1,-2.6,.13,.15,'#293a43');ellipse(ctx,1.6,-2.2,.15,.1,'#554439');}
  ctx.restore();
}
function paint(ctx,layout,actors,time=0,animated=false,pets=new Map(),dt=0,background=null,visuals={}){
  visuals=visuals&&typeof visuals==='object'?visuals:{};
  ctx.clearRect(0,0,160,100);ctx.imageSmoothingEnabled=true;if(background)ctx.drawImage(background,0,0,160,100);else{floor(ctx,layout.theme);previewFloor(ctx,visualAsset('floor',visuals.floor));}const blocked=blockedCells(layout),drawables=layout.objects.map((object,i)=>({depth:(object.y+object.h)*10,order:i,draw:()=>furniture(ctx,object,layout.theme,visualAsset('furniture',visuals.furniture?.[object.kind]))})),live=new Set();
  for(const [i,actor] of (Array.isArray(actors)?actors:[]).slice(0,80).entries()){
    if(!actor||!['string','number'].includes(typeof actor.id)||!finite(actor.pos?.x)||!finite(actor.pos?.y)||actor.pos.x<0||actor.pos.x>160||actor.pos.y<0||actor.pos.y>100)continue;
    live.add(actor.id);drawables.push({depth:actor.pos.y,order:100+i,draw:()=>person(ctx,actor,time,animated)});const appearance=appearanceOf(actor.appearance);
    if(appearance.pet==='none'&&!registeredFor(actor,'pets')){pets.delete(actor.id);continue;}let record=pets.get(actor.id);if(!record){record={trail:[{...actor.pos}],pos:nearestFree(actor.pos,blocked),path:[]};pets.set(actor.id,record);}
    if(Math.hypot(actor.pos.x-record.trail.at(-1).x,actor.pos.y-record.trail.at(-1).y)>.1){record.trail.push({...actor.pos});if(record.trail.length>256)record.trail.shift();}
    const customPet=registeredFor(actor,'pets'),pos=petStep(record,lagPoint(record.trail),blocked,animated?dt:0);if(pos)drawables.push({depth:pos.y,order:200+i,draw:()=>{if(customPet)overlay(ctx,customPet,pos.x-2.5,pos.y-5,5,5,'down');else pet(ctx,appearance.pet,pos,time,animated);}});
  }
  for(const id of pets.keys())if(!live.has(id))pets.delete(id);drawables.sort((a,b)=>a.depth-b.depth||a.order-b.order).forEach(item=>item.draw());
}
const reduced=()=>!!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const running=handle=>handle.active&&!handle.destroyed&&!root.document.hidden&&!reduced();
function schedule(){if(raf===null&&[...handles].some(running))raf=root.requestAnimationFrame(tick);}
function tick(time){raf=null;if(last===null||time-last>=1000/30){const dt=last===null?0:Math.min(.1,(time-last)/1000);last=time;for(const handle of handles)if(running(handle)){handle.elapsed+=dt;handle.render(dt,true);}}schedule();}
function sync(){if(![...handles].some(running)){if(raf!==null)root.cancelAnimationFrame(raf);raf=null;last=null;}for(const handle of handles)if(handle.active&&!root.document.hidden)handle.render(0,false);schedule();}
function attach(stage,{getActors=()=>[],getLayout=()=>null,getVisuals=()=>({}),onObject=()=>{}}={}){
  const canvas=root.document.createElement('canvas');canvas.className='office-sprites-canvas office-native-canvas';canvas.setAttribute('aria-hidden','true');stage.append(canvas);const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();throw Error('CANVAS_UNAVAILABLE');}
  const handle={active:true,destroyed:false,elapsed:0,pets:new Map(),render(dt,animated){const width=Math.max(160,Math.min(2048,Math.round((stage.clientWidth||640)*(root.devicePixelRatio||1)))),height=Math.round(width/1.6);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}ctx.setTransform(width/160,0,0,height/100,0,0);const layout=layoutOf(getLayout()),visuals=getVisuals();paint(ctx,layout,getActors(),handle.elapsed,animated,handle.pets,dt,backgroundFor(layout.theme,width,height,visuals),visuals);}};
  const click=event=>{if(!handle.active||handle.destroyed||root.document.hidden||event.target?.closest?.('button,a,input,select,textarea,[role="button"]'))return;const box=canvas.getBoundingClientRect(),x=(event.clientX-box.left)/box.width*16,y=(event.clientY-box.top)/box.height*10;const object=layoutOf(getLayout()).objects.filter(item=>x>=item.x&&x<item.x+item.w&&y>=item.y&&y<item.y+item.h).at(-1);if(object)onObject(object);};
  stage.addEventListener('click',click);const resize=new root.ResizeObserver(()=>{if(handle.active&&!handle.destroyed&&!root.document.hidden)handle.render(0,false);});resize.observe(stage);
  try{handle.render(0,false);}catch(error){resize.disconnect();stage.removeEventListener('click',click);canvas.remove();throw error;}
  canvas.dataset.sprites='ready';stage.classList.add('office-sprites-ready');stage.classList.add('office-native-ready');handles.add(handle);
  if(handles.size===1){media=root.matchMedia?.('(prefers-reduced-motion: reduce)');media?.addEventListener?.('change',sync);root.document.addEventListener('visibilitychange',sync);}schedule();
  return {setActive(active){if(handle.destroyed)return;handle.active=active===true;sync();},destroy(){if(handle.destroyed)return;handle.destroyed=true;handles.delete(handle);resize.disconnect();stage.removeEventListener('click',click);handle.pets.clear();canvas.remove();stage.classList.remove('office-sprites-ready');stage.classList.remove('office-native-ready');if(!handles.size){media?.removeEventListener?.('change',sync);media=null;root.document.removeEventListener('visibilitychange',sync);}sync();}};
}
function drawLayout(canvas,input,time=0,{visuals={}}={}){const ctx=canvas.getContext('2d');if(!ctx)throw Error('CANVAS_UNAVAILABLE');canvas.width=640;canvas.height=400;ctx.setTransform(4,0,0,4,0,0);paint(ctx,layoutOf(input),[],time,false,new Map(),0,null,visuals);return canvas;}
function openCredits(){
  const dialog=root.document.createElement('dialog');dialog.className='office-native-credits';dialog.setAttribute('aria-label','ZERO 원본 사무실 그래픽 · CC0');
  for(const value of ['ZERO 원본 사무실 그래픽 · CC0-1.0','작가: ZERO',credits[0].info,'CC0는 이 renderer의 원본 그림 요소에만 적용됩니다. 등록된 외부 PNG와 모듈 코드 전체를 재라이선스하지 않습니다.']){const p=root.document.createElement('p');p.textContent=value;dialog.append(p);}
  const base=new URL(root.document.baseURI),source=new URL('assets/office-native.js',base);
  for(const [label,url] of [['그래픽 원본 코드',source.href],['CC0 라이선스 URI',credits[0].license_url]]){const link=root.document.createElement('a');link.textContent=label;link.href=url;link.target='_blank';link.rel='noopener noreferrer';dialog.append(link);}
  const close=root.document.createElement('button');close.type='button';close.textContent='닫기';close.addEventListener('click',()=>dialog.close());dialog.append(close);dialog.addEventListener('close',()=>dialog.remove(),{once:true});root.document.body.append(dialog);dialog.showModal();close.focus();return dialog;
}
const api={attach,drawLayout,registerAssets,openCredits,credits};root.ZEROOfficeNative=api;
if(typeof module!=='undefined'&&module.exports)module.exports={...api,assetRecord,appearanceOf,facingOf,layoutOf,blockedCells,safePath,lagPoint,petStep,person,furniture,paint};
})(typeof window!=='undefined'?window:globalThis);
