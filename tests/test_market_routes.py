"""The public monitoring routes use the committed, credential-free collectors."""
import asyncio
import json
from pathlib import Path
import sys
import tempfile
import threading
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

from starlette.requests import Request

import build_ui
import zero_proxy
from tests.test_app import call


class MarketRoutesTests(unittest.TestCase):
    def test_public_read_only_route_preserves_failure_and_rejects_query(self):
        from zero import market_watch
        payload = {'scope': 'MARKET_WATCH', 'state': 'UNAVAILABLE', 'orders_authorized': False}
        with patch.object(market_watch, 'get_market_watch', return_value=(503, payload)) as collect, \
                patch.object(zero_proxy, '_secret', side_effect=AssertionError('NO_CREDENTIAL_READ')):
            response = call(zero_proxy.api, 'GET', 'api/market-watch')
            self.assertEqual((response.status_code, json.loads(response.body)), (503, payload))
            self.assertEqual(response.headers['cache-control'], 'no-store')
            for query in (b'x=1', b'x=1&x=2'):
                self.assertEqual(call(zero_proxy.api, 'GET', 'api/market-watch', query).status_code, 404)
            self.assertEqual(call(zero_proxy.api, 'POST', 'api/market-watch').status_code, 403)
            self.assertEqual(collect.call_count, 1)

    def test_public_build_copies_committed_collectors_and_keeps_unrelated_modules(self):
        names = ('governance_radar.py', 'market_watch.py', 'premarket.py', 'realtime_stock_quote.py', 'macro_indicators.py', 'market_intelligence.py', 'morning_report.py', 'analysis_feed.py', 'realtime_market_pulse.py')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            assets = root / 'source/assets'
            assets.mkdir(parents=True)
            (assets / 'manifest.webmanifest').write_text('{"id":"/","start_url":"/","scope":"/"}', encoding='utf8')
            (root / 'source/index.html').write_text('<html data-zero-hosted="true"><body></body></html>', encoding='utf8')
            (root / 'zero').mkdir()
            (root / 'zero/unrelated.py').write_text('keep = True', encoding='utf8')
            revisions = []
            def committed(command, **kwargs):
                revisions.append(command[-1])
                code = 'ORIGIN = ' + repr(command[-1]) + '\n'
                if command[-1] == 'HEAD:zero/realtime_stock_quote.py':
                    code += "def _get_zero_env():\n    raise AssertionError('CREDENTIAL_READ')\n"
                if command[-1].endswith('.json'):
                    code = '{"sources":[]}'
                return build_ui.subprocess.CompletedProcess(command, 0, stdout=code)
            with patch.object(build_ui, 'OUT', root / 'ui'), patch.object(build_ui, '__file__', str(root / 'build_ui.py')), \
                    patch.object(build_ui, 'EXTRAS', root / 'extras'), patch.object(build_ui.subprocess, 'run', side_effect=committed), \
                    patch.dict('os.environ', {'ZERO_LOBBY_API': ''}):
                build_ui.build(root / 'source', root / 'checkout')
            for name in names:
                code = (root / 'zero' / name).read_text(encoding='utf8')
                if name == 'realtime_stock_quote.py':
                    namespace = {}
                    exec(compile(code, str(root / 'zero' / name), 'exec'), namespace)
                    self.assertEqual(namespace['_get_zero_env'](), {})
                    self.assertNotIn('CREDENTIAL_READ', code)
                else:
                    self.assertEqual(code, 'ORIGIN = ' + repr('HEAD:zero/' + name) + '\n')
            self.assertEqual((root / 'zero/data/external_sources.json').read_text(encoding='utf8'), '{"sources":[]}')
            self.assertTrue(all(revision.startswith('HEAD:') for revision in revisions))
            self.assertEqual((root / 'zero/unrelated.py').read_text(encoding='utf8'), 'keep = True')


class MarketRouteDeadlineTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        import zero
        self.slots = threading.BoundedSemaphore(1)
        for name, function in (('governance_radar', 'get_governance_radar'),
                               ('market_watch', 'get_market_watch'), ('premarket', 'get_premarket')):
            module = ModuleType('zero.' + name)
            setattr(module, function, Mock(return_value=(503, {'state': 'UNAVAILABLE'})))
            for item in (patch.dict(sys.modules, {'zero.' + name: module}),
                         patch.object(zero, name, module, create=True)):
                item.start()
                self.addCleanup(item.stop)
        for item in (patch.object(zero_proxy, '_signal_slots', self.slots, create=True),
                     patch.object(zero_proxy, 'SIGNAL_DEADLINE_SECONDS', .04, create=True)):
            item.start()
            self.addCleanup(item.stop)

    def request(self, path='market-watch'):
        return Request({'type': 'http', 'method': 'GET', 'path': '/zero/api/' + path,
                        'path_params': {'path': path}, 'query_string': b'', 'headers': []})

    def assert_deadline(self, response):
        self.assertEqual((response.status_code, json.loads(response.body)),
                         (503, {'error': 'SIGNAL_DEADLINE'}))
        self.assertEqual(response.headers['cache-control'], 'no-store')

    async def test_all_signal_routes_preserve_available_partial_and_failure(self):
        from zero import governance_radar, market_watch, premarket
        async def immediate(function, *args, **kwargs):
            return function(*args, **kwargs)
        for path, module, name in (('governance', governance_radar, 'get_governance_radar'),
                                   ('market-watch', market_watch, 'get_market_watch'),
                                   ('premarket', premarket, 'get_premarket')):
            for status, state in ((200, 'AVAILABLE'), (200, 'PARTIAL'), (503, 'UNAVAILABLE')):
                payload = {'state': state, 'orders_authorized': False}
                with self.subTest(path=path, state=state), patch.object(module, name, return_value=(status, payload)) as collect, \
                        patch.object(zero_proxy, 'run_in_threadpool', immediate):
                    response = await zero_proxy.api(self.request(path))
                    self.assertEqual((response.status_code, json.loads(response.body)), (status, payload))
                    self.assertEqual(response.headers['cache-control'], 'public, max-age=120' if status == 200 else 'no-store')
                    collect.assert_called_once_with()

    async def test_saturated_signal_admission_never_queues_a_job(self):
        from zero import market_watch
        async def immediate(function, *args, **kwargs):
            return function(*args, **kwargs)
        self.assertTrue(self.slots.acquire(blocking=False))
        try:
            with patch.object(market_watch, 'get_market_watch', return_value=(200, {})) as collect, \
                    patch.object(zero_proxy, 'run_in_threadpool', side_effect=immediate) as pool:
                self.assert_deadline(await zero_proxy.api(self.request()))
                pool.assert_not_called()
                collect.assert_not_called()
        finally:
            self.slots.release()

    async def test_pool_queue_timeout_returns_without_starting_collector(self):
        from zero import market_watch
        release, entered = asyncio.Event(), asyncio.Event()
        async def queued(function, *args, **kwargs):
            entered.set()
            await release.wait()
            return function(*args, **kwargs)
        with patch.object(market_watch, 'get_market_watch', return_value=(200, {})) as collect, \
                patch.object(zero_proxy, 'run_in_threadpool', queued):
            task = asyncio.create_task(zero_proxy.api(self.request()))
            try:
                await entered.wait()
                done, _ = await asyncio.wait({task}, timeout=.5)
                self.assertTrue(done, 'pool queue time belongs to the route deadline')
                self.assert_deadline(task.result())
                collect.assert_not_called()
                await asyncio.sleep(0)
                self.assertTrue(self.slots.acquire(blocking=False))
                self.slots.release()
            finally:
                release.set()
                await task

    async def test_noncooperative_queued_job_cannot_multiply_after_timeout(self):
        from zero import market_watch
        release, entered = asyncio.Event(), asyncio.Event()
        scheduled = []
        async def queued(function, *args, **kwargs):
            scheduled.append(1)
            entered.set()
            try:
                await release.wait()
            except asyncio.CancelledError:
                await release.wait()
            return function(*args, **kwargs)
        with patch.object(market_watch, 'get_market_watch', return_value=(200, {})) as collect, \
                patch.object(zero_proxy, 'run_in_threadpool', queued):
            task = asyncio.create_task(zero_proxy.api(self.request()))
            try:
                await entered.wait()
                done, _ = await asyncio.wait({task}, timeout=.5)
                self.assertTrue(done, 'the route must not wait for pool cancellation')
                self.assert_deadline(task.result())
                for _ in range(20):
                    self.assert_deadline(await zero_proxy.api(self.request()))
                self.assertEqual(len(scheduled), 1)
                self.assertFalse(self.slots.acquire(blocking=False))
            finally:
                release.set()
                await task
                await asyncio.sleep(.02)
            collect.assert_not_called()
        self.assertTrue(self.slots.acquire(blocking=False))
        self.slots.release()

    async def test_running_collector_keeps_slot_until_its_actual_exit(self):
        from zero import market_watch
        release, entered, finished = threading.Event(), threading.Event(), threading.Event()
        async def pool(function, *args, **kwargs):
            return await asyncio.to_thread(function, *args, **kwargs)
        def collect():
            entered.set()
            try:
                release.wait(1.5)
                return 200, {'state': 'AVAILABLE'}
            finally:
                finished.set()
        with patch.object(market_watch, 'get_market_watch', side_effect=collect) as worker, \
                patch.object(zero_proxy, 'run_in_threadpool', pool):
            task = asyncio.create_task(zero_proxy.api(self.request()))
            try:
                done, _ = await asyncio.wait({task}, timeout=.5)
                self.assertTrue(entered.is_set())
                self.assertTrue(done, 'a running thread cannot extend the HTTP deadline')
                self.assert_deadline(task.result())
                self.assertFalse(self.slots.acquire(blocking=False))
                self.assert_deadline(await zero_proxy.api(self.request()))
                worker.assert_called_once_with()
            finally:
                release.set()
                await asyncio.to_thread(finished.wait, .5)
                await task
        self.assertTrue(self.slots.acquire(blocking=False))
        self.slots.release()

    async def test_job_starting_after_original_deadline_skips_collector(self):
        from zero import market_watch
        clock = type('Clock', (), {'monotonic': lambda self: self.now})()
        clock.now = 100.0
        async def late(function, *args, **kwargs):
            clock.now = 100.05
            return function(*args, **kwargs)
        with patch.object(zero_proxy, 'time', clock), \
                patch.object(market_watch, 'get_market_watch', return_value=(200, {})) as collect, \
                patch.object(zero_proxy, 'run_in_threadpool', late):
            self.assert_deadline(await zero_proxy.api(self.request()))
        collect.assert_not_called()
        self.assertTrue(self.slots.acquire(blocking=False))
        self.slots.release()

    async def test_cancelling_queued_request_returns_its_single_admission(self):
        from zero import market_watch
        entered, cancelled = asyncio.Event(), asyncio.Event()
        async def queued(function, *args, **kwargs):
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        with patch.object(market_watch, 'get_market_watch') as collect, \
                patch.object(zero_proxy, 'run_in_threadpool', queued):
            task = asyncio.create_task(zero_proxy.api(self.request()))
            await entered.wait()
            self.assertFalse(self.slots.acquire(blocking=False))
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            await asyncio.wait_for(cancelled.wait(), .5)
            await asyncio.sleep(0)
            collect.assert_not_called()
        self.assertTrue(self.slots.acquire(blocking=False))
        self.assertFalse(self.slots.acquire(blocking=False))
        self.slots.release()
