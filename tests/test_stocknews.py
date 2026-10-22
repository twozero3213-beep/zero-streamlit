"""Stock news guards: titles and links only, bad rows dropped, one failing list never hides the other, provider text never leaks."""
import asyncio
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import zero_proxy  # noqa: E402
import zero_stocknews  # noqa: E402
from starlette.requests import Request  # noqa: E402

NOW = datetime(2026, 10, 22, 14, 0, tzinfo=timezone.utc)


def call(method, path, query=b''):
    scope = {'type': 'http', 'method': method, 'path': '/zero/' + path, 'query_string': query, 'headers': [],
             'path_params': {'path': path.removeprefix('api/')}}
    return asyncio.run(zero_proxy.api(Request(scope)))


def story(office='053', article='0000062491', stamp='202610222322', title='제목', publisher='주간조선', **extra):
    return {'items': [{'officeId': office, 'articleId': article, 'datetime': stamp, 'titleFull': title, 'officeName': publisher, 'body': '본문은 복사하지 않는다', 'imageOriginLink': 'https://x/y.jpg', **extra}]}


NEWS = [story(), story(article='0000062491'), {'items': []}, story(office='5', article='1'), story(stamp='202613992322', article='0000000001'), story(title='', article='0000000002'),
        story(article='0000000003', title='<b>태그</b> 제목'), 'bad', story(stamp='202610210900', article='0000000004', publisher='연합뉴스')]
DISCLOSURES = [{'disclosureId': 1, 'title': '공시 제목', 'datetime': '2026-10-15T06:50:25', 'author': 'KOSCOM'}, {'disclosureId': 'x', 'title': 'bad id', 'datetime': '2026-10-15T06:50:25'},
               {'disclosureId': 3, 'title': 'bad date', 'datetime': '2026-13-15T06:50:25'}, {'disclosureId': 4, 'title': '', 'datetime': '2026-10-15T06:50:25'}, 'bad']


def serve(news=NEWS, disclosures=DISCLOSURES):
    def fetch(url):
        if '/news/stock/' in url:
            if isinstance(news, Exception):
                raise news
            return json.dumps(news).encode()
        if isinstance(disclosures, Exception):
            raise disclosures
        return json.dumps(disclosures).encode()
    return fetch


class StockNewsTests(unittest.TestCase):
    def tearDown(self):
        zero_proxy._cache.clear()

    def test_rows_are_validated_deduplicated_and_never_carry_article_text(self):
        value = zero_stocknews.collect('005930', NOW, fetch=serve())
        self.assertEqual([row['title'] for row in value['news']], ['제목', '태그 제목', '제목'], 'duplicate link, short article id, impossible date, empty title and non-dict rows are dropped')
        self.assertEqual([row['url'] for row in value['news']], ['https://n.news.naver.com/mnews/article/053/0000062491', 'https://n.news.naver.com/mnews/article/053/0000000003', 'https://n.news.naver.com/mnews/article/053/0000000004'])
        self.assertEqual(value['news'][0], {'title': '제목', 'publisher': '주간조선', 'published_at': '2026-10-22T23:22:00+09:00', 'url': 'https://n.news.naver.com/mnews/article/053/0000062491'})
        self.assertEqual(value['news'][1]['title'], '태그 제목')
        self.assertEqual(value['disclosures'], [{'title': '공시 제목', 'source': 'KOSCOM', 'published_at': '2026-10-15T06:50:25+09:00'}])
        text = json.dumps(value, ensure_ascii=False)
        for leaked in ('본문은', 'imageOriginLink', 'y.jpg'):
            self.assertNotIn(leaked, text)
        self.assertEqual((value['failed'], value['orders_authorized']), ([], False))

    def test_one_list_failing_is_named_and_both_failing_raises(self):
        value = zero_stocknews.collect('005930', NOW, fetch=serve(news=OSError('SECRET-TOKEN-XYZ-31415')))
        self.assertEqual((value['failed'], len(value['disclosures']), value['news']), (['news'], 1, []))
        self.assertNotIn('SECRET', json.dumps(value))
        with self.assertRaises(ValueError):
            zero_stocknews.collect('005930', NOW, fetch=serve(news=OSError('x'), disclosures=OSError('y')))
        for code in ('59', 'abc123', None, '../x'):
            with self.assertRaises(ValueError):
                zero_stocknews.collect(code, NOW, fetch=serve())

    def test_route_validates_code_caches_and_hides_provider_errors(self):
        good = zero_stocknews.collect('005930', NOW, fetch=serve())
        with mock.patch.object(zero_stocknews, 'collect', return_value=good) as collect:
            first, second = call('GET', 'api/stock-news', b'code=005930'), call('GET', 'api/stock-news', b'code=005930')
        self.assertEqual((first.status_code, second.body, json.loads(first.body)['scope']), (200, first.body, 'PUBLIC_STOCK_NEWS'))
        collect.assert_called_once_with('005930')
        zero_proxy._cache.clear()
        with mock.patch.object(zero_stocknews, 'collect', side_effect=OSError('SECRET-TOKEN-XYZ-31415')):
            response = call('GET', 'api/stock-news', b'code=005930')
        self.assertEqual((response.status_code, json.loads(response.body)), (503, {'error': 'STOCK_NEWS_UNAVAILABLE'}))
        self.assertNotIn(b'SECRET', response.body)
        self.assertNotIn('stock-news:005930', zero_proxy._cache)
        for query in (b'', b'code=59', b'code=005930&x=1', b'code=../x'):
            self.assertEqual(call('GET', 'api/stock-news', query).status_code, 404, query)
        self.assertEqual(call('POST', 'api/stock-news', b'code=005930').status_code, 403)


if __name__ == '__main__':
    unittest.main()
