// -*- coding: utf-8 -*-
/* ZERO RPG 게임화 통합 시스템 v3:
   1) 글로벌 5대 핵심 모드 이지-액세스 바 (초보자 3초 접근성)
   2) 커스텀 SVG 치비(Chibi) RPG 영웅 일러스트 엔진 (대마법사·성기사·철벽탱커·대사제·보스드래곤)
   3) 홈 화면 RPG 영웅 웰컴 스테이지 & 1-2-3초 입문 가이드
   4) 사무실(Office) 영웅 집무실 라운지 & 실시간 황금 금고 타이쿤(Idle Gold Vault) & 영웅 상세/강화 모달
   5) 실시간 광장(Plaza) 드래곤 보스 레이드 배틀 & ZERO 팀(Team) 45인 영웅 도감 시각화 */
(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const RPG_STORE_KEY = 'zero_rpg_state_v3';
  function getRpgState() {
    try {
      const raw = localStorage.getItem(RPG_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) {}
    return {
      level: 12,
      title: '그랜드 마스터 모험가',
      exp: 450,
      maxExp: 1000,
      gold: 64500,
      stamina: 100,
      maxStamina: 100,
      gems: 250,
      vaultGold: 1250,
      bossHp: 6800,
      bossMaxHp: 10000,
      heroLevels: {
        leader: 15,
        dealer: 12,
        tanker: 14,
        healer: 13
      },
      completedQuests: {},
      lastFountainDate: null,
      lastCoffeeDate: null,
      lastBullDate: null,
      lastBookDate: null,
      lastRouletteDate: null,
      lastAttendanceDate: null,
      activePartyId: 'thorp_balance',
      activeBuffs: ['절세 에메랄드 장막', '켈리 황금 복리 부스터']
    };
  }

  function saveRpgState(state) {
    try {
      localStorage.setItem(RPG_STORE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  // ── 커스텀 SVG 치비(Chibi) RPG 영웅 일러스트 생성기 ──
  function getHeroSvg(role, size = 84) {
    const r = String(role || 'LEADER').toUpperCase();
    if (r === 'LEADER') {
      // 🧙‍♂️ 대마법사 (Archmage - 에드워드 소프)
      return `<svg class="rpg-hero-svg role-leader" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="auraL" cx="50%" cy="55%" r="48%">
            <stop offset="0%" stop-color="#c084fc" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="robeL" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#6d28d9"/>
            <stop offset="100%" stop-color="#312e81"/>
          </linearGradient>
        </defs>
        <circle cx="50" cy="54" r="44" fill="url(#auraL)"/>
        <ellipse cx="50" cy="88" rx="28" ry="6" fill="#4c1d95" opacity="0.35"/>
        <!-- 마법 지팡이 -->
        <line x1="80" y1="26" x2="72" y2="86" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
        <circle cx="81" cy="22" r="8" fill="#38bdf8" stroke="#fde047" stroke-width="2.5"/>
        <circle cx="81" cy="22" r="3.5" fill="#ffffff"/>
        <!-- 마법사 로브 & 망토 -->
        <path d="M28 84 L36 52 L64 52 L72 84 Z" fill="url(#robeL)" stroke="#fbbf24" stroke-width="2"/>
        <path d="M45 52 L50 84 L55 52 Z" fill="#fbbf24" opacity="0.85"/>
        <!-- 얼굴 -->
        <circle cx="50" cy="42" r="15" fill="#fde6ce" stroke="#475569" stroke-width="1.5"/>
        <!-- 은빛 헤어 -->
        <path d="M35 40 Q38 28 50 28 Q62 28 65 40" fill="#e2e8f0"/>
        <!-- 지혜의 안경 & 눈 -->
        <circle cx="44" cy="42" r="4.2" fill="none" stroke="#d97706" stroke-width="1.6"/>
        <circle cx="56" cy="42" r="4.2" fill="none" stroke="#d97706" stroke-width="1.6"/>
        <line x1="48.2" y1="42" x2="51.8" y2="42" stroke="#d97706" stroke-width="1.6"/>
        <circle cx="44" cy="42" r="2" fill="#1e293b"/>
        <circle cx="56" cy="42" r="2" fill="#1e293b"/>
        <circle cx="44.8" cy="41.2" r="0.8" fill="#ffffff"/>
        <circle cx="56.8" cy="41.2" r="0.8" fill="#ffffff"/>
        <!-- 미소 -->
        <path d="M46 48 Q50 51 54 48" fill="none" stroke="#b45309" stroke-width="1.8" stroke-linecap="round"/>
        <!-- 대마법사 고깔모자 -->
        <path d="M24 31 Q50 25 76 31 L50 6 Z" fill="#4c1d95" stroke="#fbbf24" stroke-width="2"/>
        <path d="M33 28 L67 28" stroke="#fbbf24" stroke-width="3.5" stroke-linecap="round"/>
        <polygon points="50,14 52,19 57,19 53,22 54.5,27 50,24 45.5,27 47,22 43,19 48,19" fill="#fde047"/>
      </svg>`;
    }
    if (r === 'DEALER') {
      // ⚔️ 성기사 딜러 (Paladin Dealer - S&P 500 / 피터 린치)
      return `<svg class="rpg-hero-svg role-dealer" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="auraD" cx="50%" cy="55%" r="48%">
            <stop offset="0%" stop-color="#60a5fa" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="armorD" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#2563eb"/>
            <stop offset="100%" stop-color="#1d4ed8"/>
          </linearGradient>
        </defs>
        <circle cx="50" cy="54" r="44" fill="url(#auraD)"/>
        <ellipse cx="50" cy="88" rx="28" ry="6" fill="#1e3a8a" opacity="0.35"/>
        <!-- 붉은 영웅 망토 -->
        <path d="M24 83 L32 50 L68 50 L76 83 Z" fill="#dc2626"/>
        <!-- 빛나는 엑스칼리버 검 -->
        <path d="M81 16 L85 22 L79 62 L73 62 L77 22 Z" fill="#38bdf8" stroke="#fde047" stroke-width="2"/>
        <rect x="69" y="60" width="16" height="4" rx="2" fill="#f59e0b"/>
        <rect x="75" y="64" width="4" height="9" rx="1" fill="#b45309"/>
        <!-- 성기사 갑옷 -->
        <path d="M32 84 L37 52 L63 52 L68 84 Z" fill="url(#armorD)" stroke="#fbbf24" stroke-width="2"/>
        <polygon points="50,57 55,66 50,75 45,66" fill="#fde047"/>
        <!-- 얼굴 -->
        <circle cx="50" cy="41" r="15" fill="#fde6ce" stroke="#475569" stroke-width="1.5"/>
        <!-- 금빛 헤어 -->
        <path d="M34 38 Q36 22 50 23 Q64 22 66 38 L62 32 L55 36 L50 30 L44 36 L38 32 Z" fill="#fbbf24" stroke="#d97706" stroke-width="1"/>
        <!-- 초롱초롱한 눈 -->
        <circle cx="43.5" cy="42" r="2.6" fill="#1e293b"/>
        <circle cx="56.5" cy="42" r="2.6" fill="#1e293b"/>
        <circle cx="44.3" cy="41" r="1" fill="#ffffff"/>
        <circle cx="57.3" cy="41" r="1" fill="#ffffff"/>
        <path d="M46 48 Q50 51.5 54 48" fill="none" stroke="#b45309" stroke-width="1.8" stroke-linecap="round"/>
        <!-- 성기사 날개 티아라 -->
        <path d="M36 26 L50 18 L64 26 L60 30 L50 24 L40 30 Z" fill="#fde047" stroke="#d97706" stroke-width="1.2"/>
        <circle cx="50" cy="23" r="3" fill="#ef4444"/>
      </svg>`;
    }
    if (r === 'TANKER') {
      // 🛡️ 철벽 가디언 탱커 (Iron Tanker - 워런 버핏 / 단기국채)
      return `<svg class="rpg-hero-svg role-tanker" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="auraT" cx="50%" cy="55%" r="48%">
            <stop offset="0%" stop-color="#34d399" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#059669" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="50" cy="54" r="44" fill="url(#auraT)"/>
        <ellipse cx="50" cy="88" rx="28" ry="6" fill="#064e3b" opacity="0.35"/>
        <!-- 에메랄드 중갑옷 -->
        <path d="M29 84 L34 51 L66 51 L71 84 Z" fill="#059669" stroke="#fbbf24" stroke-width="2.5"/>
        <rect x="30" y="50" width="11" height="10" rx="4" fill="#fbbf24"/>
        <rect x="59" y="50" width="11" height="10" rx="4" fill="#fbbf24"/>
        <!-- 얼굴 -->
        <circle cx="50" cy="40" r="15" fill="#fde6ce" stroke="#475569" stroke-width="1.5"/>
        <path d="M35 37 Q38 24 50 24 Q62 24 65 37" fill="#94a3b8"/>
        <!-- 든든한 눈썹과 미소 -->
        <line x1="40" y1="37" x2="47" y2="38" stroke="#334155" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="60" y1="37" x2="53" y2="38" stroke="#334155" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="43.5" cy="41.5" r="2.3" fill="#1e293b"/>
        <circle cx="56.5" cy="41.5" r="2.3" fill="#1e293b"/>
        <path d="M45 47 Q50 50.5 55 47" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round"/>
        <!-- 황금 왕관 -->
        <polygon points="36,27 39,15 45,22 50,13 55,22 61,15 64,27" fill="#fde047" stroke="#d97706" stroke-width="1.5"/>
        <!-- 거대 황금 방패 -->
        <path d="M62 48 L86 48 L86 66 Q74 84 62 66 Z" fill="#fbbf24" stroke="#b45309" stroke-width="2.5"/>
        <path d="M66 52 L82 52 L82 64 Q74 77 66 64 Z" fill="#10b981"/>
        <path d="M74 54 L74 71 M68 61 L80 61" stroke="#fde047" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
    }
    if (r === 'BOSS') {
      // 🐉 고금리 볼케이노 드래곤 (Raid Boss)
      return `<svg class="rpg-hero-svg role-boss" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="auraB" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#f97316" stop-opacity="0.65"/>
            <stop offset="100%" stop-color="#dc2626" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill="url(#auraB)"/>
        <!-- 드래곤 날개 -->
        <path d="M45 52 L10 22 L18 46 L8 58 L28 62 Z" fill="#991b1b" stroke="#f97316" stroke-width="1.8"/>
        <path d="M55 52 L90 22 L82 46 L92 58 L72 62 Z" fill="#991b1b" stroke="#f97316" stroke-width="1.8"/>
        <!-- 드래곤 몸통 & 머리 -->
        <path d="M34 86 L40 48 L60 48 L66 86 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
        <path d="M42 52 L58 52 L56 84 L44 84 Z" fill="#fbbf24"/>
        <!-- 뿔 -->
        <path d="M38 28 L26 10 L44 24 Z" fill="#fde047" stroke="#b45309" stroke-width="1.5"/>
        <path d="M62 28 L74 10 L56 24 Z" fill="#fde047" stroke="#b45309" stroke-width="1.5"/>
        <rect x="34" y="22" width="32" height="28" rx="10" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
        <!-- 빛나는 눈 & 화염 -->
        <polygon points="39,32 47,35 39,38" fill="#fef08a"/>
        <polygon points="61,32 53,35 61,38" fill="#fef08a"/>
        <circle cx="22" cy="74" r="6" fill="#f97316"/>
        <circle cx="78" cy="72" r="5" fill="#fbbf24"/>
      </svg>`;
    }
    // 💖 대사제 힐러 / 버퍼 (High Priestess Healer - 배당 / 달러현금)
    return `<svg class="rpg-hero-svg role-healer" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="auraH" cx="50%" cy="55%" r="48%">
          <stop offset="0%" stop-color="#f472b6" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#ec4899" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="54" r="44" fill="url(#auraH)"/>
      <ellipse cx="50" cy="88" rx="28" ry="6" fill="#831843" opacity="0.28"/>
      <!-- 천사 날개 -->
      <path d="M36 56 Q14 42 18 64 Q24 72 36 68 Z" fill="#ffffff" stroke="#f9a8d4" stroke-width="1.5"/>
      <path d="M64 56 Q86 42 82 64 Q76 72 64 68 Z" fill="#ffffff" stroke="#f9a8d4" stroke-width="1.5"/>
      <!-- 성스러운 드레스 -->
      <path d="M30 84 L37 52 L63 52 L70 84 Z" fill="#fdf2f8" stroke="#f472b6" stroke-width="2"/>
      <path d="M46 52 L50 84 L54 52 Z" fill="#f472b6"/>
      <!-- 치유 성배 지팡이 -->
      <line x1="78" y1="30" x2="74" y2="84" stroke="#fbbf24" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M78 22 C74 17 69 22 78 30 C87 22 82 17 78 22 Z" fill="#ec4899" stroke="#fde047" stroke-width="1.5"/>
      <!-- 얼굴 & 핑크빛 헤어 -->
      <circle cx="50" cy="41" r="15" fill="#fde6ce" stroke="#475569" stroke-width="1.5"/>
      <path d="M34 42 Q34 23 50 23 Q66 23 66 42 L62 34 L50 31 L38 34 Z" fill="#f472b6"/>
      <circle cx="43.5" cy="42" r="2.4" fill="#1e293b"/>
      <circle cx="56.5" cy="42" r="2.4" fill="#1e293b"/>
      <circle cx="44.3" cy="41.2" r="0.9" fill="#ffffff"/>
      <circle cx="57.3" cy="41.2" r="0.9" fill="#ffffff"/>
      <circle cx="39" cy="45" r="2.5" fill="#fb7185" opacity="0.45"/>
      <circle cx="61" cy="45" r="2.5" fill="#fb7185" opacity="0.45"/>
      <path d="M46 47.5 Q50 51 54 47.5" fill="none" stroke="#db2777" stroke-width="1.8" stroke-linecap="round"/>
      <!-- 천사 헤일로(광배) -->
      <ellipse cx="50" cy="17" rx="12" ry="3.5" fill="none" stroke="#fde047" stroke-width="2.5"/>
    </svg>`;
  }

  // 8비트 레트로 사운드 신시사이저 (Web Audio API - 무설치 즉시 재생)
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
        gain.gain.setValueAtTime(0.11, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'levelup') {
        osc.type = 'triangle';
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        });
        gain.gain.setValueAtTime(0.14, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
      } else if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, ctx.currentTime);
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
    }, 3000);
  }

  function spawnFloatingEffect(text, x, y) {
    const el = document.createElement('div');
    el.className = 'rpg-floating-pop';
    el.textContent = text;
    el.style.left = Math.max(20, Math.min((window.innerWidth || 360) - 160, (x || ((window.innerWidth || 360) / 2 - 40)))) + 'px';
    el.style.top = Math.max(40, (y || ((window.innerHeight || 600) / 2 - 50))) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1250);
  }

  function goView(viewName) {
    playRetroSound('click');
    if (window.ZERO?.navigate) {
      window.ZERO.navigate(viewName);
    } else {
      window.location.hash = '#' + viewName;
    }
    const menu = document.getElementById('more-menu');
    if (menu?.open) menu.close();
  }

  const RPG_PRESETS = [
    {
      id: 'thorp_balance',
      name: '⚖️ 소프 황금 밸런스 파티',
      badge: 'SSR ★★★★★ · 초보자 1위 추천',
      cp: '148,500',
      concept: '주식(공격 55.6%) + 단기국채(방어 29.4%) + 달러현금(치유 15.0%) 황금비율로 폭락장을 이기는 정석 파티',
      target: '🎯 주식이 처음이거나 마음 편히 장기 복리를 누리고 싶은 모험가',
      leader: {
        key: 'leader',
        name: '에드워드 소프',
        title: '대마법사 · 확률의 지배자',
        role: 'LEADER',
        roleKorean: '👑 파티장 (마법사)',
        rarity: 'SSR ★★★★★',
        atk: 95, def: 95, rec: 90,
        skill: '켈리의 황금 분할 마법',
        quote: '“확률과 복리의 마법으로 계좌의 변동성을 절반으로 줄여드리겠습니다!”',
        desc: '하락장 위험을 절반으로 줄이고, 세금·수수료보다 큰 기회가 올 때만 정밀 타격합니다.',
        items: ['🪄 복리의 황금 지팡이 +12', '📘 켈리 공식 마도서 +10', '💍 절세의 에메랄드 반지 +9']
      },
      members: [
        {
          key: 'dealer',
          name: 'S&P 500 성기사',
          title: '빛의 메인 딜러 · SPY',
          role: 'DEALER',
          roleKorean: '⚔️ 딜러 (공격)',
          rarity: 'SSR ★★★★★',
          atk: 92, def: 75, rec: 60,
          skill: '500대 우량기업 연합 일격',
          weight: '55.6%',
          quote: '“미국 1등 기업들의 성장 화력으로 대표님의 자산을 우상향시키겠습니다!”',
          desc: '애플·마이크로소프트·엔비디아 등 미국 500대 기업의 성장력을 담당하는 핵심 공격수입니다.',
          items: ['⚔️ 우상향의 엑스칼리버 +11', '🛡️ 분산투자 성기사 갑옷 +9']
        },
        {
          key: 'tanker',
          name: '단기국채 가디언',
          title: '철벽의 수호기사 · SHV/BIL',
          role: 'TANKER',
          roleKorean: '🛡️ 탱커 (방어)',
          rarity: 'SSR ★★★★★',
          atk: 35, def: 99, rec: 80,
          skill: '미 재무부 절대 방패벽',
          weight: '29.4%',
          quote: '“어떤 폭락장 화염이 날아와도 제 방패 뒤에서는 원금이 100% 안전합니다!”',
          desc: '미국 정부가 보증하는 단기국채 이자(연 4~5%대)를 받으며 폭락장 충격을 완벽히 흡수합니다.',
          items: ['🛡️ 미 재무부 황금 방패 +13', '👑 무위험 이자의 왕관 +10']
        },
        {
          key: 'healer',
          name: '달러 비상금 대사제',
          title: '치유와 절세의 성녀 · CASH',
          role: 'HEALER',
          roleKorean: '💖 힐러 (회복)',
          rarity: 'SSR ★★★★★',
          atk: 25, def: 88, rec: 99,
          skill: '바겐세일 긴급 치유 & 절세 장막',
          weight: '15.0%',
          quote: '“수수료와 세금 누수를 막아내고, 폭락장 바겐세일 때 즉시 출동해요!”',
          desc: '잦은 매매로 인한 세금·수수료 손실을 치료하고 폭락 시 저가 매수 기회를 제공합니다.',
          items: ['🏆 마르지 않는 배당 성배 +11', '✨ 비과세 천사 날개 +10']
        }
      ]
    },
    {
      id: 'defense_knight',
      name: '🛡️ 워런 버핏 철벽 수비 파티',
      badge: 'SSR ★★★★★ · 원금 보존 & 월배당',
      cp: '136,200',
      concept: '매달 들어오는 배당금(치유)과 채권 방패로 주가가 흔들려도 발 뻗고 자는 절대 수비형 파티',
      target: '🎯 원금 손실이 가장 싫고 매달 따박따박 현금흐름(배당)을 받고 싶은 모험가',
      leader: {
        key: 'leader',
        name: '워런 버핏',
        title: '성기사단장 · 오마하의 현인',
        role: 'TANKER',
        roleKorean: '👑 파티장 (수호단장)',
        rarity: 'SSR ★★★★★',
        atk: 82, def: 99, rec: 96,
        skill: '제1원칙: 원금 불패의 성역',
        quote: '“투자의 제1원칙은 돈을 잃지 않는 것입니다. 제2원칙은 제1원칙을 잊지 않는 것입니다!”',
        desc: '경제적 해자(독점 경쟁력)를 가진 우량 배당주와 국채로 어떤 위기에도 계좌를 지킵니다.',
        items: ['🛡️ 오마하의 절대 방패 +15', '👑 복리 스노우볼 왕관 +12', '💍 가치투자 인내 반지 +10']
      },
      members: [
        {
          key: 'healer',
          name: '배당다우존스 대사제',
          title: '월배당 치유사 · SCHD',
          role: 'HEALER',
          roleKorean: '💖 힐러 (배당회복)',
          rarity: 'SSR ★★★★★',
          atk: 78, def: 90, rec: 99,
          skill: '마르지 않는 황금 배당샘',
          weight: '40.0%',
          quote: '“주가가 쉬어갈 때도 따스한 배당금으로 계좌 체력을 가득 채워드릴게요!”',
          desc: '10년 연속 배당을 늘려온 초우량 가치주들로 꾸준한 현금 흐름을 만듭니다.',
          items: ['🏆 황금 배당의 성배 +12', '🌸 복리 재투자 로브 +10']
        },
        {
          key: 'tanker',
          name: '국채 요새 골렘',
          title: '강철 수호자 · IEF/SHV',
          role: 'TANKER',
          roleKorean: '🛡️ 탱커 (방어)',
          rarity: 'SSR ★★★★★',
          atk: 30, def: 99, rec: 85,
          skill: '위기 반사 방어벽',
          weight: '45.0%',
          quote: '“주식 시장에 폭풍이 불면 제가 가장 단단한 성벽이 됩니다!”',
          desc: '경제 위기 시 가치가 오르는 국채 비중을 높여 계좌 전체가 흔들리지 않게 고정합니다.',
          items: ['🛡️ 다이아몬드 성벽 방패 +12', '⚓ 흔들리지 않는 갑옷 +11']
        },
        {
          key: 'dealer',
          name: '황금금고 수호성녀',
          title: '안전 버퍼 · 달러예금',
          role: 'HEALER',
          roleKorean: '💖 버퍼 (안전망)',
          rarity: 'SSR ★★★★★',
          atk: 20, def: 95, rec: 98,
          skill: '무결점 절세 보호막',
          weight: '15.0%',
          quote: '“비상금 15%가 있어야 어떤 순간에도 조급해지지 않아요!”',
          desc: '심리적 안정감과 즉각적인 현금 유동성을 100% 보장합니다.',
          items: ['🔑 황금 금고 열쇠 +10', '💍 평정심의 수호석 +10']
        }
      ]
    },
    {
      id: 'tech_attack',
      name: '🚀 피터 린치 테크 드래곤 파티',
      badge: 'SSR ★★★★★ · AI 혁신 초고속 성장',
      cp: '154,900',
      concept: 'AI·반도체·글로벌 빅테크 혁신 기업에 화력을 집중해 폭발적인 자산 성장을 노리는 공격 파티',
      target: '🎯 일상 속 혁신 기업을 좋아하고 5년 이상 장기 성장에 투자하는 모험가',
      leader: {
        key: 'leader',
        name: '피터 린치',
        title: '드래곤 마스터 · 월가의 전설',
        role: 'DEALER',
        roleKorean: '👑 파티장 (공격대장)',
        rarity: 'SSR ★★★★★',
        atk: 99, def: 72, rec: 75,
        skill: '텐배거(10루타) 드래곤 스트라이크',
        quote: '“우리가 매일 쓰는 제품과 AI 기술 속에 10배 오를 슈퍼스타가 숨어 있습니다!”',
        desc: '실적이 폭발적으로 성장하는 1등 기술 기업들을 발굴해 공격력을 극대화합니다.',
        items: ['⚔️ 텐배거 드래곤 슬레이어 +14', '🦅 천리안의 투구 +11', '🔥 성장 부스터 망토 +10']
      },
      members: [
        {
          key: 'dealer',
          name: '나스닥 100 드래곤나이트',
          title: '초신성 메인 딜러 · QQQ',
          role: 'DEALER',
          roleKorean: '⚔️ 딜러 (초공격)',
          rarity: 'SSR ★★★★★',
          atk: 99, def: 62, rec: 45,
          skill: '빅테크 메테오 임팩트',
          weight: '65.0%',
          quote: '“글로벌 AI·클라우드 제국의 최전선에서 가장 강력한 수익 화력을 뿜어냅니다!”',
          desc: '세계 혁신을 이끄는 나스닥 100대 기술 기업의 폭발적인 성장 에너지를 담았습니다.',
          items: ['⚔️ AI 광선검 +13', '⚡ 초전도 윙 부츠 +11']
        },
        {
          key: 'leader',
          name: '반도체 아크위저드',
          title: '광역 마법 딜러 · SOXX/NVDA',
          role: 'LEADER',
          roleKorean: '🧙‍♂️ 마법딜러 (혁신)',
          rarity: 'SSR ★★★★★',
          atk: 96, def: 65, rec: 50,
          skill: '실리콘 웨이퍼 초신성',
          weight: '20.0%',
          quote: '“모든 AI 마법은 반도체 칩 위에서 탄생합니다!”',
          desc: '미래 산업의 쌀인 반도체 핵심 장비·설계 기업으로 추가 공격력을 더합니다.',
          items: ['🪄 나노 공정 크리스탈 스태프 +12', '🔮 데이터센터 오브 +10']
        },
        {
          key: 'healer',
          name: '스나이퍼 현금 사제',
          title: '기회포착 힐러 · CASH',
          role: 'HEALER',
          roleKorean: '💖 힐러 (기회포착)',
          rarity: 'SSR ★★★★★',
          atk: 30, def: 88, rec: 96,
          skill: '조정장 바겐세일 부활술',
          weight: '15.0%',
          quote: '“기술주가 일시적으로 흔들릴 때 가장 싸게 담을 수 있는 마법 물약이에요!”',
          desc: '공격형 파티가 흔들릴 때 체력을 회복하고 저가 매수 찬스를 잡습니다.',
          items: ['🧪 바겐세일 엘릭서 +11', '🛡️ 변동성 완충 로브 +10']
        }
      ]
    }
  ];

  const CURRENT_BOSS = {
    name: '🐉 고금리 볼케이노 드래곤',
    title: '연준의 긴축 화염군주 (기준금리 4.75%)',
    element: '🛡️ 단기국채 방패 & ⚖️ 소프 켈리 마법',
    desc: '전 세계 시장을 뒤흔드는 고금리 화염을 내뿜습니다! 하지만 단기국채 탱커와 현금 힐러가 편성된 파티라면 화염 데미지를 100% 방어하고 오히려 이자 보상을 획득할 수 있습니다!'
  };

  // ── 영웅 상세 도감 & 장비 강화 모달 (Hero Character Sheet Modal) ──
  function openHeroDetailModal(heroData) {
    playRetroSound('click');
    const state = getRpgState();
    const hKey = heroData.key || 'leader';
    const currentLv = state.heroLevels?.[hKey] || 12;

    let dialog = document.getElementById('rpg-hero-detail-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'rpg-hero-detail-dialog';
      dialog.className = 'rpg-hero-modal';
      document.body.appendChild(dialog);
    }

    function renderModalContent() {
      const lv = state.heroLevels?.[hKey] || 12;
      const bonusAtk = Math.min(100, (heroData.atk || 85) + (lv - 12));
      const bonusDef = Math.min(100, (heroData.def || 85) + (lv - 12));
      const bonusRec = Math.min(100, (heroData.rec || 85) + (lv - 12));

      dialog.innerHTML = `
        <div class="rpg-hero-modal-inner">
          <div class="rpg-hero-modal-head">
            <span class="rpg-ssr-pill">${heroData.rarity || 'SSR ★★★★★'}</span>
            <button type="button" class="icon-button icon-close" id="rpg-hero-modal-close">닫기</button>
          </div>
          <div class="rpg-hero-modal-showcase">
            <div class="rpg-hero-modal-avatar">
              ${getHeroSvg(heroData.role, 118)}
              <span class="rpg-hero-lv-chip">Lv.${lv}</span>
            </div>
            <div class="rpg-hero-modal-info">
              <span class="rpg-hero-role-tag">${heroData.roleKorean || '👑 전설 영웅'}</span>
              <h3>${heroData.name}</h3>
              <p class="rpg-hero-sub">${heroData.title}</p>
              <blockquote class="rpg-hero-quote">${heroData.quote || '“대표님의 자산을 끝까지 수호하겠습니다!”'}</blockquote>
            </div>
          </div>

          <div class="rpg-hero-explain-box">
            <strong>💡 쉬운 금융 해설: 이 영웅은 내 돈에 어떤 역할을 하나요?</strong>
            <p>${heroData.desc}</p>
          </div>

          <div class="rpg-hero-stats-box">
            <div class="rpg-stat-line">
              <span>⚔️ 수익 공격력</span>
              <div class="rpg-stat-bar-wrap"><div class="rpg-stat-bar-fill atk" style="width:${bonusAtk}%"></div></div>
              <strong>${bonusAtk}</strong>
            </div>
            <div class="rpg-stat-line">
              <span>🛡️ 폭락 방어력</span>
              <div class="rpg-stat-bar-wrap"><div class="rpg-stat-bar-fill def" style="width:${bonusDef}%"></div></div>
              <strong>${bonusDef}</strong>
            </div>
            <div class="rpg-stat-line">
              <span>💖 배당·절세 회복력</span>
              <div class="rpg-stat-bar-wrap"><div class="rpg-stat-bar-fill rec" style="width:${bonusRec}%"></div></div>
              <strong>${bonusRec}</strong>
            </div>
          </div>

          <div class="rpg-hero-equip-box">
            <strong>🎒 장착 중인 전설 투자 아티팩트 (장비)</strong>
            <div class="rpg-equip-list">
              ${(heroData.items || ['🪄 복리의 지팡이 +10', '🛡️ 국채 방패 +10', '💍 절세의 반지 +10']).map(item => `
                <span class="rpg-equip-chip">${item}</span>
              `).join('')}
            </div>
          </div>

          <div class="rpg-hero-modal-actions">
            <button type="button" class="rpg-upgrade-hero-btn" id="btn-hero-levelup">
              ⚡ 영웅 레벨업 & 장비 강화 (무료 훈련 +1 Lv)
            </button>
            <button type="button" class="rpg-talk-hero-btn" id="btn-hero-office-go">
              🏰 내 사무실에서 함께 일하기
            </button>
          </div>
        </div>
      `;

      dialog.querySelector('#rpg-hero-modal-close')?.addEventListener('click', () => dialog.close());
      dialog.querySelector('#btn-hero-levelup')?.addEventListener('click', (e) => {
        state.heroLevels = state.heroLevels || { leader: 15, dealer: 12, tanker: 14, healer: 13 };
        state.heroLevels[hKey] = (state.heroLevels[hKey] || 12) + 1;
        state.exp += 60;
        if (state.exp >= state.maxExp) {
          state.level += 1;
          state.exp -= state.maxExp;
        }
        saveRpgState(state);
        playRetroSound('levelup');
        spawnFloatingEffect(`🎊 Lv.${state.heroLevels[hKey]} 강화 성공! 전 스탯 +1!`, e.clientX, e.clientY);
        showToast(`🌟 [${heroData.name}] 영웅이 Lv.${state.heroLevels[hKey]}(으)로 승급했습니다! 전투력이 상승합니다!`);
        renderModalContent();
        checkAndInitViews();
      });

      dialog.querySelector('#btn-hero-office-go')?.addEventListener('click', () => {
        dialog.close();
        goView('lobby');
      });
    }

    renderModalContent();
    if (!dialog.open) dialog.showModal();
  }

  // ── 0. 글로벌 5대 핵심 모드 원터치 바로가기 바 (초보자 3초 접근성) ──
  function setupGlobalEasyBar() {
    const main = document.getElementById('main-content');
    const topbar = main?.querySelector('.topbar');
    if (!main || !topbar) return;

    let bar = document.getElementById('zero-easy-mode-bar');
    if (!bar) {
      bar = document.createElement('nav');
      bar.id = 'zero-easy-mode-bar';
      bar.className = 'zero-easy-mode-bar';
      bar.setAttribute('aria-label', '초보자 5대 핵심 모드 바로가기');
      topbar.insertAdjacentElement('afterend', bar);
    }

    const current = document.documentElement.dataset.zeroView || 'home';
    const modes = [
      { view: 'home', icon: '🏠', title: '1. RPG 홈 라운지', sub: '3초 시작 가이드' },
      { view: 'lobby', icon: '🏰', title: '2. 내 사무실 (타이쿤)', sub: '금고 수확 · 캐릭터 대화' },
      { view: 'team', icon: '⚔️', title: '3. 영웅 도감 · 팀편성', sub: '1-Click 덱 장착' },
      { view: 'plaza', icon: '🐉', title: '4. 보스 레이드 광장', sub: '고금리 드래곤 토벌' },
      { view: 'portfolio', icon: '💰', title: '5. 1억 모의투자', sub: '내 자산 · 실전 연습' }
    ];

    bar.innerHTML = modes.map(m => `
      <button type="button" class="easy-mode-pill ${current === m.view ? 'active' : ''}" data-easy-view="${m.view}">
        <span class="easy-mode-icon">${m.icon}</span>
        <span class="easy-mode-text">
          <strong>${m.title}</strong>
          <small>${m.sub}</small>
        </span>
      </button>
    `).join('');

    bar.querySelectorAll('[data-easy-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        goView(btn.dataset.easyView);
      });
    });
  }

  // ── 1. 홈 화면 (Home / home-view) RPG 영웅 웰컴 라운지 & 3초 입문 가이드 ──
  function setupHomeRpgGateway() {
    const homeView = document.getElementById('home-view');
    if (!homeView) return;

    const state = getRpgState();
    const activePreset = RPG_PRESETS.find(p => p.id === state.activePartyId) || RPG_PRESETS[0];
    const allHeroes = [activePreset.leader, ...activePreset.members];

    let gateway = document.getElementById('home-rpg-gateway');
    if (!gateway) {
      gateway = document.createElement('section');
      gateway.id = 'home-rpg-gateway';
      gateway.className = 'home-rpg-gateway-card';
      homeView.prepend(gateway);
    }

    gateway.innerHTML = `
      <div class="rpg-gw-top">
        <div class="rpg-gw-title-area">
          <div class="rpg-gw-badges">
            <span class="rpg-gw-pill-live">🎮 ZERO 투자 RPG 월드</span>
            <span class="rpg-gw-pill-lv">👑 Lv.${state.level} ${state.title} · 전투력 ${activePreset.cp} CP</span>
          </div>
          <h2 class="rpg-gw-headline">어려운 주식은 끝! 전설의 영웅들과 게임처럼 투자하세요</h2>
          <p class="rpg-gw-subline">캐릭터를 터치하면 영웅의 장비와 쉬운 금융 마법을 확인하고 강화할 수 있어요.</p>
        </div>
        <div class="rpg-gw-preset-switcher" role="group" aria-label="1초 파티 전환">
          ${RPG_PRESETS.map(p => `
            <button type="button" class="rpg-gw-preset-btn ${p.id === activePreset.id ? 'active' : ''}" data-home-preset="${p.id}">
              ${p.name}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- 시각적 캐릭터 아바타 스테이지 (4인 영웅 일러스트 쇼케이스) -->
      <div class="rpg-hero-stage-grid">
        ${allHeroes.map((h, idx) => {
          const lv = state.heroLevels?.[h.key || 'leader'] || (12 + idx);
          return `
            <article class="rpg-stage-hero-card" data-hero-idx="${idx}" tabindex="0" role="button" aria-label="${h.name} 상세 보기">
              <div class="rpg-hero-speech">${h.quote}</div>
              <div class="rpg-hero-Rarity-row">
                <span class="rpg-ssr-mini">${h.rarity || 'SSR ★★★★★'}</span>
                <span class="rpg-lv-mini">Lv.${lv}</span>
              </div>
              <div class="rpg-hero-art-wrap">
                ${getHeroSvg(h.role, 86)}
              </div>
              <div class="rpg-hero-meta">
                <span class="rpg-hero-class-badge">${h.roleKorean}</span>
                <strong class="rpg-hero-name">${h.name}</strong>
                <small class="rpg-hero-skill-tag">⚡ ${h.skill}</small>
              </div>
              <span class="rpg-hero-touch-hint">👆 터치하여 장비·강화 보기</span>
            </article>
          `;
        }).join('')}
      </div>

      <!-- 초보자 3단계 원클릭 가이드 -->
      <div class="rpg-easy-steps-bar">
        <button type="button" class="rpg-step-card step-1" data-step-go="lobby">
          <span class="step-num">STEP 1</span>
          <div class="step-body">
            <strong>🏰 내 RPG 사무실 출근하기</strong>
            <small>캐릭터들과 대화하고 황금 금고에서 보상을 수확하세요</small>
          </div>
          <span class="step-arrow">입장 →</span>
        </button>
        <button type="button" class="rpg-step-card step-2" data-step-go="team">
          <span class="step-num">STEP 2</span>
          <div class="step-body">
            <strong>⚔️ 45인 영웅 도감 & 덱 편성</strong>
            <small>공격딜러·방어탱커·배당힐러 영웅을 내 취향대로 조합</small>
          </div>
          <span class="step-arrow">편성 →</span>
        </button>
        <button type="button" class="rpg-step-card step-3" data-step-go="plaza">
          <span class="step-num">STEP 3</span>
          <div class="step-body">
            <strong>🐉 고금리 드래곤 레이드 출격</strong>
            <small>광장에서 보스를 토벌하고 1억 모의투자 랭킹에 도전!</small>
          </div>
          <span class="step-arrow">출격 →</span>
        </button>
      </div>
    `;

    gateway.querySelectorAll('[data-home-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        playRetroSound('levelup');
        state.activePartyId = e.currentTarget.dataset.homePreset;
        saveRpgState(state);
        const picked = RPG_PRESETS.find(p => p.id === state.activePartyId) || RPG_PRESETS[0];
        spawnFloatingEffect(`⚔️ ${picked.name} 장착!`, e.clientX, e.clientY);
        showToast(`🎉 [${picked.name}] 파티가 홈 스테이지에 소환되었습니다!`);
        setupHomeRpgGateway();
      });
    });

    gateway.querySelectorAll('.rpg-stage-hero-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = Number(card.dataset.heroIdx) || 0;
        openHeroDetailModal(allHeroes[idx]);
      });
    });

    gateway.querySelectorAll('[data-step-go]').forEach(btn => {
      btn.addEventListener('click', () => {
        goView(btn.dataset.stepGo);
      });
    });
  }

  // ── 2. 사무실 (Office / lobby-view) 영웅 집무실 라운지 & 황금 금고 타이쿤 ──
  function setupOfficeRpg() {
    const lobbyMain = document.querySelector('#lobby-view .lobby-main');
    if (!lobbyMain) return;

    const state = getRpgState();
    const activePreset = RPG_PRESETS.find(p => p.id === state.activePartyId) || RPG_PRESETS[0];
    const officeHeroes = [activePreset.leader, ...activePreset.members];

    // (A) 상단 오피스 타이쿤 & 영웅 집무실 쇼케이스 마운트
    let hud = document.getElementById('office-rpg-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'office-rpg-hud';
      hud.className = 'office-tycoon-showcase';
      const stageWrap = document.querySelector('#lobby-view .zero-office-canvas-wrap');
      if (stageWrap) {
        stageWrap.parentNode.insertBefore(hud, stageWrap);
      } else {
        lobbyMain.prepend(hud);
      }
    }

    function renderOfficeShowcase() {
      const vaultAmt = state.vaultGold || 1250;
      hud.innerHTML = `
        <div class="office-tycoon-top">
          <div class="office-tycoon-profile">
            <span class="office-crown-badge">🏰 ZERO 길드 집무실</span>
            <div>
              <strong>Lv.${state.level} ${state.title}의 투자 오피스</strong>
              <small>영웅들이 실시간으로 시장을 분석하며 복리 골드를 생산하고 있습니다</small>
            </div>
          </div>
          <div class="office-tycoon-currencies">
            <span class="currency-chip gold">🪙 ${state.gold.toLocaleString()} G</span>
            <span class="currency-chip exp">⭐ EXP ${state.exp}/${state.maxExp}</span>
            <span class="currency-chip cp">⚔️ CP ${activePreset.cp}</span>
            <button type="button" id="hud-box-btn" class="hud-gift-btn">🎁 일일 출석 보물상자</button>
          </div>
        </div>

        <!-- 황금 금고 타이쿤 & 영웅 4인 집무실 카드 -->
        <div class="office-lounge-grid">
          <div class="office-vault-card">
            <div class="vault-icon-wrap">💰</div>
            <div class="vault-info">
              <span class="vault-tag">⚡ 실시간 복리 생산 타이쿤</span>
              <strong>황금 금고: +${vaultAmt.toLocaleString()} G 누적됨</strong>
              <small>45인 자문단과 영웅 파티가 연구 보상을 모았습니다!</small>
            </div>
            <button type="button" id="office-vault-harvest" class="vault-harvest-btn">
              🪙 금고 수확하기
            </button>
          </div>

          <div class="office-mini-heroes">
            ${officeHeroes.map((h, i) => `
              <button type="button" class="office-hero-avatar-btn" data-office-hero="${i}" title="${h.name} 클릭하여 대화 및 강화">
                <div class="office-hero-svg-box">${getHeroSvg(h.role, 56)}</div>
                <div class="office-hero-txt">
                  <span class="office-hero-role">${h.roleKorean.split(' ')[0]}</span>
                  <strong>${h.name}</strong>
                  <small>Lv.${state.heroLevels?.[h.key || 'leader'] || 12} · 근무중 💬</small>
                </div>
              </button>
            `).join('')}
          </div>
        </div>
      `;

      hud.querySelector('#hud-box-btn')?.addEventListener('click', (e) => {
        const today = new Date().toDateString();
        if (state.lastAttendanceDate === today) {
          playRetroSound('click');
          showToast('🎁 오늘의 출석 보물상자는 이미 열었습니다! 황금 금고나 탐험 스팟을 눌러보세요.');
          return;
        }
        state.lastAttendanceDate = today;
        state.gold += 1500;
        state.exp += 120;
        saveRpgState(state);
        playRetroSound('levelup');
        spawnFloatingEffect('🎁 출석 대박! +1,500 G & +120 EXP!', e.clientX, e.clientY);
        showToast('🎉 일일 출석 보물상자 오픈! 1,500 Gold와 120 EXP를 획득했습니다!');
        renderOfficeShowcase();
      });

      hud.querySelector('#office-vault-harvest')?.addEventListener('click', (e) => {
        const harvest = state.vaultGold || 1250;
        state.gold += harvest;
        state.exp += 80;
        state.vaultGold = 350; // 다음 수확 기본 시드
        if (state.exp >= state.maxExp) {
          state.level += 1;
          state.exp -= state.maxExp;
        }
        saveRpgState(state);
        playRetroSound('levelup');
        spawnFloatingEffect(`💰 +${harvest.toLocaleString()} G & +80 EXP 수확!`, e.clientX, e.clientY);
        showToast(`💰 황금 금고에서 복리 보상 ${harvest.toLocaleString()} Gold와 80 EXP를 수확했습니다!`);
        renderOfficeShowcase();
      });

      hud.querySelectorAll('[data-office-hero]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.officeHero) || 0;
          openHeroDetailModal(officeHeroes[idx]);
        });
      });
    }
    renderOfficeShowcase();

    // (B) 사무실 4대 인터랙티브 미니게임 탐험 핫스팟
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

    hotspots.innerHTML = `
      <div class="hotspots-header">
        <span>🎮 사무실 4대 보물 & 미니게임 스팟</span>
        <small>아래 시설을 터치하면 즉시 8비트 효과음과 함께 버프·골드를 획득합니다!</small>
      </div>
      <div class="hotspots-grid">
        <button type="button" class="hotspot-card" id="spot-coffee">
          <span class="spot-icon">☕</span>
          <div class="spot-info">
            <strong>탕비실 황금 에스프레소</strong>
            <small>영웅 전원 사기 충전 · +200 G</small>
          </div>
        </button>
        <button type="button" class="hotspot-card" id="spot-bull">
          <span class="spot-icon">🐂</span>
          <div class="spot-info">
            <strong>월스트리트 황금 황소상</strong>
            <small>뿔 쓰다듬기 · 오늘 운세 대길</small>
          </div>
        </button>
        <button type="button" class="hotspot-card" id="spot-library">
          <span class="spot-icon">📚</span>
          <div class="spot-info">
            <strong>소프 & 버핏 비밀 서고</strong>
            <small>전설의 비급 열람 · +100 EXP</small>
          </div>
        </button>
        <button type="button" class="hotspot-card" id="spot-roulette">
          <span class="spot-icon">🎰</span>
          <div class="spot-info">
            <strong>무료 럭키 잭팟 룰렛</strong>
            <small>최대 +1,000 G 행운 뽑기</small>
          </div>
        </button>
      </div>
    `;

    hotspots.querySelector('#spot-coffee')?.addEventListener('click', (e) => {
      state.gold += 200;
      state.exp += 40;
      saveRpgState(state);
      playRetroSound('coin');
      spawnFloatingEffect('☕ 에스프레소 파워! +200 G & +40 EXP!', e.clientX, e.clientY);
      showToast('☕ 탕비실 에스프레소 추출 완료! 영웅들의 분석 속도가 2배 빨라집니다! (+200 G)');
      renderOfficeShowcase();
    });

    hotspots.querySelector('#spot-bull')?.addEventListener('click', (e) => {
      state.gold += 300;
      saveRpgState(state);
      playRetroSound('coin');
      spawnFloatingEffect('🐂 황소의 축복! +300 Gold!', e.clientX, e.clientY);
      showToast('🐂 월가 황금 황소상의 뿔을 쓰다듬었습니다! [오늘의 투자 운세: 대길(大吉)] +300 G 획득!');
      renderOfficeShowcase();
    });

    hotspots.querySelector('#spot-library')?.addEventListener('click', (e) => {
      state.exp += 100;
      if (state.exp >= state.maxExp) {
        state.level += 1;
        state.exp -= state.maxExp;
        playRetroSound('levelup');
        showToast(`🎊 레벨 업! 오피스 사령부 Lv.${state.level} 달성!`);
      } else {
        playRetroSound('coin');
        showToast('📚 에드워드 소프의 『복리 마법 비급서』를 읽었습니다! (+100 EXP 획득)');
      }
      saveRpgState(state);
      spawnFloatingEffect('📚 지혜 상승! +100 EXP!', e.clientX, e.clientY);
      renderOfficeShowcase();
    });

    hotspots.querySelector('#spot-roulette')?.addEventListener('click', (e) => {
      const prizes = [
        { msg: '🎰 잭팟 당첨! 황금 배당 보너스 +1,000 G!', gold: 1000, exp: 100 },
        { msg: '🎰 럭키 스타! 켈리 마법 수정 +600 G & +120 EXP!', gold: 600, exp: 120 },
        { msg: '🎰 슈퍼 세이브! 버핏의 방패 축복 +800 G!', gold: 800, exp: 90 }
      ];
      const pick = prizes[Math.floor(Math.random() * prizes.length)];
      state.gold += pick.gold;
      state.exp += pick.exp;
      saveRpgState(state);
      playRetroSound('levelup');
      spawnFloatingEffect(pick.msg, e.clientX, e.clientY);
      showToast(pick.msg);
      renderOfficeShowcase();
    });

    // (C) 사이드바 일일 퀘스트 보드
    const lobbySide = document.querySelector('#lobby-view .lobby-side');
    if (lobbySide && !document.getElementById('office-rpg-deck')) {
      const deck = document.createElement('section');
      deck.id = 'office-rpg-deck';
      deck.className = 'office-rpg-card';
      deck.setAttribute('aria-label', '사무실 일일 퀘스트 보드');

      function renderSideQuests() {
        deck.innerHTML = `
          <div class="office-rpg-head">
            <div class="office-rpg-title-box">
              <span class="office-rpg-badge">📜 길드 의뢰소</span>
              <strong class="office-rpg-name">오늘의 초보자 3대 일일 퀘스트</strong>
            </div>
            <span class="office-rpg-cp">즉시 완료 가능</span>
          </div>
          <div class="office-quest-list">
            <div class="office-quest-item ${state.completedQuests['q1'] ? 'done' : ''}">
              <div class="office-quest-info">
                <strong>[퀘스트 1] 영웅 4인의 아침 시장 브리핑 듣기</strong>
                <small>보상: +100 EXP · +500 Gold</small>
              </div>
              <button type="button" class="office-quest-btn" data-qid="q1" ${state.completedQuests['q1'] ? 'disabled' : ''}>
                ${state.completedQuests['q1'] ? '수령 완료 ✓' : '보상 받기'}
              </button>
            </div>
            <div class="office-quest-item ${state.completedQuests['q2'] ? 'done' : ''}">
              <div class="office-quest-info">
                <strong>[퀘스트 2] 소프 켈리 방어선(단기국채 29.4%) 확인</strong>
                <small>보상: +150 EXP · +1,000 Gold</small>
              </div>
              <button type="button" class="office-quest-btn" data-qid="q2" ${state.completedQuests['q2'] ? 'disabled' : ''}>
                ${state.completedQuests['q2'] ? '수령 완료 ✓' : '보상 받기'}
              </button>
            </div>
            <div class="office-quest-item ${state.completedQuests['q3'] ? 'done' : ''}">
              <div class="office-quest-info">
                <strong>[퀘스트 3] 워런 버핏의 원금 보존 원칙 서약</strong>
                <small>보상: +200 EXP · 파티 방어력 +15% 버프</small>
              </div>
              <button type="button" class="office-quest-btn" data-qid="q3" ${state.completedQuests['q3'] ? 'disabled' : ''}>
                ${state.completedQuests['q3'] ? '수령 완료 ✓' : '보상 받기'}
              </button>
            </div>
          </div>
        `;

        deck.querySelectorAll('.office-quest-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const qid = e.currentTarget.dataset.qid;
            if (state.completedQuests[qid]) return;
            state.completedQuests[qid] = true;
            state.exp += 150;
            state.gold += 800;
            if (state.exp >= state.maxExp) {
              state.level += 1;
              state.exp -= state.maxExp;
            }
            saveRpgState(state);
            playRetroSound('levelup');
            spawnFloatingEffect('📜 퀘스트 완료! +150 EXP & +800 G!', e.clientX, e.clientY);
            showToast('🎉 일일 퀘스트 달성! 경험치와 골드 보상이 지급되었습니다!');
            renderSideQuests();
            renderOfficeShowcase();
          });
        });
      }
      renderSideQuests();
      lobbySide.prepend(deck);
    }

    enhanceLobbyChatRpg();
  }

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
          <span class="affinity-label">영웅 친밀도 Lv.4 (85/100)</span>
          <div class="affinity-track"><div class="affinity-fill" style="width: 85%"></div></div>
        </div>
      `;
      chatHead.appendChild(affinityWrap);
    }

    const chatForm = chatDialog.querySelector('.chat-form');
    if (chatForm) {
      const quickBar = document.createElement('div');
      quickBar.className = 'chat-rpg-actions';
      quickBar.innerHTML = `
        <button type="button" class="chat-rpg-btn" id="chat-gift-coffee">☕ 커피 선물 (+15 친밀도)</button>
        <button type="button" class="chat-rpg-btn" id="chat-stamp-praise">⭐ 칭찬 스탬프 (+80 EXP)</button>
        <button type="button" class="chat-rpg-btn" id="chat-staff-quest">⚡ 영웅 버프 발동</button>
      `;
      chatForm.parentNode.insertBefore(quickBar, chatForm);

      quickBar.querySelector('#chat-gift-coffee')?.addEventListener('click', (e) => {
        playRetroSound('coin');
        spawnFloatingEffect('💖 친밀도 UP! 시너지 +5%!', e.clientX, e.clientY);
        showToast('☕ 영웅에게 커피를 선물했습니다! "대표님 감사합니다! 최고의 분석으로 보답할게요!"');
      });

      quickBar.querySelector('#chat-stamp-praise')?.addEventListener('click', (e) => {
        const state = getRpgState();
        state.exp += 80;
        saveRpgState(state);
        playRetroSound('coin');
        spawnFloatingEffect('⭐ +80 EXP 획득!', e.clientX, e.clientY);
        showToast('⭐ 칭찬 스탬프를 찍어주었습니다! 팀 사기가 최고조에 달합니다!');
      });

      quickBar.querySelector('#chat-staff-quest')?.addEventListener('click', (e) => {
        playRetroSound('levelup');
        spawnFloatingEffect('⚡ 고유 패시브 버프 발동!', e.clientX, e.clientY);
        showToast('⚡ 영웅 고유 스킬 [리스크 반감 & 복리 가속] 버프가 계좌에 활성화되었습니다!');
      });
    }
  }

  // ── 3. 실시간 광장 (Plaza / plaza-view) 드래곤 월드 보스 레이드 ──
  function setupPlazaRpg() {
    const plazaView = document.getElementById('plaza-view');
    if (!plazaView || document.getElementById('plaza-rpg-deck')) return;

    const state = getRpgState();
    const deck = document.createElement('div');
    deck.id = 'plaza-rpg-deck';
    deck.className = 'plaza-rpg-container';

    function renderPlazaBoss() {
      const hpPct = Math.max(0, Math.min(100, (state.bossHp / state.bossMaxHp) * 100)).toFixed(1);
      deck.innerHTML = `
        <div class="plaza-boss-box">
          <div class="plaza-boss-visual-row">
            <div class="plaza-boss-svg-wrap">
              ${getHeroSvg('BOSS', 104)}
              <span class="boss-lv-tag">월드 보스 Lv.99</span>
            </div>
            <div class="plaza-boss-main-info">
              <div class="plaza-boss-header">
                <div>
                  <span class="plaza-boss-tag">🔥 실시간 광장 협동 레이드</span>
                  <h3 class="plaza-boss-name">${CURRENT_BOSS.name}</h3>
                  <p class="plaza-boss-title">${CURRENT_BOSS.title}</p>
                </div>
                <button type="button" id="plaza-raid-btn" class="plaza-raid-action-btn">
                  ⚔️ 내 영웅 파티로 보스 타격하기!
                </button>
              </div>
              <div class="plaza-hp-container">
                <div class="plaza-hp-labels">
                  <span>🐉 드래곤 잔여 체력 (HP)</span>
                  <strong id="plaza-boss-hp-text">${state.bossHp.toLocaleString()} / ${state.bossMaxHp.toLocaleString()} (${hpPct}%)</strong>
                </div>
                <div class="plaza-hp-track"><div class="plaza-hp-fill" style="width: ${hpPct}%"></div></div>
              </div>
              <p class="plaza-boss-desc">${CURRENT_BOSS.desc}</p>
            </div>
          </div>
        </div>

        <div class="plaza-hub-grid">
          <div class="plaza-fountain-card">
            <h4>⛲ 광장 황금 분수대</h4>
            <p>분수대에 행운의 동전을 던지면 즉시 +500 Gold와 복리 축복 버프를 받습니다.</p>
            <button type="button" id="plaza-fountain-btn" class="plaza-fountain-btn">🪙 행운의 동전 던지기 (+500 G)</button>
          </div>
          <div class="plaza-hall-card">
            <h4>🏆 실시간 레이드 공략 1위 파티</h4>
            <ol class="plaza-hall-list">
              <li>🥇 <strong>⚖️ 소프 황금 밸런스 파티</strong> (방어율 100% · CP 148,500)</li>
              <li>🥈 <strong>🛡️ 워런 버핏 철벽 수비 파티</strong> (배당 치유 · CP 136,200)</li>
              <li>🥉 <strong>🚀 피터 린치 테크 드래곤 파티</strong> (초고속 화력 · CP 154,900)</li>
            </ol>
          </div>
        </div>
      `;

      deck.querySelector('#plaza-raid-btn')?.addEventListener('click', () => {
        openPlazaRaidModal(renderPlazaBoss);
      });

      deck.querySelector('#plaza-fountain-btn')?.addEventListener('click', (e) => {
        state.gold += 500;
        state.exp += 80;
        saveRpgState(state);
        playRetroSound('levelup');
        spawnFloatingEffect('⛲ 분수의 축복! +500 G & +80 EXP!', e.clientX, e.clientY);
        showToast('⛲ 황금 분수대가 빛나며 +500 Gold와 +80 EXP를 선물했습니다!');
      });
    }

    renderPlazaBoss();
    plazaView.prepend(deck);
  }

  function openPlazaRaidModal(onUpdate) {
    const state = getRpgState();
    const activePreset = RPG_PRESETS.find(p => p.id === state.activePartyId) || RPG_PRESETS[0];
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
          <p>출전 파티: <strong>${activePreset.name}</strong> (CP ${activePreset.cp})</p>
        </div>
        <button type="button" class="icon-button icon-close" id="raid-close">닫기</button>
      </div>
      <div class="raid-battle-ground">
        <div class="raid-vs-arena">
          <div class="raid-heroes-side">
            ${getHeroSvg('LEADER', 64)}
            ${getHeroSvg('DEALER', 64)}
            ${getHeroSvg('TANKER', 64)}
            ${getHeroSvg('HEALER', 64)}
          </div>
          <div class="raid-vs-badge">⚡ VS ⚡</div>
          <div class="raid-boss-side" id="raid-boss-sprite">
            ${getHeroSvg('BOSS', 96)}
          </div>
        </div>
        <div class="raid-combat-log" id="raid-combat-log">
          <p>📢 <strong>${CURRENT_BOSS.name}</strong>이(가) 고금리 화염 브레스(4.75%)를 발사합니다!</p>
          <p>🛡️ <strong>단기국채 가디언</strong>이 황금 방패를 들어 화염 데미지를 0으로 무효화했습니다!</p>
        </div>
        <div class="raid-action-buttons">
          <button type="button" class="raid-btn attack" data-act="attack">⚔️ S&P 500 엑스칼리버 베기 (-800 HP)</button>
          <button type="button" class="raid-btn skill" data-act="skill">⚡ 에드워드 소프 필살기: 켈리 황금번개 (-1,500 HP)</button>
          <button type="button" class="raid-btn shield" data-act="shield">💖 배당 성배 전체 치유 & +500 Gold 획득</button>
        </div>
      </div>
    `;

    dialog.querySelector('#raid-close')?.addEventListener('click', () => dialog.close());
    const log = dialog.querySelector('#raid-combat-log');
    const bossSprite = dialog.querySelector('#raid-boss-sprite');

    dialog.querySelectorAll('.raid-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const act = e.currentTarget.dataset.act;
        if (bossSprite) {
          bossSprite.classList.remove('boss-hit-shake');
          void bossSprite.offsetWidth;
          bossSprite.classList.add('boss-hit-shake');
        }
        if (act === 'attack') {
          playRetroSound('coin');
          state.bossHp = Math.max(0, state.bossHp - 800);
          state.gold += 200;
          spawnFloatingEffect('💥 -800 HP! (+200 G)', e.clientX, e.clientY);
          log.innerHTML += `<p class="log-hit">⚔️ <strong>S&P 500 성기사</strong>의 강타! 드래곤에게 800 데미지! (잔여 HP: ${state.bossHp.toLocaleString()})</p>`;
        } else if (act === 'skill') {
          playRetroSound('levelup');
          state.bossHp = Math.max(0, state.bossHp - 1500);
          state.gold += 500;
          state.exp += 100;
          spawnFloatingEffect('⚡ 치명타 -1,500 HP! (+500 G)', e.clientX, e.clientY);
          log.innerHTML += `<p class="log-crit">⚡ <strong>에드워드 소프</strong>의 [켈리 황금번개] 작렬!! 1,500 치명타 데미지! (잔여 HP: ${state.bossHp.toLocaleString()})</p>`;
        } else {
          playRetroSound('coin');
          state.gold += 500;
          spawnFloatingEffect('💖 파티 치유 & +500 G!', e.clientX, e.clientY);
          log.innerHTML += `<p class="log-guard">💖 <strong>달러 대사제</strong>의 배당 축복! 파티 체력 100% 회복 & +500 Gold 획득!</p>`;
        }
        if (state.bossHp === 0) {
          state.bossHp = 10000;
          state.gold += 3000;
          log.innerHTML += `<p class="log-crit">🎊 <strong>드래곤 토벌 성공!!</strong> 보너스 보상 +3,000 Gold를 획득했습니다!!</p>`;
        }
        saveRpgState(state);
        if (onUpdate) onUpdate();
        log.scrollTop = log.scrollHeight;
      });
    });

    dialog.showModal();
  }

  // ── 4. ZERO 팀 (Team / team-view) 1-Click RPG 영웅 도감 & 45인 캐릭터 카드 시각화 ──
  function setupTeamRpg() {
    const teamView = document.getElementById('team-view');
    if (!teamView) return;

    const state = getRpgState();
    let builder = document.getElementById('team-rpg-builder');
    if (!builder) {
      builder = document.createElement('section');
      builder.id = 'team-rpg-builder';
      builder.className = 'team-rpg-container';
      teamView.prepend(builder);
    }

    let selectedPresetId = state.activePartyId || 'thorp_balance';
    let currentFilterRole = 'ALL';

    function renderBuilder() {
      const preset = RPG_PRESETS.find(p => p.id === selectedPresetId) || RPG_PRESETS[0];
      const allCards = [preset.leader, ...preset.members];

      builder.innerHTML = `
        <div class="team-rpg-header">
          <div>
            <span class="team-rpg-tag">⚔️ ZERO 영웅 도감 & 1-Click 파티 편성소</span>
            <h3 class="team-rpg-title">주식을 몰라도 1초 만에 완성하는 전설의 4인 영웅 파티</h3>
            <p class="team-rpg-desc">원하는 파티 탭을 누르고 [⚡ 이 파티로 출격하기]만 누르면 끝! 영웅 카드를 눌러 장비를 강화해 보세요.</p>
          </div>
          <div class="team-rpg-tabs">
            ${RPG_PRESETS.map(p => `
              <button type="button" class="team-rpg-tab ${p.id === selectedPresetId ? 'active' : ''}" data-pid="${p.id}">
                ${p.name}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="team-rpg-banner">
          <div class="team-banner-left">
            <span class="rpg-ssr-pill">${preset.badge}</span>
            <h4>${preset.name}</h4>
            <p class="team-banner-concept">${preset.concept}</p>
            <span class="team-target-badge">${preset.target}</span>
          </div>
          <div class="team-banner-right">
            <span class="team-cp-badge">파티 전투력 ${preset.cp} CP</span>
            <button type="button" class="team-equip-btn" id="team-equip-action">
              ⚡ 이 파티로 즉시 편성하기
            </button>
          </div>
        </div>

        <div class="th-rpg-cards-grid">
          ${allCards.map((m, idx) => {
            const lv = state.heroLevels?.[m.key || 'leader'] || (12 + idx);
            return `
              <div class="th-rpg-card ${idx === 0 ? 'leader-card' : 'member-card'}" data-team-hero="${idx}">
                <div class="th-rpg-card-top">
                  <span class="th-rpg-role-badge">${m.roleKorean}</span>
                  <span class="th-rpg-cp-pill">Lv.${lv} · ${m.weight || '파티장'}</span>
                </div>
                <div class="th-rpg-avatar-center">
                  ${getHeroSvg(m.role, 92)}
                  <span class="th-rpg-rarity-stars">${m.rarity || 'SSR ★★★★★'}</span>
                </div>
                <strong class="th-rpg-card-name">${m.name}</strong>
                <small class="th-rpg-card-title">${m.title}</small>
                <div class="th-rpg-stat-bars">
                  <div class="th-rpg-stat-row"><small>⚔️ 공격</small><div class="th-rpg-stat-bg"><div class="th-rpg-stat-bar atk" style="width: ${m.atk}%"></div></div></div>
                  <div class="th-rpg-stat-row"><small>🛡️ 방어</small><div class="th-rpg-stat-bg"><div class="th-rpg-stat-bar def" style="width: ${m.def}%"></div></div></div>
                  <div class="th-rpg-stat-row"><small>💖 회복</small><div class="th-rpg-stat-bg"><div class="th-rpg-stat-bar rec" style="width: ${m.rec}%"></div></div></div>
                </div>
                <div class="th-rpg-skill-box">
                  <span class="th-rpg-skill-name">⚡ 고유 마법: ${m.skill}</span>
                  <p class="th-rpg-skill-desc">${m.desc}</p>
                </div>
                <button type="button" class="th-rpg-card-upgrade-btn">🔍 장비 보기 & 영웅 강화</button>
              </div>
            `;
          }).join('')}
        </div>

        <div class="team-rpg-filter-bar">
          <span class="team-rpg-filter-lbl">📖 45인 길드원 도감 클래스 필터:</span>
          <button type="button" class="team-rpg-fbtn ${currentFilterRole === 'ALL' ? 'active' : ''}" data-role="ALL">전체 길드원 (45인)</button>
          <button type="button" class="team-rpg-fbtn ${currentFilterRole === 'LEADER' ? 'active' : ''}" data-role="LEADER">👑 대마법사·팀장</button>
          <button type="button" class="team-rpg-fbtn ${currentFilterRole === 'DEALER' ? 'active' : ''}" data-role="DEALER">⚔️ 공격 딜러</button>
          <button type="button" class="team-rpg-fbtn ${currentFilterRole === 'TANKER' ? 'active' : ''}" data-role="TANKER">🛡️ 방어 탱커</button>
          <button type="button" class="team-rpg-fbtn ${currentFilterRole === 'HEALER' ? 'active' : ''}" data-role="HEALER">💖 배당·치유 힐러</button>
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
        state.activePartyId = selectedPresetId;
        saveRpgState(state);
        playRetroSound('levelup');
        spawnFloatingEffect(`⚔️ ${preset.name} 출전 완료!`, e.clientX, e.clientY);
        showToast(`🎉 [${preset.name}] 파티가 대표님의 메인 덱으로 장착되었습니다!`);
        setupHomeRpgGateway();
      });

      builder.querySelectorAll('[data-team-hero]').forEach(card => {
        card.addEventListener('click', () => {
          const idx = Number(card.dataset.teamHero) || 0;
          openHeroDetailModal(allCards[idx]);
        });
      });

      builder.querySelectorAll('.team-rpg-fbtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          playRetroSound('click');
          currentFilterRole = e.currentTarget.dataset.role;
          builder.querySelectorAll('.team-rpg-fbtn').forEach(b => b.classList.toggle('active', b.dataset.role === currentFilterRole));
          decorateAndFilterTeamCards(currentFilterRole);
        });
      });
    }

    renderBuilder();
    decorateAndFilterTeamCards(currentFilterRole);
  }

  // 45인 직원 카드(`#team-grid .team-card`)에 귀여운 RPG 클래스 아바타와 등급 별표를 자동 주입
  function decorateAndFilterTeamCards(roleFilter = 'ALL') {
    const cards = document.querySelectorAll('#team-grid .team-card');
    cards.forEach((card, index) => {
      const text = card.textContent || '';
      let role = 'DEALER';
      let badgeLabel = '⚔️ 공격 딜러 · 성장 분석';
      if (text.includes('책임자') || text.includes('총괄') || text.includes('팀장') || index === 0) {
        role = 'LEADER';
        badgeLabel = '👑 파티 리더 · 대마법사';
      } else if (text.includes('리스크') || text.includes('거시') || text.includes('검증') || text.includes('방어') || text.includes('법무') || text.includes('감사')) {
        role = 'TANKER';
        badgeLabel = '🛡️ 철벽 탱커 · 리스크 수호';
      } else if (text.includes('배당') || text.includes('가치') || text.includes('안정') || text.includes('운용') || text.includes('고객')) {
        role = 'HEALER';
        badgeLabel = '💖 치유 힐러 · 배당·안정';
      }

      if (!card.querySelector('.team-card-rpg-header')) {
        const header = document.createElement('div');
        header.className = `team-card-rpg-header role-${role.toLowerCase()}`;
        header.innerHTML = `
          <div class="team-card-mini-svg">${getHeroSvg(role, 48)}</div>
          <div class="team-card-rpg-meta">
            <span class="team-card-class-pill">${badgeLabel}</span>
            <span class="team-card-stars">SSR ★★★★★ · Lv.${10 + (index % 9)}</span>
          </div>
        `;
        card.prepend(header);
      }

      if (roleFilter === 'ALL') {
        card.style.display = '';
      } else {
        card.style.display = (role === roleFilter) ? '' : 'none';
      }
    });
  }

  function checkAndInitViews() {
    setupGlobalEasyBar();
    setupHomeRpgGateway();
    setupOfficeRpg();
    setupPlazaRpg();
    setupTeamRpg();
    decorateAndFilterTeamCards('ALL');
  }

  document.addEventListener('DOMContentLoaded', checkAndInitViews);
  document.addEventListener('zero-view-changed', checkAndInitViews);
  setTimeout(checkAndInitViews, 350);
  setTimeout(checkAndInitViews, 1100);
  setTimeout(checkAndInitViews, 2500);
})();
