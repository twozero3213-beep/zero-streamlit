/* 첫 화면이 그려지기 전에 테마를 정한다(깜빡임 방지). 기본은 다크이고, 사용자가 고른 값은 이 기기의 localStorage에만 저장한다. */
(function () {
  var theme = 'dark';
  try { if (window.localStorage.getItem('zero-theme') === 'light') theme = 'light'; } catch (_) { /* storage can be blocked; the default stays */ }
  document.documentElement.dataset.zeroTheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0f1115');
})();
