/* ZERO office home screen: the team at work, your own character, scripted staff chat, a news board,
   a tutorial and (through ZEROLobby) visits to other users' offices. Rules live in lobby-logic.js. */
(() => {
  'use strict';
  const view = document.getElementById('lobby-view');
  if (!view) return;
  const L = window.ZEROLobbyLogic, W = window.ZEROLobbyWorld, M = window.anime;
  const $ = (id) => document.getElementById(id);
  const node = (tag, className = '', text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const stage = $('lobby-stage'), reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const pct = (value, total) => (value / total * 100).toFixed(2) + '%';
  const store = { get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* private mode */ } } };

  const S = {active: false, mode: 'zero', npcs: [], player: null, keys: new Set(), target: null, walked: 0, speaker: [], weather: null, holidays: L.KR_HOLIDAYS,
    chatNpc: null, team: null, rafId: 0, last: 0, timers: [], visit: null, playerName: store.get('zero-lobby-name') || '나', tutorial: null,
    motions: new Set(), recent: [], world: null, viewport: null, paused: false, level: 1, schoolRank: '입문 전', boardMeta: null};

  const shortName = (full) => String(full).split(' · ')[0].replace(/^가상\s*/, '').replace(/\s*담당$/, '');
  function rosterFrom(team) {
    const manager = team.operating_policy.manager, chiefs = Object.keys(team.roles), list = [];
    list.push({id: 'ZERO_FINAL_MANAGER', department: 'ZERO_FINAL_MANAGER', kind: 'manager', name: '총괄 관리자', role: manager.name, mandate: String(manager.instruction || '').slice(0, 200), hue: 210});
    chiefs.forEach((id, index) => {
      const role = team.roles[id], hue = (index * 36 + 8) % 360;
      list.push({id, department: id, kind: 'chief', name: shortName(role.name), role: String(role.name).split(' · ')[1] || '수석 자문', mandate: String(role.mandate || ''), hue});
      (role.support_staff || []).forEach((staff) => list.push({id: staff.id, department: id, kind: 'staff', name: shortName(staff.name), role: staff.name, mandate: String(staff.mandate || staff.work_order?.instruction || role.mandate || ''), hue}));
    });
    (team.operating_policy.product_staff || []).forEach((staff) => list.push({id: staff.id, department: 'PRODUCT_QUALITY_TEAM', kind: 'product', name: shortName(staff.name), role: staff.name, mandate: String(staff.instruction || ''), hue: 280}));
    list.forEach((npc, index) => { npc.face = L.faceAt(index); });
    return {list, chiefs};
  }
  function placeZero(roster) {
    const staffByChief = {}, product = [];
    roster.list.forEach((npc) => { if (npc.kind === 'staff') (staffByChief[npc.department] ||= []).push(npc.id); if (npc.kind === 'product') product.push(npc.id); });
    const spots = L.layoutZero(roster.chiefs, staffByChief, product);
    roster.list.forEach((npc) => { npc.home = spots.get(npc.kind === 'manager' ? 'manager' : npc.id); npc.pos = {...npc.home}; });
  }

  function figure(kind, face, appearance = L.appearanceAt(0)) {
    const fig = node('span', 'npc-fig'), head = node('i', 'head'), look = face || L.faceAt(0);
    fig.dataset.outfit = appearance.outfit; fig.dataset.hair = String(appearance.hairStyle); fig.dataset.pattern = String(appearance.pattern);
    fig.style.setProperty('--shirt', appearance.color); fig.style.setProperty('--skin', appearance.skin); fig.style.setProperty('--hair', appearance.hair);
    head.dataset.eyes = String(look.eyes); head.dataset.mouth = String(look.mouth); head.append(node('b', 'eye l'), node('b', 'eye r'), node('b', 'mouth'));
    fig.append(head, node('i', 'body'), node('i', 'arm l'), node('i', 'arm r'), node('i', 'legs')); return fig;
  }
  function buildNpc(npc) {
    const button = node('button', 'npc ' + npc.kind); button.type = 'button'; button.dataset.id = npc.id; button.style.setProperty('--hue', npc.hue);
    button.setAttribute('aria-label', npc.name + ' · ' + npc.role + ' · 눌러서 대화');
    const desk = node('span', 'office-desk'); desk.style.left = pct(npc.home.x, L.STAGE.w); desk.style.top = pct(npc.home.y - 2, L.STAGE.h); desk.style.zIndex = String(Math.round((npc.home.y - 3) * 10)); stage.append(desk);
    button.dataset.activity = npc.kind === 'staff' ? 'typing' : 'reading'; button.style.setProperty('--blink-delay', (npc.face.eyes * .7) + 's');
    button.append(figure(npc.kind, npc.face, L.appearanceAt(S.npcs.indexOf(npc))), node('span', 'npc-name', npc.name), node('span', 'npc-bubble'));
    button.addEventListener('click', (event) => { event.stopPropagation(); talkTo(npc); });
    npc.el = button; place(npc); stage.append(button);
  }
  function place(entity) {
    const size = S.viewport || {w: stage.clientWidth, h: stage.clientHeight};
    entity.el.style.transform = 'translate(' + (entity.pos.x / L.STAGE.w * size.w) + 'px, ' + (entity.pos.y / L.STAGE.h * size.h) + 'px) translate(-50%, -100%)';
    entity.el.style.zIndex = String(Math.round(entity.pos.y * 10));
    entity.el.classList.toggle('edge-left', entity.pos.x < 24); entity.el.classList.toggle('edge-right', entity.pos.x > 136);
  }

  function buildStage() {
    S.motions.forEach(motion => motion.cancel()); S.motions.clear(); S.speaker = []; S.target = null;
    S.viewport = {w: stage.clientWidth, h: stage.clientHeight}; S.world = W.createWorld(S.npcs, S.space || L.DEFAULT_SPACE, {...L.FLOOR, minX: 9, maxX: 151, minY: 30});
    stage.replaceChildren();
    const wall = node('div', 'lobby-wall');
    const windowBox = node('div', 'lobby-window'); windowBox.id = 'lobby-weather'; windowBox.append(node('b', '', '창밖'), node('span', '', '날씨 확인 중'));
    const clock = node('div', 'lobby-clock'); clock.id = 'lobby-clock';
    wall.append(windowBox, node('strong', 'floor-brand', 'ZERO EXCHANGE · 모의 투자'), clock); stage.append(wall);
    stage.append(node('div', 'prop table'));
    const space = S.space || L.DEFAULT_SPACE; stage.dataset.floor = space.floor; stage.dataset.wall = space.wall;
    const EMOJI = {plant: '🪴', coffee: '☕', sofa: '🛋️', books: '📚', fish: '🐠', poster: '🖼️', clock: '🕰️'};
    space.props.forEach((name) => { if (EMOJI[name]) { const prop = node('div', 'prop ' + name, EMOJI[name]); prop.dataset.prop = name; stage.append(prop); } });
    if (space.props.includes('plant')) stage.append(node('div', 'prop plant right', '🪴'));
    S.npcs.forEach(buildNpc);
    S.player = {id: 'player', pos: {x: 64, y: 96}, el: node('div', 'npc player')};
    S.player.el.append(figure('player', {eyes: 1, mouth: 1}), node('span', 'npc-name', S.playerName), node('span', 'player-level', 'Lv.' + S.level), node('span', 'npc-bubble')); place(S.player); stage.append(S.player.el);
    $('lobby-player-level').textContent = 'Lv.' + S.level;
  }

  // ---- movement -------------------------------------------------------------------------------
  function frame(timestamp) {
    S.rafId = 0; if (!S.active || !S.player) return;
    const dt = Math.min(0.05, (timestamp - (S.last || timestamp)) / 1000); S.last = timestamp;
    const speed = 34 * dt, direction = L.keyDirection(S.keys);
    let next = null, arrived = null;
    if (direction) {
      S.target = null;
      const candidate = L.clampToFloor({x: S.player.pos.x + direction.x * speed, y: S.player.pos.y + direction.y * speed});
      if (W.canStand(S.world, candidate)) next = candidate;
      else {
        const slideX = {x: candidate.x, y: S.player.pos.y}, slideY = {x: S.player.pos.x, y: candidate.y};
        if (W.canStand(S.world, slideX)) next = slideX; else if (W.canStand(S.world, slideY)) next = slideY;
      }
    } else if (S.target) {
      const target = S.target, step = L.moveToward(S.player.pos, target.path[0], speed); next = step;
      if (step.arrived) { target.path.shift(); if (!target.path.length) { S.target = null; arrived = target.after; } }
    }
    if (next) {
      const dx = next.x - S.player.pos.x, dy = next.y - S.player.pos.y;
      S.walked += Math.hypot(dx, dy); S.player.pos = {x: next.x, y: next.y}; facing(S.player, dx, dy); place(S.player); S.player.el.dataset.walking = 'true';
      followPlayer(); proximity(); if (S.walked > 12) advanceTutorial('move');
    } else S.player.el.dataset.walking = 'false';
    if (arrived) arrived();
    if (S.target || S.keys.size) S.rafId = requestAnimationFrame(frame);
    else S.player.el.dataset.walking = 'false';
  }
  function facing(entity, dx, dy) {
    if (Math.abs(dx) + Math.abs(dy) < .01) return;
    entity.el.dataset.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }
  function followPlayer() {
    const scroller = stage.parentElement; if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 2) return;
    const want = S.player.pos.x / L.STAGE.w * scroller.scrollWidth - scroller.clientWidth / 2;
    scroller.scrollLeft += (want - scroller.scrollLeft) * 0.15;
  }
  function proximity() {
    const close = L.nearest(S.npcs, S.player.pos, 11);
    S.npcs.forEach((npc) => npc.el.classList.toggle('near', npc === close));
    $('lobby-near').textContent = close ? close.name + '와(과) 가까워요 · Enter 또는 누르기로 대화' : '';
    S.nearNpc = close;
  }
  function walkTo(pos, after) {
    const path = W.route(S.world, S.player.pos, L.clampToFloor(pos));
    if (!path.length) { if (Math.hypot(pos.x - S.player.pos.x, pos.y - S.player.pos.y) < 1) after?.(); else $('lobby-near').textContent = '가구 사이로 갈 수 있는 바닥을 눌러 주세요.'; return; }
    S.target = {path, after}; ensureLoop();
  }
  function ensureLoop() { if (S.active && S.player && !S.rafId) { S.last = 0; S.rafId = requestAnimationFrame(frame); } }
  function talkTo(npc) {
    const stand = L.clampToFloor({x: npc.pos.x + (S.player.pos.x < npc.pos.x ? -6 : 6), y: npc.pos.y + 6});
    // A nearby person's standing point may be inside a desk/table; do not require walking into furniture to talk.
    if (Math.hypot(S.player.pos.x - npc.pos.x, S.player.pos.y - npc.pos.y) < 16) openChat(npc); else walkTo(stand, () => openChat(npc));
  }

  // ---- chat -----------------------------------------------------------------------------------
  const chat = {dialog: $('lobby-chat'), log: $('lobby-chat-log'), title: $('lobby-chat-title'), role: $('lobby-chat-role'), topics: $('lobby-chat-topics'), form: $('lobby-chat-form'), input: $('lobby-chat-input')};
  function say(kind, text) { const row = node('p', 'chat-msg ' + kind, text); chat.log.append(row); chat.log.scrollTop = chat.log.scrollHeight; }
  function ask(question) {
    if (!S.chatNpc) return;
    say('me', question);
    say('bot', S.visit ? '이 사무실의 직원 구성과 맡은 일은 주인이 공개하지 않았어요. 제가 아는 건 오늘 날씨 이야기 정도예요.' : L.reply(S.chatNpc, question, {now: new Date(), weather: S.weather}));
  }
  function openChat(npc) {
    S.chatNpc = npc; chat.title.textContent = npc.name; chat.role.textContent = S.visit ? '이 사무실의 직원' : npc.role;
    chat.log.replaceChildren(); say('bot', S.visit ? '안녕하세요! 이 사무실에 오신 걸 환영해요.' : '안녕하세요, ' + npc.name + '입니다. 가상 직원이라 정해진 대본으로 답해요. 무엇이든 물어보세요.');
    chat.topics.replaceChildren(...L.TOPICS.map(([label, question]) => { const chip = node('button', 'chat-chip', label); chip.type = 'button'; chip.addEventListener('click', () => ask(question)); return chip; }));
    if (!chat.dialog.open) chat.dialog.showModal?.();
    if (npc.id === 'ZERO_FINAL_MANAGER') advanceTutorial('manager'); else if (npc.kind === 'chief') advanceTutorial('chief');
    chat.input.value = '';
  }
  chat.form.addEventListener('submit', (event) => { event.preventDefault(); const text = chat.input.value.trim(); if (text) { ask(text.slice(0, 80)); chat.input.value = ''; } });
  $('lobby-chat-close').addEventListener('click', () => chat.dialog.close());

  // ---- chatter and roaming --------------------------------------------------------------------
  function speak(entity, text, ms = 6500) {
    if (!entity.el.isConnected || !S.npcs.includes(entity)) return false;
    if (S.speaker.length >= (narrow() ? 2 : MAX_BUBBLES) || S.speaker.some((item) => item.id === entity.id)) return;
    const bubble = entity.el.querySelector('.npc-bubble'); bubble.textContent = text; entity.el.classList.add('speaking');
    const box = bubble.getBoundingClientRect();
    const overlaps = S.speaker.some((item) => {
      const other = S.npcs.find((npc) => npc.id === item.id)?.el.querySelector('.npc-bubble').getBoundingClientRect();
      return other && box.left < other.right + 14 && box.right > other.left - 14 && box.top < other.bottom + 14 && box.bottom > other.top - 14;
    });
    if (overlaps) { entity.el.classList.remove('speaking'); return; }
    const record = {id: entity.id, pos: entity.pos}; S.speaker.push(record);
    S.recent.push(text); S.recent = S.recent.slice(-12);
    entity.el.dataset.activity = 'chatting'; gesture(entity, 'talk');
    setTimeout(() => { entity.el.classList.remove('speaking'); entity.el.dataset.activity = entity.kind === 'staff' ? 'typing' : 'reading'; S.speaker = S.speaker.filter((item) => item !== record); }, ms);
    return true;
  }
  const MAX_BUBBLES = 4, BUBBLE_GAP = 26;
  // On a phone-sized stage fewer, more distant bubbles keep the small scene readable.
  const narrow = () => stage.clientWidth < 560;
  function chatterTick() {
    if (!S.active || S.paused || document.hidden || S.speaker.length >= (narrow() ? 2 : MAX_BUBBLES) || !S.npcs.length) return;
    const active = S.speaker.map((item) => ({id: item.id, pos: item.pos}));
    const npc = L.pickSpeaker(S.npcs.filter((item) => !item.away && (item.kind !== 'staff' || Math.random() < 0.7)), active, narrow() ? 44 : BUBBLE_GAP);
    if (!npc) return;
    const persona = S.visit ? [] : (npc.personaLines || L.personaFor(npc.department)), context = {now: new Date(), weather: S.weather, holidays: S.holidays, level: S.level, trends: S.trends || []};
    const text = W.chooseChatter(L, context, persona, S.recent);
    if (!speak(npc, text)) return;
    // A neighbour answers a moment later, so it reads as a small conversation, not isolated captions.
    const buddy = L.nearest(S.npcs.filter((item) => item !== npc && !item.away && !item.el.classList.contains('speaking')), npc.pos, 24);
    if (buddy && Math.random() < 0.7) setTimeout(() => { if (S.active && !S.paused && !buddy.away) speak(buddy, W.chatReply(text, S.recent)); }, 2800);
  }
  function greet() {
    const host = S.npcs.find((item) => item.kind === 'manager'); if (!host || S.visit) return;
    speak(host, '어서 오세요, ' + S.playerName + '님! ' + (S.level > 1 ? 'Lv.' + S.level + ' 학습을 이어가 볼까요?' : '입문 학교에서 첫 레벨부터 같이 배워요.'), 7000);
    gesture(host, 'wave');
  }
  function gesture(entity, kind) {
    if (reduceMotion || S.paused || !M?.animate || !entity.el.isConnected) return;
    const target = kind === 'wave' ? entity.el.querySelector('.arm.r') : entity.el.querySelector('.npc-fig');
    const values = kind === 'wave' ? {rotate: [0, -70, -30, -70, 0]} : kind === 'level' ? {y: [0, -8, 0], scale: [1, 1.12, 1]} : {rotate: [0, -3, 0, 3, 0]};
    const motion = M.animate(target, {...values, duration: kind === 'level' ? 600 : 480, ease: 'out(3)', onComplete: () => S.motions.delete(motion)});
    S.motions.add(motion);
  }
  function walkNpc(npc, destination, done, seat = false) {
    if (!M?.animate || !S.npcs.includes(npc)) return false;
    const path = W.route(S.world, npc.pos, destination); if (!path.length) return false;
    if (seat) path.push({...npc.home});
    npc.el.dataset.walking = 'true'; npc.el.dataset.activity = 'walking';
    function segment(index) {
      if (!S.npcs.includes(npc)) return;
      const point = path[index];
      if (!point) { npc.motion = null; npc.el.dataset.walking = 'false'; done(); proximity(); return; }
      const dx = point.x - npc.pos.x, dy = point.y - npc.pos.y; facing(npc, dx, dy);
      const motion = M.animate(npc.pos, {
        x: point.x, y: point.y, duration: Math.max(80, Math.hypot(dx, dy) / 18 * 1000), ease: 'linear',
        onUpdate: () => place(npc),
        onComplete: () => { S.motions.delete(motion); segment(index + 1); }
      });
      npc.motion = motion; S.motions.add(motion);
      if (!S.active || S.paused || document.hidden) motion.pause();
    }
    segment(0); return true;
  }
  const WAYPOINTS = [{x: 15, y: 32}, {x: 80, y: 40}, {x: 144, y: 30}, {x: 96, y: 62}];
  function roamTick() {
    if (!S.active || S.paused || document.hidden || reduceMotion) return;
    S.npcs.filter(npc => npc.away && !npc.motion && Date.now() >= npc.returnAt).forEach(npc => {
      if (!walkNpc(npc, npc.home, () => { npc.away = false; npc.el.dataset.activity = npc.kind === 'staff' ? 'typing' : 'reading'; }, true)) npc.returnAt = Date.now() + 3000;
    });
    if (S.npcs.filter(npc => npc.away).length >= 3) return;
    const movers = S.npcs.filter(npc => npc.kind !== 'manager' && !npc.away && !npc.el.classList.contains('speaking'));
    if (!movers.length) return;
    const npc = movers[Math.floor(Math.random() * movers.length)], spot = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
    npc.away = true;
    if (!walkNpc(npc, spot, () => { npc.el.dataset.activity = spot.x < 20 ? 'coffee' : 'reading'; npc.returnAt = Date.now() + 5000; })) npc.away = false;
  }
  function clockTick() {
    const parts = L.kstParts(new Date()), clock = $('lobby-clock'); if (clock) clock.textContent = String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0') + ' KST';
    stage.dataset.daypart = L.daypart(parts.hour); stage.dataset.weather = L.weatherKind(S.weather?.code) || 'none';
    const names = ['일', '월', '화', '수', '목', '금', '토'], date = $('lobby-hero-date'), [, month, day] = parts.date.split('-').map(Number);
    if (date) date.textContent = month + '월 ' + day + '일 ' + names[parts.weekday] + '요일 · ' + (parts.hour < 12 ? '오전 ' : '오후 ') + ((parts.hour % 12) || 12) + '시 ' + String(parts.minute).padStart(2, '0') + '분' + (S.weather ? ' · 서울 ' + Math.round(S.weather.temp) + '°' : '');
  }
  // The hero line under the title: today's small talk, rotating, so the first screen always says something new.
  function heroTick() {
    const say = $('lobby-hero-say'); if (!say) return;
    say.textContent = '“' + W.chooseChatter(L, {now: new Date(), weather: S.weather, holidays: S.holidays, trends: S.trends || [], level: S.level}, [], S.recent) + '”';
  }

  // ---- outside world: weather, holidays, news board -------------------------------------------
  async function loadWeather() {
    try {
      const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=temperature_2m,weather_code&timezone=Asia%2FSeoul', {cache: 'no-store', signal: AbortSignal.timeout(15000)});
      const current = (await response.json()).current; S.weather = {temp: current.temperature_2m, code: current.weather_code}; clockTick(); heroTick();
      const box = $('lobby-weather'); box.replaceChildren(node('b', '', {clear: '☀️', cloud: '☁️', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️'}[L.weatherKind(S.weather.code)] || '🌤️'), node('span', '', '서울 ' + Math.round(S.weather.temp) + '°'));
    } catch (_) { S.weather = null; }
  }
  async function loadHolidays() {
    try {
      const year = L.kstParts(new Date()).date.slice(0, 4), response = await fetch('https://date.nager.at/api/v3/PublicHolidays/' + year + '/KR');
      const rows = await response.json(); if (Array.isArray(rows) && rows.length > 5) S.holidays = new Set([...L.KR_HOLIDAYS, ...rows.map((row) => row.date)]);
    } catch (_) { /* the embedded reference table stays */ }
  }
  let boardDialog;
  function showBoardDetail(text) {
    if (!boardDialog) {
      boardDialog = node('dialog', 'floor-help-dialog'); boardDialog.setAttribute('aria-label', '시장 시세 상세');
      const close = node('button', 'secondary-button', '닫기'); close.type = 'button'; close.addEventListener('click', () => boardDialog.close());
      boardDialog.append(close, node('p', 'board-detail')); document.body.append(boardDialog);
    }
    boardDialog.querySelector('.board-detail').textContent = text; boardDialog.showModal();
  }
  function track(id, entries, emptyText = '표시할 항목을 불러오는 중이에요…') {
    const root = $(id); const lane = root.querySelector('.lobby-track'); lane.replaceChildren();
    if (!entries.length) { lane.append(node('span', 'lobby-tick muted', emptyText)); root.style.setProperty('--tick-seconds', '0s'); return; }
    for (let copy = 0; copy < 2; copy++) entries.forEach((entry) => lane.append(entry(copy)));
    root.style.setProperty('--tick-seconds', Math.max(36, entries.length * 8) + 's');
  }
  const linkTick = (item) => (copy) => {
    const link = node('a', 'lobby-tick'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; if (copy) link.setAttribute('aria-hidden', 'true'), link.tabIndex = -1;
    const label = item.kind === 'BREAKING' ? '[속보] ' : item.kind === 'EXCLUSIVE' ? '[단독] ' : '';
      const translated = typeof item.title_ko === 'string' && item.title_ko.trim() ? ' (' + item.title_ko + ')' : '';
      link.append(node('b', '', label + (item.publisher || '뉴스')), document.createTextNode(' ' + item.title + translated));
      link.title = translated ? '원제 · 괄호 안은 기계 번역입니다. 기사 원문을 확인하세요.' : '기사 원제 · 번역이 없으면 원문을 표시합니다.'; link.addEventListener('click', () => advanceTutorial('board')); return link;
  };
  async function loadNews() {
    let items = [];
    try { const response = await fetch('api/headlines', {cache: 'no-store', signal: AbortSignal.timeout(30000)}); const data = response.ok ? await response.json() : null; if (data?.schema_version === 1) items = data.items.filter((row) => /^https:\/\//.test(row.url)); } catch (_) { /* fall back below */ }
    if (!items.length) {
      try { const response = await fetch('api/desk', {cache: 'no-store', signal: AbortSignal.timeout(15000)}); const desk = response.ok ? await response.json() : null;
        items = (desk?.news || []).map((row) => ({title: row.title, publisher: row.sources?.[0]?.label || '공식 자료', url: row.sources?.[0]?.url || ''})).filter((row) => /^https:\/\//.test(row.url)); } catch (_) { items = []; }
    }
    track('lobby-news', items.slice(0, 30).map(linkTick), '뉴스를 확인하지 못했어요 · 다음 갱신 때 다시 확인해요');
  }
    async function loadTrends() {
      if (document.hidden || S.trendsLoading) return; S.trendsLoading = true;
      try {
        const response = await fetch('api/trends', {cache: 'no-store', signal: AbortSignal.timeout(15000)});
        const data = response.ok ? await response.json() : null;
        if (data?.schema_version !== 1 || !Array.isArray(data.items)) throw new Error('TRENDS_UNAVAILABLE');
        S.trends = data.items.filter(row => typeof row.keyword === 'string' && row.keyword.length <= 48 && !/[<>\x00-\x1f]/.test(row.keyword)).slice(0, 10);
        const fetched = new Date(data.retrieved_at), stamp = Number.isFinite(fetched.getTime()) ? fetched.toLocaleTimeString('ko-KR', {timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit'}) + ' KST' : '시각 미확인';
        track('lobby-trends', S.trends.map(row => copy => {
          const item = node('span', 'lobby-tick', row.keyword + (row.traffic ? ' · ' + row.traffic : '') + ' · ' + stamp);
          item.title = 'Google Trends 한국 검색 관심 · 원천 평균 10분 갱신 · 전체 검색 순위가 아닙니다';
          if (copy) item.setAttribute('aria-hidden', 'true'); return item;
        }), 'Google 검색 관심 키워드를 확인하지 못했어요');
      } catch (_) { S.trends = []; track('lobby-trends', [], '검색 관심 키워드 확인 불가 · 다음 갱신 때 다시 확인'); }
      finally { S.trendsLoading = false; }
    }
    async function loadMarket() {
      if (document.hidden || S.marketLoading) return; S.marketLoading = true;
      try {
        const response = await fetch('api/live-quotes', {cache: 'no-store', signal: AbortSignal.timeout(20000)});
        const data = response.ok ? await response.json() : null;
        if (!data) throw new Error('MARKET_UNAVAILABLE');
        const rows = [['S&P 500', data.benchmarks?.SP500, 'pt'], ['NASDAQ', data.markets?.NASDAQ, 'pt'], ['DOW', data.markets?.DOW, 'pt'], ['KOSPI', data.markets?.KOSPI, 'pt'], ['KOSDAQ', data.markets?.KOSDAQ, 'pt'], ['USD/KRW', data.exchange_rates?.USD_KRW || (data.fx ? {...data.fx, price: data.fx.usd_krw} : null), '원'], ['EUR/KRW', data.exchange_rates?.EUR_KRW, '원'], ['JPY/KRW · 1엔', data.exchange_rates?.JPY_KRW, '원']];
        track('lobby-market', rows.map(([name, quote, unit]) => copy => {
          const item = node('button', 'lobby-tick market-tick'); item.type = 'button'; item.append(node('b', '', name));
          if (quote && Number.isFinite(quote.price) && quote.price > 0) {
            const shown = Math.trunc(quote.price * 100) / 100;
            item.append(node('em', '', shown.toLocaleString('ko-KR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ' + unit));
            const time = new Date(quote.market_time);
            item.title = '전체 값 ' + quote.price + ' ' + unit + ' · 제공자 시각 ' + (Number.isFinite(time.getTime()) ? time.toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}) + ' KST' : '미확인') + ' · 지연 시세';
          } else { item.append(node('em', 'muted', '확인 불가')); item.title = name + ' · 제공자 가격을 확인하지 못했습니다.'; }
          item.addEventListener('click', () => showBoardDetail(name + ' · ' + item.title));
          if (copy) { item.setAttribute('aria-hidden', 'true'); item.tabIndex = -1; } return item;
        }));
      } catch (_) { track('lobby-market', [], '시장 시세를 확인하지 못했어요 · 다음 갱신 때 다시 확인'); }
      finally { S.marketLoading = false; }
    }
    const money = (value) => (value > 0 ? '+' : '') + Number(value).toFixed(2) + '%';
  function returnTick(entry) {
    return (copy) => {
      const chip = entry.nick && !entry.zero ? node('button', 'lobby-tick return') : node('span', 'lobby-tick return'); if (chip.tagName === 'BUTTON') { chip.type = 'button'; chip.addEventListener('click', () => window.ZEROLobbyUsers?.visit(entry.nick)); if (copy) chip.tabIndex = -1; }
      const value = node('em', Number(entry.percent) >= 0 ? 'gain' : 'loss', money(entry.percent)); chip.append(node('b', '', (entry.rank ? entry.rank + '위 ' : '') + entry.label), document.createTextNode(' '), value); return chip;
    };
  }
  async function loadReturns() {
    const entries = [], ranked = W.rankUsers(S.userBoard);
    try {
      const response = await fetch('api/portfolio', {cache: 'no-store', signal: AbortSignal.timeout(15000)}), scope = response.ok ? (await response.json()).summary?.zero_portfolio : null;
      if (typeof scope?.gross_return_percent === 'number' && Number.isFinite(scope.gross_return_percent)) entries.push({label: 'ZERO 참고 · 순위 제외', percent: scope.gross_return_percent, zero: true});
    } catch (_) { /* a reference without prices stays unavailable */ }
    ranked.forEach(row => entries.push({...row, label: row.nick}));
    track('lobby-returns', entries.length ? entries.map(returnTick) : [(copy) => {
      const text = S.boardMeta?.state === 'AVAILABLE' ? '첫 참가자를 기다려요 · 내 사무실에서 시작' : '연습 랭킹을 확인하는 중이에요';
      const item = node('span', 'lobby-tick muted', text); if (copy) item.setAttribute('aria-hidden', 'true'); return item;
    }]);
    paintRanking(ranked);
  }
  function paintRanking(ranked = W.rankUsers(S.userBoard)) {
    const root = $('lobby-ranking-list'); root.replaceChildren();
    $('lobby-ranking-status').textContent = S.boardMeta?.state === 'AVAILABLE'
      ? (ranked.length ? ranked.length + '명 · 수익률 내림차순 · 동률은 공동 순위' : '아직 참가자가 없어요. 내 사무실에서 닉네임으로 시작해 보세요.')
      : '가격을 확인하지 못했거나 조회 중이라 순위를 보류합니다.';
    const stamp = S.boardMeta?.checkedAt ? new Date(S.boardMeta.checkedAt) : null;
    $('lobby-ranking-time').textContent = stamp && Number.isFinite(stamp.getTime()) ? '조회: ' + stamp.toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}) + ' KST' : '조회 시각 미확인';
    ranked.forEach(row => {
      const item = node('li', 'ranking-row'), visit = node('button', 'ranking-nick', row.nick); visit.type = 'button';
      visit.addEventListener('click', () => { $('lobby-ranking-dialog').close(); window.ZEROLobbyUsers?.visit(row.nick); });
      const value = node('strong', row.percent >= 0 ? 'gain' : 'loss', money(row.percent));
      item.append(node('span', 'ranking-place', row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] + ' ' + row.rank + '위' : row.rank + '위'), visit, value);
      if (row.staffCount !== null) item.append(node('small', '', '직원 ' + row.staffCount + '명'));
      root.append(item);
    });
  }
  $('lobby-ranking-open').addEventListener('click', () => { paintRanking(); $('lobby-ranking-dialog').showModal(); });
  $('lobby-ranking-close').addEventListener('click', () => $('lobby-ranking-dialog').close());

  // ---- tutorial -------------------------------------------------------------------------------
  const TUT_KEY = 'zero-lobby-tutorial-v1';
  function tutorialState() { try { return JSON.parse(store.get(TUT_KEY)) || null; } catch (_) { return null; } }
  function renderTutorial() {
    const panel = $('lobby-tutorial'), state = S.tutorial; panel.hidden = !state || state.done;
    if (panel.hidden) return;
    const step = L.TUTORIAL[state.step]; panel.querySelector('.tut-step').textContent = step.title; panel.querySelector('.tut-text').textContent = step.text;
    panel.querySelector('.tut-progress').style.width = (state.step / (L.TUTORIAL.length - 1) * 100) + '%';
    panel.querySelector('.tut-next').textContent = step.id === 'done' ? '완료' : '건너뛰기';
  }
  function advanceTutorial(id) {
    const state = S.tutorial; if (!state || state.done || L.TUTORIAL[state.step].id !== id) return;
    state.step++; store.set(TUT_KEY, JSON.stringify(state)); renderTutorial();
  }
  function startTutorial() { S.tutorial = {step: 0, done: false}; store.set(TUT_KEY, JSON.stringify(S.tutorial)); renderTutorial(); }
  $('lobby-tutorial-btn').addEventListener('click', startTutorial);
  $('hero-talk').addEventListener('click', () => { const host = S.npcs.find((item) => item.kind === 'manager'); if (host) talkTo(host); });
  $('lobby-tutorial').querySelector('.tut-next').addEventListener('click', () => {
    const state = S.tutorial; if (!state) return; if (L.TUTORIAL[state.step].id === 'done') state.done = true; else state.step++;
    store.set(TUT_KEY, JSON.stringify(state)); renderTutorial();
  });
  $('lobby-tutorial').querySelector('.tut-close').addEventListener('click', () => { S.tutorial = {...S.tutorial, done: true}; store.set(TUT_KEY, JSON.stringify(S.tutorial)); renderTutorial(); });

  // ---- scenes: ZERO and visits ----------------------------------------------------------------
  function setBanner(text, back) {
    const banner = $('lobby-banner'); banner.hidden = !text; banner.replaceChildren();
    if (!text) return; banner.append(node('span', '', text)); if (back) { const button = node('button', 'secondary-button', '플로어로 돌아가기'); button.type = 'button'; button.addEventListener('click', () => open()); banner.append(button); }
  }
  async function open() {
    S.visit = null; S.mode = 'zero'; S.space = null; setBanner('');
    $('lobby-title').textContent = '지금 근무 중인 팀'; $('lobby-sub').textContent = '지금 근무 중인 ZERO 팀이에요. 캐릭터를 움직여 직원에게 말을 걸어 보세요.';
    try {
      if (!S.team) { const response = await fetch('api/team', {cache: 'no-store', signal: AbortSignal.timeout(15000)}); if (!response.ok) throw Error('TEAM'); S.team = await response.json(); }
      const roster = rosterFrom(S.team); placeZero(roster); S.npcs = roster.list; $('lobby-count').textContent = '직원 ' + roster.list.length + '명 근무 중';
      $('lobby-error').hidden = true; buildStage();
    } catch (_) { S.npcs = []; buildStage(); $('lobby-error').hidden = false; }
    finish();
  }
  // The visitor's own company: the names they chose, visible only to them (the server never returns this to others).
  function showOwn(info) {
    S.visit = null; S.mode = 'own'; S.space = info.space || L.DEFAULT_SPACE;
    const list = [], chiefs = [], staffByChief = {}, person = (value) => typeof value === 'string' ? {name: value, persona: '', duty: ''} : (value || {name: '', persona: '', duty: ''});
    const make = (id, department, kind, who, role, mandate, hue, index) => {
      const persona = L.PERSONAS[who.persona];
      return {id, department, kind, name: who.name || '이름 없음', role, mandate, hue, duty: who.duty || '', persona: who.persona || '', personaLines: persona?.lines, face: L.faceAt(index)};
    };
    (info.team?.teams || []).slice(0, 8).forEach((team, index) => {
      const id = 'own-' + index, hue = (index * 45 + 10) % 360, leader = person(team.leader); chiefs.push(id); staffByChief[id] = [];
      list.push(make(id, id, 'chief', {...leader, name: leader.name || team.name}, '팀장 · ' + team.name + (team.role ? ' · ' + team.role : ''), (team.role || team.name) + ' 팀을 이끌어요. ' + (leader.duty ? '맡은 일: ' + leader.duty : ''), hue, list.length));
      (team.members || []).forEach((raw, n) => { const member = person(raw), memberId = id + '-m' + n; staffByChief[id].push(memberId); list.push(make(memberId, id, 'staff', member, team.name + ' 팀원' + (member.duty ? ' · ' + member.duty : ''), team.name + ' 팀의 일원이에요. ' + (member.duty ? '맡은 일: ' + member.duty : ''), hue, list.length)); });
    });
    const spots = L.layoutTeams(chiefs, staffByChief);
    list.forEach((npc) => { npc.home = spots.get(npc.id); npc.pos = {...npc.home}; });
    S.npcs = list; setBanner(list.length ? (info.team.company || info.nick + '의 회사') + ' · 직원 ' + list.length + '명 · 이 화면은 나만 볼 수 있어요' : '아직 직원이 없어요. "내 사무실" 창에서 팀을 만들어 보세요.', true);
    $('lobby-count').textContent = '직원 ' + list.length + '명'; buildStage(); finish();
  }
  // Another user's office: only the head count is public; names, teams and duties are never shown.
  function visitOffice(info) {
    S.visit = info; S.mode = 'visit'; S.space = info.space || L.DEFAULT_SPACE; const count = Math.max(0, Math.min(40, Number(info.staffCount) || 0));
    const spots = L.layoutGrid(count);
    S.npcs = spots.map((spot, index) => ({id: 'guest-' + index, department: 'GUEST', kind: 'staff', name: '직원', role: '비공개', mandate: '', hue: (index * 47 + 20) % 360, home: spot, pos: {...spot}, face: L.faceAt(index + 3)}));
    S.npcs.push({id: 'host', department: 'HOST', kind: 'manager', name: info.nick, role: '사무실 주인', mandate: '', hue: 40, face: {eyes: 1, mouth: 1}, home: {x: 80, y: 27}, pos: {x: 80, y: 27}});
    setBanner(info.nick + '님의 사무실 · 직원 ' + count + '명 · 수익률 ' + (typeof info.returnPercent === 'number' && Number.isFinite(info.returnPercent) ? money(info.returnPercent) : '집계 전') + ' · 팀 구성은 비공개예요', true);
    $('lobby-title').textContent = info.nick + '님의 사무실'; $('lobby-sub').textContent = '직원 수와 근무 모습만 볼 수 있어요.'; $('lobby-count').textContent = '직원 ' + count + '명';
    buildStage(); finish();
  }
  function finish() {
    $('lobby-name-chip').textContent = S.playerName; renderTutorial(); proximity(); ensureLoop(); loadNews(); loadReturns(); loadMarket(); loadTrends(); document.dispatchEvent(new CustomEvent('zero-ready'));
  }

  // ---- input and lifecycle --------------------------------------------------------------------
  stage.addEventListener('click', (event) => {
    if (event.target.closest('.npc, a, button')) return;
    const box = stage.getBoundingClientRect(); walkTo({x: (event.clientX - box.left) / box.width * L.STAGE.w, y: (event.clientY - box.top) / box.height * L.STAGE.h});
  });
  window.addEventListener('keydown', (event) => {
    if (!S.active || chat.dialog.open || event.target.closest?.('input, textarea, select, dialog') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' && S.nearNpc && event.target === document.body) { event.preventDefault(); openChat(S.nearNpc); return; }
    if (L.keyDirection(new Set([event.key]))) { event.preventDefault(); S.keys.add(event.key); ensureLoop(); }
  });
  window.addEventListener('keyup', (event) => S.keys.delete(event.key));
  window.addEventListener('blur', () => S.keys.clear());
  document.querySelectorAll('[data-pad]').forEach((button) => {
    const key = {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'}[button.dataset.pad];
    const down = (event) => { event.preventDefault(); S.keys.add(key); ensureLoop(); }, up = () => S.keys.delete(key);
    button.addEventListener('pointerdown', down); ['pointerup', 'pointerleave', 'pointercancel'].forEach((name) => button.addEventListener(name, up));
  });
  function setActive(on) {
    if (on === S.active) return; S.active = on; stage.dataset.suspended = String(!on);
    S.timers.forEach(clearInterval); S.timers = [];
    S.motions.forEach(motion => { if (on && !S.paused && !document.hidden) motion.resume(); else motion.pause(); });
    if (!on) { S.keys.clear(); if (S.rafId) cancelAnimationFrame(S.rafId); S.rafId = 0; return; }
    S.timers.push(setInterval(chatterTick, 2200), setInterval(roamTick, 6000), setInterval(heroTick, 9000), setInterval(clockTick, 15000), setInterval(loadNews, 300000), setInterval(loadReturns, 60000), setInterval(loadMarket, 60000), setInterval(loadTrends, 600000), setInterval(loadWeather, 1800000));
    clockTick(); heroTick(); ensureLoop(); [900, 1800, 2700].forEach((ms) => setTimeout(chatterTick, ms)); setTimeout(greet, 400);
  }
  function setPlayerName(name) { S.playerName = name || '나'; if (name) store.set('zero-lobby-name', name); S.player?.el.querySelector('.npc-name')?.replaceChildren(document.createTextNode(S.playerName)); $('lobby-name-chip').textContent = S.playerName; }
  function setUserBoard(rows, meta = {}) { S.userBoard = rows; S.boardMeta = meta; loadReturns(); }


  const floorHelp = document.createElement('dialog');
  floorHelp.id = 'floor-help-dialog'; floorHelp.className = 'floor-help-dialog';
  floorHelp.setAttribute('aria-labelledby', 'floor-help-title');
  floorHelp.innerHTML = '<header class="chat-head"><h2 id="floor-help-title">플로어 안내 · 내 사무실</h2><button type="button" class="secondary-button" autofocus>닫기</button></header>';
  document.body.append(floorHelp);
  floorHelp.append(document.querySelector('.lobby-side'));
  floorHelp.querySelector('header button').addEventListener('click', () => floorHelp.close());
  $('floor-help').addEventListener('click', () => floorHelp.showModal());
  // Measure the shared shell rather than assuming a fixed mobile header height.
  function fitFloor() {
    const header = document.querySelector('.global-header');
    const tabs = document.querySelector('.mobile-tabbar');
    const top = header ? header.getBoundingClientRect().bottom : 0;
    const bottom = tabs && getComputedStyle(tabs).display !== 'none' ? innerHeight - tabs.getBoundingClientRect().top : 0;
    document.documentElement.style.setProperty('--floor-height', Math.max(120, innerHeight - top - bottom) + 'px');
  }
  new ResizeObserver(fitFloor).observe(document.querySelector('.global-header'));
  window.addEventListener('resize', fitFloor); fitFloor();

  const initialTutorial = tutorialState();
  S.tutorial = initialTutorial || {step: 0, done: false};
  if (!initialTutorial) store.set(TUT_KEY, JSON.stringify(S.tutorial));
  loadWeather(); loadHolidays(); $('lobby-retry').addEventListener('click', open);
  window.ZEROLobby = {showOwn, open: () => { setActive(true); if (!S.npcs.length || S.mode !== 'zero') open(); }, close: () => setActive(false), setActive, visit: visitOffice, setPlayerName, setUserBoard, state: S};
  document.addEventListener('visibilitychange', () => {
    S.motions.forEach(motion => { if (document.hidden || !S.active || S.paused) motion.pause(); else motion.resume(); });
    if (!document.hidden) ensureLoop();
  });
  new ResizeObserver(entries => {
    const size = entries[0].contentRect; if (!size.width || !size.height) return;
    S.viewport = {w: size.width, h: size.height}; S.npcs.forEach(npc => { if (npc.el) place(npc); }); if (S.player) place(S.player);
  }).observe(stage);
  $('lobby-pause').addEventListener('click', () => {
    S.paused = !S.paused; stage.dataset.paused = String(S.paused); $('lobby-pause').textContent = S.paused ? '연출 재개' : '연출 멈춤'; $('lobby-pause').setAttribute('aria-pressed', String(S.paused));
    S.motions.forEach(motion => { if (S.paused) motion.pause(); else if (S.active && !document.hidden) motion.resume(); });
    if (!S.paused) { roamTick(); chatterTick(); }
  });
  document.addEventListener('zero-academy-progress', event => {
    const detail = event.detail; if (!detail || !Number.isInteger(detail.level) || detail.level < 1 || detail.level > 7) return;
    const before = S.level; S.level = detail.level; S.schoolRank = detail.rank; $('lobby-player-level').textContent = 'Lv.' + S.level;
    if (S.player) { S.player.el.querySelector('.player-level').textContent = 'Lv.' + S.level; S.player.el.setAttribute('aria-label', S.playerName + ' · Lv.' + S.level + ' · ' + S.schoolRank); if (detail.celebrate && S.level > before) gesture(S.player, 'level'); }
  });
})();
