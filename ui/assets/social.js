/* Company visits, community and the authenticated public lounge. */
(() => {
  'use strict';
  const U = () => window.ZEROLobbyUsers;
  const $ = id => document.getElementById(id);
  const make = (tag, cls = '', text) => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const button = (text, action, cls = 'secondary-button') => { const b = make('button', cls, text); b.type = 'button'; b.addEventListener('click', action); return b; };
  const stamp = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString('ko-KR', {timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}) + ' KST' : '시각 미확인'; };
  const errors = {MEMBERSHIP_REQUIRED: '이메일·휴대폰으로 인증한 회원만 글과 댓글을 남길 수 있어요.', QUERY_INVALID: '검색어는 80자 이내로 입력해 주세요.', ENTRY_INVALID: '제목과 본문을 확인해 주세요.', UNAUTHORIZED: '닉네임으로 로그인한 뒤 이용해 주세요.', RATE_LIMIT: '잠시 쉬었다가 다시 시도해 주세요.', CHAT_TOO_FAST: '대화는 2초 간격으로 보낼 수 있어요.', POST_LIMIT: '글은 3초 간격으로 보낼 수 있어요. 일일 작성 한도도 확인해 주세요.', COMMENT_LIMIT: '댓글은 2초 간격으로 보낼 수 있어요. 일일 작성 한도도 확인해 주세요.', CONTENT_INVALID: '글자 수와 입력 내용을 확인해 주세요.', APPEARANCE_LOCKED: '아직 잠긴 꾸미기예요.', STORAGE_UNAVAILABLE: '서버에 연결하지 못했어요.', QUOTES_UNAVAILABLE: '시세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'};
  const message = error => errors[error?.code || error?.error] || '지금은 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  const request = (path, options) => U()?.request(path, options) || Promise.reject({code: 'STORAGE_UNAVAILABLE'});
  let sessionEpoch = 0, loaded = false, cursor = null, previous = [], posting = false, communitySeq = 0, category = '', query = '';
  const categories = {question: '질문', strategy: '전략', journal: '운영 일지'};
  const communityPageSize = () => window.matchMedia('(max-width:767px)').matches || window.matchMedia('(max-height:899px)').matches ? 2 : window.matchMedia('(max-height:1049px)').matches ? 3 : 4;
  let communitySize = 0;
  const requireNick = note => { if (U()?.session()?.nick) return true; note.textContent = '닉네임으로 로그인한 뒤 이용할 수 있어요.'; U()?.openProfile(); return false; };
  function dialog(title, cls = '') {
    const d = make('dialog', 'social-dialog ' + cls), head = make('header', 'chat-head'), h = make('h2', '', title), close = button('', () => d.close(), 'icon-button icon-close');
    close.setAttribute('aria-label',title+' 닫기');close.title='닫기';
    head.append(h, close); d.append(head); d.setAttribute('aria-label', title); document.body.append(d); return d;
  }
  function field(label, type = 'text', max = 80) { const l = make('label', 'social-field', label), input = make(type === 'textarea' ? 'textarea' : 'input'); if (type !== 'textarea') input.type = type; input.maxLength = max; if (type === 'textarea') input.rows = 4; l.append(input); return {l, input}; }
  function safeRows(data) { return Array.isArray(data?.items) ? data.items : []; }
  async function report(kind, id, note) { try { await request('/me/reports', {method: 'POST', body: {kind, target_id: id, reason: '부적절한 내용'}}); note.textContent = '신고를 접수했어요.'; } catch (error) { note.textContent = message(error); } }
  async function block(nick, note) { if (!requireNick(note)) return; try { await request('/me/blocks', {method: 'POST', body: {nick}}); await U().refresh(); note.textContent = '이 이용자의 글과 대화를 숨겼어요.'; openCommunity(false); } catch (error) { note.textContent = message(error); } }
  const blocked = nick => (U()?.session()?.blocks || []).includes(nick);

  async function openComments(row, article, countButton) {
    let panel = article.querySelector('.community-comments');
    if (panel) { panel.hidden = !panel.hidden; return; }
    panel = make('section', 'community-comments'); panel.setAttribute('aria-label', '댓글');
    const list = make('div'), note = make('p', 'social-status'), form = make('form', 'social-form community-reply'), content = field('댓글', 'textarea', 500), send = make('button', 'primary-button', '등록');
    content.input.rows = 2; content.input.placeholder = '의견을 나눠 보세요.';
    send.type = 'submit'; content.input.required = true; form.append(content.l, send); panel.append(list, note, form); article.append(panel);
    const epoch = sessionEpoch, id = encodeURIComponent(row.id);
    const refresh = async () => {
      try {
        const data = await request('/community/' + id + '/comments');
        if (epoch !== sessionEpoch || !panel.isConnected) return;
        list.replaceChildren(...safeRows(data).filter(item => !blocked(item.nick)).map(item => {
          const entry = make('article', 'guestbook-entry'); entry.append(button(item.nick, () => U()?.visit(item.nick), 'social-nick'), make('small', '', stamp(item.created_at)), make('p', 'social-text', item.body)); return entry;
        }));
        note.textContent = list.children.length ? '' : '아직 댓글이 없어요.';
      } catch (error) { if (epoch === sessionEpoch) note.replaceChildren(make('span', '', message(error)), button('댓글 다시 불러오기', refresh)); }
    };
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!requireNick(note) || send.disabled) return;
      send.disabled = true;
      try { await request('/community/' + id + '/comments', {method: 'POST', body: {body: content.input.value}}); if (epoch !== sessionEpoch) return; content.input.value = ''; row.comment_count = (Number.isSafeInteger(row.comment_count) ? row.comment_count : 0) + 1; if (countButton) countButton.textContent = '댓글 ' + row.comment_count; await refresh(); }
      catch (error) { if (epoch === sessionEpoch) note.textContent = message(error); }
      finally { send.disabled = false; }
    });
    await refresh();
  }
  async function openCommunity(reset = false, next = cursor, history = previous) {
    if (!$('community-list')) return;
    const size = communityPageSize();
    if (reset || size !== communitySize) { next = null; history = []; }
    const note = $('community-status'), epoch = sessionEpoch, sequence = ++communitySeq;
    const params = new URLSearchParams({limit: String(size)});
    if (next !== null) params.set('cursor', next);
    if (category) params.set('category', category);
    if (query) params.set('q', query);
    note.textContent = '글을 불러오는 중…';
    $('community-list').setAttribute('aria-busy', 'true');
    $('community-prev').disabled = $('community-next').disabled = true;
    try {
      const data = await request('/community?' + params);
      if (epoch !== sessionEpoch || sequence !== communitySeq) return;
      cursor = next; previous = history; communitySize = size;
      const rows = safeRows(data).filter(row => !blocked(row.nick));
      $('community-list').replaceChildren(...rows.map(row => {
        const article = make('article', 'community-post'), title = make('h3', '', row.title), meta = make('p', 'community-meta'), body = make('p', 'social-text', row.body), status = make('p', 'social-status');
        status.setAttribute('role', 'status');
        meta.append(make('span', 'community-category', categories[row.category] || '이야기'), button(row.nick, () => U()?.visit(row.nick), 'social-nick'), make('time', '', stamp(row.created_at)));
        const detail = make('details', 'community-content'), summary = make('summary'), preview = make('p', 'community-preview', row.body);
        summary.append(title, preview, make('span', 'community-read', '글 읽기')); detail.append(summary, body);
        if (row.persona) detail.append(make('p', 'social-text', '공유한 페르소나: ' + row.persona));
        if (row.method) detail.append(make('p', 'social-text', '공유한 방법: ' + row.method));
        if (row.certificate) {
          const proof=row.certificate,card=make('section','community-proof');card.append(make('p','',proofLabel(proof)));
          const period=proof.period;
          card.append(make('p','muted-note',period?.start_date&&period?.end_date?'기록 기간 '+period.start_date+' ~ '+period.end_date:'운용기간 근거 없음'));
          const labels={VALUE:'가치투자형',TREND:'추세추종형',DIVIDEND:'고배당형',VOLATILITY:'변동성 제어형'};
          if(Array.isArray(proof.persona_summary))proof.persona_summary.slice(0,4).forEach(item=>{
            if(Object.hasOwn(labels,item.persona)&&typeof item.weight==='number'&&Number.isFinite(item.weight)&&item.weight>=0&&item.weight<=100)card.append(make('p','',labels[item.persona]+' · 전략 가중치 '+(Math.trunc(item.weight*100)/100).toFixed(2)+'%'));
          });
          detail.append(card);
        }
        let liked = row.liked === true, likes = Number.isSafeInteger(row.like_count) && row.like_count >= 0 ? row.like_count : 0;
        const reaction = button((liked ? '좋아요 취소 ' : '좋아요 ') + likes, async () => {
          if (!requireNick(status) || reaction.disabled) return; reaction.disabled = true;
          try {
            const result = await request('/community/' + encodeURIComponent(row.id) + '/reaction', {method: 'POST', body: {liked: !liked}});
            if (epoch !== sessionEpoch) return;
            liked = result.liked === true; likes = Number.isSafeInteger(result.like_count) && result.like_count >= 0 ? result.like_count : likes;
            reaction.textContent = (liked ? '좋아요 취소 ' : '좋아요 ') + likes; reaction.setAttribute('aria-pressed', String(liked));
          } catch (error) { if (epoch === sessionEpoch) status.textContent = message(error); }
          finally { reaction.disabled = false; }
        }); reaction.setAttribute('aria-pressed', String(liked));
        const comments = button('댓글 ' + (Number.isSafeInteger(row.comment_count) && row.comment_count >= 0 ? row.comment_count : 0), () => openComments(row, article, comments));
        const actions = make('div', 'social-actions'), more = make('details', 'community-more'), menu = make('div');
        more.append(make('summary', '', '더 보기'), menu);
        menu.append(button('신고', () => report('post', row.id, status)), button('이용자 숨김', () => block(row.nick, status)));
        actions.append(reaction, comments, more);
        if (row.nick === U()?.session()?.nick) menu.append(button('내 글 삭제', async () => { if (!confirm('이 글을 삭제할까요?')) return; try { await request('/me/posts/' + row.id, {method: 'DELETE'}); openCommunity(false); } catch (error) { status.textContent = message(error); } }));
        article.append(meta, detail, actions, status); return article;
      }));
      note.textContent = rows.length ? '최신순 · 이 페이지 ' + rows.length + '개' : (query || category ? '조건에 맞는 글이 없어요. 검색어나 분류를 바꿔 보세요.' : '아직 글이 없어요. 궁금한 점이나 투자 경험을 첫 글로 나눠 보세요.');
      $('community-list').classList.toggle('community-empty', !rows.length);
      $('community-list').scrollTop = 0;
      const feed=$('community-list').closest?.('.community-feed');if(feed)feed.scrollTop=0;
      if ($('community-page')) $('community-page').textContent = (previous.length + 1) + '페이지';
      $('community-prev').disabled = !previous.length; $('community-next').disabled = data.next_cursor == null;
      $('community-prev').onclick = () => openCommunity(false, previous.at(-1) ?? null, previous.slice(0, -1));
      $('community-next').onclick = () => openCommunity(false, data.next_cursor, [...previous, cursor]); loaded = true;
    } catch (error) {
      if (epoch === sessionEpoch && sequence === communitySeq) {
        $('community-list').replaceChildren();
        note.replaceChildren(make('span', '', message(error)), button('게시판 다시 불러오기', () => openCommunity(false, next, history)));
      }
    } finally { if (epoch === sessionEpoch && sequence === communitySeq) $('community-list').setAttribute('aria-busy', 'false'); }
  }
  $('community-reload')?.addEventListener('click', () => openCommunity(true));
  $('community-categories')?.querySelectorAll('button').forEach(tab => tab.addEventListener('click', () => {
    category = tab.dataset.category;
    $('community-categories').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === tab)));
    openCommunity(true);
  }));
  $('community-search')?.addEventListener('submit', event => { event.preventDefault(); query = $('community-query').value.trim(); openCommunity(true); });
  $('community-query')?.addEventListener('input', () => { if (query && !$('community-query').value) { query = ''; openCommunity(true); } });
  ['(max-width:767px)', '(max-height:899px)', '(max-height:1049px)'].forEach(size => window.matchMedia(size).addEventListener?.('change', () => { if (window.ZERO?.currentView?.() === 'community') openCommunity(true); }));
  let compose;
  function writePost() {
    if (!requireNick($('community-status'))) return;
    if (!compose) {
      compose = dialog('글쓰기', 'community-compose'); const form = make('form', 'social-form');
      const title = field('제목', 'text', 80), content = field('내용', 'textarea', 2000), persona = field('공개할 페르소나 유형(선택)', 'text', 80), method = field('공개할 운용 방법(선택)', 'text', 80);
      title.input.required = content.input.required = true;
      const category = make('select'); [['question','질문'],['strategy','전략'],['journal','운영 일지']].forEach(([value,label]) => { const o=make('option','',label);o.value=value;category.append(o); });
      const note = make('p', 'social-status'), send = make('button', 'primary-button', '공개 게시'); send.type = 'submit';
      const categoryField = make('label', 'social-field', '분류'), optional = make('details', 'community-optional');
      categoryField.append(category); optional.append(make('summary', '', '성향·운용 방법 추가 (선택)'), persona.l, method.l);
      title.input.placeholder = '어떤 이야기를 나누고 싶나요?'; content.input.placeholder = '궁금한 점이나 직접 경험한 내용을 적어 주세요.'; content.input.rows = 6;
      form.append(categoryField, title.l, content.l, optional, make('p','muted-note','공개되는 글이에요. 계좌번호·연락처·인증정보는 적지 마세요. 비공개 팀 정보는 자동 첨부되지 않습니다.'), note, send);
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
    }catch(error){if(generation===guestGeneration&&epoch===sessionEpoch&&seq===refreshSeq)note.replaceChildren(make('span','',message(error)),button('방명록 다시 불러오기',refresh));}};
    form.addEventListener('submit',async e=>{e.preventDefault();if(!requireNick(note)||send.disabled)return;send.disabled=true;try{await request('/me/guestbook',{method:'POST',body:{nick,text:content.input.value,secret:secret.checked}});if(epoch!==sessionEpoch)return;content.input.value='';pageCursor=null;pageHistory=[];await refresh();}catch(error){if(epoch===sessionEpoch)note.textContent=message(error);}finally{send.disabled=false;}});refresh();
  }

  const PLAZA = {minX: 5, maxX: 95, minY: 18, maxY: 92};
  function plazaStep(pos, direction, target, dt, bounds = PLAZA) {
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    let x = pos.x, y = pos.y;
    const dx = direction?.x || (target ? target.x - x : 0), dy = direction?.y || (target ? target.y - y : 0), distance = Math.hypot(dx, dy);
    const step = Math.min(24 * Math.min(.05, Math.max(0, dt)), direction ? Infinity : distance);
    if (distance) { x += dx / distance * step; y += dy / distance * step; }
    return {x: clamp(x, bounds.minX, bounds.maxX), y: clamp(y, bounds.minY, bounds.maxY)};
  }
  function bubblePositions(rows, now) {
    const placed = [];
    for (const row of rows.filter(row => row.until > now).slice(-8)) {
      let lane = 0;
      while (placed.some(other => Math.abs(other.x - row.x) < 24 && Math.abs(other.y - row.y) < 14 && other.lane === lane)) lane++;
      placed.push({...row, lane});
    }
    return placed;
  }
  function proofLabel(proof) {
    if ((proof?.kind === 'backtest' || proof?.is_backtest === true) && proof.state === 'UNAVAILABLE') return '백테스트 요청 기록 · 자료 부족으로 계산 보류 · 투자 성과 인증 아님';
    if (proof?.kind === 'backtest' || proof?.is_backtest === true) return '백테스트 · 과거 자료로 계산한 모의 결과 · 투자 성과 인증 아님';
    const state = proof?.proof_state;
    if (proof?.kind === 'verified_return' && state === 'verified') {
      const value = proof.return_percent;
      return '검증된 운용 기록' + (typeof value === 'number' && Number.isFinite(value) ? ' · 수익률 ' + (Math.trunc(value * 100) / 100).toFixed(2) + '%' : ' · 수익률 수치 없음');
    }
    return '첨부 기록 · 검증되지 않은 수익률';
  }
  function serverProgress(progress) {
    return progress?.basis === 'SERVER_CONFIRMED_LEARNING_REVIEW_AND_TRUSTED_PERFORMANCE' && Number.isSafeInteger(progress.xp) && progress.xp >= 0 && Number.isSafeInteger(progress.level) && progress.level >= 1;
  }
  function followPet(pos, owner, dt, reduced) {
    const target = {x: owner.x - 5, y: owner.y + 2}, ratio = reduced ? 1 : Math.min(1, Math.max(0, dt) * 7);
    return {x: pos.x + (target.x - pos.x) * ratio, y: pos.y + (target.y - pos.y) * ratio};
  }

  let lounge, socket, loungeGeneration = 0, heartbeat, reconnect, active = false, retries = 0;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const plaza = {people: new Map(), keys: new Set(), target: null, nick: null, ready: false, raf: 0, last: 0, sentAt: -Infinity, seq: 0, dirty: false, pending: null, retryAt: 0, moveAck: false, rtt: 160, chat: null, chatAt: -Infinity, bubbles: new Map(), bubbleTimer: null};
  function stopPlaza() {
    restorePlazaChat(); plaza.ready = false; plaza.dirty = false; plaza.pending = null; plaza.retryAt = 0; plaza.keys.clear(); plaza.target = null;
    if (plaza.raf) cancelAnimationFrame(plaza.raf); plaza.raf = 0; plaza.last = 0;
    clearTimeout(plaza.bubbleTimer); plaza.bubbleTimer = null; plaza.bubbles.clear();
    $('lounge-bubbles')?.replaceChildren();
    if ($('lounge-count')) $('lounge-count').textContent = '접속 인원 확인 중';
  }
  function closeSocket() {
    clearInterval(heartbeat); clearTimeout(reconnect); heartbeat = null; reconnect = null; stopPlaza();
    if (socket) { const old = socket; socket = null; old.close(); }
  }
  function closeLounge() { active = false; loungeGeneration++; closeSocket();plaza.people.forEach(removePet);plaza.people.clear();$('lounge-people')?.replaceChildren();$('lounge-log')?.replaceChildren();if (lounge) { lounge.hidden = true; $('lounge-input').value = ''; } if ($('plaza-view')) $('plaza-view').dataset.entered = 'false'; }
  function leaveLounge() { closeLounge(); document.dispatchEvent(new CustomEvent('zero-plaza-closed')); }
  function setPlazaChat(open) {
    const input = $('lounge-input'); if (!input) return;
    plaza.keys.clear(); plaza.target = null; input.parentElement.hidden = !open;
    (open ? input : $('plaza-stage')).focus({preventScroll: true});
  }
  function restorePlazaChat(note) {
    if (!plaza.chat) return;
    clearTimeout(plaza.chat.timer);
    const input = $('lounge-input'); input.value = plaza.chat.text; input.readOnly = false; input.parentElement.hidden = false;
    plaza.chat = null; $('lounge-send').disabled = !plaza.ready;
    if (note) $('lounge-status').textContent = note;
  }
  function sendPlazaChat() {
    const chat = plaza.chat;
    if (!chat || chat.sent || plaza.pending || socket?.readyState !== WebSocket.OPEN) return;
    chat.sent = true; plaza.chatAt = Date.now(); socket.send(JSON.stringify({type: 'message', text: chat.text}));
    chat.timer = setTimeout(() => restorePlazaChat('대화 접수를 확인하지 못했어요. 기록을 확인한 뒤 다시 보내 주세요.'), 6000);
  }
  function paintPerson(person) {
    person.el.style.left = person.pos.x + '%'; person.el.style.top = person.pos.y + '%';
    person.el.style.zIndex = String(Math.round(person.pos.y)); person.el.dataset.facing = person.direction || 'down';
    updatePet(person, {w: 100, h: 100});
  }
  function roomPeople(rows) {
    const online = new Map((Array.isArray(rows) ? rows : []).filter(row => typeof row?.nick === 'string' && row.nick && Number.isFinite(row.x) && Number.isFinite(row.y) && row.x >= 0 && row.x <= 100 && row.y >= 0 && row.y <= 100).map(row => [row.nick, row]));
    $('lounge-count').textContent = '실제 접속 ' + online.size + '명';
    const people = [...online.values()].filter(row => !blocked(row.nick));
    const keep = new Set();
    for (const row of people) {
      if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) continue;
      keep.add(row.nick); let person = plaza.people.get(row.nick);
      if (!person) {
        const el = button('', () => { if (row.nick !== plaza.nick) { window.ZERO?.navigate?.('lobby');closeLounge(); U()?.visit(row.nick); } }, 'lounge-person'), fig = make('span', 'lounge-person-figure');
        let hue = 20; for (const char of row.nick) hue = (hue * 31 + char.charCodeAt(0)) % 360;
        fig.style.setProperty('--person-hue', String(hue)); fig.append(make('i', 'head'), make('i', 'body'), make('i', 'arms'), make('i', 'legs'));
        el.append(fig, make('span', 'lounge-person-name', row.nick)); el.title = row.nick === plaza.nick ? '내 캐릭터 · 바닥을 눌러 이동' : '눌러서 사무실 방문';
        el.dataset.own = String(row.nick === plaza.nick); $('lounge-people').append(el);
        person = {el, pos: {x: row.x, y: row.y}, confirmed: {x: row.x, y: row.y}, direction: row.direction, seq: -1}; plaza.people.set(row.nick, person);
        if (row.nick === plaza.nick) paintAppearance(person, U()?.session()?.appearance);
      }
      if (row.nick !== plaza.nick || !plaza.ready) person.pos = {x: row.x, y: row.y};
      person.direction = row.direction; if (Number.isSafeInteger(row.seq)) person.seq = row.seq;
      paintPerson(person);
    }
    for (const [nick, person] of plaza.people) if (!keep.has(nick)) { removePet(person); person.el.remove(); plaza.people.delete(nick); plaza.bubbles.delete(nick); }
    paintBubbles();
  }
  function movedPerson(row) {
    if (!row || blocked(row.nick) || !Number.isFinite(row.x) || !Number.isFinite(row.y) || row.x < 0 || row.x > 100 || row.y < 0 || row.y > 100 || !Number.isSafeInteger(row.seq)) return;
    const person = plaza.people.get(row.nick); if (!person || row.seq <= person.seq) return;
    person.seq = row.seq; person.confirmed = {x: row.x, y: row.y};
    if (row.nick === plaza.nick) {
      if (!plaza.moveAck && plaza.pending) ackPlazaMove({seq: plaza.pending.body.seq, ok: true, x: row.x, y: row.y, server_seq: row.seq});
      return;
    }
    person.pos = {x: row.x, y: row.y}; person.direction = row.direction; paintPerson(person); paintBubbles();
  }
  function paintBubbles() {
    const layer = $('lounge-bubbles'); if (!layer) return;
    clearTimeout(plaza.bubbleTimer);
    const now = Date.now(), rows = [];
    for (const [nick, bubble] of plaza.bubbles) {
      const person = plaza.people.get(nick);
      if (bubble.until <= now || !person || blocked(nick)) { plaza.bubbles.delete(nick); continue; }
      rows.push({...bubble, nick, x: person.pos.x, y: person.pos.y, headroom: Math.max(64, person.el.offsetHeight + 8)});
    }
    const laid = bubblePositions(rows, now); layer.replaceChildren();
    const width = layer.clientWidth, height = layer.clientHeight, boxes = [];
    const avatars = [...plaza.people.values()].map(person => {
      const x = person.pos.x / 100 * width, y = person.pos.y / 100 * height, w = person.el.offsetWidth, h = person.el.offsetHeight;
      return {left: x - w / 2, right: x + w / 2, top: y - h, bottom: y};
    });
    // On a short floor, give the newest speaker the first safe bubble position.
    for (const row of height < 260 ? laid.reverse() : laid) {
      const bubble = make('span', 'plaza-bubble', row.text); layer.append(bubble);
      const w = Math.min(width, bubble.offsetWidth || 150), h = bubble.offsetHeight || 48;
      const x = row.x / 100 * width, y = row.y / 100 * height;
      let box;
      for (const offset of [0, -w, w]) {
        for (let lane = 0; lane < 5; lane++) {
          const left = Math.max(0, Math.min(width - w, x - w / 2 + offset));
          const top = Math.max(0, Math.min(height - h, y - row.headroom - h - (row.lane + lane) * (h + 6)));
          const candidate = {left, top, right: left + w, bottom: top + h};
          if (![...boxes, ...avatars].some(other => candidate.left < other.right + 4 && candidate.right + 4 > other.left && candidate.top < other.bottom + 4 && candidate.bottom + 4 > other.top)) { box = candidate; break; }
        }
        if (box) break;
      }
      if (!box) bubble.remove();
      else { bubble.style.left = box.left + 'px'; bubble.style.top = box.top + 'px'; boxes.push(box); }
    }
    if (laid.length) plaza.bubbleTimer = setTimeout(paintBubbles, Math.max(1, Math.min(...laid.map(row => row.until)) - now));
  }
  function appendChat(row, live = false) {
    if (!row?.id || typeof row.nick !== 'string' || blocked(row.nick) || typeof row.text !== 'string' || !row.text.trim() || row.text.length > 300) return;
    if (live && row.nick === plaza.nick && plaza.chat?.sent && row.text === plaza.chat.text) {
      clearTimeout(plaza.chat.timer); plaza.chat = null; $('lounge-input').readOnly = false; $('lounge-send').disabled = !plaza.ready; $('lounge-status').textContent = ''; startPlazaMove();
    }
    const log = $('lounge-log'); if (log.querySelector('[data-chat-id="' + CSS.escape(String(row.id)) + '"]')) return;
    const p = make('p', 'lounge-message'); p.dataset.chatId = row.id;
    p.append(button(row.nick, () => {window.ZERO?.navigate?.('lobby');closeLounge(); U()?.visit(row.nick); }, 'social-nick'), make('small', '', stamp(row.created_at)), make('span', 'social-text', row.text));
    p.append(button('신고', () => { if (plaza.chat) { $('lounge-status').textContent = '대화가 접수된 뒤 다시 신고해 주세요.'; return; } if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type: 'report', id: row.id, reason: '부적절한 내용'})); }));
    log.append(p); while (log.children.length > 200) log.firstElementChild.remove(); log.scrollTop = log.scrollHeight;
    if (live) {
      plaza.bubbles.delete(row.nick); plaza.bubbles.set(row.nick, {text: row.text, until: Date.now() + 6500});
      while (plaza.bubbles.size > 8) plaza.bubbles.delete(plaza.bubbles.keys().next().value);
      paintBubbles();
    }
  }
  function plazaDirection() {
    const has = (...keys) => keys.some(key => plaza.keys.has(key));
    const x = Number(has('ArrowRight', 'd', 'D')) - Number(has('ArrowLeft', 'a', 'A'));
    const y = Number(has('ArrowDown', 's', 'S')) - Number(has('ArrowUp', 'w', 'W'));
    return x || y ? {x, y} : null;
  }
  function ackPlazaMove(row) {
    const pending = plaza.pending;
    if (!pending || row.seq !== pending.body.seq || typeof row.ok !== 'boolean') return;
    const own = plaza.people.get(plaza.nick); if (!own) return;
    const positioned = Number.isFinite(row.x) && Number.isFinite(row.y) && row.x >= 0 && row.x <= 100 && row.y >= 0 && row.y <= 100 && Number.isSafeInteger(row.server_seq) && row.server_seq >= 0;
    if (row.ok && !positioned) return;
    if (row.error === 'REQUEST_BUSY') { pending.retryAt = Date.now() + 300; startPlazaMove(); return; }
    if (positioned && row.server_seq >= own.seq) { own.confirmed = {x: row.x, y: row.y}; own.seq = row.server_seq; }
    if (row.ok && pending.retries === 0) plaza.rtt = .7 * (plaza.rtt || 160) + .3 * Math.min(2500, Date.now() - pending.sentAt);
    plaza.pending = null;
    plaza.retryAt = Date.now() + (row.error === 'RATE_LIMIT' ? 1100 : row.ok || row.error === 'MOVE_STALE' ? 0 : 300);
    plaza.dirty = Math.hypot(own.pos.x - own.confirmed.x, own.pos.y - own.confirmed.y) > .01;
    if (row.error === 'MOVE_INVALID') { plaza.keys.clear(); plaza.target = null; }
    sendPlazaChat(); startPlazaMove();
  }
  function plazaFrame(timestamp) {
    plaza.raf = 0; if (!active || !plaza.ready || document.hidden) return;
    const person = plaza.people.get(plaza.nick); if (!person) return;
    const now = Date.now(), dt = Math.min(.05, Math.max(0, (timestamp - (plaza.last || timestamp)) / 1000)); plaza.last = timestamp;
    const confirmed = person.confirmed || person.pos;
    const next = plazaStep(person.pos, plazaDirection(), plaza.target, dt * Math.min(1, 160 / Math.max(160, plaza.rtt || 160)), plaza.bounds);
    const lead = Math.hypot(next.x - confirmed.x, next.y - confirmed.y);
    if (lead > 6) { next.x = confirmed.x + (next.x - confirmed.x) * 6 / lead; next.y = confirmed.y + (next.y - confirmed.y) * 6 / lead; }
    const dx = next.x - person.pos.x, dy = next.y - person.pos.y;
    if (dx || dy) {
      person.pos = next; person.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      paintPerson(person); paintBubbles(); plaza.dirty = true;
    }
    const pending = plaza.pending;
    if (pending && (pending.retryAt ? now >= pending.retryAt : now - pending.sentAt >= 2000) && socket?.readyState === WebSocket.OPEN) {
      if (now - pending.startedAt >= 6000) { stopPlaza(); $('lounge-status').textContent = '이동 응답을 기다리지 못했어요. 다시 연결해 주세요.'; showLoungeRetry(); return; }
      pending.retries++; pending.retryAt = 0; pending.sentAt = now; socket.send(JSON.stringify(pending.body));
    }
    if (!plaza.pending && !plaza.chat && plaza.dirty && now >= (plaza.retryAt || 0) && now - plaza.sentAt >= 160 && socket?.readyState === WebSocket.OPEN) {
      const distance = Math.hypot(person.pos.x - confirmed.x, person.pos.y - confirmed.y);
      if (distance > .01) {
        const step = Math.min(distance, Number.isFinite(plaza.sentAt) ? Math.min(4, (now - plaza.sentAt) * .022) : 1.5);
        const body = {type: 'move', x: confirmed.x + (person.pos.x - confirmed.x) * step / distance, y: confirmed.y + (person.pos.y - confirmed.y) * step / distance, direction: person.direction || 'down', seq: ++plaza.seq};
        plaza.pending = {body, startedAt: now, sentAt: now, retries: 0}; plaza.sentAt = now; socket.send(JSON.stringify(body));
      } else plaza.dirty = false;
    }
    if (plaza.target && Math.hypot(next.x - plaza.target.x, next.y - plaza.target.y) < .1) plaza.target = null;
    const moving = !!(dx || dy); person.el.dataset.walking = String(moving);
    if (plaza.keys.size || plaza.target || plaza.dirty || plaza.pending) plaza.raf = requestAnimationFrame(plazaFrame);
  }
  function startPlazaMove() { if (active && plaza.ready && !plaza.raf && !document.hidden) { plaza.last = 0; plaza.raf = requestAnimationFrame(plazaFrame); } }
  function showLoungeRetry() {
    let retry = $('lounge-retry');
    if (!retry) {
      retry = button('광장 다시 연결', () => {
        if (!U()?.session()?.nick) { U()?.openProfile(); return; }
        closeSocket(); loungeGeneration++; active = true; retries = 0; connectLounge();
      }); retry.id = 'lounge-retry'; lounge.append(retry);
    }
    retry.hidden = false;
  }
  function connectLounge() {
    if (!active || document.hidden) return;
    const generation = loungeGeneration; $('lounge-status').textContent = '공용 광장에 접속하고 있어요'; $('lounge-loading').hidden = false; $('lounge-send').disabled = true;
    try { socket = U().openLoungeSocket(); }
    catch (error) { $('lounge-status').textContent = message(error); $('lounge-loading').hidden = true; showLoungeRetry(); return; }
    const connection = socket;
    connection.addEventListener('message', event => {
      if (generation !== loungeGeneration || !active || socket !== connection) return;
      let data; try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === 'ready') {
        retries = 0; plaza.moveAck = data.move_ack === true; plaza.pending = null; plaza.rtt = 160; plaza.retryAt = 0; if ($('lounge-retry')) $('lounge-retry').hidden = true; plaza.nick = data.nick; plaza.seq = 0; plaza.sentAt = -Infinity; plaza.people.forEach(removePet); plaza.people.clear(); $('lounge-people').replaceChildren();
        roomPeople(data.participants); plaza.ready = plaza.people.has(data.nick);
        const own = plaza.people.get(data.nick); if (own) plaza.seq = Math.max(0, own.seq);
        $('lounge-loading').hidden = true; $('lounge-status').textContent = plaza.ready ? '연결됨 · 바닥을 누르거나 왼쪽 패드로 걸어요' : '대화 연결됨 · 서버의 캐릭터 위치를 기다리고 있어요';
        $('lounge-send').disabled = false; $('lounge-log').replaceChildren(); (data.messages || []).forEach(row => appendChat(row));
        if ($('lounge-input').parentElement.hidden) $('plaza-stage').focus({preventScroll: true}); startPlazaMove();
        clearInterval(heartbeat); heartbeat = setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send('ping'); }, 30000);
      }
      if (data.type === 'presence') roomPeople(data.participants);
      if (data.type === 'position') movedPerson(data);
      if (data.type === 'move_ack' && plaza.moveAck) ackPlazaMove(data);
      if (data.type === 'message') appendChat(data.message, true);
      if (data.type === 'error') {
        $('lounge-status').textContent = message(data); if (plaza.chat?.sent) restorePlazaChat(message(data));
        if (!plaza.moveAck && ['REQUEST_BUSY', 'MOVE_TOO_FAST', 'MOVE_INVALID', 'MOVE_STALE', 'RATE_LIMIT'].includes(data.error) && plaza.pending) {
          const own = plaza.people.get(plaza.nick);
          ackPlazaMove({seq: plaza.pending.body.seq, ok: false, error: data.error, x: own?.confirmed?.x, y: own?.confirmed?.y, server_seq: own?.seq});
        }
        if (['UNAUTHORIZED', 'TOKEN_EXPIRED', 'AUTH_FAILED', 'AUTH_REQUIRED', 'AUTH_TIMEOUT', 'SESSION_EXPIRED', 'DATA_UNAVAILABLE'].includes(data.error)) { active = false; closeSocket(); $('lounge-loading').hidden = true; $('lounge-send').disabled = true; plaza.people.forEach(removePet); plaza.people.clear(); $('lounge-people').replaceChildren(); $('lounge-log').replaceChildren(); showLoungeRetry(); }
      }
      if (data.type === 'reported') $('lounge-status').textContent = '신고를 접수했어요.';
    });
    connection.addEventListener('error', () => {
      if (generation !== loungeGeneration || !active || socket !== connection) return;
      stopPlaza(); $('lounge-send').disabled = true; $('lounge-loading').hidden = true;
      $('lounge-status').textContent = '광장 연결을 확인하지 못했어요. 다른 화면은 계속 사용할 수 있습니다.'; showLoungeRetry();
    });
    connection.addEventListener('close', () => {
      if (generation !== loungeGeneration || !active || socket !== connection) return;
      clearInterval(heartbeat); stopPlaza(); $('lounge-send').disabled = true; $('lounge-loading').hidden = true; $('lounge-status').textContent = '연결이 끊겼어요.'; showLoungeRetry();
      if (!document.hidden && retries < 3) { retries++; reconnect = setTimeout(connectLounge, Math.min(15000, 1000 * 2 ** retries)); }
    });
  }
  function openLounge() {
    if(window.ZERO?.currentView?.()&&window.ZERO.currentView()!=='plaza'&&document.getElementById('plaza-view'))return window.ZERO.navigate('plaza');
    if (!U()?.session()?.nick) { if(U()?.restoringSession?.())return true;U()?.openProfile();return false; }
    if (active && lounge && !lounge.hidden) return true;
    if (!lounge) {
      lounge = make('section', 'lounge-dialog'); lounge.hidden = true; lounge.setAttribute('aria-label', 'ZERO 공용 광장');
      const head = make('header', 'lounge-hud'), title = make('h2', '', '공용 광장');
      const history = make('details', 'lounge-history'); history.id = 'lounge-history'; history.open = false;
      const historyTitle = make('summary', '', '대화 기록'); history.append(historyTitle);
      head.append(title, history, button('나가기', leaveLounge));
      const loading = make('div', 'lounge-loading'); loading.id = 'lounge-loading'; loading.append(make('span', 'boot-ring'), make('span', '', '광장으로 이동하고 있습니다…'));
      const status = make('p', 'social-status'); status.id = 'lounge-status';
      const count = make('b'); count.id = 'lounge-count';
      const scene = make('div', 'plaza-stage'); scene.id = 'plaza-stage'; scene.tabIndex = 0; scene.setAttribute('aria-label', '광장 · 바닥을 누르거나 방향키로 내 캐릭터 이동');
      const people = make('div', 'lounge-people'); people.id = 'lounge-people';
      const bubbles = make('div', 'plaza-bubbles'); bubbles.id = 'lounge-bubbles';
      const interior = make('div', 'plaza-interior'); interior.setAttribute('aria-hidden', 'true');
      const wall = make('div', 'plaza-wall'), board = make('div', 'plaza-exchange-board');
      board.append(make('b', 'plaza-sign', 'ZERO 거래소'), make('span', 'plaza-ticker', 'KOSPI · NASDAQ · ETF  /  시세는 투자 화면에서 확인'));
      wall.append(board, make('span', 'plaza-wall-light plaza-wall-light-left'), make('span', 'plaza-wall-light plaza-wall-light-right'));
      const desk = make('div', 'plaza-desk'); desk.append(make('i', 'plaza-terminal'), make('span', '', '안내 데스크'), make('i', 'plaza-terminal'));
      interior.append(wall, make('div', 'plaza-floor-mark', 'ZERO'), desk, make('div', 'plaza-planter plaza-planter-left'), make('div', 'plaza-planter plaza-planter-right'));
      scene.append(interior);
      for (const [view, label] of [['lobby', '사무실'], ['analysis', '시장 보기'], ['community', '게시판']]) {
        const door = button(label, () => { closeLounge(); window.ZERO?.navigate?.(view); }, 'plaza-door plaza-door-' + view);
        door.setAttribute('aria-label', label + (label === '게시판' ? '으로 이동' : '로 이동')); scene.append(door);
      }
      scene.append(people, bubbles);
      scene.addEventListener('pointerdown', event => {
        if (event.target.closest?.('button') || !plaza.ready) return;
        const box = scene.getBoundingClientRect(); if (!box.width || !box.height) return;
        const pos = {x: (event.clientX - box.left) / box.width * 100, y: (event.clientY - box.top) / box.height * 100};
        plaza.keys.clear(); plaza.target = plazaStep(pos, null, null, 0, plaza.bounds); scene.focus({preventScroll: true}); startPlazaMove();
      });
      const pad = make('div', 'plaza-pad'); pad.setAttribute('aria-label', '광장 이동 버튼');
      for (const [key, label] of [['ArrowLeft', '←'], ['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowRight', '→']]) {
        const control = button(label, () => {}, 'secondary-button'); control.setAttribute('aria-label', {ArrowLeft:'왼쪽으로 이동',ArrowUp:'위로 이동',ArrowDown:'아래로 이동',ArrowRight:'오른쪽으로 이동'}[key]);
        control.addEventListener('pointerdown', event => { event.preventDefault(); control.setPointerCapture?.(event.pointerId); plaza.target = null; plaza.keys.add(key); startPlazaMove(); });
        for (const end of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) control.addEventListener(end, () => plaza.keys.delete(key));
        control.addEventListener('contextmenu', event => event.preventDefault()); control.addEventListener('selectstart', event => event.preventDefault()); pad.append(control);
      }
// Sliding a finger across the pad steers in 8 directions using the same key set.
      const steer = event => { if (!event.buttons && event.pointerType !== 'touch') return; const box = pad.getBoundingClientRect(), dx = event.clientX - box.left - box.width / 2, dy = event.clientY - box.top - box.height / 2; if (Math.hypot(dx, dy) < 12) return; const want = new Set(); if (Math.abs(dx) > Math.abs(dy) * 0.41) want.add(dx < 0 ? 'ArrowLeft' : 'ArrowRight'); if (Math.abs(dy) > Math.abs(dx) * 0.41) want.add(dy < 0 ? 'ArrowUp' : 'ArrowDown'); for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']) want.has(key) ? plaza.keys.add(key) : plaza.keys.delete(key); pad.querySelectorAll('button').forEach((b, i) => b.classList.toggle('pad-on', want.has(['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'][i]))); plaza.target = null; startPlazaMove(); };
      pad.addEventListener('pointermove', steer); for (const end of ['pointerup', 'pointercancel']) pad.addEventListener(end, () => { for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']) plaza.keys.delete(key); pad.querySelectorAll('button').forEach(b => b.classList.remove('pad-on')); });
      const log = make('div', 'lounge-log'); log.id = 'lounge-log'; log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
      const form = make('form', 'lounge-chat-form'), input = make('input'); form.hidden = true; input.id = 'lounge-input'; input.maxLength = 300; input.placeholder = '공개 대화 입력 · Enter 전송 · Esc 취소'; input.setAttribute('aria-label', '광장 메시지'); input.required = true; input.autocomplete = 'off';
      const send = make('button', 'primary-button', '보내기'); send.id = 'lounge-send'; send.type = 'submit'; form.append(input, send);
      let composing = false, imeEnter = false;
      input.addEventListener('compositionstart', () => { composing = true; });
      input.addEventListener('compositionend', () => { composing = false; });
      input.addEventListener('focus', () => { plaza.keys.clear(); plaza.target = null; });
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !composing && !event.isComposing) { event.preventDefault(); event.stopPropagation?.(); setPlazaChat(false); return; }
        if (event.key !== 'Enter') return;
        if (!input.value.trim() && !composing && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); event.stopPropagation?.(); setPlazaChat(false); return; }
        if (composing || event.isComposing || event.keyCode === 229) {
          // Let the IME commit text, but reject its implicit form submission.
          imeEnter = true; setTimeout(() => { imeEnter = false; }, 0); return;
        }
        event.preventDefault(); event.stopPropagation?.();
        if (!event.repeat) { imeEnter = false; form.requestSubmit(); }
      });
      form.addEventListener('submit', event => {
        event.preventDefault();
        const text = input.value.trim();
        if (composing || imeEnter || !text || text.length > 300 || socket?.readyState !== WebSocket.OPEN || send.disabled) return;
        if (Date.now() - plaza.chatAt < 2000) { status.textContent = errors.CHAT_TOO_FAST; return; }
        plaza.chat = {text, sent: false}; input.value = ''; input.readOnly = true; send.disabled = true; setPlazaChat(false); sendPlazaChat();
      });
      history.append(make('p', 'muted-note', '공개 대화 · 최대 24시간 보관 · 연락처·계좌번호는 올리지 마세요.'), log);
      const chatToggle = button('대화하기', () => setPlazaChat(true), 'plaza-chat-toggle'); chatToggle.title = 'Enter 키로도 열 수 있어요';
      head.append(count); lounge.append(scene, head, loading, status, pad, chatToggle, form);
      ($('plaza-view') || document.body).append(lounge);
      new ResizeObserver(() => { const w = scene.clientWidth, h = scene.clientHeight; if (w && h) { const edge = Math.min(40, 34 / w * 100); plaza.bounds = {minX: edge, maxX: 100 - edge, minY: Math.min(70, 72 / h * 100), maxY: 100 - 8 / h * 100}; } plaza.people.forEach(paintPerson); paintBubbles(); }).observe(scene);
    }
    closeSocket(); active = true; retries = 0; loungeGeneration++; lounge.hidden = false; if ($('plaza-view')) $('plaza-view').dataset.entered = 'true'; setPlazaChat(false); connectLounge(); return true;
  }
  window.addEventListener('keydown', event => {
    if (!active || !lounge || lounge.hidden || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.target.isContentEditable || document.querySelector?.('dialog[open]') || event.target.closest?.('input, textarea, select, button, summary') || event.key === 'Tab') return;
    if (event.key === 'Enter') { event.preventDefault(); if (!event.repeat) setPlazaChat(true); return; }
    if (event.key === 'Escape') { event.preventDefault(); leaveLounge(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(event.key)) return;
    event.preventDefault(); plaza.target = null; plaza.keys.add(event.key); startPlazaMove();
  });
  window.addEventListener('keyup', event => plaza.keys.delete(event.key));
  window.addEventListener('blur', () => { plaza.keys.clear(); plaza.target = null; });
  document.addEventListener('visibilitychange', () => {
    if (!active) return; closeSocket(); loungeGeneration++;
    if (document.hidden) { $('lounge-send').disabled = true; $('lounge-status').textContent = '화면을 다시 열면 재접속합니다.'; }
    else connectLounge();
  });

  let closet;
  function removePet(entity) {
    if (!entity?.pet) return;
    if (entity.pet.raf) cancelAnimationFrame(entity.pet.raf); entity.pet.el.remove(); entity.pet = null;
  }
  function updatePet(entity, dimensions) {
    const pet = entity.pet; if (!pet || !entity.el?.parentElement || !entity.pos) return;
    pet.dimensions = dimensions || {w: 160, h: 100};
    const tick = timestamp => {
      pet.raf = 0;
      if (!pet.el.isConnected || !entity.el.isConnected || document.hidden) return;
      const dt = Math.min(.05, Math.max(.016, (timestamp - (pet.last || timestamp - 16)) / 1000)); pet.last = timestamp;
      pet.pos = followPet(pet.pos, entity.pos, dt, reduced);
      const size = entity.el.parentElement, x = Math.max(2, Math.min(pet.dimensions.w - 2, pet.pos.x)), y = Math.max(8, Math.min(pet.dimensions.h - 2, pet.pos.y));
      pet.el.style.transform = 'translate(' + (x / pet.dimensions.w * size.clientWidth) + 'px,' + (y / pet.dimensions.h * size.clientHeight) + 'px) translate(-50%,-100%)';
      pet.el.style.zIndex = String(Math.round(entity.pos.y * (pet.dimensions.w === 160 ? 10 : 1))); pet.el.dataset.walking = String(Math.hypot(pet.pos.x - (entity.pos.x - 5), pet.pos.y - (entity.pos.y + 2)) > .2);
      if (pet.el.dataset.walking === 'true' && !reduced) pet.raf = requestAnimationFrame(tick);
    };
    if (!pet.raf) { pet.last = 0; pet.raf = requestAnimationFrame(tick); }
  }
  function paintAppearance(entity,appearance){if(!entity?.el||!appearance)return;const fig=entity.el.querySelector('.npc-fig, .lounge-person-figure');if(!fig)return;
    if(/^(suit|vest|cardigan|hoodie|shirt|jacket|knit|polo)$/.test(appearance.outfit))fig.dataset.outfit=appearance.outfit;
    if(/^[0-3]$/.test(String(appearance.hair)))fig.dataset.hair=String(appearance.hair);
    entity.el.dataset.shoes=['dark','white','blue','red'].includes(appearance.shoes)?appearance.shoes:'dark';entity.el.dataset.accessory=['none','glasses','cap','headphones'].includes(appearance.accessory)?appearance.accessory:'none';
    const pets = {cat: '🐈', dog: '🐕', bird: '🐦'};
    if (!pets[appearance.pet]) removePet(entity);
    else if (entity.pet?.kind !== appearance.pet) {
      removePet(entity);
      const el = make('span', 'player-pet pet-follower', pets[appearance.pet]); el.setAttribute('aria-hidden', 'true');
      entity.el.parentElement?.append(el); entity.pet = {kind: appearance.pet, el, pos: {...entity.pos}, raf: 0, last: 0};
    }
    updatePet(entity, entity.el.classList.contains('lounge-person') ? {w: 100, h: 100} : undefined);
  }
  function paint() {
    const state = window.ZEROLobby?.state, session = U()?.session(), appearance = session?.appearance || {outfit: 'suit', hair: 0, shoes: 'dark', accessory: 'none', pet: 'none'};
    window.ZEROLobby?.setCharacterProgress(session?.progress);
    if (state?.player) { paintAppearance(state.player, appearance); state.player.el.querySelector('.company-level')?.remove(); }
    const host = state?.npcs?.find(row => row.id === 'host'); if (host) paintAppearance(host, state.visit?.appearance);
    const own = plaza.people.get(plaza.nick); if (own) paintAppearance(own, appearance);
  }
  function openWardrobe(){const session=U()?.session();if(!session?.nick){U()?.openProfile();return;}if(!closet)closet=dialog('내 캐릭터 · 성장과 꾸미기');closet.querySelectorAll(':scope > :not(header)').forEach(e=>e.remove());
    const progress=session.progress||{},form=make('form','social-form'),note=make('p','social-status'),values={...session.appearance},labels={outfit:'옷',hair:'헤어스타일',shoes:'신발',accessory:'장신구',pet:'펫'};
    const confirmed = serverProgress(progress);
    closet.append(make('p', '', confirmed ? '회사 Lv.' + progress.level + ' · ' + progress.xp + ' XP' : '회사 XP · 서버 확인 전'),
      make('p', 'muted-note', '교육·운용 점검 XP와 성과 XP는 별도입니다. 성과 XP는 최소 30일(달력 기준)·완료된 일별 수익률 20개와 Sharpe·MDD 근거, KRW 전체 계좌 순자산 100만원 이상·총레버리지 최대 1배가 필요합니다. 게임 보상 기준이며 투자 위험 한도가 아닙니다. 가상 연습 수익률·로컬 학습 XP로 꾸미기를 해제하지 않습니다.'));
    const policy = make('details'); policy.append(make('summary', '', '성과 XP 게임 보상 기준 · risk-v1'),
      make('p', 'muted-note', '원장·입출금·전체 계좌·상품 위험을 대조한 검증 근거가 필요합니다. MDD(최대 낙폭) 30% 이상은 0점입니다.'),
      make('p', 'muted-note', '목표점수 = floor(500 × min(순수익률%/20, 1) × min(Sharpe/2, 1) × (1 − MDD/0.30) × min(기간일수/365, 1)). MDD는 비율로 계산합니다.'),
      make('p', 'muted-note', '성과 XP는 평생 최고 기록 기준 최대 500점이며 같은 기록을 중복 보상하지 않습니다. 잔고 금액 배율·소액 보너스는 없고 전액 출금 후에도 이력을 초기화하지 않습니다.'));
    closet.append(policy);
    if (Number.isSafeInteger(progress.legacy_return_xp) && progress.legacy_return_xp > 0) closet.append(make('p', 'muted-note', '이전 성과 XP ' + progress.legacy_return_xp + ' · 기록 열람용 · 새 꾸미기 해제에서 제외'));
    const events = Array.isArray(progress.events) ? progress.events : [];
    if (events.length) {
      const history = make('ul', 'company-xp-events');
      const sources = {quiz_pass: '학교 답안 검증', daily_review: '운용 기록 검토', verified_return: '성과 기록 검증'};
      for (const event of events.slice(0, 10)) if (Number.isSafeInteger(event.xp) && event.xp >= 0) history.append(make('li', '', (sources[event.source] || '서버 검증 이벤트') + ' · +' + event.xp + ' XP'));
      closet.append(history);
    }
    Object.entries(labels).forEach(([kind,label])=>{const field=make('label','social-field',label),select=make('select');const options=session.catalog?.[kind]||[];options.forEach(item=>{const option=make('option','',item.label+(item.level>progress.level?' · Lv.'+item.level+' 잠김':''));option.value=item.id;option.disabled=!confirmed||item.level>progress.level;select.append(option);});select.value=values[kind]||options[0]?.id||'';select.addEventListener('change',()=>values[kind]=select.value);values[kind]=select.value;field.append(select);form.append(field);});
    const send=make('button','primary-button','꾸미기 저장');send.type='submit';send.disabled=!confirmed;form.append(note,send);form.addEventListener('submit',async e=>{e.preventDefault();if(send.disabled)return;send.disabled=true;const epoch=sessionEpoch;try{await request('/me/appearance',{method:'PUT',body:values});await U().refresh();if(epoch!==sessionEpoch)return;paint();closet.close();}catch(error){if(epoch===sessionEpoch)note.textContent=message(error);}finally{send.disabled=false;}});closet.append(form);closet.showModal();
  }
  document.addEventListener('zero-ready',paint);
  document.addEventListener('zero-profile-updated',paint);
  document.addEventListener('zero-session-changed',()=>{sessionEpoch++;guestGeneration++;closeLounge();if(guest?.open)guest.close();guest?.querySelectorAll(':scope > :not(header)').forEach(e=>e.remove());if(compose?.open)compose.close();compose?.querySelector('form')?.reset();if(closet?.open)closet.close();closet?.querySelectorAll(':scope > :not(header)').forEach(e=>e.remove());paint();if(window.ZERO?.currentView?.()==='community')openCommunity(true);if(window.ZERO?.currentView?.()==='plaza'&&U()?.session()?.nick)openLounge();});
  window.ZEROSocial={openCommunity:()=>openCommunity(!loaded),openLounge,closeLounge,openGuestbook,openWardrobe,paintAppearance,updatePet,removePet};
  if(window.ZERO?.currentView?.()==='community')openCommunity(true);
  if(window.ZERO?.currentView?.()==='plaza')openLounge();
})();
