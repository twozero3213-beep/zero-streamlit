/* 시작: 아이콘 채우기, 화면 색 단추, 창 닫기, 주소 이동 시작. */
(() => {
  'use strict';
  const U = window.ZeroUI;

  document.querySelectorAll('[data-icon]').forEach((holder) => holder.replaceChildren(U.icon(holder.dataset.icon)));
  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.replaceChildren(U.icon('close'));
    button.addEventListener('click', () => button.closest('dialog').close());
  });
  // 창의 여백과 실제 바깥 영역을 구분한다.
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  }));
  document.querySelector('.skip-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    document.getElementById('main').focus({preventScroll: false});
  });

  const toggle = document.getElementById('theme-toggle');
  const paintToggle = () => {
    const dark = U.theme.resolved() === 'dark';
    toggle.replaceChildren(U.icon(dark ? 'sun' : 'moon'));
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.title = dark ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기';
    const state = document.getElementById('theme-state');
    if (state) state.textContent = dark ? '현재 어두운 화면이에요.' : '현재 밝은 화면이에요.';
  };
  toggle.addEventListener('click', () => U.theme.set(U.theme.resolved() === 'dark' ? 'light' : 'dark'));
  document.addEventListener('zero-theme-changed', paintToggle);
  U.theme.apply();

  U.start();
})();
