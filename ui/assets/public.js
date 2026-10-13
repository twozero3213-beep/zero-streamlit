// Public edition: label account figures as private after every render. The server never sends them.
(() => {
  const ids = ["observed-assets-total", "observed-cash-total", "connected-assets-total", "zero-total-gain", "zero-total-return", "holdings-value", "investment-capital", "cash-krw", "cash-usd", "cash-krw-before-settlement", "holdings-pnl", "holdings-cost", "holdings-return", "holdings-return-us", "holdings-return-kr", "holdings-pnl-us", "holdings-pnl-kr", "account-return", "policy-capital"];
  const cover = () => {
    ids.forEach((id) => { const el = document.getElementById(id); if (el && el.textContent !== '비공개') { el.textContent = '비공개'; el.className = 'unavailable'; } });
    document.querySelectorAll('.position-return').forEach((el) => { if (el.textContent !== '비공개') el.textContent = '비공개'; });
  };
  if (typeof window.render === 'function') {
    const original = window.render;
    window.render = function (...args) { const result = original.apply(this, args); cover(); return result; };
  }
  new MutationObserver(cover).observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  cover();
})();
