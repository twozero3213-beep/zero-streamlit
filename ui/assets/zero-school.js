/* 주식 입문 학교 창. 단계·문제·점수 규칙은 academy-logic.js에 있고 여기서는 화면만 그린다.
   진도는 이 브라우저에만 저장한다. 실제 주문은 어디에도 나가지 않는다. */
(() => {
  'use strict';
  const A = window.ZEROAcademyLogic, U = window.ZeroUI;
  const dialog = document.getElementById('school');
  if (!A || !dialog) return;
  const {el} = U;
  const body = document.getElementById('school-body'), rank = document.getElementById('school-rank'), fill = document.getElementById('school-fill');
  const KEY = 'zero-academy-v1';

  let progress = A.normalize(U.store.get(KEY, null));
  let session = null;

  function save() { U.store.set(KEY, progress); badges(); }

  // 학교 밖(공부 화면)의 단계 표시도 함께 맞춘다.
  function badges() {
    const level = A.playerLevel(progress), done = level > A.LEVELS.length;
    const started = Object.keys(progress.passed).length > 0 || progress.xp > 0;
    const set = (name, text) => document.querySelectorAll('[data-academy="' + name + '"]').forEach((node) => { node.textContent = text; });
    set('lv', done ? '졸업' : level + '단계');
    set('rank', A.rankOf(progress));
    set('xp', progress.xp + '점');
    set('cta', started ? '이어서 배우기' : '배우기 시작');
    rank.textContent = A.rankOf(progress) + ', ' + progress.xp + '점';
    fill.style.setProperty('width', Math.round(A.levelProgress(progress) * 100) + '%');
  }

  function show(...children) {
    body.replaceChildren(...children.flat().filter(Boolean));
    body.scrollTop = 0;
    const heading = body.querySelector('h3');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({preventScroll: true});
  }

  const button = (text, kind, onclick) => el('button', {type: 'button', class: 'button' + (kind ? ' ' + kind : ''), text, onclick});
  const crumb = () => el('p', {class: 'school-crumb', text: (A.LEVELS.indexOf(session.level) + 1) + '단계, ' + session.level.title});

  function begin(level) {
    session = {level, page: 0, picks: [], index: 0, practice: A.practiceStart()};
    lesson();
  }

  // ---- 단계 지도 ------------------------------------------------------------------------------
  function map() {
    session = null;
    const next = A.currentLevel(progress);
    const rows = A.LEVELS.map((level, index) => {
      const open = A.unlocked(progress, level), passed = progress.passed[level.id];
      const state = passed ? '통과 ' + passed.score + '/' + passed.total + (passed.perfect ? ', 만점' : '') : open ? '문제 ' + level.quiz.length + '개 중 ' + A.needed(level) + '개를 맞히면 통과' : '앞 단계를 통과하면 열려요';
      return el('li', {class: 'row school-level' + (open ? '' : ' locked')},
        el('span', {class: 'row-name'}, el('strong', {text: (index + 1) + '단계 ' + level.title}), el('small', {text: level.goal}), el('small', {class: passed ? 'tone-ok' : '', text: state})),
        open ? button(passed ? '다시 보기' : level === next ? '시작' : '열기', passed ? 'ghost' : '', () => begin(level)) : null);
    });
    const reset = el('button', {type: 'button', class: 'link-button', text: '진도 처음으로 되돌리기', onclick: () => {
      if (window.confirm('저장된 학교 진도를 지우고 처음부터 시작할까요?')) { progress = A.emptyProgress(); save(); map(); }
    }});
    show(el('h3', {text: next ? '단계를 골라 시작하세요' : '모든 단계를 마쳤어요'}),
      el('p', {class: 'note', text: '공부용이에요. 투자 권유가 아니에요.'}),
      el('ul', {class: 'rows'}, rows), reset);
  }

  // ---- 설명 -----------------------------------------------------------------------------------
  function lesson() {
    const {level, page} = session, content = level.pages[page], last = page === level.pages.length - 1;
    show(crumb(),
      el('h3', {text: content.title}),
      content.body.map((text) => el('p', {text})),
      content.tip ? el('p', {class: 'school-tip', text: content.tip}) : null,
      el('p', {class: 'note', text: (page + 1) + ' / ' + level.pages.length}),
      el('div', {class: 'button-row'},
        button(page ? '이전' : '단계 목록', 'ghost', () => { if (page) { session.page--; lesson(); } else map(); }),
        button(last ? (level.practice ? '연습해 보기' : '문제 풀기') : '다음', '', () => {
          if (!last) { session.page++; lesson(); return; }
          session.index = 0; session.picks = [];
          if (level.practice) practice(); else quiz();
        })));
  }

  // ---- 연습 거래(2단계) -----------------------------------------------------------------------
  function practice() {
    const state = session.practice, info = A.practiceView(state);
    const act = (action) => { session.practice = A.practiceAct(state, action); practice(); };
    const facts = [
      ['날짜', (state.day + 1) + '일차 / ' + A.PRACTICE_PRICES.length + '일'],
      ['지금 가격', A.won(info.price)],
      ['현금', A.won(state.cash)],
      ['가진 주식', state.qty + '주' + (state.qty ? ', 평균 ' + A.won(state.avg) : '')],
      ['평가손익(아직 확정 전)', (info.unrealized >= 0 ? '+' : '-') + A.won(Math.abs(info.unrealized))],
      ['실현손익(확정)', (state.realized >= 0 ? '+' : '-') + A.won(Math.abs(state.realized))]
    ];
    const quizButton = button('문제 풀기', '', quiz);
    quizButton.disabled = !info.goalMet;
    show(crumb(),
      el('h3', {text: '연습 거래'}),
      el('p', {text: '가상의 종목을 직접 사고팔아 보세요. 연습용 숫자이고 실제 주문은 나가지 않아요.'}),
      el('p', {class: 'school-tip' + (info.goalMet ? ' done' : ''), text: (info.goalMet ? '해냈어요. ' : '할 일: ') + '싸게 사서 더 비싸게 팔아 실현손익을 +로 만들어 보세요.'}),
      el('dl', {class: 'facts'}, facts.map(([label, value]) => el('div', {}, el('dt', {text: label}), el('dd', {text: value})))),
      el('div', {class: 'button-row'}, button('1주 사기', '', () => act('buy')), button('1주 팔기', 'ghost', () => act('sell')), button('다음 날로', 'ghost', () => act('next'))),
      state.error ? el('p', {class: 'school-error', role: 'alert', text: state.error}) : null,
      el('ol', {class: 'school-log'}, state.log.slice(-4).map((line) => el('li', {text: line}))),
      el('div', {class: 'button-row'},
        button('설명으로', 'ghost', () => { session.page = session.level.pages.length - 1; lesson(); }),
        button('처음부터 다시', 'ghost', () => { session.practice = A.practiceStart(); practice(); }),
        quizButton));
  }

  // ---- 문제 -----------------------------------------------------------------------------------
  function quiz() {
    const {level, index} = session, question = level.quiz[index], shown = A.shuffled(question), picked = session.picks[index];
    const choices = shown.choices.map((text, choice) => {
      const item = el('button', {type: 'button', class: 'choice', text: (choice + 1) + '. ' + text});
      if (picked === undefined) item.addEventListener('click', () => { session.picks[index] = choice; quiz(); });
      else {
        item.disabled = true;
        if (choice === shown.answer) item.classList.add('right'); else if (choice === picked) item.classList.add('wrong');
      }
      return item;
    });
    const parts = [crumb(), el('p', {class: 'note', text: '문제 ' + (index + 1) + ' / ' + level.quiz.length}), el('h3', {text: question.q}), el('div', {class: 'choices'}, choices)];
    if (picked !== undefined) {
      const right = picked === shown.answer, last = index === level.quiz.length - 1;
      parts.push(
        el('p', {class: 'school-tip' + (right ? ' done' : ''), role: 'status'}, el('strong', {text: right ? '맞았어요. ' : '정답은 ' + (shown.answer + 1) + '번이에요. '}), question.why),
        button(last ? '결과 보기' : '다음 문제', '', () => { if (last) finish(); else { session.index++; quiz(); } }));
    }
    show(parts);
  }

  function finish() {
    const outcome = A.submit(progress, session.level, session.picks);
    progress = outcome.progress;
    save();
    const {result, gained, leveledUp} = outcome, level = session.level, next = A.LEVELS[A.LEVELS.indexOf(level) + 1];
    const actions = result.passed
      ? [button('단계 목록', 'ghost', map), next ? button('다음 단계 시작', '', () => begin(next)) : button('마치기', '', () => dialog.close())]
      : [button('설명 다시 보기', 'ghost', () => { session.page = 0; lesson(); }), button('문제 다시 풀기', '', () => { session.picks = []; session.index = 0; quiz(); })];
    show(crumb(),
      el('h3', {text: result.passed ? '통과했어요' : '조금만 더 해 봐요'}),
      el('p', {text: result.total + '문제 중 ' + result.correct + '문제를 맞혔어요. 통과 기준은 ' + result.needed + '문제예요.'}),
      leveledUp ? el('p', {class: 'school-levelup', role: 'status'}, el('strong', {text: A.playerLevel(progress) > A.LEVELS.length ? '졸업했어요' : A.playerLevel(progress) + '단계로 올라갔어요'}), el('span', {text: '새 칭호: ' + level.rank})) : null,
      el('p', {class: 'note', text: gained ? gained + '점을 얻어 모두 ' + progress.xp + '점이에요.' : '이미 받은 점수라 더 오르지 않았어요.'}),
      el('div', {class: 'button-row'}, actions));
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('[data-open-academy]')) return;
    event.preventDefault();
    map();
    if (!dialog.open) dialog.showModal();
  });
  document.addEventListener('zero-academy-badges', badges);
  badges();
})();
