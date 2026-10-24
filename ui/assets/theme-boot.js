/* 첫 화면이 그려지기 전에 테마를 정한다(깜빡임 방지). 기본은 다크이고, 시스템 다크모드 및 사용자 설정을 감지한다. */
(function () {
  var theme = 'dark';
  try {
    var saved = window.localStorage.getItem('zero-theme');
    if (saved === 'light') {
      theme = 'light';
    } else if (saved === 'dark') {
      theme = 'dark';
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
  } catch (_) { /* storage can be blocked; default stays dark */ }
  document.documentElement.dataset.zeroTheme = theme;
  document.documentElement.dataset.theme = theme;
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0f1115');
})();
