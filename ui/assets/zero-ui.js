/* ZERO 화면 공통 도구: 요소 만들기, 선 아이콘, 자료 요청, 주소 이동, 테마, 관심 종목 저장.
   화면별 코드는 window.ZeroUI만 쓰고 서로를 직접 부르지 않는다. */
(() => {
  'use strict';
  const C = window.ZeroCore;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---- 요소 -----------------------------------------------------------------------------------
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    children.flat().forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  function svg(tag, attrs = {}, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    children.forEach((child) => node.append(child));
    return node;
  }

  // 한 벌의 선 아이콘(24px, 선 굵기 1.8). 이모지를 아이콘으로 쓰지 않는다.
  const ICONS = {
    home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
    wallet: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 7a2 2 0 0 1 2-2h10M16 13h2',
    search: 'M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5 20 20',
    menu: 'M4 6h16M4 12h16M4 18h16',
    heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    eyeOff: 'M4 4l16 16M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.8 3.6M6.3 7.4A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 3.6-.7',
    refresh: 'M20 7v5h-5M4 17v-5h5M6.5 8a7 7 0 0 1 12-1.5L20 9M17.5 16a7 7 0 0 1-12 1.5L4 15',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    chevron: 'M9 6l6 6-6 6',
    back: 'M15 6l-6 6 6 6',
    close: 'M6 6l12 12M18 6 6 18',
    chart: 'M4 19V5M4 19h16M8 15l4-5 3 3 5-7',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
    news: 'M5 4h11v16H5zM16 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3',
    report: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
    book: 'M4 5h6a3 3 0 0 1 3 3v12a3 3 0 0 0-3-2H4zM13 8a3 3 0 0 1 3-3h4v13h-4a3 3 0 0 0-3 2',
    chat: 'M5 5h14v10H10l-5 4z',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1-.5-2h-5L9 7 7 8 5 7l-2 4 2 1v2l-2 1 2 4 2-1 2 1 .5 2h5l.5-2 2-1 2 1 2-4-2-1z',
    calc: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
    calendar: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4'
  };

  function icon(name, size = 22) {
    const node = svg('svg', {viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'});
    node.classList.add('icon');
    node.append(svg('path', {d: ICONS[name] || ICONS.chevron}));
    return node;
  }

  // 작은 추세선. 값이 두 개 미만이면 만들지 않는다.
  function sparkline(values, dir = 'flat', width = 96, height = 28) {
    const points = C.sparkPoints(values, width, height);
    if (!points) return null;
    const node = svg('svg', {viewBox: `0 0 ${width} ${height}`, class: 'spark tone-' + dir, role: 'img', 'aria-label': '최근 흐름'});
    node.append(svg('polyline', {points: points.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' '), fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}));
    return node;
  }

  // 오르내림 글자: 색과 함께 부호를 항상 붙인다.
  function change(percent) {
    if (!Number.isFinite(percent)) return el('span', {class: 'change tone-flat', text: '변동 미확인'});
    return el('span', {class: 'change tone-' + C.direction(percent), text: C.percentText(percent)});
  }

  // ---- 자료 요청 ------------------------------------------------------------------------------
  const cache = new Map();

  async function untilDeadline(promise, deadline, abort) {
    if (!Number.isFinite(deadline)) return promise;
    let timer;
    try {
      const value = await Promise.race([promise, new Promise((resolve) => {
        timer = setTimeout(() => { abort?.(); resolve(null); }, Math.max(0, deadline - performance.now()));
      })]);
      return performance.now() < deadline ? value : null;
    } finally { clearTimeout(timer); }
  }

  // 같은 주소의 요청은 공유하되, 짧게 기다리는 화면이 다른 화면의 요청을 취소하지 않는다.
  async function api(path, ttl = 30, deadline = Infinity) {
    if (performance.now() >= deadline) return null;
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < ttl * 1000) return untilDeadline(hit.promise, deadline);
    const controller = new AbortController();
    const request = (async () => {
      try {
        const response = await fetch(path, {cache: 'no-store', signal: controller.signal});
        if (!response.ok) return null;
        return await response.json();
      } catch (_) { return null; }
    })();
    const promise = untilDeadline(request, Math.min(deadline, performance.now() + 20000), () => controller.abort());
    cache.set(path, {at: Date.now(), promise});
    const data = await promise;
    if (data === null && cache.get(path)?.promise === promise) cache.delete(path);
    return data;
  }

  function forget(prefix) {
    [...cache.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => cache.delete(key));
  }

  // 여러 종목 시세를 한 번에. /api/market/quote가 없는 곳에서는 빈 Map.
  async function quotes(ids, deadline = performance.now() + 12000) {
    const symbols = [...new Set(ids)].filter(Boolean), map = new Map();
    for (let offset = 0; offset < symbols.length && performance.now() < deadline; offset += 30) {
      const data = await api('api/market/quote?symbols=' + symbols.slice(offset, offset + 30).map(encodeURIComponent).join(','), 15, deadline);
      for (const [id, quote] of C.quoteMap(data)) map.set(id, quote);
    }
    return map;
  }

  // ---- 저장(이 브라우저에만) ------------------------------------------------------------------
  const visitStore = new Map();
  const store = {
    get(key, fallback) {
      if (visitStore.has(key)) return visitStore.get(key);
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); visitStore.delete(key); }
      catch (_) { visitStore.set(key, value); }
    }
  };

  const WATCH_KEY = 'zero-watchlist-v2';
  const watch = {
    list() {
      const saved = store.get(WATCH_KEY, []);
      return Array.isArray(saved) ? saved.filter((item) => /^(KR:[0-9A-Z]{6}|US:[A-Z][A-Z0-9.-]{0,14})$/.test(item?.id) && typeof item.name === 'string').slice(0, 30) : [];
    },
    has(id) { return watch.list().some((item) => item.id === id); },
    toggle(id, name) {
      const current = watch.list(), exists = current.some((item) => item.id === id);
      const next = exists ? current.filter((item) => item.id !== id) : [{id, name: String(name || id).slice(0, 40)}, ...current];
      store.set(WATCH_KEY, next);
      document.dispatchEvent(new CustomEvent('zero-watch-changed'));
      return !exists;
    }
  };

  function heartButton(id, name) {
    const button = el('button', {type: 'button', class: 'icon-button heart'}, icon('heart'));
    const paint = () => {
      const on = watch.has(id);
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', name + (on ? ' 관심 종목에서 빼기' : ' 관심 종목에 담기'));
    };
    button.addEventListener('click', (event) => { event.stopPropagation(); event.preventDefault(); watch.toggle(id, name); paint(); });
    paint();
    return button;
  }

  // ---- 금액 가리기 ----------------------------------------------------------------------------
  const HIDE_KEY = 'zero-hide-amounts';
  const amounts = {
    hidden: () => store.get(HIDE_KEY, false) === true,
    toggle() {
      store.set(HIDE_KEY, !amounts.hidden());
      document.dispatchEvent(new CustomEvent('zero-amounts-changed'));
    },
    text: (value) => (amounts.hidden() ? '가려짐' : value)
  };

  // ---- 테마 -----------------------------------------------------------------------------------
  const THEME_KEY = 'zero-theme';
  const theme = {
    choice: () => { const saved = store.get(THEME_KEY, 'auto'); return ['light', 'dark', 'auto'].includes(saved) ? saved : 'auto'; },
    resolved() {
      const choice = theme.choice();
      if (choice !== 'auto') return choice;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
    apply() {
      document.documentElement.dataset.theme = theme.resolved();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.resolved() === 'dark' ? '#17171c' : '#ffffff');
      document.dispatchEvent(new CustomEvent('zero-theme-changed'));
    },
    set(choice) { store.set(THEME_KEY, choice); theme.apply(); }
  };
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (theme.choice() === 'auto') theme.apply(); });

  // ---- 주소 이동 ------------------------------------------------------------------------------
  const routes = new Map();
  let current = null;

  function parseHash() {
    let raw;
    try { raw = decodeURIComponent(location.hash.replace(/^#/, '')); }
    catch (error) {
      if (!(error instanceof URIError)) throw error;
      return {name: 'home', arg: ''};
    }
    const [name, ...rest] = raw.split('/');
    return routes.has(name) ? {name, arg: rest.join('/')} : {name: 'home', arg: ''};
  }

  function render() {
    const route = parseHash(), handler = routes.get(route.name);
    document.querySelectorAll('main > .view').forEach((view) => { view.hidden = view.id !== 'view-' + route.name; });
    document.querySelectorAll('[data-tab]').forEach((link) => {
      const active = link.dataset.tab === (handler.tab || route.name);
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    const changed = !current || current.name !== route.name || current.arg !== route.arg;
    const moving = Boolean(current) && changed;
    if (changed) window.scrollTo(0, 0);
    current = route;
    document.title = (handler.title ? handler.title(route.arg) + ' | ' : '') + 'ZERO';
    handler.show(route.arg);
    if (moving) document.getElementById('main')?.focus({preventScroll: true});
    const status = document.getElementById('route-status');
    if (changed && status) status.textContent = document.title.replace(/ \| ZERO$/, '') + ' 화면을 열었어요.';
  }

  function route(name, handler) { routes.set(name, handler); }
  function go(hash) { if (location.hash === '#' + hash) render(); else location.hash = hash; }
  function start() { window.addEventListener('hashchange', render); render(); }

  // ---- 작은 조각 ------------------------------------------------------------------------------
  function section(title, ...children) {
    const node = el('section', {class: 'block'});
    if (title) node.append(el('h2', {class: 'block-title', text: title}));
    node.append(...children.flat().filter(Boolean));
    return node;
  }

  function empty(text) { return el('p', {class: 'empty', text}); }
  function note(text) { return el('p', {class: 'note', text}); }
  function loading(text = '불러오는 중이에요') { return el('p', {class: 'empty loading', role: 'status', text}); }

  // 종목 한 줄: 이름, 보조 글, 오른쪽 값과 등락.
  function stockRow({id, name, sub, value, percent, extra, heart = false}) {
    const main = el('a', {class: 'row-main stock-row-main', href: '#stock/' + id},
      el('span', {class: 'row-name'}, el('strong', {text: name}), sub ? el('small', {text: sub}) : null),
      extra || null,
      el('span', {class: 'row-value'}, el('strong', {text: value || '시세 미확인'}), percent === undefined ? null : change(percent)));
    return el('li', {class: 'row'}, main, heart ? heartButton(id, name) : null);
  }

  // 선택 단추 묶음(하나만 고름).
  function segmented(options, selected, onChange, label) {
    const group = el('div', {class: 'segmented', role: 'group', 'aria-label': label});
    options.forEach(([value, text]) => {
      const button = el('button', {type: 'button', text, 'aria-pressed': String(value === selected)});
      button.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
        onChange(value);
      });
      group.append(button);
    });
    return group;
  }

  // 공용 상세 창.
  function sheet(title, body) {
    const dialog = document.getElementById('sheet');
    dialog.querySelector('#sheet-title').textContent = title;
    dialog.querySelector('#sheet-body').replaceChildren(...[body].flat());
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('#sheet-body').scrollTop = 0;
    dialog.querySelector('#sheet-title').focus({preventScroll: true});
  }

  // 제공처가 보낸 제목의 HTML 문자 표기(&quot; 등)를 글자로 바꾼다. 태그는 버린다.
  function plain(text) {
    return new DOMParser().parseFromString(String(text || ''), 'text/html').documentElement.textContent.trim();
  }

  function timeText(iso) {
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) return null;
    return new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(time));
  }

  window.ZeroUI = {
    el, svg, icon, sparkline, change, api, forget, quotes, store, watch, heartButton, amounts, theme,
    route, go, start, section, empty, note, loading, stockRow, segmented, sheet, timeText, plain,
    hosted: document.documentElement.dataset.zeroHosted === 'true'
  };
})();
