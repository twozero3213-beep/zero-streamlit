import json
import unittest
from unittest import mock
import zero_proxy
import zero_research


class PublicResearchTests(unittest.TestCase):
    def setUp(self):
        zero_research._snapshot = {}
        zero_research._running = False
        zero_research._next_check = 999999999999
        zero_proxy._cache.clear()

    def test_desk_reads_check_public_sources_instead_of_only_saved_snapshot(self):
        base = {'macro': [], 'news': [], 'companies': [], 'charts': []}
        with mock.patch.object(zero_proxy, 'fetch', return_value=base), mock.patch.object(zero_research, 'overlay', return_value={**base, 'refresh': {'state': 'UPDATING'}}) as refresh:
            response = json.loads(zero_proxy.get_public('/api/desk', {}))
        self.assertEqual(response['refresh']['state'], 'UPDATING')
        refresh.assert_called_once_with(base)

    def test_new_values_preserve_other_sections_and_original_record_time(self):
        old = {'id':'US_CPI', 'latest_value':'2', 'history':[{'period':'2026-08','value':'2'}], 'retrieved_at':'2026-10-01T00:00:00+00:00'}
        new = {**old, 'latest_value':'3', 'history':[{'period':'2026-09','value':'3'}], 'retrieved_at':'2026-10-16T00:00:00+00:00'}
        base = {'macro':[old], 'news':[{'id':'reviewed'}], 'companies':[{'id':'company'}], 'charts':[], 'generated_at':'2026-10-01T00:00:00+00:00', 'orders_authorized':False}
        zero_research._snapshot = {'macro':[new], 'checked_at':new['retrieved_at'], 'state':'CURRENT'}
        actual = zero_research.overlay(base)
        self.assertEqual(actual['macro'], [new])
        for key in ('news','companies','charts','generated_at','orders_authorized'):
            self.assertEqual(actual[key], base[key])
        self.assertEqual(base['macro'],[old])

    def test_missing_or_older_observations_never_replace_saved_good_values(self):
        old = {'id':'CPI', 'latest_period':'2026-09', 'latest_value':'2', 'history':[{}], 'retrieved_at':'2026-10-16T00:00:00+00:00'}
        for candidate in ({**old,'latest_value':None,'history':[]}, {**old,'latest_value':'1','retrieved_at':'2026-10-01T00:00:00+00:00'}, {**old,'latest_period':'2025-12','latest_value':'1','retrieved_at':'2026-10-16T12:00:00+00:00'}):
            zero_research._snapshot={'macro':[candidate], 'state':'PARTIAL','failed':['CPI']}
            self.assertEqual(zero_research.overlay({'macro':[old]})['macro'],[old])

    def test_concurrent_visitors_start_one_bounded_background_check(self):
        zero_research._next_check = 0
        with mock.patch.object(zero_research.threading, 'Thread') as thread:
            for _ in range(10):
                self.assertEqual(zero_research.overlay({'macro':[]})['refresh']['state'],'UPDATING')
        thread.assert_called_once()
        thread.return_value.start.assert_called_once()
        self.assertTrue(thread.call_args.kwargs['daemon'])

    def test_collection_failure_keeps_previous_cache_and_retry_backoff(self):
        zero_research._snapshot={'macro':[{'id':'retained'}]}
        with mock.patch.object(zero_research.zero_macro,'collect_macro',side_effect=OSError), mock.patch.object(zero_research.zero_gauges,'collect_gauges',return_value=[]), mock.patch.object(zero_research.zero_reports,'collect_briefing_sources',return_value={'sources':[]}):
            zero_research._refresh({})
        self.assertFalse(zero_research._running)
        self.assertEqual(zero_research._snapshot['macro'],[{'id':'retained'}])
        self.assertEqual(zero_research._snapshot['state'],'UNAVAILABLE')

    def test_bls_rechecks_recent_data_hourly_without_redownloading_past_decade(self):
        from datetime import datetime, timezone
        zero_research._bls_cache.clear()
        zero_research._bls_requests.clear()
        year = datetime.now(timezone.utc).year
        client = mock.Mock()
        client.read.return_value = b'{"status":"REQUEST_SUCCEEDED","Results":{"series":[{"seriesID":"synthetic"}]}}'
        recent = dict(seriesid=['synthetic'],startyear=str(year-1),endyear=str(year))
        past = {**recent,'startyear':str(year-11),'endyear':str(year-2)}
        with mock.patch.object(zero_research.time,'monotonic',return_value=1000):
            zero_research.read_bls(client,payload=recent)
            first_checked = zero_research._bls_checked_at
            zero_research.read_bls(client,payload=recent)
            zero_research.read_bls(client,payload=past)
        self.assertEqual(client.read.call_count,2)
        self.assertEqual(zero_research._bls_checked_at,first_checked)
        with mock.patch.object(zero_research.time,'monotonic',return_value=4601):
            zero_research.read_bls(client,payload=recent)
            zero_research.read_bls(client,payload=past)
        self.assertEqual(client.read.call_count,3)
        zero_research._bls_cache.clear()
        zero_research._bls_requests[:]=[4601]*25
        with mock.patch.object(zero_research.time,'monotonic',return_value=4602):
            with self.assertRaisesRegex(ValueError,'HTTP_RATE_LIMITED'):zero_research.read_bls(client,payload=recent)

    def test_vendored_statistics_and_report_endpoints_stay_strict(self):
        from zero_statistics import descriptive_statistics
        value = descriptive_statistics([{'period':'2026-01','value':'1'},{'period':'2026-02','value':'3'}])
        self.assertEqual((value['mean'],value['median'],value['p25'],value['p75']), ('2','2','1.5','2.5'))
        for url in ('http://www.bok.or.kr/', 'https://evil.test/', 'https://www.bok.or.kr/portal/bbs/P0002353/view.do?token=private'):
            with self.assertRaises(ValueError):zero_research.zero_reports.public_url(url)
