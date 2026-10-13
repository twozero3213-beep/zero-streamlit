"""Copy the ZERO web UI (the Cloudflare build's public/ folder) into ui/ for the public Streamlit edition.

usage: python build_ui.py <path-to-zero-cloudflare/public> [<zero checkout for the latest committed research list>]

Only two kinds of change are made, and every target must exist so an upstream UI change fails loudly:
- absolute '/api/' and '/assets/' become relative, so the UI works under /zero/ (and Community Cloud's /~/+/ prefix);
- public mode: money and quantity render as '비공개', the refresh button is hidden, and return figures are covered.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).parent / 'ui'
PUBLIC_FLAG = "const ZERO_PUBLIC = document.documentElement?.dataset?.zeroPublic === 'true';\n"
APP_PATCHES = [
    ("const money = (value, currency = 'KRW') => Number.isFinite(number(value)) ?",
     "const money = (value, currency = 'KRW') => ZERO_PUBLIC && Number.isFinite(number(value)) ? '비공개' : Number.isFinite(number(value)) ?"),
    ('const quantityText = format(row.quantity, 6)', "const quantityText = ZERO_PUBLIC ? '비공개' : format(row.quantity, 6)"),
    # The amount cross-checks cannot pass once amounts are removed; public mode only needs the holdings list.
    ("const referenceAvailable = scope.state === 'REFERENCE' && scope.scope",
     "const referenceAvailable = ZERO_PUBLIC ? scope.state === 'REFERENCE' && Array.isArray(scope.holdings) : scope.state === 'REFERENCE' && scope.scope"),
]
# Shown values the server already blanked; label them as private instead of "unconfirmed".
PRIVATE_IDS = ['observed-assets-total', 'observed-cash-total', 'connected-assets-total', 'zero-total-gain', 'zero-total-return',
               'holdings-value', 'investment-capital', 'cash-krw', 'cash-usd', 'cash-krw-before-settlement', 'holdings-pnl',
               'holdings-cost', 'holdings-return', 'holdings-return-us', 'holdings-return-kr', 'holdings-pnl-us', 'holdings-pnl-kr',
               'account-return', 'policy-capital']
PUBLIC_JS = """// Public edition: label account figures as private after every render. The server never sends them.
(() => {
  const ids = %s;
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
""" % repr(PRIVATE_IDS).replace("'", '"')
NOTICE = ('<div class="zero-public-notice" style="position:sticky;top:0;z-index:50;background:#fff7e6;color:#7a4b00;'
          'font-size:13px;padding:6px 12px;text-align:center">공개 읽기 전용 · 계좌 금액·수량·수익률은 비공개 · '
          '주문·계좌 새로고침·업무 요청 없음 · 투자 권유 아님</div>')


def relative(text):
    return re.sub(r"""(['"`])/(api|assets)/""", r'\1\2/', text)


def replace_once(text, old, new, name):
    if text.count(old) != 1:
        raise SystemExit(f'PATCH_TARGET_CHANGED {name}: {old[:60]}')
    return text.replace(old, new)


def build(source, checkout=None):
    source = Path(source)
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(source / 'assets', OUT / 'assets')
    for js in (OUT / 'assets').glob('*.js'):
        js.write_text(relative(js.read_text(encoding='utf-8')), encoding='utf-8')
    # CSS and the manifest resolve URLs against their own location (assets/).
    for css in (OUT / 'assets').glob('*.css'):
        css.write_text(re.sub(r"""url\((['"]?)/assets/""", r'url(\1', css.read_text(encoding='utf-8')), encoding='utf-8')
    manifest = OUT / 'assets' / 'manifest.webmanifest'
    text = manifest.read_text(encoding='utf-8').replace('"/assets/', '"')
    manifest.write_text(re.sub(r'"(id|start_url|scope)":"/"', r'"\1":"../"', text), encoding='utf-8')
    app = (OUT / 'assets' / 'app.js').read_text(encoding='utf-8')
    app = replace_once(app, "const hostedView = ", PUBLIC_FLAG + "const hostedView = ", 'flag')
    for old, new in APP_PATCHES:
        app = replace_once(app, old, new, 'app.js')
    (OUT / 'assets' / 'app.js').write_text(app, encoding='utf-8')
    (OUT / 'assets' / 'public.js').write_text(PUBLIC_JS, encoding='utf-8')
    html = relative((source / 'index.html').read_text(encoding='utf-8'))
    html = replace_once(html, 'data-zero-hosted="true"', 'data-zero-hosted="true" data-zero-public="true"', 'html flag')
    html = replace_once(html, '</head>', '<style>#refresh{display:none!important}</style></head>', 'head')
    html = replace_once(html, '<script src="assets/fund-view.js" defer></script>',
                        '<script src="assets/fund-view.js" defer></script><script src="assets/public.js" defer></script>', 'scripts')
    html = re.sub(r'(<body[^>]*>)', r'\1' + NOTICE, html, count=1)
    (OUT / 'index.html').write_text(html, encoding='utf-8')
    if checkout:  # committed content only, so uncommitted work in the checkout never ships
        refs = subprocess.run(['git', '-C', str(checkout), 'show', 'HEAD:zero/data/research_connections.json'],
                              capture_output=True, check=True, encoding='utf-8').stdout
        (OUT / 'assets' / 'research-references.json').write_text(refs, encoding='utf-8')
    print('built', sum(1 for _ in OUT.rglob('*') if _.is_file()), 'files')


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
