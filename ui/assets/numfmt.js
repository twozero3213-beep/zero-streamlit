/* Readable numbers everywhere: decimals are truncated (not rounded) to two places, very large amounts are shown in
   조/억 with their currency, and the exact original value stays one hover or tap away. The page's renderers keep
   printing exact values; this layer only changes how they look. Pure functions are exported for Node tests. */
(() => {
  'use strict';
  const UNITS = [[1e12, '조'], [1e8, '억']];
  // [$]number[.decimals][ currency word]; no match inside dates (2026.10.12), versions (0.6.39), codes or words.
  const NUMBER = /(?<![\w.,$:])(\$)?(-?\d{1,3}(?:,\d{3})+|-?\d+)(\.\d+)?(?![\w]|\.\d|,\d)(\s?(?:KRW|USD|원|달러))?/g;
  const BIG = {KRW: 1e10, USD: 1e9};

  function truncateDecimals(integer, decimals, places = 2) {
    const kept = (decimals || '').slice(1, 1 + places).padEnd(places, '0');
    return places ? integer + '.' + kept : integer;
  }
  // Largest unit that keeps one or more whole units: 5,540,000,000,000 -> '5.54조'. Digits after the second decimal are cut.
  function compact(value) {
    const abs = Math.abs(value);
    for (const [size, name] of UNITS) {
      if (abs >= size) {
        const hundredths = Math.floor(abs / (size / 100) ), whole = Math.floor(hundredths / 100), fraction = String(hundredths % 100).padStart(2, '0').replace(/0+$/, '');
        return (value < 0 ? '-' : '') + whole.toLocaleString('en-US') + (fraction ? '.' + fraction : '') + name;
      }
    }
    return null;
  }
  const currencyOf = (dollar, suffix) => dollar ? 'USD' : /KRW|원/.test(suffix || '') ? 'KRW' : /USD|달러/.test(suffix || '') ? 'USD' : null;

  // Returns [{text, full}] segments: `full` is set where the text was shortened.
  function shorten(text) {
    const out = []; let last = 0;
    for (const match of text.matchAll(NUMBER)) {
      const [whole, dollar, integer, decimals, suffix] = match, currency = currencyOf(dollar, suffix), value = Number(integer.replaceAll(',', '') + (decimals || ''));
      let display = null;
      if (currency && Number.isFinite(value) && Math.abs(value) >= BIG[currency]) {
        const short = compact(value);
        if (short) display = currency === 'USD' ? short + ' 달러' : short + ' 원';
      } else if (decimals && decimals.length > 3) {
        display = truncateDecimals(integer, decimals) + (suffix || '');
        if (dollar) display = '$' + display;
      }
      if (display === null || display === whole) continue;
      if (match.index > last) out.push({text: text.slice(last, match.index)});
      out.push({text: display, full: whole.trim()}); last = match.index + whole.length;
    }
    if (last < text.length) out.push({text: text.slice(last)});
    return out;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {shorten, compact, truncateDecimals};
  if (typeof document === 'undefined') return;

  const SKIP = 'script, style, input, textarea, select, option, code, pre, canvas, svg, .num-t, [data-raw]';
  function convert(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode: (node) => node.parentElement && !node.parentElement.closest(SKIP) && /\d/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT});
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parts = shorten(node.nodeValue); if (!parts.some((part) => part.full)) continue;
      const fragment = document.createDocumentFragment();
      for (const part of parts) {
        if (!part.full) { fragment.append(part.text); continue; }
        const span = document.createElement('span'); span.className = 'num-t'; span.textContent = part.text; span.tabIndex = 0; span.dataset.full = part.full;
        span.title = '전체 값 ' + part.full + ' (소수점 둘째 자리까지만 보여 줘요)'; span.setAttribute('aria-label', part.text + ', 전체 값 ' + part.full); fragment.append(span);
      }
      node.replaceWith(fragment);
    }
  }
  let queued = false; const pending = new Set();
  const observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach((added) => { const target = added.nodeType === 1 ? added : added.parentElement; if (target && !target.closest?.('.num-t')) pending.add(target); });
    if (!queued && pending.size) { queued = true; requestAnimationFrame(run); }
  });
  function run() {
    queued = false; observer.disconnect();
    for (const target of pending) if (target.isConnected) convert(target); pending.clear();
    observer.observe(document.body, {childList: true, subtree: true, characterData: true});
  }
  document.addEventListener('click', (event) => {
    const chip = event.target.closest?.('.num-t');
    document.querySelectorAll('.num-t.num-open').forEach((open) => { if (open !== chip) open.classList.remove('num-open'); });
    if (chip) chip.classList.toggle('num-open');
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.classList?.contains('num-t')) event.target.classList.toggle('num-open'); });
  document.addEventListener('DOMContentLoaded', () => { pending.add(document.body); run(); });
  if (document.readyState !== 'loading') { pending.add(document.body); run(); }
})();
