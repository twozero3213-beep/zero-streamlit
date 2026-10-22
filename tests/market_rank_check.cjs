// Pure checks for extras/market-rank.js: malformed data shows nothing, bars are shares of the list's top volume.
const assert = require('node:assert/strict');
const R = require('../extras/market-rank.js');
const item = (code, volume, extra = {}) => ({code, name: '종목' + code, market: 'KOSPI', price: 1000, change_rate: 1.5, volume, ...extra});
const good = {schema_version: 1, scope: 'PUBLIC_MARKET_RANK', orders_authorized: false, amounts_included: false, retrieved_at: '2026-10-22T08:00:00+00:00', failed: [],
  lists: [{market: 'KOSPI', kind: 'VOLUME', items: [item('005930', 200), item('0001A0', 50), item('bad', 1), item('000660', 5, {price: 0}), item('035720', 5, {market: 'ALL'}), item('068270', 1.5)]},
    {market: 'ALL', kind: 'SECRET', items: [item('005930', 1)]}, {market: 'ALL', kind: 'FOREIGN', items: []}]};
const view = R.validRank(good);
assert.deepEqual(view.lists.map((entry) => [entry.market, entry.kind, entry.items.map((row) => row.code)]), [['KOSPI', 'VOLUME', ['005930', '0001A0']]]);
for (const bad of [null, {...good, orders_authorized: true}, {...good, amounts_included: true}, {...good, scope: 'X'}, {...good, retrieved_at: 'x'}, {...good, lists: []}])
  assert.equal(R.validRank(bad), null);
assert.deepEqual(R.barWidths([item('a', 200), item('b', 50), item('c', 0)]), [100, 25, 2]);
assert.deepEqual(R.barWidths([item('a', 0)]), [0]);
assert.deepEqual([0, 1, 2, 3].map(R.medal), ['🥇', '🥈', '🥉', '4']);
console.log('MARKET_RANK_CHECKS_OK');
