// -*- coding: utf-8 -*-
/* ZERO RPG 게임화 통합 시스템: 사무실(Office), 실시간 광장(Plaza), ZERO 팀(Team) 3대 공간 연동 */
(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const RPG_STORE_KEY = 'zero_rpg_state_v2';
  function getRpgState() {
    try {
      const raw = localStorage.getItem(RPG_STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {
      level: 12,
      title: '그랜드 마스터 모험가',
      exp: 420,
      maxExp: 1000,
      gold: 58400,
      stamina: 100,
      maxStamina: 100,
      gems: 150,
      affinity: {
        'host': 65,
        'thorp': 80,
        'buffett': 90,
        'lynch': 75
      },
      completedQuests: {},
      lastFountainDate: null,
      lastCoffeeDate: null,
      lastBullDate: null,
      lastBookDate: null,
      lastRouletteDate: null,
      lastAttendanceDate: null,
      activePartyId: 'thorp_balance',
      activeBuffs: ['절세 장막', '켈리 복리 부스터']
    };
  }

  function saveRpgState(state) {
    try {
      localStorage.setItem(RPG_STORE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  // 8비트 레트로 레트로 사운드 신시사이저 (Web Audio API - 무설치 즉시 재생)
  function playRetroSound(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'coin') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(987.77, ctx.currentTime);
        osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'levelup') {
        osc.type = 'triangle';
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        });
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
      } else if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.06);
      }
    } catch (_) {}
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'rpg-toast-msg';
    toast.textContent = msg;
    document.body.append(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  function spawnFloatingEffect(text, x, y) {
    const el = document.createElement('div');
    el.className = 'rpg-floating-pop';
    el.textContent = text;
    el.style.left = (x || (window.innerWidth / 2 - 40)) + 'px';
    el.style.top = (y || (window.innerHeight / 2 - 50)) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  const RPG_PRESETS = [
    {
      id: 'thorp_balance',
      name: '⚖️ 소프 켈리 황금 밸런스 덱',
      badge: '수학적 복리 정석 (추천)',
      cp: '148,500',
      concept: '수학적으로 가장 완벽한 황금비율(주식 55.6% : 채권 29.4% : 비상금 15.0%)로 복리를 누리는 정석 파티',
      target: '🎯 초보자부터 장기 복리를 원하는 모든 모험가',
      leader: { name: '에드워드 소프', title: '대마법사 (파티장)', role: 'LEADER', atk: 95, def: 95, rec: 90, skill: '켈리의 황금 분할', desc: '파티 전체의 변동성을 50% 삭감하고 복리 성장을 극대화합니다.', asset: '확률 알고리즘 엔진' },
      members: [
        { name: 'S&P 500 성기사', role: 'DEALER', roleKorean: '⚔️ 딜러 (공격)', atk: 92, def: 70, rec: 40, skill: '복리 일격', weight: '55.6%', desc: '미국 500대 우량 기업의 화력으로 성장을 견인합니다.' },
        { name: '단기국채 철벽 탱커', role: 'TANKER', roleKorean: '🛡️ 탱커 (방어)', atk: 30, def: 98, rec: 70, skill: '금리 방패벽', weight: '29.4%', desc: '폭락장에서도 원금을 100% 안전하게 수호합니다.' },
        { name: '달러 비상금 사제', role: 'HEALER', roleKorean: '💖 힐러 (회복)', atk: 10, def: 85, rec: 95, skill: '긴급 절세 면제', weight: '15.0%', desc: '세금과 수수료 마찰을 완충하고 위기 시 즉각 치유합니다.' }
      ]
    },
    {
      id: 'defense_knight',
      name: '🛡️ 워런 버핏 철벽 수비 덱',
      badge: '원금 100% 보존형',
      cp: '136,200',
      concept: '배당금과 국채 이자로 계좌를 매달 치유하며, 주가가 떨어져도 마음 편히 잠들 수 있는 수비형 파티',
      target: '🎯 원금 손실이 두렵고 매달 월급처럼 배당금을 받고 싶은 모험가',
      leader: { name: '워런 버핏', title: '성기사단장 (파티장)', role: 'LEADER', atk: 80, def: 99, rec: 95, skill: '영구 보유의 축복', desc: '원금을 잃지 않는 제1원칙으로 어떤 공황도 완벽 방어합니다.', asset: '해자(Moat) 가치투자' },
      members: [
        { name: '배당다우존스 성직자', role: 'HEALER', roleKorean: '💖 힐러 (회복)', atk: 75, def: 88, rec: 98, skill: '마르지 않는 배당샘', weight: '40.0%', desc: 'SCHD 월배당으로 매달 계좌의 체력을 가득 채웁니다.' },
        { name: '종합채권 수호 골렘', role: 'TANKER', roleKorean: '🛡️ 탱커 (방어)', atk: 25, def: 99, rec: 75, skill: '성스러운 방어 진지', weight: '45.0%', desc: '주식 폭락 시 반대로 가격이 상승하여 계좌를 지킵니다.' },
        { name: '비상금 금고 지원가', role: 'BUFFER', roleKorean: '🛡️ 버퍼 (안전)', atk: 10, def: 90, rec: 99, skill: '절세 장막', weight: '15.0%', desc: '모든 매매 수수료와 거래세를 최소화합니다.' }
      ]
    },
    {
      id: 'tech_attack',
      name: '🚀 피터 린치 테크 드래곤 덱',
      badge: '미래 혁신 공격형',
      cp: '152,800',
      concept: '인공지능과 혁신 기술주 중심으로 구성되어 폭발적인 자산 증식을 노리는 공격형 파티',
      target: '🎯 젊은 투자자 및 5년 이상 장기 투자로 큰 자산 형성을 꿈꾸는 모험가',
      leader: { name: '피터 린치', title: '레인저 마스터 (파티장)', role: 'LEADER', atk: 99, def: 65, rec: 70, skill: '텐배거의 화살', desc: '세상을 바꾸는 1등 혁신 기업들을 찾아내어 화력을 집중합니다.', asset: '10루타 성장주 엔진' },
      members: [
        { name: '나스닥 100 드래곤 라이더', role: 'DEALER', roleKorean: '⚔️ 딜러 (공격)', atk: 99, def: 55, rec: 30, skill: 'AI 기가 임팩트', weight: '65.0%', desc: '글로벌 빅테크의 혁신으로 가장 높은 수익률을 겨냥합니다.' },
        { name: '반도체 챔피언 마법사', role: 'DEALER', roleKorean: '⚔️ 딜러 (공격)', atk: 90, def: 60, rec: 40, skill: '실리콘 블래스터', weight: '20.0%', desc: '인공지능 혁명의 필수 인프라에 집중 투자합니다.' },
        { name: '지원 사제 현금 버퍼', role: 'BUFFER', roleKorean: '💖 버퍼 (회복)', atk: 10, def: 85, rec: 95, skill: '급락장 바겐세일', weight: '15.0%', desc: '단기 폭락 시 저평가된 우량주를 줍는 기회 포착 스킬을 씁니다.' }
      ]
    }
  ];

  const CURRENT_BOSS = {
    name: '🐉 고금리 볼케이노 드래곤',
    title: '연준의 긴축 화염군주 (기준금리 4.75%)',
    maxHp: 10000,
    currentHp: 6800,
    element: '단기국채 방패 & 소프 켈리 허들',
    desc: '전 세계 시장을 공포에 떨게 하는 고금리 화염을 내뿜습니다. 단기국채 탱커와 현금 버퍼를 장착한 파티만이 데미지 없이 공략할 수 있습니다!'
  };

  // ── 1. 사무실 (Office / lobby-view) 상단 상시 HUD & 4대 탐험 핫스팟 ──
  function setupOfficeRpg() {
    const lobbyMain = document.querySelector('#lobby-view .lobby-main');
    if (!lobbyMain) return;

    const state = getRpgState();

    // (A) 상단 상시 헤드업 디스플레이 (HUD) 마운트
    let hud = document.getElementById('office-rpg-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'office-rpg-hud';
      hud.className = 'office-rpg-hud-bar';
      const stageWrap = document.querySelector('#lobby-view .zero-office-canvas-wrap');
      if (stageWrap) {
        stageWrap.parentNode.insertBefore(hud, stageWrap);
      } else {
        lobbyMain.prepend(hud);
      }
    }

    function renderHud() {
      hud.innerHTML = `
        <div class="hud-item hud-char" title="내 캐릭터 정보">
          <span class="hud-avatar">👑</span>
          <div class="hud-text">
            <span class="hud-title">Lv.${state.level} ${state.title}</span>
            <div class="hud-mini-bar"><div class="hud-mini-fill" style="width: ${(state.exp / state.maxExp * 100).toFixed(0)}%"></div></div>
          </div>
        </div>
        <div class="hud-item hud-cp" title="총 파티 전투력">
          <span class="hud-icon">⚔️</span>
          <div class="hud-text">
            <span class="hud-label">전투력</span>
            <strong class="hud-val">148,500 CP</strong>
          </div>
        </div>
        <div class="hud-item hud-gold" title="보유 골드">
          <span class="hud-icon">🪙</span>
          <div class="hud-text">
            <span class="hud-label">골드</span>
            <strong class="hud-val">${state.gold.toLocaleString()} G</strong>
          </div>
        </div>
        <div class="hud-item hud-stamina" title="사무실 활력">
          <span class="hud-icon">☕</span>
          <div class="hud-text">
            <span class="hud-label">사무실 활력</span>
            <strong class="hud-val">${state.stamina}/${state.maxStamina}</strong>
          </div>
        </div>
        <button type="button" id="hud-box-btn" class="hud-gift-btn" title="일일 출석 보상 상자">
          🎁 <span class="hud-gift-badge">출석</span>
        </button>
      `;

      hud.querySelector('#hud-box-btn')?.addEventListener('click', (e) => {
        playRetroSound('coin');
        const today = new Date().toDateString();
        if (state.lastAttendanceDate === today) {
          showToast('🎁 오늘의 출석 보상은 이미 수령하셨습니다! 내일 또 오세요.');
          return;
        }
        state.lastAttendanceDate = today;
        state.gold += 1000;
        state.exp += 100;
        saveRpgState(state);
        playRetroSound('levelup');
        spawnFloatingEffect('+1,000 G & +100 EXP!', e.clientX, e.clientY);
        showToast('🎉 일일 출석 완료! 1,000 Gold와 100 EXP를 획득했습니다!');
        renderHud();
      });
    }
    renderHud();

    // (B) 사무실 4대 인터랙티브 탐험 핫스팟 마운트
    let hotspots = document.getElementById('office-rpg-hotspots');
    if (!hotspots) {
      hotspots = document.createElement('div');
      hotspots.id = 'office-rpg-hotspots';
      hotspots.className = 'office-hotspots-container';
      const stageWrap = document.querySelector('#lobby-view .zero-office-canvas-wrap');
      if (stageWrap && stageWrap.nextSibling) {
        stageWrap.parentNode.insertBefore(hotspots, stageWrap.nextSibling);
      } else {
        lobbyMain.append(hotspots);
      }
    }

    function renderHotspots() {
      hotspots.innerHTML = `
        <div class="hotspots-header">
          <span>🏰 사무실 탐험 인터랙션</span>
          <small>오피스 오브젝트를 터치하여 버프와 재화를 획득하세요</small>
        </div>
        <div class="hotspots-grid">
          <button type="button" class="hotspot-card" id="spot-coffee">
            <span class="spot-icon">☕</span>
            <div class="spot-info">
              <strong>탕비실 에스프레소</strong>
              <small>활력 +20 · AI 자문 가속</small>
            </div>
          </button>
          <button type="button" class="hotspot-card" id="spot-bull">
            <span class="spot-icon">🐂</span>
            <div class="spot-info">
              <strong>월가 황금 황소상</strong>
              <small>투자 대길 · +150 Gold</small>
            </div>
          </button>
          <button type="button" class="hotspot-card" id="spot-library">
            <span class="spot-icon">📚</span>
            <div class="spot-info">
              <strong>거장의 비밀 서고</strong>
              <small>소프 연구록 · +80 EXP</small>
            </div>
          </button>
          <button type="button" class="hotspot-card" id="spot-roulette">
            <span class="spot-icon">🎲</span>
            <div class="spot-info">
              <strong>일일 행운 룰렛</strong>
              <small>100% 무료 게임 럭키 박스</small>
            </div>
          </button>
        </div>
      `;

      hotspots.querySelector('#spot-coffee')?.addEventListener('click', (e) => {
        playRetroSound('click');
        const today = new Date().toDateString();
        if (state.lastCoffeeDate === today) {
          showToast('☕ 오늘은 이미 최고급 커피를 마셨습니다! 사원들이 활기차게 일하고 있어요.');
          return;
        }
        state.lastCoffeeDate = today;
        state.stamina = Math.min(state.maxStamina, state.stamina + 20);
        state.activeBuffs = [...new Set([...state.activeBuffs, '카페인 부스터'])];
        saveRpgState(state);
        playRetroSound('coin');
        spawnFloatingEffect('☕ 활력 +20 & 카페인 부스터!', e.clientX, e.clientY);
        showToast('☕ 탕비실 최고급 에스프레소 완성! 활력 +20 & AI 자문 집중력 부스터 발동!');
        renderHud();
      });

      hotspots.querySelector('#spot-bull')?.addEventListener('click', (e) => {
        playRetroSound('coin');
        const today = new Date().toDateString();
        if (state.lastBullDate === today) {
          showToast('🐂 황금 황소의 기운이 오늘도 대표님 계좌에 가득합니다!');
          return;
        }
        state.lastBullDate = today;
        state.gold += 150;
        saveRpgState(state);
        spawnFloatingEffect('+150 Gold!', e.clientX, e.clientY);
        showToast('🐂 황금 황소의 뿔을 쓰다듬었습니다! [오늘의 시장 운세: 대길 大吉] +150 G 획득!');
        renderHud();
      });

      hotspots.querySelector('#spot-library')?.addEventListener('click', (e) => {
        playRetroSound('click');
        const today = new Date().toDateString();
        if (state.lastBookDate === today) {
          showToast('📚 오늘의 거장 비밀 문헌을 이미 열람했습니다.');
          return;
        }
        state.lastBookDate = today;
        state.exp += 80;
        if (state.exp >= state.maxExp) {
          state.level += 1;
          state.exp -= state.maxExp;
          playRetroSound('levelup');
          showToast(`🎊 레벨 업! 오피스 사령부 Lv.${state.level} 달성!`);
        } else {
          playRetroSound('coin');
          showToast('📚 에드워드 소프의 『확률적 우위 전략』 열람 완료! +80 EXP 획득!');
        }
        saveRpgState(state);
        spawnFloatingEffect('+80 EXP!', e.clientX, e.clientY);
        renderHud();
      });

      hotspots.querySelector('#spot-roulette')?.addEventListener('click', (e) => {
        playRetroSound('coin');
        const today = new Date().toDateString();
        if (state.lastRouletteDate === today) {
          showToast('🎲 오늘의 행운 룰렛은 이미 돌리셨습니다! 내일 다시 도전하세요.');
          return;
        }
        state.lastRouletteDate = today;
        const rewards = [
          { msg: '대박! 황금 배당 보너스 +500 G 당첨!', gold: 500, exp: 50 },
          { msg: '축하합니다! 소프 켈리 마법서 (+150 EXP) 당첨!', gold: 100, exp: 150 },
          { msg: '행운의 잭팟! 1,000 Gold 획득!', gold: 1000, exp: 100 }
        ];
        const picked = rewards[Math.floor(Math.random() * rewards.length)];
        state.gold += picked.gold;
        state.exp += picked.exp;
        saveRpgState(state);
        playRetroSound('levelup');
        spawnFloatingEffect(`🎉 ${picked.msg}`, e.clientX, e.clientY);
        showToast(`🎉 ${picked.msg}`);
        renderHud();
      });
    }
    renderHotspots();

    // (C) 사이드바 일일 퀘스트 카드
    const lobbySide = document.querySelector('#lobby-view .lobby-side');
    if (lobbySide && !document.getElementById('office-rpg-deck')) {
      const deck = document.createElement('section');
      deck.id = 'office-rpg-deck';
      deck.className = 'office-rpg-card';
      deck.setAttribute('aria-label', '사무실 RPG 사령부');

      function renderSideDeck() {
        deck.innerHTML = `
          <div class="office-rpg-head">
            <div class="office-rpg-title-box">
              <span class="office-rpg-badge">👑 오피스 사령부</span>
              <strong class="office-rpg-name">Lv.${state.level} ${state.title}</strong>
            </div>
            <span class="office-rpg-cp">전투력 CP 148,500</span>
          </div>
          <div class="office-rpg-exp-bar">
            <div class="office-rpg-exp-track"><div class="office-rpg-exp-fill" style="width: ${(state.exp / state.maxExp * 100).toFixed(1)}%"></div></div>
            <div class="office-rpg-exp-meta">
              <span>EXP ${state.exp} / ${state.maxExp}</span>
              <span>🪙 ${state.gold.toLocaleString()} G</span>
            </div>
          </div>
          <div class="office-rpg-quests-title">📜 사무실 일일 업무 퀘스트</div>
          <div class="office-quest-list">
            <div class="office-quest-item ${state.completedQuests['q1'] ? 'done' : ''}">
              <div class="office-quest-info">
                <strong>[모닝 브리핑] 45인 자문단 거시경제 브리핑 확인</strong>
                <small>보상: +50 EXP · +500 Gold</small>
              </div>
              <button type="button" class="office-quest-btn" data-qid="q1" ${state.completedQuests['q1'] ? 'disabled' : ''}>
                ${state.completedQuests['q1'] ? '완료됨 ✓' : '수행하기'}
              </button>
            </div>
            <div class="office-quest-item ${state.completedQuests['q2'] ? 'done' : ''}">
              <div class="office-quest-info">
                <strong>[소프 켈리] 리밸런싱 세금·수수료 방어선 점검</strong>
                <small>보상: +80 EXP · +1,200 Gold</small>
              </div>
              <button type="button" class="office-quest-btn" data-qid="q2" ${state.completedQuests['q2'] ? 'disabled' : ''}>
                ${state.completedQuests['q2'] ? '완료됨 ✓' : '수행하기'}
              </button>
            </div>
            <div class="office-quest-item ${state.completedQuests['q3'] ? 'done' : ''}">
              <div class="office-quest-info">
                <strong>[버핏 1원칙] 하락장 원금 방어율 확인</strong>
                <small>보상: +100 EXP · 파티 방어력 +10% 버프</small>
              </div>
              <button type="button" class="office-quest-btn" data-qid="q3" ${state.completedQuests['q3'] ? 'disabled' : ''}>
                ${state.completedQuests['q3'] ? '완료됨 ✓' : '수행하기'}
              </button>
            </div>
          </div>
          <div class="office-rpg-buffs">
            <span class="office-buff-pill">✨ 절세 장막 (마찰비용 -20%)</span>
            <span class="office-buff-pill">⚡ 켈리 복리 부스터 (변동성 50% 삭감)</span>
          </div>
        `;

        deck.querySelectorAll('.office-quest-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const qid = e.currentTarget.dataset.qid;
            if (state.completedQuests[qid]) return;
            state.completedQuests[qid] = true;
            const rewards = {
              q1: { exp: 50, gold: 500, label: '아침 브리핑 완료! +50 EXP, +500 G 획득!' },
              q2: { exp: 80, gold: 1200, label: '소프 켈리 방어선 점검 완료! +80 EXP, +1,200 G 획득!' },
              q3: { exp: 100, gold: 0, label: '버핏 1원칙 완료! +100 EXP & 파티 방어 버프 획득!' }
            }[qid];
            state.exp += rewards.exp;
            state.gold += rewards.gold;
            if (state.exp >= state.maxExp) {
              state.level += 1;
              state.exp -= state.maxExp;
              playRetroSound('levelup');
              showToast(`🎊 레벨 업! 오피스 사령부 Lv.${state.level} 달성!`);
            } else {
              playRetroSound('coin');
              showToast(`⭐ ${rewards.label}`);
            }
            saveRpgState(state);
            renderSideDeck();
            renderHud();
          });
        });
      }
      renderSideDeck();
      lobbySide.prepend(deck);
    }

    // (D) 직원 대화창(lobby-chat) 친밀도 게이지 & 3대 액션 바인딩
    enhanceLobbyChatRpg();
  }

  // ── 직원 캐릭터 대화창 RPG 인터랙션 강화 ──
  function enhanceLobbyChatRpg() {
    const chatDialog = document.getElementById('lobby-chat');
    if (!chatDialog || chatDialog.dataset.rpgEnhanced) return;
    chatDialog.dataset.rpgEnhanced = 'true';

    const chatHead = chatDialog.querySelector('.chat-head');
    if (chatHead) {
      const affinityWrap = document.createElement('div');
      affinityWrap.className = 'chat-affinity-box';
      affinityWrap.innerHTML = `
        <span class="affinity-heart">💖</span>
        <div class="affinity-detail">
          <span class="affinity-label">호감도 Lv.3 (75/100)</span>
          <div class="affinity-track"><div class="affinity-fill" style="width: 75%"></div></div>
        </div>
      `;
      chatHead.appendChild(affinityWrap);
    }

    const chatForm = chatDialog.querySelector('.chat-form');
    if (chatForm) {
      const quickBar = document.createElement('div');
      quickBar.className = 'chat-rpg-actions';
      quickBar.innerHTML = `
        <button type="button" class="chat-rpg-btn" id="chat-gift-coffee">☕ 커피 선물하기 (+15 호감도)</button>
        <button type="button" class="chat-rpg-btn" id="chat-stamp-praise">⭐ 칭찬 스탬프 (+50 EXP)</button>
        <button type="button" class="chat-rpg-btn" id="chat-staff-quest">📜 직원 미션 받기</button>
      `;
      chatForm.parentNode.insertBefore(quickBar, chatForm);

      quickBar.querySelector('#chat-gift-coffee')?.addEventListener('click', (e) => {
        const state = getRpgState();
        playRetroSound('coin');
        spawnFloatingEffect('💖 호감도 +15 & 파티 공격력 +5%!', e.clientX, e.clientY);
        showToast('☕ 직원에게 따뜻한 커피를 선물했습니다! "대표님 최고입니다! 오늘 전략에 최선을 다할게요!" (호감도 +15 & 파티 공격력 +5% 버프 발동)');
        saveRpgState(state);
      });

      quickBar.querySelector('#chat-stamp-praise')?.addEventListener('click', (e) => {
        const state = getRpgState();
        state.exp += 50;
        playRetroSound('coin');
        spawnFloatingEffect('+50 EXP!', e.clientX, e.clientY);
        showToast('⭐ 직원을 칭찬하여 팀 사기가 올랐습니다! (+50 EXP 획득)');
        saveRpgState(state);
      });

      quickBar.querySelector('#chat-staff-quest')?.addEventListener('click', () => {
        playRetroSound('click');
        showToast('📜 직원의 일일 미션: "오늘 장마감 전 나스닥-국채 상관계수 리포트를 확인해 주세요!" (+100 EXP 예정)');
      });
    }
  }

  // ── 2. 공용광장 (Plaza / plaza-view) 월드 보스 레이드 & 모험가 길드 ──
  function setupPlazaRpg() {
    const plazaView = document.getElementById('plaza-view');
    if (!plazaView || document.getElementById('plaza-rpg-deck')) return;

    const deck = document.createElement('div');
    deck.id = 'plaza-rpg-deck';
    deck.className = 'plaza-rpg-container';

    deck.innerHTML = `
      <div class="plaza-boss-box">
        <div class="plaza-boss-header">
          <div>
            <span class="plaza-boss-tag">🔥 광장 실시간 월드 이벤트</span>
            <h3 class="plaza-boss-name">${CURRENT_BOSS.name}</h3>
            <p class="plaza-boss-title">${CURRENT_BOSS.title}</p>
          </div>
          <button type="button" id="plaza-raid-btn" class="plaza-raid-action-btn">
            ⚔️ 광장 모험가 연합 레이드 출격
          </button>
        </div>
        <div class="plaza-hp-container">
          <div class="plaza-hp-labels">
            <span>보스 잔여 체력 HP</span>
            <span>6,800 / 10,000 (68%)</span>
          </div>
          <div class="plaza-hp-track"><div class="plaza-hp-fill" style="width: 68%"></div></div>
        </div>
        <p class="plaza-boss-desc">${CURRENT_BOSS.desc}</p>
        <div class="plaza-boss-foot">
          <span>🛡️ 공략 특효: <strong>${CURRENT_BOSS.element}</strong> (장착 시 데미지 100% 무효)</span>
        </div>
      </div>

      <div class="plaza-hub-grid">
        <div class="plaza-fountain-card">
          <h4>⛲ 행운의 광장 분수대</h4>
          <p>하루 한 번 광장 분수대에 동전을 던지면 오늘 하루 행운의 시장 가호를 받아요.</p>
          <button type="button" id="plaza-fountain-btn" class="plaza-fountain-btn">🪙 분수대에 동전 던지기</button>
        </div>
        <div class="plaza-hall-card">
          <h4>🏆 모험가 길드 명예의 전당</h4>
          <ol class="plaza-hall-list">
            <li>🥇 <strong>소프 켈리 황금 파티</strong> (CP 148,500)</li>
            <li>🥈 <strong>워런 버핏 성기사단</strong> (CP 136,200)</li>
            <li>🥉 <strong>피터 린치 테크 파티</strong> (CP 152,800)</li>
          </ol>
        </div>
      </div>
    `;

    deck.querySelector('#plaza-raid-btn')?.addEventListener('click', () => {
      openPlazaRaidModal();
    });

    deck.querySelector('#plaza-fountain-btn')?.addEventListener('click', (e) => {
      const state = getRpgState();
      const today = new Date().toDateString();
      if (state.lastFountainDate === today) {
        showToast('⛲ 오늘은 이미 분수대의 가호를 받았습니다! 내일 다시 찾아와 주세요.');
        return;
      }
      state.lastFountainDate = today;
      state.gold += 300;
      state.exp += 70;
      saveRpgState(state);
      playRetroSound('levelup');
      spawnFloatingEffect('⛲ 분수의 가호! +300 G & +70 EXP!', e.clientX, e.clientY);
      showToast('⛲ 분수대에 동전을 던졌습니다! 맑은 물빛이 반짝이며 +300 Gold와 +70 EXP를 얻었습니다!');
    });

    plazaView.prepend(deck);
  }

  function openPlazaRaidModal() {
    let dialog = document.getElementById('plaza-raid-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'plaza-raid-dialog';
      dialog.className = 'plaza-raid-modal';
      document.body.appendChild(dialog);
    }

    dialog.innerHTML = `
      <div class="raid-modal-head">
        <div>
          <h3>⚔️ 월드 보스 레이드: ${CURRENT_BOSS.name}</h3>
          <p>내 파티의 공격력으로 고금리 드래곤을 타격하세요!</p>
        </div>
        <button type="button" class="icon-button icon-close" id="raid-close">닫기</button>
      </div>
      <div class="raid-battle-ground">
        <div class="raid-dragon-sprite">🐲 🔥 💥</div>
        <div class="raid-combat-log" id="raid-combat-log">
          <p>📢 고금리 볼케이노 드래곤이 긴축 화염(4.75%)을 뿜어냅니다!</p>
          <p>🛡️ 에드워드 소프의 [켈리 황금 분할] 방어막이 활성화되었습니다!</p>
        </div>
        <div class="raid-action-buttons">
          <button type="button" class="raid-btn attack" data-act="attack">⚔️ 파티 총공격 (단기국채 화력)</button>
          <button type="button" class="raid-btn skill" data-act="skill">⚡ 필살기: 켈리 황금일격</button>
          <button type="button" class="raid-btn shield" data-act="shield">🛡️ 철벽 가드 (손실 방어 100%)</button>
        </div>
      </div>
    `;

    dialog.querySelector('#raid-close')?.addEventListener('click', () => dialog.close());

    const log = dialog.querySelector('#raid-combat-log');
    dialog.querySelectorAll('.raid-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const act = e.currentTarget.dataset.act;
        playRetroSound(act === 'skill' ? 'levelup' : 'coin');
        if (act === 'attack') {
          log.innerHTML += '<p class="log-hit">💥 [일반 공격] S&P 500 성기사가 1,240의 유효 데미지를 입혔습니다!</p>';
        } else if (act === 'skill') {
          log.innerHTML += '<p class="log-crit">⚡ [필살기] 에드워드 소프의 켈리 복리 알고리즘이 폭발하여 3,580의 치명타를 입혔습니다!!</p>';
        } else if (act === 'shield') {
          log.innerHTML += '<p class="log-guard">🛡️ [철벽 방어] 단기국채 방패벽으로 금리 상승 화염을 100% 흡수 차단했습니다!</p>';
        }
        log.scrollTop = log.scrollHeight;
      });
    });

    dialog.showModal();
  }

  // ── 3. ZERO 팀 (Team / team-view) 1-Click RPG 덱 편성기 ──
  function setupTeamRpg() {
    const teamView = document.getElementById('team-view');
    if (!teamView || document.getElementById('team-rpg-builder')) return;

    const builder = document.createElement('section');
    builder.id = 'team-rpg-builder';
    builder.className = 'team-rpg-container';

    let selectedPresetId = 'thorp_balance';
    let currentFilterRole = 'ALL';

    function renderBuilder() {
      const preset = RPG_PRESETS.find(p => p.id === selectedPresetId) || RPG_PRESETS[0];

      builder.innerHTML = `
        <div class="team-rpg-header">
          <div>
            <span class="team-rpg-tag">⚔️ 1-Click 추천 모험 파티 덱</span>
            <h3 class="team-rpg-title">누구나 1초 만에 완성하는 전설의 투자 파티</h3>
            <p class="team-rpg-desc">어려운 경제 용어 대신, 검증된 거장들의 역할 분담 덱을 선택하세요.</p>
          </div>
          <div class="team-rpg-tabs">
            ${RPG_PRESETS.map(p => `
              <button type="button" class="team-rpg-tab ${p.id === selectedPresetId ? 'active' : ''}" data-pid="${p.id}">
                ${p.name.split(' ')[0]} ${p.name.split(' ')[1]}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="team-rpg-banner">
          <div class="team-banner-left">
            <h4>${preset.name}</h4>
            <p class="team-banner-concept">${preset.concept}</p>
            <span class="team-target-badge">${preset.target}</span>
          </div>
          <div class="team-banner-right">
            <span class="team-cp-badge">전투력 ${preset.cp} CP</span>
            <button type="button" class="team-equip-btn" id="team-equip-action">
              ⚡ 이 덱으로 파티 편성하기
            </button>
          </div>
        </div>

        <div class="th-rpg-cards-grid">
          <div class="th-rpg-card leader-card">
            <div class="th-rpg-card-top">
              <span class="th-rpg-role-badge">👑 파티장 (팀장)</span>
              <span class="th-rpg-cp-pill">CP 98</span>
            </div>
            <strong class="th-rpg-card-name">${preset.leader.name}</strong>
            <small class="th-rpg-card-title">${preset.leader.title}</small>
            <div class="th-rpg-stat-bars">
              <div class="th-rpg-stat-row"><small>공격</small><div class="th-rpg-stat-bg"><div class="th-rpg-stat-bar atk" style="width: ${preset.leader.atk}%"></div></div></div>
              <div class="th-rpg-stat-row"><small>방어</small><div class="th-rpg-stat-bg"><div class="th-rpg-stat-bar def" style="width: ${preset.leader.def}%"></div></div></div>
              <div class="th-rpg-stat-row"><small>회복</small><div class="th-rpg-stat-bg"><div class="th-rpg-stat-bar rec" style="width: ${preset.leader.rec}%"></div></div></div>
            </div>
            <div class="th-rpg-skill-box">
              <span class="th-rpg-skill-name">⚡ 고유스킬: ${preset.leader.skill}</span>
              <p class="th-rpg-skill-desc">${preset.leader.desc}</p>
            </div>
          </div>

          ${preset.members.map(m => `
            <div class="th-rpg-card member-card">
              <div class="th-rpg-card-top">
                <span class="th-rpg-role-badge">${m.roleKorean}</span>
                <span class="th-rpg-weight-pill">비중 ${m.weight}</span>
              </div>
              <strong class="th-rpg-card-name">${m.name}</strong>
              <small class="th-rpg-card-title">${m.role}</small>
              <div class="th-rpg-stat-bars">
                <div class="th-rpg-stat-row"><small>공격</small><div class="th-rpg-stat-bg"><div class="th-rpg-stat-bar atk" style="width: ${m.atk}%"></div></div></div>
                <div class="th-rpg-stat-row"><small>방어</small><div class="th-rpg-stat-bg"><div class="th-rpg-stat-bar def" style="width: ${m.def}%"></div></div></div>
                <div class="th-rpg-stat-row"><small>회복</small><div class="th-rpg-stat-bg"><div class="th-rpg-stat-bar rec" style="width: ${m.rec}%"></div></div></div>
              </div>
              <div class="th-rpg-skill-box">
                <span class="th-rpg-skill-name">🛡️ 스킬: ${m.skill}</span>
                <p class="th-rpg-skill-desc">${m.desc}</p>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="team-rpg-filter-bar">
          <span class="team-rpg-filter-lbl">🎯 4대 클래스 필터:</span>
          <button type="button" class="team-rpg-fbtn ${currentFilterRole === 'ALL' ? 'active' : ''}" data-role="ALL">전체 (45인)</button>
          <button type="button" class="team-rpg-fbtn ${currentFilterRole === 'LEADER' ? 'active' : ''}" data-role="LEADER">👑 팀장</button>
          <button type="button" class="team-rpg-fbtn ${currentFilterRole === 'DEALER' ? 'active' : ''}" data-role="DEALER">⚔️ 딜러 (공격)</button>
          <button type="button" class="team-rpg-fbtn ${currentFilterRole === 'TANKER' ? 'active' : ''}" data-role="TANKER">🛡️ 탱커 (방어)</button>
          <button type="button" class="team-rpg-fbtn ${currentFilterRole === 'HEALER' ? 'active' : ''}" data-role="HEALER">💖 힐러 (회복)</button>
        </div>
      `;

      builder.querySelectorAll('.team-rpg-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
          playRetroSound('click');
          selectedPresetId = e.currentTarget.dataset.pid;
          renderBuilder();
        });
      });

      builder.querySelector('#team-equip-action')?.addEventListener('click', (e) => {
        playRetroSound('levelup');
        spawnFloatingEffect('⚔️ 파티 덱 편성 완료!', e.clientX, e.clientY);
        showToast(`🎉 [${preset.name}] 파티가 활성화되었습니다! 전투력 CP ${preset.cp} 적용 완료!`);
      });

      builder.querySelectorAll('.team-rpg-fbtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          playRetroSound('click');
          currentFilterRole = e.currentTarget.dataset.role;
          builder.querySelectorAll('.team-rpg-fbtn').forEach(b => b.classList.toggle('active', b.dataset.role === currentFilterRole));
          applyClassFilter(currentFilterRole);
        });
      });
    }

    function applyClassFilter(role) {
      const cards = document.querySelectorAll('#team-grid .team-card');
      cards.forEach(card => {
        if (role === 'ALL') {
          card.style.display = '';
          card.classList.remove('rpg-filter-dimmed');
        } else {
          const text = card.textContent;
          let match = false;
          if (role === 'LEADER' && (text.includes('책임자') || text.includes('총괄') || text.includes('팀장'))) match = true;
          else if (role === 'DEALER' && (text.includes('모멘텀') || text.includes('퀀트') || text.includes('성장') || text.includes('리서치'))) match = true;
          else if (role === 'TANKER' && (text.includes('리스크') || text.includes('거시') || text.includes('검증') || text.includes('방어'))) match = true;
          else if (role === 'HEALER' && (text.includes('배당') || text.includes('가치') || text.includes('안정') || text.includes('운용'))) match = true;
          card.style.display = match ? '' : 'none';
        }
      });
    }

    renderBuilder();
    teamView.prepend(builder);
  }

  // 뷰 전환 시 자동 바인딩
  function checkAndInitViews() {
    setupOfficeRpg();
    setupPlazaRpg();
    setupTeamRpg();
  }

  document.addEventListener('DOMContentLoaded', checkAndInitViews);
  document.addEventListener('zero-view-changed', checkAndInitViews);
  setTimeout(checkAndInitViews, 400);
  setTimeout(checkAndInitViews, 1200);
  setTimeout(checkAndInitViews, 3000);
})();
