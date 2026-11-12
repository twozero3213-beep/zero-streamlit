# -*- coding: utf-8 -*-
"""Real-time Stock Quote Provider for ZERO.

Integrates:
1. Toss Securities Open API (openapi.tossinvest.com) - Primary for KR & US
2. Korea Investment & Securities mock Open API (openapivts.koreainvestment.com) - Secondary
3. Naver Finance Realtime Polling (polling.finance.naver.com) - 0-won real-time fallback for KR
4. Yahoo Finance Chart API - Fallback for US / Global

Features:
- In-memory thread-safe caching (TTL 15s for quotes, token renewal based on expires_in)
- Public deployment uses keyless Naver/Yahoo quotes without loading broker credentials
- Normalizes output format with market, currency, current_price, change, change_percent, timestamp
"""
import base64
from datetime import datetime, timezone
import json
import os
import re
import subprocess
import sys
import threading
import time
from urllib.parse import parse_qs, urlencode, urlsplit
import urllib.request
import urllib.error

# Regex patterns
RE_KR_CODE = re.compile(r"^\d{6}$")
RE_US_CODE = re.compile(r"^[A-Z][A-Z0-9.-]{0,14}$")
RE_IDENTITY = re.compile(r"^(KR:\d{6}|US:[A-Z][A-Z0-9.-]{0,14})$")

_STOCK_NAMES_KR = {
    "005930": "삼성전자",
    "000660": "SK하이닉스",
    "035420": "NAVER",
    "035720": "카카오",
    "005380": "현대차",
    "000270": "기아",
    "068270": "셀트리온",
    "005490": "POSCO홀딩스",
    "105560": "KB금융",
    "055550": "신한지주",
}

_STOCK_NAMES_US = {
    "NVDA": "NVIDIA",
    "AAPL": "Apple",
    "MSFT": "Microsoft",
    "GOOGL": "Alphabet A",
    "AMZN": "Amazon",
    "TSLA": "Tesla",
    "AVGO": "Broadcom",
    "SPY": "SPDR S&P 500 ETF",
    "QQQ": "Invesco QQQ",
    "BIL": "SPDR 1-3 Month T-Bill",
}

# Cache containers
_QUOTE_CACHE = {}  # symbol -> (quote_dict, expire_timestamp)
_TOSS_TOKEN_CACHE = {"token": None, "expires_at": 0}
_KIS_TOKEN_CACHE = {"token": None, "expires_at": 0}
_CACHE_LOCK = threading.Lock()
QUOTE_TTL_SECONDS = 15
MAX_QUOTE_BATCH = 30
MAX_QUOTE_CACHE = 512
QUOTE_DEADLINE_SECONDS = 8
PROVIDER_TIMEOUT_SECONDS = 2
MAX_QUOTE_HTTP_WORKERS = 8
MAX_QUOTE_BODY_BYTES = 1_000_000
_HTTP_SLOTS = threading.BoundedSemaphore(MAX_QUOTE_HTTP_WORKERS)
_HTTP_PENDING = []
_HTTP_LOCK = threading.Lock()

# A socket timeout cannot interrupt DNS or a body that keeps trickling bytes.
_QUOTE_HTTP_CHILD = """
import base64,json,sys,time,urllib.request
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None
try:
    spec=json.load(sys.stdin)
    end=time.monotonic()+spec['timeout']
    data=None if spec['data'] is None else base64.b64decode(spec['data'])
    req=urllib.request.Request(spec['url'],data=data,headers=spec['headers'],method=spec['method'])
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    with opener.open(req,timeout=spec['timeout']) as response:
        body=bytearray()
        while True:
            if time.monotonic()>=end: raise TimeoutError
            chunk=response.read1(min(65536,spec['limit']+1-len(body)))
            body.extend(chunk)
            if len(body)>spec['limit']: raise ValueError
            if not chunk: break
    sys.stdout.buffer.write(body)
except Exception:
    sys.exit(1)
"""


def _quote_deadline(deadline):
    return time.monotonic() + QUOTE_DEADLINE_SECONDS if deadline is None else deadline


def _reap_quote_http():
    with _HTTP_LOCK:
        for process in list(_HTTP_PENDING):
            if process.poll() is None:
                try:
                    process.kill()
                except OSError:
                    pass
            if process.poll() is not None:
                _HTTP_PENDING.remove(process)
                _HTTP_SLOTS.release()


def _read_json(request, *, deadline):
    end = min(deadline, time.monotonic() + PROVIDER_TIMEOUT_SECONDS)
    _reap_quote_http()
    if end <= time.monotonic() or not _HTTP_SLOTS.acquire(blocking=False):
        raise TimeoutError("QUOTE_DEADLINE")
    process = None
    try:
        payload = json.dumps({"url": request.full_url, "method": request.get_method(),
                              "headers": dict(request.header_items()),
                              "data": None if request.data is None else base64.b64encode(request.data).decode(),
                              "timeout": max(.001, end - time.monotonic()), "limit": MAX_QUOTE_BODY_BYTES}).encode()
        environment = {key: os.environ[key] for key in ("SYSTEMROOT", "WINDIR", "PATH", "TEMP", "TMP") if key in os.environ}
        process = subprocess.Popen([sys.executable, "-I", "-S", "-X", "utf8", "-c", _QUOTE_HTTP_CHILD],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   env=environment, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        remaining = end - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("QUOTE_DEADLINE")
        try:
            raw, _ = process.communicate(payload, timeout=remaining)
        except subprocess.TimeoutExpired:
            raise TimeoutError("QUOTE_DEADLINE") from None
        if time.monotonic() >= end:
            raise TimeoutError("QUOTE_DEADLINE")
        if process.returncode != 0 or len(raw) > MAX_QUOTE_BODY_BYTES:
            raise ValueError("QUOTE_SOURCE_INVALID")
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError("QUOTE_SOURCE_INVALID")
        if time.monotonic() >= end:
            raise TimeoutError("QUOTE_DEADLINE")
        return value
    finally:
        if process is not None and process.poll() is None:
            try:
                process.kill()
                process.communicate(timeout=.2)
            except (OSError, subprocess.TimeoutExpired):
                pass
        if process is None or process.poll() is not None:
            _HTTP_SLOTS.release()
        else:
            # A child still alive after cleanup retains its admission until a later reap.
            with _HTTP_LOCK:
                _HTTP_PENDING.append(process)


def _get_zero_env() -> dict:
    """The public deployment uses keyless quotes and never loads broker credentials."""
    return {}


def _clean_symbol(raw: str) -> tuple[str, str, str]:
    """Parse raw input into (clean_symbol, market, currency).

    e.g. 'KR:005930' -> ('005930', 'KR', 'KRW')
         '005930'    -> ('005930', 'KR', 'KRW')
         'US:NVDA'   -> ('NVDA', 'US', 'USD')
         'NVDA'      -> ('NVDA', 'US', 'USD')
    """
    if not isinstance(raw, str):
        raise ValueError("SYMBOL_INVALID")
    raw = raw.strip().upper()
    if raw.startswith("KR:") and RE_KR_CODE.fullmatch(raw[3:]):
        code = raw[3:]
        return code, "KR", "KRW"
    elif raw.startswith("US:") and RE_US_CODE.fullmatch(raw[3:]):
        code = raw[3:]
        return code, "US", "USD"
    elif RE_KR_CODE.fullmatch(raw):
        return raw, "KR", "KRW"
    elif RE_US_CODE.fullmatch(raw):
        return raw, "US", "USD"
    raise ValueError("SYMBOL_INVALID")


def _prune_quote_cache(now):
    """Call under _CACHE_LOCK; expired prices and old identities must not accumulate."""
    for code, (_, expires_at) in list(_QUOTE_CACHE.items()):
        if expires_at <= now:
            del _QUOTE_CACHE[code]
    while len(_QUOTE_CACHE) > MAX_QUOTE_CACHE:
        del _QUOTE_CACHE[next(iter(_QUOTE_CACHE))]


def _get_toss_token(env: dict, *, deadline=None) -> str | None:
    deadline = min(_quote_deadline(deadline), time.monotonic() + PROVIDER_TIMEOUT_SECONDS)
    app_key = env.get("TOSS_APP_KEY")
    secret = env.get("TOSS_SECRET_KEY")
    if not app_key or not secret:
        return None
    now = time.time()
    with _CACHE_LOCK:
        if _TOSS_TOKEN_CACHE["token"] and _TOSS_TOKEN_CACHE["expires_at"] > now + 30:
            return _TOSS_TOKEN_CACHE["token"]

    try:
        creds = base64.b64encode(f"{app_key}:{secret}".encode()).decode()
        req = urllib.request.Request(
            "https://openapi.tossinvest.com/oauth2/token",
            data=b"grant_type=client_credentials",
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "ZERO-Realtime-Quote/1.0",
            },
            method="POST",
        )
        data = _read_json(req, deadline=deadline)
        token = data.get("access_token")
        expires_in = int(data.get("expires_in", 3600))
        if token and time.monotonic() < deadline:
            with _CACHE_LOCK:
                if time.monotonic() >= deadline:
                    return None
                _TOSS_TOKEN_CACHE["token"] = token
                _TOSS_TOKEN_CACHE["expires_at"] = now + expires_in
            return token
    except Exception:
        pass
    return None


def _fetch_from_toss(symbols: list[str], env: dict, *, deadline=None) -> dict[str, dict]:
    """Fetch live prices for a batch of symbols from Toss Securities."""
    deadline = min(_quote_deadline(deadline), time.monotonic() + PROVIDER_TIMEOUT_SECONDS)
    token = _get_toss_token(env, deadline=deadline)
    if not token or not symbols:
        return {}

    results = {}
    try:
        query_syms = ",".join(symbols[:30])
        url = f"https://openapi.tossinvest.com/api/v1/prices?symbols={query_syms}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "User-Agent": "ZERO-Realtime-Quote/1.0",
            },
            method="GET",
        )
        data = _read_json(req, deadline=deadline)
        for item in data.get("result", []):
            sym = item.get("symbol")
            last_price_str = item.get("lastPrice")
            curr = item.get("currency", "KRW" if RE_KR_CODE.fullmatch(sym) else "USD")
            if sym and last_price_str is not None:
                try:
                    price = float(last_price_str)
                    market = "KR" if curr == "KRW" or RE_KR_CODE.fullmatch(sym) else "US"
                    results[sym] = {
                        "symbol": sym,
                        "identity": f"{market}:{sym}",
                        "name": _STOCK_NAMES_KR.get(sym) or _STOCK_NAMES_US.get(sym) or sym,
                        "market": market,
                        "currency": curr,
                        "current_price": price,
                        "market_time": item.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                        "source": "TOSS_SECURITIES",
                    }
                except ValueError:
                    continue
    except Exception:
        pass
    return results


def _fetch_from_naver_kr(code: str, *, deadline=None) -> dict | None:
    """Zero-won ultra-fast real-time quote for Korean domestic stocks."""
    deadline = min(_quote_deadline(deadline), time.monotonic() + PROVIDER_TIMEOUT_SECONDS)
    if not RE_KR_CODE.fullmatch(code):
        return None
    url = f"https://polling.finance.naver.com/api/realtime/domestic/stock/{code}"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            method="GET",
        )
        payload = _read_json(req, deadline=deadline)
        datas = payload.get("datas", [])
        if datas:
            d = datas[0]
            price_str = str(d.get("closePrice", "")).replace(",", "")
            prev_str = str(d.get("compareToPreviousClosePrice", "")).replace(",", "")
            rate_str = str(d.get("fluctuationsRatio", "")).replace(",", "")
            price = float(price_str) if price_str else None
            diff = float(prev_str) if prev_str else 0.0
            rate = float(rate_str) if rate_str else 0.0
            name = d.get("stockName") or _STOCK_NAMES_KR.get(code, code)
            if price is not None and price > 0:
                return {
                    "symbol": code,
                    "identity": f"KR:{code}",
                    "name": name,
                    "market": "KR",
                    "currency": "KRW",
                    "current_price": price,
                    "change": diff,
                    "change_percent": rate,
                    "previous_close": price - diff,
                    "market_time": datetime.now(timezone.utc).isoformat(),
                    "source": "NAVER_REALTIME",
                }
    except Exception:
        pass
    return None


def _get_kis_token(env: dict, *, deadline=None) -> tuple[str | None, str, str]:
    deadline = min(_quote_deadline(deadline), time.monotonic() + PROVIDER_TIMEOUT_SECONDS)
    now = time.time()
    # ZERO keeps KIS on the mock server only (docs/ai-collaboration.md), so real keys are never read here.
    base = "https://openapivts.koreainvestment.com:29443"
    app_key = env.get("KIS_MOCK_APP_KEY")
    app_secret = env.get("KIS_MOCK_APP_SECRET")
    if not app_key or not app_secret:
        return None, base, ""
    with _CACHE_LOCK:
        if _KIS_TOKEN_CACHE["token"] and _KIS_TOKEN_CACHE["expires_at"] > now + 60:
            return _KIS_TOKEN_CACHE["token"], base, app_key

    try:
        body = json.dumps({"grant_type": "client_credentials", "appkey": app_key, "appsecret": app_secret}).encode("utf-8")
        req = urllib.request.Request(
            f"{base}/oauth2/tokenP",
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "ZERO-KIS/1.0"},
            method="POST",
        )
        data = _read_json(req, deadline=deadline)
        token = data.get("access_token")
        expires_in = int(data.get("expires_in", 86400))
        if token and time.monotonic() < deadline:
            with _CACHE_LOCK:
                if time.monotonic() >= deadline:
                    return None, base, ""
                _KIS_TOKEN_CACHE["token"] = token
                _KIS_TOKEN_CACHE["expires_at"] = now + expires_in
            return token, base, app_key
    except Exception:
        pass
    return None, base, ""


def _fetch_from_kis_kr(code: str, env: dict, *, deadline=None) -> dict | None:
    deadline = min(_quote_deadline(deadline), time.monotonic() + PROVIDER_TIMEOUT_SECONDS)
    token, base_url, app_key = _get_kis_token(env, deadline=deadline)
    if not token or not RE_KR_CODE.fullmatch(code):
        return None
    try:
        url = f"{base_url}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD={code}"
        req = urllib.request.Request(
            url,
            headers={
                "content-type": "application/json",
                "authorization": f"Bearer {token}",
                "appkey": app_key,
                "appsecret": env.get("KIS_MOCK_APP_SECRET", ""),
                "tr_id": "FHKST01010100",
                "User-Agent": "ZERO-KIS/1.0",
            },
            method="GET",
        )
        data = _read_json(req, deadline=deadline)
        out = data.get("output", {})
        prpr = out.get("stck_prpr")
        if prpr:
            price = float(prpr)
            vrss = float(out.get("prdy_vrss", 0))
            ctrt = float(out.get("prdy_ctrt", 0))
            return {
                "symbol": code,
                "identity": f"KR:{code}",
                "name": _STOCK_NAMES_KR.get(code, code),
                "market": "KR",
                "currency": "KRW",
                "current_price": price,
                "change": vrss,
                "change_percent": ctrt,
                "previous_close": price - vrss,
                "market_time": datetime.now(timezone.utc).isoformat(),
                "source": "KIS_SECURITIES",
            }
    except Exception:
        pass
    return None


def _fetch_from_yahoo(symbol: str, market: str, currency: str, *, deadline=None) -> dict | None:
    """Yahoo Finance public chart quote."""
    deadline = min(_quote_deadline(deadline), time.monotonic() + PROVIDER_TIMEOUT_SECONDS)
    query_sym = symbol if market == "US" else f"{symbol}.KS"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{query_sym}?range=1d&interval=1d"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            method="GET",
        )
        payload = _read_json(req, deadline=deadline)
        meta = payload.get("chart", {}).get("result", [{}])[0].get("meta", {})
        price = meta.get("regularMarketPrice")
        prev = meta.get("chartPreviousClose")
        if price is not None and price > 0:
            diff = (price - prev) if prev else 0.0
            rate = (diff / prev * 100) if prev and prev > 0 else 0.0
            return {
                "symbol": symbol,
                "identity": f"{market}:{symbol}",
                "name": _STOCK_NAMES_KR.get(symbol) or _STOCK_NAMES_US.get(symbol) or symbol,
                "market": market,
                "currency": currency,
                "current_price": float(price),
                "change": round(diff, 2),
                "change_percent": round(rate, 2),
                "previous_close": float(prev) if prev else price,
                "market_time": datetime.now(timezone.utc).isoformat(),
                "source": "YAHOO_FINANCE",
            }
    except Exception:
        pass
    return None


def _fallback_quote(code, market, currency, env, deadline):
    quote = None
    if market == "KR" and time.monotonic() < deadline:
        quote = _fetch_from_kis_kr(code, env, deadline=deadline)
    if not quote and market == "KR" and time.monotonic() < deadline:
        quote = _fetch_from_naver_kr(code, deadline=deadline)
    if not quote and time.monotonic() < deadline:
        quote = _fetch_from_yahoo(code, market, currency, deadline=deadline)
    return quote


def fetch_stock_quote(raw_symbol: str, *, deadline=None) -> dict:
    """Fetch live quote with priority fallback:

    1. Toss Securities (KR & US)
    2. KIS Securities (KR)
    3. Naver Realtime Polling (KR)
    4. Yahoo Finance (Global fallback)
    """
    deadline = _quote_deadline(deadline)
    code, market, currency = _clean_symbol(raw_symbol)
    now = time.time()

    # Check cache
    with _CACHE_LOCK:
        _prune_quote_cache(now)
        cached = _QUOTE_CACHE.get(code)
        if cached and cached[1] > now:
            return cached[0]

    if time.monotonic() >= deadline:
        return None
    env = _get_zero_env()
    toss_res = _fetch_from_toss([code], env, deadline=deadline)
    quote = toss_res.get(code) or _fallback_quote(code, market, currency, env, deadline)

    # 변경: 모든 시세 소스가 실패하면 가짜 가격(OFFLINE_FALLBACK)을 만들지 않고 None을 돌려준다.
    # 이유: 지어낸 가격이 정상 시세처럼 화면·포트폴리오 재계산에 쓰이는 것을 막기 위함.
    if not quote or time.monotonic() >= deadline:
        return None

    with _CACHE_LOCK:
        if time.monotonic() >= deadline:
            return None
        _QUOTE_CACHE[code] = (quote, time.time() + QUOTE_TTL_SECONDS)
        _prune_quote_cache(now)

    return quote


def fetch_multiple_quotes(symbols: list[str], *, deadline=None) -> dict[str, dict]:
    """Fetch multiple quotes optimizing batch requests via Toss first."""
    if not isinstance(symbols, list) or len(symbols) > MAX_QUOTE_BATCH:
        raise ValueError("QUOTE_BATCH_LIMIT")
    parsed = list(dict.fromkeys(_clean_symbol(s) for s in symbols))

    deadline = _quote_deadline(deadline)
    now = time.time()
    results = {}
    missing_codes = []

    with _CACHE_LOCK:
        _prune_quote_cache(now)
        for code, market, curr in parsed:
            cached = _QUOTE_CACHE.get(code)
            if cached and cached[1] > now:
                results[code] = cached[0]
            else:
                missing_codes.append(code)

    if missing_codes and time.monotonic() < deadline:
        env = _get_zero_env()
        toss_res = _fetch_from_toss(missing_codes, env, deadline=deadline)
        with _CACHE_LOCK:
            for code in missing_codes:
                q = toss_res.get(code)
                if q and time.monotonic() < deadline:
                    _QUOTE_CACHE[code] = (q, now + QUOTE_TTL_SECONDS)
                    results[code] = q
            _prune_quote_cache(now)

        for code, market, curr in parsed:
            if code not in results:
                if time.monotonic() >= deadline:
                    break
                quote = _fallback_quote(code, market, curr, env, deadline)
                # 변경: 시세를 못 구한 종목은 결과에서 뺀다(가짜 값으로 채우지 않는다).
                if quote and time.monotonic() < deadline:
                    with _CACHE_LOCK:
                        if time.monotonic() >= deadline:
                            break
                        _QUOTE_CACHE[code] = (quote, time.time() + QUOTE_TTL_SECONDS)
                        _prune_quote_cache(time.time())
                    results[code] = quote

    return results


def get_quote_response(path_or_query: str, *, deadline=None) -> tuple[int, dict]:
    """HTTP router helper for /api/market/quote."""
    deadline = _quote_deadline(deadline)
    try:
        parsed = urlsplit(path_or_query)
        qs = parse_qs(parsed.query)
        symbols_param = qs.get("symbols", [""])[0]
        symbol_param = qs.get("symbol", [""])[0] or qs.get("identity", [""])[0]

        now_iso = datetime.now(timezone.utc).isoformat()
        if symbols_param:
            syms = [s.strip() for s in symbols_param.split(",")]
            quotes = fetch_multiple_quotes(syms, deadline=deadline)
            # 변경: 못 구한 종목은 missing으로 알려 화면이 '시세 없음'을 정직하게 보여 주게 한다.
            missing = []
            for s in syms:
                try:
                    code = _clean_symbol(s)[0]
                except ValueError:
                    code = s
                if code not in quotes:
                    missing.append(code)
            return 200, {"status": "OK", "quotes": quotes, "missing": missing, "timestamp": now_iso}
        # 변경: 기본 종목(삼성전자) 가정은 유지하되, 시세를 못 구하면 503으로 알린다.
        quote = fetch_stock_quote(symbol_param or "005930", deadline=deadline)
        if not quote:
            return 503, {"status": "UNAVAILABLE", "quote": None, "timestamp": now_iso}
        return 200, {"status": "OK", "quote": quote, "timestamp": now_iso}
    except ValueError as error:
        code = "QUOTE_BATCH_LIMIT" if error.args == ("QUOTE_BATCH_LIMIT",) else "SYMBOL_INVALID"
        return 400, {"status": "ERROR", "error": code}
    except Exception:
        return 400, {"status": "ERROR", "error": "QUOTE_REQUEST_INVALID"}


def get_live_quotes_endpoint(store=None, *, deadline=None) -> tuple[int, dict]:
    """Produce the standard /api/live-quotes payload used by the portfolio dashboard."""
    deadline = _quote_deadline(deadline)
    symbols = ['005930', '000660', '035420', 'NVDA', 'SPY', 'BIL']
    if store is not None:
        try:
            snap = store.snapshot() if hasattr(store, 'snapshot') else {}
            scope = ((snap.get('summary') or {}).get('zero_portfolio') or {})
            holdings = scope.get('holdings') or snap.get('holdings') or []
            for h in holdings:
                sym = h.get('symbol')
                if sym and sym not in symbols:
                    try:
                        _clean_symbol(sym)
                    except ValueError:
                        continue
                    symbols.append(sym)
        except Exception:
            pass

    quotes = {}
    for offset in range(0, len(symbols), MAX_QUOTE_BATCH):
        quotes.update(fetch_multiple_quotes(symbols[offset:offset + MAX_QUOTE_BATCH], deadline=deadline))
    now_iso = datetime.now(timezone.utc).isoformat()

    quote_rows = []
    for q in quotes.values():
        row = {
            'market': q['market'],
            'symbol': q['symbol'],
            'currency': q['currency'],
            'price': q['current_price'],
            'market_time': q.get('market_time', now_iso),
        }
        # 변경: 전일 종가를 모르면 현재가로 대신 채우지 않고 키를 뺀다.
        if q.get('previous_close') is not None:
            row['previous_close'] = q['previous_close']
        quote_rows.append(row)

    # 변경: 실제 시세가 하나도 없으면 AVAILABLE로 속이지 않고 503을 돌려준다.
    if not quote_rows:
        return 503, {'schema_version': 1, 'scope': 'PUBLIC_REALTIME_QUOTES', 'state': 'UNAVAILABLE',
                     'checked_at': now_iso, 'quotes': []}

    payload = {
        'schema_version': 1,
        'scope': 'PUBLIC_REALTIME_QUOTES',
        'basis': 'BROKER_AND_REALTIME_POLLING_PRICE',
        'state': 'AVAILABLE',
        'checked_at': now_iso,
        'quotes': quote_rows,
    }
    # 변경: SPY를 실제로 구했을 때만 벤치마크를 싣는다. 환율(fx)은 이 모듈에 실제 출처가 없어
    # 고정값(1400)을 넣지 않고 뺀다. 클라이언트(livePortfolio)는 fx가 없으면 저장된 화면을 유지한다.
    if 'SPY' in quotes:
        spy = quotes['SPY']
        payload['benchmarks'] = {'SP500': {'price': spy['current_price'], 'market_time': spy.get('market_time', now_iso)}}
    return 200, payload
