/* Reference outlook for an economic indicator: how often the next release came out higher or lower than the
   previous one in the saved history, as a two-sided lean (for example 51 : 49) with a scenario for each side.
   It counts what already happened; it is not a forecast, never 100%, and the page says so next to the numbers. */
(() => {
  'use strict';
  const MIN_MOVES = 12, MIN_CONDITIONAL = 12, FLOOR = 5;
  const sign = (value) => value > 0 ? 1 : value < 0 ? -1 : 0;

  // history: [{period, value}] oldest first. Returns null when fewer than 12 real up/down moves exist.
  function outlook(history) {
    const values = (Array.isArray(history) ? history : []).map((row) => row?.value).filter((value) => typeof value === 'number' || typeof value === 'string' && value.trim() !== '').map(Number).filter(Number.isFinite);
    const moves = values.slice(1).map((value, index) => sign(value - values[index]));
    const real = moves.filter(Boolean);
    if (real.length < MIN_MOVES) return null;
    const last = [...moves].reverse().find(Boolean);
    // After a rise (or a fall) what came next? Used when that situation has enough examples; else every move counts.
    const following = moves.slice(1).filter((move, index) => move !== 0 && moves[index] === last);
    const conditional = following.length >= MIN_CONDITIONAL;
    const sample = conditional ? following : real, ups = sample.filter((move) => move > 0).length;
    // Laplace smoothing keeps a short sample from claiming certainty.
    const up = Math.min(100 - FLOOR, Math.max(FLOOR, Math.round((ups + 1) / (sample.length + 2) * 100)));
    return {up, down: 100 - up, sample: sample.length, ups, basis: conditional ? (last > 0 ? 'AFTER_RISE' : 'AFTER_FALL') : 'ALL_MOVES', last, lean: up === 50 ? 'EVEN' : up > 50 ? 'UP' : 'DOWN'};
  }
  const BASIS = {AFTER_RISE: '직전 발표가 올랐던 경우', AFTER_FALL: '직전 발표가 내렸던 경우', ALL_MOVES: '모든 발표'};
  const DISCLAIMER = '이 숫자는 과거 발표들이 직전보다 올랐는지 내렸는지를 센 빈도예요. 앞날을 맞히는 예측이 아니고, 100% 맞는 예측은 없어요. 실제 결과는 반대로 나올 수 있으니 투자 판단의 근거로 쓰지 마세요.';

  function describe(result, item) {
    if (!result) return {headline: '과거 기록이 짧아(오르내림 12회 미만) 참고 시나리오를 만들지 않아요.', lines: [], disclaimer: DISCLAIMER};
    const side = result.lean === 'UP' ? '높게' : result.lean === 'DOWN' ? '낮게' : null, lead = Math.max(result.up, result.down);
    // The leading side is named first, so a split can never be read the wrong way round.
    const split = result.lean === 'DOWN' ? '낮게 ' + result.down + '% 대 높게 ' + result.up + '%' : '높게 ' + result.up + '% 대 낮게 ' + result.down + '%';
    return {
      headline: side ? '다음 발표는 직전보다 ' + side + ' 나온 쪽이 ' + (lead < 56 ? '근소하게 ' : '') + '더 많았어요 · ' + split : '높게·낮게 나온 횟수가 거의 같았어요 · ' + split,
      lines: [
        ['높게 나오면 (' + result.up + '%)', String(item?.above_range || '높을 때 확인할 점이 아직 정리되지 않았어요.')],
        ['낮게 나오면 (' + result.down + '%)', String(item?.below_range || '낮을 때 확인할 점이 아직 정리되지 않았어요.')]
      ],
      basis: '근거 · ' + BASIS[result.basis] + ' ' + result.sample + '번 중 ' + result.ups + '번이 직전보다 높았어요(적은 표본의 쏠림을 줄이려 보정). ' + (lead >= 60 ? '' : '두 쪽의 차이가 작아 방향을 믿을 만한 정도는 아니에요.'),
      disclaimer: DISCLAIMER
    };
  }
  const api = {outlook, describe, DISCLAIMER};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ZEROOutlook = api;
  if (typeof document === 'undefined') return;

  api.render = (item) => {
    const info = describe(outlook(item?.history), item), box = document.createElement('section'); box.className = 'outlook';
    const add = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; element.textContent = text; box.append(element); return element; };
    add('h3', '', '다음 발표, 어느 쪽이 더 많았을까?'); add('p', 'outlook-head', info.headline);
    info.lines.forEach(([title, text]) => { const row = document.createElement('div'); row.className = 'outlook-row'; const strong = document.createElement('strong'); strong.textContent = title; const span = document.createElement('span'); span.textContent = text; row.append(strong, span); box.append(row); });
    if (info.basis) add('p', 'muted-note', info.basis);
    add('p', 'outlook-warn', '⚠ ' + info.disclaimer);
    return box;
  };
})();
