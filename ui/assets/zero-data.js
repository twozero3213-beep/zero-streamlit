/* 여러 화면이 함께 쓰는 자료 묶음: 내 주식(시세 다시 계산 포함), 지표, 종목 목록.
   각 함수는 실패하면 null을 돌려주고 화면이 빈 상태를 보여 준다. */
(() => {
  'use strict';
  const C = window.ZeroCore, U = window.ZeroUI;

  // 내 주식: 저장된 참고 포트폴리오에 지금 시세를 입힌다. 시세를 못 받으면 저장된 값 그대로.
  async function portfolio() {
    const data = await U.api('api/portfolio', 60);
    const scope = data?.summary?.zero_portfolio;
    if (!scope) return null;
    const ids = (scope.holdings || []).map((row) => row.market + ':' + row.symbol);
    const deadline = performance.now() + 12000;
    let quoteMap = await U.quotes(ids, deadline);
    let liveFx = null;
    if (ids.some((id) => !quoteMap.has(id))) {
      const live = await U.api('api/live-quotes', 15, deadline);
      quoteMap = new Map([...C.liveQuoteMap(live), ...quoteMap]);
      liveFx = C.num(live?.fx?.usd_krw) > 0 && live.fx.market_time ? C.num(live.fx.usd_krw) : null;
    }
    const savedFx = C.num(data.summary.fx?.usd_krw);
    const fx = liveFx || (savedFx > 0 ? savedFx : null);
    const live = C.reprice(scope, quoteMap, fx);
    const view = live || C.savedPortfolio(scope);
    if (!view) return null;
    const times = [...quoteMap.values()].map((quote) => Date.parse(quote.at)).filter(Number.isFinite);
    return {
      ...view,
      live: Boolean(live),
      pricedAt: live && times.length ? new Date(Math.max(...times)).toISOString() : scope.observed_at || null,
      fx, fxLive: Boolean(liveFx), fxAt: liveFx ? null : data.summary.fx?.observed_at || null,
      startAt: scope.start_at || null,
      benchmark: data.benchmark || null,
      targets: data.allocations?.target_percent || null
    };
  }

  const desk = () => U.api('api/desk', 600);
  const research = () => U.api('api/research', 1800);
  const decade = () => U.api('api/decade', 3600);
  const rank = async () => C.validRank(await U.api('api/market-rank', 60));

  // 차트 종가 배열(추세선용).
  async function closes(id, range = '3M') {
    const data = await U.api('api/chart?identity=' + encodeURIComponent(id) + '&range=' + range, 600);
    if (data?.status !== 'AVAILABLE' || !Array.isArray(data.bars)) return null;
    const values = data.bars.map((bar) => C.num(bar.close)).filter((value) => value > 0);
    return values.length >= 2 ? values : null;
  }

  window.ZeroData = {portfolio, desk, research, decade, rank, closes};
})();
