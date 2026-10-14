/* Company visits, community and the authenticated public lounge. */
(() => {
  'use strict';
  const U = () => window.ZEROLobbyUsers;
  const $ = id => document.getElementById(id);
  const make = (tag, cls = '', text) => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const button = (text, action, cls = 'secondary-button') => { const b = make('button', cls, text); b.type = 'button'; b.addEventListener('click', action); return b; };
  const stamp = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString('ko-KR', {timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}) + ' KST' : '시각 미확인'; };
  const errors = {UNAUTHORIZED: '닉네임으로 로그인한 뒤 이용해 주세요.', RATE_LIMIT: '잠시 쉬었다가 다시 시도해 주세요.', CONTENT_INVALID: '글자 수와 입력 내용을 확인해 주세요.', APPEARANCE_LOCKED: '아직 잠긴 꾸미기예요.', STORAGE_UNAVAILABLE: '서버에 연결하지 못했어요.', QUOTES_UNAVAILABLE: '수익률을 확인하지 못해 경험치를 보류했어요.'};
  const message = error => errors[error?.code || error?.error] || '지금은 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  const request = (path, options) => U()?.request(path, options) || Promise.reject({code: 'STORAGE_UNAVAILABLE'});
  let sessionEpoch = 0, loaded = false, cursor = null, previous = [], posting = false;
  const requireNick = note => { if (U()?.session()?.nick) return true; note.textContent = '닉네임으로 로그인한 뒤 이용할 수 있어요.'; U()?.openProfile(); return false; };
  function dialog(title, cls = '') {
    const d = make('dialog', 'social-dialog ' + cls), head = make('header', 'chat-head'), h = make('h2', '', title), close = button('닫기', () => d.close());
    head.append(h, close); d.append(head); d.setAttribute('aria-label', title); document.body.append(d); return d;
  }
  function field(label, type = 'text', max = 80) { const l = make('label', 'social-field', label), input = make(type === 'textarea' ? 'textarea' : 'input'); if (type !== 'textarea') input.type = type; input.maxLength = max; if (type === 'textarea') input.rows = 4; l.append(input); return {l, input}; }
  function safeRows(data) { return Array.isArray(data?.items) ? data.items : []; }
  async function report(kind, id, note) { try { await request('/me/reports', {method: 'POST', body: {kind, target_id: id, reason: '부적절한 내용'}}); note.textContent = '신고를 접수했어요.'; } catch (error) { note.textContent = message(error); } }
  async function block(nick, note) { if (!requireNick(note)) return; try { await request('/me/blocks', {method: 'POST', body: {nick}}); await U().refresh(); note.textContent = '이 이용자의 글과 대화를 숨겼어요.'; openCommunity(false); } catch (error) { note.textContent = message(error); } }
  const blocked = nick => (U()?.session()?.blocks || []).includes(nick);

  async function openCommunity(reset = false) {
    if (!$('community-list')) return; if (reset) { cursor = null; previous = []; }
    const note = $('community-status'); note.textContent = '글을 불러오는 중…';
    try {
      const data = await request('/community' + (cursor === null ? '' : '?cursor=' + encodeURIComponent(cursor)));
      const rows = safeRows(data).filter(row => !blocked(row.nick));
      $('community-list').replaceChildren(...rows.map(row => {
        const article = make('article', 'community-post'), title = make('h3', '', row.title), meta = make('p', 'muted-note'), body = make('p', 'social-text', row.body), status = make('p', 'muted-note');
        meta.append(button(row.nick, () => U()?.visit(row.nick), 'social-nick'), document.createTextNode(' · ' + stamp(row.created_at)));
        const detail = make('details'); detail.append(make('summary', '', '내용 읽기'), body);
        if (row.persona) detail.append(make('p', 'social-text', '공유한 페르소나: ' + row.persona));
        if (row.method) detail.append(make('p', 'social-text', '공유한 방법: ' + row.method));
        const actions = make('div', 'social-actions'); actions.append(button('신고', () => report('post', row.id, status)), button('이용자 숨김', () => block(row.nick, status)));
        if (row.nick === U()?.session()?.nick) actions.append(button('내 글 삭제', async () => { if (!confirm('이 글을 삭제할까요?')) return; try { await request('/me/posts/' + row.id, {method: 'DELETE'}); openCommunity(false); } catch (error) { status.textContent = message(error); } }));
        article.append(title, meta, detail, actions, status); return article;
      }));
      note.textContent = rows.length ? '이용자가 직접 공유한 글이며 수익·전략이 검증됐다는 뜻은 아니에요.' : '아직 표시할 글이 없어요. 첫 운영 경험을 나눠 보세요.';
      $('community-prev').disabled = !previous.length; $('community-next').disabled = data.next_cursor == null;
      $('community-next').onclick = () => { previous.push(cursor); cursor = data.next_cursor; openCommunity(false); }; loaded = true;
    } catch (error) { note.textContent = message(error); }
  }
  $('community-prev')?.addEventListener('click', () => { cursor = previous.pop() ?? null; openCommunity(false); });
  $('community-reload')?.addEventListener('click', () => openCommunity(true));
  let compose;
  function writePost() {
    if (!requireNick($('community-status'))) return;
    if (!compose) {
      compose = dialog('투자회사 운영 경험 공유'); const form = make('form', 'social-form');
      const title = field('제목', 'text', 80), content = field('경험과 근거', 'textarea', 2000), persona = field('공개할 페르소나 유형(선택)', 'text', 80), method = field('공개할 운용 방법(선택)', 'text', 80);
      title.input.required = content.input.required = true;
      const category = make('select'); [['strategy','전략 공유'],['question','질문'],['journal','운영 일지']].forEach(([value,label]) => { const o=make('option','',label);o.value=value;category.append(o); });
      const note = make('p', 'social-status'), send = make('button', 'primary-button', '공개 게시'); send.type = 'submit';
      form.append(make('p','muted-note','직접 입력한 글은 공개됩니다. 계좌번호·연락처·복구 코드는 적지 마세요. 팀의 비공개 역할은 자동으로 공개하지 않습니다.'), category, title.l, content.l, persona.l, method.l, note, send);
      form.addEventListener('submit', async e => { e.preventDefault(); if (posting) return; posting=true;send.disabled=true; const epoch=sessionEpoch;
        try { await request('/me/posts', {method:'POST',body:{title:title.input.value,body:content.input.value,persona:persona.input.value,method:method.input.value,category:category.value}}); if(epoch!==sessionEpoch)return;form.reset();compose.close();openCommunity(true); }
        catch(error){if(epoch===sessionEpoch)note.textContent=message(error);}finally{posting=false;send.disabled=false;}
      }); compose.append(form);
    } compose.showModal();
  }
  $('community-write')?.addEventListener('click',writePost);

  let guest, guestNick, guestGeneration=0;
  async function openGuestbook(nick) {
    if(!nick)return;guestNick=nick;const generation=++guestGeneration,epoch=sessionEpoch;
    if(!guest)guest=dialog('사무실 방명록');guest.querySelectorAll(':scope > :not(header)').forEach(e=>e.remove());
    const note=make('p','social-status','방명록을 불러오는 중…'),list=make('div','guestbook-list'),form=make('form','social-form'),content=field('남길 글','textarea',500),secret=make('input');secret.type='checkbox';
    const privacy=make('label','social-check');privacy.append(secret,document.createTextNode('비밀 글 · 작성자와 사무실 주인만 열람'));const send=make('button','primary-button','방명록 남기기');send.type='submit';content.input.required=true;
    guest.append(make('h3','',nick+'님의 사무실'),make('p','muted-note','팀 이름과 직원 수만 공개되며 구체적인 직원 역할은 비공개입니다.'),list,note);form.append(content.l,privacy,send);guest.append(form);
    let pageCursor=null,pageHistory=[],refreshSeq=0; const pages=make('div','social-actions'),prev=button('최근 글',()=>{pageCursor=pageHistory.pop()??null;refresh();}),older=button('이전 글',()=>{});prev.disabled=older.disabled=true;pages.append(prev,older);guest.append(pages);if(!guest.open)guest.showModal();
    const refresh=async()=>{const seq=++refreshSeq;try{const data=await request('/guestbook?nick='+encodeURIComponent(nick)+(pageCursor===null?'':'&cursor='+encodeURIComponent(pageCursor)));if(generation!==guestGeneration||epoch!==sessionEpoch||seq!==refreshSeq)return;
      prev.disabled=!pageHistory.length;older.disabled=data.next_cursor==null;older.onclick=()=>{pageHistory.push(pageCursor);pageCursor=data.next_cursor;refresh();};
      list.replaceChildren(...safeRows(data).filter(row=>!blocked(row.nick)).map(row=>{const entry=make('article','guestbook-entry'),status=make('p','muted-note');entry.append(make('b','',row.nick+(row.secret?' · 비밀':' · 공개')),make('small','',stamp(row.created_at)),make('p','social-text',row.text));
        entry.append(button('신고',()=>report('guestbook',row.id,status)));if(row.can_delete)entry.append(button('삭제',async()=>{if(!confirm('이 방명록 글을 삭제할까요?'))return;try{await request('/me/guestbook/'+row.id,{method:'DELETE'});refresh();}catch(error){status.textContent=message(error);}}));entry.append(status);return entry;}));note.textContent=list.children.length?'':'아직 방명록이 없어요.';
    }catch(error){if(generation===guestGeneration&&epoch===sessionEpoch)note.textContent=message(error);}};
    form.addEventListener('submit',async e=>{e.preventDefault();if(!requireNick(note)||send.disabled)return;send.disabled=true;try{await request('/me/guestbook',{method:'POST',body:{nick,text:content.input.value,secret:secret.checked}});if(epoch!==sessionEpoch)return;content.input.value='';pageCursor=null;pageHistory=[];await refresh();}catch(error){if(epoch===sessionEpoch)note.textContent=message(error);}finally{send.disabled=false;}});refresh();
  }

  let lounge, socket, loungeGeneration=0, heartbeat, reconnect, active=false, retries=0;
  function closeSocket(){clearInterval(heartbeat);clearTimeout(reconnect);heartbeat=null;reconnect=null;if(socket){socket.close();socket=null;}}
  function closeLounge(){active=false;loungeGeneration++;closeSocket();if(lounge?.open)lounge.close();}
  function appendChat(row){if(blocked(row.nick)||!row?.id||typeof row.text!=='string')return;const log=$('lounge-log');if(log.querySelector('[data-chat-id="'+CSS.escape(String(row.id))+'"]'))return;const p=make('p','lounge-message');p.dataset.chatId=row.id;p.append(make('b','',row.nick),make('small','',stamp(row.created_at)),make('span','social-text',row.text));p.append(button('신고',()=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'report',id:row.id,reason:'부적절한 내용'}));}));log.append(p);while(log.children.length>200)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;}
  function roomPeople(rows){const people=Array.isArray(rows)?rows.filter(row=>typeof row.nick==='string'&&!blocked(row.nick)):[];$('lounge-count').textContent='라운지 '+people.length+'명';$('lounge-people').replaceChildren(...people.map((row,i)=>{const b=button('',()=>{closeLounge();U()?.visit(row.nick);},'lounge-person'),f=make('span','lounge-person-figure');f.style.setProperty('--person-hue',String((i*47+20)%360));f.append(make('i','head'),make('i','body'),make('i','legs'));b.append(f,make('span','',row.nick));b.title='눌러서 사무실 방문';return b;}));}
  function connectLounge(){if(!active||document.hidden)return;const generation=loungeGeneration;$('lounge-status').textContent='로딩 중 · 공용 라운지에 접속하고 있어요';$('lounge-loading').hidden=false;$('lounge-send').disabled=true;
    try{socket=U().openLoungeSocket();}catch(error){$('lounge-status').textContent=message(error);$('lounge-loading').hidden=true;return;}
    socket.addEventListener('message',event=>{if(generation!==loungeGeneration||!active)return;let data;try{data=JSON.parse(event.data);}catch{return;}
      if(data.type==='ready'){retries=0;$('lounge-loading').hidden=true;$('lounge-status').textContent='연결됨 · 최근 대화는 최대 24시간 보관합니다';$('lounge-send').disabled=false;$('lounge-log').replaceChildren();(data.messages||[]).forEach(appendChat);roomPeople(data.participants);clearInterval(heartbeat);heartbeat=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send('ping');},30000);}
      if(data.type==='presence')roomPeople(data.participants);if(data.type==='message')appendChat(data.message);
      if(data.type==='error'){$('lounge-status').textContent=message(data);if(['UNAUTHORIZED','TOKEN_EXPIRED','AUTH_FAILED'].includes(data.error)){active=false;closeSocket();$('lounge-send').disabled=true;}}
      if(data.type==='reported')$('lounge-status').textContent='신고를 접수했어요.';
    });
    socket.addEventListener('close',()=>{if(generation!==loungeGeneration||!active)return;clearInterval(heartbeat);$('lounge-send').disabled=true;$('lounge-loading').hidden=true;$('lounge-status').textContent='연결이 끊겼어요.';if(!document.hidden&&retries<3){retries++;reconnect=setTimeout(connectLounge,Math.min(15000,1000*2**retries));}});
  }
  function openLounge(){if(!U()?.session()?.nick){U()?.openProfile();return;}if(!lounge){lounge=dialog('ZERO 공용 라운지','lounge-dialog');const loading=make('div','lounge-loading');loading.id='lounge-loading';loading.append(make('span','boot-ring'),make('span','','로딩 중…'));
      const status=make('p','social-status');status.id='lounge-status';const count=make('b');count.id='lounge-count';const people=make('div','lounge-people');people.id='lounge-people';const log=make('div','lounge-log');log.id='lounge-log';log.setAttribute('role','log');log.setAttribute('aria-live','polite');
      const form=make('form','lounge-chat-form'),input=make('input');input.id='lounge-input';input.maxLength=300;input.placeholder='라운지에 공개할 이야기';input.setAttribute('aria-label','라운지 메시지');input.required=true;const send=make('button','primary-button','보내기');send.id='lounge-send';send.type='submit';form.append(input,send);form.addEventListener('submit',e=>{e.preventDefault();const text=input.value.trim();if(text&&socket?.readyState===WebSocket.OPEN&&!send.disabled){socket.send(JSON.stringify({type:'message',text}));input.value='';}});
      lounge.append(loading,status,count,people,make('p','muted-note','사무실 문을 통해 들어온 이용자들과 대화해요. 메시지는 참가자에게 공개됩니다. 계좌번호·연락처·복구 코드를 올리지 마세요.'),log,form);lounge.addEventListener('close',()=>{active=false;loungeGeneration++;closeSocket();});
    }closeSocket();active=true;retries=0;loungeGeneration++;lounge.showModal();connectLounge();}
  document.addEventListener('visibilitychange',()=>{if(!active)return;closeSocket();loungeGeneration++;if(document.hidden){$('lounge-send').disabled=true;$('lounge-status').textContent='화면을 다시 열면 재접속합니다.';}else connectLounge();});

  let closet;
  function paintAppearance(entity,appearance){if(!entity?.el||!appearance)return;const fig=entity.el.querySelector('.npc-fig');if(!fig)return;
    if(/^(suit|vest|cardigan|hoodie|shirt|jacket|knit|polo)$/.test(appearance.outfit))fig.dataset.outfit=appearance.outfit;
    if(/^[0-3]$/.test(String(appearance.hair)))fig.dataset.hair=String(appearance.hair);
    entity.el.dataset.shoes=['dark','white','blue','red'].includes(appearance.shoes)?appearance.shoes:'dark';entity.el.dataset.accessory=['none','glasses','cap','headphones'].includes(appearance.accessory)?appearance.accessory:'none';
    entity.el.querySelector('.player-pet')?.remove();const pets={cat:'🐈',dog:'🐕',bird:'🐦'};if(pets[appearance.pet])entity.el.append(make('span','player-pet',pets[appearance.pet]));
  }
  function paint(){const state=window.ZEROLobby?.state,session=U()?.session();if(state?.player){paintAppearance(state.player,session?.appearance);let badge=state.player.el.querySelector('.company-level');if(!badge){badge=make('span','company-level');state.player.el.append(badge);}badge.textContent=session?.progress?'회사 Lv.'+session.progress.level:'';badge.hidden=!session?.progress;}const host=state?.npcs?.find(row=>row.id==='host');if(host)paintAppearance(host,state.visit?.appearance);}
  function openWardrobe(){const session=U()?.session();if(!session?.nick){U()?.openProfile();return;}if(!closet)closet=dialog('내 캐릭터 · 성장과 꾸미기');closet.querySelectorAll(':scope > :not(header)').forEach(e=>e.remove());
    const progress=session.progress||{},form=make('form','social-form'),note=make('p','social-status'),values={...session.appearance},labels={outfit:'옷',hair:'헤어스타일',shoes:'신발',accessory:'장신구',pet:'펫'};
    closet.append(make('p','','Lv.'+(progress.level||1)+' · '+(progress.xp||0)+' XP'),make('p','muted-note','경험치는 서버에서 확인한 가상 연습 수익률의 최고 기록으로 계산합니다. 실제 투자 성과가 아니며 손실 위험과 비용·환율 제외도 함께 고려하세요. 같은 기록을 반복 조회해도 경험치를 중복 지급하지 않습니다.'));
    const percent = value => typeof value === 'number' && Number.isFinite(value) ? (Math.trunc(value * 100) / 100).toFixed(2) + '%' : '확인 불가';
    closet.append(make('p', '', '현재 연습 수익률 ' + percent(session.practiceReturn) + ' · 앱이 확인한 최고 ' + percent(progress.high_water_return_percent)));
    Object.entries(labels).forEach(([kind,label])=>{const field=make('label','social-field',label),select=make('select');const options=session.catalog?.[kind]||[];options.forEach(item=>{const option=make('option','',item.label+(item.level>progress.level?' · Lv.'+item.level+' 잠김':''));option.value=item.id;option.disabled=item.level>progress.level;select.append(option);});select.value=values[kind]||options[0]?.id||'';select.addEventListener('change',()=>values[kind]=select.value);values[kind]=select.value;field.append(select);form.append(field);});
    const send=make('button','primary-button','꾸미기 저장');send.type='submit';form.append(note,send);form.addEventListener('submit',async e=>{e.preventDefault();if(send.disabled)return;send.disabled=true;const epoch=sessionEpoch;try{await request('/me/appearance',{method:'PUT',body:values});await U().refresh();if(epoch!==sessionEpoch)return;paint();closet.close();}catch(error){if(epoch===sessionEpoch)note.textContent=message(error);}finally{send.disabled=false;}});closet.append(form);closet.showModal();
  }
  document.addEventListener('zero-ready',paint);
  document.addEventListener('zero-profile-updated',paint);
  document.addEventListener('zero-session-changed',()=>{sessionEpoch++;guestGeneration++;closeLounge();if(guest?.open)guest.close();guest?.querySelectorAll(':scope > :not(header)').forEach(e=>e.remove());if(compose?.open)compose.close();compose?.querySelector('form')?.reset();if(closet?.open)closet.close();closet?.querySelectorAll(':scope > :not(header)').forEach(e=>e.remove());paint();});
  window.ZEROSocial={openCommunity:()=>openCommunity(!loaded),openLounge,closeLounge,openGuestbook,openWardrobe,paintAppearance};
  if(window.ZERO?.currentView?.()==='community')openCommunity(true);
})();
