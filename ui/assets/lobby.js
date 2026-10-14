/* ZERO office home screen: the team at work, your own character, scripted staff chat, a news board,
   a tutorial and (through ZEROLobby) visits to other users' offices. Rules live in lobby-logic.js. */
(() => {
  'use strict';
  const view = document.getElementById('lobby-view');
  if (!view) return;
  const L = window.ZEROLobbyLogic;
  const $ = (id) => document.getElementById(id);
  const node = (tag, className = '', text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const stage = $('lobby-stage'), boardEl = $('lobby-board'), reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const pct = (value, total) => (value / total * 100).toFixed(2) + '%';
  const store = { get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* private mode */ } } };

  const S = {active: false, mode: 'zero', npcs: [], player: null, keys: new Set(), target: null, walked: 0, speaker: [], weather: null, holidays: L.KR_HOLIDAYS,
    chatNpc: null, team: null, rafId: 0, last: 0, timers: [], visit: null, playerName: store.get('zero-lobby-name') || '나', tutorial: null};

  const shortName = (full) => String(full).split(' · ')[0].replace(/^가상\s*/, '').replace(/\s*담당$/, '');
  function rosterFrom(team) {
    const manager = team.operating_policy.manager, chiefs = Object.keys(team.roles), list = [];
    list.push({id: 'ZERO_FINAL_MANAGER', department: 'ZERO_FINAL_MANAGER', kind: 'manager', name: '총괄 합의 관리자', role: manager.name, mandate: String(manager.instruction || '').slice(0, 200), hue: 210});
    chiefs.forEach((id, index) => {
      const role = team.roles[id], hue = (index * 36 + 8) % 360;
      list.push({id, department: id, kind: 'chief', name: shortName(role.name), role: String(role.name).split(' · ')[1] || '수석 자문', mandate: String(role.mandate || ''), hue});
      (role.support_staff || []).forEach((staff) => list.push({id: staff.id, department: id, kind: 'staff', name: shortName(staff.name), role: staff.name, mandate: String(staff.mandate || staff.work_order?.instruction || role.mandate || ''), hue}));
    });
    (team.operating_policy.product_staff || []).forEach((staff) => list.push({id: staff.id, department: 'PRODUCT_QUALITY_TEAM', kind: 'product', name: shortName(staff.name), role: staff.name, mandate: String(staff.instruction || ''), hue: 280}));
    return {list, chiefs};
  }
  function placeZero(roster) {
    const staffByChief = {}, product = [];
    roster.list.forEach((npc) => { if (npc.kind === 'staff') (staffByChief[npc.department] ||= []).push(npc.id); if (npc.kind === 'product') product.push(npc.id); });
    const spots = L.layoutZero(roster.chiefs, staffByChief, product);
    roster.list.forEach((npc) => { npc.home = spots.get(npc.kind === 'manager' ? 'manager' : npc.id); npc.pos = {...npc.home}; });
  }

  function figure(kind) {
    const fig = node('span', 'npc-fig'); fig.append(node('i', 'head'), node('i', 'body'), node('i', 'legs')); return fig;
  }
  function buildNpc(npc) {
    const button = node('button', 'npc ' + npc.kind); button.type = 'button'; button.dataset.id = npc.id; button.style.setProperty('--hue', npc.hue);
    button.setAttribute('aria-label', npc.name + ' · ' + npc.role + ' · 눌러서 대화');
    button.append(node('span', 'npc-desk'), figure(npc.kind), node('span', 'npc-name', npc.name), node('span', 'npc-bubble'));
    button.addEventListener('click', (event) => { event.stopPropagation(); talkTo(npc); });
    npc.el = button; place(npc); stage.append(button);
  }
  function place(entity) {
    entity.el.style.left = pct(entity.pos.x, L.STAGE.w); entity.el.style.top = pct(entity.pos.y, L.STAGE.h);
    entity.el.style.zIndex = String(Math.round(entity.pos.y * 10));
    entity.el.classList.toggle('edge-left', entity.pos.x < 24); entity.el.classList.toggle('edge-right', entity.pos.x > 136);
  }

  function buildStage() {
    stage.replaceChildren();
    const wall = node('div', 'lobby-wall');
    const windowBox = node('div', 'lobby-window'); windowBox.id = 'lobby-weather'; windowBox.append(node('b', '', '창밖'), node('span', '', '날씨 확인 중'));
    const clock = node('div', 'lobby-clock'); clock.id = 'lobby-clock';
    wall.append(windowBox, boardEl, clock); stage.append(wall);
    stage.append(node('div', 'prop table'), node('div', 'prop coffee', '☕'), node('div', 'prop plant left', '🪴'), node('div', 'prop plant right', '🪴'));
    S.npcs.forEach(buildNpc);
    S.player = {id: 'player', pos: {x: 64, y: 96}, el: node('div', 'npc player')};
    S.player.el.append(figure('player'), node('span', 'npc-name', S.playerName), node('span', 'npc-bubble')); place(S.player); stage.append(S.player.el);
  }

  // ---- movement -------------------------------------------------------------------------------
  function frame(timestamp) {
    S.rafId = 0; if (!S.active) return;
    const dt = Math.min(0.05, (timestamp - (S.last || timestamp)) / 1000); S.last = timestamp;
    const speed = 34 * dt, direction = L.keyDirection(S.keys);
    let next = null;
    if (direction) { S.target = null; next = L.clampToFloor({x: S.player.pos.x + direction.x * speed, y: S.player.pos.y + direction.y * speed}); }
    else if (S.target) { const step = L.moveToward(S.player.pos, S.target.pos, speed); next = L.clampToFloor(step); if (step.arrived) { const done = S.target; S.target = null; done.after?.(); } }
    if (next) {
      S.walked += Math.hypot(next.x - S.player.pos.x, next.y - S.player.pos.y); S.player.pos = next; place(S.player); S.player.el.dataset.walking = 'true';
      followPlayer(); proximity(); if (S.walked > 12) advanceTutorial('move');
    } else S.player.el.dataset.walking = 'false';
    S.rafId = requestAnimationFrame(frame);
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
  function walkTo(pos, after) { S.target = {pos: L.clampToFloor(pos), after}; ensureLoop(); }
  function ensureLoop() { if (S.active && !S.rafId) { S.last = 0; S.rafId = requestAnimationFrame(frame); } }
  function talkTo(npc) {
    const stand = L.clampToFloor({x: npc.pos.x + (S.player.pos.x < npc.pos.x ? -6 : 6), y: npc.pos.y + 6});
    if (Math.hypot(S.player.pos.x - stand.x, S.player.pos.y - stand.y) < 3) openChat(npc); else walkTo(stand, () => openChat(npc));
  }

  // ---- chat -----------------------------------------------------------------------------------
  const chat = {dialog: $('lobby-chat'), log: $('lobby-chat-log'), title: $('lobby-chat-title'), role: $('lobby-chat-role'), topics: $('lobby-chat-topics'), form: $('lobby-chat-form'), input: $('lobby-chat-input')};
  function say(kind, text) { const row = node('p', 'chat-msg ' + kind, text); chat.log.append(row); chat.log.scrollTop = chat.log.scrollHeight; }
  function ask(question) {
    if (!S.chatNpc) return;
    say('me', question);
    say('npc', S.visit ? '이 사무실의 직원 구성과 맡은 일은 주인이 공개하지 않았어요. 제가 아는 건 오늘 날씨 이야기 정도예요.' : L.reply(S.chatNpc, question, {now: new Date(), weather: S.weather}));
  }
  function openChat(npc) {
    S.chatNpc = npc; chat.title.textContent = npc.name; chat.role.textContent = S.visit ? '이 사무실의 직원' : npc.role;
    chat.log.replaceChildren(); say('npc', S.visit ? '안녕하세요! 이 사무실에 오신 걸 환영해요.' : '안녕하세요, ' + npc.name + '입니다. 가상 직원이라 정해진 대본으로 답해요. 무엇이든 물어보세요.');
    chat.topics.replaceChildren(...L.TOPICS.map(([label, question]) => { const chip = node('button', 'chat-chip', label); chip.type = 'button'; chip.addEventListener('click', () => ask(question)); return chip; }));
    if (!chat.dialog.open) chat.dialog.showModal?.();
    if (npc.id === 'ZERO_FINAL_MANAGER') advanceTutorial('manager'); else if (npc.kind === 'chief') advanceTutorial('chief');
    chat.input.value = '';
  }
  chat.form.addEventListener('submit', (event) => { event.preventDefault(); const text = chat.input.value.trim(); if (text) { ask(text.slice(0, 80)); chat.input.value = ''; } });
  $('lobby-chat-close').addEventListener('click', () => chat.dialog.close());

  // ---- chatter and roaming --------------------------------------------------------------------
  function speak(entity, text, ms = 5500) {
    const bubble = entity.el.querySelector('.npc-bubble'); bubble.textContent = text; entity.el.classList.add('speaking');
    const record = {id: entity.id, pos: entity.pos}; S.speaker.push(record);
    setTimeout(() => { entity.el.classList.remove('speaking'); S.speaker = S.speaker.filter((item) => item !== record); }, ms);
  }
  function chatterTick() {
    if (!S.active || document.hidden || S.speaker.length >= 2) return;
    const npc = L.pickSpeaker(S.npcs.filter((item) => item.kind !== 'staff' || Math.random() < 0.5), S.speaker.map((item) => ({id: item.id, pos: item.pos})), 42);
    if (!npc) return;
    speak(npc, L.chatterLine({now: new Date(), weather: S.weather, holidays: S.holidays}, S.visit ? [] : L.personaFor(npc.department)));
  }
  const WAYPOINTS = [{x: 12, y: 30}, {x: 80, y: 36}, {x: 148, y: 30}];
  function roamTick() {
    if (!S.active || document.hidden || reduceMotion) return;
    const movers = S.npcs.filter((npc) => npc.kind === 'chief' && !npc.away); if (!movers.length || Math.random() > 0.6) return;
    const npc = movers[Math.floor(Math.random() * movers.length)], spot = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
    npc.away = true; npc.el.dataset.walking = 'true'; npc.pos = {x: spot.x + (Math.random() * 6 - 3), y: spot.y}; place(npc);
    setTimeout(() => { npc.el.dataset.walking = 'false'; }, 4200);
    setTimeout(() => { npc.pos = {...npc.home}; npc.el.dataset.walking = 'true'; place(npc); setTimeout(() => { npc.el.dataset.walking = 'false'; npc.away = false; }, 4200); }, 4200 + 6000 + Math.random() * 6000);
  }
  function clockTick() {
    const parts = L.kstParts(new Date()), clock = $('lobby-clock'); if (clock) clock.textContent = String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0') + ' KST';
  }

  // ---- outside world: weather, holidays, news board -------------------------------------------
  async function loadWeather() {
    try {
      const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=temperature_2m,weather_code&timezone=Asia%2FSeoul', {cache: 'no-store'});
      const current = (await response.json()).current; S.weather = {temp: current.temperature_2m, code: current.weather_code};
      const box = $('lobby-weather'); box.replaceChildren(node('b', '', {clear: '☀️', cloud: '☁️', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️'}[L.weatherKind(S.weather.code)] || '🌤️'), node('span', '', '서울 ' + Math.round(S.weather.temp) + '°'));
    } catch (_) { S.weather = null; }
  }
  async function loadHolidays() {
    try {
      const year = L.kstParts(new Date()).date.slice(0, 4), response = await fetch('https://date.nager.at/api/v3/PublicHolidays/' + year + '/KR');
      const rows = await response.json(); if (Array.isArray(rows) && rows.length > 5) S.holidays = new Set([...L.KR_HOLIDAYS, ...rows.map((row) => row.date)]);
    } catch (_) { /* the embedded reference table stays */ }
  }
  function track(id, entries) {
    const root = $(id); const lane = root.querySelector('.lobby-track'); lane.replaceChildren();
    if (!entries.length) { lane.append(node('span', 'lobby-tick muted', '표시할 항목을 불러오는 중이에요…')); root.style.setProperty('--tick-seconds', '0s'); return; }
    for (let copy = 0; copy < 2; copy++) entries.forEach((entry) => lane.append(entry(copy)));
    root.style.setProperty('--tick-seconds', Math.max(36, entries.length * 8) + 's');
  }
  const linkTick = (item) => (copy) => {
    const link = node('a', 'lobby-tick'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; if (copy) link.setAttribute('aria-hidden', 'true'), link.tabIndex = -1;
    link.append(node('b', '', item.publisher || '뉴스'), document.createTextNode(' ' + item.title)); link.addEventListener('click', () => advanceTutorial('board')); return link;
  };
  async function loadNews() {
    let items = [];
    try { const response = await fetch('api/headlines', {cache: 'no-store'}); const data = response.ok ? await response.json() : null; if (data?.schema_version === 1) items = data.items.filter((row) => /^https:\/\//.test(row.url)); } catch (_) { /* fall back below */ }
    if (!items.length) {
      try { const response = await fetch('api/desk', {cache: 'no-store'}); const desk = response.ok ? await response.json() : null;
        items = (desk?.news || []).map((row) => ({title: row.title, publisher: row.sources?.[0]?.label || '공식 자료', url: row.sources?.[0]?.url || ''})).filter((row) => /^https:\/\//.test(row.url)); } catch (_) { items = []; }
    }
    track('lobby-news', items.slice(0, 30).map(linkTick));
  }
  const money = (value) => (value > 0 ? '+' : '') + Number(value).toFixed(2) + '%';
  function returnTick(entry) {
    return (copy) => {
      const chip = entry.nick && !entry.zero ? node('button', 'lobby-tick return') : node('span', 'lobby-tick return'); if (chip.tagName === 'BUTTON') { chip.type = 'button'; chip.addEventListener('click', () => window.ZEROLobbyUsers?.visit(entry.nick)); if (copy) chip.tabIndex = -1; }
      const value = node('em', Number(entry.percent) >= 0 ? 'gain' : 'loss', money(entry.percent)); chip.append(node('b', '', (entry.rank ? entry.rank + '위 ' : '') + entry.label), document.createTextNode(' '), value); return chip;
    };
  }
  async function loadReturns() {
    const entries = [];
    try { const response = await fetch('api/portfolio', {cache: 'no-store'}); const scope = response.ok ? (await response.json()).summary?.zero_portfolio : null;
      if (scope && Number.isFinite(Number(scope.gross_return_percent))) entries.push({label: 'ZERO 참고', percent: Number(scope.gross_return_percent), zero: true}); } catch (_) { /* board shows what it has */ }
    (S.userBoard || []).forEach((row, index) => entries.push({label: row.nick, nick: row.nick, percent: row.return_percent, rank: index + 1}));
    track('lobby-returns', entries.map(returnTick));
  }

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
  $('lobby-tutorial').querySelector('.tut-next').addEventListener('click', () => {
    const state = S.tutorial; if (!state) return; if (L.TUTORIAL[state.step].id === 'done') state.done = true; else state.step++;
    store.set(TUT_KEY, JSON.stringify(state)); renderTutorial();
  });
  $('lobby-tutorial').querySelector('.tut-close').addEventListener('click', () => { S.tutorial = {...S.tutorial, done: true}; store.set(TUT_KEY, JSON.stringify(S.tutorial)); renderTutorial(); });

  // ---- scenes: ZERO and visits ----------------------------------------------------------------
  function setBanner(text, back) {
    const banner = $('lobby-banner'); banner.hidden = !text; banner.replaceChildren();
    if (!text) return; banner.append(node('span', '', text)); if (back) { const button = node('button', 'secondary-button', 'ZERO 사무실로'); button.type = 'button'; button.addEventListener('click', () => open()); banner.append(button); }
  }
  async function open() {
    S.visit = null; S.mode = 'zero'; setBanner('');
    $('lobby-title').textContent = '지금 근무 중인 팀'; $('lobby-sub').textContent = '지금 근무 중인 ZERO 팀이에요. 캐릭터를 움직여 직원에게 말을 걸어 보세요.';
    try {
      if (!S.team) { const response = await fetch('api/team', {cache: 'no-store'}); if (!response.ok) throw Error('TEAM'); S.team = await response.json(); }
      const roster = rosterFrom(S.team); placeZero(roster); S.npcs = roster.list; $('lobby-count').textContent = '직원 ' + roster.list.length + '명 근무 중';
      $('lobby-error').hidden = true; buildStage();
    } catch (_) { S.npcs = []; buildStage(); $('lobby-error').hidden = false; }
    finish();
  }
  // The visitor's own company: the names they chose, visible only to them (the server never returns this to others).
  function showOwn(info) {
    S.visit = null; S.mode = 'own'; const list = [], chiefs = [], staffByChief = {};
    (info.team?.teams || []).slice(0, 8).forEach((team, index) => {
      const id = 'own-' + index, hue = (index * 45 + 10) % 360; chiefs.push(id); staffByChief[id] = [];
      list.push({id, department: id, kind: 'chief', name: team.leader || team.name, role: '팀장 · ' + team.name, mandate: team.name + ' 팀을 이끌어요.', hue});
      team.members.forEach((member, n) => { const memberId = id + '-m' + n; staffByChief[id].push(memberId); list.push({id: memberId, department: id, kind: 'staff', name: member, role: team.name + ' 팀원', mandate: team.name + ' 팀의 일원이에요.', hue}); });
    });
    const spots = L.layoutZero(chiefs, staffByChief, []);
    list.forEach((npc) => { npc.home = spots.get(npc.id); npc.pos = {...npc.home}; });
    S.npcs = list; setBanner(list.length ? (info.team.company || info.nick + '의 회사') + ' · 직원 ' + list.length + '명 · 이 화면은 나만 볼 수 있어요' : '아직 직원이 없어요. "내 사무실" 창에서 팀을 만들어 보세요.', true);
    $('lobby-count').textContent = '직원 ' + list.length + '명'; buildStage(); finish();
  }
  // Another user's office: only the head count is public; names, teams and duties are never shown.
  function visitOffice(info) {
    S.visit = info; S.mode = 'visit'; const count = Math.max(0, Math.min(40, Number(info.staffCount) || 0));
    const spots = L.layoutGrid(count);
    S.npcs = spots.map((spot, index) => ({id: 'guest-' + index, department: 'GUEST', kind: 'staff', name: '직원', role: '비공개', mandate: '', hue: (index * 47 + 20) % 360, home: spot, pos: {...spot}}));
    S.npcs.push({id: 'host', department: 'HOST', kind: 'manager', name: info.nick, role: '사무실 주인', mandate: '', hue: 40, home: {x: 80, y: 27}, pos: {x: 80, y: 27}});
    setBanner(info.nick + '님의 사무실 · 직원 ' + count + '명 · 수익률 ' + (Number.isFinite(Number(info.returnPercent)) ? money(Number(info.returnPercent)) : '집계 전') + ' · 팀 구성은 비공개예요', true);
    $('lobby-title').textContent = info.nick + '님의 사무실'; $('lobby-sub').textContent = '직원 수와 근무 모습만 볼 수 있어요.'; $('lobby-count').textContent = '직원 ' + count + '명';
    buildStage(); finish();
  }
  function finish() {
    $('lobby-name-chip').textContent = S.playerName; renderTutorial(); proximity(); ensureLoop(); loadNews(); loadReturns(); document.dispatchEvent(new CustomEvent('zero-ready'));
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
    if (on === S.active) return; S.active = on;
    S.timers.forEach(clearInterval); S.timers = [];
    if (!on) { S.keys.clear(); if (S.rafId) cancelAnimationFrame(S.rafId); S.rafId = 0; return; }
    S.timers.push(setInterval(chatterTick, 5200), setInterval(roamTick, 9000), setInterval(clockTick, 15000), setInterval(loadNews, 300000), setInterval(loadReturns, 60000));
    clockTick(); ensureLoop(); setTimeout(chatterTick, 1200);
  }
  function setPlayerName(name) { S.playerName = name || '나'; if (name) store.set('zero-lobby-name', name); S.player?.el.querySelector('.npc-name')?.replaceChildren(document.createTextNode(S.playerName)); $('lobby-name-chip').textContent = S.playerName; }
  function setUserBoard(rows) { S.userBoard = rows; loadReturns(); }

  const initialTutorial = tutorialState();
  S.tutorial = initialTutorial || {step: 0, done: false};
  if (!initialTutorial) store.set(TUT_KEY, JSON.stringify(S.tutorial));
  loadWeather(); loadHolidays(); $('lobby-retry').addEventListener('click', open);
  window.ZEROLobby = {showOwn, open: () => { setActive(true); if (!S.npcs.length || S.mode !== 'zero') open(); }, close: () => setActive(false), setActive, visit: visitOffice, setPlayerName, setUserBoard, state: S};
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ensureLoop(); });
})();
