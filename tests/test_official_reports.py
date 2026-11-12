"""Official equity indexes keep dates, provenance and prior successes without article bodies."""
from copy import deepcopy
from datetime import datetime, timezone
import unittest
from unittest.mock import patch
import zero_reports as api

NOW = datetime(2026, 11, 12, 3, tzinfo=timezone.utc)
REPORT = b'''<div class="list" id="rsidx_2350"><div class="sign_guide"><div class="link"><div class="rpt_title"><strong>Outlook <em>and</em> disclosures</strong><em>Author <span>2026.11.11</span></em></div><p class="txt">Do not retain article summary</p></div></div></div>'''
FOCUS = b'''<div class="focus_top-sign"><div class="sign_select"><strong>Focus</strong><span>Published <em>2026.11.02</em></span><ul><li><em>Combined</em></li><li><em>Summary</em></li></ul></div></div><div class="other_box"><a href="pub_detail_view?syear=2026&amp;zcd=002001016&amp;zno=1944&amp;cno=6883"><strong>KOSDAQ listing research</strong><b>Author</b><span>Do not retain summary</span></a><a href="pub_detail_view?cno=6883&amp;zno=1944&amp;zcd=002001016&amp;syear=2026"><strong>KOSDAQ listing research</strong></a></div>'''
FEED = b'''<rss><channel><item><title>S&amp;P 500 Earnings Season Update</title><link>https://insight.factset.com/sp-500-earnings-season-update-november-6-2026</link><pubDate>Fri, 06 Nov 2026 19:10:19 GMT</pubDate></item><item><title>S&amp;P 500 CPI Projection</title><link>https://insight.factset.com/cpi-projection</link><pubDate>Fri, 06 Nov 2026 19:10:19 GMT</pubDate></item><item><title>Quarterly EPS Estimates for S&amp;P 500</title><link>https://insight.factset.com/quarterly-eps</link><pubDate>Wed, 04 Nov 2026 17:00:00 GMT</pubDate></item></channel></rss>'''
IDS = {'kcmi-reports', 'kcmi-focus', 'factset-earnings'}


def spec(source_id):
    return next(row for row in api.catalog()['sources'] if row['id'] == source_id)


def fetch(url):
    if url.endswith('/report/report_list'): return REPORT
    if url.endswith('/publications/publications_list'): return FOCUS
    if url == 'https://insight.factset.com/author/john-butters/rss.xml': return FEED
    raise OSError('PRIVATE_DETAIL')


class OfficialEquityReportsTests(unittest.TestCase):
    def test_registry_has_verified_domestic_and_overseas_equity_indexes(self):
        rows = {row['id']: row for row in api.catalog()['sources']}
        self.assertTrue(IDS <= rows.keys())
        self.assertEqual({rows[key]['kind'] for key in IDS}, {'EQUITY_RESEARCH'})
        self.assertEqual(rows['fed-policy-releases']['kind'], 'POLICY_RELEASE')
        self.assertEqual(rows['bis-releases']['kind'], 'GLOBAL_RESEARCH')

    def test_kcmi_reports_extract_title_date_and_stable_article_url(self):
        rows = api._records(spec('kcmi-reports'), REPORT, NOW)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['title'], 'Outlook and disclosures')
        self.assertEqual(rows[0]['published_date'], '2026-11-11')
        self.assertIsNone(rows[0]['published_at'])
        self.assertEqual(rows[0]['url'], 'https://www.kcmi.re.kr/report/report_view?report_no=2350')
        self.assertIsNone(rows[0]['summary'])

    def test_kcmi_focus_uses_issue_date_and_deduplicates_query_order(self):
        rows = api._records(spec('kcmi-focus'), FOCUS, NOW)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['title'], 'KOSDAQ listing research')
        self.assertEqual(rows[0]['published_date'], '2026-11-02')
        self.assertIsNone(rows[0]['published_at'])
        self.assertEqual(rows[0]['url'], 'https://www.kcmi.re.kr/publications/pub_detail_view?cno=6883&syear=2026&zcd=002001016&zno=1944')

    def test_new_indexes_reject_missing_invalid_or_future_dates(self):
        for body in (REPORT.replace(b'2026.11.11', b'unknown'), REPORT.replace(b'2026.11.11', b'2026.02.30'), REPORT.replace(b'2026.11.11', b'2027.11.11')):
            self.assertEqual(api._records(spec('kcmi-reports'), body, NOW), [])
        self.assertEqual(api._records(spec('kcmi-focus'), FOCUS.replace(b'2026.11.02', b'unknown'), NOW), [])
        self.assertEqual(api._records(spec('factset-earnings'), FEED.replace(b'<pubDate>', b'<ignored>').replace(b'</pubDate>', b'</ignored>'), NOW), [])

    def test_factset_author_feed_is_filtered_to_sp500_earnings(self):
        rows = api._records(spec('factset-earnings'), FEED, NOW)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['published_at'], '2026-11-06T19:10:19+00:00')
        self.assertTrue(all(row['access'] == 'INDEX_ONLY' and row['summary'] is None for row in rows))
        foreign = FEED.replace(b'https://insight.factset.com/', b'https://example.test/')
        self.assertEqual(api._records(spec('factset-earnings'), foreign, NOW), [])

    def test_expanded_registry_accepts_old_queue_then_adds_sources_on_refresh(self):
        current = api.catalog()
        old = deepcopy(current); old['sources'] = [row for row in old['sources'] if row['id'] not in IDS]
        with patch.object(api, 'catalog', return_value=old):
            previous = api.collect_briefing_sources(now=NOW, fetch=lambda _: b'<rss><channel/></rss>')
        self.assertEqual(len(previous['sources']), 11)
        self.assertEqual(api.validate_briefing_sources(previous), previous)
        result = api.collect_briefing_sources(previous, now=NOW, fetch=fetch)
        self.assertEqual({row['id'] for row in result['sources'] if row['status'] == 'AVAILABLE'}, IDS)
        self.assertEqual(len(result['review_candidates']), 4)

    def test_partial_failure_retains_new_source_success_and_actual_read_clock(self):
        previous = api.collect_briefing_sources(now=NOW, fetch=fetch)
        later = datetime(2026, 11, 12, 4, tzinfo=timezone.utc)
        def partial(url):
            if 'kcmi.re.kr' in url: raise OSError('PRIVATE_DETAIL')
            return fetch(url)
        result = api.collect_briefing_sources(previous, now=later, fetch=partial)
        for source_id in ('kcmi-reports', 'kcmi-focus'):
            row = next(row for row in result['sources'] if row['id'] == source_id)
            prior = next(row for row in previous['sources'] if row['id'] == source_id)
            self.assertEqual(row['status'], 'RETAINED')
            self.assertEqual(row['records'], prior['records'])
            self.assertEqual(row['checked_at'], later.isoformat())
        self.assertNotIn('PRIVATE_DETAIL', str(result))
        self.assertEqual(result['full_text_review_count'], 0)
        self.assertFalse(result['orders'])

    def test_public_overlay_refreshes_old_queue_and_preserves_other_desk_sections(self):
        import zero_research
        old = deepcopy(api.catalog()); old['sources'] = [row for row in old['sources'] if row['id'] not in IDS]
        with patch.object(api, 'catalog', return_value=old):
            previous = api.collect_briefing_sources(now=NOW, fetch=lambda _: b'<rss><channel/></rss>')
        base = dict(briefing_sources=previous, companies=[{'id': 'SYNTHETIC_COMPANY'}], charts=[], news=[], generated_at=NOW.isoformat())
        with patch.object(zero_research, '_snapshot', {}), patch.object(zero_research, '_running', False), patch.object(zero_research, '_next_check', 999999999999), patch.object(zero_research.zero_macro, 'collect_macro', return_value=[]), patch.object(zero_research.zero_gauges, 'collect_gauges', return_value=[]), patch.object(api, '_fetch', side_effect=fetch):
            zero_research._refresh(base)
            actual = zero_research.overlay(base)
        self.assertEqual(len(actual['briefing_sources']['sources']), 14)
        self.assertEqual({row['id'] for row in actual['briefing_sources']['sources'] if row['status'] == 'AVAILABLE'}, IDS)
        self.assertEqual(actual['refresh']['state'], 'PARTIAL')
        self.assertEqual(len(actual['refresh']['failed']), 11)
        self.assertEqual(actual['companies'], base['companies'])
        self.assertEqual(actual['generated_at'], NOW.isoformat())
        self.assertEqual(len(base['briefing_sources']['sources']), 11)

    def test_new_url_allowlist_rejects_extra_queries_and_nonresearch_routes(self):
        for url in ('https://www.kcmi.re.kr/report/report_view?report_no=2350&token=secret',
                    'https://www.kcmi.re.kr/report/report_view?report_no=2350&report_no=1',
                    'https://www.kcmi.re.kr/common/downloadw?fid=1',
                    'https://www.kcmi.re.kr/publications/pub_detail_view?cno=6883&syear=2026&zcd=other&zno=1944',
                    'https://insight.factset.com/article?token=secret',
                    'https://insight.factset.com/../private',
                    'https://insight.factset.com/author/other/rss.xml'):
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, '^PUBLIC_SOURCE_URL_INVALID$'):
                api.public_url(url)


if __name__ == '__main__': unittest.main()
