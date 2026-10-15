"""Offline public iframe integration; no provider/network/account calls."""
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
from unittest import mock
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def epoch(value):
    return int(datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp())


def chart(identity='US:SPY', range_='5Y'):
    market, symbol = identity.split(':')
    interval = {'1D':'1m','1W':'1m','1M':'60m'}.get(range_, '1d')
    period = {'1D':'1d','1W':'5d','1M':'1mo','3M':'3mo','1Y':'1y','5Y':'5y'}[range_]
    if market == 'KR':
        symbol += '.KS'
    return dict(schema_version=1, identity=identity, market=market, currency='USD' if market == 'US' else 'KRW',
                range=range_, interval=interval, basis='UNADJUSTED_PROVIDER_COMPLETED_OHLCV', status='AVAILABLE',
                error_code=None, source_url='https://query1.finance.yahoo.com/v8/finance/chart/'+symbol+'?range='+period+'&interval='+interval+'&includePrePost=false',
                checked_at='2024-10-09T00:00:00Z', retrieved_at='2024-10-09T00:00:00Z',
                bars=[dict(time=epoch('2024-10-08T13:30:00Z' if market == 'US' else '2024-10-08T00:00:00Z'), open=100,high=102,low=99,close=101,volume=10)])


class LightweightRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            from starlette.requests import Request
        except ImportError:
            raise unittest.SkipTest('optional Starlette package is absent')
        cls.Request = Request
        cls.module = load(PUBLIC / 'zero_lwc.py', 'zero_lwc_offline_test')

    def setUp(self):
        self.module._cache.clear()

    def request(self, query='identity=US%3ASPY&range=5Y&height=240', method='GET'):
        return self.Request({'type':'http','method':method,'path':'/zero/lwc','query_string':query.encode(),
                             'headers':[(b'authorization',b'Bearer NEVER_FORWARD'),(b'cookie',b'PRIVATE_COOKIE')]})

    def invoke(self, request=None, reader=None, renderer=None):
        with mock.patch.object(self.module.time, 'time', return_value=epoch('2024-10-09T00:00:00Z')):
            return asyncio.run(self.module.lwc(request or self.request(), reader=reader, renderer=renderer))

    def test_validation_and_no_credentials_or_unknown_symbols(self):
        calls, renders = [], []
        def reader(path, query):
            calls.append((path,query))
            return json.dumps(chart()).encode()
        def renderer(bars, **kwargs):
            renders.append((bars,kwargs))
            return '<html><body>OFFLINE_CHART</body></html>'
        response = self.invoke(reader=reader, renderer=renderer)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.headers['cache-control'],'private, no-store')
        self.assertIn("default-src 'none'",response.headers['content-security-policy'])
        self.assertIn("frame-ancestors 'self'",response.headers['content-security-policy'])
        self.assertNotIn(b'NEVER_FORWARD',response.body)
        self.assertEqual(calls,[('/api/chart',{'identity':'US:SPY','range':'5Y'})])
        self.assertTrue(renders[0][0][0]['completed'])
        self.assertEqual(renders[0][1],{'height':240})
        self.invoke(reader=reader,renderer=renderer)
        self.assertEqual(len(renders),1,'same source clock reuses bounded document cache')
        for query in ['identity=US:SPY&range=5Y&height=159','identity=US:SPY&range=5Y&height=361',
                      'identity=US:SPY&range=5Y&height=240&token=bad','identity=US:SPY&range=5Y&height=240&range=1Y',
                      'identity=https://evil.example&range=5Y&height=240']:
            self.assertEqual(self.invoke(self.request(query),reader=reader,renderer=renderer).status_code,400)
        self.assertEqual(self.invoke(self.request(method='POST'),reader=reader,renderer=renderer).status_code,400)
        paths=[]
        def unknown_reader(path, query):
            paths.append(path)
            return {'universes':[]}
        self.assertEqual(self.invoke(self.request('identity=US:FAKE&range=5Y&height=240'),reader=unknown_reader,renderer=renderer).status_code,503)
        self.assertEqual(paths,['/api/research'],'unknown identity never requests a price chart')

    def test_document_cache_and_output_are_bounded(self):
        reader=lambda *args:chart()
        renderer=lambda bars, **kwargs:'<html><body>bounded</body></html>'
        for height in range(160,180):
            response=self.invoke(self.request('identity=US:SPY&range=5Y&height='+str(height)),reader=reader,renderer=renderer)
            self.assertEqual(response.status_code,200)
        self.assertEqual(len(self.module._cache),16)
        response=self.invoke(self.request('identity=US:SPY&range=5Y&height=200'),reader=reader,renderer=lambda *args,**kwargs:'x'*2_000_001)
        self.assertEqual(response.status_code,503)
        self.assertEqual(len(self.module._cache),16)

    def test_market_clocks_source_status_values_and_no_fabrication(self):
        now=epoch('2024-10-09T00:00:00Z')
        base=chart()
        with self.assertRaises(ValueError):self.module.validated_bars(base,'US:SPY','5Y',('US','SPY'),now+86401)
        self.module.validated_bars(base,'US:SPY','5Y',('US','SPY'),now+86400)
        for key,value in [('status','STALE'),('status','UNAVAILABLE'),('currency','KRW'),('interval','1m'),
                          ('source_url','https://evil.example/chart'),('retrieved_at','2025-01-01T00:00:00Z')]:
            data=deepcopy(base);data[key]=value
            with self.assertRaises(ValueError):self.module.validated_bars(data,'US:SPY','5Y',('US','SPY'),now)
        for key,value in [('volume',None),('close',float('nan')),('low',103),('completed',False)]:
            data=deepcopy(base);data['bars'][0][key]=value
            with self.assertRaises(ValueError):self.module.validated_bars(data,'US:SPY','5Y',('US','SPY'),now)
        for identity,spec,before,after in [('US:SPY',('US','SPY'),'2024-10-08T20:09:00Z','2024-10-08T20:10:00Z'),
                                          ('KR:148020',('KR','148020.KS'),'2024-10-08T06:39:00Z','2024-10-08T06:40:00Z')]:
            data=chart(identity);data['checked_at']=data['retrieved_at']=before
            with self.assertRaises(ValueError):self.module.validated_bars(data,identity,'5Y',spec,now)
            data['checked_at']=data['retrieved_at']=after
            self.assertTrue(self.module.validated_bars(data,identity,'5Y',spec,now)[0]['completed'])
        def failed(*args):raise RuntimeError('PRIVATE_RAW_BODY_AND_HEADER')
        response=self.invoke(reader=failed,renderer=failed)
        self.assertEqual(response.status_code,503)
        self.assertNotIn(b'PRIVATE_RAW',response.body)
        self.assertLess(len(response.body),500)

    def test_actual_package_document_when_installed(self):
        try:
            import lightweight_charts
            import pandas
        except ImportError:
            self.skipTest('optional lightweight-charts/pandas packages are absent')
        import locale, sys
        if sys.platform=='win32' and not sys.flags.utf8_mode and locale.getencoding().lower().replace('-','')!='utf8':
            self.skipTest('upstream Windows bundle requires python -X utf8')
        component=load(PUBLIC/'zero_streamlit_chart.py','zero_lwc_actual_document')
        response=self.invoke(reader=lambda *args:json.dumps(chart()).encode(),renderer=component.chart_document)
        self.assertEqual(response.status_code,200)
        self.assertIn(b'TradingView',response.body)
        self.assertIn(b'LightweightCharts',response.body)
        self.assertNotIn(b'src="https://',response.body,'library scripts must be bundled, not CDN fetched')

    def test_chart_link_and_public_flag_contract(self):
        node=shutil.which('node')
        if not node:self.skipTest('Node is absent')
        script="""const assert=require('node:assert/strict'),{lightweightChartLink}=require('./ui/assets/stock-workbench.js');
assert.equal(lightweightChartLink('US:SPY','5Y'),'./lwc?identity=US%3ASPY&range=5Y&height=240');
for(const args of [['https://evil.example','5Y'],['US:SPY','BAD'],['US:SPY','5Y',159],['US:SPY','5Y',361]])assert.equal(lightweightChartLink(...args),null);
"""
        result=subprocess.run([node,'-e',script],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)
        source=(PUBLIC/'ui/assets/stock-workbench.js').read_text(encoding='utf-8')
        self.assertIn('meta[name="zero-lightweight-chart"]',source)
        self.assertIn("content==='./lwc'",source)
        self.assertIn("frame.setAttribute('sandbox','allow-scripts')",source)
        self.assertIn("button('다시 불러오기'",source)
        self.assertIn('wireCanvas(canvas)',source)


if __name__ == '__main__':
    unittest.main()
