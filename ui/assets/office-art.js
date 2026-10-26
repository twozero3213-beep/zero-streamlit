/* Pixel Agents MIT art at d1e007a9; original license and hashes are in sprites/office. */
(function(root){
'use strict';
const colors=Object.freeze({ink:'#394451',blue:'#517ca4',sage:'#719c87',sand:'#c8ab7c',rose:'#bc8495'});
const themes=Object.freeze(Object.fromEntries([
 ['wallstreet','월스트리트','#e7dfd2','#b99775','#304657',0],['boutique','부티크','#e4cdb3','#a37d58','#65766e',1],['startup','스타트업','#e7eaf3','#b9bfdb','#536180',3],['nordic','노르딕','#f1eee5','#d1ba94','#a2afb1',2],['japandi','재팬디','#e2dac8','#ab9876','#807e68',4],['library','라이브러리','#bca48d','#86634e','#4f5a56',5],['botanical','보태니컬','#d9e4d7','#b69f73','#50735c',2],['industrial','인더스트리얼','#d2d5d5','#a98c75','#505b64',6],['coastal','코스탈','#e3eeec','#c9b695','#7ca4b3',7],['night','나이트 라운지','#373d56','#817393','#252b42',8]
].map(([key,label,floor,wood,wall,tile])=>[key,Object.freeze({label,floor,wood,wall,tile})])));
const sources={desk:['desk_front'],standingdesk:['small_table_front'],meeting:['table_front','coffee_table'],sofa:['sofa_front','cushioned_bench','sofa_back','wooden_bench','sofa_front'],chair:['cushioned_chair_front','wooden_chair_front','cushioned_chair_side','wooden_chair_side','cushioned_chair_back'],bookshelf:['bookshelf','double_bookshelf'],plant:['plant','plant_2','cactus','large_plant','hanging_plant'],whiteboard:['whiteboard'],guestbook:['small_table_front']};
const images=new Map(),assetBase=root.document?new URL('sprites/office/',root.document.currentScript?.src||new URL('assets/office-art.js',root.document.baseURI)).href:'';let revision=0;
function image(name){if(images.has(name))return images.get(name);if(!root.Image||!assetBase)return null;const img=new root.Image();images.set(name,img);img.addEventListener('load',()=>{revision++;root.document.dispatchEvent(new root.CustomEvent('zero-office-art-ready'));},{once:true});img.src=assetBase+name+'.png';return img;}
function rect(ctx,x,y,w,h,fill){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);}
function sprite(ctx,name,x,y,w,h){const img=image(name);if(!img?.complete||!img.naturalWidth)return false;const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight),dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;ctx.drawImage(img,x+(w-dw)/2,y+h-dh,dw,dh);return true;}
function draw(ctx,object,w,h,theme='wallstreet'){
 const kind=object.kind,v=Number.isInteger(object.variant)&&object.variant>=0&&object.variant<5?object.variant:0,c=colors[object.color]||colors.ink,t=themes[theme]||themes.wallstreet;
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.scale(w/64,h/64);rect(ctx,7,57,50,4,'#18243217');
 const frames=sources[kind];
 if(frames){ctx.filter=({ink:'none',blue:'hue-rotate(175deg)',sage:'hue-rotate(80deg)',sand:'sepia(.5)',rose:'hue-rotate(290deg)'})[object.color]||'none';
  if(!sprite(ctx,frames[v%frames.length],2,1,60,58)){rect(ctx,5,16,54,37,t.wood);rect(ctx,8,51,5,10,c);rect(ctx,51,51,5,10,c);}
  if(kind==='desk'||kind==='standingdesk'){const count=kind==='standingdesk'?1:[2,3,1,2,3][v];for(let i=0;i<count;i++)sprite(ctx,'pc_front_on_'+(i%3+1),6+i*(48/count),-6,48/count,41);rect(ctx,12,45,40,2,c);}
  if(['sofa','chair'].includes(kind)){ctx.globalAlpha=.35;rect(ctx,12,33,40,10,c);ctx.globalAlpha=1;}
  if(kind==='guestbook'){rect(ctx,19,26,26,18,'#fcfaf2');rect(ctx,31,26,1,18,'#b9aa8b');rect(ctx,22,31,6,1,c);rect(ctx,35,31,6,1,c);}
 }else switch(kind){
 case 'coffee':{
  const box=[[9,12,42,43],[7,6,47,50],[14,9,35,46],[6,17,50,38],[10,5,43,51]][v];rect(ctx,...box,c);rect(ctx,box[0]+3,box[1]+3,box[2]-6,10,'#d3dce0');rect(ctx,23,30,20,17,'#202c36');rect(ctx,29,29,6,6,'#a9b5bc');sprite(ctx,'coffee',24,36,20,17);rect(ctx,14,53,35,4,'#b7bec0');
  if(v===1){rect(ctx,49,8,9,29,'#b8ced0');rect(ctx,50,28,7,8,'#87b7b7');}if(v===2){rect(ctx,20,3,23,7,'#705b48');rect(ctx,28,10,8,5,'#8f9ba1');}if(v===3){rect(ctx,12,24,40,4,'#b8bec4');rect(ctx,12,29,3,12,'#cad1d4');}if(v===4){rect(ctx,16,13,13,12,'#182a37');rect(ctx,19,16,7,2,'#9ddbc6');}break;}
 /* 3시 방향 광장 이동 포털을 차원의 문(에너지 소용돌이 아치)으로 렌더링 */
 case 'portal':rect(ctx,4,56,56,6,'#1e1b4b');rect(ctx,8,54,48,4,'#312e81');rect(ctx,10,6,44,50,'#1e1b4b');rect(ctx,6,12,52,44,'#1e1b4b');rect(ctx,12,8,40,46,c);rect(ctx,8,14,48,40,'#312e81');rect(ctx,14,12,36,42,'#4338ca');rect(ctx,16,15,32,37,'#6366f1');rect(ctx,19,18,26,31,'#0284c7');rect(ctx,22,21,20,25,'#06b6d4');rect(ctx,25,25,14,17,'#67e8f9');rect(ctx,28,29,8,9,'#e0f2fe');rect(ctx,18,14,4,4,'#a5f3fc');rect(ctx,42,20,3,5,'#c084fc');rect(ctx,16,38,3,5,'#c084fc');rect(ctx,40,42,4,4,'#a5f3fc');break;
 case 'server':rect(ctx,10,2,44,59,c);for(let n=0;n<5;n++){rect(ctx,14,7+n*10,36,8,'#253542');rect(ctx,17,9+n*10,17,2,'#647b8b');rect(ctx,44,9+n*10,3,3,n%2?'#f0c571':'#8fcbae');}break;
 case 'billboard':rect(ctx,2,2,60,54,c);rect(ctx,5,6,54,42,'#193745');for(let i=0;i<4;i++)rect(ctx,9+i*12,30-i*5,6,12+i*5,['#73a4cc','#c0d8b9','#dcbe8d','#a7a9d4'][i]);rect(ctx,10,52,44,3,'#a7bbca');break;
 case 'partition':rect(ctx,24,2,16,56,c);rect(ctx,27,5,10,47,'#bcd7da');rect(ctx,16,57,32,4,c);rect(ctx,26,26,12,2,'#f6fbfc');break;
 case 'cabinet':rect(ctx,6,7,52,50,c);for(let i=0;i<3;i++){rect(ctx,10,11+i*15,44,12,'#d7dfe1');rect(ctx,27,15+i*15,10,2,'#596a79');}break;
 case 'lamp':rect(ctx,29,17,5,38,c);rect(ctx,16,55,32,5,c);rect(ctx,22-v,4,20+v*2,18,t.wood);rect(ctx,18-v,18,28+v*2,5,'#ecce8e');break;
 case 'rug':rect(ctx,2,6,60,50,c);rect(ctx,6,10,52,42,'#e6dfd1');for(let n=0;n<5;n++)rect(ctx,10+n*10,14,4,34,c);break;
 case 'water':rect(ctx,17,4,30,20,'#b9dae6');rect(ctx,19,22,26,37,c);rect(ctx,24,33,16,14,'#e4eaed');rect(ctx,28,30,3,6,'#7ba8cf');rect(ctx,35,30,3,6,'#c08587');break;
 case 'printer':rect(ctx,18,2,30,27,'#f6f5ed');rect(ctx,8,22,48,31,c);rect(ctx,13,26,39,8,'#c1cdd0');rect(ctx,20,44,27,16,'#f5f3e9');for(let n=0;n<3;n++)rect(ctx,24,48+n*3,18,1,'#9eaaae');break;
 case 'arcade':rect(ctx,12,4,40,53,c);rect(ctx,16,7,32,8,'#e4bc7c');rect(ctx,17,20,30,22,'#203443');rect(ctx,22,24,5,5,'#82c8af');rect(ctx,35,30,6,6,'#c9a3d1');rect(ctx,9,44,46,8,c);rect(ctx,23,45,3,4,'#dbb2a1');rect(ctx,36,46,5,3,'#e7ca77');break;
 default:ctx.restore();return false;
 }
 ctx.restore();return true;
}
// Modern room: wall band with daylight windows, staggered planks, soft window light and edge falloff.
// Gradients are optional so canvas stubs and old engines still get a flat, complete floor.
function mix(a,b,t){const p=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)),A=p(a),B=p(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('');}
function shade(ctx,make,x,y,w,h,stops){if(!ctx.createLinearGradient)return;const g=make();for(const [at,color] of stops)g.addColorStop(at,color);ctx.fillStyle=g;ctx.fillRect(x,y,w,h);}
function floor(ctx,theme,w=160,h=100){
 const t=themes[theme]||themes.wallstreet,dark=parseInt(t.floor.slice(1,3),16)<128,plank=[t.floor,mix(t.floor,t.wood,.07),mix(t.floor,'#ffffff',.1),mix(t.floor,t.wood,.035)],seam=mix(t.floor,t.wall,.2),wallH=8;
 rect(ctx,0,0,w,h,t.floor);
 for(let y=wallH,row=0;y<h;y+=3.2,row++){const offset=(row*7)%22;for(let x=-offset,i=0;x<w;x+=22,i++){rect(ctx,x,y,21.85,3.05,plank[(row*3+i)%4]);rect(ctx,x+21.85,y,.15,3.2,seam+'55');}rect(ctx,0,y+3.05,w,.15,seam+'55');}
 rect(ctx,0,0,w,wallH,t.wall);shade(ctx,()=>ctx.createLinearGradient(0,0,0,wallH),0,0,w,wallH,[[0,'#ffffff1f'],[1,'#00000026']]);
 for(let x=14;x<w-20;x+=34){rect(ctx,x,1.2,22,5,mix(t.wall,'#000000',.25));shade(ctx,()=>ctx.createLinearGradient(0,1.4,0,6),x+.5,1.6,21,4.2,dark?[[0,'#26335a'],[1,'#4a4f7c']]:[[0,'#cfe6f5'],[1,'#f3efe4']]);if(!ctx.createLinearGradient)rect(ctx,x+.5,1.6,21,4.2,dark?'#2f3a63':'#dcebf3');for(const [dx,bh] of [[2,2.2],[5,3.1],[9,1.8],[12,2.8],[16,2.4],[19,1.6]])rect(ctx,x+dx,5.8-bh,2.4,bh,dark?'#f5d27a55':'#9fb3c444');rect(ctx,x+10.8,1.6,.4,4.2,'#ffffffb0');}
 /* 모던 자산운용사 딜링룸 걸레받이 및 중앙 라운지 러그 렌더링 (중세 판타지 요소 제거) */
 rect(ctx,0,wallH-.8,w,.8,mix(t.wall,'#000000',.22));
 rect(ctx,52,32,56,42,mix(t.floor,t.wall,.12)+'44');rect(ctx,53.5,33.5,53,39,mix(t.floor,t.wood,.16)+'38');
 if(ctx.createRadialGradient)for(let x=25;x<w-20;x+=34){const g=ctx.createRadialGradient(x,wallH,1,x,wallH+14,30);g.addColorStop(0,dark?'#ffd9a022':'#ffffff3a');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(x-32,wallH,64,44);}
 shade(ctx,()=>ctx.createLinearGradient(0,wallH,0,h),0,wallH,w,h-wallH,[[0,'#00000000'],[.8,'#00000000'],[1,'#0000001c']]);
 rect(ctx,0,h-1,w,1,'#25354130');
}
function preview(kind,variant=0,color='ink',rotation=0){
 const canvas=root.document.createElement('canvas');canvas.width=192;canvas.height=144;canvas.className='office-art-preview';canvas.setAttribute('aria-hidden','true');
 const render=()=>{const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,192,144);ctx.save();ctx.translate(96,72);ctx.rotate(([0,90,180,270].includes(rotation)?rotation:0)*Math.PI/180);ctx.translate(-56,-56);draw(ctx,{kind,variant,color},112,112);ctx.restore();};render();for(const img of images.values())if(!img.complete)img.addEventListener('load',render,{once:true});return canvas;
}
function themePreview(key){const canvas=root.document.createElement('canvas');canvas.width=144;canvas.height=90;canvas.className='office-art-theme';canvas.setAttribute('aria-hidden','true');const ctx=canvas.getContext('2d');if(ctx){floor(ctx,key,144,90);ctx.save();ctx.translate(25,12);draw(ctx,{kind:'desk',color:'ink'},55,45,key);ctx.restore();ctx.save();ctx.translate(94,20);draw(ctx,{kind:'plant',variant:3},28,43,key);ctx.restore();}return canvas;}
const api={colors,themes,draw,floor,preview,themePreview,get revision(){return revision;}};root.ZEROOfficeArt=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
