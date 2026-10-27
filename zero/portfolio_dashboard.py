"""Loopback-only portfolio observations. No orders, notifications or scheduler."""
from __future__ import annotations

from copy import deepcopy
import argparse
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, localcontext
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
import json
import os
from pathlib import Path
import re
import threading

from zero.portfolio_benchmark import INVALID as BENCHMARK_INVALID, load_benchmark

REFRESH_SECONDS = 30
MAX_HOLDINGS = 200
MAX_HISTORY = 240
MAX_SNAPSHOT_BYTES = 1_000_000
_REPO = Path(__file__).resolve().parents[1]


def _timestamp(value):
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError('DASHBOARD_TIMESTAMP_INVALID')
    at = datetime.fromisoformat(value)
    if at.tzinfo is None or at.utcoffset() is None:
        raise ValueError('DASHBOARD_TIMESTAMP_INVALID')
    return at.astimezone(timezone.utc)


def _number(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 64:
        return None
    try:
        number = Decimal(value)
        if not number.is_finite() or number < 0 or abs(number.as_tuple().exponent) > 16 or number.adjusted() > 20:
            return None
        return number
    except InvalidOperation:
        return None


def _text(value):
    return format(value, 'f') if value is not None else None


def _default_collect(root, *, at):
    from zero.live_account import fetch_account
    return fetch_account(root, at=at)


def _default_fx(*, at):
    # Unlike paper._default_fx, retain the provider's actual observation timestamp.
    from zero.live_market import fetch_market
    return fetch_market([], at=at)


def _classes():
    try:
        manifest = json.loads(files('zero').joinpath('data/council_sources.json').read_text(encoding='utf-8'))
        return {(row['market'], row['symbol']): {'asset_class': row['asset_class'],
                'name': row['title'] if isinstance(row.get('title'), str) and len(row['title']) <= 200 else None}
                for row in manifest['sources'].values()
                if row.get('verified') is True and row.get('currency') in ('USD', 'KRW')
                and row.get('asset_class') in ('US_EQUITY', 'US_RESERVE', 'KR_EQUITY')}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def _normalize(account, fx, now):
    if not isinstance(account, dict) or account.get('mode') != 'KIS_MOCK':
        raise ValueError('DASHBOARD_ACCOUNT_INVALID')
    collected = _timestamp(account.get('collected_at'))
    if collected > now or now - collected > timedelta(minutes=5):
        raise ValueError('DASHBOARD_ACCOUNT_TIMESTAMP_INVALID')
    rows = account.get('holdings')
    if not isinstance(rows, list) or len(rows) > MAX_HOLDINGS:
        raise ValueError('DASHBOARD_HOLDINGS_INVALID')
    cash_input = account.get('cash', {})
    if not isinstance(cash_input, dict):
        raise ValueError('DASHBOARD_CASH_INVALID')
    connections = account.get('connections', {})
    connected = {market: isinstance(connections, dict) and connections.get(market) is True for market in ('KR', 'US')}
    complete = account.get('complete') is True and all(connected.values())
    rate, observed, retrieved = None, None, None
    try:
        record = fx['fx'][0]
        rate = _number(record['usd_krw'])
        observed, retrieved = _timestamp(record['observed_at']), _timestamp(fx['collected_at'])
        if (fx['connections']['fx'] is not True or record['source'] != 'ER_API_USD_KRW'
                or rate is None or rate <= 0 or not observed <= retrieved <= now
                or now - observed > timedelta(days=2)):
            raise ValueError()
    except (KeyError, IndexError, TypeError, ValueError):
        rate, observed, retrieved = None, None, None
    classifications = _classes()
    holdings, seen = [], set()
    sums = {'KRW': Decimal(0), 'USD': Decimal(0)}
    costs = {'KRW': Decimal(0), 'USD': Decimal(0)}
    counts = {'KRW': 0, 'USD': 0}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('DASHBOARD_HOLDING_INVALID')
        market, symbol, currency = row.get('market'), row.get('symbol'), row.get('currency')
        pattern = r'[0-9]{6}' if market == 'KR' else r'[A-Z0-9][A-Z0-9.-]{0,19}'
        qty = _number(row.get('quantity'))
        if (market not in ('US', 'KR') or currency != {'KR': 'KRW', 'US': 'USD'}[market]
                or not isinstance(symbol, str) or not re.fullmatch(pattern, symbol)
                or qty is None or (market, symbol) in seen):
            raise ValueError('DASHBOARD_HOLDING_INVALID')
        seen.add((market, symbol))
        if qty == 0:
            continue
        counts[currency] += 1
        price, average = _number(row.get('current_price')), _number(row.get('average_price'))
        if price is not None and price <= 0:
            price = None  # A provider's missing/zero quote cannot imply a total loss.
        value = qty * price if price is not None else None
        if value is None:
            sums[currency] = None
        elif sums[currency] is not None:
            sums[currency] += value
        pnl = (price - average) * qty if price is not None and average is not None and average > 0 else None
        percent = (price / average - 1) * 100 if pnl is not None else None
        if average is None or average <= 0:
            costs[currency] = None
        elif costs[currency] is not None:
            costs[currency] += qty * average
        holdings.append({'symbol': symbol, 'market': market, 'currency': currency,
                         'quantity': _text(qty), 'average_price': _text(average), 'current_price': _text(price),
                         'market_value': _text(value),
                         'market_value_krw': _text(value if currency == 'KRW' else value * rate if value is not None and rate is not None else None),
                         'reported_unrealized_pnl': None, 'computed_unrealized_pnl_native': _text(pnl),
                         'computed_unrealized_return_percent': _text(percent),
                         'pnl_basis': 'ESTIMATED_PRICE_ONLY_EXCLUDES_FEES_TAX_FX',
                         **classifications.get((market, symbol), {'asset_class': 'UNKNOWN', 'name': None})})
    totals = {}
    native_performance = {}
    for currency in ('KRW', 'USD'):
        cash = _number(cash_input.get(currency))
        total = sums[currency] + cash if sums[currency] is not None and cash is not None and complete else None
        totals[currency] = {'holdings_value': _text(sums[currency]), 'cash': _text(cash), 'total': _text(total)}
        available = (account.get('complete') is True and connected[{'KRW': 'KR', 'USD': 'US'}[currency]]
                     and counts[currency] > 0 and costs[currency] is not None and sums[currency] is not None)
        cost, value = (costs[currency], sums[currency]) if available else (None, None)
        native_performance[currency] = {'state': 'AVAILABLE' if available else 'UNAVAILABLE',
            'cost_basis': _text(cost), 'market_value': _text(value),
            'unrealized_pnl': _text(value - cost if available else None),
            'unrealized_return_percent': _text((value / cost - 1) * 100 if available else None)}
    performance_available = (complete and sum(counts.values()) > 0
                             and all(value is not None for value in (*costs.values(), *sums.values()))
                             and (counts['USD'] == 0 or rate is not None))
    cost_krw = value_krw = None
    if performance_available:
        # Convert both cost and value at today's FX: this cannot measure historical FX gains.
        cost_krw = costs['KRW'] + (costs['USD'] * rate if counts['USD'] else 0)
        value_krw = sums['KRW'] + (sums['USD'] * rate if counts['USD'] else 0)
    holdings_performance = {'state': 'AVAILABLE' if performance_available else 'UNAVAILABLE',
        'basis': 'OPEN_HOLDINGS_PRICE_ONLY_CURRENT_FX_REFERENCE',
        'denominator': 'HELD_POSITION_COST_EXCLUDES_CASH',
        'cost_basis_krw': _text(cost_krw), 'market_value_krw': _text(value_krw),
        'unrealized_pnl_krw': _text(value_krw - cost_krw if performance_available else None),
        'unrealized_return_percent': _text((value_krw / cost_krw - 1) * 100 if performance_available else None),
        'by_currency': native_performance,
        'excludes': ['REALIZED_PNL', 'DIVIDENDS', 'FEES', 'TAXES', 'HISTORICAL_FX_PNL']}
    usd_holdings_krw = (sums['USD'] * rate if sums['USD'] is not None and rate is not None
                        else Decimal(0) if counts['USD'] == 0 else None)
    holding_total = (sums['KRW'] + usd_holdings_krw
                     if complete and usd_holdings_krw is not None and sums['KRW'] is not None else None)
    market_percent = {'US': None, 'KR': None}
    if holding_total is not None and holding_total > 0:
        market_percent = {'US': _text(usd_holdings_krw / holding_total * 100),
                          'KR': _text(sums['KRW'] / holding_total * 100)}
    projected_input = account.get('cash_after_settlement', {})
    projected_cash = {key: _number(projected_input.get(key)) if isinstance(projected_input, dict) else None
                      for key in ('KRW', 'USD')}
    cash_available = (complete and holding_total is not None
                      and all(value is not None for value in projected_cash.values())
                      and (projected_cash['USD'] == 0 or rate is not None))
    cash_krw = (projected_cash['KRW'] + (projected_cash['USD'] * rate if projected_cash['USD'] else 0)
                if cash_available else None)
    observed_assets = {'state': 'AVAILABLE' if cash_available else 'UNAVAILABLE',
        'scope': 'OBSERVED_KR_US_ASSETS_NOT_ZERO_LEDGER',
        'basis': 'SETTLEMENT_ADJUSTED_CASH_PLUS_LISTED_HOLDINGS',
        'cash_krw': _text(cash_krw),
        'total_value_krw': _text(cash_krw + holding_total if cash_available else None),
        'cash_by_currency': {key: _text(value) for key, value in projected_cash.items()}}
    errors = ['CASH_SCOPE_UNVERIFIED', 'PERFORMANCE_HISTORY_UNAVAILABLE', 'COSTS_TAXES_UNKNOWN']
    if not complete:
        errors.append('ACCOUNT_SNAPSHOT_INCOMPLETE')
    if rate is None:
        errors.append('FX_UNAVAILABLE')
    if any(value is None for value in sums.values()):
        errors.append('HOLDING_PRICE_UNAVAILABLE')
    if any(value is None for value in costs.values()):
        errors.append('HOLDING_COST_UNAVAILABLE')
    result = {
        'schema_version': 1,
        'context': {'mode': 'KIS_MOCK', 'read_only': True, 'collected_at': collected.isoformat(),
                    'policy_capital_krw': '100000000', 'cash_scope_verified': False,
                    'valuation_basis': 'BROKER_CURRENT_PRICE_X_QUANTITY',
                    'cash_basis': 'DEPOSIT_BALANCE_NOT_BUYING_POWER',
                    'performance_basis': 'OBSERVED_SNAPSHOTS_ONLY', 'allocation_denominator': 'HOLDINGS_ONLY'},
        'summary': {'total_value_krw': None, 'holdings_value_krw': _text(holding_total), 'by_currency': totals,
                    'observed_assets': observed_assets,
                    'holdings_performance': holdings_performance,
                    'contributed_capital_krw': None, 'account_return_percent': None, 'zero_allocated_cash_krw': None,
                    'fx': {'usd_krw': _text(rate), 'observed_at': observed.isoformat() if observed else None,
                           'retrieved_at': retrieved.isoformat() if retrieved else None,
                           'source': 'ER_API_USD_KRW' if rate is not None else None},
                    'unrealized_pnl': None, 'costs': None, 'taxes': None},
        'holdings': holdings,
        'allocations': {'target_percent': {'us_equity': '64', 'us_reserve': '16', 'kr': '20'},
                        'observed_market_percent': market_percent, 'denominator': 'HOLDINGS_ONLY',
                        'classification': 'LISTING_MARKET_NOT_ECONOMIC_EXPOSURE',
                        'us_equity_percent': None, 'us_reserve_percent': None},
        'history': [], 'errors': errors,
        'system_status': {'state': 'READY' if complete and rate is not None and all(v is not None for v in sums.values()) else 'PARTIAL',
                          'connections': {**connected, 'fx': rate is not None}}}
    return result, complete


def _safe_path(out):
    path = Path(out).absolute()
    if path.resolve().is_relative_to(_REPO) or any(p.is_symlink() or p.is_junction() for p in (path, *path.parents)):
        raise ValueError('DASHBOARD_PRIVATE_PATH_INVALID')
    for name in ('snapshot.json', 'snapshot.tmp', 'benchmark.json'):
        if (path / name).is_symlink() or (path / name).is_junction():
            raise ValueError('DASHBOARD_PRIVATE_PATH_INVALID')
    return path


class DashboardStore:
    def __init__(self, legacy_root, *, out=None, collector=None, fx_collector=None, clock=None, manager_journal=None, meeting_root=None, research_root=None, desk_path=None, fund_root=None, etf_path=None, company_news_root=None, institution_path=None, office_root=None):
        self.legacy_root = Path(legacy_root)
        self.manager_journal = _safe_path(manager_journal) if manager_journal is not None else None
        self.meeting_root = _safe_path(meeting_root) if meeting_root is not None else None
        self.research_root = _safe_path(research_root) if research_root is not None else None
        self.desk_path = _safe_path(desk_path) if desk_path is not None else None
        self.fund_root = _safe_path(fund_root) if fund_root is not None else None
        self.etf_path = _safe_path(etf_path) if etf_path is not None else None
        self.company_news_root = _safe_path(company_news_root) if company_news_root is not None else None
        self.out = _safe_path(out or self.legacy_root / 'logs/new-zero/dashboard')
        self.collector, self.fx_collector = collector or _default_collect, fx_collector or _default_fx
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.institution_path = _safe_path(institution_path) if institution_path is not None else None
        from zero.office_queue import OfficeQueue
        self.office = OfficeQueue(office_root, clock=self.clock) if office_root is not None else None
        self.lock = threading.RLock()
        self.data = None
        self.last_attempt = self.last_success = None
        self.refreshing = False
        self.failed = False
        self.errors = []
        self._load()

    def _load(self):
        path = self.out / 'snapshot.json'
        if not path.exists():
            return
        try:
            if path.stat().st_size > MAX_SNAPSHOT_BYTES:
                raise ValueError()
            saved = json.loads(path.read_text(encoding='utf-8'))
            at = _timestamp(saved['account']['collected_at'])
            if at > self.clock():
                raise ValueError()
            # Rebuild from allowlisted inputs, never return a saved arbitrary dictionary.
            evaluated = at
            if saved.get('fx', {}).get('collected_at') is not None:
                evaluated = max(at, _timestamp(saved['fx']['collected_at']))
            if evaluated > self.clock():
                raise ValueError()
            with localcontext() as ctx:
                ctx.prec = 48
                data, complete = _normalize(saved['account'], saved['fx'], evaluated)
            if not complete:
                raise ValueError()
            history = []
            for row in saved.get('history', [])[-MAX_HISTORY:]:
                stamp = _timestamp(row['observed_at'])
                value = _number(row['holdings_value_krw'])
                if value is None or stamp > at or history and stamp <= _timestamp(history[-1]['observed_at']):
                    raise ValueError()
                history.append({'observed_at': stamp.isoformat(), 'total_value_krw': None,
                                'holdings_value_krw': _text(value)})
            data['history'] = history
            self.data, self.last_success, self.failed = data, at, True
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            self.errors = ['SAVED_SNAPSHOT_INVALID']

    def snapshot(self):
        with self.lock:
            now = self.clock()
            if self.data is None:
                data, _ = _normalize({'mode': 'KIS_MOCK', 'collected_at': now.isoformat(), 'holdings': [],
                                      'cash': {}, 'connections': {}, 'complete': False}, {}, now)
                data['context']['collected_at'] = None
                data['system_status']['state'] = 'EMPTY'
            else:
                data = deepcopy(self.data)
            stale = self.failed or self.last_success is not None and now - self.last_success >= timedelta(seconds=REFRESH_SECONDS)
            if stale and self.data is not None:
                data['system_status']['state'] = 'STALE'
            data['system_status'].update({'stale': bool(stale), 'refreshing': self.refreshing,
                'last_attempt_at': self.last_attempt.isoformat() if self.last_attempt else None,
                'last_success_at': self.last_success.isoformat() if self.last_success else None,
                'next_refresh_at': (self.last_attempt + timedelta(seconds=REFRESH_SECONDS)).isoformat() if self.last_attempt else None})
            data['errors'] = list(dict.fromkeys(data['errors'] + self.errors))
            try:
                data['benchmark'] = load_benchmark(_safe_path(self.out) / 'benchmark.json', now=now)
            except (OSError, ValueError):
                data['benchmark'] = dict(BENCHMARK_INVALID)
            from zero.portfolio_reference import load_reference
            # Reading the frozen budget reference grants no ownership/order authority.
            scope = load_reference(self.legacy_root, data)
            if scope['state'] == 'REFERENCE':
                observed = _timestamp(data['context']['collected_at'])
                account = {'mode':'KIS_MOCK','collected_at':observed.isoformat(),'complete':True,
                    'connections':{'KR':True,'US':True},'cash':{},
                    'holdings':[{k:None if row[k] is None else str(row[k]) for k in
                        ('symbol','market','currency','quantity','average_price','current_price')}
                        for row in scope['holdings']]}
                fx = data['summary']['fx']
                scoped, _ = _normalize(account, {'connections':{'fx':True},
                    'collected_at':fx['retrieved_at'],'fx':[fx]}, max(observed, _timestamp(fx['retrieved_at'])))
                # Reuse price-only cost/market aggregation; never its cash/NAV fields.
                scope['holdings_performance'] = scoped['summary']['holdings_performance']
                scope['allocations'] = scoped['allocations']
            data['summary']['zero_portfolio'] = scope
            return data

    def refresh(self):
        with self.lock:
            now = self.clock()
            if self.refreshing or self.last_attempt and now - self.last_attempt < timedelta(seconds=REFRESH_SECONDS):
                return 429
            self.last_attempt, self.refreshing = now, True
        try:
            account = self.collector(self.legacy_root, at=now)
            try:
                fx = self.fx_collector(at=now)
            except Exception:
                fx = {}
            # Collection timestamps may be later than request start.
            finished = self.clock()
            with localcontext() as ctx:
                ctx.prec = 48
                data, complete = _normalize(account, fx, finished)
            with self.lock:
                if not complete and self.data is not None:
                    raise ValueError('DASHBOARD_REFRESH_INCOMPLETE')
                history = deepcopy(self.data['history']) if self.data else []
                observed = data['context']['collected_at']
                if complete and data['summary']['holdings_value_krw'] is not None and (not history or observed > history[-1]['observed_at']):
                    history.append({'observed_at': observed, 'total_value_krw': None,
                                    'holdings_value_krw': data['summary']['holdings_value_krw']})
                data['history'] = history[-MAX_HISTORY:]
                self.data, self.failed, self.errors = data, False, []
                if complete:
                    self.last_success = _timestamp(observed)
                    try:
                        self._save(data)
                    except (OSError, ValueError):
                        self.errors = ['SNAPSHOT_SAVE_FAILED']
                return 200 if complete else 503
        except Exception:
            with self.lock:
                self.failed, self.errors = True, ['REFRESH_FAILED']
            return 503
        finally:
            with self.lock:
                self.refreshing = False

    def _save(self, data):
        _safe_path(self.out)
        summary = data['summary']
        account = {'mode': 'KIS_MOCK', 'collected_at': data['context']['collected_at'], 'complete': True,
                   'connections': {key: data['system_status']['connections'][key] for key in ('KR', 'US')},
                   'cash': {key: summary['by_currency'][key]['cash'] for key in ('KRW', 'USD')},
                   'cash_after_settlement': {key: summary['observed_assets']['cash_by_currency'][key] for key in ('KRW', 'USD')},
                   'holdings': [{key: row[key] for key in ('symbol', 'market', 'currency', 'quantity', 'average_price', 'current_price')} for row in data['holdings']]}
        rate = summary['fx']
        fx = {'connections': {'fx': rate['usd_krw'] is not None}, 'collected_at': rate['retrieved_at'],
              'fx': [{key: rate[key] for key in ('usd_krw', 'observed_at', 'source')}]}
        body = json.dumps({'account': account, 'fx': fx, 'history': data['history']}, ensure_ascii=False).encode('utf-8')
        if len(body) > MAX_SNAPSHOT_BYTES:
            raise ValueError('DASHBOARD_SNAPSHOT_TOO_LARGE')
        self.out.mkdir(parents=True, exist_ok=True)
        temporary = self.out / 'snapshot.tmp'
        temporary.write_bytes(body)
        os.replace(temporary, self.out / 'snapshot.json')


def _team(event='ONBOARDING', *, manager_journal=None, meeting_root=None, at=None):
    from zero.manager_journal import journal_status
    from zero.team_meeting import meeting_status
    from zero.virtual_advisors import ADVISER_IDS
    from zero.team_roster import by_head, assignment_plan, evidence_gap_report
    manifest = json.loads(files('zero').joinpath('data/adviser_principles.json').read_text(encoding='utf-8'))
    staff = by_head()
    roles = {}
    # One canonical roster prevents the dashboard from lagging behind the council.
    for identity in ADVISER_IDS:
        row = manifest['roles'][identity]
        roles[identity] = {key: row[key] for key in ('name', 'mandate', 'team_roles', 'team_jobs', 'requires', 'source_ids', 'fictional_role', 'fictional_background') if key in row}
        roles[identity]['support_staff'] = staff[identity]
    plan = assignment_plan(event)
    return {'schema_version': 1, 'scope': manifest['scope'], 'event': event, 'roles': roles,
            'operating_policy': plan['operating_policy'], 'work_orders': plan['tasks'],
            'company_policy': plan['company_policy'], 'evidence_report': evidence_gap_report(plan),
            'manager_learning': journal_status(manager_journal, at=at or datetime.now(timezone.utc)),
            'meeting_status': meeting_status(meeting_root, at=at or datetime.now(timezone.utc))}


def make_server(store, *, port=8765, finance_api=None):
    if type(port) is not int or not 0 <= port <= 65535:
        raise ValueError('DASHBOARD_PORT_INVALID')

    from zero.private_site import ASSETS
    assets = {**ASSETS, '/app.js': ASSETS['/assets/app.js'], '/styles.css': ASSETS['/assets/styles.css']}
    market_cards, market_card_lock = {}, threading.Lock()

    from zero.cosmetic_assets import build_assets, CATALOGUE_ROUTE
    try:
        public_cosmetics = build_assets()
    except (OSError, ValueError):
        public_cosmetics = None

    class Handler(BaseHTTPRequestHandler):
        server_version = 'ZERO'
        sys_version = ''

        def log_message(self, *args):
            pass

        def _reply(self, code, body, content_type='application/json; charset=utf-8'):
            if isinstance(body, dict):
                body = json.dumps(body, ensure_ascii=False).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            self.send_header('Connection', 'close')
            self.end_headers()
            self.close_connection = True
            self.wfile.write(body)

        def _allowed(self, refresh=False):
            host = f'127.0.0.1:{self.server.server_port}'
            origin = 'http://' + host
            origins = self.headers.get_all('Origin') or []
            if (self.headers.get_all('Host') != [host]
                    or origins and origins != [origin] or refresh and origins != [origin]
                    or self.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none')):
                self._reply(403, {'error': 'ORIGIN_FORBIDDEN'})
                return False
            return True

        def do_GET(self):
            if not self._allowed():
                return
            if self.path.startswith('/api/finance/'):
                if finance_api is None:
                    self._reply(503, {'error': 'FINANCE_UNCONFIGURED'})
                else:
                    code, body = finance_api.dispatch('GET', self.path, self.headers, None)
                    self._reply(code, body)
                return
            if self.path == '/api/office':
                from zero.office_queue import public_view
                self._reply(200, store.office.snapshot() if store.office else public_view(None, now=store.clock(), state='UNCONFIGURED'))
                return
            if self.path == '/api/institutions':
                from zero.institution_holdings import load_institutions
                self._reply(200, load_institutions(store.institution_path, at=store.clock()))
                return
            if self.path == '/api/analysis-feed':
                from zero.analysis_feed import get_feed
                self._reply(200, get_feed())
                return
            if self.path == '/api/portfolio':
                self._reply(200, store.snapshot())
                return
            if self.path == '/api/team' or self.path.startswith('/api/team?'):
                from zero.team_roster import EVENTS
                event = 'ONBOARDING'
                if self.path != '/api/team':
                    query = self.path[len('/api/team?'):]
                    if not query.startswith('event=') or query[6:] not in EVENTS:
                        self._reply(400, {'error': 'TEAM_EVENT_INVALID'})
                        return
                    event = query[6:]
                try:
                    self._reply(200, _team(event, manager_journal=store.manager_journal, meeting_root=store.meeting_root, at=store.clock()))
                except (OSError, ValueError, KeyError, TypeError):
                    self._reply(503, {'error': 'TEAM_UNAVAILABLE'})
                return
            if self.path == '/api/research':
                from zero.company_research import research_view
                self._reply(200, research_view(store.research_root, at=store.clock()))
                return
            if self.path == '/api/research/investors' or self.path.startswith('/api/research/investors?'):
                from zero.research_center import get_research_center
                from urllib.parse import parse_qsl, urlsplit
                center = get_research_center()
                parts = urlsplit(self.path)
                query_dict = dict(parse_qsl(parts.query))
                category = query_dict.get('category', 'ALL')
                search = query_dict.get('q', None)
                regime = query_dict.get('regime', 'SIDEWAYS')
                self._reply(200, center.get_investors_catalog(category=category, search_query=search, regime=regime))
                return
            if self.path == '/api/research/council' or self.path.startswith('/api/research/council?'):
                from zero.research_center import get_research_center
                from urllib.parse import parse_qsl, urlsplit
                center = get_research_center()
                parts = urlsplit(self.path)
                query_dict = dict(parse_qsl(parts.query))
                regime = query_dict.get('regime', 'SIDEWAYS')
                self._reply(200, center.get_council_deliberation(regime=regime))
                return
            if self.path == '/api/research/drl':
                from zero.distillation_rl import DistillationRLEngine
                from dataclasses import asdict
                drl = DistillationRLEngine()
                cp = drl.load_checkpoint()
                self._reply(200, asdict(cp))
                return
            if self.path == '/api/company-news' or self.path.startswith('/api/company-news?'):
                from zero.company_news import news_request, news_spec, load_news
                from zero.company_research import research_view
                try:
                    identity = news_request(self.path)
                    spec = news_spec(identity, research_view(store.research_root, at=store.clock()))
                except ValueError as error:
                    self._reply(400, {'error': str(error)})
                    return
                # Company-news navigation reads public saved metadata only, never a snapshot or desk.
                self._reply(200, load_news(store.company_news_root, spec, store.clock()))
                return
            if self.path == '/api/market-card' or self.path.startswith('/api/market-card?'):
                from urllib.parse import parse_qsl, urlsplit
                from zero.chart_api import chart_spec
                from zero.company_research import research_view
                import shutil
                import subprocess
                parts = urlsplit(self.path)
                pairs = parse_qsl(parts.query, keep_blank_values=True)
                if (parts.fragment or len(parts.query) > 100 or len(pairs) != 1 or pairs[0][0] != 'identity'
                        or not re.fullmatch(r'(US:[A-Z][A-Z0-9.-]{0,14}|KR:\d{6})', pairs[0][1])):
                    self._reply(400, {'error': 'MARKET_CARD_QUERY_INVALID'})
                    return
                identity = pairs[0][1]
                try:
                    spec = chart_spec(identity, research_view(store.research_root, at=store.clock()), store.snapshot())
                except (OSError, ValueError, KeyError, TypeError):
                    self._reply(404, {'error': 'MARKET_CARD_IDENTITY_UNKNOWN'})
                    return
                node = shutil.which('node')
                if node is None:
                    self._reply(503, {'error': 'MARKET_CARD_UNAVAILABLE'})
                    return
                if not market_card_lock.acquire(blocking=False):
                    self._reply(503, {'error': 'MARKET_CARD_BUSY'})
                    return
                try:
                    now = int(store.clock().timestamp() * 1000)
                    previous = market_cards.get(identity)
                    if previous and 0 <= now - previous['at'] < 60000:
                        self._reply(200, previous['card'])
                        return
                    # One JS parser serves the Worker and loopback route; stdin contains public metadata only.
                    script = ("import {pathToFileURL} from 'node:url';let text='';"
                              "for await(const chunk of process.stdin){text+=chunk;if(text.length>100000)throw Error();}"
                              "const x=JSON.parse(text),m=await import(pathToFileURL(process.argv[1]).href);"
                              "try{console.log(JSON.stringify(await m.collectMarketCard(x.spec,{now:x.now,previous:x.previous})));}"
                              "catch{console.log(JSON.stringify({error:'MARKET_CARD_UNAVAILABLE'}));process.exitCode=2;}")
                    result = subprocess.run([node, '--input-type=module', '-e', script,
                                             str(Path(__file__).parent / 'web' / 'market-data.mjs')],
                                            input=json.dumps({'spec': spec, 'now': now, 'previous': previous['card'] if previous else None}),
                                            capture_output=True, text=True, encoding='utf-8', timeout=12,
                                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
                                            env={key: os.environ[key] for key in ('SYSTEMROOT', 'WINDIR', 'PATH', 'TEMP', 'TMP') if key in os.environ})
                    card = json.loads(result.stdout)
                    if result.returncode != 0 or card.get('identity') != identity:
                        raise ValueError()
                    if identity not in market_cards and len(market_cards) >= 64:
                        del market_cards[next(iter(market_cards))]
                    market_cards[identity] = {'at': now, 'card': card}
                    self._reply(200, card)
                except (OSError, ValueError, TypeError, subprocess.TimeoutExpired):
                    self._reply(503, {'error': 'MARKET_CARD_UNAVAILABLE'})
                finally:
                    market_card_lock.release()
                return
            if self.path == '/api/chart' or self.path.startswith('/api/chart?'):
                from zero.chart_api import chart_request, chart_spec
                from zero.chart_history import get_chart
                from zero.company_research import research_view
                try:
                    identity, range_name = chart_request(self.path)
                    spec = chart_spec(identity, research_view(store.research_root, at=store.clock()), store.snapshot())
                except ValueError as error:
                    self._reply(400, {'error': str(error)})
                    return
                if store.desk_path is None:
                    self._reply(503, {'error': 'CHART_CACHE_UNAVAILABLE'})
                    return
                # A bounded public display cache; no broker refresh or strategy write.
                self._reply(200, get_chart(spec, range_name, Path(store.desk_path).parent / 'chart-cache', now=store.clock()))
                return
            if self.path == '/api/desk':
                from zero.research_desk import load_desk
                desk_data = load_desk(store.desk_path, at=store.clock())
                if not desk_data.get('macro'):
                    from zero.macro_indicators import VERIFIED_MACRO_ITEMS
                    desk_data['macro'] = VERIFIED_MACRO_ITEMS
                    if 'coverage' in desk_data:
                        desk_data['coverage']['macro_count'] = len(VERIFIED_MACRO_ITEMS)
                self._reply(200, desk_data)
                return
            if self.path == '/api/macro' or self.path.startswith('/api/macro?'):
                from zero.macro_indicators import get_macro_indicators
                from urllib.parse import parse_qsl, urlsplit
                parts = urlsplit(self.path)
                query_dict = dict(parse_qsl(parts.query))
                country = query_dict.get('country', 'ALL')
                search = query_dict.get('q', None)
                category = query_dict.get('category', 'ALL')
                self._reply(200, {'macro': get_macro_indicators(search=search, country=country, category=category)})
                return
            if self.path == '/api/market/debate':
                from zero.market_intelligence import generate_daily_council_debate
                from dataclasses import asdict
                debate = generate_daily_council_debate()
                self._reply(200, asdict(debate))
                return
            if self.path == '/api/market/recommendations':
                from zero.market_intelligence import get_daily_25_recommendations
                self._reply(200, get_daily_25_recommendations())
                return
            if self.path == '/api/market/chief-verdict' or self.path.startswith('/api/market/chief-verdict?'):
                from zero.market_intelligence import get_chief_director_verdict
                from dataclasses import asdict
                from urllib.parse import parse_qsl, urlsplit
                parts = urlsplit(self.path)
                query_dict = dict(parse_qsl(parts.query))
                asset = query_dict.get('target', 'MARKET_OVERALL')
                self._reply(200, asdict(get_chief_director_verdict(asset)))
                return
            if self.path == '/api/market/pulse':
                from zero.realtime_market_pulse import RealtimeMarketPulse
                self._reply(200, RealtimeMarketPulse.get_market_pulse_summary())
                return
            if self.path == '/api/market/morning-report' or self.path.startswith('/api/market/morning-report?'):
                from zero.morning_report import ModernMorningReportBuilder
                from urllib.parse import parse_qsl, urlsplit
                parts = urlsplit(self.path)
                query_dict = dict(parse_qsl(parts.query))
                builder = ModernMorningReportBuilder()
                data = builder.gather_data()
                if query_dict.get('format') == 'html':
                    html_content = builder.render_html(data).encode('utf-8')
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.send_header('Content-Length', str(len(html_content)))
                    self.end_headers()
                    self.wfile.write(html_content)
                    return
                elif query_dict.get('format') == 'markdown':
                    self._reply(200, {'markdown': builder.render_markdown(data)})
                    return
                self._reply(200, {'data': data, 'markdown': builder.render_markdown(data)})
                return
            if self.path == '/api/funds':
                from zero.fund_holdings import holdings_view
                self._reply(200, holdings_view(store.fund_root, at=store.clock()))
                return
            if self.path == '/api/tqqq':
                from zero.etf_benchmark import load_etf_benchmark
                original = store.snapshot().get('benchmark', {})
                start = original.get('start')
                anchor = start.get('recorded_at') if isinstance(start, dict) else None
                # A missing original start cannot silently turn the separate reference into an attested comparison.
                if original.get('state') != 'AVAILABLE' or _number(original.get('capital_krw')) != Decimal('100000000') or not anchor:
                    self._reply(200, {'state': 'UNAVAILABLE'})
                    return
                self._reply(200, load_etf_benchmark(store.etf_path, now=store.clock(), expected_recorded_at=anchor))
                return
            if self.path == '/api/trends':
                from zero.trend_filter import get_safe_trend_keyword, fallback_keywords
                now = store.clock()
                self._reply(200, {'schema_version': 1, 'items': [], 'source_url': None,
                                 'provider': 'SAFE_FALLBACK', 'state': 'UNAVAILABLE', 'fallback': True,
                                 'safe_keyword': get_safe_trend_keyword([], now=now),
                                 'safe_keywords': fallback_keywords(now), 'retrieved_at': now.isoformat()})
                return
            if public_cosmetics is not None and self.path in public_cosmetics:
                body, kind = public_cosmetics[self.path]
                self._reply(200, body, kind)
                return
            if self.path == CATALOGUE_ROUTE:
                self._reply(503, {'error': 'COSMETIC_CATALOGUE_UNAVAILABLE'})
                return
            if self.path not in assets:
                self._reply(404, {'error': 'NOT_FOUND'})
                return
            name, kind = assets[self.path]
            try:
                body = files('zero').joinpath('web', name).read_bytes()
                if name == 'index.html' and finance_api is not None:
                    body = body.replace(b'<meta name="zero-owner-finance-api" content="">',
                                        b'<meta name="zero-owner-finance-api" content="/api/finance">')
                if len(body) > 5_000_000:
                    raise ValueError()
            except (OSError, ValueError):
                self._reply(503, {'error': 'ASSET_UNAVAILABLE'})
                return
            self._reply(200, body, kind)

        def do_POST(self):
            if not self._allowed(refresh=True):
                return
            if self.path.startswith('/api/finance/'):
                if finance_api is None:
                    self._reply(503, {'error': 'FINANCE_UNCONFIGURED'})
                    return
                try:
                    lengths = self.headers.get_all('Content-Length')
                    if (self.headers.get_all('Transfer-Encoding') or lengths is None or len(lengths) != 1
                            or not lengths[0].isdigit() or not 0 < int(lengths[0]) <= 16384
                            or self.headers.get('Content-Type', '').split(';')[0] != 'application/json'
                            or len(self.headers.get_all('X-Zero-CSRF') or []) != 1):
                        raise ValueError()
                    self.connection.settimeout(5)
                    raw = self.rfile.read(int(lengths[0]))
                    if len(raw) != int(lengths[0]):
                        raise ValueError()
                    code, body = finance_api.dispatch('POST', self.path, self.headers, raw)
                    self._reply(code, body)
                except (OSError, ValueError):
                    self._reply(400, {'error': 'FINANCE_REQUEST_INVALID'})
                return
            if self.path == '/api/research/drl/train':
                from zero.research_center import get_research_center
                center = get_research_center()
                result = center.run_drl_self_learning_cycle()
                self._reply(200, result)
                return
            if self.path == '/api/research/consult-asset':
                from zero.market_intelligence import consult_investor_on_specific_asset
                try:
                    lengths = self.headers.get_all('Content-Length')
                    raw = self.rfile.read(int(lengths[0]))
                    data = json.loads(raw.decode('utf8'))
                    investor_id = data.get('investor_id', 'WARREN_BUFFETT')
                    asset = data.get('asset', 'NVDA')
                    question = data.get('question', '')
                    self._reply(200, consult_investor_on_specific_asset(investor_id, asset, question))
                except Exception as e:
                    self._reply(400, {'error': 'CONSULT_ASSET_FAILED', 'detail': str(e)})
                return
            if self.path == '/api/research/consult':
                from zero.research_center import get_research_center
                center = get_research_center()
                try:
                    lengths = self.headers.get_all('Content-Length')
                    raw = self.rfile.read(int(lengths[0]))
                    data = json.loads(raw.decode('utf8'))
                    investor_id = data.get('investor_id', 'WARREN_BUFFETT')
                    question = data.get('question', '')
                    regime = data.get('regime', 'SIDEWAYS')
                    self._reply(200, center.consult_investor(investor_id, question, regime))
                except Exception as e:
                    self._reply(400, {'error': 'CONSULT_FAILED', 'detail': str(e)})
                return
            if self.path == '/api/office/jobs':
                if store.office is None:
                    self._reply(503, {'error': 'OFFICE_QUEUE_UNAVAILABLE'})
                    return
                try:
                    lengths = self.headers.get_all('Content-Length')
                    if (self.headers.get_all('Transfer-Encoding') or lengths is None or len(lengths) != 1
                            or not lengths[0].isdigit() or not 0 < int(lengths[0]) <= 6000
                            or self.headers.get('Content-Type', '').split(';')[0] != 'application/json'):
                        raise ValueError('OFFICE_REQUEST_INVALID')
                    self.connection.settimeout(5)
                    raw = self.rfile.read(int(lengths[0]))
                    if len(raw) != int(lengths[0]):
                        raise ValueError('OFFICE_REQUEST_INVALID')
                    text = raw.decode('utf8')
                    data = json.loads(text)
                    # The same canonical request rule as hosted routes rejects duplicate keys.
                    if json.dumps(data, ensure_ascii=False, separators=(',', ':')) != text:
                        raise ValueError('OFFICE_REQUEST_INVALID')
                    self._reply(200, store.office.submit(data))
                except (OSError, UnicodeError, ValueError) as error:
                    code = str(error) if str(error) in ('OFFICE_REQUEST_INVALID', 'OFFICE_QUEUE_CONFLICT', 'OFFICE_QUEUE_FULL', 'OFFICE_QUEUE_INVALID', 'OFFICE_QUEUE_UNAVAILABLE') else 'OFFICE_REQUEST_INVALID'
                    self._reply(409 if code == 'OFFICE_QUEUE_CONFLICT' else 429 if code == 'OFFICE_QUEUE_FULL' else 503 if code == 'OFFICE_QUEUE_UNAVAILABLE' else 400, {'error': code})
                return
            if self.path != '/api/refresh':
                self._reply(404, {'error': 'NOT_FOUND'})
                return
            if self.headers.get_all('Transfer-Encoding') or self.headers.get_all('Content-Length') not in (None, ['0']):
                self._reply(400, {'error': 'BODY_FORBIDDEN'})
                return
            self._reply(store.refresh(), store.snapshot())

        def _unsupported(self):
            self._reply(405, {'error': 'METHOD_FORBIDDEN'})

        do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_HEAD = _unsupported

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    return server


def serve(legacy_root, *, out=None, port=8765, manager_journal=None, meeting_root=None, research_root=None, desk_path=None, fund_root=None, etf_path=None, company_news_root=None, institution_path=None, office_root=None):
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('DASHBOARD_PORT_INVALID')
    store = DashboardStore(legacy_root, out=out, manager_journal=manager_journal, meeting_root=meeting_root, research_root=research_root, desk_path=desk_path, fund_root=fund_root, etf_path=etf_path, company_news_root=company_news_root, institution_path=institution_path, office_root=office_root)
    with make_server(store, port=port) as server:
        server.serve_forever()


def main(argv=None):
    from zero.config import legacy_root
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--legacy-root', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--manager-journal', type=Path)
    parser.add_argument('--team-meetings', dest='meeting_root', type=Path)
    parser.add_argument('--company-research', dest='research_root', type=Path)
    parser.add_argument('--research-desk', dest='desk_path', type=Path)
    parser.add_argument('--fund-holdings', dest='fund_root', type=Path)
    parser.add_argument('--etf-benchmark', dest='etf_path', type=Path)
    parser.add_argument('--company-news', dest='company_news_root', type=Path)
    parser.add_argument('--institution-holdings', dest='institution_path', type=Path)
    parser.add_argument('--office-queue', dest='office_root', type=Path)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args(argv)
    try:
        serve(args.legacy_root or legacy_root(), out=args.out, port=args.port, manager_journal=args.manager_journal, meeting_root=args.meeting_root, research_root=args.research_root, desk_path=args.desk_path, fund_root=args.fund_root, etf_path=args.etf_path, company_news_root=args.company_news_root, institution_path=args.institution_path, office_root=args.office_root)
    except KeyboardInterrupt:
        return 0
    except (OSError, ValueError):
        print('DASHBOARD_START_FAILED')
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
