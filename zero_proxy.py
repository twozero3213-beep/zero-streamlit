"""Bridge from /zero/api/* to the ZERO Cloudflare site.

Owner decision 2026-10-13: the whole ZERO view is public (account figures included) and the hosted
quote refresh is enabled. Account refresh and office job submission stay on the owner's PC only, so
every write is refused here. The Cloudflare Access service token stays on the server (Streamlit
Secrets or ZERO_* environment variables); errors are fixed codes, never provider bodies.
"""
import gzip
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse, RedirectResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

DEFAULT_SITE = 'https://zero-portfolio.zero-cloudflare.workers.dev'
UI = Path(__file__).parent / 'ui'
RANGES = {'1D', '1W', '1M', '3M', '1Y', '5Y'}
IDENTITY = re.compile(r'(US:[A-Z][A-Z0-9.-]{0,14}|KR:\d{6})')
EVENT = re.compile(r'[A-Z][A-Z_]{0,39}')
# path -> cache seconds; everything else is refused. live-quotes is the hosted "시세 새로고침".
PLAIN = {'/api/portfolio': 60, '/api/team': 300, '/api/office': 60, '/api/research': 1800, '/api/desk': 1800,
         '/api/funds': 1800, '/api/tqqq': 1800, '/api/institutions': 1800, '/api/live-quotes': 20}
MAX_BYTES = 12_000_000

_cache, _lock = {}, threading.Lock()


class Unavailable(Exception):
    """A fixed reason code; never a provider body or exception text."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # an Access login redirect means the token is wrong; never follow it


def _secret(name):
    try:
        import streamlit as st
        value = st.secrets.get(name)
    except Exception:  # no secrets file (local run)
        value = None
    value = value or os.environ.get('ZERO_' + name)
    # The Cloudflare dashboard copies values as "CF-Access-Client-Id: ..."; keep only the value.
    return re.sub(r'^\s*CF-Access-Client-(Id|Secret)\s*:\s*', '', value, flags=re.I).strip() if isinstance(value, str) else None


def fetch(path):
    client_id, secret = _secret('CF_ACCESS_CLIENT_ID'), _secret('CF_ACCESS_CLIENT_SECRET')
    if not (client_id and secret):
        raise Unavailable('NOT_CONFIGURED')
    base = (_secret('SITE_URL') or DEFAULT_SITE).rstrip('/')
    if not base.startswith('https://'):
        raise Unavailable('BAD_SITE')
    request = urllib.request.Request(base + path, headers={
        'CF-Access-Client-Id': client_id, 'CF-Access-Client-Secret': secret, 'User-Agent': 'zero-streamlit/3'})
    try:
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=40) as response:
            body = response.read(MAX_BYTES + 1)
            gzipped = response.headers.get('Content-Encoding') == 'gzip'
    except urllib.error.HTTPError as error:
        # 3xx = Access refused the token (login redirect); others are the site's own status.
        raise Unavailable('ACCESS_REFUSED' if 300 <= error.code < 400 else f'SITE_HTTP_{error.code}') from None
    except Exception:
        raise Unavailable('SITE_UNREACHABLE') from None
    try:
        if len(body) > MAX_BYTES:
            raise ValueError
        data = json.loads(gzip.decompress(body) if gzipped else body)
    except Exception:
        raise Unavailable('SITE_INVALID') from None
    if not isinstance(data, dict):
        raise Unavailable('SITE_INVALID')
    return data


def _upstream(path, query):
    """Map an allowed request to (upstream path, cache seconds) or raise."""
    if path in PLAIN and not query:
        return path, PLAIN[path]
    if path == '/api/team' and set(query) == {'event'} and EVENT.fullmatch(query['event']):
        return f"/api/team?event={query['event']}", 300
    if path == '/api/chart' and set(query) == {'identity', 'range'} and IDENTITY.fullmatch(query['identity']) and query['range'] in RANGES:
        return f"/api/chart?identity={quote(query['identity'], safe='')}&range={query['range']}", 300
    if path == '/api/company-news' and set(query) == {'identity'} and IDENTITY.fullmatch(query['identity']):
        return f"/api/company-news?identity={quote(query['identity'], safe='')}", 900
    raise Unavailable('NOT_PUBLIC')


def get_public(path, query):
    upstream, seconds = _upstream(path, query)
    now = time.monotonic()
    with _lock:
        hit = _cache.get(upstream)
        if hit and hit[0] > now:
            return hit[1]
    body = json.dumps(fetch(upstream), ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with _lock:
        if len(_cache) > 400:
            _cache.clear()
        _cache[upstream] = (now + seconds, body)
    return body


async def api(request):
    path = '/api/' + request.path_params['path']
    if request.method != 'GET':
        # Account refresh and office requests run only on the owner's PC.
        return JSONResponse({'error': 'OWNER_PC_ONLY'}, status_code=403)
    query = dict(request.query_params)
    if len(query) != len(request.query_params.multi_items()):
        return JSONResponse({'error': 'NOT_PUBLIC'}, status_code=404)
    try:
        body = await run_in_threadpool(get_public, path, query)
    except Unavailable as error:
        code = str(error)
        return JSONResponse({'error': code}, status_code=404 if code == 'NOT_PUBLIC' else 503)
    except Exception as error:  # report the exception class only, never its message
        return JSONResponse({'error': 'BRIDGE_ERROR', 'kind': type(error).__name__}, status_code=500)
    return Response(body, media_type='application/json; charset=utf-8', headers={'Cache-Control': 'no-store'})


def _status():
    client_id, secret = _secret('CF_ACCESS_CLIENT_ID'), _secret('CF_ACCESS_CLIENT_SECRET')
    shape = {'id_set': bool(client_id), 'id_looks_valid': bool(client_id and re.fullmatch(r'[0-9a-f]{32}(\.access)?', client_id)),
             'secret_set': bool(secret), 'secret_length_ok': bool(secret and len(secret) >= 40),
             'placeholder': '...' in (client_id or '') + (secret or '')}
    try:
        fetch('/api/office')
        site = 'OK'
    except Unavailable as error:
        site = str(error)
    return {**shape, 'site': site}


async def status(request):
    # Always 200 because Community Cloud rewrites app error statuses; key values are never included.
    return JSONResponse(await run_in_threadpool(_status), headers={'Cache-Control': 'no-store'})


async def to_ui(request):
    return RedirectResponse('zero/', status_code=307)


routes = [
    Route('/zero/status', status),
    Route('/zero/api/{path:path}', api, methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    Route('/zero', to_ui),
    Mount('/zero', app=StaticFiles(directory=UI, html=True)),
]
