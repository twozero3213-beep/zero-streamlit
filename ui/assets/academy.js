/* ZERO 주식 입문 학교: the dialog around the levels in academy-logic.js. Progress is kept only in this browser. */
(() => {
  'use strict';
  const dialog = document.getElementById('academy');
  if (!dialog || !window.ZEROAcademyLogic) return;
  const A = window.ZEROAcademyLogic, KEY = 'zero-academy-v1';
  const body = document.getElementById('academy-body'), bar = document.getElementById('academy-bar'), rankLine = document.getElementById('academy-rank');
  const node = (tag, className = '', text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const button = (label, className, onClick) => { const element = node('button', className, label); element.type = 'button'; element.addEventListener('click', onClick); return element; };
  const store = {get() { try { return localStorage.getItem(KEY); } catch (_) { return null; } }, set(value) { try { localStorage.setItem(KEY, value); } catch (_) { /* private mode: progress lasts for this visit only */ } }};

  let accountEpoch = 0;
  document.addEventListener('zero-session-changed', () => { accountEpoch++; });
  let progress = A.normalize(store.get()), view = {name: 'map'}, session = null;
  const save = (celebrate = false) => { store.set(JSON.stringify(progress)); paintBadges(celebrate); };

  // Small level badges elsewhere on the page (hero button, side card) follow the saved progress.
  function paintBadges(celebrate = false) {
    const level = A.playerLevel(progress), done = level > A.LEVELS.length;
    document.dispatchEvent(new CustomEvent('zero-academy-progress', {detail: {level, rank: A.rankOf(progress), xp: progress.xp, celebrate}}));
    document.querySelectorAll('[data-academy="lv"]').forEach((el) => { el.textContent = done ? '졸업' : 'Lv.' + level; });
    document.querySelectorAll('[data-academy="rank"]').forEach((el) => { el.textContent = A.rankOf(progress); });
    document.querySelectorAll('[data-academy="xp"]').forEach((el) => { el.textContent = progress.xp + ' XP'; });
    document.querySelectorAll('[data-academy="next"]').forEach((el) => { const next = A.currentLevel(progress); el.textContent = next ? '다음: ' + next.title : '모든 레벨을 마쳤어요!'; });
    document.querySelectorAll('[data-academy="fill"]').forEach((el) => { el.style.width = Math.round(A.levelProgress(progress) * 100) + '%'; });
    document.querySelectorAll('[data-academy="cta"]').forEach((el) => { el.textContent = Object.keys(progress.passed).length || progress.xp ? '이어서 배우기' : '배우기 시작'; });
    rankLine.textContent = '현재 ' + A.rankOf(progress) + ' · ' + progress.xp + ' XP';
    bar.style.width = Math.round(A.levelProgress(progress) * 100) + '%';
  }

  function paint(...children) { body.replaceChildren(...children); body.scrollTop = 0; const heading = body.querySelector('h3'); heading?.setAttribute('tabindex', '-1'); heading?.focus({preventScroll: true}); }
  const go = (next) => { view = next; render(); };

  function renderMap() {
    const list = node('div', 'academy-levels'), next = A.currentLevel(progress);
    A.LEVELS.forEach((level, index) => {
      const open = A.unlocked(progress, level), row = progress.passed[level.id], card = node('div', 'academy-level' + (row ? ' done' : open ? ' open' : ' locked'));
      const head = node('div', 'academy-level-head'); head.append(node('span', 'academy-badge', row ? '✅' : open ? level.badge : '🔒'), node('div', '', ''));
      head.lastChild.append(node('strong', '', 'Lv.' + (index + 1) + ' ' + level.title), node('p', '', level.goal));
      const foot = node('div', 'academy-level-foot', ''); foot.append(node('span', 'academy-score', row ? '통과 ' + row.score + '/' + row.total + (row.perfect ? ' · 만점' : '') : open ? '퀴즈 ' + level.quiz.length + '문제 · ' + A.needed(level) + '개 맞히면 통과' : '앞 레벨을 통과하면 열려요'));
      if (open) foot.append(button(row ? '다시 보기' : level === next ? '시작하기' : '열기', row ? 'secondary-button' : 'primary-button', () => { session = {level, page: 0, picks: [], index: 0, practice: A.practiceStart()}; go({name: 'page'}); }));
      card.append(head, foot); list.append(card);
    });
    const finished = !next, reset = button('진행 초기화', 'academy-reset', () => { if (window.confirm('저장된 학교 진행을 지우고 처음부터 시작할까요?')) { progress = A.emptyProgress(); save(); render(); } });
    paint(node('h3', '', finished ? '졸업을 축하해요! 🎓' : '레벨을 골라 시작하세요'), node('p', 'academy-lead', finished ? '모든 레벨을 마쳤어요. 궁금한 레벨을 다시 열어 복습할 수 있어요.' : '한 레벨은 짧은 설명 몇 장과 퀴즈로 이뤄져요. 퀴즈를 통과하면 레벨이 올라요. 이 학교는 공부용이고 투자 조언이 아니에요.'), list, reset);
  }

  // 을/를 follows whether the last Hangul syllable has a final consonant.
  const objectParticle = (word) => { const code = String(word).charCodeAt(String(word).length - 1) - 0xAC00; return code >= 0 && code < 11172 && code % 28 ? '을' : '를'; };
  const steps = () => session.level.pages.length + (session.level.practice ? 1 : 0) + 1;
  function stepDots(current) {
    const dots = node('div', 'academy-dots'); dots.setAttribute('aria-label', steps() + '단계 중 ' + (current + 1) + '단계');
    for (let i = 0; i < steps(); i++) dots.append(node('i', i === current ? 'on' : i < current ? 'past' : ''));
    return dots;
  }
  const crumb = () => node('p', 'academy-crumb', 'Lv.' + (A.LEVELS.indexOf(session.level) + 1) + ' · ' + session.level.title);

  function renderPage() {
    const {level, page} = session, content = level.pages[page], last = page === level.pages.length - 1;
    const card = node('div', 'academy-card'); content.body.forEach((text) => card.append(node('p', '', text)));
    if (content.tip) card.append(node('p', 'academy-tip', '💡 ' + content.tip));
    const nav = node('div', 'academy-nav');
    nav.append(button(page ? '이전' : '지도', 'secondary-button', () => page ? (session.page--, render()) : go({name: 'map'})),
      button(last ? (level.practice ? '연습해 보기' : '퀴즈 풀기') : '다음', 'primary-button', () => last ? (session.index = 0, session.picks = [], go({name: level.practice ? 'practice' : 'quiz'})) : (session.page++, render())));
    paint(crumb(), stepDots(page), node('h3', '', content.title), card, nav);
  }

  function renderPractice() {
    const state = session.practice, info = A.practiceView(state), grid = node('dl', 'academy-sim');
    [['날짜', (state.day + 1) + '일차 / ' + A.PRACTICE_PRICES.length], ['현재 가격', A.won(info.price)], ['현금', A.won(state.cash)], ['보유', state.qty + '주' + (state.qty ? ' · 평균단가 ' + A.won(state.avg) : '')],
      ['평가손익(미확정)', (info.unrealized >= 0 ? '+' : '−') + A.won(Math.abs(info.unrealized))], ['실현손익(확정)', (state.realized >= 0 ? '+' : '−') + A.won(Math.abs(state.realized))]]
      .forEach(([label, value]) => { const row = node('div'); row.append(node('dt', '', label), node('dd', '', value)); grid.append(row); });
    const act = (action) => { session.practice = A.practiceAct(state, action); render(); };
    const controls = node('div', 'academy-sim-actions'); controls.append(button('매수 1주', 'primary-button', () => act('buy')), button('매도 1주', 'secondary-button', () => act('sell')), button('다음 날 ▶', 'secondary-button', () => act('next')));
    const log = node('ol', 'academy-log'); state.log.slice(-4).forEach((line) => log.append(node('li', '', line)));
    const mission = node('p', 'academy-mission' + (info.goalMet ? ' met' : ''), (info.goalMet ? '✅ ' : '🎯 ') + '미션: 싸게 사서 더 비싸게 팔아 실현손익을 +로 만들어 보세요.');
    const nav = node('div', 'academy-nav');
    nav.append(button('설명으로', 'secondary-button', () => { session.page = session.level.pages.length - 1; go({name: 'page'}); }), button('다시 연습', 'secondary-button', () => { session.practice = A.practiceStart(); render(); }),
      button('퀴즈 풀기', 'primary-button', () => go({name: 'quiz'})));
    nav.lastChild.disabled = !info.goalMet; if (!info.goalMet) nav.lastChild.title = '미션을 마치면 열려요';
    paint(crumb(), stepDots(session.level.pages.length), node('h3', '', '연습 거래'), node('p', 'academy-lead', '가상의 종목으로 직접 사고팔아 보세요. 연습용 숫자이고 수수료·세금은 계산하지 않아요(실제로는 붙어요). 실제 주문은 어디에도 나가지 않아요.'), mission, grid,
      controls, state.error ? node('p', 'academy-warn', state.error) : node('p', 'academy-warn'), log, nav);
  }

  function renderQuiz() {
    const {level, index} = session, question = level.quiz[index], shown = A.shuffled(question), picked = session.picks[index];
    const choices = node('div', 'academy-choices');
    shown.choices.forEach((text, choice) => {
      const item = button((choice + 1) + '. ' + text, 'academy-choice', () => { if (picked !== undefined) return; session.picks[index] = choice; render(); });
      if (picked !== undefined) { item.disabled = true; if (choice === shown.answer) item.classList.add('right'); else if (choice === picked) item.classList.add('wrong'); }
      choices.append(item);
    });
    const parts = [crumb(), stepDots(level.pages.length + (level.practice ? 1 : 0)), node('p', 'academy-count', '문제 ' + (index + 1) + ' / ' + level.quiz.length), node('h3', '', question.q), choices];
    if (picked !== undefined) {
      const ok = picked === shown.answer, note = node('div', 'academy-feedback ' + (ok ? 'ok' : 'no'));
      note.append(node('strong', '', ok ? '정답이에요! 🎉' : '아쉬워요, 정답은 ' + (shown.answer + 1) + '번이에요.'), node('p', '', question.why));
      const last = index === level.quiz.length - 1;
      parts.push(note, button(last ? '결과 보기' : '다음 문제', 'primary-button academy-wide', () => { if (last) finishQuiz(); else { session.index++; render(); } }));
    }
    paint(...parts);
  }

  function quizAnswers(level, picks) {
    return level.quiz.map((question, index) => question.choices.indexOf(A.shuffled(question).choices[picks[index]]));
  }
  async function awardQuiz(finished) {
    const users = window.ZEROLobbyUsers, nick = users?.session()?.nick, epoch = accountEpoch;
    if (!nick) { finished.serverNote = '이 기기의 학습 기록만 저장했어요. 회사 XP는 로그인 후 서버가 확인한 학습에만 반영됩니다.'; if (session === finished && view.name === 'result') renderResult(); return; }
    finished.serverNote = '서버가 학습 답안을 확인하고 있어요. 회사 XP는 확인 전까지 지급되지 않습니다.';
    try {
      const result = await users.request('/me/quiz', {method: 'POST', body: {lesson_id: finished.level.id, answers: quizAnswers(finished.level, finished.picks)}});
      if (epoch !== accountEpoch || users.session()?.nick !== nick || session !== finished) return;
      if (typeof result?.passed !== 'boolean' || result.total !== finished.level.quiz.length || !Number.isInteger(result.correct) || result.correct < 0 || result.correct > result.total || !Number.isSafeInteger(result.gained) || result.gained < 0 || result.progress?.basis !== 'SERVER_CONFIRMED_LEARNING_REVIEW_AND_TRUSTED_PERFORMANCE') throw new Error('QUIZ_UNVERIFIED');
      await users.refresh();
      if (epoch !== accountEpoch || users.session()?.nick !== nick || session !== finished) return;
      finished.serverNote = result.passed ? (result.gained ? '서버 검증 통과 · 회사 XP +' + result.gained : '서버 검증 통과 · 이미 반영한 학습이라 회사 XP를 중복 지급하지 않았어요.') : '서버가 답안을 확인했어요. 통과 기준에 못 미쳐 회사 XP는 지급하지 않았습니다.';
    } catch (_) {
      if (epoch !== accountEpoch || users.session()?.nick !== nick || session !== finished) return;
      finished.serverNote = '서버 검증을 완료하지 못했어요. 이 기기의 학습 기록은 보존했으며 회사 XP 지급은 확인되지 않았습니다.';
    }
    if (session === finished && view.name === 'result') renderResult();
  }
  function finishQuiz() {
    const before = A.playerLevel(progress), outcome = A.submit(progress, session.level, session.picks);
    progress = outcome.progress; save(outcome.leveledUp); session.outcome = outcome; session.levelBefore = before; go({name: 'result'}); awardQuiz(session);
  }
  function renderResult() {
    const {level, outcome} = session, {result, gained, leveledUp} = outcome, index = A.LEVELS.indexOf(level), nextLevel = A.LEVELS[index + 1];
    const parts = [crumb(), node('h3', '', result.passed ? '통과했어요!' : '조금만 더 해요')];
    const score = node('p', 'academy-score-line', result.correct + ' / ' + result.total + '문제 정답' + (result.perfect ? ' · 만점 ⭐' : '') + ' · 통과 기준 ' + result.needed + '개'); parts.push(score);
    if (leveledUp) {
      const reached = A.playerLevel(progress), panel = node('div', 'academy-levelup'); panel.setAttribute('role', 'status');
      panel.append(node('span', 'academy-burst', level.badge), node('strong', '', reached > A.LEVELS.length ? '졸업! 🎓' : '레벨 업! Lv.' + reached), node('p', '', '새 칭호 "' + level.rank + '"' + objectParticle(level.rank) + ' 얻었어요.'));
      parts.push(panel);
    }
    parts.push(node('p', 'academy-xp', gained ? '이 기기의 학습 XP +' + gained + ' (총 ' + progress.xp + ' XP) · 회사 XP와 별도' : '이 기기의 복습 기록이에요. 학습 XP는 중복 지급하지 않습니다.'));
    parts.push(node('p', 'academy-warn', session.serverNote || '회사 XP는 서버 검증 전까지 지급되지 않습니다.'));
    const nav = node('div', 'academy-nav');
    if (!result.passed) nav.append(button('설명 다시 보기', 'secondary-button', () => { session.page = 0; session.picks = []; session.index = 0; go({name: 'page'}); }), button('퀴즈 다시', 'primary-button', () => { session.picks = []; session.index = 0; go({name: 'quiz'}); }));
    else nav.append(button('지도로', 'secondary-button', () => go({name: 'map'})), nextLevel ? button('다음 레벨 시작', 'primary-button', () => { session = {level: nextLevel, page: 0, picks: [], index: 0, practice: A.practiceStart()}; go({name: 'page'}); }) : button('마치기', 'primary-button', () => dialog.close()));
    parts.push(nav); paint(...parts);
  }

  function render() {
    paintBadges();
    if (view.name === 'map' || !session) return renderMap();
    ({page: renderPage, practice: renderPractice, quiz: renderQuiz, result: renderResult}[view.name] || renderMap)();
  }
  function open() { view = {name: 'map'}; render(); if (!dialog.open) dialog.showModal?.(); }

  document.addEventListener('click', (event) => { if (event.target.closest?.('[data-open-academy]')) { event.preventDefault(); open(); } });
  document.getElementById('academy-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  paintBadges();
  window.ZEROAcademy = {open, state: () => ({progress, view, session})};
})();
/* Study hub: every lesson gets the same card as 주식 입문 학교 (title, one line, 배우기). */
(() => {
  'use strict';
  const view = document.getElementById('study-view'); if (!view) return;
  const school = view.querySelector('section[aria-label="주식 입문 학교"]'); if (!school) return;
  const LINES = {
    'study-title': '종목과 주기를 바꾸고, 봉을 움직여 실제 가격의 구조를 확인해요.',
    'study-basics-title': '캔들 한 개의 네 가격, 이동평균, VIX를 읽는 순서를 배워요.',
    'study-formulas-title': 'EPS·PER·PBR·ROE 같은 기업 숫자를 주가와 연결해 계산해요.',
    'study-nvda-title': '실제 NVIDIA 공시 숫자로 지표를 직접 계산해 봐요.'
  };
  const make = (tag, cls, text) => { const element = document.createElement(tag); if (cls) element.className = cls; if (text) element.textContent = text; return element; };
  const hub = make('section', 'panel desk-panel study-hub'); hub.setAttribute('aria-label', '학습 목록');
  hub.append(make('h2', 'study-hub-title', '학습 목록'));
  const list = make('div', 'study-hub-list'); hub.append(list);
  const card = (title, line, action) => { const row = make('article', 'study-card'), text = make('div', 'study-card-text'), go = make('button', 'primary-button', '배우기'); go.type = 'button'; text.append(make('h3', '', title), make('p', '', line)); row.append(text, go); go.addEventListener('click', action); return row; };
  const schoolLine = school.querySelector('.panel-heading p')?.cloneNode(true);
  const schoolCard = card('주식 입문 학교', '', () => window.ZEROAcademy?.open()); if (schoolLine) schoolCard.querySelector('p').replaceWith(schoolLine);
  list.append(schoolCard);
  // Opening a lesson selects its page in the existing pager, so prev/next and the dropdown keep working.
  const openLesson = (section) => { const select = view.querySelector('.viewport-controls select'); const index = [...select?.options || []].findIndex(option => option.textContent === section.querySelector('h2')?.textContent); if (index < 0) { section.scrollIntoView?.({block: 'start'}); return; } select.value = String(index); select.dispatchEvent(new Event('change')); };
  for (const [id, line] of Object.entries(LINES)) {
    const heading = document.getElementById(id), section = heading?.closest('section'); if (!section) continue;
    list.append(card(heading.textContent, line, () => openLesson(section)));
    const back = make('button', 'secondary-button study-back', '학습 목록으로'); back.type = 'button'; back.addEventListener('click', () => openLesson(hub)); section.prepend(back);
  }
  school.hidden = true; view.prepend(hub);
})();
