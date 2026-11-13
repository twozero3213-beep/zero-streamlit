"""분쟁 레이더: 합성 RSS로 파싱·분류·점수·실패 처리를 검사한다(네트워크 없음)."""
from datetime import datetime, timezone
import unittest

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
        self.assertEqual(rows['사아자']['level'], '신호 겹침', '경영권 소송만 있어도 신호 겹침 아래로 두지 않는다')
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
        self.assertEqual(row['level'], '분쟁 확인')
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
        self.assertEqual(zinc['level'], '분쟁 확인', '경영권 소송과 판결 공시가 함께 있으면 분쟁 확인')
        points = {s['trigger']: s['points'] for s in zinc['signals']}
        self.assertEqual(points, {'RULING': 35, 'CONTROL_SUIT': 0}, '정정 공시는 새 소송으로 세지 않고, 경영권 소송의 판결은 35점')
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
        self.assertEqual((status, body['state'], body['failed']), (200, 'AVAILABLE', len(radar.WATCH)))
        self.assertEqual(body['companies'][0]['score'], 50)
        self.assertIs(body['orders_authorized'], False)
        self.assertIn({'name': '고려아연', 'stock_code': '010130'}, body['watch'])
        status, body = radar.build(fetch=lambda url: (_ for _ in ()).throw(OSError()), now=NOW)
        self.assertEqual((status, body['state']), (503, 'UNAVAILABLE'))


if __name__ == '__main__':
    unittest.main()
