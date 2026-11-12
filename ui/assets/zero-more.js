/* 더보기: 경제 지표, 뉴스, 보고서, 주식 공부(입문 학교와 계산기), ZERO에게 물어보기, 설정. */
(() => {
  'use strict';
  const C = window.ZeroCore, U = window.ZeroUI, D = window.ZeroData;
  const {el} = U;
  const root = document.getElementById('view-more');
  let pageToken = 0, paintChat = null;

  const MENU = [
    ['macro', 'globe', '경제 지표', '물가, 고용, 금리가 평소보다 높은지 낮은지'],
    ['news', 'news', '뉴스', '지금 올라오는 경제 기사와 핵심 정리'],
    ['reports', 'report', '보고서', '한국은행, 연준 등 기관이 낸 자료'],
    ['study', 'book', '주식 공부', '입문 학교와 계산기'],
    ['ask', 'chat', 'ZERO에게 물어보기', '주식 용어와 사용법을 AI에게 질문'],
    ['settings', 'settings', '설정', '화면 색, 금액 가리기, 자료 기준']
  ];

  function page(title, ...children) {
    root.replaceChildren(el('a', {class: 'back', href: '#more'}, U.icon('back', 18), '더보기'), el('h1', {class: 'page-title', text: title}), ...children.flat().filter(Boolean));
  }

  function menu() {
    root.replaceChildren(el('h1', {class: 'page-title', text: '더보기'}),
      el('section', {class: 'block'}, el('ul', {class: 'rows'}, MENU.map(([key, icon, title, sub]) => el('li', {class: 'row'},
        el('a', {class: 'row-main', href: '#more/' + key},
          el('span', {class: 'row-icon'}, U.icon(icon)),
          el('span', {class: 'row-name'}, el('strong', {text: title}), el('small', {text: sub})),
          U.icon('chevron', 18)))))));
  }

  // ---- 경제 지표 ------------------------------------------------------------------------------
  const COUNTRY = {US: '미국', KR: '한국', GLOBAL: '세계'};
  const valueText = (item, value) => { const n = C.num(value); return Number.isFinite(n) ? C.cut2(n).toLocaleString('ko-KR') + ' ' + (item.unit || '') : '값 미확인'; };

  function gaugeBar(info) {
    const band = el('i', {class: 'gauge-band'}), dot = el('b', {class: 'gauge-dot zone-' + info.zone});
    band.style.setProperty('left', (info.left * 100).toFixed(1) + '%');
    band.style.setProperty('width', ((info.right - info.left) * 100).toFixed(1) + '%');
    dot.style.setProperty('left', (info.pos * 100).toFixed(1) + '%');
    return el('span', {class: 'gauge'}, el('span', {class: 'gauge-track'}, band, dot), el('small', {text: info.label}));
  }

  function macroDetail(item) {
    const values = C.historyValues(item.history), trend = C.trendOf(item.latest_value, item.previous_value), info = C.gauge(item.latest_value, item.statistics);
    // 참고 시나리오가 있으면 높을 때·낮을 때 설명이 그 안에 들어 있다.
    const scenario = window.ZEROOutlook?.outlook(item.history) ? window.ZEROOutlook.render(item) : null;
    const parts = [
      el('p', {class: 'hero-total', text: valueText(item, item.latest_value)}),
      el('p', {class: 'note', text: (COUNTRY[item.country] || '') + ' ' + (item.latest_period || '') + ' 관측' + (trend ? ', 직전보다 ' + C.diffText(trend.diff) : '')}),
      info ? gaugeBar(info) : null,
      values.length >= 2 ? U.sparkline(values, trend?.dir || 'flat', 560, 140) : null,
      item.explanation ? el('p', {text: item.explanation}) : null,
      scenario,
      !scenario && item.above_range ? el('p', {}, el('strong', {text: '높을 때 '}), item.above_range) : null,
      !scenario && item.below_range ? el('p', {}, el('strong', {text: '낮을 때 '}), item.below_range) : null,
      /^https:\/\//.test(item.source_url || '') ? el('a', {class: 'button ghost', href: item.source_url, target: '_blank', rel: 'noopener noreferrer', text: '통계 원문 열기'}) : null,
      U.note('발표 뒤에 값이 수정될 수 있어요. 과거 범위는 배경 설명이고 매매 기준이 아니에요.')
    ];
    U.sheet(item.name, parts.filter(Boolean));
  }

  async function macro(token) {
    page('경제 지표', U.loading());
    const desk = await D.desk();
    if (token !== pageToken) return;
    const items = (desk?.macro || []).filter((item) => item?.name);
    if (!items.length) { page('경제 지표', U.empty('지표 자료를 불러오지 못했어요.')); return; }
    const rows = items.map((item) => {
      const trend = C.trendOf(item.latest_value, item.previous_value), info = C.gauge(item.latest_value, item.statistics);
      const line = U.sparkline(C.historyValues(item.history).slice(-36), trend?.dir || 'flat');
      const button = el('button', {type: 'button', class: 'row-main', onclick: () => macroDetail(item)},
        el('span', {class: 'row-name'}, el('strong', {text: item.name}), el('small', {text: (COUNTRY[item.country] || '') + ' ' + (item.latest_period || '')})),
        el('span', {class: 'row-spark'}, line, info ? gaugeBar(info) : null),
        el('span', {class: 'row-value'}, el('strong', {text: valueText(item, item.latest_value)}),
          trend ? el('span', {class: 'change tone-' + trend.dir, text: C.diffText(trend.diff)}) : null));
      return el('li', {class: 'row'}, button);
    });
    page('경제 지표', el('section', {class: 'block'}, el('ul', {class: 'rows'}, rows)),
      U.note('오른쪽 작은 숫자는 직전 발표와의 차이예요. 점이 파란 띠 안에 있으면 지난 10년의 평소 범위예요. 줄을 누르면 설명이 열려요.'));
  }

  // ---- 뉴스 -----------------------------------------------------------------------------------
  function digest(item) {
    const kinds = ['사실', '사실', '사실', '영향', '다음에 볼 것'];
    const lines = (item.core_sentences || []).map((text, index) => el('li', {}, el('small', {text: kinds[index] || ''}), el('p', {text})));
    const sources = (item.sources || []).filter((source) => /^https:\/\//.test(source?.url || '')).map((source) => el('a', {class: 'button ghost', href: source.url, target: '_blank', rel: 'noopener noreferrer', text: (source.label || '원문') + ' 열기'}));
    U.sheet(item.title, [el('ol', {class: 'digest'}, lines), ...sources, U.note('원문에서 확인한 내용을 다섯 문장으로 줄였어요. 예측이 아니에요.')]);
  }

  async function news(token) {
    page('뉴스', U.loading());
    const [headlines, desk] = await Promise.all([U.api('api/headlines', 60), D.desk()]);
    if (token !== pageToken) return;
    const live = (headlines?.items || []).filter((item) => /^https:\/\//.test(item?.url || '') && (item.title_ko || item.title)).slice(0, 20);
    const digests = (desk?.news || []).filter((item) => item?.title && Array.isArray(item.core_sentences)).slice(0, 12);
    const liveBlock = live.length ? U.section('지금 올라온 기사', el('ul', {class: 'rows'}, live.map((item) => el('li', {class: 'row'},
      el('a', {class: 'row-main stacked', href: item.url, target: '_blank', rel: 'noopener noreferrer'},
        el('strong', {text: U.plain(item.title_ko || item.title)}),
        el('small', {text: [item.publisher, C.ageText(item.published_at), item.title_ko && item.title_ko !== item.title ? '번역' : null].filter(Boolean).join(', ')}))))),
      U.note('제목만 모았어요. 누르면 원문이 새 창으로 열려요.')) : null;
    const digestBlock = digests.length ? U.section('핵심 정리', el('ul', {class: 'rows'}, digests.map((item) => el('li', {class: 'row'},
      el('button', {type: 'button', class: 'row-main stacked', onclick: () => digest(item)},
        el('strong', {text: item.title}), el('small', {text: [item.category, item.release_date].filter(Boolean).join(', ')})))))) : null;
    if (!liveBlock && !digestBlock) { page('뉴스', U.empty('뉴스를 불러오지 못했어요.')); return; }
    page('뉴스', el('div', {class: 'columns'}, el('div', {class: 'column'}, liveBlock), el('div', {class: 'column'}, digestBlock)));
  }

  // ---- 보고서 ---------------------------------------------------------------------------------
  const INSTITUTIONS = [['ALL', '전체'], ['bok-', '한국은행'], ['fed-', '미국 연준'], ['bis-', '국제결제은행'], ['toss-', '토스']];
  let reportFilter = 'ALL';

  async function reports(token) {
    page('보고서', U.loading());
    const desk = await D.desk();
    if (token !== pageToken) return;
    const library = desk?.briefing_sources;
    const records = [];
    (library?.sources || []).forEach((source) => (source.records || []).forEach((record) => {
      if (record?.access === 'INDEX_ONLY' && record.title && /^https:\/\//.test(record.url || '')) records.push({...record, sourceId: String(source.id || ''), sourceLabel: source.label || ''});
    }));
    if (!records.length) { page('보고서', U.empty('보고서 목록을 불러오지 못했어요.')); return; }
    records.sort((a, b) => String(b.published_date || '').localeCompare(String(a.published_date || '')));
    const host = el('div', {});
    const paint = () => {
      const shown = records.filter((record) => reportFilter === 'ALL' || record.sourceId.startsWith(reportFilter)).slice(0, 40);
      host.replaceChildren(shown.length ? el('ul', {class: 'rows'}, shown.map((record) => el('li', {class: 'row'},
        el('a', {class: 'row-main stacked', href: record.url, target: '_blank', rel: 'noopener noreferrer'},
          el('strong', {text: U.plain(record.title)}),
          el('small', {text: [record.sourceLabel, record.published_date, C.ageText(record.published_date)].filter(Boolean).join(', ')}))))) : U.empty('이 기관의 자료가 없어요.'));
    };
    paint();
    page('보고서',
      el('section', {class: 'block'}, U.segmented(INSTITUTIONS, reportFilter, (value) => { reportFilter = value; paint(); }, '기관'), host),
      U.note('제목과 발표일만 모은 목록이에요. 누르면 기관 원문이 새 창으로 열려요. ZERO가 본문을 읽고 검토한 것은 아니에요.'));
  }

  // ---- 주식 공부 ------------------------------------------------------------------------------
  function numberField(label, id, value, unit) {
    return el('label', {class: 'field', for: id}, el('span', {text: label}), el('span', {class: 'field-box'}, el('input', {id, type: 'number', inputmode: 'decimal', min: '0', step: 'any', value}), unit ? el('small', {text: unit}) : null));
  }

  function averageDownCalc() {
    const out = el('div', {class: 'calc-out'});
    const fields = [numberField('가진 주식의 평균 단가', 'ad-p1', '70000', '원'), numberField('가진 수량', 'ad-q1', '10', '주'), numberField('지금 가격', 'ad-p2', '56000', '원'), numberField('더 살 수량', 'ad-q2', '10', '주')];
    const paint = () => {
      const result = C.averageDown(...fields.map((field) => field.querySelector('input').value));
      if (!result) { out.replaceChildren(U.empty('네 칸에 0보다 큰 숫자를 넣어 주세요.')); return; }
      out.replaceChildren(el('dl', {class: 'facts'},
        el('div', {}, el('dt', {text: '새 평균 단가'}), el('dd', {text: C.priceText(result.average, 'KRW')})),
        el('div', {}, el('dt', {text: '더 드는 돈'}), el('dd', {text: C.wonText(result.cost)})),
        el('div', {}, el('dt', {text: '본전까지(지금)'}), el('dd', {text: C.percentText(result.beforeNeeded)})),
        el('div', {}, el('dt', {text: '본전까지(산 뒤)'}), el('dd', {text: C.percentText(result.afterNeeded)}))));
    };
    const block = U.section('물타기 계산기', el('div', {class: 'fields'}, fields), out,
      U.note('더 사면 평균 단가는 내려가지만 그 종목에 묶이는 돈은 늘어요. 가격이 더 내리면 손실도 커져요.'));
    block.addEventListener('input', paint);
    paint();
    return block;
  }

  async function savingsCalc() {
    const desk = await D.desk();
    const charts = (desk?.charts || []).filter((chart) => chart.interval === '1d' && Array.isArray(chart.bars) && chart.bars.length > 40);
    if (!charts.length) return null;
    const names = new Map((desk.companies || []).map((company) => [company.id, company.name]));
    const select = el('select', {id: 'sp-stock', 'aria-label': '종목'}, charts.map((chart) => el('option', {value: chart.id, text: names.get(chart.id) || chart.id})));
    const out = el('div', {class: 'calc-out'});
    const amount = numberField('매달 넣는 돈', 'sp-amount', '100000', ' ');
    const paint = () => {
      const chart = charts.find((item) => item.id === select.value);
      const bars = chart.bars.map((bar) => ({at: String(bar.at || ''), close: C.num(bar.close)}));
      const result = C.savingsPlan(bars, C.num(amount.querySelector('input').value));
      amount.querySelector('small').textContent = chart.currency || '';
      if (!result) { out.replaceChildren(U.empty('금액을 넣어 주세요. 기록이 두 달 이상 있어야 비교할 수 있어요.')); return; }
      const money = (value) => C.cut2(value).toLocaleString('ko-KR') + ' ' + (chart.currency || '');
      const winner = {plan: '이 기간에는 매달 모으는 쪽이 앞섰어요.', lump: '이 기간에는 한 번에 사는 쪽이 앞섰어요.', tie: '두 방법이 비슷했어요.'}[result.winner];
      out.replaceChildren(el('p', {class: 'hero-line', text: winner}), el('dl', {class: 'facts'},
        el('div', {}, el('dt', {text: '넣은 돈(' + result.months + '번)'}), el('dd', {text: money(result.invested)})),
        el('div', {}, el('dt', {text: '매달 모았다면'}), el('dd', {}, money(result.planValue), ' ', U.change(result.planReturn))),
        el('div', {}, el('dt', {text: '한 번에 샀다면'}), el('dd', {}, money(result.lumpValue), ' ', U.change(result.lumpReturn))),
        el('div', {}, el('dt', {text: '평균 산 가격'}), el('dd', {text: money(result.averageCost)}))));
    };
    const block = U.section('주식 모으기 계산기', el('div', {class: 'fields'}, el('label', {class: 'field', for: 'sp-stock'}, el('span', {text: '종목'}), select), amount), out,
      U.note('저장된 일봉을 되돌려 본 결과예요. 수수료, 세금, 배당은 넣지 않았고 소수점 매수를 가정했어요. 앞으로도 같다는 뜻은 아니에요.'));
    block.addEventListener('input', paint);
    paint();
    return block;
  }

  async function study(token) {
    const school = el('section', {class: 'block school'},
      el('h2', {class: 'block-title', text: '주식 입문 학교'}),
      el('p', {}, '매수와 매도부터 ZERO 사용법까지 여섯 단계예요. 단계마다 짧은 설명을 읽고 문제를 풀면 다음 단계가 열려요.'),
      el('p', {class: 'school-state'}, el('strong', {'data-academy': 'lv', text: 'Lv.1'}), el('span', {'data-academy': 'rank', text: '입문 전'}), el('span', {'data-academy': 'xp', text: '0 XP'})),
      el('button', {type: 'button', class: 'button', 'data-open-academy': '', 'data-academy': 'cta', text: '배우기 시작'}));
    page('주식 공부', el('div', {class: 'columns'}, el('div', {class: 'column'}, school, averageDownCalc()), el('div', {class: 'column', id: 'study-savings'}, U.loading())));
    document.dispatchEvent(new CustomEvent('zero-academy-badges'));
    const savings = await savingsCalc();
    if (token !== pageToken) return;
    document.getElementById('study-savings')?.replaceChildren(savings || U.empty('계산에 쓸 가격 기록을 불러오지 못했어요.'));
  }

  // ---- ZERO에게 물어보기 ----------------------------------------------------------------------
  const chat = {messages: [], busy: false, draft: '', status: ''};
  const ERRORS = {
    DIALOGUE_RATE_LIMITED: '오늘 쓸 수 있는 무료 한도를 다 썼거나 요청이 몰렸어요. 잠시 뒤 다시 물어봐 주세요.',
    DIALOGUE_PRIVATE_INPUT: '이메일, 전화번호, 키처럼 보이는 내용은 보낼 수 없어요. 지우고 다시 보내 주세요.',
    DIALOGUE_DISABLED: 'AI 대화가 지금 꺼져 있어요.',
    DIALOGUE_TIMEOUT: '답이 너무 오래 걸려 멈췄어요. 다시 물어봐 주세요.'
  };

  function ask() {
    const base = String(document.querySelector('meta[name="zero-lobby-api"]')?.content || '').trim().replace(/\/+$/, '');
    const log = el('div', {class: 'chat-log', 'aria-live': 'polite'}), status = el('p', {class: 'note', role: 'status'});
    const input = el('input', {type: 'text', maxlength: '300', placeholder: '예: PER이 뭐예요?', 'aria-label': '질문', oninput: () => { chat.draft = input.value; }});
    const send = el('button', {type: 'submit', class: 'button', text: '보내기'});
    const paint = () => {
      log.replaceChildren(...(chat.messages.length ? chat.messages.map((message) => el('p', {class: 'bubble ' + (message.role === 'user' ? 'mine' : 'theirs'), text: message.content}))
        : [U.empty('주식 용어나 ZERO 사용법을 물어보세요. 특정 종목을 사라, 팔라는 답은 하지 않아요.')]));
      log.scrollTop = log.scrollHeight;
      send.disabled = chat.busy || !base;
      if (input.value !== chat.draft) input.value = chat.draft;
      status.textContent = base ? chat.status : '이 화면에서는 AI 대화가 연결돼 있지 않아요. 공개 앱에서 쓸 수 있어요.';
    };
    const submit = async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || chat.busy || !base) return;
      chat.messages.push({role: 'user', content: text});
      chat.busy = true; chat.draft = ''; chat.status = 'AI가 답을 쓰는 중이에요.'; paintChat?.();
      let reply = null, error = 'DIALOGUE_UNAVAILABLE';
      try {
        // 다른 서버 주소 뒤에 붙는 경로라 템플릿 문자열로 쓴다(공개 앱 빌더가 따옴표로 시작하는 경로를 상대 경로로 바꾸기 때문).
        const response = await fetch(`${base}/api/lobby/dialogue`, {method: 'POST', credentials: 'omit', cache: 'no-store', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({persona: 'common', messages: chat.messages.slice(-11), weather: null}), signal: AbortSignal.timeout(30000)});
        const body = await response.json();
        if (response.ok && body?.mode === 'AI' && typeof body.reply === 'string' && body.reply.trim()) reply = body.reply.trim().slice(0, 2000);
        else if (typeof body?.error === 'string') error = body.error;
      } catch (_) { /* 아래에서 실패 안내 */ }
      chat.busy = false;
      if (reply) { chat.messages.push({role: 'assistant', content: reply}); chat.status = ''; }
      else { chat.messages.pop(); if (!chat.draft) chat.draft = text; chat.status = ERRORS[error] || '지금은 답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.'; }
      chat.messages = chat.messages.slice(-12);
      paintChat?.();
    };
    paintChat = paint;
    paint();
    page('ZERO에게 물어보기',
      el('section', {class: 'block'}, log, el('form', {class: 'chat-form', onsubmit: submit}, input, send), status),
      U.note('AI가 만든 답이라 틀릴 수 있어요. 투자 권유가 아니고, 내 계좌나 실제 시세를 조회하지 못해요. 무료 한도 안에서만 동작해서 하루 사용량이 정해져 있어요.'));
  }

  // ---- 설정 -----------------------------------------------------------------------------------
  function settings() {
    const hide = el('button', {type: 'button', class: 'button ghost'});
    const paintHide = () => { hide.textContent = U.amounts.hidden() ? '금액 보이기' : '금액 가리기'; };
    hide.addEventListener('click', () => { U.amounts.toggle(); paintHide(); });
    paintHide();
    page('설정',
      U.section('화면 색', U.segmented([['auto', '기기 설정 따르기'], ['light', '밝게'], ['dark', '어둡게']], U.theme.choice(), (value) => U.theme.set(value), '화면 색')),
      U.section('금액', el('p', {}, '다른 사람과 화면을 볼 때 자산 금액을 가릴 수 있어요. 수익률은 그대로 보여요.'), hide),
      U.section('자료 기준',
        el('p', {}, 'ZERO는 공부와 참고용이에요. 주문을 내지 않고, 투자 권유를 하지 않아요.'),
        el('p', {}, '내 주식은 한국투자증권 모의 계좌 기록으로 만든 1억원 참고 포트폴리오예요.'),
        el('p', {}, '시세와 순위는 공개 자료라 조금 늦을 수 있어요. 값을 확인하지 못한 칸은 비워 두고, 지어내지 않아요.'),
        el('p', {}, '관심 종목, 화면 색, 학교 진도는 이 브라우저에만 저장돼요.')));
  }

  const PAGES = {macro, news, reports, study, ask, settings};
  U.route('more', {
    title: (arg) => (MENU.find(([key]) => key === arg)?.[2]) || '더보기',
    show(arg) {
      const token = ++pageToken;
      paintChat = null;
      return (Object.hasOwn(PAGES, arg) ? PAGES[arg] : menu)(token);
    }
  });
})();
