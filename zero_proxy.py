"""Public read-only bridge from /zero/api/* to the ZERO Cloudflare site.

The Cloudflare Access service token stays on the server (Streamlit Secrets or ZERO_* environment
variables). Only allowlisted GET routes are forwarded; the portfolio is masked so no account amount,
quantity, price, P&L or return ever leaves this process; writes are refused. Errors are fixed codes.
"""
import copy
import gzip
import json
import os
import re
import threading
import time
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
# path -> cache seconds; everything else is refused.
PLAIN = {'/api/portfolio': 300, '/api/team': 300, '/api/office': 60, '/api/research': 1800, '/api/desk': 1800,
         '/api/funds': 1800, '/api/tqqq': 1800, '/api/institutions': 1800}
MAX_BYTES = 12_000_000
# Keys whose numeric values are account figures (amounts, quantities, prices, P&L, returns, FX used to value them).
AMOUNT = re.compile(r'krw|usd|value|cash|capital|cost|pnl|gain|price|quantity|return|amount|funds|total|native', re.I)

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
    return re.sub(r'^\s*CF-Access-Client-(Id|Secret)\s*:\s*', '', value, flags=re.I).strip() if value else value


def fetch(path):
    try:
        client_id, secret = _secret('CF_ACCESS_CLIENT_ID'), _secret('CF_ACCESS_CLIENT_SECRET')
    except Exception:
        raise Unavailable('SECRETS_INVALID') from None
    if not (isinstance(client_id, str) and isinstance(secret, str) and client_id and secret):
        raise Unavailable('NOT_CONFIGURED')
    base = (_secret('SITE_URL') or DEFAULT_SITE).rstrip('/')
    if not base.startswith('https://'):
        raise Unavailable('BAD_SITE')
    request = urllib.request.Request(base + path, headers={
        'CF-Access-Client-Id': client_id, 'CF-Access-Client-Secret': secret, 'User-Agent': 'zero-streamlit/2'})
    try:
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=40) as response:
            body = response.read(MAX_BYTES + 1)
            gzipped = response.headers.get('Content-Encoding') == 'gzip'
        if len(body) > MAX_BYTES:
            raise ValueError
        data = json.loads(gzip.decompress(body) if gzipped else body)
    except Exception:
        raise Unavailable('SITE_UNREACHABLE') from None
    if not isinstance(data, dict):
        raise Unavailable('SITE_INVALID')
    return data


def _numeric(value):
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    return isinstance(value, str) and re.fullmatch(r'-?\d+(\.\d+)?([eE][-+]?\d+)?', value.strip() or 'x') is not None


def _blank(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if isinstance(value, (dict, list)):
                _blank(value)
            elif AMOUNT.search(key) and _numeric(value):
                node[key] = None
    elif isinstance(node, list):
        for item in node:
            _blank(item)


def _weighted(holdings):
    values = [h.get('market_value_krw') if isinstance(h, dict) else None for h in holdings]
    total = sum(float(v) for v in values if _numeric(v) and float(v) > 0)
    return [round(float(v) / total * 100, 2) if total and _numeric(v) and float(v) > 0 else None for v in values]


def mask_portfolio(raw):
    """Every account figure becomes null; each holding's value becomes its weight in percent (sum 100)."""
    data = copy.deepcopy(raw)
    summary = data.get('summary') or {}
    scope = summary.get('zero_portfolio') or {}
    lists = [data.get('holdings') or [], scope.get('holdings') or []]
    weights = [_weighted(rows) for rows in lists]
    _blank(data)
    data['history'] = []
    for rows, row_weights in zip(lists, weights):
        for row, weight in zip(rows, row_weights):
            if isinstance(row, dict):
                row['market_value_krw'] = weight
    if isinstance(summary, dict) and weights[0]:
        summary['holdings_value_krw'] = round(sum(w for w in weights[0] if w), 2)
    if isinstance(scope, dict) and weights[1]:
        scope['holdings_value_krw'] = round(sum(w for w in weights[1] if w), 2)
    context = data.get('context') or {}
    if isinstance(context, dict):
        context['public_view'] = 'ACCOUNT_FIGURES_PRIVATE_WEIGHTS_ONLY'
    return data


def public_office(raw):
    data = copy.deepcopy(raw)
    data['jobs'] = []  # owner requests stay private
    data['state'] = 'EMPTY'
    return data


def _upstream(path, query):
    """Map an allowed public request to (upstream path, cache seconds, transform) or raise."""
    if path in PLAIN and not query:
        transform = {'/api/portfolio': mask_portfolio, '/api/office': public_office}.get(path)
        return path, PLAIN[path], transform
    if path == '/api/team' and set(query) == {'event'} and EVENT.fullmatch(query['event']):
        return f"/api/team?event={query['event']}", 300, None
    if path == '/api/chart' and set(query) == {'identity', 'range'} and IDENTITY.fullmatch(query['identity']) and query['range'] in RANGES:
        return f"/api/chart?identity={quote(query['identity'], safe='')}&range={query['range']}", 900, None
    if path == '/api/company-news' and set(query) == {'identity'} and IDENTITY.fullmatch(query['identity']):
        return f"/api/company-news?identity={quote(query['identity'], safe='')}", 900, None
    raise Unavailable('NOT_PUBLIC')


def get_public(path, query):
    upstream, seconds, transform = _upstream(path, query)
    now = time.monotonic()
    with _lock:
        hit = _cache.get(upstream)
        if hit and hit[0] > now:
            return hit[1]
    data = fetch(upstream)
    body = json.dumps(transform(data) if transform else data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with _lock:
        if len(_cache) > 400:
            _cache.clear()
        _cache[upstream] = (now + seconds, body)
    return body


async def api(request):
    path = '/api/' + request.path_params['path']
    if request.method != 'GET' or path == '/api/live-quotes':
        return JSONResponse({'error': 'PUBLIC_READ_ONLY'}, status_code=403)
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


async def to_ui(request):
    return RedirectResponse('zero/', status_code=307)


routes = [
    Route('/zero/api/{path:path}', api, methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    Route('/zero', to_ui),
    Mount('/zero', app=StaticFiles(directory=UI, html=True)),
]
