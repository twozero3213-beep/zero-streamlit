// -*- coding: utf-8 -*-
/* ZERO RPG 게임화 통합 시스템: 사무실(Office), 실시간 광장(Plaza), ZERO 팀(Team) 3대 공간 연동 */
(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const RPG_STORE_KEY = 'zero_rpg_state_v1';
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
      completedQuests: {},
      lastFountainDate: null,
      activePartyId: 'thorp_balance'
    };
  }

  function saveRpgState(state) {
    try {
      localStorage.setItem(RPG_STORE_KEY, JSON.stringify(state));
    } catch (_) {}
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

  // ── 1. 사무실 (Office / lobby-view) RPG 사령부 & 일일 퀘스트 ──
  function setupOfficeRpg() {
    const lobbySide = document.querySelector('#lobby-view .lobby-side');
    if (!lobbySide || document.getElementById('office-rpg-deck')) return;

    const state = getRpgState();
    const deck = document.createElement('section');
    deck.id = 'office-rpg-deck';
    deck.className = 'office-rpg-card';
    deck.setAttribute('aria-label', '사무실 RPG 사령부');

    function renderDeck() {
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
            showToast(`🎊 레벨 업! 오피스 사령부 Lv.${state.level} 달성!`);
          } else {
            showToast(`⭐ ${rewards.label}`);
          }
          saveRpgState(state);
          renderDeck();
        });
      });
    }

    renderDeck();
    lobbySide.prepend(deck);
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

    // 레이드 모달 핸들러
    deck.querySelector('#plaza-raid-btn').addEventListener('click', () => {
      openPlazaRaidModal();
    });

    // 분수대 동전 핸들러
    deck.querySelector('#plaza-fountain-btn').addEventListener('click', () => {
      const state = getRpgState();
      const today = new Date().toDateString();
      if (state.lastFountainDate === today) {
        showToast('⛲ 오늘은 이미 분수대의 가호를 받았습니다! 내일 다시 찾아와 주세요.');
        return;
      }
      state.lastFountainDate = today;
      state.exp += 30;
      saveRpgState(state);
      showToast('✨ 행운의 분수대 축복 획득! [오늘 시장 급락 시 채권 방패 100% 흡수] (+30 EXP)');
    });

    plazaView.append(deck);
  }

  function openPlazaRaidModal() {
    const overlay = document.createElement('div');
    overlay.className = 'th-modal-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'th-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    dialog.innerHTML = `
      <div class="th-modal-header">
        <h3 class="th-modal-title">⚔️ 광장 모험가 연합 레이드 전투 결과</h3>
        <button type="button" class="th-modal-close">✕</button>
      </div>
      <div class="th-modal-body">
        <p class="muted-note">[광장 모험가 연합] VS [고금리 볼케이노 드래곤] 3턴 전투 보고서</p>
        <div class="th-raid-log-list">
          <div class="th-raid-log-item">⚔️ 광장 모험가들이 [연준의 긴축 화염군주] 레이드 전장에 진입했습니다!</div>
          <div class="th-raid-log-item">👑 파티장 [에드워드 소프]의 [켈리의 황금 분할] 발동! 파티 변동성 50% 삭감 장막 전개!</div>
          <div class="th-raid-log-item">💥 [S&P 500 성기사]의 [복리 일격]! 보스에게 3,220 데미지 명중!</div>
          <div class="th-raid-log-item">🔥 [고금리 볼케이노 드래곤]이(가) [금리 불꽃 브레스(1,200)] 시전!</div>
          <div class="th-raid-log-item">🛡️ [단기국채 철벽 탱커]의 [금리 방패벽] 완벽 방어! 계좌 손실 0원 및 45,000원 세금 마찰 방어 성공!</div>
          <div class="th-raid-log-item">✨ [달러 비상금 사제]의 [긴급 절세 면제] 발동! 배당금 12,500원 골드 회복 및 추가 2,375 데미지!</div>
          <div class="th-raid-log-item">🎉 전투 승리! 고금리 볼케이노 드래곤을 격퇴하고 포트폴리오를 완벽하게 수호했습니다!</div>
        </div>
        <div class="th-raid-rewards">
          <div><div class="th-raid-reward-title">획득 경험치</div><div class="th-raid-reward-val">⭐ +85 EXP</div></div>
          <div><div class="th-raid-reward-title">수호한 마찰비용</div><div class="th-raid-reward-val">🛡️ 45,000원 방어</div></div>
          <div><div class="th-raid-reward-title">배당금 골드</div><div class="th-raid-reward-val">🪙 +12,500 G</div></div>
        </div>
      </div>
    `;

    dialog.querySelector('.th-modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.append(dialog);
    document.body.append(overlay);

    const state = getRpgState();
    state.exp += 85;
    state.gold += 12500;
    saveRpgState(state);
  }

  // ── 3. 제로팀 (Team / team-view) RPG 파티 덱 편성기 ──
  function setupTeamRpg() {
    const teamView = document.getElementById('team-view');
    if (!teamView || document.getElementById('team-rpg-builder')) return;

    let selectedPresetId = 'thorp_balance';
    let currentFilterRole = 'ALL';

    const builder = document.createElement('div');
    builder.id = 'team-rpg-builder';
    builder.className = 'team-rpg-builder-card';

    function renderBuilder() {
      const currentPreset = RPG_PRESETS.find(p => p.id === selectedPresetId) || RPG_PRESETS[0];

      builder.innerHTML = `
        <div class="team-rpg-head">
          <div>
            <span class="figma-pill badge-thorp-pill">ZERO 1-Click 파티</span>
            <h2 class="team-rpg-title">⚔️ ZERO 45인 팀 RPG 파티 덱 편성기</h2>
            <p class="muted-note">경제를 몰라도 걱정 마세요! 1초 만에 최적의 영웅 덱을 소환하고, 4대 클래스로 45인 팀원을 한눈에 파악해요.</p>
          </div>
        </div>

        <div class="team-rpg-tabs">
          ${RPG_PRESETS.map(p => `
            <button type="button" class="team-rpg-tab ${p.id === selectedPresetId ? 'active' : ''}" data-pid="${p.id}">
              ${p.name}
            </button>
          `).join('')}
        </div>

        <div class="team-rpg-concept-box">
          <div class="team-rpg-concept-head">
            <strong>${currentPreset.name} · ${currentPreset.badge}</strong>
            <span class="team-rpg-cp">⚔️ 전투력 CP: ${currentPreset.cp}</span>
          </div>
          <p class="team-rpg-concept-desc">${currentPreset.concept}</p>
          <div class="team-rpg-concept-target">${currentPreset.target}</div>
        </div>

        <div class="team-rpg-deck-grid">
          <div class="th-rpg-card is-leader">
            <div class="th-rpg-card-top">
              <span class="th-rpg-badge leader">👑 파티장</span>
              <span class="th-rpg-weight-tag">전략 지휘</span>
            </div>
            <div class="th-rpg-name">${currentPreset.leader.name}</div>
            <div class="th-rpg-asset">${currentPreset.leader.asset}</div>
            <div class="th-rpg-stat-bars">
              <div class="th-rpg-stat-row"><span class="th-rpg-stat-lbl">공격</span><div class="th-rpg-stat-track"><div class="th-rpg-stat-fill atk" style="width: ${currentPreset.leader.atk}%"></div></div><span class="th-rpg-stat-val">${currentPreset.leader.atk}</span></div>
              <div class="th-rpg-stat-row"><span class="th-rpg-stat-lbl">방어</span><div class="th-rpg-stat-track"><div class="th-rpg-stat-fill def" style="width: ${currentPreset.leader.def}%"></div></div><span class="th-rpg-stat-val">${currentPreset.leader.def}</span></div>
              <div class="th-rpg-stat-row"><span class="th-rpg-stat-lbl">회복</span><div class="th-rpg-stat-track"><div class="th-rpg-stat-fill rec" style="width: ${currentPreset.leader.rec}%"></div></div><span class="th-rpg-stat-val">${currentPreset.leader.rec}</span></div>
            </div>
            <div class="th-rpg-skill">
              <div class="th-rpg-skill-name">⚡ ${currentPreset.leader.skill}</div>
              <p class="th-rpg-skill-desc">${currentPreset.leader.desc}</p>
            </div>
          </div>

          ${currentPreset.members.map(m => `
            <div class="th-rpg-card">
              <div class="th-rpg-card-top">
                <span class="th-rpg-badge ${m.role.toLowerCase()}">${m.roleKorean}</span>
                <span class="th-rpg-weight-tag">${m.weight}</span>
              </div>
              <div class="th-rpg-name">${m.name}</div>
              <div class="th-rpg-asset">담당 자산: ${m.weight} 배분</div>
              <div class="th-rpg-stat-bars">
                <div class="th-rpg-stat-row"><span class="th-rpg-stat-lbl">공격</span><div class="th-rpg-stat-track"><div class="th-rpg-stat-fill atk" style="width: ${m.atk}%"></div></div><span class="th-rpg-stat-val">${m.atk}</span></div>
                <div class="th-rpg-stat-row"><span class="th-rpg-stat-lbl">방어</span><div class="th-rpg-stat-track"><div class="th-rpg-stat-fill def" style="width: ${m.def}%"></div></div><span class="th-rpg-stat-val">${m.def}</span></div>
                <div class="th-rpg-stat-row"><span class="th-rpg-stat-lbl">회복</span><div class="th-rpg-stat-track"><div class="th-rpg-stat-fill rec" style="width: ${m.rec}%"></div></div><span class="th-rpg-stat-val">${m.rec}</span></div>
              </div>
              <div class="th-rpg-skill">
                <div class="th-rpg-skill-name">⚡ ${m.skill}</div>
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
          selectedPresetId = e.currentTarget.dataset.pid;
          renderBuilder();
        });
      });

      builder.querySelectorAll('.team-rpg-fbtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
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
  setTimeout(checkAndInitViews, 600);
  setTimeout(checkAndInitViews, 2000);
})();
