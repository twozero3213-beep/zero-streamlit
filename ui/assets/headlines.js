// Live headlines panel for the "주요 뉴스" screen. Hosted-only extra: it needs this app's /api/headlines route.
// If the route is missing or fails, the panel stays hidden and the screen is exactly the original one.
(() => {
  const view = document.getElementById('news-view'), anchor = document.getElementById('news-list');
  if (!view || !anchor) return;
  const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const panel = make('section', 'panel desk-panel'), title = make('h2', '', '실시간 헤드라인'), note = make('p', 'muted-note'), list = make('ol', 'live-headlines');
  list.id = 'live-headlines-list';
  panel.hidden = true; panel.setAttribute('aria-labelledby', 'live-headlines-title'); title.id = 'live-headlines-title';
  list.style.cssText = 'margin:12px 0 0;padding-left:20px;display:grid;gap:10px;line-height:1.5';
  panel.append(title, note, list);
  const section = anchor.closest('.viewport-section-group');
  (section?.parentElement?.classList.contains('viewport-pages-body') ? section : anchor).before(panel);
  const language = (text) => {
    if (typeof text !== 'string' || !text.trim() || /[<>\uFFFD]/u.test(text)) return null;
    if ([...text].some((char) => /[\p{M}\p{C}]/u.test(char) || (/\p{L}/u.test(char) && !/[A-Za-z가-힣]/u.test(char)))) return null;
    return /[가-힣]/u.test(text) ? 'ko' : /[A-Za-z]/u.test(text) ? 'en' : null;
  };
  const kst = (iso) => new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(iso));
  let loading = false, shown = false, lastChecked = '';
  const unavailable = () => { panel.hidden = false; note.textContent = '새 뉴스 확인에 실패했습니다. 자료 다시 불러오기로 재시도할 수 있습니다.' + (lastChecked ? ' 마지막 성공 확인 ' + lastChecked + ' KST · 이전 목록을 표시합니다.' : ' 아직 확인된 제목이 없습니다.'); };
  async function load() {
    if (loading || document.hidden || document.documentElement?.dataset.zeroView !== 'news') return; loading = true;
    try {
      const response = await fetch('api/headlines', {cache: 'no-store', signal: AbortSignal.timeout(30000)}), data = response.ok ? await response.json() : null;
      if (data?.schema_version !== 1 || !Array.isArray(data.items) || !data.items.length) { unavailable(); return; }
      const items = data.items.filter((item) => item && /^https:\/\//.test(item.url)
        && (language(item.title) === 'ko' || (language(item.title) === 'en'
          && item.translation_status === 'TRANSLATED' && language(item.title_ko) === 'ko')));
      if (!items.length) { unavailable(); return; }
      list.replaceChildren(...items.map((item) => {
        const translated = language(item.title) === 'en' ? ' (' + item.title_ko.trim() + ')' : '';
        const row = make('li'), link = make('a', '', item.title + translated);
        link.href = item.url; link.target = '_blank'; link.rel = 'noreferrer noopener';
        row.append(link, make('span', 'muted-note', ' · ' + (item.publisher || '출처 미표시') + ' · ' + item.market + ' · ' + kst(item.published_at)));
        return row;
      }));
      note.textContent = '뉴스 검색 결과의 제목만 자동으로 모은 목록입니다(최근 36시간 · ' + kst(data.checked_at) + ' KST 확인). 본문을 읽거나 사실을 검증한 것이 아니며, 아래 기사 요약과는 별개입니다. 한국어·영어 제목만 표시하며, 영어 제목의 괄호 안 한글은 기계 번역입니다. 번역이 없는 영어와 다른 언어의 제목은 제외합니다.'
        + (data.failed?.length ? ' 수집하지 못한 곳: ' + data.failed.join(', ') + '.' : '');
      lastChecked = kst(data.checked_at); panel.hidden = false;
      if (!shown) { shown = true; queueMicrotask(() => { const select = view.querySelector('.viewport-controls select'); if (select) { select.value = '0'; select.dispatchEvent(new Event('change', {bubbles:true})); } }); }
    } catch (_) { unavailable(); } finally { loading = false; }
  }
  document.addEventListener('zero-view-changed', load);
  load(); setInterval(load, 60000);
  document.addEventListener('visibilitychange', load);
  document.querySelectorAll('[data-desk-reload]').forEach((button) => button.addEventListener('click', load));
})();
