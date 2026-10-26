// -*- coding: utf-8 -*-
/* ZERO 자산운용사 타이쿤 (AI Fund House Tycoon) — 토스증권 + 카카오페이증권 + 내 운용사 키우기 통합 시스템
   - 중세 판타지 요소(마법사·드래곤·포션·성검)를 전면 제거하고 ZERO의 정체성인 '1억 시드 AI 자산운용사 경영 & 소셜 투자 리그'로 일원화
   - 1) 상단 원터치 캡슐 내비게이션 & 내 운용사 등급 배지 (#zero-easy-mode-bar)
   - 2) 내 사무실 (#lobby-view): 캔버스 맵 시야 방해 제로 + 하단 '내 운용사 데스크 & 오늘의 3분 투자 미션' 카드 (#office-rpg-hud)
   - 3) ZERO 45인 팀 (#team-view): 45인 전문가 오피스 맵 최상단 유지 + 초보자 3초 선택 '나만의 AI 투자위원회(4인 드림팀)' (#team-rpg-builder)
   - 4) 실시간 광장 (#plaza-view): 아바타 라운지 + '오늘의 🐂강세장(Bull) vs 🐻약세장(Bear) 실시간 예측 매치 & 수익률 리그' (#rpg-plaza-interactive-stage)
   - 5) 투자 홈 (#home-view): 토스증권 스타일 '내 운용사 & AI 투자위원회 브리핑' 컴팩트 배너 (#home-rpg-gateway) */
(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const TYCOON_STORE_KEY = 'zero_tycoon_state_v5';

  const FIRM_TIERS = [
    { minLv: 1, badge: '🌱 루키 에셋', title: '시드 1억 스타트 운용사', nextGoal: '데일리 미션으로 부티크 펀드 승격' },
    { minLv: 3, badge: '🏢 부티크 파트너스', title: '강남 프라이빗 자산운용사', nextGoal: 'AI 투자위원회 스카우트 완성' },
    { minLv: 6, badge: '🏛️ 월스트리트 알파', title: '글로벌 퀀트·배당 헤지펀드', nextGoal: '주간 수익률 리그 상위권 도전' },
    { minLv: 10, badge: '👑 글로벌 마스터 펀드', title: '전설의 AI 자산운용 하우스', nextGoal: '장기 복리 포트폴리오 완성' }
  ];

  function getTierForLevel(lv) {
    let current = FIRM_TIERS[0];
    for (const t of FIRM_TIERS) {
      if (lv >= t.minLv) current = t;
    }
    return current;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getTycoonState() {
    try {
      const raw = localStorage.getItem(TYCOON_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) {}
    return {
      level: 3,
      exp: 180,
      maxExp: 300,
      zp: 1250, // ZERO 운용 포인트 (ZP)
      streak: 3,
      activeCommitteeId: 'golden_balance',
      officeTheme: 'wallstreet',
      analystLevels: {
        quant: 5,
        growth: 4,
        macro: 5,
        dividend: 4
      },
      dailyMissions: {}, // { 'YYYY-MM-DD:market': true, ... }
      marketVote: null,  // { date: 'YYYY-MM-DD', side: 'BULL' | 'BEAR' }
      bullVotes: 64,
      bearVotes: 36
    };
  }

  function saveTycoonState(state) {
    try {
      localStorage.setItem(TYCOON_STORE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function gainReward(state, expGain, zpGain, reasonText) {
    state.exp = (Number(state.exp) || 0) + expGain;
    state.zp = (Number(state.zp) || 0) + zpGain;
    let leveledUp = false;
    while (state.exp >= (state.maxExp || 300)) {
      state.exp -= (state.maxExp || 300);
      state.level = (Number(state.level) || 1) + 1;
      state.maxExp = 200 + state.level * 100;
      leveledUp = true;
    }
    saveTycoonState(state);
    if (leveledUp) {
      const tier = getTierForLevel(state.level);
      showToast(`🎉 운용사 레벨 업! [Lv.${state.level} ${tier.badge}] 등급으로 승격했습니다!`);
    } else if (reasonText) {
      showToast(`✅ ${reasonText} (+${expGain} XP · +${zpGain} ZP)`);
    }
    refreshAllTycoonUI();
  }

  // ── 모던 핀테크 AI 애널리스트 SVG 아바타 (판타지 모자/무기 제거, 세련된 수트·안경·차트·태블릿) ──
  function getAnalystSvg(role, size = 72) {
    const r = String(role || 'QUANT').toUpperCase();
    if (r === 'QUANT' || r === 'LEADER') {
      // ⚖️ 수석 퀀트·자산배분 위원장 (네이비 수트 + 스마트 안경 + 황금 배지)
      return `<svg class="tycoon-avatar-svg role-quant" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="#eff6ff" stroke="#bfdbfe" stroke-width="2"/>
        <path d="M24 88 C26 64 74 64 76 88 Z" fill="#1e3a8a"/>
        <polygon points="44,64 50,86 56,64" fill="#ffffff"/>
        <polygon points="48,66 50,84 52,66" fill="#2563eb"/>
        <circle cx="50" cy="42" r="18" fill="#fde6ce"/>
        <path d="M32 39 C33 22 67 22 68 39 C62 31 38 31 32 39 Z" fill="#334155"/>
        <rect x="37" y="38" width="10" height="7" rx="2" fill="none" stroke="#1e293b" stroke-width="2"/>
        <rect x="53" y="38" width="10" height="7" rx="2" fill="none" stroke="#1e293b" stroke-width="2"/>
        <line x1="47" y1="41" x2="53" y2="41" stroke="#1e293b" stroke-width="2"/>
        <circle cx="42" cy="41.5" r="2" fill="#0f172a"/>
        <circle cx="58" cy="41.5" r="2" fill="#0f172a"/>
        <path d="M45 50 Q50 54 55 50" fill="none" stroke="#9a3412" stroke-width="2" stroke-linecap="round"/>
        <rect x="60" y="71" width="12" height="6" rx="2" fill="#f59e0b"/>
      </svg>`;
    }
    if (r === 'GROWTH' || r === 'DEALER') {
      // 🚀 글로벌 테크·성장주 수석 (토스 블루 재킷 + 트렌드 헤드셋)
      return `<svg class="tycoon-avatar-svg role-growth" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="#eef2ff" stroke="#c7d2fe" stroke-width="2"/>
        <path d="M24 88 C26 64 74 64 76 88 Z" fill="#2563eb"/>
        <path d="M42 64 L50 82 L58 64 Z" fill="#f8fafc"/>
        <circle cx="50" cy="42" r="18" fill="#fde6ce"/>
        <path d="M31 38 C34 20 66 20 69 38 L64 31 L50 34 L36 31 Z" fill="#1e293b"/>
        <path d="M30 42 A20 20 0 0 1 70 42" fill="none" stroke="#3b82f6" stroke-width="3.5"/>
        <rect x="27" y="38" width="5" height="10" rx="2.5" fill="#1d4ed8"/>
        <rect x="68" y="38" width="5" height="10" rx="2.5" fill="#1d4ed8"/>
        <circle cx="43" cy="42" r="2.3" fill="#0f172a"/>
        <circle cx="57" cy="42" r="2.3" fill="#0f172a"/>
        <path d="M45 50 Q50 54.5 55 50" fill="none" stroke="#9a3412" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    }
    if (r === 'MACRO' || r === 'TANKER') {
      // 🛡️ 리스크·거시경제 방어 수석 (차콜 수트 + 에메랄드 타이)
      return `<svg class="tycoon-avatar-svg role-macro" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="2"/>
        <path d="M24 88 C26 64 74 64 76 88 Z" fill="#0f172a"/>
        <polygon points="44,64 50,86 56,64" fill="#ffffff"/>
        <polygon points="48,66 50,84 52,66" fill="#10b981"/>
        <circle cx="50" cy="42" r="18" fill="#fde6ce"/>
        <path d="M32 38 C35 22 65 22 68 38 C60 30 40 30 32 38 Z" fill="#64748b"/>
        <circle cx="43" cy="42" r="2.2" fill="#0f172a"/>
        <circle cx="57" cy="42" r="2.2" fill="#0f172a"/>
        <path d="M45 50 Q50 53 55 50" fill="none" stroke="#9a3412" stroke-width="2" stroke-linecap="round"/>
        <circle cx="63" cy="73" r="4" fill="#10b981"/>
      </svg>`;
    }
    // 💰 배당·현금흐름 수석 (웜 세이지 가디건 + 골드 배지)
    return `<svg class="tycoon-avatar-svg role-dividend" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#fffbeb" stroke="#fde68a" stroke-width="2"/>
      <path d="M24 88 C26 64 74 64 76 88 Z" fill="#047857"/>
      <path d="M43 64 L50 80 L57 64 Z" fill="#fef3c7"/>
      <circle cx="50" cy="42" r="18" fill="#fde6ce"/>
      <path d="M32 40 C34 22 66 22 68 40 C61 31 39 31 32 40 Z" fill="#78350f"/>
      <circle cx="43" cy="42" r="2.2" fill="#0f172a"/>
      <circle cx="57" cy="42" r="2.2" fill="#0f172a"/>
      <path d="M45 50 Q50 54 55 50" fill="none" stroke="#9a3412" stroke-width="2" stroke-linecap="round"/>
      <rect x="59" y="71" width="11" height="6" rx="2" fill="#fbbf24"/>
    </svg>`;
  }

  // ── 3대 투자위원회 프리셋 데이터 (경제·주식을 몰라도 3초 만에 이해하는 구성) ──
  const COMMITTEES = [
    {
      id: 'golden_balance',
      name: '⚖️ 황금 균형 위원회',
      tag: '초보자 1순위 추천',
      summary: '미국 우량 성장주(64%)로 수익을 내고, 미국 단기국채(16%)와 한국 가치주(20%)로 하락장을 든든하게 방어하는 ZERO의 표준 전략팀이에요.',
      allocation: [
        { label: '미국 성장주', pct: 64, color: '#3182f6' },
        { label: '안전 국채·현금', pct: 16, color: '#10b981' },
        { label: '한국 저평가 가치주', pct: 20, color: '#f59e0b' }
      ],
      metrics: { growth: 86, defense: 92, cashflow: 84 },
      members: [
        {
          key: 'quant',
          role: 'QUANT',
          roleBadge: '⚖️ 위원장 · 퀀트 비중조율',
          name: '에드워드 소프',
          specialty: '켈리 공식 자산배분 수석',
          weight: '포트폴리오 총괄',
          easyDesc: '주식이 너무 많이 오르거나 떨어질 때만 리밸런싱해서 세금과 수수료 낭비를 막아줘요.',
          quote: '“잦은 매매를 멈추고 확률이 유리할 때만 움직이는 것이 복리의 핵심입니다.”'
        },
        {
          key: 'growth',
          role: 'GROWTH',
          roleBadge: '🚀 미국 주식 64%',
          name: '피터 린치',
          specialty: '미국 S&P500 · 빅테크 성장 수석',
          weight: '목표 비중 64%',
          easyDesc: '우리가 매일 쓰는 애플·마이크로소프트·엔비디아 같은 미국 1등 기업으로 자산을 키워요.',
          quote: '“일상에서 만나는 최고의 성장 기업을 꾸준히 보유하세요.”'
        },
        {
          key: 'macro',
          role: 'MACRO',
          roleBadge: '🛡️ 안전 채권 16%',
          name: '워런 버핏',
          specialty: '미국 단기국채 · 현금 방어 수석',
          weight: '목표 비중 16%',
          easyDesc: '주식 시장이 갑자기 폭락할 때 흔들리지 않도록 안전자산(달러 국채) 방파제를 지켜요.',
          quote: '“제1원칙은 돈을 잃지 않는 것입니다. 현금성 국채는 폭락장의 가장 든든한 무기입니다.”'
        },
        {
          key: 'dividend',
          role: 'DIVIDEND',
          roleBadge: '💰 한국 가치·배당 20%',
          name: '레이 달리오',
          specialty: '국내 우량주 · 배당 분산 수석',
          weight: '목표 비중 20%',
          easyDesc: '미국 주식과 다르게 움직이는 한국 핵심 수출·배당주로 환율과 시장 위험을 나눠요.',
          quote: '“서로 다른 국가와 자산을 섞어두면 어떤 경제 계절이 와도 계좌가 편안합니다.”'
        }
      ]
    },
    {
      id: 'us_bigtech_growth',
      name: '🚀 미국 빅테크 성장 위원회',
      tag: '공격형 · 고성장 추구',
      summary: 'AI·반도체·클라우드 산업을 이끄는 미국 핵심 기술주 비중을 높여 장기 자산 증식 속도를 극대화하는 팀이에요.',
      allocation: [
        { label: '미국 AI·빅테크', pct: 75, color: '#2563eb' },
        { label: '안전 달러채권', pct: 15, color: '#10b981' },
        { label: '글로벌 반도체', pct: 10, color: '#8b5cf6' }
      ],
      metrics: { growth: 96, defense: 74, cashflow: 70 },
      members: [
        {
          key: 'growth',
          role: 'GROWTH',
          roleBadge: '🚀 위원장 · 초우량 기술주',
          name: '필립 피셔',
          specialty: '혁신 기술주 리서치 수석',
          weight: '핵심 성장 45%',
          easyDesc: '독보적인 기술력과 연구개발(R&D)을 가진 1등 테크 기업을 발굴해 장기 보유해요.',
          quote: '“압도적인 기술 해자를 가진 기업은 시장 평균을 뛰어넘는 성장을 만듭니다.”'
        },
        {
          key: 'quant',
          role: 'QUANT',
          roleBadge: '⚖️ 데이터 퀀트 30%',
          name: '짐 사이먼스',
          specialty: '통계적 모멘텀 · 추세 수석',
          weight: '추세 추종 30%',
          easyDesc: '감정을 배제하고 거래대금과 실적 추세 데이터를 분석해 주도주 비중을 조절해요.',
          quote: '“감이 아닌 검증된 가격·실적 데이터로만 비중을 판단합니다.”'
        },
        {
          key: 'macro',
          role: 'MACRO',
          roleBadge: '🛡️ 매크로 방어 15%',
          name: '스탠리 드러켄밀러',
          specialty: '글로벌 유동성 · 금리 수석',
          weight: '유동성 방어 15%',
          easyDesc: '미국 연준(Fed)의 금리와 시장 유동성 변화를 읽어 기술주 과열 위험을 미리 경보해요.',
          quote: '“기업 실적만큼 중요한 것이 중앙은행의 유동성 방향입니다.”'
        },
        {
          key: 'dividend',
          role: 'DIVIDEND',
          roleBadge: '💰 배당 성장 10%',
          name: '피터 린치',
          specialty: '실적 기반 배당성장 수석',
          weight: '배당성장 10%',
          easyDesc: '이익이 매년 늘어나면서 배당도 함께 올려주는 알짜 성장주를 챙겨요.',
          quote: '“이익이 늘어나는 기업의 주가는 결국 그 실적을 따라갑니다.”'
        }
      ]
    },
    {
      id: 'dividend_peace',
      name: '🛡️ 마음 편한 배당·안정 위원회',
      tag: '안정형 · 현금흐름 중시',
      summary: '주가 등락에 스트레스받지 않도록 우량 배당주와 안전 국채 비중을 높여 따박따박 현금흐름과 원금 방어를 챙기는 팀이에요.',
      allocation: [
        { label: '미국·한국 고배당주', pct: 50, color: '#059669' },
        { label: '안전 국채·단기채', pct: 35, color: '#3182f6' },
        { label: '저변동 우량주', pct: 15, color: '#f59e0b' }
      ],
      metrics: { growth: 72, defense: 97, cashflow: 96 },
      members: [
        {
          key: 'macro',
          role: 'MACRO',
          roleBadge: '🛡️ 위원장 · 안전마진 수호',
          name: '벤저민 그레이엄',
          specialty: '안전마진 · 원금방어 수석',
          weight: '방어 총괄',
          easyDesc: '기업의 실제 자산 가치보다 싸게 거래되는 안전한 종목만 골라 손실 위험을 낮춰요.',
          quote: '“안전마진이 확보된 투자는 밤에 두 다리 뻗고 편히 잘 수 있게 해줍니다.”'
        },
        {
          key: 'dividend',
          role: 'DIVIDEND',
          roleBadge: '💰 배당 현금흐름 50%',
          name: '존 보글',
          specialty: '저비용 인덱스 · 배당 수석',
          weight: '배당·인덱스 50%',
          easyDesc: '수수료가 낮고 꾸준히 배당금을 지급하는 우량 ETF와 배당주로 현금흐름을 만들어요.',
          quote: '“비용을 아끼고 시장 전체의 배당과 성장을 통째로 소유하세요.”'
        },
        {
          key: 'quant',
          role: 'QUANT',
          roleBadge: '⚖️ 사이클 방어 35%',
          name: '하워드 막스',
          specialty: '시장 사이클 · 채권 수석',
          weight: '안전채권 35%',
          easyDesc: '시장이 과열됐을 때 욕심을 줄이고 안전 채권 비중을 높여 계좌의 낙폭을 막아줘요.',
          quote: '“지금이 공격할 때인지 수비할 때인지 아는 것이 가장 중요합니다.”'
        },
        {
          key: 'growth',
          role: 'GROWTH',
          roleBadge: '🌱 물가 방어 15%',
          name: '폴 볼커',
          specialty: '금리 · 인플레이션 방어 수석',
          weight: '물가방어 15%',
          easyDesc: '물가 상승(인플레이션)에도 화폐 가치가 녹지 않도록 가격 결정력이 있는 우량주를 지켜요.',
          quote: '“인플레이션을 이기는 실질 구매력 보존이 장기 투자의 목표입니다.”'
        }
      ]
    }
  ];

  function getActiveCommittee(state) {
    return COMMITTEES.find(c => c.id === state.activeCommitteeId) || COMMITTEES[0];
  }

  // ── 토스트 알림 ──
  function showToast(msg) {
    let t = document.getElementById('zero-tycoon-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'zero-tycoon-toast';
      t.className = 'rpg-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ── 비로그인 상태에서 실시간 광장 진입 시 자동 프로필 모달이 화면을 가로막지 않도록 제어 ──
  let allowExplicitProfileDialog = false;
  function suppressAutoProfileModal() {
    if (allowExplicitProfileDialog) return;
    const dlg = document.getElementById('member-profile-dialog');
    if (dlg && dlg.open) {
      try { dlg.close(); } catch (_) {}
      dlg.removeAttribute('open');
    }
  }

  // ── 전역 화면 전환 헬퍼 (사무실·ZERO팀·광장·모의투자·홈 100% 작동 보장) ──
  function navigateToView(targetView) {
    if (!targetView) return;
    const moreMenu = document.getElementById('more-menu');
    if (moreMenu && moreMenu.open) {
      try { moreMenu.close(); } catch (_) {}
      moreMenu.removeAttribute('open');
    }
    if (targetView === 'plaza') {
      allowExplicitProfileDialog = false;
      setTimeout(suppressAutoProfileModal, 0);
      setTimeout(suppressAutoProfileModal, 60);
      setTimeout(suppressAutoProfileModal, 180);
    }
    if (targetView === 'team') {
      const officePanel = document.getElementById('office-panel');
      if (officePanel) officePanel.classList.remove('viewport-page-away');
    }
    const navBtn = document.querySelector(`.rail .nav-item[data-view="${targetView}"], .global-navigation [data-view="${targetView}"], .mts-subnav [data-view="${targetView}"], .mobile-tabbar [data-view="${targetView}"]`);
    if (navBtn) navBtn.click();
    if (window.location.hash !== `#${targetView}`) {
      window.location.hash = `#${targetView}`;
    } else {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    setTimeout(() => {
      if (targetView === 'plaza') suppressAutoProfileModal();
      refreshAllTycoonUI();
    }, 60);
  }

  window.ZERORpg = {
    navigateToView,
    openCeoPassModal,
    openAnalystModal
  };

  // 전역 캡처 클릭 핸들러 (#more-menu 및 [data-rpg-goto] 즉시 반응)
  if (!window.__zeroTycoonGlobalClickBound) {
    window.__zeroTycoonGlobalClickBound = true;
    document.addEventListener('click', (e) => {
      const explicitProfileBtn = e.target.closest('#member-entry, #lobby-profile-btn, #lounge-open-profile, [data-open-profile]');
      if (explicitProfileBtn) {
        allowExplicitProfileDialog = true;
        setTimeout(() => { allowExplicitProfileDialog = false; }, 1200);
        return;
      }
      const moreItem = e.target.closest('#more-menu [data-view]');
      if (moreItem) {
        const v = moreItem.getAttribute('data-view');
        if (v) {
          e.preventDefault();
          e.stopPropagation();
          navigateToView(v);
          return;
        }
      }
      const gotoBtn = e.target.closest('[data-rpg-goto]');
      if (gotoBtn) {
        const v = gotoBtn.getAttribute('data-rpg-goto');
        if (v) {
          e.preventDefault();
          navigateToView(v);
        }
      }
    }, true);
  }

  // ── 1. 상단 원터치 캡슐 내비게이션 & 내 운용사 등급 배지 (#zero-easy-mode-bar) ──
  function setupGlobalEasyBar() {
    const mainEl = document.getElementById('main') || document.querySelector('main');
    if (!mainEl) return;

    let bar = document.getElementById('zero-easy-mode-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'zero-easy-mode-bar';
      bar.className = 'zero-easy-mode-bar';
      mainEl.prepend(bar);
    }

    const state = getTycoonState();
    const tier = getTierForLevel(state.level);
    const today = todayKey();
    const doneCount = ['market', 'briefing', 'portfolio'].filter(k => state.dailyMissions?.[`${today}:${k}`]).length;
    const isDark = document.documentElement.dataset.zeroTheme === 'dark';
    const currentView = document.documentElement.dataset.zeroView || (window.location.hash || '#portfolio').replace('#', '') || 'portfolio';

    bar.innerHTML = `
      <div class="easy-bar-inner">
        <div class="easy-bar-modes" role="navigation" aria-label="핵심 공간 빠른 이동">
          <button type="button" class="easy-mode-btn ${currentView === 'lobby' ? 'active' : ''}" data-easy-view="lobby">
            🏢 <span>내 사무실</span>
          </button>
          <button type="button" class="easy-mode-btn ${currentView === 'team' ? 'active' : ''}" data-easy-view="team">
            👥 <span>ZERO 45인 팀</span>
          </button>
          <button type="button" class="easy-mode-btn ${currentView === 'plaza' ? 'active' : ''}" data-easy-view="plaza">
            💬 <span>실시간 광장</span>
          </button>
          <button type="button" class="easy-mode-btn ${currentView === 'portfolio' ? 'active' : ''}" data-easy-view="portfolio">
            💰 <span>1억 모의투자</span>
          </button>
          <button type="button" class="easy-mode-btn ${currentView === 'home' ? 'active' : ''}" data-easy-view="home">
            🏠 <span>투자 홈</span>
          </button>
        </div>
        <div class="easy-bar-actions">
          <button type="button" class="tycoon-pass-pill" id="open-ceo-pass-btn" title="내 운용사 등급 및 오늘의 미션 보기">
            <span class="pass-lv">Lv.${state.level}</span>
            <strong class="pass-tier">${tier.badge}</strong>
            <span class="pass-zp">${Number(state.zp || 0).toLocaleString()} ZP</span>
            <span class="pass-mission-dot">미션 ${doneCount}/3</span>
          </button>
          <button type="button" class="easy-util-btn" id="easy-all-menu-btn">☰ 메뉴</button>
          <button type="button" class="easy-util-btn" id="easy-theme-toggle-btn">${isDark ? '☀️ 라이트' : '🌙 다크'}</button>
        </div>
      </div>
    `;

    bar.querySelectorAll('[data-easy-view]').forEach(btn => {
      btn.addEventListener('click', () => navigateToView(btn.dataset.easyView));
    });

    bar.querySelector('#open-ceo-pass-btn')?.addEventListener('click', () => openCeoPassModal());

    bar.querySelector('#easy-all-menu-btn')?.addEventListener('click', () => {
      const moreMenu = document.getElementById('more-menu');
      if (moreMenu && typeof moreMenu.showModal === 'function') moreMenu.showModal();
      else document.querySelector('.menu-open')?.click();
    });

    bar.querySelector('#easy-theme-toggle-btn')?.addEventListener('click', () => {
      const next = document.documentElement.dataset.zeroTheme === 'dark' ? 'light' : 'dark';
      if (window.ZERODarkTheme?.set) window.ZERODarkTheme.set(next);
      else {
        document.documentElement.dataset.zeroTheme = next;
        document.documentElement.dataset.theme = next;
        document.documentElement.classList.toggle('dark', next === 'dark');
        try { localStorage.setItem('zero_theme', next); } catch (_) {}
      }
      setupGlobalEasyBar();
    });
  }

  // ── 2. 투자 홈 (#home-view) 상단: 컴팩트한 '내 운용사 & AI 투자위원회 브리핑' 배너 (#home-rpg-gateway) ──
  function setupHomeRpgGateway() {
    const tossHome = document.getElementById('toss-home');
    if (!tossHome) return;

    let banner = document.getElementById('home-rpg-gateway');
    if (!banner) {
      banner = document.createElement('section');
      banner.id = 'home-rpg-gateway';
      banner.className = 'tycoon-home-banner';
      tossHome.prepend(banner);
    }

    const state = getTycoonState();
    const tier = getTierForLevel(state.level);
    const committee = getActiveCommittee(state);
    const leader = committee.members[0];

    banner.innerHTML = `
      <div class="tycoon-home-left">
        <div class="tycoon-home-avatar">${getAnalystSvg(leader.role, 56)}</div>
        <div class="tycoon-home-copy">
          <div class="tycoon-home-badges">
            <span class="tycoon-pill-blue">Lv.${state.level} ${tier.badge}</span>
            <span class="tycoon-pill-gray">가동 중: ${committee.name}</span>
          </div>
          <strong class="tycoon-home-headline">${leader.name} 위원장: ${leader.quote}</strong>
          <p class="tycoon-home-sub">${committee.summary}</p>
        </div>
      </div>
      <div class="tycoon-home-actions">
        <button type="button" class="tycoon-btn-primary" data-rpg-goto="lobby">🏢 내 사무실 데스크</button>
        <button type="button" class="tycoon-btn-secondary" data-rpg-goto="team">👥 드림팀 변경</button>
        <button type="button" class="tycoon-btn-secondary" data-rpg-goto="plaza">💬 오늘 증시 투표</button>
      </div>
    `;
  }

  // ── 3. 내 사무실 (#lobby-view): 캔버스 시야 방해 오버레이 완전 제거 + 하단 '내 운용사 데스크 & 데일리 3분 미션' 카드 ──
  function setupOfficeRpg() {
    const lobbyMain = document.querySelector('#lobby-view .lobby-main');
    if (!lobbyMain) return;

    // 기존에 캔버스 위를 가리던 판타지 오버레이와 슬림 바가 남아 있으면 즉시 제거
    document.getElementById('office-map-rpg-overlay')?.remove();
    document.getElementById('office-rpg-slim-bar')?.remove();

    let deskCard = document.getElementById('office-rpg-hud');
    if (!deskCard) {
      deskCard = document.createElement('section');
      deskCard.id = 'office-rpg-hud';
      deskCard.className = 'tycoon-office-desk-card';
    }
    const scrollWrap = lobbyMain.querySelector('.lobby-scroll');
    if (scrollWrap && scrollWrap.nextSibling) {
      lobbyMain.insertBefore(deskCard, scrollWrap.nextSibling);
    } else {
      lobbyMain.appendChild(deskCard);
    }

    const state = getTycoonState();
    const tier = getTierForLevel(state.level);
    const committee = getActiveCommittee(state);
    const today = todayKey();
    const expPct = Math.min(100, Math.round(((state.exp || 0) / (state.maxExp || 300)) * 100));

    const missions = [
      {
        id: 'market',
        icon: '📊',
        title: '오늘의 시장 전광판(지수·환율) 확인하기',
        desc: '위쪽 전광판에서 코스피·나스닥·환율 흐름을 체크하세요',
        reward: '+50 XP · +100 ZP',
        done: !!state.dailyMissions?.[`${today}:market`]
      },
      {
        id: 'briefing',
        icon: '🎙️',
        title: `${committee.members[0].name} 위원장 1분 브리핑 듣기`,
        desc: '내 AI 투자위원회가 분석한 오늘의 핵심 대응 원칙 확인',
        reward: '+50 XP · +100 ZP',
        done: !!state.dailyMissions?.[`${today}:briefing`]
      },
      {
        id: 'portfolio',
        icon: '💼',
        title: '내 1억 모의투자 자산 비율 점검하기',
        desc: '목표 비중(미국·채권·한국)과 내 모의자산을 비교해 보세요',
        reward: '+100 XP · +200 ZP',
        done: !!state.dailyMissions?.[`${today}:portfolio`]
      }
    ];

    const themes = [
      { key: 'wallstreet', label: '🏛️ 월스트리트' },
      { key: 'boutique', label: '☕ 부티크' },
      { key: 'startup', label: '💻 스타트업' },
      { key: 'night', label: '🌙 나이트 라운지' }
    ];

    deskCard.innerHTML = `
      <div class="tycoon-desk-top">
        <div class="tycoon-firm-status">
          <div class="tycoon-firm-badge-row">
            <span class="tycoon-lv-pill">Lv.${state.level}</span>
            <strong class="tycoon-firm-name">${tier.badge} · ${tier.title}</strong>
            <span class="tycoon-streak-pill">🔥 연속 출석 ${state.streak || 1}일째</span>
            <span class="tycoon-zp-pill">💎 ${Number(state.zp || 0).toLocaleString()} ZP</span>
          </div>
          <div class="tycoon-xp-row">
            <div class="tycoon-xp-bar-bg"><div class="tycoon-xp-bar-fill" style="width:${expPct}%"></div></div>
            <small class="tycoon-xp-text">${state.exp} / ${state.maxExp} XP (${tier.nextGoal})</small>
          </div>
        </div>
        <div class="tycoon-theme-switcher" role="group" aria-label="사무실 인테리어 분위기 변경">
          <span class="tycoon-theme-lbl">인테리어:</span>
          ${themes.map(t => `
            <button type="button" class="tycoon-theme-btn ${state.officeTheme === t.key ? 'active' : ''}" data-office-theme="${t.key}">
              ${t.label}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="tycoon-desk-grid">
        <div class="tycoon-missions-box">
          <div class="tycoon-box-head">
            <strong>🎯 오늘의 3분 투자 루틴 (토스식 데일리 미션)</strong>
            <small>누르면 바로 실행되고 운용사 경험치(XP)가 올라갑니다</small>
          </div>
          <div class="tycoon-mission-list">
            ${missions.map(m => `
              <button type="button" class="tycoon-mission-item ${m.done ? 'done' : ''}" data-mission-id="${m.id}">
                <span class="tm-icon">${m.done ? '✅' : m.icon}</span>
                <div class="tm-text">
                  <strong>${m.title}</strong>
                  <small>${m.desc}</small>
                </div>
                <span class="tm-reward">${m.done ? '달성 완료' : m.reward}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="tycoon-committee-mini">
          <div class="tycoon-box-head">
            <div>
              <strong>🤝 내 운용사 주력 드림팀: ${committee.name}</strong>
              <small>카드를 누르면 애널리스트 투자 철학과 리서치 레벨을 관리해요</small>
            </div>
            <button type="button" class="tycoon-link-btn" data-rpg-goto="team">팀 교체 · 45인 보기 →</button>
          </div>
          <div class="tycoon-mini-analysts">
            ${committee.members.map((m, idx) => {
              const lv = state.analystLevels?.[m.key] || 4;
              return `
                <button type="button" class="tycoon-mini-analyst-card" data-analyst-idx="${idx}">
                  <div class="tma-avatar">${getAnalystSvg(m.role, 50)}</div>
                  <div class="tma-info">
                    <span class="tma-role">${m.roleBadge}</span>
                    <strong class="tma-name">${m.name} <small>Lv.${lv}</small></strong>
                    <span class="tma-desc">${m.specialty}</span>
                  </div>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    // 인테리어 테마 변경 연결
    deskCard.querySelectorAll('[data-office-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        const themeKey = btn.dataset.officeTheme;
        state.officeTheme = themeKey;
        saveTycoonState(state);
        // 기존 오피스 에디터 테마 셀렉트가 있으면 동기화
        const themeSelect = document.querySelector('#office-theme-select, [data-theme-select], select[name="theme"]');
        if (themeSelect) {
          themeSelect.value = themeKey;
          themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const stage = document.getElementById('lobby-stage');
        if (stage) stage.dataset.officeTheme = themeKey;
        showToast(`🏢 사무실 인테리어를 [${btn.textContent.trim()}] 테마로 변경했습니다.`);
        setupOfficeRpg();
      });
    });

    // 오늘의 미션 클릭 핸들러
    deskCard.querySelectorAll('[data-mission-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mId = btn.dataset.missionId;
        const key = `${today}:${mId}`;
        const alreadyDone = !!state.dailyMissions?.[key];
        if (!state.dailyMissions) state.dailyMissions = {};

        if (mId === 'market') {
          const board = document.getElementById('lobby-board');
          if (board) board.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          if (!alreadyDone) {
            state.dailyMissions[key] = true;
            gainReward(state, 50, 100, '오늘의 시장 전광판 확인 미션 완료!');
          } else {
            showToast('📊 오늘의 시장 전광판을 이미 확인하셨습니다.');
          }
        } else if (mId === 'briefing') {
          if (!alreadyDone) {
            state.dailyMissions[key] = true;
            gainReward(state, 50, 100, '수석 AI 위원장 브리핑 청취 완료!');
          }
          openAnalystModal(committee.members[0]);
        } else if (mId === 'portfolio') {
          if (!alreadyDone) {
            state.dailyMissions[key] = true;
            gainReward(state, 100, 200, '1억 모의투자 포트폴리오 점검 미션 완료!');
          }
          navigateToView('portfolio');
        }
      });
    });

    // 드림팀 애널리스트 클릭 시 상세 모달
    deskCard.querySelectorAll('[data-analyst-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.analystIdx) || 0;
        openAnalystModal(committee.members[idx]);
      });
    });
  }

  // ── 4. ZERO 45인 팀 (#team-view): 45인 오피스 맵 최상단 보존 + '나만의 AI 투자위원회 (4인 드림팀 스카우트)' ──
  function setupTeamRpg() {
    const teamView = document.getElementById('team-view');
    if (!teamView) return;

    const officePanel = document.getElementById('office-panel');
    if (officePanel) {
      officePanel.classList.remove('viewport-page-away');
      officePanel.removeAttribute('hidden');

      let quickTop = document.getElementById('team-rpg-quick-top');
      if (!quickTop) {
        quickTop = document.createElement('div');
        quickTop.id = 'team-rpg-quick-top';
        quickTop.className = 'tycoon-team-quickbar';
        const sceneSurface = document.getElementById('office-scene-surface');
        if (sceneSurface && sceneSurface.parentNode) {
          sceneSurface.parentNode.insertBefore(quickTop, sceneSurface);
        } else {
          officePanel.prepend(quickTop);
        }
      }

      quickTop.innerHTML = `
        <div class="ttq-left">
          <span class="ttq-badge">🏢 ZERO 45인 전문가 딜링룸</span>
          <button type="button" class="ttq-chip" data-dept="ALL">전체 사무실</button>
          <button type="button" class="ttq-chip" data-dept="MEETING">중앙 회의실</button>
          <button type="button" class="ttq-chip" data-dept="VALUE">가치·배당팀</button>
          <button type="button" class="ttq-chip" data-dept="QUANT">퀀트·거시팀</button>
          <button type="button" class="ttq-chip" data-dept="RISK">리스크관리팀</button>
        </div>
        <div class="ttq-right">
          <button type="button" class="ttq-warp" data-rpg-goto="lobby">🏢 내 사무실</button>
          <button type="button" class="ttq-warp" data-rpg-goto="plaza">💬 실시간 광장</button>
        </div>
      `;

      quickTop.querySelectorAll('[data-dept]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dept = btn.dataset.dept;
          if (dept === 'MEETING') {
            document.getElementById('office-demo')?.click();
            return;
          }
          if (dept === 'ALL') {
            document.getElementById('office-zoom-reset')?.click();
          }
          const sel = document.getElementById('office-department');
          if (sel) {
            if (dept === 'ALL') sel.value = 'ALL';
            else {
              const kw = dept === 'VALUE' ? '가치' : dept === 'QUANT' ? '퀀트' : '리스크';
              const opt = Array.from(sel.options).find(o => o.textContent.includes(kw));
              if (opt) sel.value = opt.value;
            }
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
    }

    let builder = document.getElementById('team-rpg-builder');
    if (builder && builder.tagName.toLowerCase() === 'section') {
      const replacement = document.createElement('div');
      replacement.id = 'team-rpg-builder';
      builder.replaceWith(replacement);
      builder = replacement;
    }
    if (!builder) {
      builder = document.createElement('div');
      builder.id = 'team-rpg-builder';
      if (officePanel && officePanel.nextSibling) {
        officePanel.parentNode.insertBefore(builder, officePanel.nextSibling);
      } else {
        teamView.appendChild(builder);
      }
    }
    builder.className = 'tycoon-committee-builder';

    const state = getTycoonState();
    let selectedId = state.activeCommitteeId || 'golden_balance';
    let currentFilterRole = 'ALL';

    function renderCommitteeBuilder() {
      const committee = COMMITTEES.find(c => c.id === selectedId) || COMMITTEES[0];
      const isEquipped = state.activeCommitteeId === committee.id;

      builder.innerHTML = `
        <div class="tcb-header">
          <div>
            <span class="tcb-eyebrow">🤝 초보자 3초 완성 · AI 투자위원회 스카우트</span>
            <h3 class="tcb-title">경제·주식을 몰라도 내 성향에 맞는 4인 드림팀을 골라보세요</h3>
            <p class="tcb-sub">원하는 투자 스타일을 선택하면 45명의 ZERO 전문가 중 최적의 4인 수석 위원회가 구성됩니다.</p>
          </div>
          <div class="tcb-preset-tabs" role="tablist">
            ${COMMITTEES.map(c => `
              <button type="button" class="tcb-preset-tab ${c.id === selectedId ? 'active' : ''}" data-cid="${c.id}">
                <strong>${c.name}</strong>
                <small>${c.tag}</small>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="tcb-summary-banner">
          <div class="tcb-summary-left">
            <div class="tcb-summary-title-row">
              <span class="tcb-tag-pill">${committee.tag}</span>
              <h4>${committee.name}</h4>
            </div>
            <p class="tcb-summary-desc">${committee.summary}</p>
            <div class="tcb-alloc-bar" aria-label="권장 자산 배분 비중">
              ${committee.allocation.map(a => `
                <div class="tcb-alloc-seg" style="width:${a.pct}%;background:${a.color}">
                  <span>${a.label} ${a.pct}%</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="tcb-summary-right">
            <div class="tcb-metric-row"><span>🚀 수익 성장성</span><div class="tcb-mbar"><div style="width:${committee.metrics.growth}%;background:#3182f6"></div></div><b>${committee.metrics.growth}점</b></div>
            <div class="tcb-metric-row"><span>🛡️ 하락장 방어력</span><div class="tcb-mbar"><div style="width:${committee.metrics.defense}%;background:#10b981"></div></div><b>${committee.metrics.defense}점</b></div>
            <div class="tcb-metric-row"><span>💰 배당·현금흐름</span><div class="tcb-mbar"><div style="width:${committee.metrics.cashflow}%;background:#f59e0b"></div></div><b>${committee.metrics.cashflow}점</b></div>
            <button type="button" class="tcb-equip-btn ${isEquipped ? 'equipped' : ''}" id="tcb-equip-btn">
              ${isEquipped ? '✓ 현재 내 운용사 대표 위원회로 가동 중' : '⚡ 이 4인 위원회를 내 운용사 대표팀으로 지정 (+100 XP)'}
            </button>
          </div>
        </div>

        <div class="tcb-cards-grid">
          ${committee.members.map((m, idx) => {
            const lv = state.analystLevels?.[m.key] || 4;
            return `
              <article class="tcb-analyst-card" data-c-idx="${idx}">
                <div class="tcb-card-top">
                  <span class="tcb-role-pill">${m.roleBadge}</span>
                  <span class="tcb-lv-pill">리서치 Lv.${lv}</span>
                </div>
                <div class="tcb-avatar-wrap">
                  ${getAnalystSvg(m.role, 76)}
                </div>
                <strong class="tcb-analyst-name">${m.name}</strong>
                <span class="tcb-analyst-spec">${m.specialty} · ${m.weight}</span>
                <p class="tcb-analyst-easy">${m.easyDesc}</p>
                <blockquote class="tcb-analyst-quote">${m.quote}</blockquote>
                <button type="button" class="tcb-detail-btn">💡 투자 방식 자세히 보기 &amp; 역량 강화</button>
              </article>
            `;
          }).join('')}
        </div>

        <div class="tcb-roster-filter">
          <span>📋 아래 45인 전체 전문가 명부 직무별 필터:</span>
          <button type="button" class="tcb-fbtn ${currentFilterRole === 'ALL' ? 'active' : ''}" data-frole="ALL">전체 45인</button>
          <button type="button" class="tcb-fbtn ${currentFilterRole === 'QUANT' ? 'active' : ''}" data-frole="QUANT">⚖️ 퀀트·총괄</button>
          <button type="button" class="tcb-fbtn ${currentFilterRole === 'GROWTH' ? 'active' : ''}" data-frole="GROWTH">🚀 성장·기업분석</button>
          <button type="button" class="tcb-fbtn ${currentFilterRole === 'MACRO' ? 'active' : ''}" data-frole="MACRO">🛡️ 리스크·거시경제</button>
          <button type="button" class="tcb-fbtn ${currentFilterRole === 'DIVIDEND' ? 'active' : ''}" data-frole="DIVIDEND">💰 배당·가치투자</button>
        </div>
      `;

      builder.querySelectorAll('[data-cid]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedId = btn.dataset.cid;
          renderCommitteeBuilder();
        });
      });

      builder.querySelector('#tcb-equip-btn')?.addEventListener('click', () => {
        const firstTime = state.activeCommitteeId !== committee.id;
        state.activeCommitteeId = committee.id;
        saveTycoonState(state);
        if (firstTime) {
          gainReward(state, 100, 150, `[${committee.name}]가 대표님의 주력 투자위원회로 지정되었습니다!`);
        } else {
          showToast(`✅ 현재 [${committee.name}]가 대표님의 운용사를 이끌고 있습니다.`);
        }
        renderCommitteeBuilder();
      });

      builder.querySelectorAll('[data-c-idx]').forEach(card => {
        card.addEventListener('click', () => {
          const idx = Number(card.dataset.cIdx) || 0;
          openAnalystModal(committee.members[idx]);
        });
      });

      builder.querySelectorAll('[data-frole]').forEach(btn => {
        btn.addEventListener('click', () => {
          currentFilterRole = btn.dataset.frole;
          builder.querySelectorAll('[data-frole]').forEach(b => b.classList.toggle('active', b.dataset.frole === currentFilterRole));
          decorateAndFilterTeamCards(currentFilterRole);
        });
      });
    }

    renderCommitteeBuilder();
    decorateAndFilterTeamCards(currentFilterRole);
  }

  function decorateAndFilterTeamCards(roleFilter = 'ALL') {
    const cards = document.querySelectorAll('#team-grid .team-card');
    cards.forEach((card, index) => {
      const text = card.textContent || '';
      let role = 'GROWTH';
      let badgeLabel = '🚀 기업·성장 리서치';
      if (text.includes('책임자') || text.includes('총괄') || text.includes('팀장') || text.includes('퀀트') || index === 0) {
        role = 'QUANT';
        badgeLabel = '⚖️ 퀀트·총괄 수석';
      } else if (text.includes('리스크') || text.includes('거시') || text.includes('검증') || text.includes('방어') || text.includes('법무') || text.includes('감사')) {
        role = 'MACRO';
        badgeLabel = '🛡️ 리스크·거시 수석';
      } else if (text.includes('배당') || text.includes('가치') || text.includes('안정') || text.includes('운용') || text.includes('고객')) {
        role = 'DIVIDEND';
        badgeLabel = '💰 가치·배당 수석';
      }

      const existing = card.querySelector('.team-card-rpg-header');
      if (existing) existing.remove();

      const header = document.createElement('div');
      header.className = `team-card-rpg-header role-${role.toLowerCase()}`;
      header.innerHTML = `
        <div class="team-card-mini-svg">${getAnalystSvg(role, 44)}</div>
        <div class="team-card-rpg-meta">
          <span class="team-card-class-pill">${badgeLabel}</span>
          <span class="team-card-stars">ZERO 수석 애널리스트 · Lv.${4 + (index % 5)}</span>
        </div>
      `;
      card.prepend(header);

      card.style.display = (roleFilter === 'ALL' || role === roleFilter) ? '' : 'none';
    });
  }

  // ── 5. 실시간 광장 (#plaza-view): 카카오페이증권 스타일 '실시간 투자 라운지 & 🐂강세 vs 🐻약세 예측 매치' ──
  function setupPlazaRpg() {
    const plazaView = document.getElementById('plaza-view');
    if (!plazaView) return;

    suppressAutoProfileModal();

    // 이전 판타지 드래곤 레이드 요소가 남아 있으면 제거
    document.getElementById('plaza-rpg-arena')?.remove();

    let stage = document.getElementById('rpg-plaza-interactive-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'rpg-plaza-interactive-stage';
      stage.className = 'tycoon-plaza-stage';
      plazaView.prepend(stage);
    }

    const state = getTycoonState();
    const tier = getTierForLevel(state.level);
    const today = todayKey();
    const votedToday = state.marketVote?.date === today ? state.marketVote.side : null;
    const totalVotes = Math.max(1, (state.bullVotes || 64) + (state.bearVotes || 36));
    const bullPct = Math.round(((state.bullVotes || 64) / totalVotes) * 100);
    const bearPct = 100 - bullPct;

    stage.innerHTML = `
      <div class="tp-header">
        <div>
          <span class="tp-badge">💬 실시간 투자자 광장 &amp; 데일리 시황 리그</span>
          <h3 class="tp-title">ZERO 스트리트 광장 · 오늘 시장은 🐂강세장일까요, 🐻약세장일까요?</h3>
          <p class="tp-sub">광장 바닥을 터치해 동료 투자자들과 대화하고, 오늘의 시장 방향에 투표해 운용 경험치(+100 XP)를 획득하세요.</p>
        </div>
        <div class="tp-nav-pills">
          <button type="button" class="tp-pill-btn" data-rpg-goto="lobby">🏢 내 사무실</button>
          <button type="button" class="tp-pill-btn" data-rpg-goto="team">👥 ZERO 45인 팀</button>
          <button type="button" class="tp-pill-btn" data-rpg-goto="portfolio">💰 1억 모의투자</button>
        </div>
      </div>

      <div class="tp-main-grid">
        <!-- 좌측: 인터랙티브 투자자 라운지 맵 -->
        <div class="tp-lounge-box">
          <div class="tp-lounge-canvas" id="tp-lounge-canvas" tabindex="0" aria-label="실시간 투자자 광장 맵. 터치하여 이동합니다.">
            <div class="tp-floor-grid"></div>
            <div class="tp-center-board">
              <span>📈 ZERO EXCHANGE PLAZA</span>
              <strong>🐂 강세 ${bullPct}% : 🐻 약세 ${bearPct}%</strong>
            </div>

            <!-- 동료 투자자 NPC 4인 -->
            <button type="button" class="tp-npc" style="left:18%;top:26%;" data-npc-msg="피터 린치 파인 저는 미국 빅테크 실적 발표 전까지 보유 유지합니다! 📈">
              <span class="tp-bubble">“미국 빅테크 실적 기대 중!”</span>
              <span class="tp-avatar">🧑‍💻</span>
              <small>나스닥서퍼 (Lv.7)</small>
            </button>
            <button type="button" class="tp-npc" style="left:78%;top:26%;" data-npc-msg="환율이 높을 땐 미국 단기국채랑 국내 고배당주가 마음 편하더라고요 🛡️">
              <span class="tp-bubble">“배당주·국채가 마음 편해요”</span>
              <span class="tp-avatar">👩‍💼</span>
              <small>배당왕김부장 (Lv.9)</small>
            </button>
            <button type="button" class="tp-npc" style="left:22%;top:74%;" data-npc-msg="소프 위원장 조언대로 이번 달은 불필요한 매매를 참았더니 수수료를 아꼈어요! ⚖️">
              <span class="tp-bubble">“잦은 매매 참기 성공!”</span>
              <span class="tp-avatar">🧔</span>
              <small>퀀트연구원 (Lv.6)</small>
            </button>
            <button type="button" class="tp-npc" style="left:76%;top:74%;" data-npc-msg="오늘 입문 학교 퀴즈 풀고 루키 에셋에서 부티크 파트너스로 승격했어요! 🌱">
              <span class="tp-bubble">“부티크 파트너스 승격!”</span>
              <span class="tp-avatar">🙋‍♀️</span>
              <small>적립식루키 (Lv.3)</small>
            </button>

            <!-- 내 대표 캐릭터 -->
            <div class="tp-player" id="tp-player" style="left:50%;top:56%;">
              <span class="tp-player-bubble" id="tp-player-bubble">반갑습니다! 👋</span>
              <span class="tp-player-avatar">👔</span>
              <small class="tp-player-tag">나 (Lv.${state.level} ${tier.badge})</small>
            </div>
          </div>

          <div class="tp-lounge-controls">
            <div class="tp-dpad" role="group" aria-label="광장 캐릭터 이동">
              <button type="button" class="tp-pad-btn" data-move="-8,0">⬅️</button>
              <button type="button" class="tp-pad-btn" data-move="0,-8">⬆️</button>
              <button type="button" class="tp-pad-btn" data-move="0,8">⬇️</button>
              <button type="button" class="tp-pad-btn" data-move="8,0">➡️</button>
            </div>
            <form class="tp-chat-form" id="tp-chat-form">
              <input type="text" id="tp-chat-input" maxlength="60" placeholder="광장에 오늘 시황 한마디 외치기 (예: 오늘 반도체 힘내라!)" aria-label="광장 한마디 외치기">
              <button type="submit" class="tycoon-btn-primary">💬 외치기</button>
            </form>
          </div>
        </div>

        <!-- 우측: 오늘의 🐂강세 vs 🐻약세 예측 매치 & 주간 수익률 리그 -->
        <div class="tp-league-box">
          <div class="tp-match-card">
            <div class="tp-match-head">
              <span class="tycoon-pill-blue">오늘의 시황 예측 매치</span>
              <span class="tp-reward-tag">${votedToday ? '✅ 오늘 투표 참여 완료' : '🎁 투표 시 +100 XP · +150 ZP'}</span>
            </div>
            <h4>오늘 미국·한국 증시, 어디로 움직일까요?</h4>
            <div class="tp-vote-gauge">
              <div class="tp-gauge-bull" style="width:${bullPct}%">🐂 강세 ${bullPct}%</div>
              <div class="tp-gauge-bear" style="width:${bearPct}%">🐻 약세 ${bearPct}%</div>
            </div>
            <div class="tp-vote-buttons">
              <button type="button" class="tp-vote-btn bull ${votedToday === 'BULL' ? 'selected' : ''}" data-vote-side="BULL">
                <strong>🐂 오늘 강세장 (Bull)</strong>
                <small>실적·저가매수 유입 기대</small>
              </button>
              <button type="button" class="tp-vote-btn bear ${votedToday === 'BEAR' ? 'selected' : ''}" data-vote-side="BEAR">
                <strong>🐻 오늘 약세장 (Bear)</strong>
                <small>금리·환율 관망세 우세</small>
              </button>
            </div>
          </div>

          <div class="tp-ranking-card">
            <div class="tp-ranking-head">
              <strong>🏆 이번 주 모의투자 운용사 리그 TOP 3</strong>
              <button type="button" class="tycoon-link-btn" id="tp-open-full-ranking">전체 랭킹 보기 →</button>
            </div>
            <ol class="tp-ranking-list">
              <li><span class="tp-medal">🥇</span><div><strong>켈리밸런스운용 (Lv.9)</strong><small>⚖️ 황금 균형 위원회 · 64/16/20 원칙 준수</small></div><b class="up">+8.42%</b></li>
              <li><span class="tp-medal">🥈</span><div><strong>배당왕김부장 (Lv.9)</strong><small>🛡️ 배당·안정 위원회 · 단기채 방어</small></div><b class="up">+6.15%</b></li>
              <li><span class="tp-medal">🥉</span><div><strong>대표님의 운용사 (Lv.${state.level})</strong><small>${getActiveCommittee(state).name} 가동 중</small></div><b class="mine">참여 중</b></li>
            </ol>
          </div>
        </div>
      </div>
    `;

    // 광장 캐릭터 이동 로직
    let px = 50;
    let py = 56;
    const playerEl = stage.querySelector('#tp-player');
    const bubbleEl = stage.querySelector('#tp-player-bubble');
    const canvasEl = stage.querySelector('#tp-lounge-canvas');

    function movePlayerTo(nx, ny, msg) {
      px = Math.max(10, Math.min(90, nx));
      py = Math.max(16, Math.min(86, ny));
      if (playerEl) {
        playerEl.style.left = `${px}%`;
        playerEl.style.top = `${py}%`;
      }
      if (msg && bubbleEl) {
        bubbleEl.textContent = msg;
      }
    }

    canvasEl?.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const rect = canvasEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      const ny = Math.round(((e.clientY - rect.top) / rect.height) * 100);
      movePlayerTo(nx, ny);
    });

    stage.querySelectorAll('[data-move]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [dx, dy] = btn.dataset.move.split(',').map(Number);
        movePlayerTo(px + dx, py + dy);
      });
    });

    stage.querySelectorAll('[data-npc-msg]').forEach(npc => {
      npc.addEventListener('click', () => {
        showToast(`💬 ${npc.dataset.npcMsg}`);
      });
    });

    stage.querySelector('#tp-chat-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = stage.querySelector('#tp-chat-input');
      const text = (input?.value || '').trim();
      if (!text) return;
      if (bubbleEl) bubbleEl.textContent = text;
      input.value = '';
      showToast(`💬 광장에 외쳤습니다: “${text}”`);
    });

    // 강세 vs 약세 투표 이벤트
    stage.querySelectorAll('[data-vote-side]').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.dataset.voteSide;
        const firstToday = state.marketVote?.date !== today;
        state.marketVote = { date: today, side };
        if (side === 'BULL') state.bullVotes = (state.bullVotes || 64) + 1;
        else state.bearVotes = (state.bearVotes || 36) + 1;
        saveTycoonState(state);
        movePlayerTo(50, 45, side === 'BULL' ? '오늘 강세장(Bull) 한 표! 🐂' : '오늘은 신중하게 약세장(Bear)! 🐻');
        if (firstToday) {
          gainReward(state, 100, 150, `오늘의 시황 예측(${side === 'BULL' ? '🐂 강세장' : '🐻 약세장'}) 투표 완료!`);
        } else {
          showToast(`✅ 예측을 [${side === 'BULL' ? '🐂 강세장' : '🐻 약세장'}]으로 변경했습니다.`);
          setupPlazaRpg();
        }
      });
    });

    stage.querySelector('#tp-open-full-ranking')?.addEventListener('click', () => {
      document.getElementById('lobby-ranking-open')?.click();
    });
  }

  // ── 6. 모달 1: 내 운용사 패스 & 데일리 미션 모달 ──
  function openCeoPassModal() {
    let dlg = document.getElementById('rpg-hero-detail-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'rpg-hero-detail-dialog';
      dlg.className = 'tycoon-modal';
      document.body.appendChild(dlg);
    }

    const state = getTycoonState();
    const tier = getTierForLevel(state.level);
    const committee = getActiveCommittee(state);
    const expPct = Math.min(100, Math.round(((state.exp || 0) / (state.maxExp || 300)) * 100));

    dlg.innerHTML = `
      <div class="tycoon-modal-box">
        <div class="tycoon-modal-head">
          <div>
            <span class="tycoon-pill-blue">ZERO 자산운용사 패스</span>
            <h3>Lv.${state.level} ${tier.badge} · ${tier.title}</h3>
          </div>
          <button type="button" class="tycoon-modal-close" id="tycoon-modal-close">닫기</button>
        </div>
        <div class="tycoon-modal-body">
          <div class="tm-tier-progress">
            <div class="tm-xp-row">
              <strong>운용사 경험치: ${state.exp} / ${state.maxExp} XP (${expPct}%)</strong>
              <span>보유 포인트: 💎 ${Number(state.zp || 0).toLocaleString()} ZP</span>
            </div>
            <div class="tycoon-xp-bar-bg"><div class="tycoon-xp-bar-fill" style="width:${expPct}%"></div></div>
            <p class="tm-next-goal">다음 목표: ${tier.nextGoal}</p>
          </div>

          <div class="tm-tier-roadmap">
            ${FIRM_TIERS.map(t => `
              <div class="tm-roadmap-step ${state.level >= t.minLv ? 'unlocked' : ''}">
                <strong>Lv.${t.minLv}+ ${t.badge}</strong>
                <small>${t.title}</small>
              </div>
            `).join('')}
          </div>

          <div class="tm-current-committee">
            <strong>현재 가동 중인 AI 투자위원회: ${committee.name}</strong>
            <p>${committee.summary}</p>
          </div>
        </div>
      </div>
    `;

    dlg.querySelector('#tycoon-modal-close')?.addEventListener('click', () => dlg.close());
    if (!dlg.open) dlg.showModal();
  }

  // ── 7. 모달 2: 수석 AI 애널리스트 브리핑 & 리서치 레벨 강화 모달 ──
  function openAnalystModal(member) {
    if (!member) return;
    let dlg = document.getElementById('rpg-hero-detail-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'rpg-hero-detail-dialog';
      dlg.className = 'tycoon-modal';
      document.body.appendChild(dlg);
    }

    const state = getTycoonState();
    const lv = state.analystLevels?.[member.key] || 4;
    const cost = 200;

    dlg.innerHTML = `
      <div class="tycoon-modal-box">
        <div class="tycoon-modal-head">
          <div class="tm-analyst-head-left">
            ${getAnalystSvg(member.role, 64)}
            <div>
              <span class="tycoon-pill-blue">${member.roleBadge} · 리서치 Lv.${lv}</span>
              <h3>${member.name} (${member.specialty})</h3>
            </div>
          </div>
          <button type="button" class="tycoon-modal-close" id="tycoon-modal-close">닫기</button>
        </div>
        <div class="tycoon-modal-body">
          <div class="tm-quote-card">
            <strong>🎙️ 오늘의 1분 투자 원칙 브리핑</strong>
            <p class="tm-quote-main">${member.quote}</p>
            <p class="tm-quote-easy">💡 <b>초보자 쉬운 설명:</b> ${member.easyDesc}</p>
          </div>
          <div class="tm-upgrade-row">
            <div>
              <strong>애널리스트 리서치 역량 강화 (현재 Lv.${lv})</strong>
              <small>보유 포인트: 💎 ${Number(state.zp || 0).toLocaleString()} ZP (강화 비용: ${cost} ZP)</small>
            </div>
            <button type="button" class="tycoon-btn-primary" id="tm-upgrade-analyst-btn">
              ⬆️ 리서치 레벨 업 (-${cost} ZP)
            </button>
          </div>
        </div>
      </div>
    `;

    dlg.querySelector('#tycoon-modal-close')?.addEventListener('click', () => dlg.close());
    dlg.querySelector('#tm-upgrade-analyst-btn')?.addEventListener('click', () => {
      if ((state.zp || 0) < cost) {
        showToast('💎 운용 포인트(ZP)가 부족합니다. 오늘의 3분 미션이나 광장 투표로 ZP를 모아보세요!');
        return;
      }
      state.zp -= cost;
      if (!state.analystLevels) state.analystLevels = {};
      state.analystLevels[member.key] = lv + 1;
      gainReward(state, 40, 0, `${member.name} 수석의 리서치 레벨이 Lv.${lv + 1}로 상승했습니다!`);
      openAnalystModal(member);
    });

    if (!dlg.open) dlg.showModal();
  }

  function polishMoreMenuLabels() {
    const teamCardSmall = document.querySelector('#more-menu [data-view="team"] small');
    if (teamCardSmall) teamCardSmall.textContent = 'AI 투자위원회 & 45인 명부';
    const plazaCardSmall = document.querySelector('#more-menu [data-view="plaza"] small');
    if (plazaCardSmall) plazaCardSmall.textContent = '실시간 투자 라운지 & 예측 리그';
  }

  function refreshAllTycoonUI() {
    polishMoreMenuLabels();
    setupGlobalEasyBar();
    setupHomeRpgGateway();
    setupOfficeRpg();
    setupPlazaRpg();
    setupTeamRpg();
  }

  function checkAndInitViews(event) {
    const activeView = event?.detail?.view || document.documentElement.dataset.zeroView || '';
    if (activeView === 'plaza') {
      suppressAutoProfileModal();
      setTimeout(suppressAutoProfileModal, 40);
    }
    if (activeView === 'team') {
      const officePanel = document.getElementById('office-panel');
      if (officePanel) officePanel.classList.remove('viewport-page-away');
    }
    refreshAllTycoonUI();
  }

  document.addEventListener('DOMContentLoaded', checkAndInitViews);
  document.addEventListener('zero-view-changed', checkAndInitViews);
  setTimeout(checkAndInitViews, 300);
  setTimeout(checkAndInitViews, 1000);
})();
