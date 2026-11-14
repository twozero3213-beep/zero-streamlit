"""지분·경영권 분쟁 레이더: DART 공개 RSS(키 없음)에서 분쟁 신호가 되는 공시를 골라 회사별로 점수를 매긴다.

자료: 최근 50개 공시(지분·펀드 제외, todayRSS)와 관찰회사의 최근 5영업일 공시(companyRSS). 둘 다 금융감독원 DART가
구독용으로 공개한 주소이고 robots.txt가 막지 않는다. 공시 원문은 읽지 않고 제목·제출인·접수 시각·링크만 쓴다.
점수 규칙은 고려아연·SM·한미·한진칼 사례 4건으로 맞춘 초안이다(검토자료/전략리서치-20261114/governance-radar.md).
투자 권유가 아니며 주문·계좌와 무관하다.
"""
from __future__ import annotations

from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, TimeoutError as FutureTimeout, wait
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import re
import threading
import time
import urllib.request
from urllib.parse import parse_qs, urlsplit
import xml.etree.ElementTree as ET

TODAY_URL = 'https://dart.fss.or.kr/api/todayRSS.xml'
COMPANY_URL = 'https://dart.fss.or.kr/api/companyRSS.xml?crpCd={code}'
RSS_LIMIT = 4 * 1024 * 1024
MAX_RSS_ITEMS = 100
CACHE_SECONDS = 180
DEADLINE_SECONDS = 9
WINDOW_DAYS = 8
# 최근 분쟁을 겪었거나 겪고 있는 회사. (이름, DART 고유번호, 종목코드). 고유번호는 공개 식별자다.
WATCH = (
    ('고려아연', '00102858', '010130'), ('영풍', '00141307', '000670'), ('한진칼', '00983040', '180640'),
    ('한미사이언스', '00161426', '008930'), ('한미약품', '00828497', '128940'), ('에스엠', '00260930', '041510'),
    ('하이브', '01204056', '352820'), ('금호석유화학', '00106368', '011780'), ('한국앤컴퍼니', '00160047', '000240'),
    ('남양유업', '00107598', '003920'), ('태광산업', '00153393', '003240'),
)
# 분쟁 상대처럼 함께 봐야 하는 회사(토스는 상대 종목에도 같은 뉴스를 붙인다. 검토자료 toss-rea.md).
RELATED = {'고려아연': ('영풍',), '영풍': ('고려아연',), '한미사이언스': ('한미약품',), '한미약품': ('한미사이언스',)}
# (코드, 보고서명 정규식, 외부 제출인일 때 점수, 회사 자신이 냈을 때 점수, 쉬운 설명)
TRIGGERS = (
    ('TENDER', r'공개매수(?:철회)?신고서', 50, 20, '공개매수 관련 신고서가 접수됐어요. 조건과 진행 여부는 원문에 있어요.'),
    ('TENDER_VIEW', r'공개매수에관한의견표명서', 30, 30, '공개매수에 대한 회사 의견이 나왔어요.'),
    ('MEETING_COURT', r'소집허가', 40, 40, '주주총회 소집 허가 관련 공시예요. 신청 내용과 결과는 원문에 있어요.'),
    ('CONTROL_SUIT', r'경영권분쟁', 35, 35, '공시 제목에 경영권분쟁이 표시돼 있어요. 진행 상황은 원문에 있어요.'),
    ('STAKE_ACTIVE', r'대량보유상황보고서\(일반\)', 35, 0, '대량보유 일반 보고가 접수됐어요. 보고 목적과 지분 변동은 원문에서 확인하세요.'),
    ('PROXY', r'의결권대리행사권유', 25, 0, '주주총회 표를 모으려고 위임장을 받기 시작했어요.'),
    ('RULING', r'소송등의판결', 15, 15, '소송의 판결이나 결정이 나왔어요. 결과는 원문에 있어요.'),
    ('CONTROL_CHANGE', r'최대주주변경', 30, 30, '최대주주가 바뀌거나 바뀌는 계약을 했어요.'),
    ('PROPOSAL', r'주주제안', 15, 15, '주주가 안건을 직접 냈어요.'),
    ('RUMOR', r'풍문또는보도에대한해명|조회공시', 10, 10, '보도나 소문에 대해 회사가 답했어요.'),
    ('NEW_SHARES', r'유상증자결정|전환사채권발행결정', 5, 5, '새 주식이나 전환사채를 발행해요. 분쟁 중이면 지분 구도가 바뀔 수 있어요.'),
    ('BUYBACK', r'자기주식취득', 5, 5, '회사가 자기 주식을 사요. 분쟁 중이면 방어 수단일 수 있어요.'),
)
# 매도·매수 신호처럼 읽히지 않게 '무엇이 보이는지'로 이름을 붙인다(2026-11-14 페르소나 검토).
LEVELS = ((90, '신호 다수'), (60, '신호 겹침'), (30, '지켜볼 신호'))
# 최대주주 쪽으로 널리 알려진 보고자. 이들의 5% 보고(일반)는 흔한 일이라 5점만 준다. 가족끼리 다투면 의미가 커질 수 있어 문구로 알린다.
# ponytail: 손으로 관리하는 명단이다. OpenDART 최대주주 현황(hyslrSttus)을 쓸 수 있게 되면 자동으로 바꾼다.
INSIDERS = {'한미사이언스': ('송영숙', '임주현', '임종윤', '임종훈'), '고려아연': ('최윤범',), '영풍': ('장형진',),
            '한진칼': ('조원태',), '금호석유화학': ('박찬구',), '한국앤컴퍼니': ('조현범',), '태광산업': ('이호진',)}
_CORRECTED = re.compile(r'^\[[^\]]*정정\]')
_TITLE = re.compile(r'^\((유가|코스닥|코넥스|기타)\)\s*(.+?)\s+-\s+(.+)$')
_RCP = re.compile(r'^\d{14}$')
KST = timezone(timedelta(hours=9))
_cache = {'at': 0.0, 'body': None}
_lock = threading.Lock()
_pending = None
_rss_slots = threading.BoundedSemaphore(4)
_rss_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='zero-radar')


def _read(url, *, deadline):
    from zero.realtime_stock_quote import _read_body
    request = urllib.request.Request(url, headers={'User-Agent': 'ZERO-Governance-Radar/1.0', 'Accept': 'application/rss+xml, application/xml'})
    return _read_body(request, deadline=deadline, limit=RSS_LIMIT)


def _plain(name):
    return re.sub(r'\(주\)|주식회사|\s', '', name or '')


def parse(body):
    """RSS 형식·DART 링크·명시된 시간대를 확인하고 공시 제목만 읽는다."""
    if not isinstance(body, bytes) or len(body) > RSS_LIMIT:
        raise ValueError('RSS_INVALID')
    text = body.decode('utf-8-sig')
    if '\x00' in text or '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
        raise ValueError('RSS_DTD_REFUSED')
    root = ET.fromstring(text)
    if root.tag != 'rss' or len(root) != 1 or root[0].tag != 'channel':
        raise ValueError('RSS_INVALID')
    nodes = root.findall('./channel/item')
    if nodes != root.findall('.//item') or len(nodes) > MAX_RSS_ITEMS:
        raise ValueError('RSS_INVALID')
    items = []
    for node in nodes:
        title, link = (node.findtext('title') or '').strip(), node.findtext('link') or ''
        match = _TITLE.match(title)
        try:
            source = urlsplit(link)
            query = parse_qs(source.query, keep_blank_values=True)
            rcp = query.get('rcpNo', [])
            if (source.scheme != 'https' or source.hostname != 'dart.fss.or.kr' or source.port not in (None, 443)
                    or source.username is not None or source.password is not None or source.fragment
                    or source.path not in ('/api/link.jsp', '/dsaf001/main.do') or set(query) != {'rcpNo'}
                    or len(rcp) != 1 or not _RCP.fullmatch(rcp[0])):
                continue
            at = parsedate_to_datetime(node.findtext('pubDate') or '')
            if at.tzinfo is None or at.utcoffset() is None:
                continue
            at = at.astimezone(timezone.utc)
        except (TypeError, ValueError, OverflowError):
            continue
        if not match:
            continue
        filer = (node.findtext('{http://purl.org/dc/elements/1.1/}creator') or '').strip()
        if len(match.group(2).strip()) > 200 or len(match.group(3).strip()) > 500 or len(filer) > 200:
            raise ValueError('RSS_INVALID')
        items.append({'market': match.group(1), 'company': match.group(2).strip(), 'report': match.group(3).strip(),
                      'filer': filer, 'at': at.isoformat(), 'rcp_no': rcp[0],
                      'url': 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=' + rcp[0]})
    return items


def classify(item):
    """제목에 명시된 공시 유형만 분류한다. 정정·철회는 새 사건으로 가산하지 않는다."""
    report = re.sub(r'\s', '', item['report'])
    filer = _plain(item['filer'])
    side = 'unknown' if not filer else 'company' if filer == _plain(item['company']) else (
        'insider' if filer in INSIDERS.get(item['company'], ()) else 'holder')
    corrected = bool(_CORRECTED.match(report))
    withdrawn = bool(re.search(r'^\[(?:철회|취소)\]|공개매수철회신고서|(?:\(|\[)(?:철회|취소|소취하)(?:\)|\])$', _CORRECTED.sub('', report, count=1)))
    for code, pattern, outside_points, own_points, label in TRIGGERS:
        if not re.search(pattern, report):
            continue
        points = own_points if side in ('company', 'unknown') else outside_points
        if side == 'insider' and code in ('STAKE_ACTIVE', 'PROXY'):
            points, label = 5, '최대주주 쪽으로 알려진 사람의 보고예요. 명단은 별도 확인이 필요해요.'
        if withdrawn:
            points, label = 0, '제목에 철회 또는 취소가 표시된 공시예요. 대상과 효력은 원문에서 확인하세요.'
        elif corrected:
            points, label = 0, '이미 낸 공시를 고쳐 냈어요. ' + label
        if not points and not (corrected or withdrawn or side == 'unknown'):
            return None
        return {'trigger': code, 'points': points, 'label': label, 'side': side, 'corrected': corrected, 'withdrawn': withdrawn}
    return None


def _after_close(iso):
    # 한국 장(09:00~15:30) 밖에서 접수되면 다음 장에 반영된다는 뜻이라 따로 알린다.
    at = datetime.fromisoformat(iso).astimezone(KST)
    return at.weekday() >= 5 or not (9 * 60 <= at.hour * 60 + at.minute < 15 * 60 + 30)


def score(items, now=None):
    """중복과 관측기간 밖 자료를 제외한다. 점수로 분쟁 여부나 별개 사건의 연결을 확정하지 않는다."""
    now = now or datetime.now(timezone.utc)
    stock_codes = {name: stock for name, _, stock in WATCH}
    seen, companies = set(), {}
    for item in sorted(items, key=lambda row: row['at'], reverse=True):
        try:
            at = datetime.fromisoformat(item['at'])
            if at.tzinfo is None or at.utcoffset() is None or not timedelta(0) <= now - at <= timedelta(days=WINDOW_DAYS):
                continue
        except (ValueError, TypeError, OverflowError):
            continue
        if item['rcp_no'] in seen:
            continue
        seen.add(item['rcp_no'])
        signal = classify(item)
        if not signal:
            continue
        entry = companies.setdefault(item['company'], {'company': item['company'], 'market': item['market'],
                                                       'stock_code': stock_codes.get(item['company']), 'signals': [],
                                                       'related': [{'name': name, 'stock_code': stock_codes.get(name)} for name in RELATED.get(item['company'], ())]})
        entry['signals'].append({'at': item['at'], 'report': item['report'], 'filer': item['filer'], 'after_close': _after_close(item['at']),
                                 'url': item['url'], **signal})
    floors = [floor for floor, _ in LEVELS]
    rows = []
    for entry in companies.values():
        entry['score'] = sum(signal['points'] for signal in entry['signals'])
        step = sum(entry['score'] >= floor for floor in floors)
        entry['step'] = step
        entry['level'] = LEVELS[3 - step][1] if step else '참고'
        entry['next_points'] = None if step == 3 else max(0, floors[2 - step] - entry['score'])
        rows.append(entry)
    return sorted(rows, key=lambda row: (-row['step'], -row['score'], row['company']))


def _response(items, failed, received, now):
    companies = score(items, now)
    state = 'UNAVAILABLE' if not received else 'PARTIAL' if failed else 'AVAILABLE' if companies else 'EMPTY'
    return (503 if not received else 200), {
        'schema_version': 1, 'scope': 'GOVERNANCE_RADAR', 'retrieved_at': now.isoformat(), 'window_days': WINDOW_DAYS,
        'source': 'DART 최근공시 RSS 및 관찰회사별 RSS',
        'coverage': '최근공시 RSS 최근 50건(지분·펀드 제외)과 관찰 ' + str(len(WATCH)) + '개 회사의 최근 5영업일 공시만 확인하며 전종목 전수조사가 아닙니다.',
        'score_note': '제목 기반 참고 점수이며 분쟁 발생 확률이나 투자 판단이 아닙니다.',
        'watch': [{'name': name, 'stock_code': stock} for name, _, stock in WATCH],
        'levels': [{'floor': floor, 'name': name} for floor, name in LEVELS],
        'failed': failed, 'orders_authorized': False, 'state': state, 'companies': companies
    }

def build(fetch=None, now=None, *, deadline=None):
    """9초의 공통 마감과 고정 4개 작업 안에서 받은 RSS만 반환한다."""
    deadline = time.monotonic() + DEADLINE_SECONDS if deadline is None else deadline
    fetch = fetch or (lambda url: _read(url, deadline=deadline))
    urls = [TODAY_URL] + [COMPANY_URL.format(code=code) for _, code, _ in WATCH]
    queued, pending, received = list(urls), {}, {}
    slots = _rss_slots
    def load(url):
        try:
            if time.monotonic() >= deadline:
                return None
            value = _safe(fetch, url)
            return value if time.monotonic() < deadline else None
        finally:
            slots.release()
    try:
        while queued or pending:
            while queued and len(pending) < 4 and time.monotonic() < deadline:
                if not slots.acquire(blocking=False):
                    break
                url = queued.pop(0)
                try:
                    future = _rss_pool.submit(load, url)
                except (RuntimeError, OSError):
                    slots.release()
                    raise
                future.add_done_callback(lambda done: slots.release() if done.cancelled() else None)
                pending[future] = url
            if not pending:
                break
            done, _ = wait(pending, timeout=max(0, deadline - time.monotonic()), return_when=FIRST_COMPLETED)
            if not done:
                break
            for future in done:
                received[pending.pop(future)] = future.result()
    finally:
        for future in pending:
            future.cancel()
    for future, url in pending.items():
        if future.done() and not future.cancelled():
            received[url] = future.result()
    successes = [rows for rows in received.values() if rows is not None]
    return _response([row for rows in successes for row in rows], len(urls) - len(successes), len(successes), now or datetime.now(timezone.utc))


def _safe(fetch, url):
    try:
        return parse(fetch(url))
    except (OSError, ValueError, ET.ParseError):
        return None


def get_governance_radar(*, deadline=None):
    """캐시는 3분, 같은 miss는 병합한다. 네트워크 작업 중에는 잠금을 잡지 않는다."""
    global _pending
    deadline = time.monotonic() + DEADLINE_SECONDS if deadline is None else min(deadline, time.monotonic() + DEADLINE_SECONDS)
    if time.monotonic() >= deadline:
        return _response([], len(WATCH) + 1, 0, datetime.now(timezone.utc))
    with _lock:
        age = time.monotonic() - _cache['at']
        if _cache['body'] is not None and 0 <= age < CACHE_SECONDS:
            return 200, _cache['body']
        waiting = _pending
        owner = waiting is None
        if owner:
            waiting = _pending = Future()
    if not owner:
        try:
            return waiting.result(timeout=max(0, deadline - time.monotonic()))
        except FutureTimeout:
            return _response([], len(WATCH) + 1, 0, datetime.now(timezone.utc))
    try:
        status, body = build(deadline=deadline)
        with _lock:
            if status == 200 and time.monotonic() < deadline:
                _cache.update(at=time.monotonic(), body=body)
        waiting.set_result((status, body))
        return status, body
    except Exception as error:
        waiting.set_exception(error)
        raise
    finally:
        with _lock:
            if _pending is waiting:
                _pending = None
