/* 다크 테마: 밝은 색으로 쓰인 배경·글자·테두리를 어두운 짝으로 바꾼 덮어쓰기 규칙을 브라우저에서 만든다.
   기존 스타일시트 수백 개 규칙을 손으로 고치지 않고, 같은 선택자 앞에 html[data-zero-theme="dark"]만 붙여서 색만 다시 칠한다.
   색 변환은 순수 함수(밝기만 뒤집고 색조는 유지)이고, 토글 선택은 이 기기에만 저장한다. 라이트로 되돌리면 덮어쓰기는 아무 효과가 없다. */
(() => {
  'use strict';
  // :where() adds no specificity, so a recolored rule keeps the original's rank against its state variants (.open, :hover, [aria-pressed]).
  const SCOPE = ':where(html[data-zero-theme="dark"])';
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));

  function parseColor(token) {
    const text = String(token).trim().toLowerCase();
    if (text === 'white') return [255, 255, 255, 1];
    if (text === 'black') return [0, 0, 0, 1];
    let match = /^#([0-9a-f]{3,8})$/.exec(text);
    if (match) {
      let hex = match[1];
      if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
      if (hex.length !== 6 && hex.length !== 8) return null;
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1];
    }
    match = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(text);
    if (!match) return null;
    const channel = (value) => (value.endsWith('%') ? parseFloat(value) * 2.55 : parseFloat(value));
    const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
    const rgb = [channel(match[1]), channel(match[2]), channel(match[3])];
    return rgb.every(Number.isFinite) && Number.isFinite(alpha) ? [...rgb.map((v) => Math.round(clamp(v, 0, 255))), clamp(alpha)] : null;
  }
  function toHsl([r, g, b]) {
    const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1)), h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  }
  function fromHsl(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map((v) => Math.round(clamp(v) * 255));
  }
  const hex = (rgb, alpha) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('') + (alpha < 1 ? Math.round(alpha * 255).toString(16).padStart(2, '0') : '');
  // 거의 무채색이면 약간 푸른 회색으로(토스 다크처럼 순수 검정이 아니라 차가운 짙은 회색).
  const COOL = 220;
  const neutral = (s) => s < 0.12;

  // 밝은 배경은 어둡게(밝을수록 더 어둡게). 이미 어두운 색과 채도 높은 강조색 배경(빨강·주황·파란 버튼 등)은 그대로 둔다. 투명은 그대로.
  function darkBackground(token) {
    const color = parseColor(token); if (!color || color[3] === 0) return null;
    const [h, s, l] = toHsl(color);
    if (l < 0.55 || (s >= 0.5 && l < 0.8)) return null;  // dark fills and saturated accent fills (red, orange, blue buttons) stay as they are
    const l2 = 0.12 + (1 - l) * 0.62;
    return hex(neutral(s) ? fromHsl(COOL, 0.12, l2) : fromHsl(h, s * 0.65, l2), color[3]);
  }
  // 어두운 글자는 밝게, 이미 밝은 글자(진한 바탕 위 흰 글자)는 그대로. 채도가 있는 글자(빨강·파랑)는 색조를 지키며 밝힌다.
  function darkText(token) {
    const color = parseColor(token); if (!color || color[3] === 0) return null;
    const [h, s, l] = toHsl(color);
    if (s >= 0.3) return l < 0.6 ? hex(fromHsl(h, s * 0.9, Math.min(0.78, 0.64 + (0.6 - l) * 0.3)), color[3]) : null;  // navy text lifts further than a mid blue so both stay readable
    if (l >= 0.5) return null;
    return hex(fromHsl(COOL, 0.1, 1 - l * 0.75), color[3]);
  }
  // 밝은 테두리는 어두운 바탕에서 한 칸 더 밝은 짙은 선으로.
  function darkBorder(token) {
    const color = parseColor(token); if (!color || color[3] === 0) return null;
    const [h, s, l] = toHsl(color); if (l < 0.7) return null;
    const l2 = 0.12 + (1 - l) * 0.62 + 0.06;
    return hex(neutral(s) ? fromHsl(COOL, 0.1, l2) : fromHsl(h, s * 0.6, l2), color[3]);
  }
  const ROLES = {'background-color': darkBackground, 'background-image': darkBackground, color: darkText, fill: darkText, stroke: darkText, 'border-top-color': darkBorder, 'border-right-color': darkBorder,
    'border-bottom-color': darkBorder, 'border-left-color': darkBorder, 'outline-color': darkBorder, 'column-rule-color': darkBorder};
  const TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/g;
  // 값 안의 색 조각마다 변환(그라디언트 여러 색 포함). 하나도 바뀌지 않으면 null.
  function darkValue(property, value) {
    const mapper = ROLES[property]; if (!mapper || !value) return null;
    TOKEN.lastIndex = 0; if (!TOKEN.test(value)) return null;
    TOKEN.lastIndex = 0; let changed = false;
    const out = value.replace(TOKEN, (token) => { const next = mapper(token); if (next) changed = true; return next || token; });
    return changed ? out : null;
  }
  // 쉼표로 나뉜 선택자 목록을 괄호 안 쉼표는 보존하며 나눈다.
  function splitSelectors(text) {
    const out = []; let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--;
      else if (c === ',' && !depth) { out.push(text.slice(start, i).trim()); start = i + 1; }
    }
    out.push(text.slice(start).trim()); return out.filter(Boolean);
  }
  // 선택자 앞에 다크 범위를 붙인다. html·:root·body로 시작하는 선택자는 같은 요소를 가리키도록 합친다.
  function scoped(selector) {
    const match = /^(html|:root)(?![\w-])(.*)$/s.exec(selector);
    if (match) return match[1] + ':where([data-zero-theme="dark"])' + match[2];  // keeps the html type's specificity: `html .x.active` must still lose to its own recolor
    return SCOPE + ' ' + selector;
  }
  // 수정 이유: 카카오 노란색(#fee500)처럼 채도가 높은 밝은 배경은 HSL 명도가 0.5라서 예전 기준(명도 0.6 이상)으로는 "밝은 배경"으로 인식되지 않았다.
  // 그 결과 노란 뱃지의 어두운 글자만 밝게 바뀌어 다크 모드에서 글자가 사라졌다(층수 엘리베이터·주주 층수 뱃지). 사람 눈에 보이는 밝기(휘도)로 다시 판정한다.
  const luma = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  function keepsLightFill(token) {
    const fill = parseColor(token);
    return Boolean(fill && fill[3] > 0.5 && (toHsl(fill)[2] >= 0.6 || luma(fill) >= 0.6) && !darkBackground(token));
  }
  const api = {parseColor, darkBackground, darkText, darkBorder, darkValue, splitSelectors, scoped, toHsl, keepsLightFill};
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  window.ZERODarkTheme = api;

  function buildRules(rules, out) {
    for (const rule of rules) {
      if (rule.type === CSSRule.STYLE_RULE) {
        const declarations = [];
        // A light accent fill that stays light (yellow badge) keeps its dark text too; recoloring only the text would make it unreadable.
        const lightFill = keepsLightFill(rule.style.getPropertyValue('background-color'));
        for (let i = 0; i < rule.style.length; i++) {
          const property = rule.style[i];
          if (!ROLES[property] || (property === 'color' && lightFill)) continue;
          const next = darkValue(property, rule.style.getPropertyValue(property));
          if (next) declarations.push(property + ': ' + next + (rule.style.getPropertyPriority(property) ? ' !important' : ''));
        }
        if (declarations.length) {
          const selectors = splitSelectors(rule.selectorText).map(scoped);
          if (selectors.length) out.push(selectors.join(', ') + ' { ' + declarations.join('; ') + ' }');
        }
      } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
        const inner = []; buildRules(rule.cssRules, inner);
        if (inner.length) out.push('@' + (rule.type === CSSRule.MEDIA_RULE ? 'media ' : 'supports ') + (rule.conditionText || rule.media?.mediaText) + ' { ' + inner.join(' ') + ' }');
      }
    }
  }
  let built = false;
  function ensureSkin() {
    if (built) return; built = true;
    const out = [];
    for (const sheet of [...document.styleSheets]) {
      if (sheet.ownerNode?.id === 'zero-dark-skin') continue;
      try { buildRules(sheet.cssRules, out); } catch (_) { /* a cross-origin sheet cannot be read; it keeps its own colors */ }
    }
    const style = document.createElement('style'); style.id = 'zero-dark-skin'; style.textContent = out.join('\n'); document.head.append(style);
  }

  function current() { return document.documentElement.dataset.zeroTheme === 'light' ? 'light' : 'dark'; }
  function paintToggle(button) {
    const dark = current() === 'dark';
    button.setAttribute('aria-pressed', String(dark)); button.setAttribute('aria-label', dark ? '라이트 테마로 바꾸기' : '다크 테마로 바꾸기'); button.title = dark ? '라이트 테마로 바꾸기' : '다크 테마로 바꾸기';
    button.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>';
  }
  function setTheme(theme) {
    document.documentElement.dataset.zeroTheme = theme;
    document.documentElement.dataset.theme = theme;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try { window.localStorage.setItem('zero-theme', theme); } catch (_) { /* the choice just is not remembered */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#0f1115');
    if (theme === 'dark') ensureSkin();
    document.dispatchEvent(new CustomEvent('zero-theme-changed', {detail: {theme}}));
  }
  function mountToggle() {
    if (document.getElementById('theme-toggle')) return;
    const anchor = document.getElementById('global-watchlist'); if (!anchor) return;
    const button = document.createElement('button'); button.type = 'button'; button.id = 'theme-toggle'; button.className = 'icon-button';
    button.addEventListener('click', () => { setTheme(current() === 'dark' ? 'light' : 'dark'); paintToggle(button); });
    document.addEventListener('zero-theme-changed', () => paintToggle(button));
    paintToggle(button); anchor.before(button);
  }
  function start() {
    if (current() === 'dark') ensureSkin();
    document.documentElement.dataset.zeroSkin = 'ready';
    mountToggle();
  }
  // 덮어쓰기를 만드는 동안 라이트 색이 번쩍이지 않게 body를 잠깐 숨겼다가(CSS), 늦어도 2초 뒤엔 반드시 보인다.
  setTimeout(() => { document.documentElement.dataset.zeroSkin = 'ready'; }, 2000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
