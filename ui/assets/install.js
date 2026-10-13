// Hosted install guide: the original text assumes a login and an iPhone only. On this public site there is
// no login, the app can also be installed from Android Chrome, and the install must start from this page's
// own address (not the Streamlit shell around it). Text is rewritten in place; nothing else changes.
(() => {
  const panel = document.querySelector('.install-guide');
  if (!panel) return;
  const address = location.origin + location.pathname; // no query or hash, so the saved icon opens the app itself
  const framed = window.top !== window;
  const el = (tag, text) => Object.assign(document.createElement(tag), {textContent: text});

  panel.querySelector('#install-title').textContent = '모바일 앱으로 설치하기';
  panel.querySelector('.muted-note').textContent = '지웠거나 새 폰이어도 아래 방법으로 언제든 다시 설치할 수 있습니다.';
  const steps = panel.querySelector('ol');
  steps.replaceChildren(...[
    '아이폰은 Safari, 안드로이드는 Chrome에서 아래 주소를 엽니다. 로그인은 필요 없습니다.',
    '아이폰: 공유 버튼 → 홈 화면에 추가 → 웹 앱으로 열기를 켜고 추가. 안드로이드: ⋮ 메뉴 → 앱 설치(또는 홈 화면에 추가).',
    '홈 화면에 생긴 ZERO 아이콘을 누르면 앱 창으로 열립니다. 지운 앱은 같은 방법으로 다시 설치하면 됩니다.',
  ].map((text) => el('li', text)));

  const box = el('div', '');
  box.style.cssText = 'margin:12px 0;padding:10px 12px;border:1px solid #d9dee5;border-radius:10px;background:#fff;word-break:break-all';
  const link = Object.assign(el('a', address), {href: address, target: '_top'});
  box.append(el('strong', '설치 주소 '), link);
  if (framed) box.append(el('p', '이 화면은 다른 페이지 안에 열려 있습니다. 위 주소를 눌러 직접 연 뒤 설치하세요.'));
  steps.after(box);

  // Android/desktop Chrome can install with one tap when the browser offers it.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    const button = el('button', '앱 설치');
    button.type = 'button';
    button.style.cssText = 'margin:4px 0 12px;padding:10px 18px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-weight:600';
    button.addEventListener('click', async () => { event.prompt(); await event.userChoice; button.remove(); });
    box.after(button);
  });

  // The original closing note ("로그인을 다시 요청할 수 있습니다...") is the last paragraph of the panel.
  const notes = panel.querySelectorAll('p.muted-note');
  if (notes.length > 1) notes[notes.length - 1].textContent = '자료를 조회하려면 인터넷 연결이 필요합니다. 계좌 새로고침과 업무 요청은 소유자 PC에서만 됩니다.';
})();
