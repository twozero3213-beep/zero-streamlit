/* 첫 화면이 그려지기 전에 화면 색을 정한다(깜빡임 방지). 기본은 밝은 화면이고, 저장된 선택이나 기기 설정이 어두우면 어둡게. */
(function () {
  var theme = 'light';
  try {
    var saved = JSON.parse(window.localStorage.getItem('zero-theme') || '"auto"');
    if (saved === 'dark' || saved === 'light') theme = saved;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
  } catch (_) { /* 저장이 막혀 있거나 예전 형식이면 밝은 화면 */ }
  document.documentElement.dataset.theme = theme;
  // 다른 화면 안에 끼워져 열리면(Streamlit 공개 앱) 바깥 배지를 피하도록 표시해 둔다.
  if (window.top !== window.self) document.documentElement.classList.add('framed');
})();
