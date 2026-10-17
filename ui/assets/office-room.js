/* Live office room: when you visit someone's office (or sit in your own), people in the same office see each other and talk.
   The plaza socket protocol is reused per office; the server decides who may enter, levels and outfits. */
(() => {
  'use strict';
  const view = document.getElementById('lobby-view'), stage = document.getElementById('lobby-stage');
  if (!view || !stage) return;
  const U = () => window.ZEROLobbyUsers, S = () => window.ZEROLobby?.state;
  const make = (tag, cls = '', text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const button = (text, action, cls = 'secondary-button') => { const b = make('button', cls, text); b.type = 'button'; b.addEventListener('click', action); return b; };
  const errors = {ROOM_CLOSED: '주인이 실시간 대화를 열어 두지 않았어요. 사무실은 계속 둘러볼 수 있어요.', ROOM_KICKED: '이 사무실의 실시간 대화에서 내보내졌어요. 1시간 뒤 다시 들어올 수 있어요.', ROOM_BLOCKED: '이 사무실의 실시간 대화에는 들어갈 수 없어요.',
    TEXT_BLOCKED: '욕설·비속어가 들어간 대화는 보낼 수 없어요.', TEXT_INVALID: '300자 이내의 일반 문장으로 보내 주세요.', CHAT_TOO_FAST: '대화는 2초 간격으로 보낼 수 있어요.', RATE_LIMIT: '잠시 쉬었다가 다시 보내 주세요.',
    CONNECTION_LIMIT: '이 사무실은 지금 가득 찼어요(최대 12명).', TOKEN_EXPIRED: '로그인이 만료됐어요. 다시 로그인해 주세요.', SESSION_EXPIRED: '연결이 오래 멈춰 다시 연결해야 해요.', DATA_UNAVAILABLE: '대화 서버를 확인하지 못했어요.'};
  const FINAL = ['ROOM_CLOSED', 'ROOM_KICKED', 'ROOM_BLOCKED', 'CONNECTION_LIMIT', 'UNAUTHORIZED', 'TOKEN_EXPIRED', 'AUTH_REQUIRED', 'AUTH_TIMEOUT'];
  const R = {office: null, socket: null, generation: 0, ready: false, nick: null, host: false, open: false, people: new Map(), confirmed: null, pending: null, seq: 0, timer: 0, heartbeat: 0, retry: 0, retries: 0, stopped: false, profileKey: null};

  // Floating card over the office canvas (outside the stage, which is rebuilt); collapsed until someone else is here or speaks.
  const panel = make('details', 'office-room'); panel.id = 'office-room'; panel.hidden = true;
  const summary = make('summary', '', '사무실 대화'), count = make('span', 'office-room-count');
  summary.append(count); panel.append(summary);
  const status = make('p', 'office-room-status'); status.setAttribute('role', 'status');
  const openLabel = make('label', 'office-room-open'), openBox = make('input'); openBox.type = 'checkbox';
  openLabel.append(openBox, document.createTextNode(' 방문자와 실시간 대화 받기')); openLabel.hidden = true;
  openBox.addEventListener('change', () => send({type: 'settings', open: openBox.checked}) || (openBox.checked = R.open));
  const roster = make('ul', 'office-room-people'); roster.setAttribute('aria-label', '이 사무실에 있는 사람');
  const log = make('div', 'office-room-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
  const form = make('form', 'office-room-form'), input = make('input'), sendButton = make('button', 'primary-button', '보내기');
  input.maxLength = 300; input.autocomplete = 'off'; input.placeholder = '이 사무실에 있는 사람에게 말하기'; input.setAttribute('aria-label', '사무실 대화 입력'); sendButton.type = 'submit';
  form.append(input, sendButton);
  const retry = button('다시 연결', () => { R.stopped = false; R.retries = 0; connect(); }); retry.hidden = true;
  panel.append(status, openLabel, roster, log, form, retry, make('p', 'muted-note', '공개 대화 · 최대 24시간 보관 · 연락처·계좌번호·보유 종목은 올리지 마세요. 자산과 보유 종목은 다른 사람에게 보이지 않아요.'));
  (stage.parentElement || view).append(panel);
  for (const name of ['pointerdown', 'click']) panel.addEventListener(name, event => event.stopPropagation());

  let composing = false;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('keydown', event => event.stopPropagation());
  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (composing || !text || !R.ready) return;
    if (send({type: 'message', text})) input.value = '';
  });

  function send(body) {
    if (R.socket?.readyState !== WebSocket.OPEN || !R.ready) return false;
    R.socket.send(JSON.stringify(body)); return true;
  }
  function target() {
    const state = S(), session = U()?.session?.();
    if (!state?.active || !state.player || document.hidden) return null;
    if (window.ZERO?.currentView?.() && window.ZERO.currentView() !== 'lobby' && !state.docked) return null;
    if (state.mode === 'visit' && state.visit?.nick) return state.visit.nick;
    if (state.mode === 'own' && session?.nick) return session.nick;
    return null;
  }
  function liveHost(on) {
    // While the real owner is here, the scripted host stand-in steps aside.
    const host = S()?.npcs?.find(npc => npc.id === 'host'); if (!host) return;
    if (on && !host.liveOwner) { host.liveOwner = {hidden: host.hidden}; host.hidden = true; }
    else if (!on && host.liveOwner) { host.hidden = host.liveOwner.hidden; host.liveOwner = null; }
    if (host.el) host.el.dataset.liveOwner = String(!!on);
  }
  function drop(person) { window.ZEROSocial?.removePet?.(person); person.el.remove(); }
  function clearPeople() { for (const person of R.people.values()) drop(person); R.people.clear(); roster.replaceChildren(); R.ownerHere = false; liveHost(false); }
  function disconnect() {
    R.generation++; R.ready = false; R.pending = null; R.confirmed = null;
    clearInterval(R.timer); clearInterval(R.heartbeat); clearTimeout(R.retry); R.timer = R.heartbeat = R.retry = 0;
    if (R.socket) { const old = R.socket; R.socket = null; try { old.close(); } catch (_) {} }
    clearPeople(); sendButton.disabled = true;
  }
  function figure(row) {
    const el = make('div', 'lounge-person office-room-person'), fig = make('span', 'lounge-person-figure'), bubble = make('span', 'office-room-bubble');
    let hue = 20; for (const char of row.nick) hue = (hue * 31 + char.charCodeAt(0)) % 360;
    fig.style.setProperty('--person-hue', String(hue)); fig.append(make('i', 'head'), make('i', 'body'), make('i', 'arms'), make('i', 'legs'));
    bubble.hidden = true; el.append(bubble, fig, make('span', 'lounge-person-name'));
    stage.append(el); return {el, bubble, until: 0};
  }
  function paint(person, row) {
    person.el.style.left = row.x + '%'; person.el.style.top = row.y + '%'; person.el.style.zIndex = String(Math.round(row.y * 10) + 1);
    person.el.dataset.facing = row.direction || 'down'; person.pos = {x: row.x, y: row.y};
    if (!person.el.isConnected) stage.append(person.el); // buildStage() clears the stage on scene changes.
    window.ZEROSocial?.updatePet?.(person, {w: 100, h: 100});
  }
  function people(rows) {
    const list = (Array.isArray(rows) ? rows : []).filter(row => typeof row?.nick === 'string' && Number.isFinite(row.x) && Number.isFinite(row.y));
    const blocks = U()?.session?.()?.blocks || [], keep = new Set();
    count.textContent = ' · 접속 ' + list.length + '명';
    roster.replaceChildren();
    for (const row of list) {
      const label = row.nick + (Number.isSafeInteger(row.level) ? ' Lv.' + row.level : '') + (row.owner ? ' · 주인' : '');
      const item = make('li', '', label + (row.nick === R.nick ? ' (나)' : ''));
      if (R.host && row.nick !== R.nick) item.append(button('내보내기', () => send({type: 'kick', nick: row.nick})), button('차단', () => blockVisitor(row.nick)));
      roster.append(item);
      if (row.nick === R.nick || blocks.includes(row.nick)) continue;
      keep.add(row.nick); let person = R.people.get(row.nick);
      if (!person) { person = figure(row); R.people.set(row.nick, person); }
      person.el.querySelector('.lounge-person-name').textContent = label;
      paint(person, row);
      window.ZEROSocial?.paintAppearance?.(person, row.appearance);
    }
    for (const [nick, person] of R.people) if (!keep.has(nick)) { drop(person); R.people.delete(nick); }
    R.ownerHere = !R.host && list.some(row => row.owner); liveHost(R.ownerHere);
    if (list.length > 1 && !panel.dataset.seen) { panel.open = true; panel.dataset.seen = 'true'; }
  }
  async function blockVisitor(nick) {
    try { await U().request('/me/blocks', {method: 'POST', body: {nick}}); await U().refresh?.(); } catch (_) { status.textContent = '차단을 저장하지 못했어요. 내보내기는 계속할게요.'; }
    send({type: 'kick', nick});
  }
  function chat(row, live) {
    if (!row?.id || typeof row.nick !== 'string' || typeof row.text !== 'string' || (U()?.session?.()?.blocks || []).includes(row.nick)) return;
    if (log.querySelector('[data-chat-id="' + CSS.escape(String(row.id)) + '"]')) return;
    const p = make('p', 'office-room-message'); p.dataset.chatId = row.id;
    p.append(make('b', '', row.nick), document.createTextNode(' ' + row.text));
    if (row.nick !== R.nick) p.append(button('신고', () => send({type: 'report', id: row.id, reason: '부적절한 내용'}), 'office-room-report'));
    log.append(p); while (log.children.length > 200) log.firstElementChild.remove(); log.scrollTop = log.scrollHeight;
    if (!live) return;
    if (!panel.open) panel.open = true;
    const person = R.people.get(row.nick);
    if (person) { person.bubble.textContent = row.text; person.bubble.hidden = false; const until = person.until = Date.now() + 6500; setTimeout(() => { if (person.until === until) person.bubble.hidden = true; }, 6600); }
  }
  // Mirror the local walker into the room at a pace the server's speed check accepts.
  function pushMove() {
    const player = S()?.player; if (!R.ready || !player?.pos || !R.confirmed) return;
    if (R.pending && Date.now() - R.pending.at < 2000) return;
    const want = {x: Math.max(0, Math.min(100, player.pos.x / 1.6)), y: Math.max(0, Math.min(100, player.pos.y))};
    const distance = Math.hypot(want.x - R.confirmed.x, want.y - R.confirmed.y); if (distance < .3) return;
    const step = Math.min(distance, 4), x = R.confirmed.x + (want.x - R.confirmed.x) * step / distance, y = R.confirmed.y + (want.y - R.confirmed.y) * step / distance;
    const dx = x - R.confirmed.x, dy = y - R.confirmed.y, direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    R.pending = {seq: ++R.seq, at: Date.now()}; send({type: 'move', x, y, direction, seq: R.seq});
  }
  function connect() {
    disconnect(); retry.hidden = true;
    if (!R.office) return;
    if (!U()?.session?.()?.nick) { status.textContent = '로그인하면 이 사무실에 있는 사람과 대화할 수 있어요.'; return; }
    const generation = R.generation; let socket;
    status.textContent = '사무실 대화에 연결하고 있어요';
    try { socket = U().openLoungeSocket(R.office); } catch (_) { status.textContent = '로그인하면 이 사무실에 있는 사람과 대화할 수 있어요.'; return; }
    R.socket = socket;
    socket.addEventListener('message', event => {
      if (generation !== R.generation) return;
      let data; try { data = JSON.parse(event.data); } catch (_) { return; }
      // Shown only once a room server has answered, so an older Worker without office rooms leaves no dead panel.
      if (!R.reached) { R.reached = true; panel.hidden = !R.office; }
      if (data.type === 'ready') {
        R.ready = true; R.retries = 0; R.nick = data.nick; R.host = data.room?.host === true; R.open = data.room?.open === true; R.seq = 0;
        openLabel.hidden = !R.host; openBox.checked = R.open; sendButton.disabled = false; log.replaceChildren();
        const own = (data.participants || []).find(row => row.nick === data.nick); R.confirmed = own ? {x: own.x, y: own.y} : null;
        people(data.participants); (data.messages || []).forEach(row => chat(row, false));
        status.textContent = R.host ? (R.open ? '방문자가 들어오면 여기서 바로 대화할 수 있어요.' : '지금은 방문자 대화를 받지 않아요. 위 상자를 켜면 들어올 수 있어요.') : '같은 사무실에 있는 사람과 대화할 수 있어요.';
        R.timer = setInterval(pushMove, 200);
        R.heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); }, 30000);
      }
      if (data.type === 'presence') people(data.participants);
      if (data.type === 'position') { const person = R.people.get(data.nick); if (person) paint(person, data); }
      if (data.type === 'move_ack' && R.pending?.seq === data.seq) { R.pending = null; if (Number.isFinite(data.x) && Number.isFinite(data.y)) R.confirmed = {x: data.x, y: data.y}; }
      if (data.type === 'message') chat(data.message, true);
      if (data.type === 'room') { R.open = data.open === true; openBox.checked = R.open; if (R.host) status.textContent = R.open ? '방문자 대화를 받고 있어요.' : '방문자 대화를 닫았어요.'; }
      if (data.type === 'kicked') status.textContent = data.nick + '님을 1시간 동안 내보냈어요.';
      if (data.type === 'reported') status.textContent = '신고를 접수했어요.';
      if (data.type === 'error') {
        status.textContent = errors[data.error] || '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
        if (FINAL.includes(data.error)) { R.stopped = true; disconnect(); if (!['ROOM_KICKED', 'ROOM_BLOCKED'].includes(data.error)) retry.hidden = false; }
      }
    });
    const lost = () => {
      if (generation !== R.generation) return;
      R.ready = false; clearInterval(R.timer); clearInterval(R.heartbeat); sendButton.disabled = true; clearPeople();
      if (R.stopped) return;
      if (R.retries < 3) { R.retries++; status.textContent = '연결이 끊겨 다시 연결하고 있어요'; R.retry = setTimeout(connect, 1000 * 2 ** R.retries); }
      else { status.textContent = '사무실 대화에 연결하지 못했어요. 사무실은 계속 둘러볼 수 있어요.'; retry.hidden = false; }
    };
    socket.addEventListener('close', lost); socket.addEventListener('error', lost);
  }
  function sync() {
    const office = target();
    if (office && office === R.office) { for (const person of R.people.values()) if (!person.el.isConnected) stage.append(person.el); if (R.ownerHere && !S()?.npcs?.find(npc => npc.id === 'host')?.liveOwner) liveHost(true); }
    panel.hidden = !office || !R.reached;
    if (office === R.office) return;
    R.office = office; R.stopped = false; R.retries = 0; panel.dataset.seen = ''; panel.open = false; log.replaceChildren(); count.textContent = ''; status.textContent = '';
    summary.firstChild.textContent = office && office !== U()?.session?.()?.nick ? office + '님 사무실 대화' : '내 사무실 대화';
    connect();
  }
  // Scene changes do not all emit events (visits, docking, tab switches), so a light check follows them.
  setInterval(sync, 1500);
  for (const name of ['zero-ready', 'zero-view-changed', 'zero-session-changed']) document.addEventListener(name, () => { if (name === 'zero-session-changed') R.office = null; sync(); });
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('zero-profile-updated', () => {
    const session = U()?.session?.(), key = JSON.stringify([session?.appearance || null, session?.progress?.level || null]);
    if (key === R.profileKey) return; const first = R.profileKey === null; R.profileKey = key;
    if (!first) send({type: 'profile'});
  });
  window.ZEROOfficeRoom = {sync, state: R};
})();
