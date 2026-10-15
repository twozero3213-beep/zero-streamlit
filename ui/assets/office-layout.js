(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else if(root)root.ZEROOfficeLayout=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const THEMES=Object.freeze(['wallstreet','boutique','startup']);
  const FURNITURE=Object.freeze(Object.fromEntries([
    ['desk',2,1,true],['server',1,2,false],['billboard',4,1,true],['meeting',3,2,true],
    ['partition',1,2,false],['plant',1,1,false],['coffee',1,1,true],['guestbook',1,1,true],
    ['portal',1,1,true],['sofa',2,1,true],['standingdesk',1,1,true]
  ].map(([kind,width,height,interactive])=>[kind,Object.freeze({width,height,interactive})])));
  const MAX_OBJECTS=60,MAX_ID=2147483647;
  const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const integer=(x,lo,hi)=>Number.isInteger(x)&&x>=lo&&x<=hi;
  const itemDefinition=kind=>typeof kind==='string'&&Object.hasOwn(FURNITURE,kind)?FURNITURE[kind]:null;
  function footprint(object){
    const d=itemDefinition(object.kind),swap=object.rotation===90||object.rotation===270;
    return {width:swap?d.height:d.width,height:swap?d.width:d.height};
  }
  function grid(layout){
    const columns=Array.from({length:16},()=>Array(10).fill(true));
    for(const object of layout.objects){const f=footprint(object);
      for(let x=object.x;x<object.x+f.width;x++)for(let y=object.y;y<object.y+f.height;y++){
        if(!columns[x]?.[y])return null;
        columns[x][y]=false;
      }
    }
    return columns;
  }
  function validate(input){
    if(!record(input)||input.version!==1||input.width!==16||input.height!==10||input.tilewidth!==64||input.tileheight!==64||!THEMES.includes(input.theme)||!Array.isArray(input.objects)||input.objects.length>MAX_OBJECTS)return null;
    const objects=[],ids=new Set();
    for(const object of input.objects){
      if(!record(object)||!integer(object.id,1,MAX_ID)||ids.has(object.id)||!itemDefinition(object.kind)||!integer(object.x,0,15)||!integer(object.y,0,9)||![0,90,180,270].includes(object.rotation))return null;
      const clean={id:object.id,kind:object.kind,x:object.x,y:object.y,rotation:object.rotation},f=footprint(clean);
      if(clean.x+f.width>16||clean.y+f.height>10)return null;
      ids.add(clean.id);objects.push(clean);
    }
    if(objects.filter(o=>o.kind==='portal').length!==1||objects.filter(o=>o.kind==='guestbook').length!==1)return null;
    const layout={version:1,width:16,height:10,tilewidth:64,tileheight:64,theme:input.theme,objects},columns=grid(layout);
    if(!columns||!columns[8][9])return null;
    const reached=Array.from({length:16},()=>Array(10).fill(false)),queue=[[8,9]];
    reached[8][9]=true;
    for(let i=0;i<queue.length;i++){const [x,y]=queue[i];
      for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(columns[nx]?.[ny]&&!reached[nx][ny]){reached[nx][ny]=true;queue.push([nx,ny]);}
    }
    for(const object of objects){if(!itemDefinition(object.kind).interactive)continue;
      const f=footprint(object);let adjacent=false;
      for(let x=object.x;x<object.x+f.width;x++)adjacent=adjacent||!!reached[x]?.[object.y-1]||!!reached[x]?.[object.y+f.height];
      for(let y=object.y;y<object.y+f.height;y++)adjacent=adjacent||!!reached[object.x-1]?.[y]||!!reached[object.x+f.width]?.[y];
      if(!adjacent)return null;
    }
    return layout;
  }
  function defaultLayout(theme='wallstreet'){
    if(!THEMES.includes(theme))return null;
    const layout={version:1,width:16,height:10,tilewidth:64,tileheight:64,theme,objects:[
      {id:1,kind:'portal',x:15,y:8,rotation:0},{id:2,kind:'guestbook',x:0,y:8,rotation:0},
      {id:3,kind:'billboard',x:6,y:0,rotation:0},{id:4,kind:'desk',x:3,y:3,rotation:0},
      {id:5,kind:'desk',x:10,y:3,rotation:0},{id:6,kind:'meeting',x:6,y:5,rotation:0},
      {id:7,kind:'server',x:14,y:1,rotation:0},{id:8,kind:'coffee',x:1,y:1,rotation:0},
      {id:9,kind:'sofa',x:1,y:5,rotation:0},{id:10,kind:'plant',x:0,y:0,rotation:0}
    ]};
    if(theme==='wallstreet')layout.objects.push(
      {id:11,kind:'desk',x:3,y:6,rotation:0},{id:12,kind:'desk',x:11,y:6,rotation:0});
    if(theme==='boutique'){
      Object.assign(layout.objects.find(o=>o.id===5),{x:12,y:2});
      layout.objects.push({id:11,kind:'partition',x:11,y:0,rotation:0},{id:12,kind:'partition',x:11,y:2,rotation:0});
    }
    if(theme==='startup'){
      for(const object of layout.objects)if(object.kind==='desk')object.kind='standingdesk';
      layout.objects.push({id:11,kind:'sofa',x:11,y:5,rotation:0});
    }
    return layout;
  }
  function collision(input){const layout=validate(input);return layout?grid(layout):null;}
  function toTiled(input){
    const layout=validate(input);if(!layout)return null;
    const columns=grid(layout),data=[];for(let y=0;y<10;y++)for(let x=0;x<16;x++)data.push(columns[x][y]?0:1);
    const layer=(id,name,values)=>({id,name,type:'tilelayer',x:0,y:0,width:16,height:10,opacity:1,visible:true,data:values});
    return {type:'map',version:'1.10',tiledversion:'1.10.2',orientation:'orthogonal',renderorder:'right-down',infinite:false,width:16,height:10,tilewidth:64,tileheight:64,nextlayerid:4,nextobjectid:Math.max(...layout.objects.map(o=>o.id))+1,
      properties:[{name:'officeVersion',type:'int',value:1},{name:'theme',type:'string',value:layout.theme}],
      tilesets:[{firstgid:1,name:'office-collision',tilewidth:64,tileheight:64,tilecount:1,columns:0,tiles:[{id:0,properties:[{name:'blocked',type:'bool',value:true}]}]}],
      layers:[layer(1,'floor',Array(160).fill(0)),layer(2,'collision',data),{id:3,name:'furniture',type:'objectgroup',draworder:'index',x:0,y:0,opacity:1,visible:true,objects:layout.objects.map(o=>{const d=itemDefinition(o.kind),dx=o.rotation===90?d.height:o.rotation===180?d.width:0,dy=o.rotation===180?d.height:o.rotation===270?d.width:0;return {id:o.id,name:o.kind,type:o.kind,x:(o.x+dx)*64,y:(o.y+dy)*64,width:d.width*64,height:d.height*64,rotation:o.rotation,visible:true};})}]};
  }
  function same(a,b){
    if(a===b)return true;
    if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]));
    if(!record(a)||!record(b))return false;
    const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
  }
  function fromTiled(tiled){
    if(!record(tiled)||!Array.isArray(tiled.layers)||tiled.layers.length!==3||!Array.isArray(tiled.properties)||tiled.properties.length!==2)return null;
    const source=tiled.layers[2]?.objects;if(!Array.isArray(source)||source.length>MAX_OBJECTS||source.some(o=>!record(o)||!itemDefinition(o.type)||![0,90,180,270].includes(o.rotation)))return null;
    const layout=validate({version:1,width:tiled.width,height:tiled.height,tilewidth:tiled.tilewidth,tileheight:tiled.tileheight,theme:tiled.properties.find(p=>p?.name==='theme')?.value,
      objects:source.map(o=>{const d=itemDefinition(o.type),dx=o.rotation===90?d.height:o.rotation===180?d.width:0,dy=o.rotation===180?d.height:o.rotation===270?d.width:0;return {id:o.id,kind:o.type,x:o.x/64-dx,y:o.y/64-dy,rotation:o.rotation};})});
    if(!layout)return null;
    const annotation=tiled.layers[1]?.data;
    if(!Array.isArray(annotation)||annotation.length!==160||annotation.some(value=>value!==0&&value!==1))return null;
    const canonical=toTiled(layout);
    // Native object edits can leave the collision annotation stale; furniture owns occupancy.
    const normalized={...tiled,layers:tiled.layers.map((layer,index)=>index===1?{...layer,data:canonical.layers[1].data}:layer)};
    return same(normalized,canonical)?layout:null;
  }
  return Object.freeze({validate,defaultLayout,toTiled,fromTiled,collision,itemDefinition,FURNITURE,THEMES,MAX_OBJECTS,MAX_ID});
});
