/* 내 주식: 총자산과 수익, 비중 막대, 보유 종목 목록, 같은 날 지수에 넣었다면 비교, 계산 기준. */
(() => {
  'use strict';
  const C = window.ZeroCore, U = window.ZeroUI, D = window.ZeroData;
  const {el} = U;
  const root = document.getElementById('view-stocks');
  const SHADES = ['#1b64da', '#3d8bfd', '#74abff', '#a8c9ff', '#8a94a6', '#c2c8d2', '#5b6577', '#d9dee6'];

  function summary(view) {
    const today = view.todayPnl === null ? null
      : el('p', {class: 'hero-today tone-' + C.direction(view.todayPnl)}, '오늘 ', U.amounts.text(C.signed(view.todayPnl, 0) + '원'), ' (', C.percentText(view.todayPercent), ')');
    const facts = el('dl', {class: 'facts'},
      el('div', {}, el('dt', {text: '처음 넣은 돈'}), el('dd', {text: U.amounts.text(C.wonText(view.capital))})),
      el('div', {}, el('dt', {text: '지금까지 손익'}), el('dd', {class: 'tone-' + C.direction(view.gain), text: U.amounts.text(C.signed(view.gain, 0) + '원') + ' (' + C.percentText(view.returnPercent) + ')'})),
      el('div', {}, el('dt', {text: '주식 평가액'}), el('dd', {text: U.amounts.text(C.wonText(view.held))})),
      el('div', {}, el('dt', {text: '남은 현금'}), el('dd', {text: U.amounts.text(C.wonText(view.cash))})));
    return el('section', {class: 'block hero'},
      el('h2', {class: 'block-title', text: '총자산'}),
      el('p', {class: 'hero-total', text: U.amounts.text(C.wonText(view.total))}),
      today, facts);
  }

  // 종목별 비중을 한 줄 막대로. 현금도 한 칸으로 넣는다.
  function allocation(view) {
    const parts = view.rows.map((row) => ({name: row.name, value: row.valueKrw}));
    if (view.cash > 0) parts.push({name: '현금', value: view.cash});
    const track = el('div', {class: 'stack', role: 'img', 'aria-label': '종목별 비중'});
    const legend = el('ul', {class: 'legend'});
    parts.forEach((part, index) => {
      const share = part.value / view.total * 100, color = SHADES[index % SHADES.length];
      const piece = el('span', {});
      piece.style.setProperty('width', share.toFixed(2) + '%');
      piece.style.setProperty('background', color);
      track.append(piece);
      const dot = el('i', {});
      dot.style.setProperty('background', color);
      legend.append(el('li', {}, dot, el('span', {text: part.name}), el('strong', {text: C.cut2(share) + '%'})));
    });
    return U.section('비중', track, legend);
  }

  function holdings(view) {
    const rows = view.rows.map((row) => U.stockRow({
      id: row.id, name: row.name,
      sub: row.quantity.toLocaleString('ko-KR') + '주' + (row.average ? ', 평균 ' + C.priceText(row.average, row.currency) : ''),
      value: U.amounts.text(C.wonText(row.valueKrw)),
      percent: row.returnPercent ?? undefined
    }));
    return U.section('보유 종목 ' + view.rows.length + '개', el('ul', {class: 'rows'}, rows), U.note('오른쪽 숫자는 산 가격 대비 수익률이에요. 수수료와 세금은 넣지 않았어요.'));
  }

  // 같은 날 같은 돈을 지수에 넣었다면: 저장된 참고 계산(원화 기준)만 쓴다.
  async function comparison(view) {
    const entries = [{name: 'ZERO', percent: view.returnPercent}];
    const sp = C.num(view.benchmark?.krw_common?.return_percent);
    if (view.benchmark?.state === 'AVAILABLE' && Number.isFinite(sp)) entries.push({name: 'S&P 500', percent: sp, date: view.benchmark.krw_common.market_date});
    const tqqq = await U.api('api/tqqq', 1800);
    const tq = C.num(tqqq?.krw_common?.return_percent);
    if (tqqq?.state === 'AVAILABLE' && Number.isFinite(tq)) entries.push({name: 'TQQQ', percent: tq, date: tqqq.krw_common.market_date});
    if (entries.length < 2) return null;
    const widest = Math.max(...entries.map((entry) => Math.abs(entry.percent)), 0.01);
    const list = el('ul', {class: 'bars'}, entries.map((entry) => {
      const bar = el('span', {class: 'bar-fill tone-bg-' + C.direction(entry.percent)});
      bar.style.setProperty('width', Math.max(2, Math.abs(entry.percent) / widest * 100).toFixed(1) + '%');
      return el('li', {class: 'bar-row'},
        el('span', {class: 'bar-name'}, el('strong', {text: entry.name}), entry.date ? el('small', {text: entry.date + ' 기준'}) : null),
        el('span', {class: 'bar-track'}, bar),
        el('span', {class: 'bar-value'}, el('strong', {class: 'tone-' + C.direction(entry.percent), text: C.percentText(entry.percent)})));
    }));
    const start = view.benchmark?.start?.market_date;
    return U.section('같은 돈을 지수에 넣었다면', list,
      U.note((start ? start + '부터 ' : '') + '원화 기준으로 비교했어요. 지수 쪽은 배당·세금·수수료를 뺀 가격 기준이고 기준일이 서로 다를 수 있어요.'));
  }

  function basis(view) {
    const priced = U.timeText(view.pricedAt), fxAt = U.timeText(view.fxAt);
    const lines = [
      'ZERO가 1억원으로 시작한 참고 포트폴리오예요. 한국투자증권 모의 계좌 기록을 바탕으로 하고 실제 주문은 없어요.',
      view.live ? '가격은 공개 시세로 다시 계산했어요' + (priced ? '(' + priced + ').' : '.') : '시세를 새로 받지 못해 저장된 값을 보여 드려요' + (priced ? '(' + priced + ').' : '.'),
      view.fx ? '달러는 1달러 ' + C.cut2(view.fx).toLocaleString('ko-KR') + '원으로 바꿨어요' + (view.fxLive ? '.' : fxAt ? '(저장된 환율, ' + fxAt + ').' : '(저장된 환율).') : null,
      '오늘 손익은 종목마다 가장 최근 거래일의 변동을 더한 값이에요. 미국 종목은 지난밤 장 기준이에요.',
      '남은 현금은 계획과 체결 기록으로 계산한 값이고 실제 결제 현금과 다를 수 있어요.'
    ].filter(Boolean);
    return el('details', {class: 'block details'}, el('summary', {text: '이 숫자는 어떻게 계산했나요'}), ...lines.map((line) => el('p', {text: line})));
  }

  const RISK_IDS = ['US:SPY', 'US:SCHD', 'US:TQQQ', 'US:SOXL'];
  const riskDate = (value) => { if (value == null) return null; const date = new Date(value); return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date.toISOString().slice(0, 10) : null; };
  let lastView = null, lastCompare = null, lastRisks = [], referenceAt = null, riskHost = null, paintToken = 0;

  function drawdown(view) {
    const start = riskDate(view.startAt), observed = riskDate(referenceAt);
    const rows = RISK_IDS.map((id, index) => {
      const risk = lastRisks[index], name = id.split(':')[1];
      const detail = !risk ? '일봉을 확인하는 중이에요.' : risk.state === 'AVAILABLE'
        ? riskDate(risk.startAt) + ' ~ ' + riskDate(risk.endAt) + ', ' + risk.count + '개 종가 · ' + risk.currency + '\n고점 ' + riskDate(risk.peakAt) + ', 저점 ' + riskDate(risk.troughAt)
        : risk.reason === 'SPLIT_UNVERIFIED' ? '기간 안에 주식 분할이 있어 분할 보정을 확인할 때까지 표시를 보류해요.' : '1년 일봉의 기간·누락을 확인하지 못해 표시를 보류해요.';
      return el('li', {class: 'row'}, el('span', {class: 'row-main stacked'},
        el('strong', {text: name}), el('small', {text: detail}),
        risk?.sourceUrl ? el('a', {href: risk.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: risk.state === 'AVAILABLE' ? 'Yahoo Finance 일봉 출처' : '분할 공지'}) : null),
      risk?.state === 'AVAILABLE' ? el('strong', {class: 'tone-down', text: C.percentText(-risk.percent)}) : null);
    });
    return U.section('1년 최대 낙폭',
      el('h3', {class: 'sub-title', text: 'ZERO 포트폴리오: 자료 부족'}),
      el('p', {text: '현재 제공되는 자료에는 입출금을 구분한 일별 총자산 이력이 없어 1년 낙폭과 관측기간 낙폭 모두 계산할 수 없어요.'}),
      start || observed ? U.note([start ? '참고 시작 ' + start : null, observed ? '마지막 저장 관측 ' + observed : null].filter(Boolean).join(' · ')) : null,
      el('h3', {class: 'sub-title', text: '비교 종목의 관측기간 낙폭'}), el('ul', {class: 'rows'}, rows),
      U.note('각 관측기간에서 고점 뒤 가장 많이 떨어진 폭이에요. 수신 종가 기준이며 배당·환율·세금·수수료는 반영하지 않았어요. 거래일 일부가 빠질 수 있어 실제 장중 낙폭이나 총수익률과 달라요.'));
  }

  async function loadDrawdowns(token) {
    for (let offset = 0; offset < RISK_IDS.length; offset += 2) {
      const ids = RISK_IDS.slice(offset, offset + 2);
      const data = await Promise.all(ids.map((id) => U.api('api/chart?identity=' + encodeURIComponent(id) + '&range=1Y', 300)));
      if (token !== paintToken) return;
      data.forEach((item, index) => { lastRisks[offset + index] = item?.identity === ids[index] ? C.chartDrawdown(item) : {state: 'UNAVAILABLE'}; });
      if (lastView) riskHost?.replaceChildren(drawdown(lastView));
    }
  }

  function render() {
    riskHost = el('div', {}, drawdown(lastView));
    root.replaceChildren(
      el('h1', {class: 'page-title', text: '내 주식'}),
      el('div', {class: 'columns'},
        el('div', {class: 'column'}, summary(lastView), allocation(lastView), lastCompare),
        el('div', {class: 'column'}, holdings(lastView), riskHost, basis(lastView))));
  }

  async function paint() {
    const token = ++paintToken;
    lastCompare = null; lastRisks = []; referenceAt = null;
    let risksStarted = false;
    if (lastView) render(); else root.replaceChildren(el('h1', {class: 'page-title', text: '내 주식'}), U.loading());
    const show = (view) => {
      if (token !== paintToken) return;
      lastView = view;
      if (view && !view.live) referenceAt = view.pricedAt;
      if (view) render(); else root.replaceChildren(el('h1', {class: 'page-title', text: '내 주식'}), U.empty('내 주식 자료를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'));
      if (view && !risksStarted) { risksStarted = true; loadDrawdowns(token); }
    };
    const view = await D.portfolio(show);
    if (token !== paintToken) return;
    show(view);
    if (!view) return;
    const compare = await comparison(view);
    if (token !== paintToken) return;
    lastCompare = compare;
    render();
  }

  const redraw = () => { if (!root.hidden && lastView) render(); };
  document.addEventListener('zero-amounts-changed', redraw);
  document.addEventListener('zero-theme-changed', redraw);
  U.route('stocks', {title: () => '내 주식', show: paint});
})();
