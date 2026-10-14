/* Page-level comfort: loading splash, paging of long lists, indicator modal. Works on rendered DOM only,
   so the data renderers stay untouched. Pure helpers are exported for Node tests. */
(() => {
  'use strict';
  // Pages for `count` items: current page clamped, visible slice, and the number buttons (with gaps as null).
  function pageModel(count, size, page) {
    const pages = Math.max(1, Math.ceil(count / size)), current = Math.min(Math.max(0, page), pages - 1);
    const wanted = new Set([0, pages - 1, current - 1, current, current + 1].filter((n) => n >= 0 && n < pages));
    const numbers = []; let previous = -1;
    [...wanted].sort((a, b) => a - b).forEach((n) => { if (n - previous > 1) numbers.push(null); numbers.push(n); previous = n; });
    return {pages, current, start: current * size, end: Math.min(count, current * size + size), numbers};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {pageModel};
  if (typeof document === 'undefined') return;

  // ---- loading splash -------------------------------------------------------------------------
  const splash = document.getElementById('boot-splash');
  let hidden = false;
  function hideSplash() {
    if (hidden || !splash) return; hidden = true; splash.classList.add('fade'); setTimeout(() => { splash.hidden = true; }, 350);
  }
  if (splash) {
    const sub = splash.querySelector('.boot-sub');
    setTimeout(() => { if (!hidden && sub) sub.textContent = '서버를 깨우는 중이에요. 처음 열 때는 잠시 걸릴 수 있어요.'; }, 5000);
    setTimeout(() => { if (!hidden && sub) sub.textContent = '조금만 더 기다려 주세요. 계속 불러오는 중이에요…'; }, 15000);
    document.addEventListener('zero-ready', hideSplash);
    setTimeout(hideSplash, 40000);
  }

  // ---- paging ---------------------------------------------------------------------------------
  function pager(container, size) {
    const nav = document.createElement('nav'); nav.className = 'pager'; nav.setAttribute('aria-label', '페이지 이동'); nav.hidden = true;
    container.after(nav);
    let page = 0, lastCount = -1, applying = false;
    const items = () => [...container.children];
    function apply() {
      applying = true;
      const list = items(), model = pageModel(list.length, size, list.length === lastCount ? page : 0);
      page = model.current; lastCount = list.length;
      list.forEach((item, index) => item.classList.toggle('pager-hidden', index < model.start || index >= model.end));
      nav.hidden = model.pages <= 1; nav.replaceChildren();
      if (model.pages > 1) {
        const button = (label, target, extra = {}) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; Object.assign(b, extra); b.addEventListener('click', () => { page = target; lastCount = list.length; apply(); container.scrollIntoView?.({block: 'start', behavior: 'smooth'}); }); return b; };
        nav.append(button('이전', page - 1, {disabled: page === 0}));
        model.numbers.forEach((n) => { if (n === null) { const gap = document.createElement('span'); gap.className = 'pager-info'; gap.textContent = '…'; nav.append(gap); } else { const b = button(String(n + 1), n); if (n === page) b.setAttribute('aria-current', 'page'); b.setAttribute('aria-label', (n + 1) + '쪽'); nav.append(b); } });
        nav.append(button('다음', page + 1, {disabled: page === model.pages - 1}));
        const info = document.createElement('span'); info.className = 'pager-info'; info.textContent = list.length + '개 중 ' + (model.start + 1) + '–' + model.end; nav.append(info);
      }
      queueMicrotask(() => { applying = false; });
    }
    new MutationObserver(() => { if (!applying) apply(); }).observe(container, {childList: true});
    apply();
  }
  [['news-list', 6], ['macro-list', 10], ['research-ranks', 20], ['source-library-list', 10], ['holding-list', 10]].forEach(([id, size]) => { const container = document.getElementById(id); if (container) pager(container, size); });

  // ---- economic indicators open in a modal ----------------------------------------------------
  const macro = document.getElementById('macro-list');
  if (macro) {
    const dialog = document.createElement('dialog'); dialog.className = 'indicator-dialog'; dialog.setAttribute('aria-labelledby', 'indicator-title');
    dialog.innerHTML = '<div class="ind-head"><div><h2 id="indicator-title"></h2><p class="muted-note" id="indicator-sub"></p></div><button type="button" class="secondary-button" id="indicator-close">닫기</button></div><div class="ind-body"></div>';
    document.body.append(dialog);
    dialog.querySelector('#indicator-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    macro.addEventListener('click', (event) => {
      const summary = event.target.closest('summary'); if (!summary || !macro.contains(summary)) return;
      const card = summary.parentElement; if (!card.matches('details.desk-indicator')) return;
      event.preventDefault();
      const heading = summary.querySelector('.desk-indicator-heading');
      dialog.querySelector('#indicator-title').textContent = heading?.querySelector('strong')?.textContent || '경제 지표';
      dialog.querySelector('#indicator-sub').textContent = [...(summary.querySelector('.desk-indicator-values')?.children || [])].map((part) => part.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');
      const body = card.querySelector('.desk-indicator-body')?.cloneNode(true);
      body?.querySelectorAll('details').forEach((details) => { details.open = true; });
      const item = window.ZERODesk?.macro?.().find((row) => row.id === card.dataset.id), outlook = item && window.ZEROOutlook?.render?.(item);
      dialog.querySelector('.ind-body').replaceChildren(...[outlook, body].filter(Boolean));
      dialog.showModal?.();
    });
  }
})();
