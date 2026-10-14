/* Accounts for the office: nickname sign-up, own company and practice portfolio, leaderboard, visits.
   Talks to the public lobby API (meta zero-lobby-api). Without it the screen stays the single-visitor office. */
(() => {
  'use strict';
  const ALLOWED = ['SPY', 'QQQ', 'TQQQ', 'TLT', 'GLD', 'VNQ', 'BIL', 'UUP'];
  const LABELS = {SPY: 'S&P 500 (SPY)', QQQ: '나스닥100 (QQQ)', TQQQ: '나스닥100 3배 (TQQQ)', TLT: '미국 장기국채 (TLT)', GLD: '금 (GLD)', VNQ: '미국 리츠 (VNQ)', BIL: '단기국채 (BIL)', UUP: '달러 (UUP)'};
  // Pure helpers, shared with Node tests.
  const NICK = /^[0-9A-Za-z_가-힣]{2,12}$/;
  const nickProblem = (nick) => !NICK.test(nick) ? '2~12자의 한글·영문·숫자·밑줄만 쓸 수 있어요.' : /^\d+$/.test(nick) ? '숫자만으로는 만들 수 없어요.' : null;
  function weightTotal(inputs) { return Object.values(inputs).reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0); }
  function weightsFrom(inputs) { const weights = Object.fromEntries(Object.entries(inputs).filter(([symbol, value]) => ALLOWED.includes(symbol) && Number.isFinite(value) && value > 0)); return Object.keys(weights).length && Math.abs(weightTotal(weights) - 100) < 1e-6 ? weights : null; }
  const PERSONAS = ['낙천적', '꼼꼼함', '장난꾸러기', '차분함', '열정적', '졸림', '호기심'];
  const SPACE = {floor: [['wood', '원목'], ['gray', '회색'], ['mint', '민트'], ['sand', '모래']], wall: [['sky', '하늘'], ['peach', '복숭아'], ['lavender', '라벤더'], ['white', '하양']],
    props: [['plant', '화분'], ['coffee', '커피머신'], ['sofa', '소파'], ['books', '책장'], ['fish', '어항'], ['poster', '포스터'], ['clock', '시계']]};
  if (typeof module !== 'undefined' && module.exports) module.exports = {nickProblem, weightTotal, weightsFrom, ALLOWED, PERSONAS, SPACE};
  if (typeof document === 'undefined' || !document.getElementById('lobby-view')) return;

  const meta = document.querySelector('meta[name="zero-lobby-api"]'), BASE = (meta?.content || '').replace(/\/+$/, '');
  const $ = (id) => document.getElementById(id);
  const node = (tag, className = '', text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const KEY = 'zero-lobby-token';
  const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } }, del(k) { try { localStorage.removeItem(k); } catch (_) { /* private mode */ } } };
  const messages = {NICK_TAKEN: '이미 쓰는 닉네임이에요.', NICK_INVALID: '2~12자의 한글·영문·숫자·밑줄만 쓸 수 있어요.', NICK_RESERVED: '쓸 수 없는 닉네임이에요.', SIGNUP_LIMIT: '오늘은 가입이 많아요. 내일 다시 시도해 주세요.', QUOTES_UNAVAILABLE: '가격을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    REBALANCE_TOO_SOON: '배분은 20시간에 한 번만 바꿀 수 있어요.', WEIGHTS_MUST_SUM_TO_100: '비중의 합이 100이 되어야 해요.', WEIGHTS_INVALID: '비중을 확인해 주세요.', TEAM_INVALID: '팀 구성을 확인해 주세요(직원 60명까지).', UNAUTHORIZED: '저장된 로그인 정보가 맞지 않아요.'};
  async function api(path, {method = 'GET', body, token} = {}) {
    // A template literal on purpose: the Streamlit build rewrites quote-led slash-api paths into relative ones, which would break this absolute address.
    const response = await fetch(`${BASE}/api/lobby${path}`, {method, headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: 'Bearer ' + token} : {})}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'LOBBY_ERROR'), {code: data.error || 'LOBBY_ERROR'});
    return data;
  }
  const say = (error) => messages[error?.code] || '지금은 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';

  const U = {token: store.get(KEY), me: null, generation: 0};
  const button = $('lobby-profile-btn');
  if (!BASE) { button.hidden = false; button.textContent = '닉네임 가입(준비 중)'; button.disabled = true; button.title = '공개 서버 연결 전이에요'; return; }
  button.hidden = false;

  // ---- dialog -----------------------------------------------------------------------------------
  const dialog = document.createElement('dialog'); dialog.className = 'lobby-chat lobby-profile'; dialog.setAttribute('aria-labelledby', 'profile-title');
  dialog.innerHTML = '<div class="chat-head"><div><h2 id="profile-title"></h2><p id="profile-sub"></p></div><button type="button" class="secondary-button" id="profile-close">닫기</button></div><div id="profile-body" class="profile-body"></div>';
  $('lobby-view').append(dialog);
  $('profile-close').addEventListener('click', () => dialog.close());
  const body = $('profile-body');
  const field = (label, input) => { const wrap = node('label', 'profile-field'); wrap.append(node('span', '', label), input); return wrap; };
  const input = (type, attrs = {}) => Object.assign(node('input'), {type, ...attrs});
  const status = () => { const p = node('p', 'profile-status'); p.setAttribute('role', 'status'); return p; };

  function viewSignup() {
    $('profile-title').textContent = '닉네임으로 시작하기'; $('profile-sub').textContent = '닉네임은 다른 사람과 겹치면 안 돼요. 가입하면 연습용 1억원이 생겨요(가상).';
    const nick = input('text', {maxLength: 12, placeholder: '예: 아침팀장', autocomplete: 'off'}), note = status(), go = node('button', 'primary-button', '이 닉네임으로 시작'); go.type = 'button'; go.disabled = true;
    let timer = 0;
    nick.addEventListener('input', () => {
      clearTimeout(timer); go.disabled = true; const value = nick.value.trim(), problem = nickProblem(value);
      if (problem) { note.textContent = value ? problem : ''; return; }
      note.textContent = '확인 중…';
      timer = setTimeout(async () => { try { const result = await api('/nick?nick=' + encodeURIComponent(value)); if (nick.value.trim() !== value) return; note.textContent = result.available ? '사용할 수 있어요.' : (messages[result.reason] || '이미 쓰는 닉네임이에요.'); go.disabled = !result.available; } catch (error) { note.textContent = say(error); } }, 350);
    });
    go.addEventListener('click', async () => {
      go.disabled = true; note.textContent = '가입 중…';
      try { const result = await api('/register', {method: 'POST', body: {nick: nick.value.trim()}}); U.token = result.token; store.set(KEY, result.token); viewToken(result.token); await refreshMe(); }
      catch (error) { note.textContent = say(error); go.disabled = false; }
    });
    const social = node('div', 'profile-social'); social.append(node('p', 'muted-note', '네이버·카카오·구글 연동 로그인은 각 서비스에 앱 등록이 끝나면 여기에 열려요.'));
    ['네이버로 시작', '카카오로 시작', '구글로 시작'].forEach((label) => { const b = node('button', 'secondary-button', label); b.type = 'button'; b.disabled = true; social.append(b); });
    const have = node('button', 'secondary-button', '이미 가입했어요(복구 코드 입력)'); have.type = 'button'; have.addEventListener('click', viewRecover);
    body.replaceChildren(field('닉네임', nick), node('p', 'muted-note', '닉네임·직원 수·방 꾸밈·연습 수익률은 다른 이용자에게 공개돼요. 팀 이름은 공개를 선택한 경우에만 표시돼요. 직원 이름·업무·배분은 비공개예요. 실명·연락처·계좌번호·비밀번호를 입력하지 마세요. 이 기기에 로그인 코드와 학습 진도가 저장돼요.'), note, go, social, have);
  }
  function viewToken(token) {
    $('profile-title').textContent = '복구 코드 보관'; $('profile-sub').textContent = '새 코드는 지금 한 번만 보여 드려요. 이전 코드가 있었다면 더 이상 사용할 수 없어요.';
    const code = node('code', 'profile-code', token), copy = node('button', 'secondary-button', '복사'), done = node('button', 'primary-button', '사무실로 가기'); copy.type = done.type = 'button';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(token); copy.textContent = '복사됨'; } catch (_) { copy.textContent = '길게 눌러 직접 복사하세요'; } });
    done.addEventListener('click', () => viewHome());
    body.replaceChildren(code, copy, node('p', 'muted-note', '다른 기기에서 같은 캐릭터로 들어오거나 브라우저를 지웠을 때 이 코드가 필요해요. 코드를 아는 사람은 누구나 내 계정을 쓸 수 있으니 공개하지 마세요.'), done);
  }
  function viewRecover() {
    $('profile-title').textContent = '복구 코드로 들어가기'; $('profile-sub').textContent = '가입할 때 받은 코드를 붙여 넣어 주세요.';
    const code = input('password', {autocomplete: 'off', placeholder: '복구 코드'}), note = status(), go = node('button', 'primary-button', '들어가기'); go.type = 'button';
    go.addEventListener('click', async () => { note.textContent = '확인 중…'; try { const token = code.value.trim(); await api('/me', {token}); U.token = token; store.set(KEY, token); await refreshMe(); viewHome(); } catch (error) { note.textContent = say(error); } });
    const back = node('button', 'secondary-button', '돌아가기'); back.type = 'button'; back.addEventListener('click', viewSignup);
    body.replaceChildren(field('복구 코드', code), note, go, back);
  }

  function viewHome() {
    if (!U.me) return viewSignup();
    $('profile-title').textContent = U.me.nick + '의 사무실'; $('profile-sub').textContent = '직원 ' + U.me.staff_count + '명 · 연습 수익률 ' + (U.me.portfolio.return_percent === null ? '집계 전' : (U.me.portfolio.return_percent > 0 ? '+' : '') + U.me.portfolio.return_percent.toFixed(2) + '%');
    const team = node('button', 'primary-button', '팀·직원 구성하기'), portfolio = node('button', 'secondary-button', '연습 포트폴리오 배분'), see = node('button', 'secondary-button', '내 사무실 보기'), out = node('button', 'secondary-button', '로그아웃(이 기기에서)');
    [team, portfolio, see, out].forEach((b) => { b.type = 'button'; });
    team.addEventListener('click', viewTeam); portfolio.addEventListener('click', viewPortfolio); see.addEventListener('click', () => { dialog.close(); window.ZEROLobby.showOwn({nick: U.me.nick, team: U.me.team, space: U.me.space}); });
    out.addEventListener('click', () => { store.del(KEY); store.del('zero-lobby-name'); U.token = null; U.me = null; window.ZEROLobby.setPlayerName('대표님'); body.replaceChildren(); dialog.close(); window.ZEROLobby.open(); render(); });
    const wardrobe = node('button', 'secondary-button', '내 캐릭터 · 성장과 꾸미기'); wardrobe.type = 'button'; wardrobe.addEventListener('click', () => { dialog.close(); window.ZEROSocial?.openWardrobe(); });
    const renew = node('button', 'secondary-button', '복구 코드 교체 · 다른 기기 로그아웃'); renew.type = 'button';
    renew.addEventListener('click', async () => {
      if (!window.confirm('이전 복구 코드는 사용할 수 없게 됩니다. 새 코드를 안전하게 보관할 수 있나요?')) return;
      renew.disabled = true; const note = status(), requestToken = U.token, requestGeneration = U.generation; body.append(note);
      try { const result = await api('/me/token', {method: 'POST', token: requestToken}); if (U.token !== requestToken || U.generation !== requestGeneration) return; U.token = result.token; store.set(KEY, result.token); render(); viewToken(result.token); }
      catch (error) { note.textContent = say(error); renew.disabled = false; }
    });
    body.replaceChildren(node('p', 'muted-note', '직원 이름과 업무, 배분은 대표님만 조회해요. 팀 이름은 공개를 선택하면 방문자에게 표시됩니다. 닉네임·직원 수·방 꾸밈·캐릭터 꾸밈·연습 수익률은 공개해요. 복구 코드를 아는 사람은 내 정보를 볼 수 있어요. 로그아웃은 이 기기의 저장 정보만 지우며, 코드 교체는 이전 코드를 폐기해요.'), team, portfolio, see, wardrobe, renew, out);
  }

  const select = (options, value, blank) => {
    const box = node('select'); if (blank) { const none = node('option', '', blank); none.value = ''; box.append(none); }
    options.forEach((option) => { const [id, label] = Array.isArray(option) ? option : [option, option]; const item = node('option', '', label); item.value = id; box.append(item); });
    box.value = value || ''; return box;
  };
  const asPerson = (value) => typeof value === 'string' ? {name: value, persona: '', duty: ''} : {name: value?.name || '', persona: value?.persona || '', duty: value?.duty || ''};

  function viewTeam() {
    $('profile-title').textContent = '내 회사 만들기'; $('profile-sub').textContent = '팀을 만들고 팀장·팀원의 이름, 성격, 맡은 일을 정하세요. 최대 8팀·직원 60명까지예요. 직원 이름·역할은 대표님만 볼 수 있고, 팀 이름 공개는 아래에서 선택해요.';
    const model = JSON.parse(JSON.stringify(U.me.team || {company: '', teams: []})), space = {floor: U.me.space?.floor || 'wood', wall: U.me.space?.wall || 'sky', props: [...(U.me.space?.props || ['plant', 'coffee'])]};
    model.teams = (model.teams || []).map((team) => ({name: team.name || '', role: team.role || '', leader: asPerson(team.leader), members: (team.members || []).map(asPerson)}));
    const company = input('text', {maxLength: 20, value: model.company || '', placeholder: '회사 이름'}), list = node('div', 'profile-teams'), note = status();
    const publish = input('checkbox'); publish.checked = model.publish_team_names === true; model.publish_team_names = publish.checked; publish.addEventListener('change', () => { model.publish_team_names = publish.checked; });
    const publication = node('label', 'social-check'); publication.append(publish, document.createTextNode('팀 이름 공개 · 직원 이름과 역할은 비공개'));
    // office room: floor, wall and furniture are public (visitors see the room), the people are not
    const floor = select(SPACE.floor, space.floor), wall = select(SPACE.wall, space.wall); floor.addEventListener('change', () => { space.floor = floor.value; }); wall.addEventListener('change', () => { space.wall = wall.value; });
    const props = node('div', 'profile-chips');
    SPACE.props.forEach(([id, label]) => { const box = input('checkbox'); box.checked = space.props.includes(id); box.addEventListener('change', () => { space.props = box.checked ? [...new Set([...space.props, id])] : space.props.filter((name) => name !== id); }); const chip = node('label'); chip.append(box, document.createTextNode(label)); props.append(chip); });
    const room = node('fieldset', 'profile-team'); room.append(node('legend', '', '사무실 꾸미기(방문자에게도 보여요)'), field('바닥', floor), field('벽', wall), node('span', 'muted-note', '가구'), props);
    const personRow = (person, onChange, onRemove, placeholder) => {
      const row = node('div', 'member-row'), name = input('text', {maxLength: 12, value: person.name, placeholder}), persona = select(PERSONAS, person.persona, '성격'), duty = input('text', {maxLength: 24, value: person.duty, placeholder: '맡은 일'});
      name.addEventListener('input', () => { person.name = name.value; onChange(); }); persona.addEventListener('change', () => { person.persona = persona.value; onChange(); }); duty.addEventListener('input', () => { person.duty = duty.value; onChange(); });
      row.append(name, persona, duty); if (onRemove) { const drop = node('button', 'secondary-button', '삭제'); drop.type = 'button'; drop.addEventListener('click', onRemove); row.append(drop); } return row;
    };
    const redraw = () => {
      list.replaceChildren(...model.teams.map((team, index) => {
        const box = node('fieldset', 'profile-team'), name = input('text', {maxLength: 12, value: team.name, placeholder: '팀 이름'}), role = input('text', {maxLength: 24, value: team.role, placeholder: '팀이 하는 일(예: 기업 분석)'});
        name.addEventListener('input', () => { team.name = name.value; }); role.addEventListener('input', () => { team.role = role.value; });
        box.append(node('legend', '', (index + 1) + '번째 팀'), field('팀 이름', name), field('팀의 역할', role), node('span', 'muted-note', '팀장'), personRow(team.leader, () => {}, null, '팀장 이름'), node('span', 'muted-note', '팀원'));
        team.members.forEach((member, n) => box.append(personRow(member, () => {}, () => { team.members.splice(n, 1); redraw(); }, '팀원 이름')));
        const addMember = node('button', 'secondary-button', '팀원 추가'), drop = node('button', 'secondary-button', '이 팀 지우기'); addMember.type = drop.type = 'button';
        addMember.addEventListener('click', () => { if (team.members.length < 10) { team.members.push({name: '', persona: '', duty: ''}); redraw(); } });
        drop.addEventListener('click', () => { model.teams.splice(index, 1); redraw(); }); box.append(addMember, drop); return box;
      }));
    };
    redraw();
    const add = node('button', 'secondary-button', '팀 추가'), save = node('button', 'primary-button', '저장'), back = node('button', 'secondary-button', '돌아가기'); [add, save, back].forEach((b) => { b.type = 'button'; });
    add.addEventListener('click', () => { if (model.teams.length < 8) { model.teams.push({name: '', role: '', leader: {name: '', persona: '', duty: ''}, members: []}); redraw(); } });
    save.addEventListener('click', async () => {
      note.textContent = '저장 중…';
      try { await api('/me/team', {method: 'PUT', token: U.token, body: {company: company.value, space, teams: model.teams}}); await refreshMe(); note.textContent = '저장했어요.'; viewHome(); } catch (error) { note.textContent = say(error); }
    });
    back.addEventListener('click', viewHome);
    body.replaceChildren(field('회사 이름', company), publication, room, list, add, note, save, back);
  }

  function viewPortfolio() {
    $('profile-title').textContent = '연습 포트폴리오'; $('profile-sub').textContent = '가상의 1억원을 ETF 8종에 나눠 담아요. 가격만 반영한 연습이고 실제 투자가 아니에요.';
    const values = Object.fromEntries(ALLOWED.map((symbol) => [symbol, Number(U.me.portfolio.weights[symbol] || 0)])), total = node('p', 'profile-status'), note = status();
    const rows = ALLOWED.map((symbol) => { const box = input('number', {min: 0, max: 100, step: 5, value: values[symbol]}); box.addEventListener('input', () => { values[symbol] = Number(box.value) || 0; total.textContent = '합계 ' + weightTotal(values) + '% (100이 되어야 해요)'; }); return field(LABELS[symbol] + ' %', box); });
    total.textContent = '합계 ' + weightTotal(values) + '%';
    const save = node('button', 'primary-button', '배분 바꾸기'), back = node('button', 'secondary-button', '돌아가기'); save.type = back.type = 'button';
    save.addEventListener('click', async () => {
      const weights = weightsFrom(values); if (!weights) { note.textContent = messages.WEIGHTS_MUST_SUM_TO_100; return; }
      note.textContent = '저장 중…';
      try { await api('/me/portfolio', {method: 'PUT', token: U.token, body: {weights}}); await refreshMe(); viewHome(); } catch (error) { note.textContent = say(error); }
    });
    back.addEventListener('click', viewHome);
    body.replaceChildren(...rows, total, node('p', 'muted-note', '바꾸면 지금까지의 수익은 그대로 두고 앞으로의 움직임만 새 배분을 따라가요. 20시간에 한 번만 바꿀 수 있어요.'), note, save, back);
  }

  // ---- state ------------------------------------------------------------------------------------
  async function refreshMe() {
    if (!U.token) { U.me = null; return render(); }
    const token = U.token;
    try { const result = await api('/me', {token}); if (U.token !== token) return; U.me = result; window.ZEROLobby.setPlayerName(U.me.nick); }
    catch (error) { if (U.token !== token) return; if (error.code === 'UNAUTHORIZED') { store.del(KEY); U.token = null; } U.me = null; }
    render();
  }
  let sessionNick, sessionToken;
  function render() { button.textContent = U.me ? '내 사무실' : '닉네임으로 시작'; $('lobby-name-chip').textContent = U.me?.nick || '대표님';
    const nick = U.me?.nick || null; if (sessionNick !== nick || sessionToken !== U.token) { sessionNick = nick; sessionToken = U.token; U.generation++; document.dispatchEvent(new CustomEvent('zero-session-changed')); }
    document.dispatchEvent(new CustomEvent('zero-profile-updated')); }
  button.addEventListener('click', () => { U.me ? viewHome() : viewSignup(); if (!dialog.open) dialog.showModal?.(); });

  async function loadBoard() {
    try { const data = await api('/leaderboard'); window.ZEROLobby.setUserBoard(data.state === 'AVAILABLE' ? data.items : [], {state: data.state, checkedAt: data.checked_at}); } catch (_) { window.ZEROLobby.setUserBoard([], {state: 'UNAVAILABLE'}); }
  }
  async function visit(nick) {
    try { const data = await api('/office?nick=' + encodeURIComponent(nick)); window.ZEROLobby.visit({nick: data.nick, staffCount: data.staff_count, returnPercent: data.return_percent, space: data.space, teams: data.teams, appearance: data.appearance, level: data.level}); }
    catch (_) { /* a missing office leaves the current scene */ }
  }
  window.ZEROLobbyUsers = {visit, refresh: refreshMe, board: loadBoard,
    session: () => U.me ? {nick: U.me.nick, progress: U.me.progress, appearance: U.me.appearance, catalog: U.me.catalog, blocks: U.me.blocks, practiceReturn: U.me.portfolio?.return_percent} : null,
    request: (path, options = {}) => api(path, {...options, token: U.token}),
    openProfile: () => button.click(),
    openLoungeSocket: () => {
      if (!U.me || !U.token) throw {code: 'UNAUTHORIZED'};
      const token = U.token, socket = new WebSocket(`${BASE.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}/api/lobby/lounge/socket`);
      socket.addEventListener('open', () => { if (U.token !== token) socket.close(); else socket.send(JSON.stringify({type: 'auth', token})); }); return socket;
    }};
  render(); refreshMe(); if(document.documentElement?.dataset.zeroView==='lobby')loadBoard(); setInterval(() => { if (!document.hidden) { if(document.documentElement?.dataset.zeroView==='lobby')loadBoard(); if (U.me) refreshMe(); } }, 60000);
})();
