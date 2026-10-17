"""Bounded keyless public macro observations; no accounts, orders or model authority."""
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
import csv
import io
import json
import re
from urllib.parse import parse_qs, urlencode, urlsplit
from zoneinfo import ZoneInfo

BLS_URL = 'https://api.bls.gov/publicAPI/v1/timeseries/data/'
FRED_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv'
BOARD_URL = 'https://mods.go.kr/board.es'
CALENDAR_URL = 'https://mods.go.kr/newsPln.es'
MAX_BYTES = 2_000_000
_BLS_IDS = ('CES0000000001', 'LNS14000000', 'CUUR0000SA0', 'WPUFD4', 'CES0500000003')
_FRED_IDS = ('PCEPI', 'INDPRO', 'A191RL1Q225SBEA')
_BOARDS = {'210': 'a10301030100', '213': 'a10301040200', '216': 'a10301050100'}
_ERRORS = {'ENDPOINT_FORBIDDEN', 'HTTP_REDIRECT_BLOCKED', 'HTTP_RATE_LIMITED', 'HTTP_STATUS_ERROR',
           'RESPONSE_TOO_LARGE', 'NETWORK_ERROR', 'PROVIDER_SCHEMA_INVALID', 'TRANSPORT_UNAVAILABLE'}


class PublicClient:
    def __init__(self, *, transport=None):
        self.transport = transport

    def read(self, url, *, params=None, payload=None):
        params = dict(params or {})
        if any(not isinstance(key, str) or not isinstance(value, str) for key, value in params.items()):
            raise ValueError('ENDPOINT_FORBIDDEN')
        parsed = urlsplit(url)
        allowed = parsed.scheme == 'https' and not (parsed.query or parsed.fragment or parsed.username or parsed.password)
        if url == BLS_URL:
            allowed = allowed and not params and isinstance(payload, dict) and set(payload) == {'seriesid', 'startyear', 'endyear'}
            allowed = allowed and isinstance(payload.get('seriesid'), list) and bool(payload['seriesid']) and all(isinstance(value, str) for value in payload['seriesid']) and set(payload['seriesid']) <= set(_BLS_IDS)
            allowed = allowed and all(isinstance(payload.get(key), str) and re.fullmatch(r'\d{4}', payload[key]) for key in ('startyear', 'endyear'))
            allowed = allowed and 0 <= int(payload['endyear']) - int(payload['startyear']) <= 9
        elif url == FRED_URL:
            allowed = allowed and payload is None and set(params) == {'id'} and params['id'] in _FRED_IDS
        elif url == BOARD_URL:
            allowed = allowed and payload is None and params.get('mid') == _BOARDS.get(params.get('bid'))
            allowed = allowed and (set(params) == {'mid', 'bid'} or set(params) == {'mid', 'bid', 'act', 'list_no'} and params['act'] == 'view' and re.fullmatch(r'\d{1,10}', str(params['list_no'])))
        elif url == CALENDAR_URL:
            allowed = allowed and payload is None and params == {'mid': 'a10305000000', 'oa_mm': 'ALL'}
        else:
            allowed = allowed and payload is None and not params and bool(re.fullmatch(
                r'https://ecos\.bok\.or\.kr/api/StatisticSearch/sample/json/kr/1/10/404Y014/M/\d{6}/\d{6}/%2AAA', url))
        if not allowed:
            raise ValueError('ENDPOINT_FORBIDDEN')
        response = None
        try:
            if self.transport is None:
                try:
                    import requests
                except ImportError:
                    raise ValueError('TRANSPORT_UNAVAILABLE') from None
                self.transport = requests.Session()
                self.transport.trust_env = False  # Public requests must not discover netrc credentials.
            options = dict(timeout=10, allow_redirects=False, stream=True)
            response = (self.transport.post(url, json=payload, **options) if payload is not None else
                        self.transport.get(url, params=params, **options))
            if 300 <= response.status_code < 400:
                raise ValueError('HTTP_REDIRECT_BLOCKED')
            if response.status_code == 429:
                raise ValueError('HTTP_RATE_LIMITED')
            if response.status_code != 200:
                raise ValueError('HTTP_STATUS_ERROR')
            final = urlsplit(getattr(response, 'url', url))
            if final.scheme != 'https' or final.netloc != parsed.netloc or final.path != parsed.path:
                raise ValueError('HTTP_REDIRECT_BLOCKED')
            body = bytearray()
            for chunk in response.iter_content(chunk_size=65536):
                if not isinstance(chunk, bytes):
                    raise ValueError('NETWORK_ERROR')
                if len(body) + len(chunk) > MAX_BYTES:
                    raise ValueError('RESPONSE_TOO_LARGE')
                body.extend(chunk)
            return bytes(body)
        except Exception as error:
            code = str(error) if type(error) is ValueError and str(error) in _ERRORS else 'NETWORK_ERROR'
            raise ValueError(code) from None
        finally:
            if response is not None:
                try:
                    response.close()
                except Exception:
                    pass


def _number(value):
    if not isinstance(value, str) or not value or len(value) > 80:
        raise ValueError('PROVIDER_SCHEMA_INVALID')
    try:
        result = Decimal(value)
    except InvalidOperation:
        raise ValueError('PROVIDER_SCHEMA_INVALID') from None
    if not result.is_finite() or abs(result.as_tuple().exponent) > 20 or result and abs(result.adjusted()) > 20:
        raise ValueError('PROVIDER_SCHEMA_INVALID')
    return result


def _text(value):
    return format(value, 'f')


def _ordinal(period):
    if re.fullmatch(r'\d{4}-\d{2}', period):
        year, month = map(int, period.split('-'))
        if not 1 <= month <= 12:
            raise ValueError('PROVIDER_SCHEMA_INVALID')
        return year * 12 + month - 1
    if re.fullmatch(r'\d{4}Q[1-4]', period):
        return int(period[:4]) * 4 + int(period[-1]) - 1
    raise ValueError('PROVIDER_SCHEMA_INVALID')


def _stats(history):
    # Lazy import avoids the desk's collector dependency becoming circular.
    from zero_statistics import descriptive_statistics
    return descriptive_statistics(history)


def _base(identity, name, country, unit, seasonal, basis, source, at, *, frequency='MONTHLY'):
    inflation = identity in ('US_CPI', 'US_PPI', 'US_PCE_INFLATION', 'US_WAGES', 'KR_CPI', 'KR_PPI')
    return dict(id=identity, name=name, country=country, unit=unit, frequency=frequency,
                seasonal_adjustment=seasonal, basis=basis, latest_period=None, latest_value=None,
                previous_value=None, history=[], statistics=_stats([]), source_url=source,
                retrieved_at=at.isoformat(), release_url=None, last_release_date=None,
                next_release_kst=None, explanation='과거 실제 관측 분포와 현재 값을 비교합니다. 높은 값이 항상 좋다는 뜻은 아닙니다.',
                above_range='물가·임금 압력이 높으면 구매력과 기업 비용, 통화정책 부담을 함께 봅니다.' if inflation else '고용·생산이 과거 분포보다 높아도 지속성과 비용, 물가 압력을 함께 확인합니다.',
                below_range='물가 압력이 낮아져도 수요 둔화 때문인지 확인합니다.' if inflation else '고용·생산 둔화인지 통계 변동인지 확인합니다. 실업률은 낮을수록 좋은 지표라는 방향 차이도 고려합니다.',
                limitations=['LATEST_REVISED_NOT_PIT', '관측기간과 실제 발표시각은 다릅니다. 분포는 투자 승인 기준이 아닙니다.'], status='UNAVAILABLE')


def _finish(row, pairs):
    pairs = sorted(pairs, key=lambda item: _ordinal(item[0]))
    if not pairs:
        row['limitations'].append('NO_OBSERVATIONS')
        return row
    count = 40 if row['frequency'] == 'QUARTERLY' else 120
    end = _ordinal(pairs[-1][0])
    pairs = [(period, value) for period, value in pairs if _ordinal(period) > end - count]
    row['history'] = [{'period': period, 'value': _text(value)} for period, value in pairs]
    row['latest_period'], row['latest_value'] = pairs[-1][0], _text(pairs[-1][1])
    row['previous_value'] = _text(pairs[-2][1]) if len(pairs) > 1 else None
    row['statistics'] = _stats(row['history'])
    if row['id'] in ('US_UNEMPLOYMENT', 'KR_UNEMPLOYMENT'):
        row['above_range'] = '과거 분포보다 높은 실업률은 노동시장 약화 가능성을 보여줍니다. 표본·계절조정·인구 기준 변화도 확인합니다.'
        row['below_range'] = '낮은 실업률은 고용 개선과 함께 인력 부족·임금 압력 가능성을 확인하는 자료입니다.'
    limited = _ordinal(pairs[0][0]) > end - count + 1
    row['status'] = 'PARTIAL' if limited else 'AVAILABLE'
    if limited:
        row['limitations'].append('LIMITED_HISTORY')
        row['explanation'] += f' 확보된 {len(pairs)}개 관측만 표시하며 10년 전체 자료로 부르지 않습니다.'
    elif len(pairs) < count:
        row['limitations'].append('MISSING_VALUES')
    return row


def _transform(pairs, kind):
    values = dict(pairs)
    output = []
    for period, value in sorted(values.items()):
        if kind == 'level':
            output.append((period, value))
            continue
        ordinal = _ordinal(period) - (12 if kind == 'yoy' else 1)
        previous = f'{ordinal // 12:04}-{ordinal % 12 + 1:02}'
        if previous in values and (kind != 'yoy' or values[previous] > 0):
            output.append((period, (value / values[previous] - 1) * 100 if kind == 'yoy' else value - values[previous]))
    return output


def _json(body):
    result = json.loads(body, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('PROVIDER_SCHEMA_INVALID')))
    if not isinstance(result, dict):
        raise ValueError('PROVIDER_SCHEMA_INVALID')
    return result


class _HTML(HTMLParser):
    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.parts, self.links, self.anchor, self.skip = [], [], None, 0
        self.feed(body.decode('utf-8-sig'))
        self.text = re.sub(r'\s+', ' ', ' '.join(self.parts))

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        if tag == 'a' and not self.skip:
            self.anchor = [dict(attrs).get('href', ''), []]

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
        if tag == 'a' and self.anchor:
            self.links.append((' '.join(self.anchor[1]), self.anchor[0]))
            self.anchor = None

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)
            if self.anchor:
                self.anchor[1].append(data.strip())


def _next_release(calendar, label, at):
    matches = re.finditer(r'(\d{1,2})\.(\d{1,2})\.\s*\([^)]{1,6}\)\s*(\d{2}):(\d{2})\s*(\d{4})년\s*(\d{1,2})월\s*' + re.escape(label), calendar)
    times = []
    for match in matches:
        month, day, hour, minute, report_year, report_month = map(int, match.groups())
        try:
            point = datetime(report_year + (month < report_month), month, day, hour, minute, tzinfo=ZoneInfo('Asia/Seoul'))
        except ValueError:
            continue
        if point > at:
            times.append(point)
    return min(times).isoformat() if times else None


def _release(client, bid, label, at):
    mid = _BOARDS[bid]
    listing = _HTML(client.read(BOARD_URL, params={'mid': mid, 'bid': bid}))
    for title, href in listing.links:
        if label not in title or '파일' in title or not re.search(r'\d{2,4}년\s*\d{1,2}월', title):
            continue
        wrapped = re.fullmatch(r"javascript:addSearchParam\('([^']+)'\);?", href)
        relative = wrapped.group(1) if wrapped else href
        path = urlsplit(relative)
        if path.scheme or path.netloc or path.path != '/board.es' or path.fragment:
            continue
        params = parse_qs(path.query)
        if any(len(value) != 1 for value in params.values()):
            continue
        values = {key: value[0] for key, value in params.items()}
        if values.get('bid') != bid or values.get('mid') != mid or values.get('act') != 'view' or not re.fullmatch(r'\d{1,10}', values.get('list_no', '')):
            continue
        allowed = {'mid': mid, 'bid': bid, 'act': 'view', 'list_no': values['list_no']}
        page = _HTML(client.read(BOARD_URL, params=allowed)).text
        header = re.search(r'(\d{2,4})년\s*(\d{1,2})월\s*' + re.escape(label), page)
        published = re.search(r'게시일\s*(\d{4}-\d{2}-\d{2})', page)
        if not header or not published:
            raise ValueError('PROVIDER_SCHEMA_INVALID')
        year, month = map(int, header.groups())
        year = year + 2000 if year < 100 else year
        period = f'{year:04}-{month:02}'
        local = at.astimezone(ZoneInfo('Asia/Seoul'))
        if _ordinal(period) > local.year * 12 + local.month - 1 or date.fromisoformat(published[1]) > local.date():
            raise ValueError('PROVIDER_SCHEMA_INVALID')
        return page, period, published[1], BOARD_URL + '?' + urlencode(allowed)
    raise ValueError('PROVIDER_SCHEMA_INVALID')


def _error(row, error):
    row['limitations'].append(str(error) if type(error) is ValueError and str(error) in _ERRORS else 'PROVIDER_SCHEMA_INVALID')
    return row


def collect_macro(*, transport=None, now=None):
    """Return public normalized rows; callers retain prior good cache after failures."""
    from zero_research import read_bls
    at = now or datetime.now(timezone.utc)
    if not isinstance(at, datetime) or at.tzinfo is None or at.utcoffset() is None:
        raise ValueError('MACRO_TIME_INVALID')
    at = at.astimezone(timezone.utc)
    client = PublicClient(transport=transport)
    specs = [
        ('US_PAYROLL', '미국 비농업 고용 변화', '천명', 'SA', '전월 대비 고용 인원 변화', _BLS_IDS[0], 'mom'),
        ('US_UNEMPLOYMENT', '미국 실업률', '%', 'SA', '16세 이상 노동력의 U-3 실업률', _BLS_IDS[1], 'level'),
        ('US_CPI', '미국 소비자물가', '%', 'NSA', 'CPI-U 총지수 전년 동월 대비 변화율', _BLS_IDS[2], 'yoy'),
        ('US_PPI', '미국 생산자물가', '%', 'NSA', '최종수요 PPI 전년 동월 대비 변화율', _BLS_IDS[3], 'yoy'),
        ('US_WAGES', '미국 시간당 임금', '%', 'SA', '민간 전체 근로자 평균 시간당 임금 전년 동월 대비 변화율', _BLS_IDS[4], 'yoy')]
    raw = {sid: {} for sid in _BLS_IDS}
    bls_errors = []
    for start, end in ((at.year - 11, at.year - 2), (at.year - 1, at.year)):
        try:
            result = _json(read_bls(client, payload={'seriesid': list(_BLS_IDS), 'startyear': str(start), 'endyear': str(end)}))
            if result.get('status') != 'REQUEST_SUCCEEDED' or not isinstance(result.get('Results', {}).get('series'), list):
                raise ValueError('PROVIDER_SCHEMA_INVALID')
            for series in result['Results']['series']:
                sid = series['seriesID']
                if sid not in raw or not isinstance(series.get('data'), list) or len(series['data']) > 150:
                    raise ValueError('PROVIDER_SCHEMA_INVALID')
                for row in series['data']:
                    if row.get('period') == 'M13' or row.get('value') in ('-', '.'):
                        continue
                    if not re.fullmatch(r'\d{4}', row.get('year', '')) or not re.fullmatch(r'M(?:0[1-9]|1[0-2])', row.get('period', '')):
                        raise ValueError('PROVIDER_SCHEMA_INVALID')
                    year, month = int(row['year']), int(row['period'][1:])
                    if not start <= year <= end or (year, month) > (at.year, at.month):
                        continue
                    period = f'{year:04}-{month:02}'
                    if period in raw[sid]:
                        raise ValueError('PROVIDER_SCHEMA_INVALID')
                    raw[sid][period] = _number(row['value'])
        except Exception as error:
            bls_errors.append(str(error) if type(error) is ValueError and str(error) in _ERRORS else 'PROVIDER_SCHEMA_INVALID')
    output = []
    for identity, name, unit, seasonal, basis, sid, kind in specs:
        row = _base(identity, name, 'US', unit, seasonal, basis, BLS_URL, at)
        row['release_url'] = 'https://www.bls.gov/schedule/2026/home.htm'
        row['limitations'] += bls_errors
        _finish(row, _transform(list(raw[sid].items()), kind))
        if bls_errors and row['status'] == 'AVAILABLE':
            row['status'] = 'PARTIAL'
        output.append(row)
    for identity, name, sid in (('US_PCE_INFLATION', '미국 개인소비 물가', 'PCEPI'),
                                 ('US_INDUSTRIAL_PRODUCTION', '미국 산업생산', 'INDPRO'),
                                 ('US_REAL_GDP', '미국 실질 GDP 성장', 'A191RL1Q225SBEA')):
        quarterly = sid == 'A191RL1Q225SBEA'
        row = _base(identity, name, 'US', '%', 'SA', '전기 대비 연율 성장률' if quarterly else '계절조정 지수의 전년 동월 대비 변화율', FRED_URL + '?id=' + sid, at, frequency='QUARTERLY' if quarterly else 'MONTHLY')
        row['release_url'] = 'https://fred.stlouisfed.org/series/' + sid
        try:
            reader = csv.DictReader(io.StringIO(client.read(FRED_URL, params={'id': sid}).decode('utf-8-sig')))
            if reader.fieldnames != ['observation_date', sid]:
                raise ValueError('PROVIDER_SCHEMA_INVALID')
            pairs, seen = [], set()
            for index, record in enumerate(reader):
                if index >= 50000 or None in record:
                    raise ValueError('PROVIDER_SCHEMA_INVALID')
                observed = date.fromisoformat(record['observation_date'])
                if observed > at.date() or record[sid] in ('.', ''):
                    continue
                period = f'{observed.year}Q{(observed.month - 1) // 3 + 1}' if quarterly else observed.strftime('%Y-%m')
                if period in seen:
                    raise ValueError('PROVIDER_SCHEMA_INVALID')
                seen.add(period)
                pairs.append((period, _number(record[sid])))
            _finish(row, pairs if quarterly else _transform(pairs, 'yoy'))
        except Exception as error:
            _error(row, error)
        output.append(row)
    end = at.year * 12 + at.month - 1
    start = end - 9
    ecos = f'https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/10/404Y014/M/{start // 12:04}{start % 12 + 1:02}/{at.year:04}{at.month:02}/%2AAA'
    row = _base('KR_PPI', '한국 생산자물가 총지수', 'KR', '2020=100', 'UNVERIFIED', 'ECOS 기본분류 총지수의 실제 지수 수준', ecos, at)
    row['explanation'] = '생산자물가 지수 수준은 누적 물가와 기준 연도의 영향을 받습니다. 높은 지수 수준을 현재 상승률이나 투자 우위로 해석하지 않습니다.'
    row['above_range'] = '지수 수준이 과거 표본보다 높아도 현재 물가 압력은 전월·전년 상승률을 따로 확인해야 합니다.'
    row['below_range'] = '기준 연도와 누적 물가를 고려하며 제한된 최근 표본을 장기 정상 범위로 부르지 않습니다.'
    row['limitations'].append('공개 ECOS sample은 요청당 최대 10행입니다. 인증키로 전체 이력을 조회하지 않았습니다.')
    try:
        result = _json(client.read(ecos)).get('StatisticSearch', {})
        records = result.get('row')
        if not isinstance(records, list) or len(records) > 10:
            raise ValueError('PROVIDER_SCHEMA_INVALID')
        pairs, seen = [], set()
        for record in records:
            if record.get('STAT_CODE') != '404Y014' or record.get('ITEM_CODE1') != '*AA' or record.get('UNIT_NAME') != '2020=100' or not re.fullmatch(r'\d{6}', record.get('TIME', '')):
                raise ValueError('PROVIDER_SCHEMA_INVALID')
            period = record['TIME'][:4] + '-' + record['TIME'][4:]
            if _ordinal(period) > end or period in seen:
                raise ValueError('PROVIDER_SCHEMA_INVALID')
            seen.add(period)
            pairs.append((period, _number(record['DATA_VALUE'])))
        _finish(row, pairs)
    except Exception as error:
        _error(row, error)
    output.append(row)
    calendar = ''
    try:
        calendar = _HTML(client.read(CALENDAR_URL, params={'mid': 'a10305000000', 'oa_mm': 'ALL'})).text
    except Exception:
        pass
    korean = [('KR_EMPLOYMENT', '한국 취업자 수', '천명', '210', '고용동향', 'UNVERIFIED', r'취업자는\s*([\d,]+(?:\.\d+)?)\s*천명'),
              ('KR_UNEMPLOYMENT', '한국 계절조정 실업률', '%', '210', '고용동향', 'SA', r'계절조정\s*실업률은\s*([\d.]+)\s*%'),
              ('KR_CPI', '한국 소비자물가', '%', '213', '소비자물가동향', 'UNVERIFIED', r'소비자물가지수는.{0,100}?전년동월대비\s*([+-]?[\d.]+)\s*%[^.]{0,30}?(상승|하락)'),
              ('KR_INDUSTRIAL_PRODUCTION', '한국 광공업 생산 변화', '%', '216', '산업활동동향', 'UNVERIFIED', r'광공업\s*\(\s*([+-]?[\d.]+)\s*%\)')]
    pages = {}
    for identity, name, unit, bid, label, seasonal, pattern in korean:
        row = _base(identity, name, 'KR', unit, seasonal, '공식 월별 보도자료의 ' + ('전년 동월 대비 변화율' if identity == 'KR_CPI' else '전월 대비 변화율' if identity == 'KR_INDUSTRIAL_PRODUCTION' else '관측 수준'), BOARD_URL + '?' + urlencode({'mid': _BOARDS[bid], 'bid': bid}), at)
        try:
            if bid not in pages:
                pages[bid] = _release(client, bid, label, at)
            page, period, published, source = pages[bid]
            matched = re.search(pattern, page)
            if not matched:
                raise ValueError('PROVIDER_SCHEMA_INVALID')
            value = _number(matched[1].replace(',', ''))
            # Korean CPI text supplies a magnitude and direction separately.
            if identity == 'KR_CPI' and matched[2] == '하락':
                value = -abs(value)
            row['source_url'] = row['release_url'] = source
            row['last_release_date'] = published
            row['next_release_kst'] = _next_release(calendar, label, at)
            row['limitations'].append('KOSIS 무인증 전체 이력은 확인되지 않았습니다. 보도자료 최신 관측만 제공합니다.')
            _finish(row, [(period, value)])
        except Exception as error:
            _error(row, error)
        output.append(row)
    if transport is None and client.transport is not None:
        client.transport.close()
    return output
