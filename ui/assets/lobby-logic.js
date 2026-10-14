/* Pure logic of the ZERO office home screen: Korean clock, holidays, weather phrases, chatter, replies,
   movement and layout. No DOM and no network here, so every rule is unit-testable in Node. */
(() => {
  'use strict';
  const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Reference table used when the public holiday API is unreachable (substitute holidays included).
  const KR_HOLIDAYS = new Set(['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25',
    '2026-06-03', '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25']);
  const STAGE = {w: 160, h: 100};
  const clock = new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'});

  function kstParts(date) {
    const p = Object.fromEntries(clock.formatToParts(date).map((part) => [part.type, part.value]));
    return {date: p.year + '-' + p.month + '-' + p.day, hour: Number(p.hour), minute: Number(p.minute), weekday: WEEKDAY.indexOf(p.weekday)};
  }
  const shiftDay = (day, offset) => new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  const weekdayOf = (day) => new Date(Date.parse(day + 'T00:00:00Z')).getUTCDay();
  const isRestDay = (day, holidays = KR_HOLIDAYS) => weekdayOf(day) === 0 || weekdayOf(day) === 6 || holidays.has(day);

  // "Tomorrow is a holiday" style note, or null when nothing is worth saying.
  function holidayNote(now, holidays = KR_HOLIDAYS) {
    const today = kstParts(now).date;
    if (isRestDay(today, holidays)) return holidays.has(today) ? '오늘은 공휴일인데도 나와서 일하는 중이에요.' : '주말에도 나와 있다니, 우리 정말 열심이네요.';
    if (!isRestDay(shiftDay(today, 1), holidays)) return null;
    let run = 0;
    while (isRestDay(shiftDay(today, 1 + run), holidays) && run < 10) run++;
    return run >= 3 ? '내일부터 ' + run + '일 연휴예요! 연휴 전에 자료부터 정리해요.' : '내일은 쉬는 날이에요. 오늘만 버티면 돼요.';
  }

  function weatherKind(code) {
    if (!Number.isFinite(code)) return null;
    if (code === 0) return 'clear';
    if (code <= 3) return 'cloud';
    if (code <= 48) return 'fog';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if (code >= 71 && code <= 77) return 'snow';
    if (code >= 95) return 'storm';
    return null;
  }
  function weatherLines(weather) {
    const kind = weatherKind(weather?.code), temp = Number(weather?.temp), lines = [];
    const text = {clear: ['창밖 하늘이 맑아요. 점심에 산책 어때요?', '날씨가 좋아서 기분까지 맑아져요.'], cloud: ['구름이 많아서 하늘이 조금 무거워 보여요.'], fog: ['안개가 껴서 창밖이 뿌옇네요. 운전 조심하세요.'],
      rain: ['비가 오네요. 우산 챙기셨어요?', '빗소리 들으면서 일하니 커피가 더 당겨요.'], snow: ['눈이 와요! 퇴근길 미끄러우니 조심하세요.'], storm: ['밖에 천둥이 쳐요. 오늘은 일찍 들어가는 게 좋겠어요.']}[kind] || [];
    lines.push(...text);
    if (Number.isFinite(temp)) {
      if (temp >= 29) lines.push('지금 서울 ' + Math.round(temp) + '도래요. 시원한 아이스 음료가 필요해요.');
      else if (temp <= 3) lines.push('지금 서울 ' + Math.round(temp) + '도래요. 따뜻한 커피가 간절해요.');
      else lines.push('지금 서울 기온은 ' + Math.round(temp) + '도예요.');
    }
    return lines;
  }
  function timeLines(parts) {
    const h = parts.hour;
    if (h < 6 || h >= 23) return ['새벽 야근도 로그가 쌓이네요. 마지막 커밋은 “휴식” 어때요?', '늦게까지 애썼어요. 오늘 다 끝내지 못해도 괜찮아요.', '모니터는 밤새 켜져도 우리는 쉬어도 돼요.', '혼자 버티는 기분이 들면 잠깐 말 걸어요. 여기서 함께 쉬어가요.'];
    if (h < 9) return ['커피는 개장했는데 제 눈은 아직 휴장 중이에요.', '잠이 덜 깼다면 작은 일부터 차분히 시작해도 괜찮아요.', '오늘도 출근한 나에게 작은 박수부터 보내요.'];
    if (h < 11) return ['오전 자료부터 차분히 확인해요.', '출근하자마자 모든 걸 해낼 필요는 없어요.', '오늘 목표는 완벽보다 한 걸음이에요.'];
    if (h < 12) return ['점심 메뉴 회의가 오늘 제일 뜨거운 안건이네요.', '배고픈 마음은 분산투자가 안 되네요. 국밥 쪽으로 몰렸어요.'];
    if (h < 15) return ['점심 뒤 눈꺼풀이 잠깐 조정장에 들어갔어요.', '식후에는 졸릴 수도 있죠. 잠깐 쉬어가도 괜찮아요.', '오전에도 많이 애썼어요. 물 한 모금 하고 천천히 이어가요.', '밥은 잘 먹었는데 집중력은 아직 복귀 중이에요.'];
    if (h < 18) return ['오후의 작은 진전도 진전이에요. 오늘 한 걸 기억해요.', '제 집중력도 잠깐 거래 중단이네요. 쉬었다 재개할게요.', '막힌 일은 잠시 내려놓고 같이 한 줄부터 볼까요?'];
    if (h < 20) return ['오늘 해낸 일이 작아 보여도 수고한 건 사라지지 않아요.', '퇴근 전에 마음의 미결 주문부터 취소할래요.', '저녁은 성과급 없어도 맛있게 먹을 수 있어요.'];
    return ['늦게까지 고생했어요. 남은 일보다 지금의 나도 중요해요.', '미국장은 열리지만 제 배터리는 마감할 수 있어요.', '오늘의 마지막 업무는 나에게 “수고했어”라고 말하기예요.'];
  }
  function trendLines(rows) {
    const sensitive = /사망|사고|재난|테러|전쟁|학대|성폭력|자살|살인|실종|구속|체포|혐의|피해|혈당|당뇨|암환자/;
    return (Array.isArray(rows) ? rows : []).filter(row => typeof row?.keyword === 'string' && row.keyword.length <= 48 && !/[<>\x00-\x1f]/.test(row.keyword) && !sensitive.test(row.keyword)).slice(0, 5).flatMap(row => [
      '검색창에는 “' + row.keyword + '” 얘기가 보이네요. 제 관심 키워드는 “퇴근”인데요.',
      '“' + row.keyword + '”도 궁금하지만 커피가 식기 전에 잠깐 이야기해요.'
    ]);
  }
  function appearanceAt(index) {
    const i = Math.max(0, Math.floor(index));
    return {outfit: ['suit', 'vest', 'cardigan', 'hoodie', 'shirt', 'jacket', 'knit', 'polo'][i % 8],
      color: ['#385986', '#a75649', '#387c74', '#936932', '#755d95', '#577389', '#776653', '#668341'][Math.floor(i / 8) % 8],
      skin: ['#edc5a4', '#c58e68', '#f3d9bd', '#a87555', '#d8a77d', '#926248', '#deb798'][i % 7],
      hair: ['#343a40', '#73533c', '#292f3b', '#9a7852', '#b5aba0', '#563c37', '#565d65'][Math.floor(i / 7) % 7],
      hairStyle: i % 4, pattern: Math.floor(i / 16) % 3};
  }
  const hour12 = (h) => (h % 12) || 12, ampm = (h) => h < 12 ? '오전' : '오후';
  // Lines that name the real Korean date and clock, so the office visibly lives on the visitor's calendar.
  function dayLines(parts) {
    const names = ['일', '월', '화', '수', '목', '금', '토'], [, month, day] = parts.date.split('-').map(Number), lines = [];
    lines.push('지금 ' + ampm(parts.hour) + ' ' + hour12(parts.hour) + '시 ' + String(parts.minute).padStart(2, '0') + '분이에요.', '오늘은 ' + month + '월 ' + day + '일 ' + names[parts.weekday] + '요일이네요.');
    if (parts.weekday === 1 && parts.hour < 14) lines.push('월요일 아침은 언제나 힘들어요…', '월요병이 아직 안 풀렸어요.');
    if (parts.weekday === 5) lines.push('드디어 금요일이에요!', parts.hour >= 15 ? '불금이에요, 오늘은 일찍 마무리해요.' : '오늘만 지나면 주말이에요.');
    if (parts.weekday === 0 || parts.weekday === 6) lines.push('주말엔 느긋하게 자료를 읽어요.');
    if (parts.weekday === 3) lines.push('수요일이라 한 주의 반이 지났어요.');
    if (month === 12) lines.push('벌써 연말 분위기가 나요.'); if (month >= 3 && month <= 5) lines.push('봄이라 창밖이 환해요.'); if (month >= 6 && month <= 8) lines.push('여름이라 에어컨이 필수예요.'); if (month >= 9 && month <= 11) lines.push('가을이라 커피가 더 맛있어요.');
    return lines;
  }
  // Short answers a neighbour gives, so two staff can hold a tiny conversation.
  const REPLIES = ['맞아요, 저도 그렇게 생각해요.', '그러게요, 하하.', '저도요! 완전 공감이에요.', '오, 그렇군요.', '맞다, 그 얘기 들었어요.', '그럼요, 커피 한 잔 해요.', '어머, 정말요?', '흠, 저는 조금 다르게 봐요.'];
  const replyLine = (rng = Math.random) => REPLIES[Math.min(REPLIES.length - 1, Math.floor(rng() * REPLIES.length))];
  // Faces: 7 eye styles x 7 mouths = 49 distinct expressions; personas pin a matching pair.
  const FACE_EYES = 7, FACE_MOUTHS = 7;
  const faceAt = (index) => ({eyes: ((index % FACE_EYES) + FACE_EYES) % FACE_EYES, mouth: (Math.floor(index / FACE_EYES) + index) % FACE_MOUTHS});
  const PERSONAS = {
    '낙천적': {face: {eyes: 1, mouth: 1}, lines: ['오늘도 잘 될 거예요!', '좋게 생각하면 다 좋아요.', '일단 웃고 시작해요 ㅎㅎ']},
    '꼼꼼함': {face: {eyes: 0, mouth: 3}, lines: ['한 번 더 검토해 볼게요.', '숫자를 하나씩 대조 중이에요.', '출처 먼저 확인할게요.']},
    '장난꾸러기': {face: {eyes: 3, mouth: 5}, lines: ['퀴즈 하나 낼까요?', '방금 농담인데 웃어 주세요 ㅋㅋ', '심심한데 내기할래요?']},
    '차분함': {face: {eyes: 4, mouth: 2}, lines: ['서두르지 말고 차분히 봐요.', '숨 한 번 쉬고 갈게요.', '천천히 해도 괜찮아요.']},
    '열정적': {face: {eyes: 5, mouth: 4}, lines: ['오늘 안에 끝내 봐요!', '이건 꼭 해보고 싶어요!', '에너지가 넘쳐요!']},
    '졸림': {face: {eyes: 2, mouth: 6}, lines: ['커피… 커피가 필요해요…', '눈이 자꾸 감겨요 ㅠㅠ', '5분만 쉬고 올게요.']},
    '호기심': {face: {eyes: 6, mouth: 0}, lines: ['이건 왜 이럴까요? 궁금해요!', '새로 알게 된 게 있어요.', '질문 하나만 해도 돼요?']}
  };
  const PERSONA_NAMES = Object.keys(PERSONAS);
  const SPACE = {floor: ['wood', 'gray', 'mint', 'sand'], wall: ['sky', 'peach', 'lavender', 'white'], props: ['plant', 'coffee', 'sofa', 'books', 'fish', 'poster', 'clock']};
  const SPACE_NAMES = {floor: {wood: '원목', gray: '회색', mint: '민트', sand: '모래'}, wall: {sky: '하늘', peach: '복숭아', lavender: '라벤더', white: '하양'}, props: {plant: '화분', coffee: '커피머신', sofa: '소파', books: '책장', fish: '어항', poster: '포스터', clock: '시계'}};
  const DEFAULT_SPACE = {floor: 'wood', wall: 'sky', props: ['plant', 'coffee']};
  const daypart = (hour) => hour >= 6 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'evening' : 'night';
  const PERSONA = {
    ZERO_FINAL_MANAGER: ['오늘 근거 목록을 정리하는 중이에요.', '제출된 자료와 아직 없는 자료를 구분해서 보고 있어요.'],
    GREENBLATT: ['이 회사 이익에 비해 가격이 어떤지 살펴보고 있어요.', '숫자 하나로 싸다고 단정하지 않으려고 해요.'],
    THORP: ['낙폭 기준 표를 다시 점검하고 있어요.', '근거 없는 확률은 쓰지 않는 게 원칙이에요.'],
    BOGLE: ['수수료와 세금이 수익에 주는 영향을 보고 있어요.', '비용은 확실한 숫자라서 먼저 봐요.'],
    WALL_STREET_CHIEF_ANALYST: ['금리와 환율이 기업에 주는 영향을 연결해 보고 있어요.'],
    QUANT_RESEARCH_CHIEF: ['가설이 우연이 아닌지 검증 중이에요.', '백테스트 결과를 곧이곧대로 믿지 않아요.'],
    GLOBAL_MACRO_CHIEF: ['오늘 나온 경제 지표를 확인하고 있어요.', '금리 발표 일정부터 체크해요.'],
    PORTFOLIO_CONSTRUCTION_CHIEF: ['중복 투자가 없는지 비중표를 보고 있어요.'],
    EXECUTION_OPERATIONS_CHIEF: ['모의 계좌 체결 기록을 대조 중이에요. 실제 주문은 없어요.'],
    DATA_ENGINEERING_CHIEF: ['데이터가 언제 공개됐는지 날짜부터 확인해요.', '수집 파이프라인이 잘 도는지 점검 중이에요.'],
    MODEL_VALIDATION_CHIEF: ['다른 사람이 만든 결과를 일부러 의심해 보는 중이에요.'],
    PRODUCT_QUALITY_TEAM: ['버튼이 손가락으로 누르기 충분히 큰지 재고 있어요.', '화면이 폰에서도 잘 보이는지 확인 중이에요.']
  };
  const GENERIC = ['커피 한 잔만 더 마시고 올게요.', '오늘 기록은 오늘 정리해요.', '모르는 건 모른다고 적는 게 우리 규칙이에요.', '여기 사무실 분위기 좋죠?', '근거가 없으면 판단을 미뤄요.'];

  // Candidate pool for one chat bubble; `rng` returns [0,1) so tests can pin the result.
  function chatterLine(context, persona, rng = Math.random) {
    const now = context.now || new Date(), parts = kstParts(now), pool = [];
    pool.push(...timeLines(parts), ...timeLines(parts), ...dayLines(parts));
    pool.push(...weatherLines(context.weather));
    const note = holidayNote(now, context.holidays || KR_HOLIDAYS);
    if (note) pool.push(note, note);
    if (persona?.length) pool.push(...persona, ...persona);
    pool.push(...GENERIC);
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  }
  const personaFor = (department) => PERSONA[department] || [];

  // A speaker that is idle and far enough from every active speaker, so bubbles never overlap.
  function pickSpeaker(candidates, active, minDistance, rng = Math.random) {
    const ok = candidates.filter((npc) => !active.some((other) => other.id === npc.id || Math.hypot(other.pos.x - npc.pos.x, other.pos.y - npc.pos.y) < minDistance));
    return ok.length ? ok[Math.min(ok.length - 1, Math.floor(rng() * ok.length))] : null;
  }

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  function moveToward(pos, target, distance) {
    const dx = target.x - pos.x, dy = target.y - pos.y, length = Math.hypot(dx, dy);
    return length <= distance ? {x: target.x, y: target.y, arrived: true} : {x: pos.x + dx / length * distance, y: pos.y + dy / length * distance, arrived: false};
  }
  const KEY_VECTOR = {ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0], ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1]};
  function keyDirection(keys) {
    let x = 0, y = 0;
    for (const key of keys) { const v = KEY_VECTOR[key]; if (v) { x += v[0]; y += v[1]; } }
    const length = Math.hypot(x, y);
    return length ? {x: x / length, y: y / length} : null;
  }
  const FLOOR = {minX: 3, maxX: STAGE.w - 3, minY: 20, maxY: STAGE.h - 3};
  const clampToFloor = (pos) => ({x: clamp(pos.x, FLOOR.minX, FLOOR.maxX), y: clamp(pos.y, FLOOR.minY, FLOOR.maxY)});
  const nearest = (npcs, pos, radius) => npcs.reduce((best, npc) => { const d = Math.hypot(npc.pos.x - pos.x, npc.pos.y - pos.y); return d <= radius && (!best || d < best.d) ? {npc, d} : best; }, null)?.npc || null;

  // ZERO's own roster: manager at the top, ten departments in two rows of five pods, product staff beside the manager.
  const POD_X = [16, 48, 80, 112, 144], POD_Y = [44, 76];
  const STAFF_OFFSET = [[-9, 7], [9, 7], [-9, 14], [9, 14], [0, 13], [-17, 7], [17, 7], [-17, 14], [17, 14], [0, 19]];
  function layoutZero(chiefs, staffByChief, product) {
    const spots = new Map();
    spots.set('manager', {x: 80, y: 27});
    chiefs.forEach((id, index) => {
      const x = POD_X[index % 5], y = POD_Y[Math.floor(index / 5)];
      spots.set(id, {x, y});
      (staffByChief[id] || []).slice(0, STAFF_OFFSET.length).forEach((staffId, n) => spots.set(staffId, {x: x + STAFF_OFFSET[n][0], y: y + STAFF_OFFSET[n][1]}));
    });
    const productX = [26, 42, 118, 134];
    product.slice(0, 4).forEach((id, n) => spots.set(id, {x: productX[n], y: 27}));
    return spots;
  }
  // A user's own company: team pods spread evenly across the floor (up to 4 per row), the leader in front of each pod.
  function layoutTeams(chiefs, staffByChief) {
    const spots = new Map(), columns = Math.min(4, Math.max(1, chiefs.length)), rows = Math.ceil(chiefs.length / columns);
    chiefs.forEach((id, index) => {
      const column = index % columns, row = Math.floor(index / columns), inRow = Math.min(columns, chiefs.length - row * columns);
      const x = 160 * (column + 1) / (inRow + 1), y = rows === 1 ? 46 : 38 + row * 34;
      spots.set(id, {x, y});
      (staffByChief[id] || []).slice(0, STAFF_OFFSET.length).forEach((staffId, n) => spots.set(staffId, {x: x + STAFF_OFFSET[n][0], y: y + STAFF_OFFSET[n][1]}));
    });
    return spots;
  }
  // Anonymous visit layout: N identical workers on a grid of up to eight columns.
  function layoutGrid(count) {
    const columns = Math.min(8, Math.max(1, count)), gap = columns > 1 ? 128 / (columns - 1) : 0, start = columns > 1 ? 16 : 80;
    const rows = Math.ceil(count / columns), rowGap = rows > 1 ? Math.min(16, 50 / (rows - 1)) : 0;
    return Array.from({length: count}, (_, i) => ({x: start + (i % columns) * gap, y: 44 + Math.floor(i / columns) * rowGap}));
  }

  const SYSTEM_TEXT = 'ZERO는 1억원으로 시작한 "가상 참고 포트폴리오"를 보여 주고, 주식·경제·뉴스 자료를 쉽게 읽게 돕는 시스템이에요. 계좌에서 실제 주문을 내지 않고(모의 계좌 기준), 근거가 없는 숫자는 "미확인"이라고 적어요. 위쪽 전광판은 속보, 아래 메뉴는 내 자산·주식 탐색·뉴스·경제 지표예요.';
  // Scripted (not AI) answers: keyword routing over the department's real mandate text.
  function reply(npc, input, context = {}) {
    const text = String(input || '').trim(), has = (re) => re.test(text);
    const who = npc.name + '입니다. ';
    if (!text) return '궁금한 걸 물어보세요. 아래 질문 버튼을 눌러도 돼요.';
    if (has(/(사도|사야|살까|살래|팔까|팔아|팔래|매수|매도|종목|추천|투자해|오를|떨어질|수익 나)/)) return '저는 가상의 직원이라 투자 권유나 매수·매도 판단은 하지 않아요. 제 담당 자료는 "' + npc.mandate + '"까지예요. 숫자를 읽는 법은 알려 드릴게요.';
    if (has(/(제로|ZERO|시스템|튜토리얼|설명|뭐하는 곳|여긴)/i)) return npc.id === 'ZERO_FINAL_MANAGER' ? SYSTEM_TEXT : who + SYSTEM_TEXT.split('. ')[0] + '. 제 역할은 "' + npc.role + '"예요.';
    if (has(/(일 맡|맡기|요청|부탁)/)) return '일을 맡기려면 위 메뉴의 "ZERO 팀" 화면에서 저를 골라 요청서를 남기면 돼요. 제출 기록은 그곳에 남고, 결과가 없으면 "아직 없음"으로 보여 드려요.';
    if (has(/(날씨|비|눈|덥|춥)/)) return weatherLines(context.weather)[0] || '창밖 날씨를 아직 못 불러왔어요.';
    if (has(/(점심|배고|커피|밥|저녁)/)) return timeLines(kstParts(context.now || new Date()))[0];
    if (has(/(오늘|지금|요즘|뭐해|근황)/)) return (personaFor(npc.department)[0] || GENERIC[0]) + ' (정해진 대본 속 대화예요.)';
    if (has(/(뭐|무슨|역할|업무|담당|누구|맡)/)) return who + npc.role + '. ' + npc.mandate;
    return '그건 제가 답할 근거가 없어요. 제 담당은 "' + npc.mandate + '"예요. 질문 버튼을 눌러 보세요.';
  }
  const TOPICS = [['무슨 일을 하세요?', '무슨 일을 하세요'], ['오늘은 뭘 하고 있어요?', '오늘 뭐해요'], ['ZERO가 뭐예요?', 'ZERO 시스템 설명'], ['일을 맡기려면요?', '일 맡기기'], ['날씨는요?', '날씨'], ['점심 뭐 먹죠?', '점심']];

  // First-time guide: each step names what the visitor must do and how it is detected.
  const TUTORIAL = [
    {id: 'move', title: '1. 걸어 보기', text: '방향키·WASD, 화면 방향 버튼, 또는 바닥을 눌러 내 캐릭터를 움직여 보세요.'},
    {id: 'manager', title: '2. 총괄과 대화', text: '맨 위 가운데 "총괄 관리자"를 눌러 ZERO가 무엇인지 물어보세요.'},
    {id: 'chief', title: '3. 수석에게 묻기', text: '큰 캐릭터(수석) 아무나 눌러 "무슨 일을 하세요?"를 물어보세요.'},
    {id: 'board', title: '4. 전광판 보기', text: '위 전광판의 속보를 눌러 보세요. 정치·경제 분야의 공신력 있는 기관 기사만 모아요.'},
    {id: 'done', title: '5. 길잡이 끝', text: '주식이 처음이라면 "주식 입문 학교"에서 문제를 풀며 레벨을 올려 보세요. 메뉴에서 내 자산·주식 탐색·뉴스·경제 지표도 열어 볼 수 있어요. 이 길잡이는 "사무실 길잡이" 버튼으로 다시 볼 수 있어요.'}
  ];

  const api = {STAGE, FLOOR, KR_HOLIDAYS, kstParts, shiftDay, isRestDay, holidayNote, weatherKind, weatherLines, timeLines, trendLines, appearanceAt, chatterLine, personaFor, pickSpeaker, clamp,
    moveToward, keyDirection, clampToFloor, nearest, layoutZero, layoutTeams, layoutGrid, reply, TOPICS, TUTORIAL, SYSTEM_TEXT,
    dayLines, replyLine, faceAt, PERSONAS, PERSONA_NAMES, FACE_EYES, FACE_MOUTHS, SPACE, SPACE_NAMES, DEFAULT_SPACE, daypart};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ZEROLobbyLogic = api;
})();
