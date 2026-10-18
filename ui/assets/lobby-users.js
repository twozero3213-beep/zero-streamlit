/* Accounts for the office: verified membership, guest access, own company and practice portfolio, leaderboard, visits.
   Talks to the public lobby API (meta zero-lobby-api). Without it the screen stays the single-visitor office. */
(() => {
  'use strict';
  const ALLOWED = ['SPY', 'QQQ', 'TQQQ', 'TLT', 'GLD', 'VNQ', 'BIL', 'UUP'];
  const LABELS = {SPY: 'S&P 500 (SPY)', QQQ: '나스닥100 (QQQ)', TQQQ: '나스닥100 3배 (TQQQ)', TLT: '미국 장기국채 (TLT)', GLD: '금 (GLD)', VNQ: '미국 리츠 (VNQ)', BIL: '단기국채 (BIL)', UUP: '달러 (UUP)'};
  // Pure helpers, shared with Node tests.
  const NICK = /^[0-9A-Za-z_가-힣]{2,12}$/;
  const nickProblem = (nick) => !NICK.test(nick) ? '2~12자의 한글·영문·숫자·밑줄만 쓸 수 있어요.' : /^\d+$/.test(nick) ? '숫자만으로는 만들 수 없어요.' : null;
  const MEMBER_KEY = 'zero-member-session', REMEMBER_KEY = 'zero-member-remembered', MEMBER_MAX_MS = 30 * 86400000;
  function createMemberSessionStore(local, tab, clock = Date.now) {
    const valid = token => typeof token === 'string' && /^[A-Za-z0-9_-]{40,60}$/.test(token);
    const read = (storage, key) => { try { return storage().getItem(key); } catch (_) { return null; } };
    const remove = (storage, key) => { try { storage().removeItem(key); } catch (_) { /* storage may be disabled */ } };
    function savedSession(storage, key, legacy = false) {
      const raw = read(storage, key); if (!raw) return null;
      if (legacy && valid(raw)) return {token: raw};
      try {
        const saved = JSON.parse(raw), remaining = Date.parse(saved.expires_at) - clock();
        if (valid(saved.token) && remaining > 0 && remaining <= MEMBER_MAX_MS && (!legacy || typeof saved.remember === 'boolean')) return saved;
      } catch (_) { /* malformed local state is discarded */ }
      remove(storage, key); return null;
    }
    return {
      get() { return savedSession(tab, MEMBER_KEY, true)?.token || savedSession(local, REMEMBER_KEY)?.token || null; },
      preference(token) { const saved = savedSession(tab, MEMBER_KEY, true); return saved?.token === token ? saved.remember : savedSession(local, REMEMBER_KEY)?.token === token ? true : undefined; },
      persisted() { return savedSession(local, REMEMBER_KEY)?.token || null; },
      set(result, remember) {
        const remaining = Date.parse(result.expires_at) - clock();
        if (!valid(result.token) || !(remaining > 0 && remaining <= MEMBER_MAX_MS)) throw {code: 'UNAUTHORIZED'};
        remove(tab, MEMBER_KEY); remove(local, REMEMBER_KEY);
        // First-party opaque ZERO bearer only. XSS can read it; never persist provider credentials.
        if (remember) { try { local().setItem(REMEMBER_KEY, JSON.stringify({token: result.token, expires_at: result.expires_at})); return; } catch (_) { /* fall back to this tab */ } }
        try { tab().setItem(MEMBER_KEY, JSON.stringify({token: result.token, expires_at: result.expires_at, remember: !!remember})); } catch (_) { /* session remains in memory */ }
      },
      clear(token) {
        if (token === undefined || savedSession(tab, MEMBER_KEY, true)?.token === token) remove(tab, MEMBER_KEY);
        if (token === undefined || savedSession(local, REMEMBER_KEY)?.token === token) remove(local, REMEMBER_KEY);
      }
    };
  }
  function weightTotal(inputs) { return Object.values(inputs).reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0); }
  function weightsFrom(inputs) { const weights = Object.fromEntries(Object.entries(inputs).filter(([symbol, value]) => ALLOWED.includes(symbol) && Number.isFinite(value) && value > 0)); return Object.keys(weights).length && Math.abs(weightTotal(weights) - 100) < 1e-6 ? weights : null; }
  const PERSONAS = ['낙천적', '꼼꼼함', '장난꾸러기', '차분함', '열정적', '졸림', '호기심'];
  const SPACE = {floor: [['wood', '원목'], ['gray', '회색'], ['mint', '민트'], ['sand', '모래']], wall: [['sky', '하늘'], ['peach', '복숭아'], ['lavender', '라벤더'], ['white', '하양']],
    props: [['plant', '화분'], ['coffee', '커피머신'], ['sofa', '소파'], ['books', '책장'], ['fish', '어항'], ['poster', '포스터'], ['clock', '시계']]};
  // Device-only preferences (school progress, watchlist) are kept per signed-in nickname so switching IDs never mixes them.
  // The first account to sign in on this device adopts the older unscoped copy once.
  function accountKey(store, base, nick) {
    if (!nick) return base;
    const key = base + ':' + nick, legacy = store.get(base);
    if (store.get(key) === null && legacy !== null && store.get(base + ':adopted') === null) { store.set(key, legacy); store.set(base + ':adopted', nick); }
    return key;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {nickProblem, weightTotal, weightsFrom, ALLOWED, PERSONAS, SPACE, createMemberSessionStore, accountKey};
  if (typeof document === 'undefined' || !document.getElementById('lobby-view')) return;

  const meta = document.querySelector('meta[name="zero-lobby-api"]'), BASE = (meta?.content || '').replace(/\/+$/, '');
  const $ = (id) => document.getElementById(id);
  const node = (tag, className = '', text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const KEY = 'zero-lobby-token', VISITOR_KEY = 'zero-visitor-nick';
  const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } }, del(k) { try { localStorage.removeItem(k); } catch (_) { /* private mode */ } } };
  const memberSession = createMemberSessionStore(() => localStorage, () => sessionStorage);
  const savedVisitor = store.get(VISITOR_KEY);
  const visitorName = savedVisitor && !nickProblem(savedVisitor) ? savedVisitor : null;
  const messages = {NICK_TAKEN: '이미 쓰는 닉네임이에요.', NICK_INVALID: '2~12자의 한글·영문·숫자·밑줄만 쓸 수 있어요.', NICK_RESERVED: '쓸 수 없는 닉네임이에요.', SIGNUP_LIMIT: '오늘은 가입이 많아요. 내일 다시 시도해 주세요.', QUOTES_UNAVAILABLE: '가격을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    PAPER_TRADING_ACTIVE: '모의투자 직접 매매 화면에서 보유 종목을 바꿔 주세요.', REBALANCE_TOO_SOON: '배분은 20시간에 한 번만 바꿀 수 있어요.', WEIGHTS_MUST_SUM_TO_100: '비중의 합이 100이 되어야 해요.', WEIGHTS_INVALID: '비중을 확인해 주세요.', TEAM_INVALID: '팀 구성을 확인해 주세요(직원 60명까지).', UNAUTHORIZED: '저장된 로그인 정보가 맞지 않아요.'};
  async function api(path, {method = 'GET', body, token} = {}) {
    // A template literal on purpose: the Streamlit build rewrites quote-led slash-api paths into relative ones, which would break this absolute address.
    const response = await fetch(`${BASE}/api/lobby${path}`, {method, headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: 'Bearer ' + token} : {})}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'LOBBY_ERROR'), {code: data.error || 'LOBBY_ERROR',status:response.status,terminal:data.terminal===true});
    return data;
  }
  const say = (error) => messages[error?.code] || '지금은 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';

  const savedMember = memberSession.get();
  const U = {token: savedMember || store.get(KEY), member: !!savedMember, remember: savedMember ? memberSession.preference(savedMember) : undefined, me: null, visitor: visitorName, generation: 0};
  const button = $('lobby-profile-btn'), entry = $('member-entry');
  if (!BASE) { button.hidden = false; button.textContent = '로그인 연결 준비 중'; button.disabled = true; button.title = '공개 서버 연결 전이에요'; return; }
  button.hidden = false; if (entry) entry.hidden = false;

  // ---- dialog -----------------------------------------------------------------------------------
  const dialog = document.createElement('dialog'); dialog.id = 'member-profile-dialog'; dialog.className = 'lobby-chat lobby-profile'; dialog.setAttribute('aria-labelledby', 'profile-title'); dialog.setAttribute('aria-describedby', 'profile-sub');
  dialog.innerHTML = '<div class="chat-head"><div><h2 id="profile-title"></h2><p id="profile-sub"></p></div><button type="button" class="icon-button icon-close" id="profile-close" aria-label="창 닫기" title="닫기">닫기</button></div><div id="profile-body" class="profile-body"></div>';
  document.body.append(dialog);
  $('profile-close').addEventListener('click', () => dialog.close());
  const body = $('profile-body');
  const field = (label, input) => { const wrap = node('label', 'profile-field'); wrap.append(node('span', '', label), input); return wrap; };
  const input = (type, attrs = {}) => Object.assign(node('input'), {type, ...attrs});
  const status = () => { const p = node('p', 'profile-status'); p.setAttribute('role', 'status'); return p; };

  let onboarding = null, profileEpoch = 0;
  dialog.addEventListener('close', () => { profileEpoch++; onboarding?.destroy(); onboarding = null; });
  function viewSignup() {
    profileEpoch++; const signupToken = U.token, signupGeneration = U.generation;
    onboarding?.destroy();
    onboarding = window.ZEROOnboarding.mount(body, {
      title: $('profile-title'), subtitle: $('profile-sub'), active: () => dialog.open && U.token === signupToken && U.generation === signupGeneration,
      loadConfig: () => api('/auth/config'), nickProblem, guestName: U.visitor || '', memberNick: U.me?.nick || '',
      onGuest(nick) {
        if (!U.me) { U.visitor = nick; store.set(VISITOR_KEY, nick); window.ZEROLobby.setPlayerName(nick); }
        render(); dialog.close();
      },
      complete: (method, accessToken, nick, remember) => {
        const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
        const effectiveRemember = (method === 'email' && isMobile) ? true : remember;
        return api('/auth/complete', {method: 'POST', token: U.token,
          body: {method, access_token: accessToken, remember: effectiveRemember, ...(nick === undefined ? {} : {nick})}});
      },
      async onMember(result, remember) {
        if (typeof result.token !== 'string' || !result.token) throw {code: 'UNAUTHORIZED'};
        const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
        const effectiveRemember = (result.membership?.method === 'email' && isMobile) ? true : !!remember;
        memberSession.set(result, effectiveRemember); U.token = result.token; U.member = true; U.remember = effectiveRemember; U.visitor = null; U.me = null;
        store.del(KEY); store.del(VISITOR_KEY); render();
        const memberToken = U.token, memberView = profileEpoch; await refreshMe(); if (profileEpoch !== memberView || !dialog.open) return; if (U.token === memberToken) { if (U.me) viewHome(); else viewPending(); } else if (!U.token) viewSignup();
      },
      onRecover: viewRecover
    });
  }
  function viewPending() {
    onboarding?.destroy(); onboarding = null; const view = ++profileEpoch;
    $('profile-title').textContent = '로그인 정보 확인'; $('profile-sub').textContent = '사무실 정보를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
    const retry = node('button', 'primary-button', '사무실 다시 불러오기'), note = status(); retry.type = 'button';
    retry.addEventListener('click', async () => {
      if (retry.disabled) return; const token = U.token; retry.disabled = true; note.textContent = '사무실 정보를 확인하고 있습니다.';
      await refreshMe(); if (profileEpoch !== view || !dialog.open) return;
      if (U.token !== token) { if (!U.token) viewSignup(); return; }
      if (U.me) viewHome(); else { note.textContent = '지금은 사무실을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.'; retry.disabled = false; }
    });
    body.replaceChildren(note, retry);
  }
  function viewToken(token) {
    $('profile-title').textContent = '복구 코드 보관'; $('profile-sub').textContent = '새 코드는 지금 한 번만 보여 드려요. 이전 코드가 있었다면 더 이상 사용할 수 없어요.';
    const code = node('code', 'profile-code', token), copy = node('button', 'secondary-button', '복사'), done = node('button', 'primary-button', '사무실로 가기'); copy.type = done.type = 'button';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(token); copy.textContent = '복사됨'; } catch (_) { copy.textContent = '길게 눌러 직접 복사하세요'; } });
    done.addEventListener('click', () => viewHome());
    body.replaceChildren(code, copy, node('p', 'muted-note', '다른 기기에서 같은 캐릭터로 들어오거나 브라우저를 지웠을 때 이 코드가 필요해요. 코드를 아는 사람은 누구나 내 계정을 쓸 수 있으니 공개하지 마세요.'), done);
  }
  function viewRecover() {
    const view = ++profileEpoch;
    $('profile-title').textContent = '복구 코드로 들어가기'; $('profile-sub').textContent = '가입할 때 받은 코드를 붙여 넣어 주세요.';
    const code = input('password', {autocomplete: 'off', placeholder: '복구 코드'}), note = status(), go = node('button', 'primary-button', '들어가기'); go.type = 'button';
    go.addEventListener('click', async () => {
      if (go.disabled) return;
      const requestToken = U.token, requestGeneration = U.generation, token = code.value.trim(); code.value = ''; go.disabled = true; note.textContent = '확인 중…';
      const current = () => profileEpoch === view && dialog.open && U.token === requestToken && U.generation === requestGeneration;
      try {
        const result = await api('/me', {token}); if (!current()) return;
        if (result.membership?.kind === 'MEMBER') { note.textContent = '인증 회원은 이메일 또는 휴대폰 인증으로 로그인해 주세요.'; return; }
        U.token = token; U.me = result; memberSession.clear(); store.set(KEY, token); window.ZEROLobby.setPlayerName(result.nick); render(); viewHome();
      } catch (error) { if (current()) note.textContent = say(error); }
      finally { if (profileEpoch === view) go.disabled = false; }
    });
    const back = node('button', 'secondary-button', '돌아가기'); back.type = 'button'; back.addEventListener('click', viewSignup);
    body.replaceChildren(field('복구 코드', code), note, go, back);
  }

  function viewHome() {
    profileEpoch++; onboarding?.destroy(); onboarding = null;
    if (!U.me) return viewSignup();
    $('profile-title').textContent = U.me.nick + '의 사무실'; $('profile-sub').textContent = '직원 ' + U.me.staff_count + '명 · 연습 수익률 ' + (U.me.portfolio.return_percent === null ? '집계 전' : (U.me.portfolio.return_percent > 0 ? '+' : '') + U.me.portfolio.return_percent.toFixed(2) + '%');
    const isMember = U.me.membership?.kind === 'MEMBER';
    const team = node('button', 'primary-button', '팀·직원 구성하기'), portfolio = node('button', 'secondary-button', isMember ? '모의투자 직접 매매' : '연습 포트폴리오 배분'), see = node('button', 'secondary-button', '내 사무실 보기'), out = node('button', 'secondary-button', isMember ? '로그아웃' : '방문자 데이터 나가기');
    [team, portfolio, see, out].forEach((b) => { b.type = 'button'; });
    team.addEventListener('click', viewTeam); portfolio.addEventListener('click', viewPortfolio); see.addEventListener('click', () => { dialog.close(); window.ZEROLobby.showOwn(window.ZEROCompany?.officeFor(U.me)||{nick: U.me.nick, team: U.me.team, space: U.me.space}); });
    out.addEventListener('click', async () => {
      const token = U.token; out.disabled = true;
      try { if (isMember) await api('/logout', {method: 'POST', token, body: {}}); }
      catch (error) { if (error.code !== 'UNAUTHORIZED') { const note = status(); note.textContent = '로그아웃 요청을 완료하지 못했습니다. 다시 시도해 주세요.'; body.append(note); out.disabled = false; return; } }
      if (U.token !== token) return;
      store.del(KEY); memberSession.clear(token); store.del('zero-lobby-name'); U.token = null; U.member = false; U.me = null;
      window.ZEROLobby.setPlayerName(U.visitor || 'ZERO'); body.replaceChildren(); dialog.close(); window.ZEROLobby.open(); render();
    });
    const company = node('button', 'secondary-button', '투자회사 · 전략 직원 관리'); company.addEventListener('click',()=>{dialog.close();window.ZERO?.navigate('company');});
    const layout = node('button','secondary-button','사무실 꾸미기(배치 편집)');layout.type='button';layout.addEventListener('click',()=>{if(!U.me)return;dialog.close();window.ZEROOfficeEditor?.open();});
    const wardrobe = node('button', 'secondary-button', '내 캐릭터 · 성장과 꾸미기'); wardrobe.type = 'button'; wardrobe.addEventListener('click', () => { dialog.close(); window.ZEROSocial?.openWardrobe(); });
    const renew = node('button', 'secondary-button', '복구 코드 교체 · 다른 기기 로그아웃'); renew.type = 'button';
    renew.addEventListener('click', async () => {
      if (!window.confirm('이전 복구 코드는 사용할 수 없게 됩니다. 새 코드를 안전하게 보관할 수 있나요?')) return;
      renew.disabled = true; const note = status(), requestToken = U.token, requestGeneration = U.generation; body.append(note);
      try { const result = await api('/me/token', {method: 'POST', token: requestToken}); if (U.token !== requestToken || U.generation !== requestGeneration) return; U.token = result.token; store.set(KEY, result.token); render(); viewToken(result.token); }
      catch (error) { note.textContent = say(error); renew.disabled = false; }
    });
    const membership = node('p', 'member-session-note', isMember
      ? (U.me.membership.method === 'phone' ? '휴대폰 인증 회원' : '이메일 인증 회원') + ' · 연락처는 공개되지 않습니다. 전광판 수익률은 별도로 검증합니다.'
      : '방문자 계정 · 전광판과 수익률 랭킹에 표시되지 않습니다. 기존 사무실은 인증 후에도 유지할 수 있습니다.');
    const verify = node('button', 'primary-button', '이메일·휴대폰으로 인증하기'); verify.type = 'button'; verify.addEventListener('click', viewSignup);
    const rename = node('button','secondary-button','닉네임 변경'); rename.type='button'; rename.addEventListener('click',viewNickname);
    const retention = node('div','member-onboarding'), keep = input('checkbox',{checked:U.remember!==false}), keepField = field('로그인 유지',keep), saveKeep = node('button','secondary-button','로그인 유지 설정 저장'), keepNote = status();
    keepField.className='member-remember';saveKeep.type='button';
    keepNote.textContent=U.rememberError?'로그인 유지 설정을 적용하지 못했습니다. 다시 저장해 주세요.':'최초 로그인부터 최대 30일 유지합니다. 공용 기기에서는 해제하세요.';
    saveKeep.addEventListener('click',async()=>{
      if(saveKeep.disabled)return;const token=U.token,generation=U.generation,view=profileEpoch,remember=keep.checked;
      saveKeep.disabled=true;keep.disabled=true;keepNote.textContent='로그인 유지 설정을 저장하고 있어요.';
      try{const saved=await rememberSession(remember,token,generation);if(saved&&dialog.open&&profileEpoch===view)keepNote.textContent=remember?'이 기기에서 로그인을 유지합니다.':'이 탭을 닫으면 로그아웃됩니다.';}
      catch(error){if(U.token===token&&dialog.open&&profileEpoch===view)keepNote.textContent=error.code==='UNAUTHORIZED'?'로그인이 만료되었습니다. 다시 로그인해 주세요.':'로그인 유지 설정을 저장하지 못했습니다. 다시 시도해 주세요.';}
      finally{if(dialog.open&&profileEpoch===view){saveKeep.disabled=false;keep.disabled=false;}}
    });
    retention.append(keepField,saveKeep,keepNote);
    body.replaceChildren(membership, ...(isMember ? [rename,retention] : []), node('p', 'muted-note', '직원 이름·업무·전략 배분은 대표님만 조회합니다. 팀 이름은 공개를 선택한 경우에만 표시됩니다. 회원 인증은 증권계좌 연결이나 매매 권한을 추가하지 않습니다.'), ...(!isMember ? [verify] : []), team, company, portfolio, see, layout, wardrobe, ...(!isMember ? [renew] : []), out);
  }

  function viewNickname() {
    const view=++profileEpoch,token=U.token,generation=U.generation;
    $('profile-title').textContent='닉네임 변경'; $('profile-sub').textContent='사무실·광장·커뮤니티에 표시되는 이름을 바꿉니다.';
    const nick=input('text',{maxLength:12,autocomplete:'nickname',value:U.me.nick}),form=node('form','member-form member-onboarding'),note=status(),save=node('button','primary-button','저장'),back=node('button','secondary-button','돌아가기');
    save.type='submit';back.type='button';back.addEventListener('click',viewHome);
    nick.addEventListener('input',()=>{if(!save.disabled)note.textContent='';});
    const current=()=>dialog.open&&profileEpoch===view&&U.token===token&&U.generation===generation;
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(save.disabled||!current())return;
      const value=nick.value.trim(),problem=nickProblem(value);
      if(problem){note.textContent=problem;return;}
      if(value===U.me.nick){note.textContent='현재 사용 중인 닉네임이에요.';return;}
      save.disabled=true;nick.disabled=true;note.textContent='닉네임을 저장하고 있어요.';
      try {
        const result=await api('/me/nick',{method:'PUT',token,body:{nick:value}});
        if(!current())return;
        U.me={...U.me,nick:result.nick};window.ZEROLobby.setPlayerName(result.nick);render();viewHome();loadBoard();
        const done=status();done.textContent='닉네임을 변경했어요.';body.prepend(done);
      } catch(error){if(current())note.textContent=say(error);}
      finally{if(current()){save.disabled=false;nick.disabled=false;}}
    });
    form.append(field('새 닉네임',nick),node('p','muted-note','2~12자의 한글·영문·숫자·밑줄을 사용할 수 있어요. 다른 회원의 닉네임과 운영용 이름은 사용할 수 없어요.'),note,save,back);
    body.replaceChildren(form);nick.focus?.();
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
    if(U.me.company){model.company=U.me.company.name||model.company;Object.assign(space,U.me.company.space||{});}
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
    if(U.me?.membership?.kind==='MEMBER'){dialog.close();window.ZERO?.navigate('company');return;}
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
  async function rememberSession(remember, token, generation) {
    let result;
    try{result=await api('/me/session',{method:'PUT',token,body:{remember}});}
    catch(error){
      if(error.code==='UNAUTHORIZED'&&U.token===token&&U.generation===generation){
        memberSession.clear(token);store.del(KEY);U.token=null;U.member=false;U.me=null;profileEpoch++;body.replaceChildren();dialog.close();
        window.ZEROLobby.setPlayerName(U.visitor||'ZERO');render();
      }
      throw error;
    }
    if(U.token!==token||U.generation!==generation)return false;
    memberSession.set({token,expires_at:result.expires_at},remember);U.remember=remember;U.rememberError=false;return true;
  }
  async function refreshMe() {
    if (!U.token) { U.me = null; return render(); }
    const token = U.token, generation = U.generation;
    try {
      const result = await api('/me', {token}); if (U.token !== token || U.generation !== generation) return;
      if(typeof result?.nick!=='string'||!result.nick||!['MEMBER','GUEST'].includes(result.membership?.kind))throw {code:'PROFILE_UNAVAILABLE'};
      if(result.membership?.kind==='MEMBER'&&U.remember===undefined){
        try{await rememberSession(true,token,generation);}catch(error){if(error.code==='UNAUTHORIZED')throw error;if(U.token!==token||U.generation!==generation)return;U.rememberError=true;}
        if(U.token!==token||U.generation!==generation)return;
      }
      U.me = result; window.ZEROLobby.setPlayerName(U.me.nick);
    }
    // A failed connection or malformed profile is not evidence that the session was revoked.
    catch (error) { if (U.token !== token || U.generation !== generation) return; if (error.code === 'UNAUTHORIZED') { store.del(KEY); memberSession.clear(token); U.token = null; U.member = false; U.me = null; } }
    render();
  }
  let sessionNick, sessionToken;
  function render() { button.textContent = U.me ? (U.me.membership?.kind === 'MEMBER' ? '내 사무실' : '방문자 계정') : U.token ? '로그인 확인' : U.visitor ? '방문자 · ' + U.visitor : '로그인 · 회원가입'; $('lobby-name-chip').textContent = U.me?.nick || U.visitor || 'ZERO';
    if (entry) { entry.textContent = U.me ? '내 계정' : U.token ? '로그인 확인' : U.visitor ? '방문자' : '로그인'; entry.title = button.textContent; entry.setAttribute('aria-label', U.me ? U.me.nick + ' 계정 관리' : '이메일·휴대폰으로 가입 또는 로그인'); }
    const nick = U.me?.nick || null; if (sessionNick !== nick || sessionToken !== U.token) { sessionNick = nick; sessionToken = U.token; U.generation++; document.dispatchEvent(new CustomEvent('zero-session-changed')); }
    document.dispatchEvent(new CustomEvent('zero-profile-updated')); }
  button.addEventListener('click', () => { U.me ? viewHome() : U.token ? viewPending() : viewSignup(); if (!dialog.open) dialog.showModal?.(); });

  entry?.addEventListener('click', () => button.click());
  window.addEventListener('storage', event => {
    // sessionStorage events also cross same-origin iframes; only localStorage carries remembered logout.
    if(event.storageArea){try{if(event.storageArea!==localStorage)return;}catch(_){return;}}
    if (event.key !== REMEMBER_KEY && event.key !== null || !U.member) return;
    let replaced=false;try{replaced=JSON.parse(event.oldValue)?.token===U.token;}catch(_){/* unrelated storage event */}
    if(memberSession.persisted()===U.token||memberSession.get()===U.token&&!replaced&&event.key!==null)return;
    // A sibling tab signed out or replaced this login; pending responses cannot restore it.
    memberSession.clear(U.token);U.token = null; U.member = false; U.me = null; profileEpoch++; dialog.close();
    window.ZEROLobby.setPlayerName(U.visitor || 'ZERO'); render();
  });

  async function loadBoard() {
    try { const data = await api('/leaderboard'); window.ZEROLobby.setUserBoard(data.state === 'AVAILABLE' ? data.items : [], {state: data.state, checkedAt: data.checked_at}); } catch (_) { window.ZEROLobby.setUserBoard([], {state: 'UNAVAILABLE'}); }
  }
  let visitSequence=0;
  document.addEventListener('zero-view-changed',()=>{visitSequence++;});
  async function visit(nick) {
    const sequence=++visitSequence,token=U.token,generation=U.generation,view=window.ZERO?.currentView?.();
    try { const data = await api('/office?nick=' + encodeURIComponent(nick)); if(sequence!==visitSequence||U.token!==token||U.generation!==generation||window.ZERO?.currentView?.()!==view)return;window.ZEROLobby.visit({nick: data.nick, staffCount: data.staff_count, returnPercent: data.return_percent, space: data.space, teams: data.teams, appearance: data.appearance, level: data.level, layout: window.ZEROOfficeLayout?.validate(data.layout) || null}); }
    catch (_) { /* a missing office leaves the current scene */ }
  }
  window.ZEROLobbyUsers = {visit, refresh: refreshMe, board: loadBoard,
    ownOffice: () => U.me ? window.ZEROCompany?.officeFor(U.me)||{nick:U.me.nick,team:U.me.team,space:U.me.space} : null,
    restoringSession: () => !!U.token && !U.me,
    session: () => U.me ? {nick: U.me.nick, progress: U.me.progress, appearance: U.me.appearance, catalog: U.me.catalog, blocks: U.me.blocks, practiceReturn: U.me.portfolio?.return_percent, membership: U.me.membership} : null,
    request: (path, options = {}) => api(path, {...options, token: U.token}),
    localKey: (base) => accountKey(store, base, U.me?.nick),
    openProfile: () => button.click(),
    editOffice:()=>{if(!U.me)return;viewTeam();if(!dialog.open)dialog.showModal?.();},
    // office: owner nickname for that office's live room; omitted for the public plaza.
    openLoungeSocket: (office) => {
      if (!U.me || !U.token) throw {code: 'UNAUTHORIZED'};
      const origin = BASE.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
      const token = U.token, socket = new WebSocket(office ? `${origin}/api/lobby/office-room/${encodeURIComponent(office)}/socket` : `${origin}/api/lobby/lounge/socket`);
      socket.addEventListener('open', () => { if (U.token !== token) socket.close(); else socket.send(JSON.stringify({type: 'auth', token, move_ack: true})); }); return socket;
    }};
  if (U.visitor && !U.token) window.ZEROLobby.setPlayerName(U.visitor);
  render(); refreshMe(); if(document.documentElement?.dataset.zeroView==='lobby')loadBoard(); setInterval(() => { if (!document.hidden) { if(document.documentElement?.dataset.zeroView==='lobby')loadBoard(); if (U.token) refreshMe(); } }, 60000);
})();
