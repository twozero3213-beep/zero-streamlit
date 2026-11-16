/* 여러 화면이 함께 쓰는 자료 묶음: 내 주식(시세 다시 계산 포함), 지표, 종목 목록.
   각 함수는 실패하면 null을 돌려주고 화면이 빈 상태를 보여 준다. */
(() => {
  'use strict';
  const C = window.ZeroCore, U = window.ZeroUI;

  // 내 주식: 저장된 참고 포트폴리오에 지금 시세를 입힌다. 시세를 못 받으면 저장된 값 그대로.
  // 지난번 보유 종목을 기억해 두었다가 포트폴리오를 받는 동안 시세를 함께 요청한다(두 요청이 줄 서지 않게).
  const HOLDINGS_KEY = 'zero-holding-ids';
  const IDENTITY = /^(KR:[0-9A-Z]{6}|US:[A-Z][A-Z0-9.-]{0,14})$/;

  async function portfolio(onSaved) {
    const deadline = performance.now() + 12000;
    const remembered = U.store.get(HOLDINGS_KEY, null);
    const known = Array.isArray(remembered) && remembered.length && remembered.length <= 60 && remembered.every((id) => IDENTITY.test(id)) ? remembered : null;
    const early = known ? U.quotes(known, deadline) : null;
    const data = await U.api('api/portfolio', 60, deadline);
    const scope = data?.summary?.zero_portfolio;
    if (!scope || performance.now() >= deadline) return null;
    const ids = (scope.holdings || []).map((row) => row.market + ':' + row.symbol);
    const saved = C.savedPortfolio(scope), savedFx = C.num(data.summary.fx?.usd_krw);
    const stored = {
      ...saved, live: false, pricedAt: scope.observed_at || null,
      fx: savedFx > 0 ? savedFx : null, fxLive: false, fxAt: data.summary.fx?.observed_at || null,
      startAt: scope.start_at || null, benchmark: data.benchmark || null, targets: data.allocations?.target_percent || null
    };
    if (saved) onSaved?.(stored);
    U.store.set(HOLDINGS_KEY, ids);
    let quoteMap = early && known.join() === ids.join() ? await early : await U.quotes(ids, deadline);
    let liveFx = null;
    if (ids.some((id) => !quoteMap.has(id))) {
      const live = await U.api('api/live-quotes', 15, deadline);
      quoteMap = new Map([...C.liveQuoteMap(live), ...quoteMap]);
      liveFx = C.num(live?.fx?.usd_krw) > 0 && live.fx.market_time ? C.num(live.fx.usd_krw) : null;
    }
    const fx = liveFx || stored.fx;
    const live = C.reprice(scope, quoteMap, fx);
    const view = live || saved;
    if (!view) return null;
    const times = [...quoteMap.values()].map((quote) => Date.parse(quote.at)).filter(Number.isFinite);
    return {
      ...stored, ...view,
      live: Boolean(live),
      pricedAt: live && times.length ? new Date(Math.max(...times)).toISOString() : scope.observed_at || null,
      fx: live ? fx : stored.fx, fxLive: Boolean(live && liveFx), fxAt: live && liveFx ? null : stored.fxAt
    };
  }

  const desk = () => U.api('api/desk', 600);
  const research = () => U.api('api/research', 1800);
  const decade = () => U.api('api/decade', 3600);
  const rank = async () => C.validRank(await U.api('api/market-rank', 60));
  // 공개 자료의 수집 상태와 소유자 사이트의 저장본을 화면에서 구분한다.
  const premarket = () => U.api('api/premarket', 300);
  const governance = () => U.api('api/governance', 120);
  let ownershipCompaniesRequest = null, ownershipCompaniesStamp = null, ownershipCompaniesLoaded = false;
  function ownershipStamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
    if (new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
    return new Date(value).toISOString();
  }
  async function ownershipCompanies(asOf) {
    const stamp = ownershipStamp(asOf);
    if (stamp && (!ownershipCompaniesStamp || stamp > ownershipCompaniesStamp)) {
      ownershipCompaniesStamp = stamp;
      ownershipCompaniesRequest = null;
      U.forget('api/ownership/companies');
    }
    if (!ownershipCompaniesRequest) ownershipCompaniesRequest = U.api('api/ownership/companies', 3600);
    const request = ownershipCompaniesRequest, data = await request;
    if (ownershipCompaniesRequest !== request) return null;
    const valid = data?.scope === 'OWNERSHIP_COMPANIES' && Array.isArray(data.companies) && data.companies.length
      && data.companies.every((company) => typeof company?.stock_code === 'string' && /^[0-9A-Z]{6}$/.test(company.stock_code) && typeof company.company === 'string' && company.company.trim());
    // 구형 명부는 첫 조회만 허용하고, 바뀐 기준은 중계 서버의 옛 캐시와 구별한다.
    const matches = !ownershipCompaniesStamp || ownershipStamp(data?.registry_as_of) === ownershipCompaniesStamp
      || !ownershipCompaniesLoaded && data?.registry_as_of == null;
    if (!valid || !matches) {
      ownershipCompaniesRequest = null;
      U.forget('api/ownership/companies');
      return null;
    }
    ownershipCompaniesLoaded = true;
    return data;
  }


  // 차트 종가 배열(추세선용).
  async function closes(id, range = '3M') {
    const data = await U.api('api/chart?identity=' + encodeURIComponent(id) + '&range=' + range, 600);
    if (data?.status !== 'AVAILABLE' || !Array.isArray(data.bars)) return null;
    const values = data.bars.map((bar) => C.num(bar.close)).filter((value) => value > 0);
    return values.length >= 2 ? values : null;
  }

  window.ZeroData = {portfolio, desk, research, decade, rank, closes, premarket, governance, ownershipCompanies};
})();
