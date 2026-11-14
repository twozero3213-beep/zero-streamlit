"""분쟁 레이더: 합성 RSS로 파싱·분류·점수·실패 처리를 검사한다(네트워크 없음)."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import threading
from types import SimpleNamespace
import unittest
from unittest import mock

from zero import governance_radar as radar

NOW = datetime(2026, 11, 13, 9, 0, tzinfo=timezone.utc)


def rss(*items):
    rows = ''.join(
        f'<item><title>({market}){company} - {report}</title><link>https://dart.fss.or.kr/api/link.jsp?rcpNo={rcp}</link>'
        f'<pubDate>{day}</pubDate><dc:creator>{filer}</dc:creator></item>'
        for market, company, report, filer, rcp, day in items)
    return ('<?xml version="1.0" encoding="UTF-8"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>'
            + rows + '</channel></rss>').encode('utf-8')


DAY = 'Fri, 13 Nov 2026 08:03:00 GMT'


class GovernanceRadarTests(unittest.TestCase):
    def test_outside_filers_score_and_company_filings_do_not(self):
        items = radar.parse(rss(
            ('유가', '가나다', '주식등의대량보유상황보고서(일반)', '라마바파트너스', '20261113000001', DAY),
            ('유가', '가나다', '의결권대리행사권유참고서류', '라마바파트너스', '20261113000002', DAY),
            ('유가', '가나다', '의결권대리행사권유참고서류', '가나다', '20261113000003', DAY),
            ('유가', '가나다', '주식등의대량보유상황보고서(약식)', '큰자산운용', '20261113000004', DAY),
            ('코스닥', '사아자', '소송등의제기ㆍ신청(경영권분쟁소송)', '사아자', '20261113000005', DAY),
            ('유가', '가나다', '분기보고서 (2026.09)', '가나다', '20261113000006', DAY)))
        rows = {row['company']: row for row in radar.score(items, NOW)}
        self.assertEqual(rows['가나다']['score'], 35 + 25, '외부 5%(일반)와 외부 위임장만 센다')
        self.assertEqual(rows['가나다']['level'], '신호 겹침', '60점부터 신호 겹침')
        self.assertEqual([s['trigger'] for s in rows['가나다']['signals']], ['STAKE_ACTIVE', 'PROXY'])
        self.assertTrue(all(s['side'] == 'holder' for s in rows['가나다']['signals']))
        self.assertEqual(rows['사아자']['score'], 35, '회사가 낸 경영권분쟁소송 공시도 신호다')
        self.assertEqual(rows['사아자']['level'], '지켜볼 신호', '공시 제목만으로 분쟁 여부나 단계를 확정하지 않는다')
        self.assertEqual(radar.score(radar.parse(rss(('유가', '고려아연', '공개매수신고서', '영풍', '20261113000030', DAY))), NOW)[0]['related'],
                         [{'name': '영풍', 'stock_code': '000670'}], '분쟁 상대 회사를 함께 준다')
        self.assertEqual(rows['가나다']['signals'][0]['url'], 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261113000001')

    def test_levels_dedupe_and_window(self):
        old = 'Mon, 02 Nov 2026 08:00:00 GMT'
        items = radar.parse(rss(
            ('유가', '가나다', '공개매수신고서', '라마바', '20261113000010', DAY),
            ('유가', '가나다', '공개매수신고서', '라마바', '20261113000010', DAY),
            ('유가', '가나다', '소송등의제기ㆍ신청(임시주주총회소집허가신청)', '가나다', '20261113000011', DAY),
            ('유가', '가나다', '최대주주변경', '가나다', '20261102000012', old)))
        row = radar.score(items, NOW)[0]
        self.assertEqual(row['score'], 50 + 40, '같은 접수번호는 한 번, 8일 넘은 공시는 빼고 센다')
        self.assertEqual(row['level'], '신호 다수')
        self.assertIsNone(row['next_points'])

    def test_korea_zinc_pattern_corrections_rulings_and_insiders(self):
        # 2026-11-14 실제 공시: 경영권 소송 정정 공시와 판결 공시만 있었는데 '관찰 50점'으로 낮게 나왔다(페르소나 검토).
        evening = 'Fri, 13 Nov 2026 08:03:00 GMT'  # 한국 17:03, 장 마감 뒤
        items = radar.parse(rss(
            ('유가', '고려아연', '[기재정정]소송등의제기ㆍ신청(경영권분쟁소송)', '고려아연', '20261109800201', 'Mon, 09 Nov 2026 02:28:00 GMT'),
            ('유가', '고려아연', '소송등의판결ㆍ결정', '고려아연', '20261113801840', evening),
            ('유가', '한미사이언스', '주식등의대량보유상황보고서(일반)', '송영숙', '20261113000040', DAY)))
        rows = {row['company']: row for row in radar.score(items, NOW)}
        zinc = rows['고려아연']
        self.assertEqual(zinc['level'], '참고', '별개 판결과 소송 정정을 같은 사건의 분쟁 확인으로 연결하지 않는다')
        points = {s['trigger']: s['points'] for s in zinc['signals']}
        self.assertEqual(points, {'RULING': 15, 'CONTROL_SUIT': 0}, '정정은 새 사건이 아니고 판결 제목만으로 경영권 소송 판결인지 알 수 없다')
        self.assertTrue(next(s for s in zinc['signals'] if s['trigger'] == 'RULING')['after_close'])
        hanmi = rows['한미사이언스']
        self.assertEqual((hanmi['score'], hanmi['signals'][0]['side'], hanmi['level']), (5, 'insider', '참고'))
        self.assertEqual(hanmi['next_points'], 25)

    def test_bad_feeds_are_refused_and_partial_failure_still_answers(self):
        with self.assertRaises(ValueError):
            radar.parse(b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><rss><channel></channel></rss>')
        self.assertEqual(radar.parse(rss(('유가', '가나다', '분기보고서', '가나다', 'bad', DAY))), [], '접수번호 없는 항목은 버린다')
        good = rss(('유가', '가나다', '공개매수신고서', '라마바', '20261113000020', DAY))
        status, body = radar.build(fetch=lambda url: good if url == radar.TODAY_URL else (_ for _ in ()).throw(OSError()), now=NOW)
        self.assertEqual((status, body['state'], body['failed']), (200, 'PARTIAL', len(radar.WATCH)))
        self.assertEqual(body['companies'][0]['score'], 50)
        self.assertIs(body['orders_authorized'], False)
        self.assertIn({'name': '고려아연', 'stock_code': '010130'}, body['watch'])
        status, body = radar.build(fetch=lambda url: (_ for _ in ()).throw(OSError()), now=NOW)
        self.assertEqual((status, body['state']), (503, 'UNAVAILABLE'))

class GovernanceBoundaryTests(unittest.TestCase):
    def test_dates_links_and_empty_are_distinct_from_failed_coverage(self):
        future = (NOW + timedelta(seconds=1)).strftime('%a, %d %b %Y %H:%M:%S GMT')
        old = (NOW - timedelta(days=8, seconds=1)).strftime('%a, %d %b %Y %H:%M:%S GMT')
        for day in (future, old):
            self.assertEqual(radar.score(radar.parse(rss(('유가', '가나다', '공개매수신고서', '라마바', '20261113000010', day))), NOW), [])
        naive = rss(('유가', '가나다', '공개매수신고서', '라마바', '20261113000010', 'Fri, 13 Nov 2026 08:03:00'))
        self.assertEqual(radar.parse(naive), [])
        good = rss(('유가', '가나다', '공개매수신고서', '라마바', '20261113000010', DAY))
        self.assertEqual(radar.parse(good.replace(b'https://dart.fss.or.kr/api/link.jsp', b'https://other.example/api/link.jsp')), [])
        with self.assertRaises(ValueError):
            radar.parse(b' ' * 5000 + b'<!DOCTYPE rss><rss><channel/></rss>')
        with self.assertRaises(ValueError):
            radar.parse(b'x' * (radar.RSS_LIMIT + 1))
        status, body = radar.build(fetch=lambda url: rss(), now=NOW)
        self.assertEqual((status, body['state'], body['failed']), (200, 'EMPTY', 0))
        self.assertIn('50', body['coverage'])
        self.assertIn('5영업일', body['coverage'])
        self.assertIn('확률', body['score_note'])

    def test_corrected_withdrawn_and_missing_filer_are_not_active_dispute_proof(self):
        rows = radar.parse(rss(
            ('유가', '가나다', '공개매수신고서(철회)', '라마바', '20261113000010', DAY),
            ('유가', '가나다', '[기재정정]소송등의제기ㆍ신청(경영권분쟁소송)', '가나다', '20261113000011', DAY),
            ('유가', '가나다', '소송등의판결ㆍ결정', '가나다', '20261113000012', DAY),
            ('유가', '사아자', '주식등의대량보유상황보고서(일반)', '', '20261113000013', DAY)))
        value = {row['company']: row for row in radar.score(rows, NOW)}
        self.assertEqual(value['가나다']['score'], 15)
        self.assertEqual(value['가나다']['step'], 0)
        self.assertTrue(next(row for row in value['가나다']['signals'] if row['trigger'] == 'TENDER')['withdrawn'])
        signal = radar.classify(rows[3])
        self.assertEqual((signal['side'], signal['points']), ('unknown', 0))

    def test_shared_transport_receives_absolute_deadline_and_rss_limit(self):
        from zero import realtime_stock_quote as quote
        with mock.patch.object(quote, '_read_body', return_value=rss()) as read, mock.patch.object(quote, '_get_zero_env', side_effect=AssertionError('credential loader')):
            self.assertEqual(radar._read(radar.TODAY_URL, deadline=123), rss())
        self.assertEqual(read.call_args.args[0].full_url, radar.TODAY_URL)
        self.assertEqual(read.call_args.kwargs, {'deadline': 123, 'limit': radar.RSS_LIMIT})

    def test_stalled_fetches_return_at_common_deadline_without_queue_or_late_result(self):
        entered, release = threading.Event(), threading.Event()
        clock, calls, submitted = [100.0], [], [0]
        slots = threading.BoundedSemaphore(4)
        class StagePool(ThreadPoolExecutor):
            def submit(pool, function, url):
                future = super().submit(function, url)
                submitted[0] += 1
                if submitted[0] == 4:
                    if not entered.wait(2):
                        raise AssertionError('all four synthetic workers must be blocked')
                    clock[0] = 100.1
                return future
        def fetch(url):
            calls.append(url)
            if len(calls) == 4:
                entered.set()
            release.wait()
            return rss(('유가', '가나다', '공개매수신고서', '라마바', '20261113000010', DAY))
        pool = StagePool(max_workers=4)
        try:
            with mock.patch.multiple(radar, _rss_pool=pool, _rss_slots=slots), mock.patch.object(radar, 'time', SimpleNamespace(monotonic=lambda: clock[0])):
                status, body = radar.build(fetch=fetch, now=NOW, deadline=100.1)
                self.assertEqual((status, body['state']), (503, 'UNAVAILABLE'))
                self.assertEqual(len(calls), 4)
                other = mock.Mock(side_effect=AssertionError('saturated queue must not admit a request'))
                self.assertEqual(radar.build(fetch=other, now=NOW, deadline=101)[0], 503)
                other.assert_not_called()
                before = repr(body)
        finally:
            release.set()
            pool.shutdown(wait=True, cancel_futures=True)
        self.assertEqual(repr(body), before)
        acquired = [slots.acquire(blocking=False) for _ in range(5)]
        self.assertEqual(acquired, [True, True, True, True, False])
        for _ in range(4):
            slots.release()

    def test_singleflight_cache_failure_retry_and_late_cache_fence(self):
        entered, release, barrier = threading.Event(), threading.Event(), threading.Barrier(6)
        body = {'state': 'EMPTY', 'companies': []}
        clock = [100.0]
        def build(*, deadline):
            entered.set()
            if not release.wait(2):
                raise AssertionError('synthetic release')
            return 200, body
        def get():
            barrier.wait(2)
            return radar.get_governance_radar()
        with mock.patch.multiple(radar, _cache={'at': 0.0, 'body': None}, _pending=None), mock.patch.object(radar, 'time', SimpleNamespace(monotonic=lambda: clock[0])), mock.patch.object(radar, 'build', side_effect=build) as collect:
            with ThreadPoolExecutor(max_workers=6) as pool:
                jobs = [pool.submit(get) for _ in range(6)]
                try:
                    self.assertTrue(entered.wait(2))
                finally:
                    release.set()
                self.assertTrue(all(job.result(timeout=2) == (200, body) for job in jobs))
            self.assertEqual(collect.call_count, 1)
            self.assertEqual(radar.get_governance_radar(), (200, body))
        def late(*, deadline):
            clock[0] = deadline
            return 200, body
        with mock.patch.multiple(radar, _cache={'at': 0.0, 'body': None}, _pending=None), mock.patch.object(radar, 'time', SimpleNamespace(monotonic=lambda: clock[0])), mock.patch.object(radar, 'build', side_effect=late):
            radar.get_governance_radar()
            self.assertIsNone(radar._cache['body'])
        with mock.patch.multiple(radar, _cache={'at': 0.0, 'body': None}, _pending=None), mock.patch.object(radar, 'build', side_effect=[(503, {'state': 'UNAVAILABLE'}), (200, body)]) as collect:
            self.assertEqual(radar.get_governance_radar()[0], 503)
            self.assertEqual(radar.get_governance_radar(), (200, body))
            self.assertEqual(collect.call_count, 2)

    def test_completed_rss_survives_other_workers_reaching_the_deadline(self):
        release, entered = threading.Event(), threading.Event()
        clock, submitted, blocked = [100.0], [0], [0]
        slots = threading.BoundedSemaphore(4)
        good = rss(('유가', '가나다', '공개매수신고서', '라마바', '20261113000010', DAY))
        class StagePool(ThreadPoolExecutor):
            def submit(pool, function, url):
                future = super().submit(function, url)
                submitted[0] += 1
                if submitted[0] == 1:
                    future.result(timeout=2)
                if submitted[0] == 4:
                    if not entered.wait(2):
                        raise AssertionError('three synthetic requests must be blocked')
                    clock[0] = 100.1
                return future
        def fetch(url):
            if url == radar.TODAY_URL:
                return good
            blocked[0] += 1
            if blocked[0] == 3:
                entered.set()
            release.wait()
            return good
        pool = StagePool(max_workers=4)
        try:
            with mock.patch.multiple(radar, _rss_pool=pool, _rss_slots=slots), mock.patch.object(radar, 'time', SimpleNamespace(monotonic=lambda: clock[0])):
                actual_build = radar.build
                with mock.patch.multiple(radar, _cache={'at': 0.0, 'body': None}, _pending=None, DEADLINE_SECONDS=0.1), mock.patch.object(radar, 'build', side_effect=lambda *, deadline: actual_build(fetch=fetch, now=NOW, deadline=deadline)):
                    status, value = radar.get_governance_radar()
                    self.assertIsNone(radar._cache['body'], '마감 전 수확한 부분결과는 반환하되 마감 후 캐시는 쓰지 않는다')
                self.assertEqual((status, value['state'], value['failed']), (200, 'PARTIAL', len(radar.WATCH)))
                self.assertEqual(value['companies'][0]['score'], 50)
                before = repr(value)
        finally:
            release.set()
            pool.shutdown(wait=True, cancel_futures=True)
        self.assertEqual(repr(value), before)

    def test_waiter_deadline_does_not_start_another_build(self):
        entered, release, timeouts = threading.Event(), threading.Event(), []
        class TimedOutFuture(radar.Future):
            def result(pending, timeout=None):
                if timeout is None or not 0 <= timeout <= radar.DEADLINE_SECONDS:
                    raise AssertionError('waiter must have a finite original budget')
                timeouts.append(timeout)
                raise radar.FutureTimeout()
        def build(*, deadline):
            entered.set()
            release.wait()
            return 200, {'state': 'EMPTY', 'companies': []}
        with mock.patch.multiple(radar, _cache={'at': 0.0, 'body': None}, _pending=None, Future=TimedOutFuture), mock.patch.object(radar, 'build', side_effect=build) as collect:
            with ThreadPoolExecutor(max_workers=1) as pool:
                owner = pool.submit(radar.get_governance_radar)
                try:
                    self.assertTrue(entered.wait(2))
                    status, body = radar.get_governance_radar()
                    self.assertEqual((status, body['state']), (503, 'UNAVAILABLE'))
                    self.assertEqual(collect.call_count, 1)
                    self.assertEqual(len(timeouts), 1)
                finally:
                    release.set()
                self.assertEqual(owner.result(timeout=2)[0], 200)

    def test_feed_encoding_structure_count_and_text_bounds_fail_closed(self):
        unsafe = '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE rss [<!ENTITY x "unsafe">]><rss><channel/></rss>'
        for body in (unsafe.encode('utf-16'), b'<rss><channel/><channel/></rss>',
                     b'<rss><channel><wrapper><item/></wrapper></channel></rss>'):
            with self.subTest(body=body[:40]), self.assertRaises(ValueError):
                radar.parse(body)
        for company, report, filer in (('가' * 201, '공개매수신고서', '나'), ('가', '공개매수신고서' + '나' * 501, '나'), ('가', '공개매수신고서', '나' * 201)):
            with self.assertRaises(ValueError):
                radar.parse(rss(('유가', company, report, filer, '20261113000010', DAY)))
        with self.assertRaises(ValueError):
            radar.parse(rss(*[('유가', '가', '공개매수신고서', '나', '20261113000010', DAY)] * 101))


if __name__ == '__main__':
    unittest.main()
