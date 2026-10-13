// Live headlines panel for the "주요 뉴스" screen. Hosted-only extra: it needs this app's /api/headlines route.
// If the route is missing or fails, the panel stays hidden and the screen is exactly the original one.
(() => {
  const view = document.getElementById('news-view'), anchor = document.getElementById('news-list');
  if (!view || !anchor) return;
  const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const panel = make('section', 'panel desk-panel'), title = make('h2', '', '실시간 헤드라인'), note = make('p', 'muted-note'), list = make('ol', 'live-headlines');
  panel.hidden = true; panel.setAttribute('aria-labelledby', 'live-headlines-title'); title.id = 'live-headlines-title';
  list.style.cssText = 'margin:12px 0 0;padding-left:20px;display:grid;gap:10px;line-height:1.5';
  panel.append(title, note, list); anchor.before(panel);
  const kst = (iso) => new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(iso));
  async function load() {
    try {
      const response = await fetch('api/headlines', {cache: 'no-store'}), data = response.ok ? await response.json() : null;
      if (data?.schema_version !== 1 || !Array.isArray(data.items) || !data.items.length) { panel.hidden = true; return; }
      list.replaceChildren(...data.items.filter((item) => /^https:\/\//.test(item.url)).map((item) => {
        const row = make('li'), link = make('a', '', item.title);
        link.href = item.url; link.target = '_blank'; link.rel = 'noreferrer noopener';
        row.append(link, make('span', 'muted-note', ' · ' + (item.publisher || '출처 미표시') + ' · ' + item.market + ' · ' + kst(item.published_at)));
        return row;
      }));
      note.textContent = '뉴스 검색 결과의 제목만 자동으로 모은 목록입니다(최근 36시간 · ' + kst(data.checked_at) + ' KST 확인). 본문을 읽거나 사실을 검증한 것이 아니며, 아래 기사 요약과는 별개입니다.'
        + (data.failed?.length ? ' 수집하지 못한 곳: ' + data.failed.join(', ') + '.' : '');
      panel.hidden = false;
    } catch (_) { panel.hidden = true; }
  }
  load(); setInterval(load, 300000);
  document.querySelectorAll('[data-desk-reload]').forEach((button) => button.addEventListener('click', load));
})();
