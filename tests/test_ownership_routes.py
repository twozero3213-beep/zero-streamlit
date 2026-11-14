import json
import unittest
from unittest.mock import patch
import zero_proxy

class OwnershipRoutesTests(unittest.TestCase):
    def test_only_exact_public_queries_are_forwarded(self):
        for path, query, wanted in [
            ('/api/ownership', {}, '/api/ownership'),
            ('/api/ownership/companies', {}, '/api/ownership/companies'),
            ('/api/ownership', {'code':'0123A0','page':'1'}, '/api/ownership?code=0123A0&page=1'),
            ('/api/ownership', {'code':'005930','page':'2','revision':'a'*64}, '/api/ownership?code=005930&page=2&revision='+'a'*64),
        ]:
            with self.subTest(query=query):
                self.assertEqual(zero_proxy._upstream(path,query),(wanted,60))
        for path, query in [
            ('/api/ownership/companies',{'q':'x'}),('/api/ownership',{'page':'1'}),
            ('/api/ownership',{'code':'../005930'}),('/api/ownership',{'code':'0123a0'}),
            ('/api/ownership',{'code':'005930','page':'0'}),('/api/ownership',{'code':'005930','page':'10000'}),
            ('/api/ownership',{'code':'005930','revision':'x'}),('/api/ownership',{'code':'005930','x':'1'}),
        ]:
            with self.subTest(query=query), self.assertRaises(zero_proxy.Unavailable):
                zero_proxy._upstream(path,query)

    def test_company_counts_refresh_after_one_minute(self):
        path = '/api/ownership/companies'
        first = {'companies': [{'stock_code': '005930', 'count': 1}]}
        updated = {'companies': [{'stock_code': '005930', 'count': 2}]}
        with patch.object(zero_proxy, '_cache', {}), patch.object(zero_proxy, '_pending', {}), \
             patch.object(zero_proxy.time, 'monotonic', return_value=0) as clock, \
             patch.object(zero_proxy, 'fetch', side_effect=[first, updated]) as fetch:
            self.assertEqual(json.loads(zero_proxy.get_public(path, {})), first)
            clock.return_value = 59
            self.assertEqual(json.loads(zero_proxy.get_public(path, {})), first)
            fetch.assert_called_once_with(path)
            clock.return_value = 61
            self.assertEqual(json.loads(zero_proxy.get_public(path, {})), updated)
            self.assertEqual(fetch.call_count, 2)

    def test_archive_read_has_a_wall_clock_deadline_and_no_redirect(self):
        import zero.realtime_stock_quote as transport
        with patch.object(zero_proxy,'_secret',side_effect=lambda name:{'CF_ACCESS_CLIENT_ID':'synthetic-id','CF_ACCESS_CLIENT_SECRET':'synthetic-secret'}.get(name)), \
             patch.object(transport,'_read_body',return_value=b'{"scope":"OWNERSHIP_MONITOR"}') as read, \
             patch.object(zero_proxy.urllib.request,'build_opener',side_effect=AssertionError('UNEXPECTED_NETWORK')), \
             patch.object(zero_proxy.time,'monotonic',return_value=10):
            self.assertEqual(zero_proxy.fetch('/api/ownership'),{'scope':'OWNERSHIP_MONITOR'})
        self.assertEqual(read.call_args.kwargs,{'deadline':18,'limit':2000000})
        request=read.call_args.args[0]
        self.assertEqual(request.full_url,'https://zero-portfolio.zero-cloudflare.workers.dev/api/ownership')
        self.assertEqual(request.headers['Cf-access-client-secret'],'synthetic-secret')
