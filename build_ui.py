"""Copy the ZERO web UI (the Cloudflare build's public/ folder) into ui/ for the Streamlit app.

usage: python build_ui.py <path-to-zero-cloudflare/public> [<zero checkout for the latest committed research list>]

The public-only privacy label is clarified, extras/*.js are added (live headlines) and that absolute '/api/' and '/assets/' become relative, so it works under
/zero/ and Community Cloud's /~/+/ prefix. The build keeps data-zero-hosted, so the refresh button
reprices with public quotes (account refresh and office requests stay on the owner's PC).
"""
import ast
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).parent / 'ui'
EXTRAS = Path(__file__).parent / 'extras'  # hosted-only scripts added to the unchanged ZERO UI


def relative(text):
    return re.sub(r"""(['"`])/(api|assets)/""", r'\1\2/', text)


def build(source, checkout=None):
    source = Path(source).resolve()
    output = OUT.resolve()
    filter_source = None
    chart_sources = {}
    if checkout:
        filter_source = subprocess.run(['git', '-C', str(checkout), 'show', 'HEAD:zero/trend_filter.py'],
                                       capture_output=True, check=True, encoding='utf-8').stdout
    if checkout:
        for name in ('streamlit_chart.py', 'chart_licenses.txt'):
            chart_sources[name] = subprocess.run(
                ['git', '-C', str(checkout), 'show', 'HEAD:zero/' + name],
                capture_output=True, check=True, encoding='utf-8').stdout
    if not (source / 'assets').is_dir() or not (source / 'index.html').is_file():
        raise ValueError('HOSTED_SOURCE_MISSING')
    if output == source or output in source.parents or source in output.parents or OUT.is_symlink() or OUT.is_junction():
        raise ValueError('BUILD_SOURCE_OUTPUT_OVERLAP')
    source_html = (source / 'index.html').read_text(encoding='utf-8')
    if 'data-zero-hosted="true"' not in source_html:
        raise ValueError('HOSTED_FLAG_MISSING')
    # Reject invalid configuration and missing committed inputs before replacing the UI.
    api = os.environ.get('ZERO_LOBBY_API', '').strip().rstrip('/')
    if api and not re.fullmatch(r'https?://[A-Za-z0-9.:-]+', api):
        raise SystemExit('ZERO_LOBBY_API_INVALID')
    manifest_source = (source / 'assets/manifest.webmanifest').read_text(encoding='utf-8')
    if checkout:
        refs = subprocess.run(['git', '-C', str(checkout), 'show', 'HEAD:zero/data/research_connections.json'],
                              capture_output=True, check=True, encoding='utf-8').stdout
        public = {}
        for name in ('macro_sources.py', 'market_gauges.py', 'briefing_sources.py', 'research_desk.py', 'company_research.py', 'data/briefing_sources.json'):
            public[name] = subprocess.run(['git', '-C', str(checkout), 'show', 'HEAD:zero/' + name],
                                          capture_output=True, check=True, encoding='utf-8').stdout
    if OUT.exists():
        shutil.rmtree(output)
    shutil.copytree(source / 'assets', OUT / 'assets')
    for js in (OUT / 'assets').glob('*.js'):
        # Reviewed vendor bytes and licenses are copied intact, including line endings.
        if js.name.startswith('vendor-'):
            continue
        js.write_text(relative(js.read_text(encoding='utf-8')), encoding='utf-8')
    # CSS and the manifest resolve URLs against their own location (assets/).
    for css in (OUT / 'assets').glob('*.css'):
        css.write_text(re.sub(r"""url\((['"]?)/assets/""", r'url(\1', css.read_text(encoding='utf-8')), encoding='utf-8')
    manifest = OUT / 'assets' / 'manifest.webmanifest'
    text = manifest_source.replace('"/assets/', '"')
    manifest.write_text(re.sub(r'"(id|start_url|scope)":"/"', r'"\1":"../"', text), encoding='utf-8')
    html = relative(source_html).replace('본인 전용', '공개 참고 화면').replace('대표님 전용', '공개 참고 화면')
    # Streamlit can strip response headers; keep the document policy aligned with Auth.
    auth_origin = os.environ.get('ZERO_AUTH_SUPABASE_ORIGIN', 'https://txhozsfszjryasemyecx.supabase.co').strip().rstrip('/')
    auth_origin = ' ' + auth_origin if re.fullmatch(r'https://[a-z0-9]{20}\.supabase\.co', auth_origin) else ''
    html = re.sub(r'(<meta http-equiv="Content-Security-Policy" content="[^"]*connect-src [^";]*)([;"])', lambda match: match[1] + auth_origin + match[2], html)
    if 'data-zero-hosted="true"' not in html:
        raise SystemExit('HOSTED_FLAG_MISSING: build from the hosted (Cloudflare/Sites) public folder')
    # The office's account API (public Cloudflare Worker). Empty keeps the single-visitor office.
    html = html.replace('<meta name="zero-lobby-api" content="">', f'<meta name="zero-lobby-api" content="{api}">')
    html = html.replace('<meta name="zero-lightweight-chart" content="">',
                        '<meta name="zero-lightweight-chart" content="./lwc">')
    for extra in sorted(EXTRAS.glob('*.js')):
        shutil.copy(extra, OUT / 'assets' / extra.name)
        html = html.replace('</body>', f'  <script src="assets/{extra.name}" defer></script>\n</body>', 1)
    (OUT / 'index.html').write_text(html, encoding='utf-8')
    if checkout:  # committed content only, so uncommitted work in the checkout never ships
        (OUT / 'assets' / 'research-references.json').write_text(refs, encoding='utf-8')
    if filter_source is not None:
        (Path(__file__).parent / 'zero_trend_filter.py').write_text(filter_source, encoding='utf-8')
    for name, content in chart_sources.items():
        target = 'zero_streamlit_chart.py' if name.endswith('.py') else name
        (Path(__file__).parent / target).write_text(content, encoding='utf-8')
    if checkout:
        # Ship only the pure statistics used by public collectors, excluding owner file/ledger APIs.
        statistics = ['from datetime import date', 'from decimal import Decimal, localcontext', 'import re',
                      "INVALID = 'RESEARCH_DESK_INVALID'",
                      'ERRORS = (OSError, ValueError, TypeError, KeyError, UnicodeError, ArithmeticError, RecursionError)']
        for name, selected in (('company_research.py', {'_object', '_day'}),
                               ('research_desk.py', {'_list', '_normal', '_decimal', '_period', '_history', '_cutoff', 'descriptive_statistics'})):
            for item in ast.parse(public[name]).body:
                if isinstance(item, ast.FunctionDef) and item.name in selected:
                    statistics.append(ast.get_source_segment(public[name], item))
        root = Path(__file__).parent
        (root / 'zero_statistics.py').write_text('\n\n'.join(statistics) + '\n', encoding='utf-8')
        for name, target in (('macro_sources.py', 'zero_macro.py'), ('market_gauges.py', 'zero_gauges.py'), ('briefing_sources.py', 'zero_reports.py')):
            code = public[name].split('\ndef main(', 1)[0]
            code = code.replace('from zero.research_desk import descriptive_statistics', 'from zero_statistics import descriptive_statistics')
            if name == 'macro_sources.py':
                code = code.replace('    at = now or datetime.now(timezone.utc)', '    from zero_research import read_bls\n    at = now or datetime.now(timezone.utc)')
                code = code.replace('client.read(BLS_URL, payload=', 'read_bls(client, payload=')
            code = code.replace('from zero.company_sources import NoRedirect', 'from zero_discovery import _NoRedirect as NoRedirect')
            code = code.replace('from zero.manager_journal import _url\n', '').replace('canonical = _url(url)', 'canonical = public_url(url)')
            code = code.replace("files('zero').joinpath('data/briefing_sources.json')", "Path(__file__).with_name('briefing_sources.json')")
            code = code.replace('from importlib.resources import files\n', '').replace('import argparse\n', '')
            (root / target).write_text(code.rstrip() + '\n', encoding='utf-8')
        (root / 'briefing_sources.json').write_text(public['data/briefing_sources.json'], encoding='utf-8')
    print('built', sum(1 for _ in OUT.rglob('*') if _.is_file()), 'files')


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
