'use strict';
/**
 * ZERO 실전 주식 투자자 전용 워크스테이션 (Investor Pro Toolkit)
 * - 게임 요소를 모두 제거하고 실제 주식 투자자가 매일 사용하는 실전 도구만 제공합니다.
 * 1) 💧 물타기 · 추가매수 평단가 & 본전 탈출 계산기 (보유종목 원터치 연동 + 카카오 층수 연동)
 * 2) 🎯 손익비(R:R) & 적정 매수 수량 계산기 (포지션 사이징 · 손절/익절 한도 계산)
 * 3) 🧾 해외(미국)·국내 주식 양도소득세(22%) & 실수령액 계산기 (250만원 기본공제 게이지 · 손익통산 절세)
 * 4) 📋 매수 전 5대 원칙 체크리스트 & 실전 매매 복기 일지 (뇌동매매 방지 · localStorage 저장)
 * 5) 🧭 실시간 주도 섹터 · 핵심 종목 스크리너 (클릭 즉시 차트·호가·수급 화면 연동)
 */
(function initZeroInvestorWorkstation() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const GAME_ELEMENT_SELECTORS = [
    '#zero-easy-mode-bar',
    '#home-rpg-gateway',
    '#office-rpg-hud',
    '#office-rpg-slim-bar',
    '#office-map-rpg-overlay',
    '#team-rpg-quick-top',
    '#team-rpg-builder',
    '#rpg-plaza-interactive-stage',
    '#plaza-rpg-arena',
    '.team-card-rpg-header',
    '#rpg-hero-detail-dialog',
    '#plaza-raid-dialog'
  ];

  function removeGameElements() {
    for (const selector of GAME_ELEMENT_SELECTORS) {
      document.querySelectorAll(selector).forEach((el) => el.remove());
    }
  }

  function ensureTeamOfficeVisible() {
    const officePanel = document.getElementById('office-panel');
    if (officePanel && officePanel.classList.contains('viewport-page-away')) {
      officePanel.classList.remove('viewport-page-away');
    }
    const officeMap = document.getElementById('office-map');
    if (officeMap && officeMap.classList.contains('viewport-page-away')) {
      officeMap.classList.remove('viewport-page-away');
    }
  }

  const make = (tag, cls = '', text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  const fmtNum = (n, dec = 0) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return '0';
    return v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  const fmtMoney = (n, isUS = false) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return isUS ? '$0.00' : '0원';
    return isUS
      ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : Math.round(v).toLocaleString('ko-KR') + '원';
  };

  // 대표 종목 프리셋 (보유 원장 미로드 시에도 즉시 계산 가능)
  const STOCK_PRESETS = [
    { id: 'KR:005930', name: '삼성전자', market: 'KR', avgPrice: 72000, curPrice: 59200, qty: 50 },
    { id: 'KR:000660', name: 'SK하이닉스', market: 'KR', avgPrice: 198000, curPrice: 186500, qty: 20 },
    { id: 'US:NVDA', name: 'NVIDIA', market: 'US', avgPrice: 188.61, curPrice: 138.50, qty: 25 },
    { id: 'US:TSLA', name: 'Tesla', market: 'US', avgPrice: 265.00, curPrice: 242.80, qty: 15 },
    { id: 'US:AAPL', name: 'Apple', market: 'US', avgPrice: 220.00, curPrice: 231.50, qty: 20 },
    { id: 'US:SGOV', name: 'SGOV (미국단기채)', market: 'US', avgPrice: 100.51, curPrice: 100.62, qty: 100 }
  ];

  // 주도 섹터 및 핵심 종목 데이터
  const SECTOR_GROUPS = {
    ai: {
      label: '🤖 AI · 반도체 주도주',
      desc: '글로벌 AI 데이터센터 투자 및 HBM(고대역폭메모리) 슈퍼사이클 핵심 종목',
      items: [
        { id: 'US:NVDA', name: 'NVIDIA', code: 'NVDA', market: 'US', tag: 'AI 가속기 1위', point: '데이터센터 GPU 독점력 · 영업이익률 60%대', avgPrice: 188.61, curPrice: 138.50 },
        { id: 'KR:000660', name: 'SK하이닉스', code: '000660', market: 'KR', tag: 'HBM3E 선도', point: 'AI 메모리 공급 핵심 · 고부가 HBM 비중 확대', avgPrice: 198000, curPrice: 186500 },
        { id: 'KR:005930', name: '삼성전자', code: '005930', market: 'KR', tag: 'PBR 1배 하단', point: '역사적 밸류에이션 하단 · 주주환원 및 자사주 소각', avgPrice: 72000, curPrice: 59200 },
        { id: 'US:AVGO', name: 'Broadcom', code: 'AVGO', market: 'US', tag: '맞춤형 AI 칩', point: '빅테크 ASIC 설계 및 네트워크 반도체 강자', avgPrice: 175.00, curPrice: 179.40 }
      ]
    },
    bigtech: {
      label: '🇺🇸 미국 지수 · 빅테크 M7',
      desc: '장기 우상향 복리 성장을 이끄는 S&P 500 · 나스닥 100 및 빅테크 핵심 기업',
      items: [
        { id: 'US:SPY', name: 'S&P 500 ETF', code: 'SPY', market: 'US', tag: '미국 시장 대표', point: '미국 우량 500대 기업 분산투자 · 워런 버핏 추천 1순위', avgPrice: 570.00, curPrice: 582.30 },
        { id: 'US:MSFT', name: 'Microsoft', code: 'MSFT', market: 'US', tag: '클라우드·AI', point: 'Azure 클라우드 성장 및 엔터프라이즈 Copilot 구독 모델', avgPrice: 425.00, curPrice: 428.50 },
        { id: 'US:GOOGL', name: 'Alphabet', code: 'GOOGL', market: 'US', tag: '검색·유튜브', point: '빅테크 중 가장 합리적인 PER · 검색 및 클라우드 현금창출력', avgPrice: 168.00, curPrice: 166.20 },
        { id: 'US:AAPL', name: 'Apple', code: 'AAPL', market: 'US', tag: '생태계·자사주매입', point: '전 세계 22억 활성 기기 · 매년 막대한 자사주 매입 소각', avgPrice: 220.00, curPrice: 231.50 }
      ]
    },
    dividend: {
      label: '💵 월배당 · 파킹 · 안전자산',
      desc: '하락장 방어력과 매월 현금흐름을 동시에 챙기는 인컴(Income) 포트폴리오',
      items: [
        { id: 'US:SGOV', name: 'iShares 미국 초단기국채', code: 'SGOV', market: 'US', tag: '달러 파킹통장', point: '미국 0~3개월 국채 · 연 4~5%대 월배당 및 원금 변동 극소화', avgPrice: 100.51, curPrice: 100.62 },
        { id: 'US:SCHD', name: 'Schwab 미국 배당성장', code: 'SCHD', market: 'US', tag: '배당성장 대표', point: '10년 연속 배당 증가 우량주 100선 · 배당금+주가 동반 성장', avgPrice: 28.20, curPrice: 28.90 },
        { id: 'KR:105560', name: 'KB금융', code: '105560', market: 'KR', tag: '밸류업 대장주', point: '총주주환원율 확대 · 분기 균등배당 및 자사주 매입 소각', avgPrice: 88000, curPrice: 93500 },
        { id: 'US:TQQQ', name: 'ProShares 나스닥 3배', code: 'TQQQ', market: 'US', tag: '초고위험 레버리지', point: '일간 수익률 3배 추종 · 횡보장 음의 복리 주의(소액·단기용)', avgPrice: 72.00, curPrice: 75.40 }
      ]
    },
    kr_core: {
      label: '🇰🇷 국내 시장 핵심 주도주',
      desc: '외국인·기관 수급이 집중되는 코스피·코스닥 대표 시가총액 상위 종목',
      items: [
        { id: 'KR:005930', name: '삼성전자', code: '005930', market: 'KR', tag: '코스피 1위', point: '메모리·파운드리·모바일 통합 생태계 및 배당 안전판', avgPrice: 72000, curPrice: 59200 },
        { id: 'KR:000660', name: 'SK하이닉스', code: '000660', market: 'KR', tag: '코스피 2위', point: '글로벌 AI 서버향 HBM 독보적 수율 및 실적 턴어라운드', avgPrice: 198000, curPrice: 186500 },
        { id: 'KR:035420', name: 'NAVER', code: '035420', market: 'KR', tag: '국내 AI 플랫폼', point: '검색·커머스·웹툰 수익성 개선 및 밸류에이션 리레이팅 구간', avgPrice: 185000, curPrice: 174500 },
        { id: 'KR:247540', name: '에코프로비엠', code: '247540', market: 'KR', tag: '2차전지 양극재', point: '전기차 캐즘 통과 여부 및 유럽·북미 출하량 회복 점검 필수', avgPrice: 185000, curPrice: 162000 }
      ]
    }
  };

  function openStockDetail(id) {
    if (window.ZEROTossStock && typeof window.ZEROTossStock.show === 'function') {
      window.ZEROTossStock.show(id);
    } else if (window.ZEROExplore && typeof window.ZEROExplore.openCompany === 'function') {
      window.ZERO?.navigate?.('workbench', false);
      window.ZEROExplore.openCompany(id);
    } else if (window.ZERO && typeof window.ZERO.navigate === 'function') {
      window.location.hash = '#workbench?identity=' + encodeURIComponent(id);
      window.ZERO.navigate('workbench', false);
    }
  }

  function getDynamicPresets() {
    const p = window.ZERO?.getPortfolio?.();
    const holdings = p?.summary?.zero_portfolio?.holdings || p?.holdings || [];
    if (!Array.isArray(holdings) || holdings.length === 0) return STOCK_PRESETS;
    const mapped = [];
    for (const h of holdings) {
      const avg = Number(h.avg_price_native || h.average_price || h.avg_price || 0);
      const cur = Number(h.current_price_native || h.price || h.current_price || avg);
      const qty = Number(h.quantity || h.qty || 10);
      if (avg > 0 && cur > 0) {
        mapped.push({
          id: (h.market || 'KR') + ':' + h.symbol,
          name: h.name || h.symbol,
          market: h.market === 'US' ? 'US' : 'KR',
          avgPrice: avg,
          curPrice: cur,
          qty: qty > 0 ? qty : 10
        });
      }
    }
    return mapped.length >= 2 ? mapped.concat(STOCK_PRESETS.slice(0, 3)) : STOCK_PRESETS;
  }

  // 공유 상태 (스크리너에서 '💧 평단 계산' 클릭 시 즉시 해당 종목으로 계산기 열기 지원)
  const calcState = {
    activeTab: 'avg', // 'avg' | 'rr' | 'tax' | 'check'
    avg: { name: '삼성전자', market: 'KR', myAvg: 72000, myQty: 50, curPrice: 59200, addPrice: 59200, addQty: 30 },
    rr: { capital: 50000000, riskPct: 2, entry: 59200, stop: 55000, target: 68000, isUS: false },
    tax: { market: 'US', gainKrw: 6500000, lossOffsetKrw: 1200000, tradeAmountKrw: 20000000, feePct: 0.07 },
    activeSector: 'ai'
  };

  // ── 1. 물타기 · 추가매수 평단가 & 탈출 층수 계산기 렌더링 ──
  function renderAvgCalculator(container, rerenderAll) {
    const s = calcState.avg;
    const isUS = s.market === 'US';
    const floorUnit = isUS ? 1 : 1000;

    const wrap = make('div', 'inv-tab-pane');
    const presetRow = make('div', 'inv-preset-row');
    presetRow.append(make('span', 'inv-preset-label', '⚡ 종목 빠른 불러오기:'));
    const presets = getDynamicPresets();
    presets.slice(0, 6).forEach((item) => {
      const chip = make('button', 'inv-chip' + (s.name === item.name ? ' active' : ''), `${item.name} (${fmtMoney(item.curPrice, item.market === 'US')})`);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        s.name = item.name;
        s.market = item.market;
        s.myAvg = item.avgPrice;
        s.myQty = item.qty;
        s.curPrice = item.curPrice;
        s.addPrice = item.curPrice;
        s.addQty = Math.max(1, Math.round(item.qty * 0.5));
        rerenderAll();
      });
      presetRow.append(chip);
    });

    // 통화 스위치
    const marketSwitch = make('div', 'inv-inline-switch');
    ['KR', 'US'].forEach((m) => {
      const b = make('button', 'inv-chip' + (s.market === m ? ' active' : ''), m === 'KR' ? '🇰🇷 원화(KRW) 종목' : '🇺🇸 달러(USD) 종목');
      b.type = 'button';
      b.addEventListener('click', () => {
        if (s.market === m) return;
        s.market = m;
        if (m === 'US' && s.myAvg > 2000) {
          s.name = 'NVIDIA'; s.myAvg = 188.61; s.myQty = 25; s.curPrice = 138.50; s.addPrice = 138.50; s.addQty = 15;
        } else if (m === 'KR' && s.myAvg <= 2000) {
          s.name = '삼성전자'; s.myAvg = 72000; s.myQty = 50; s.curPrice = 59200; s.addPrice = 59200; s.addQty = 30;
        }
        rerenderAll();
      });
      marketSwitch.append(b);
    });
    presetRow.append(marketSwitch);

    // 입력 폼 그리드
    const formGrid = make('div', 'inv-form-grid');
    const makeField = (label, val, step, onChange) => {
      const box = make('label', 'inv-field');
      box.append(make('span', 'inv-field-label', label));
      const inp = make('input', 'inv-input');
      inp.type = 'number';
      inp.step = String(step);
      inp.min = '0';
      inp.value = String(val);
      inp.addEventListener('input', () => {
        const parsed = Number(inp.value);
        if (Number.isFinite(parsed) && parsed >= 0) {
          onChange(parsed);
          paintResult();
        }
      });
      box.append(inp);
      return box;
    };

    const resultContainer = make('div', 'inv-result-container');

    formGrid.append(
      makeField(`내 보유 평단가 (${isUS ? 'USD' : '원'})`, s.myAvg, isUS ? 0.1 : 100, (v) => { s.myAvg = v; }),
      makeField('현재 보유 수량 (주)', s.myQty, 1, (v) => { s.myQty = v; }),
      makeField(`현재 시장가 (${isUS ? 'USD' : '원'})`, s.curPrice, isUS ? 0.1 : 100, (v) => { s.curPrice = v; s.addPrice = v; }),
      makeField(`추가 매수가 (${isUS ? 'USD' : '원'})`, s.addPrice, isUS ? 0.1 : 100, (v) => { s.addPrice = v; }),
      makeField('추가 매수 수량 (주)', s.addQty, 1, (v) => { s.addQty = v; })
    );

    // 빠른 추가 수량 버튼
    const quickAddRow = make('div', 'inv-preset-row');
    quickAddRow.append(make('span', 'inv-preset-label', '💧 빠른 추매 시뮬레이션:'));
    const quickAmounts = isUS
      ? [{ label: '+5주', qty: 5 }, { label: '+10주', qty: 10 }, { label: '+25주', qty: 25 }, { label: '보유량 1:1 동수 물타기', qty: s.myQty }]
      : [{ label: '+10주', qty: 10 }, { label: '+30주', qty: 30 }, { label: '100만원어치 추매', qty: Math.max(1, Math.floor(1000000 / (s.addPrice || 1))) }, { label: '보유량 1:1 동수 물타기', qty: s.myQty }];

    quickAmounts.forEach((qa) => {
      const b = make('button', 'inv-chip', qa.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        s.addQty = qa.qty;
        rerenderAll();
      });
      quickAddRow.append(b);
    });

    function paintResult() {
      resultContainer.replaceChildren();
      const oldCost = s.myAvg * s.myQty;
      const addCost = s.addPrice * s.addQty;
      const totalQty = s.myQty + s.addQty;
      const totalCost = oldCost + addCost;
      const newAvg = totalQty > 0 ? totalCost / totalQty : 0;

      const cur = s.curPrice > 0 ? s.curPrice : 1;
      const oldReturnPct = s.myAvg > 0 ? ((cur - s.myAvg) / s.myAvg) * 100 : 0;
      const newReturnPct = newAvg > 0 ? ((cur - newAvg) / newAvg) * 100 : 0;

      // 본전(원금 회복)을 위해 현재가에서 올라야 하는 필요 상승률(%)
      const oldNeededUpPct = cur < s.myAvg ? ((s.myAvg - cur) / cur) * 100 : 0;
      const newNeededUpPct = cur < newAvg ? ((newAvg - cur) / cur) * 100 : 0;

      const oldFloor = Math.round((s.myAvg / floorUnit) * 10) / 10;
      const newFloor = Math.round((newAvg / floorUnit) * 10) / 10;
      const curFloor = Math.round((cur / floorUnit) * 10) / 10;
      const floorDrop = Math.round((oldFloor - newFloor) * 10) / 10;

      const summaryGrid = make('div', 'inv-kpi-grid');
      const kpi = (title, val, sub, highlightClass = '') => {
        const card = make('div', 'inv-kpi-card ' + highlightClass);
        card.append(
          make('span', 'inv-kpi-title', title),
          make('strong', 'inv-kpi-val', val),
          make('small', 'inv-kpi-sub', sub)
        );
        return card;
      };

      summaryGrid.append(
        kpi(
          '변경 후 새 평단가',
          fmtMoney(newAvg, isUS),
          `기존 ${fmtMoney(s.myAvg, isUS)} 대비 ${s.myAvg > 0 ? (((newAvg - s.myAvg) / s.myAvg) * 100).toFixed(1) : '0.0'}%`,
          'inv-kpi-primary'
        ),
        kpi(
          '내 층수 변화 (현재 ' + curFloor + '층)',
          `${oldFloor}층 → ${newFloor}층`,
          floorDrop > 0 ? `💧 엘리베이터 ${floorDrop}층 하강 성공!` : floorDrop < 0 ? `🔥 불타기로 ${Math.abs(floorDrop)}층 상승` : '층수 동일',
          floorDrop > 0 ? 'inv-kpi-good' : ''
        ),
        kpi(
          '본전 탈출까지 필요 상승률',
          newNeededUpPct > 0 ? `+${newNeededUpPct.toFixed(2)}% 상승 시 본전` : '🎉 현재 수익 구간!',
          oldNeededUpPct > 0 ? `기존 +${oldNeededUpPct.toFixed(2)}% 필요 → ${(oldNeededUpPct - newNeededUpPct).toFixed(2)}%p 단축` : `현재 수익률 ${newReturnPct >= 0 ? '+' : ''}${newReturnPct.toFixed(2)}%`,
          newNeededUpPct < oldNeededUpPct ? 'inv-kpi-good' : ''
        ),
        kpi(
          '총 보유 수량 · 총 매수원금',
          `${fmtNum(totalQty)}주 · ${fmtMoney(totalCost, isUS)}`,
          `기존 ${fmtMoney(oldCost, isUS)} + 추매 ${fmtMoney(addCost, isUS)}`
        )
      );

      const guideBanner = make('div', 'inv-advice-banner');
      const addRatioPct = oldCost > 0 ? (addCost / oldCost) * 100 : 0;
      const guideText = addRatioPct > 100
        ? `⚠️ 실전 리스크 경고: 추가 매수 금액이 기존 원금의 ${Math.round(addRatioPct)}%입니다. 하락 추세가 멈추고 거래량이 실리는 지지선에서 2~3회 나누어 분할 진입하세요.`
        : `💡 실전 매매 팁: ${s.addQty}주 추가 매수 시 본전 탈출에 필요한 상승 폭이 +${oldNeededUpPct.toFixed(1)}%에서 +${newNeededUpPct.toFixed(1)}%로 낮아집니다. 반등 시 기존 물량 일부를 덜어내어 현금 비중을 회복하는 전략이 유리합니다.`;
      guideBanner.textContent = guideText;

      resultContainer.append(summaryGrid, guideBanner);
    }

    paintResult();
    wrap.append(presetRow, quickAddRow, formGrid, resultContainer);
    container.append(wrap);
  }

  // ── 2. 손익비(R:R) & 적정 매수 수량 계산기 (포지션 사이징) ──
  function renderRiskRewardCalculator(container, rerenderAll) {
    const s = calcState.rr;
    const wrap = make('div', 'inv-tab-pane');

    const presetRow = make('div', 'inv-preset-row');
    presetRow.append(make('span', 'inv-preset-label', '🛡️ 1회 매매 계좌 허용 손실률 기준:'));
    [
      { label: '보수적 (계좌의 1% 리스크)', pct: 1 },
      { label: '표준 스윙 (계좌의 2% 리스크)', pct: 2 },
      { label: '공격적 (계좌의 3% 리스크)', pct: 3 }
    ].forEach((opt) => {
      const b = make('button', 'inv-chip' + (s.riskPct === opt.pct ? ' active' : ''), opt.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        s.riskPct = opt.pct;
        rerenderAll();
      });
      presetRow.append(b);
    });

    // 손절/익절 빠른 비율 설정
    const quickStopRow = make('div', 'inv-preset-row');
    quickStopRow.append(make('span', 'inv-preset-label', '🎯 손절·익절 자동 세팅:'));
    [
      { label: '칼손절 -5% / 익절 +10% (1:2)', stopPct: -5, targetPct: 10 },
      { label: '표준 -7% / 익절 +15% (1:2.1)', stopPct: -7, targetPct: 15 },
      { label: '추세 -10% / 익절 +25% (1:2.5)', stopPct: -10, targetPct: 25 }
    ].forEach((preset) => {
      const b = make('button', 'inv-chip', preset.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        s.stop = Math.round(s.entry * (1 + preset.stopPct / 100));
        s.target = Math.round(s.entry * (1 + preset.targetPct / 100));
        rerenderAll();
      });
      quickStopRow.append(b);
    });

    const formGrid = make('div', 'inv-form-grid');
    const resultContainer = make('div', 'inv-result-container');

    const makeField = (label, val, step, onChange) => {
      const box = make('label', 'inv-field');
      box.append(make('span', 'inv-field-label', label));
      const inp = make('input', 'inv-input');
      inp.type = 'number';
      inp.step = String(step);
      inp.min = '0';
      inp.value = String(val);
      inp.addEventListener('input', () => {
        const parsed = Number(inp.value);
        if (Number.isFinite(parsed) && parsed >= 0) {
          onChange(parsed);
          paintRR();
        }
      });
      box.append(inp);
      return box;
    };

    formGrid.append(
      makeField('내 총 투자 원금 (원)', s.capital, 1000000, (v) => { s.capital = v; }),
      makeField('1회 허용 손실률 (%)', s.riskPct, 0.5, (v) => { s.riskPct = v; }),
      makeField('진입 매수가 (원)', s.entry, 100, (v) => { s.entry = v; }),
      makeField('손절 기준가 (원)', s.stop, 100, (v) => { s.stop = v; }),
      makeField('목표 익절가 (원)', s.target, 100, (v) => { s.target = v; })
    );

    function paintRR() {
      resultContainer.replaceChildren();
      const maxLossKrw = s.capital * (s.riskPct / 100);
      const lossPerShare = Math.max(1, s.entry - s.stop);
      const gainPerShare = Math.max(0, s.target - s.entry);
      const rrRatio = lossPerShare > 0 ? gainPerShare / lossPerShare : 0;

      // 계좌 최대 허용 손실액을 넘지 않는 적정 매수 수량 (단, 총 원금의 100% 이내)
      const rawRecommendedQty = s.entry > s.stop ? Math.floor(maxLossKrw / lossPerShare) : 0;
      const maxAffordableQty = s.entry > 0 ? Math.floor(s.capital / s.entry) : 0;
      const recommendedQty = Math.min(rawRecommendedQty, maxAffordableQty);
      const positionCost = recommendedQty * s.entry;
      const positionWeightPct = s.capital > 0 ? (positionCost / s.capital) * 100 : 0;
      const expectedGainKrw = recommendedQty * gainPerShare;
      const actualRiskKrw = recommendedQty * lossPerShare;
      const breakevenWinRate = rrRatio > 0 ? (1 / (1 + rrRatio)) * 100 : 100;

      const grade = rrRatio >= 2.0
        ? { badge: '🟢 손익비 우수 (진입 유리)', cls: 'inv-kpi-good' }
        : rrRatio >= 1.2
          ? { badge: '🟡 손익비 보통 (분할 진입)', cls: 'inv-kpi-primary' }
          : { badge: '🔴 손익비 불리 (진입 재고)', cls: 'inv-kpi-warn' };

      const summaryGrid = make('div', 'inv-kpi-grid');
      const kpi = (title, val, sub, cls = '') => {
        const card = make('div', 'inv-kpi-card ' + cls);
        card.append(make('span', 'inv-kpi-title', title), make('strong', 'inv-kpi-val', val), make('small', 'inv-kpi-sub', sub));
        return card;
      };

      summaryGrid.append(
        kpi(
          '권장 적정 매수 수량',
          `${fmtNum(recommendedQty)}주 (${positionWeightPct.toFixed(1)}%)`,
          `총 매수금액 ${fmtMoney(positionCost)}`,
          'inv-kpi-primary'
        ),
        kpi(
          '손익비 (Risk : Reward)',
          `1 : ${rrRatio.toFixed(2)}`,
          grade.badge,
          grade.cls
        ),
        kpi(
          '손절 시 최대 예상 손실',
          `-${fmtMoney(actualRiskKrw)}`,
          `주당 -${fmtMoney(lossPerShare)} (${s.entry > 0 ? (((s.stop - s.entry) / s.entry) * 100).toFixed(1) : 0}%) 방어`,
          ''
        ),
        kpi(
          '목표가 도달 시 예상 수익',
          `+${fmtMoney(expectedGainKrw)}`,
          `필요 최소 승률 ${breakevenWinRate.toFixed(1)}% 이상이면 계좌 우상향`,
          'inv-kpi-good'
        )
      );

      const banner = make('div', 'inv-advice-banner');
      banner.textContent = s.stop >= s.entry
        ? '⚠️ 손절 기준가는 진입 매수가보다 낮게 설정해야 정확한 적정 수량이 계산됩니다.'
        : `📐 프로 트레이더 원칙: 손절가(${fmtMoney(s.stop)}) 이탈 시 기계적으로 손절하더라도 내 전체 원금(${fmtMoney(s.capital)})의 ${s.riskPct}%인 ${fmtMoney(actualRiskKrw)}만 손실이 발생하며, 승률 ${breakevenWinRate.toFixed(0)}%만 유지해도 장기 수익이 누적됩니다.`;

      resultContainer.append(summaryGrid, banner);
    }

    paintRR();
    wrap.append(presetRow, quickStopRow, formGrid, resultContainer);
    container.append(wrap);
  }

  // ── 3. 해외(미국)·국내 주식 양도소득세(22%) & 실수령액 계산기 ──
  function renderTaxCalculator(container, rerenderAll) {
    const s = calcState.tax;
    const wrap = make('div', 'inv-tab-pane');

    const topSwitch = make('div', 'inv-preset-row');
    topSwitch.append(make('span', 'inv-preset-label', '🧾 세금 · 수수료 계산 기준:'));
    [
      { key: 'US', label: '🇺🇸 미국 주식 양도소득세 (연 250만원 공제 · 22%)' },
      { key: 'KR', label: '🇰🇷 국내 상장 주식 (증권거래세 · 수수료 손익분기)' }
    ].forEach((m) => {
      const b = make('button', 'inv-chip' + (s.market === m.key ? ' active' : ''), m.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        s.market = m.key;
        rerenderAll();
      });
      topSwitch.append(b);
    });

    const quickGainRow = make('div', 'inv-preset-row');
    quickGainRow.append(make('span', 'inv-preset-label', '💰 연간 실현 차익 빠른 선택:'));
    [
      { label: '+250만원 (비과세 한도)', val: 2500000 },
      { label: '+500만원', val: 5000000 },
      { label: '+1,000만원', val: 10000000 },
      { label: '+3,000만원', val: 30000000 }
    ].forEach((g) => {
      const b = make('button', 'inv-chip' + (s.gainKrw === g.val ? ' active' : ''), g.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        s.gainKrw = g.val;
        rerenderAll();
      });
      quickGainRow.append(b);
    });

    const formGrid = make('div', 'inv-form-grid');
    const resultContainer = make('div', 'inv-result-container');

    const makeField = (label, val, step, onChange) => {
      const box = make('label', 'inv-field');
      box.append(make('span', 'inv-field-label', label));
      const inp = make('input', 'inv-input');
      inp.type = 'number';
      inp.step = String(step);
      inp.min = '0';
      inp.value = String(val);
      inp.addEventListener('input', () => {
        const parsed = Number(inp.value);
        if (Number.isFinite(parsed) && parsed >= 0) {
          onChange(parsed);
          paintTax();
        }
      });
      box.append(inp);
      return box;
    };

    formGrid.append(
      makeField('올해 실현(예상) 수익금 (원)', s.gainKrw, 500000, (v) => { s.gainKrw = v; }),
      makeField('손익통산용 손실 확정액 (원)', s.lossOffsetKrw, 500000, (v) => { s.lossOffsetKrw = v; }),
      makeField('총 매도 거래대금 (원)', s.tradeAmountKrw, 1000000, (v) => { s.tradeAmountKrw = v; }),
      makeField('왕복 수수료·환전 스프레드 (%)', s.feePct, 0.01, (v) => { s.feePct = v; })
    );

    function paintTax() {
      resultContainer.replaceChildren();
      const DEDUCTION = 2500000; // 미국 주식 연 250만 원 기본공제
      const netGain = Math.max(0, s.gainKrw - s.lossOffsetKrw);
      const feeCost = Math.round(s.tradeAmountKrw * (s.feePct / 100));

      if (s.market === 'US') {
        const taxableBeforeOffset = Math.max(0, s.gainKrw - DEDUCTION);
        const taxBeforeOffset = Math.round(taxableBeforeOffset * 0.22);

        const taxableBase = Math.max(0, netGain - DEDUCTION);
        const finalTax = Math.round(taxableBase * 0.22);
        const taxSavedByOffset = Math.max(0, taxBeforeOffset - finalTax);
        const takeHomeProfit = netGain - finalTax - feeCost;
        const usedRatio = Math.min(100, Math.round((netGain / DEDUCTION) * 100));

        // 250만원 비과세 게이지 바
        const gaugeBox = make('div', 'inv-tax-gauge-box');
        const gaugeHead = make('div', 'inv-tax-gauge-head');
        gaugeHead.append(
          make('strong', '', `🛡️ 해외주식 250만 원 비과세 한도 사용률: ${usedRatio}%`),
          make('span', '', netGain <= DEDUCTION ? `남은 비과세 한도 ${fmtMoney(DEDUCTION - netGain)}` : `비과세 한도 초과분 ${fmtMoney(taxableBase)} 과세`)
        );
        const track = make('div', 'inv-tax-track');
        const fill = make('div', 'inv-tax-fill' + (netGain > DEDUCTION ? ' over' : ''));
        fill.style.width = usedRatio + '%';
        track.append(fill);
        gaugeBox.append(gaugeHead, track);

        const summaryGrid = make('div', 'inv-kpi-grid');
        const kpi = (title, val, sub, cls = '') => {
          const card = make('div', 'inv-kpi-card ' + cls);
          card.append(make('span', 'inv-kpi-title', title), make('strong', 'inv-kpi-val', val), make('small', 'inv-kpi-sub', sub));
          return card;
        };

        summaryGrid.append(
          kpi('예상 양도소득세 (22%)', fmtMoney(finalTax), `과세표준 ${fmtMoney(taxableBase)} × 22%`, finalTax === 0 ? 'inv-kpi-good' : 'inv-kpi-warn'),
          kpi('손익통산 절세 효과', `+${fmtMoney(taxSavedByOffset)} 절세`, `손실종목 ${fmtMoney(s.lossOffsetKrw)} 상계 반영`, taxSavedByOffset > 0 ? 'inv-kpi-good' : ''),
          kpi('수수료·환전 마찰비용', `-${fmtMoney(feeCost)}`, `거래대금 ${fmtMoney(s.tradeAmountKrw)} 기준`),
          kpi('세후 내 통장 실수령 순익', fmtMoney(takeHomeProfit), `실효 세율 ${netGain > 0 ? ((finalTax / netGain) * 100).toFixed(1) : '0.0'}%`, 'inv-kpi-primary')
        );

        const tip = make('div', 'inv-advice-banner');
        tip.textContent = finalTax > 0
          ? `💡 연말 절세 전략(Tax-Loss Harvesting): 12월 말 결제일 이전에 계좌 내 평가손실 중인 미국 주식을 ${fmtMoney(Math.min(taxableBase, 5000000))}어치 매도 후 재매수하면 양도세를 최대 ${fmtMoney(Math.round(Math.min(taxableBase, 5000000) * 0.22))} 즉시 아낄 수 있습니다.`
          : '✅ 현재 순 양도차익이 연 250만 원 기본공제 이내이므로 납부할 해외주식 양도소득세가 0원입니다!';

        resultContainer.append(gaugeBox, summaryGrid, tip);
      } else {
        // 국내 상장 주식 (소액주주 장내 매매 양도세 면제, 증권거래세 약 0.18% + 왕복 수수료 반영)
        const krTransactionTax = Math.round(s.tradeAmountKrw * 0.0018);
        const totalFriction = krTransactionTax + feeCost;
        const netTakeHome = netGain - totalFriction;

        const summaryGrid = make('div', 'inv-kpi-grid');
        const kpi = (title, val, sub, cls = '') => {
          const card = make('div', 'inv-kpi-card ' + cls);
          card.append(make('span', 'inv-kpi-title', title), make('strong', 'inv-kpi-val', val), make('small', 'inv-kpi-sub', sub));
          return card;
        };

        summaryGrid.append(
          kpi('국내 장내주식 양도소득세', '0원 (비과세)', '소액주주 코스피·코스닥 장내 매매 기준', 'inv-kpi-good'),
          kpi('매도 증권거래세 (0.18%)', fmtMoney(krTransactionTax), `매도대금 ${fmtMoney(s.tradeAmountKrw)} 기준`),
          kpi('왕복 위탁수수료', fmtMoney(feeCost), `수수료율 ${s.feePct}% 적용`),
          kpi('세후·비용 차감 실수령액', fmtMoney(netTakeHome), `총 마찰비용 ${fmtMoney(totalFriction)} 차감`, 'inv-kpi-primary')
        );

        const tip = make('div', 'inv-advice-banner');
        tip.textContent = '💡 국내 주식 매매 팁: 국내 주식은 매도할 때마다 증권거래세(0.18%)와 수수료가 확정 차감됩니다. 잦은 단타 매매를 줄이면 연간 수익률을 2~4%p 이상 방어할 수 있습니다.';
        resultContainer.append(summaryGrid, tip);
      }
    }

    paintTax();
    wrap.append(topSwitch, quickGainRow, formGrid, resultContainer);
    container.append(wrap);
  }

  // ── 4. 실전 매수 전 5대 체크리스트 & 나만의 매매 복기 노트 ──
  function renderChecklistAndJournal(container) {
    const wrap = make('div', 'inv-tab-pane');
    const CHECK_ITEMS = [
      '1. [실적·가치] 기업 이익(EPS·영업이익)이 성장 중이거나 역사적 PBR·PER 하단 구간인가?',
      '2. [분할매수] 한 번에 전액 매수하지 않고 2~3회 나누어 살 현금 여유를 남겨 두었는가?',
      '3. [손익비] 진입 전 손절 기준선(-5%~-8%)과 목표 수익 구간(손익비 1:2 이상)을 정했는가?',
      '4. [비중관리] 이 종목을 매수한 뒤 단일 종목 비중이 내 전체 계좌의 25% 이하인가?',
      '5. [수급·팩트] 커뮤니티 소문이나 급등 추격매수(FOMO)가 아닌 공시·수급(외국인/기관)을 확인했는가?'
    ];

    const checkSection = make('div', 'inv-check-section');
    const scoreBanner = make('div', 'inv-check-score');
    const listWrap = make('div', 'inv-check-list');
    const states = [true, true, true, false, false];

    function updateScore() {
      const passed = states.filter(Boolean).length;
      scoreBanner.replaceChildren();
      const statusText = passed === 5
        ? '🟢 5/5 완벽 준비 완료! 원칙에 부합하는 계획적 매매입니다.'
        : passed >= 3
          ? `🟡 ${passed}/5 항목 충족 · 미체크 항목을 점검하고 1차 분할 매수로 접근하세요.`
          : `🔴 ${passed}/5 항목 충족 · 뇌동매매(추격매수) 위험이 높습니다. 매수 전 손절가와 분할 계획을 먼저 세우세요.`;
      scoreBanner.append(make('strong', '', statusText));
    }

    CHECK_ITEMS.forEach((label, idx) => {
      const row = make('label', 'inv-check-row');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = states[idx];
      cb.addEventListener('change', () => {
        states[idx] = cb.checked;
        updateScore();
      });
      row.append(cb, make('span', '', label));
      listWrap.append(row);
    });

    updateScore();
    checkSection.append(scoreBanner, listWrap);

    // 매매 복기 일지 (localStorage 저장)
    const journalSec = make('div', 'inv-journal-section');
    journalSec.append(make('h4', 'inv-sub-heading', '📝 나만의 실전 매매 복기 일지 (이 브라우저에 자동 보관)'));

    const STORAGE_KEY = 'zero_investor_trade_journal_v1';
    const loadEntries = () => {
      try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
      } catch (_) {
        return [];
      }
    };
    const saveEntries = (arr) => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, 30))); } catch (_) {}
    };

    const form = make('form', 'inv-journal-form');
    const tickerIn = make('input', 'inv-input'); tickerIn.placeholder = '종목명 (예: 삼성전자, NVDA)'; tickerIn.maxLength = 30;
    const actionSelect = make('select', 'inv-input');
    [['BUY', '매수 진입'], ['ADD', '분할 추매'], ['TAKE', '익절 매도'], ['STOP', '손절 원칙 준수'], ['WATCH', '관망·대기']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t; actionSelect.append(o);
    });
    const priceIn = make('input', 'inv-input'); priceIn.placeholder = '단가 / 목표·손절가'; priceIn.maxLength = 40;
    const memoIn = make('input', 'inv-input inv-memo-wide'); memoIn.placeholder = '매매 근거 한 줄 기록 (예: 52주 신저가 지지 확인 후 1차 30% 분할매수)'; memoIn.maxLength = 120;
    const addBtn = make('button', 'primary-button inv-journal-btn', '일지 기록'); addBtn.type = 'submit';
    form.append(tickerIn, actionSelect, priceIn, memoIn, addBtn);

    const listEl = make('div', 'inv-journal-list');
    function paintJournal() {
      listEl.replaceChildren();
      let items = loadEntries();
      if (items.length === 0) {
        items = [
          { id: 'sample-1', date: '예시 기록', ticker: 'NVIDIA (NVDA)', action: '분할 추매', price: '$138.50 (목표 $165 / 손절 $125)', memo: '실적 발표 전 조정 구간 1차 분할 진입 · 계좌 비중 15% 준수' }
        ];
      }
      items.forEach((item) => {
        const itemRow = make('div', 'inv-journal-item');
        const left = make('div', 'inv-journal-main');
        left.append(
          make('span', 'inv-journal-badge', item.action || '기록'),
          make('strong', 'inv-journal-ticker', item.ticker),
          make('span', 'inv-journal-price', item.price || ''),
          make('p', 'inv-journal-memo', item.memo || '')
        );
        const right = make('div', 'inv-journal-meta');
        right.append(make('small', '', item.date || ''));
        if (item.id !== 'sample-1') {
          const del = make('button', 'inv-journal-del', '삭제');
          del.type = 'button';
          del.addEventListener('click', () => {
            const next = loadEntries().filter((x) => x.id !== item.id);
            saveEntries(next);
            paintJournal();
          });
          right.append(del);
        }
        itemRow.append(left, right);
        listEl.append(itemRow);
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const ticker = tickerIn.value.trim();
      const memo = memoIn.value.trim();
      if (!ticker && !memo) return;
      const now = new Date();
      const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const actionLabel = actionSelect.options[actionSelect.selectedIndex]?.textContent || '매수 진입';
      const current = loadEntries();
      current.unshift({
        id: 'j-' + Date.now(),
        date: dateStr,
        ticker: ticker || '관심 종목',
        action: actionLabel,
        price: priceIn.value.trim() || '시장가',
        memo: memo || '원칙 매매 기록'
      });
      saveEntries(current);
      tickerIn.value = ''; priceIn.value = ''; memoIn.value = '';
      paintJournal();
    });

    paintJournal();
    journalSec.append(form, listEl);
    wrap.append(checkSection, journalSec);
    container.append(wrap);
  }

  // ── 통합 실전 투자자 워크스테이션 카드 빌더 ──
  function buildInvestorToolkitCard(cardId) {
    const section = make('section', 'th-card inv-toolkit-card');
    section.id = cardId;
    section.setAttribute('aria-label', '실전 주식 투자자 필수 계산기 및 매매 워크스테이션');

    function renderCard() {
      section.replaceChildren();
      const head = make('div', 'th-card-heading inv-head');
      const titleWrap = make('div', '');
      titleWrap.append(
        make('h2', '', '🧮 실전 투자자 매매 워크스테이션 · 평단가 · 손익비 · 양도세 · 원칙일지'),
        make('p', 'muted-note', '매수·매도 버튼 누르기 전 10초 점검! 물타기 탈출 층수, 손절 수량(포지션 사이징), 해외주식 250만원 양도소득세를 즉시 계산하세요.')
      );
      const badge = make('span', 'badge-kakao-floor', '실전 투자 필수도구');
      head.append(titleWrap, badge);

      const tabs = make('div', 'th-sub-tabs inv-tabs');
      const tabDefs = [
        ['avg', '💧 물타기 · 평단가 · 층수 계산기'],
        ['rr', '🎯 손익비(R:R) · 적정 수량 계산기'],
        ['tax', '🧾 미국·국내 주식 세금 · 수수료 계산기'],
        ['check', '📋 매수 전 5대 체크리스트 · 일지']
      ];

      tabDefs.forEach(([key, label]) => {
        const b = make('button', 'th-sub-tab' + (calcState.activeTab === key ? ' active' : ''), label);
        b.type = 'button';
        b.addEventListener('click', () => {
          calcState.activeTab = key;
          syncAllToolkits();
        });
        tabs.append(b);
      });

      const body = make('div', 'inv-body');
      if (calcState.activeTab === 'avg') renderAvgCalculator(body, syncAllToolkits);
      else if (calcState.activeTab === 'rr') renderRiskRewardCalculator(body, syncAllToolkits);
      else if (calcState.activeTab === 'tax') renderTaxCalculator(body, syncAllToolkits);
      else renderChecklistAndJournal(body);

      section.append(head, tabs, body);
    }

    section._render = renderCard;
    renderCard();
    return section;
  }

  // ── 5. 실시간 주도 섹터 · 핵심 종목 스크리너 빌더 (#home-view 전용) ──
  function buildSectorScreenerCard() {
    const section = make('section', 'th-card inv-screener-card');
    section.id = 'zero-sector-screener';
    section.setAttribute('aria-label', '실시간 주도 섹터 및 핵심 종목 스크리너');

    function renderScreener() {
      section.replaceChildren();
      const head = make('div', 'th-card-heading inv-head');
      const titleWrap = make('div', '');
      titleWrap.append(
        make('h2', '', '🧭 실시간 주도 섹터 · 핵심 종목 빠른 스크리너'),
        make('p', 'muted-note', '시장 주도 테마별 핵심 종목의 투자 포인트를 비교하고, 종목을 눌러 실시간 차트·호가·수급·층수를 바로 확인하세요.')
      );
      head.append(titleWrap, make('span', 'figma-pill badge-dividend-pill', '종목 발굴'));

      const tabs = make('div', 'th-sub-tabs inv-tabs');
      Object.entries(SECTOR_GROUPS).forEach(([key, grp]) => {
        const b = make('button', 'th-sub-tab' + (calcState.activeSector === key ? ' active' : ''), grp.label);
        b.type = 'button';
        b.addEventListener('click', () => {
          calcState.activeSector = key;
          renderScreener();
        });
        tabs.append(b);
      });

      const currentGrp = SECTOR_GROUPS[calcState.activeSector] || SECTOR_GROUPS.ai;
      const grpDesc = make('p', 'inv-sector-desc', currentGrp.desc);

      const grid = make('div', 'inv-screener-grid');
      currentGrp.items.forEach((item) => {
        const isUS = item.market === 'US';
        const card = make('article', 'inv-stock-card');
        const top = make('div', 'inv-stock-top');
        const left = make('div', '');
        left.append(
          make('span', 'inv-market-badge ' + (isUS ? 'us' : 'kr'), isUS ? 'US · ' + item.code : 'KR · ' + item.code),
          make('strong', 'inv-stock-name', item.name)
        );
        const tag = make('span', 'inv-stock-tag', item.tag);
        top.append(left, tag);

        const point = make('p', 'inv-stock-point', item.point);

        const actions = make('div', 'inv-stock-actions');
        const chartBtn = make('button', 'inv-action-btn primary', '📊 차트·호가·수급 보기');
        chartBtn.type = 'button';
        chartBtn.addEventListener('click', () => openStockDetail(item.id));

        const calcBtn = make('button', 'inv-action-btn secondary', '💧 이 종목 물타기 계산');
        calcBtn.type = 'button';
        calcBtn.addEventListener('click', () => {
          calcState.activeTab = 'avg';
          calcState.avg.name = item.name;
          calcState.avg.market = item.market;
          calcState.avg.myAvg = item.avgPrice;
          calcState.avg.curPrice = item.curPrice;
          calcState.avg.addPrice = item.curPrice;
          calcState.avg.myQty = isUS ? 20 : 30;
          calcState.avg.addQty = isUS ? 10 : 20;
          syncAllToolkits();
          const toolkitEl = document.getElementById('zero-home-investor-toolkit') || document.getElementById('zero-portfolio-investor-toolkit');
          toolkitEl?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        });

        actions.append(chartBtn, calcBtn);
        card.append(top, point, actions);
        grid.append(card);
      });

      section.append(head, tabs, grpDesc, grid);
    }

    renderScreener();
    return section;
  }

  function syncAllToolkits() {
    ['zero-home-investor-toolkit', 'zero-portfolio-investor-toolkit'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && typeof el._render === 'function') el._render();
    });
  }

  function mountInvestorWorkstation() {
    // 1. 내 자산 (#portfolio-view) 내 층수 레이더 바로 아래에 실전 매매 워크스테이션 장착
    const portfolioView = document.getElementById('portfolio-view');
    if (portfolioView && !document.getElementById('zero-portfolio-investor-toolkit')) {
      const floorRadar = document.getElementById('portfolio-floor-radar');
      const toolkit = buildInvestorToolkitCard('zero-portfolio-investor-toolkit');
      if (floorRadar && floorRadar.parentNode === portfolioView) {
        floorRadar.insertAdjacentElement('afterend', toolkit);
      } else {
        portfolioView.prepend(toolkit);
      }
    }

    // 2. 홈 화면 (#toss-home .th-main) 내에 실전 매매 워크스테이션 & 주도 섹터 스크리너 장착
    const tossMain = document.querySelector('#toss-home .th-main');
    if (tossMain) {
      if (!document.getElementById('zero-sector-screener')) {
        const screener = buildSectorScreenerCard();
        const smartRadar = tossMain.querySelector('.th-smart-action-radar');
        if (smartRadar) {
          smartRadar.insertAdjacentElement('afterend', screener);
        } else {
          tossMain.append(screener);
        }
      }
      if (!document.getElementById('zero-home-investor-toolkit')) {
        const homeToolkit = buildInvestorToolkitCard('zero-home-investor-toolkit');
        const screenerEl = document.getElementById('zero-sector-screener');
        if (screenerEl && screenerEl.parentNode === tossMain) {
          screenerEl.insertAdjacentElement('afterend', homeToolkit);
        } else {
          tossMain.append(homeToolkit);
        }
      }
    }
  }

  function setupMoreMenuNavigation() {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('#more-menu [data-view]') : null;
      if (!btn) return;
      const targetView = btn.getAttribute('data-view');
      const moreMenu = document.getElementById('more-menu');
      if (moreMenu && typeof moreMenu.close === 'function' && moreMenu.open) {
        try { moreMenu.close(); } catch (_) {}
      }
      if (targetView) {
        const navProxy = document.querySelector(`.rail [data-view="${targetView}"], .mobile-tabbar [data-view="${targetView}"]`);
        if (navProxy && navProxy !== btn) {
          navProxy.click();
        }
        setTimeout(ensureTeamOfficeVisible, 60);
      }
    });
  }

  function boot() {
    removeGameElements();
    ensureTeamOfficeVisible();
    setupMoreMenuNavigation();
    mountInvestorWorkstation();
    document.addEventListener('zero-ready', () => {
      mountInvestorWorkstation();
      syncAllToolkits();
    });
    document.addEventListener('zero-view-changed', () => {
      ensureTeamOfficeVisible();
      mountInvestorWorkstation();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
