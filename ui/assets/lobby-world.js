/* ZERO office rules around pinned javascript-astar: no network, prices, orders or account access. */
(function (make) {
  if (typeof module === 'object' && module.exports) module.exports = make(require('./vendor-astar.js'));
  else window.ZEROLobbyWorld = make({Graph: window.Graph, astar: window.astar});
})(function (search) {
  'use strict';
  const CELL = 4, WIDTH = 160, HEIGHT = 100;
  function createWorld(npcs, space, floor) {
    const grid = Array.from({length: WIDTH / CELL}, (_, x) => Array.from({length: HEIGHT / CELL}, (_, y) =>
      x * CELL <= floor.maxX && (x + 1) * CELL >= floor.minX && y * CELL <= floor.maxY && (y + 1) * CELL >= floor.minY ? 1 : 0));
    const block = (left, top, right, bottom) => grid.forEach((column, x) => column.forEach((_, y) => {
      const px = (x + .5) * CELL, py = (y + .5) * CELL;
      if (px >= left && px <= right && py >= top && py <= bottom) grid[x][y] = 0;
    }));
    block(60, 26, 100, 36); // the meeting table stays in place while people move
    npcs.filter(npc => npc.kind !== 'manager').forEach(npc => {
      const p = npc.home || npc.pos; block(p.x - 3, p.y - 3, p.x + 3, p.y);
    });
    if (space?.props?.includes('coffee')) block(3, 25, 12, 34);
    if (space?.props?.includes('sofa')) block(145, 53, 158, 59);
    return {grid, graph: new search.Graph(grid), floor};
  }
  const cell = p => ({x: Math.max(0, Math.min(39, Math.floor(p.x / CELL))), y: Math.max(0, Math.min(24, Math.floor(p.y / CELL)))});
  function canStand(world, p) {
    const f = world.floor, c = cell(p);
    return p.x >= f.minX && p.x <= f.maxX && p.y >= f.minY && p.y <= f.maxY && world.grid[c.x][c.y] === 1;
  }
  function nearestNode(world, p) {
    const at = cell(p), direct = world.graph.grid[at.x][at.y]; if (!direct.isWall()) return direct;
    let best = null, distance = Infinity;
    world.graph.nodes.forEach(node => {
      if (node.isWall()) return;
      const d = Math.hypot((node.x + .5) * CELL - p.x, (node.y + .5) * CELL - p.y);
      if (d < distance) { best = node; distance = d; }
    });
    return best;
  }
  const point = (world, n) => ({x: Math.max(world.floor.minX, Math.min(world.floor.maxX, (n.x + .5) * CELL)), y: Math.max(world.floor.minY, Math.min(world.floor.maxY, (n.y + .5) * CELL))});
  function route(world, from, to) {
    const start = nearestNode(world, from), end = nearestNode(world, to);
    if (!start || !end) return [];
    const nodes = search.astar.search(world.graph, start, end);
    if (start !== end && !nodes.length) return [];
    const points = [point(world, start), ...nodes.map(n => point(world, n))];
    if (canStand(world, to)) points.push({x: to.x, y: to.y});
    return points.filter((p, index) => {
      const before = index ? points[index - 1] : from, after = points[index + 1];
      if (Math.hypot(p.x - before.x, p.y - before.y) < .01) return false;
      return !after || (p.x - before.x) * (after.y - p.y) !== (p.y - before.y) * (after.x - p.x);
    });
  }
  function rankUsers(rows) {
    const seen = new Set();
    const users = (Array.isArray(rows) ? rows : []).filter(row => {
      if (typeof row?.nick !== 'string' || !/^[0-9A-Za-z_가-힣]{2,12}$/.test(row.nick) || typeof row.return_percent !== 'number' || !Number.isFinite(row.return_percent)) return false;
      const key = row.nick.normalize('NFKC').toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true;
    }).map(row => ({nick: row.nick, percent: row.return_percent, staffCount: Number.isInteger(row.staff_count) && row.staff_count >= 0 ? row.staff_count : null}))
      .sort((a, b) => b.percent - a.percent || a.nick.localeCompare(b.nick, 'ko'));
    let rank = 0; return users.map((row, index) => { if (!index || row.percent !== users[index - 1].percent) rank = index + 1; return {...row, rank}; });
  }
  const DAY_CHAT = {
    morning: ['오늘 커피는 제가 내릴게요.', '아침에 창문을 여니 정신이 좀 드네요.', '오늘은 작은 일부터 하나씩 해 볼래요.', '책상 정리하고 시작하니까 기분이 달라요.', '물 한 잔 마시고 시작할게요.'],
    day: ['점심 먹고 잠깐 걸으니 눈이 덜 피곤해요.', '오늘 점심 메뉴, 아직 고민 중이에요.', '회의 전에 커피 한 잔 어때요?', '잠깐 스트레칭하고 다시 볼게요.', '이어폰을 빼니 사무실 소리가 들리네요.'],
    evening: ['퇴근 전에 책상부터 정리할게요.', '저녁은 집에서 먹을까, 나가서 먹을까?', '오늘도 한 가지씩 배웠네요.', '이제 어깨에 힘을 좀 빼도 되겠어요.', '마지막으로 창밖 한 번 보고 올게요.'],
    night: ['늦은 시간엔 따뜻한 차가 좋더라고요.', '화면에서 눈을 떼고 먼 곳을 잠깐 볼게요.', '내일을 위해 기록은 짧게 정리할래요.', '밤 사무실은 키보드 소리가 더 크게 들리네요.', '커피 대신 물 한 잔 더 마실게요.']
  };
  function chooseChatter(logic, context, persona, recent, rng = Math.random) {
    const parts = logic.kstParts(context.now || new Date());
    const phase = logic.daypart(parts.hour), extras = DAY_CHAT[phase] || DAY_CHAT.day;
    const study = context.level >= 7 ? ['학교를 졸업했네요! 숫자의 출처도 잊지 마세요.'] : context.level > 1 ? ['퀴즈를 하나씩 풀면 모르는 말이 줄어들어요.', '오늘 배운 내용을 다음 설명에서 써 봐요.'] : ['주식이 처음이면 입문 학교부터 같이 시작해요.', '매수는 사기, 매도는 팔기예요. 학교에서 연습해 봐요.'];
    const pool = [...new Set([...logic.timeLines(parts), ...logic.dayLines(parts), ...logic.weatherLines(context.weather), ...persona, ...extras, ...study])];
    const holiday = logic.holidayNote(context.now || new Date(), context.holidays || logic.KR_HOLIDAYS); if (holiday) pool.push(holiday);
    const fresh = pool.filter(line => !recent.includes(line)), choices = fresh.length ? fresh : pool;
    return choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
  }
  function chatReply(text, recent, rng = Math.random) {
    const pool = /커피|차|음료|물 한 잔/.test(text) ? ['저는 따뜻한 걸로 부탁해요.', '저도 한 잔 같이 마실래요.', '마시고 잠깐 쉬었다 와요.'] : /점심|저녁|메뉴|먹/.test(text) ? ['저는 오늘 국밥이 당겨요.', '먹고 산책까지 하면 좋겠어요.', '메뉴 정하면 저도 불러 주세요.'] : /학교|퀴즈|매수|배운/.test(text) ? ['모르면 다시 읽고 풀어도 괜찮아요.', '맞힌 이유까지 알아야 오래 기억나요.', '다음 레벨도 같이 해 봐요.'] : ['좋아요, 천천히 해 봐요.', '저도 잠깐 쉬었다가 이어갈게요.', '이야기하니 분위기가 좀 풀리네요.', '오늘도 한 가지씩 해 나가요.'];
    const fresh = pool.filter(line => !recent.includes(line)), choices = fresh.length ? fresh : pool;
    return choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
  }
  return {CELL, createWorld, canStand, route, rankUsers, chooseChatter, chatReply};
});
