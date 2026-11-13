"""지분·경영권 분쟁 레이더: DART 공개 RSS(키 없음)에서 분쟁 신호가 되는 공시를 골라 회사별로 점수를 매긴다.

자료: 오늘 접수된 전체 공시(todayRSS)와 지켜보는 회사의 최근 약 1주 공시(companyRSS). 둘 다 금융감독원 DART가
구독용으로 공개한 주소이고 robots.txt가 막지 않는다. 공시 원문은 읽지 않고 제목·제출인·접수 시각·링크만 쓴다.
점수 규칙은 고려아연·SM·한미·한진칼 사례 4건으로 맞춘 초안이다(검토자료/전략리서치-20261114/governance-radar.md).
투자 권유가 아니며 주문·계좌와 무관하다.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import re
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET

TODAY_URL = 'https://dart.fss.or.kr/api/todayRSS.xml'
COMPANY_URL = 'https://dart.fss.or.kr/api/companyRSS.xml?crpCd={code}'
RSS_LIMIT = 4 * 1024 * 1024
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
    ('TENDER', r'공개매수신고서', 50, 20, '공개매수: 정해진 값에 주식을 사겠다고 공개 제안했어요.'),
    ('TENDER_VIEW', r'공개매수에관한의견표명서', 30, 30, '공개매수에 대한 회사 의견이 나왔어요.'),
    ('MEETING_COURT', r'소집허가', 40, 40, '법원에 주주총회를 열게 해 달라고 신청했어요.'),
    ('CONTROL_SUIT', r'경영권분쟁', 35, 35, '경영권을 두고 소송이 걸렸어요.'),
    ('STAKE_ACTIVE', r'대량보유상황보고서\(일반\)', 35, 0, '5% 넘게 가진 주주가 경영권에 영향을 줄 수 있는 목적으로 보고했어요. 원문에서 누구 편인지 확인하세요.'),
    ('PROXY', r'의결권대리행사권유', 25, 0, '주주총회 표를 모으려고 위임장을 받기 시작했어요.'),
    ('RULING', r'소송등의판결', 15, 15, '소송의 판결이나 결정이 나왔어요. 결과는 원문에 있어요.'),
    ('CONTROL_CHANGE', r'최대주주변경', 30, 30, '최대주주가 바뀌거나 바뀌는 계약을 했어요.'),
    ('PROPOSAL', r'주주제안', 15, 15, '주주가 안건을 직접 냈어요.'),
    ('RUMOR', r'풍문또는보도에대한해명|조회공시', 10, 10, '보도나 소문에 대해 회사가 답했어요.'),
    ('NEW_SHARES', r'유상증자결정|전환사채권발행결정', 5, 5, '새 주식이나 전환사채를 발행해요. 분쟁 중이면 지분 구도가 바뀔 수 있어요.'),
    ('BUYBACK', r'자기주식취득', 5, 5, '회사가 자기 주식을 사요. 분쟁 중이면 방어 수단일 수 있어요.'),
)
# 매도·매수 신호처럼 읽히지 않게 '무엇이 보이는지'로 이름을 붙인다(2026-11-14 페르소나 검토).
LEVELS = ((90, '분쟁 확인'), (60, '신호 겹침'), (30, '지켜볼 신호'))
# 최대주주 쪽으로 널리 알려진 보고자. 이들의 5% 보고(일반)는 흔한 일이라 5점만 준다. 가족끼리 다투면 의미가 커질 수 있어 문구로 알린다.
# ponytail: 손으로 관리하는 명단이다. OpenDART 최대주주 현황(hyslrSttus)을 쓸 수 있게 되면 자동으로 바꾼다.
INSIDERS = {'한미사이언스': ('송영숙', '임주현', '임종윤', '임종훈'), '고려아연': ('최윤범',), '영풍': ('장형진',),
            '한진칼': ('조원태',), '금호석유화학': ('박찬구',), '한국앤컴퍼니': ('조현범',), '태광산업': ('이호진',)}
_CORRECTED = re.compile(r'^\[[^\]]*정정\]')
_TITLE = re.compile(r'^\((유가|코스닥|코넥스|기타)\)\s*(.+?)\s+-\s+(.+)$')
_RCP = re.compile(r'rcpNo=(\d{14})')
KST = timezone(timedelta(hours=9))
_cache = {'at': 0.0, 'body': None}
_lock = threading.Lock()


def _read(url, timeout):
    request = urllib.request.Request(url, headers={'User-Agent': 'ZERO-Governance-Radar/1.0', 'Accept': 'application/rss+xml, application/xml'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read(RSS_LIMIT + 1)
    if len(body) > RSS_LIMIT:
        raise ValueError('RSS_TOO_LARGE')
    return body


def _plain(name):
    return re.sub(r'\(주\)|주식회사|\s', '', name or '')


def parse(body):
    """RSS 바이트에서 공시 행 목록을 꺼낸다. 형식이 다른 항목은 버린다."""
    # RSS에는 DTD·엔티티가 필요 없다. 있으면 엔티티 폭탄 같은 공격일 수 있어 읽지 않는다.
    if b'<!DOCTYPE' in body[:4096].upper() or b'<!ENTITY' in body.upper():
        raise ValueError('RSS_DTD_REFUSED')
    items = []
    for node in ET.fromstring(body).iter('item'):
        title, link = (node.findtext('title') or '').strip(), node.findtext('link') or ''
        match, rcp = _TITLE.match(title), _RCP.search(link)
        try:
            at = parsedate_to_datetime(node.findtext('pubDate') or '').astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue
        if not match or not rcp:
            continue
        filer = (node.findtext('{http://purl.org/dc/elements/1.1/}creator') or '').strip()
        items.append({'market': match.group(1), 'company': match.group(2).strip(), 'report': match.group(3).strip(),
                      'filer': filer, 'at': at.isoformat(), 'rcp_no': rcp.group(1),
                      'url': 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=' + rcp.group(1)})
    return items


def classify(item):
    """분쟁 신호면 dict(코드, 점수, 설명, 제출인 구분, 정정 여부), 아니면 None.

    제출인 구분: company(회사 자신), insider(최대주주 쪽으로 알려진 사람), holder(그 밖의 주주).
    정정 공시는 새 사건이 아니라 이미 있는 사건의 증거라 점수를 주지 않는다. 경영권 소송 정정은 단계 판단에만 쓴다.
    """
    report = re.sub(r'\s', '', item['report'])
    filer = _plain(item['filer'])
    side = 'company' if not filer or filer == _plain(item['company']) else (
        'insider' if filer in INSIDERS.get(item['company'], ()) else 'holder')
    corrected = bool(_CORRECTED.match(report))
    for code, pattern, outside_points, own_points, label in TRIGGERS:
        if not re.search(pattern, report):
            continue
        points = own_points if side == 'company' else outside_points
        if side == 'insider' and code in ('STAKE_ACTIVE', 'PROXY'):
            points, label = 5, '최대주주 쪽으로 알려진 사람의 보고예요. 흔한 보고지만 가족끼리 다투는 중이면 의미가 커져요.'
        if corrected:
            points = 0
            label = '진행 중인 경영권 소송 공시를 고쳐 냈어요.' if code == 'CONTROL_SUIT' else '이미 낸 공시를 고쳐 냈어요. ' + label
        if not points and not (corrected and code == 'CONTROL_SUIT'):
            return None
        return {'trigger': code, 'points': points, 'label': label, 'side': side, 'corrected': corrected}
    return None


def _after_close(iso):
    # 한국 장(09:00~15:30) 밖에서 접수되면 다음 장에 반영된다는 뜻이라 따로 알린다.
    at = datetime.fromisoformat(iso).astimezone(KST)
    return at.weekday() >= 5 or not (9 * 60 <= at.hour * 60 + at.minute < 15 * 60 + 30)


def score(items, now=None):
    """회사별로 신호를 모아 점수·단계를 매긴다. 같은 접수번호는 한 번만 센다.

    단계는 점수로 정하되 다음은 점수와 상관없이 '분쟁 확인'으로 올린다: 경영권 소송 공시와 판결 공시가 함께 있음,
    회사 밖의 공개매수, 법원에 주총 소집 신청. 경영권 소송 정정 공시만 있어도 '신호 겹침' 아래로는 두지 않는다.
    """
    now = now or datetime.now(timezone.utc)
    stock_codes = {name: stock for name, _, stock in WATCH}
    seen, companies = set(), {}
    for item in sorted(items, key=lambda row: row['at'], reverse=True):
        if item['rcp_no'] in seen or (now - datetime.fromisoformat(item['at'])).days > WINDOW_DAYS:
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
        codes = {signal['trigger'] for signal in entry['signals']}
        if 'CONTROL_SUIT' in codes:
            for signal in entry['signals']:
                if signal['trigger'] == 'RULING' and not signal['corrected']:
                    signal['points'], signal['label'] = 35, '경영권 소송에서 법원 판단이 나왔어요. 누가 이겼는지는 원문에 있어요.'
        entry['score'] = sum(signal['points'] for signal in entry['signals'])
        step = sum(entry['score'] >= floor for floor in floors)
        confirmed = ({'CONTROL_SUIT', 'RULING'} <= codes or 'MEETING_COURT' in codes
                     or any(s['trigger'] == 'TENDER' and s['side'] != 'company' for s in entry['signals']))
        step = 3 if confirmed else max(step, 2 if 'CONTROL_SUIT' in codes else step)
        entry['step'] = step
        entry['level'] = LEVELS[3 - step][1] if step else '참고'
        entry['next_points'] = None if step == 3 else max(0, floors[2 - step] - entry['score'])
        rows.append(entry)
    return sorted(rows, key=lambda row: (-row['step'], -row['score'], row['company']))


def build(fetch=None, now=None):
    """(상태 코드, 응답). 일부 RSS가 실패해도 받은 것으로 만들고, 하나도 못 받으면 503."""
    fetch = fetch or (lambda url: _read(url, DEADLINE_SECONDS))
    urls = [TODAY_URL] + [COMPANY_URL.format(code=code) for _, code, _ in WATCH]
    items, failed = [], []
    with ThreadPoolExecutor(max_workers=4, thread_name_prefix='zero-radar') as pool:
        for url, result in zip(urls, pool.map(lambda url: _safe(fetch, url), urls)):
            if result is None:
                failed.append(url)
            else:
                items.extend(result)
    now = now or datetime.now(timezone.utc)
    base = {'schema_version': 1, 'scope': 'GOVERNANCE_RADAR', 'retrieved_at': now.isoformat(), 'window_days': WINDOW_DAYS,
            'source': 'DART 공개 RSS(오늘의 공시, 회사별 최근 공시)', 'watch': [{'name': name, 'stock_code': stock} for name, _, stock in WATCH],
            'levels': [{'floor': floor, 'name': name} for floor, name in LEVELS], 'failed': len(failed),
            'orders_authorized': False}
    if len(failed) == len(urls):
        return 503, {**base, 'state': 'UNAVAILABLE', 'companies': []}
    return 200, {**base, 'state': 'AVAILABLE', 'companies': score(items, now)}


def _safe(fetch, url):
    try:
        return parse(fetch(url))
    except (OSError, ValueError, ET.ParseError):
        return None


def get_governance_radar():
    """3분 캐시. 동시에 들어온 요청은 한 번만 만든다. 실패 응답은 캐시하지 않는다."""
    # ponytail: 만드는 동안(최대 약 9초) 다른 요청은 잠금을 기다린다. 요청이 많아지면 decade_reference처럼 Future로 나눈다.
    with _lock:
        if _cache['body'] is not None and time.time() - _cache['at'] < CACHE_SECONDS:
            return 200, _cache['body']
        status, body = build()
        if status == 200:
            _cache.update(at=time.time(), body=body)
        return status, body
