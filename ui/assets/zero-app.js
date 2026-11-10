/* 시작: 아이콘 채우기, 화면 색 단추, 창 닫기, 주소 이동 시작. */
(() => {
  'use strict';
  const U = window.ZeroUI;

  document.querySelectorAll('[data-icon]').forEach((holder) => holder.replaceChildren(U.icon(holder.dataset.icon)));
  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.replaceChildren(U.icon('close'));
    button.addEventListener('click', () => button.closest('dialog').close());
  });
  // 창 바깥(어두운 부분)을 누르면 닫는다.
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));

  const toggle = document.getElementById('theme-toggle');
  const paintToggle = () => toggle.replaceChildren(U.icon(U.theme.resolved() === 'dark' ? 'sun' : 'moon'));
  toggle.addEventListener('click', () => U.theme.set(U.theme.resolved() === 'dark' ? 'light' : 'dark'));
  document.addEventListener('zero-theme-changed', paintToggle);
  U.theme.apply();

  U.start();
})();
