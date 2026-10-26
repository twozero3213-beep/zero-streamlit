'use strict';
/**
 * ZERO UX & Navigation Stabilizer (게임 요소 전면 제거 버전)
 * - 모든 부가 게임/RPG/타이쿤 UI 요소를 제거하고 순수 ZERO 화면 및 토스·카카오증권 기능만 유지합니다.
 * - 더보기(#more-menu) 카드 클릭 시 화면 전환 및 모달 닫힘을 보장합니다.
 * - ZERO 팀(#team-view) 진입 시 45인 사무실 맵(#office-panel)이 숨겨지지 않도록 보장합니다.
 */
(function initZeroCleanUX() {
  if (typeof document === 'undefined') return;

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

  function updateCleanMenuSubtitles() {
    const teamSmall = document.querySelector('#more-menu [data-view="team"] small');
    if (teamSmall) teamSmall.textContent = '45인 전문가 사무실 & 업무 요청';
    const plazaSmall = document.querySelector('#more-menu [data-view="plaza"] small');
    if (plazaSmall) plazaSmall.textContent = '실시간 투자자 라운지 & 대화';
    const commSmall = document.querySelector('#more-menu [data-view="community"] small');
    if (commSmall) commSmall.textContent = '투자자 종목 토론 & 의견';
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
    updateCleanMenuSubtitles();
    ensureTeamOfficeVisible();
    setupMoreMenuNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
