"""Synthetic route deadlines, including queued and already-running pool jobs."""
import asyncio
import json
import threading
import time
import unittest
from unittest import mock

from starlette.requests import Request

import zero_proxy
from zero import realtime_stock_quote as quotes


class QuoteProxyDeadlineTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.slots = threading.BoundedSemaphore(1)
        for patch in (mock.patch.object(zero_proxy, '_quote_slots', self.slots, create=True),
                      mock.patch.object(quotes, 'QUOTE_DEADLINE_SECONDS', .05, create=True)):
            patch.start()
            self.addCleanup(patch.stop)

    def request(self, path='market/quote'):
        return Request({'type': 'http', 'method': 'GET', 'path': '/zero/api/' + path,
                        'path_params': {'path': path}, 'query_string': b'', 'headers': []})

    def assert_deadline(self, response):
        self.assertEqual((response.status_code, json.loads(response.body)),
                         (503, {'error': 'QUOTE_DEADLINE'}))

    async def test_normal_partial_and_invalid_responses_keep_their_contract(self):
        async def immediate(function, *args, **kwargs):
            return function(*args, **kwargs)

        for path, target, result in (
                ('market/quote', 'get_quote_response', (400, {'error': 'SYMBOL_INVALID'})),
                ('market/quote', 'get_quote_response', (200, {'state': 'PARTIAL', 'quotes': []})),
                ('live-quotes', 'get_live_quotes_endpoint', (200, {'state': 'PARTIAL', 'quotes': []}))):
            with self.subTest(path=path, result=result), mock.patch.object(quotes, 'QUOTE_DEADLINE_SECONDS', 2), mock.patch.object(quotes, target, return_value=result) as worker, mock.patch.object(zero_proxy, 'run_in_threadpool', immediate):
                started = time.monotonic()
                response = await zero_proxy.api(self.request(path))
                self.assertEqual((response.status_code, json.loads(response.body)), result)
                self.assertEqual(response.headers['cache-control'], 'public, max-age=15')
                self.assertGreater(worker.call_args.kwargs['deadline'], started)
                self.assertLessEqual(worker.call_args.kwargs['deadline'], started + 2.1)

    async def test_pool_queue_delay_uses_the_original_deadline(self):
        async def delayed(function, *args, **kwargs):
            await asyncio.sleep(.2)
            return function(*args, **kwargs)

        with mock.patch.object(quotes, 'QUOTE_DEADLINE_SECONDS', 2), mock.patch.object(quotes, 'get_quote_response', return_value=(200, {'quotes': {}})) as worker, mock.patch.object(zero_proxy, 'run_in_threadpool', delayed):
            started = time.monotonic()
            response = await zero_proxy.api(self.request())
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(worker.call_args.kwargs['deadline'], started + 2.1)

    async def test_cleanup_allowance_is_anchored_to_the_original_deadline(self):
        clock = mock.Mock(monotonic=mock.Mock(side_effect=[100.0, 109.0]))
        with mock.patch.object(quotes, 'QUOTE_DEADLINE_SECONDS', 8), mock.patch.object(zero_proxy, 'time', clock), mock.patch.object(zero_proxy.asyncio, 'wait', return_value=(set(), set())) as wait:
            self.assert_deadline(await zero_proxy.api(self.request()))
        self.assertEqual(wait.call_args.kwargs['timeout'], 0)

    async def test_expired_deadline_reaches_worker_without_a_new_budget(self):
        observed = []

        async def delayed(function, *args, **kwargs):
            await asyncio.sleep(.07)
            return function(*args, **kwargs)

        def worker(*args, **kwargs):
            observed.append(kwargs.get('deadline'))
            return 503, {'error': 'QUOTE_DEADLINE'}

        with mock.patch.object(quotes, 'get_quote_response', side_effect=worker), mock.patch.object(zero_proxy, 'run_in_threadpool', delayed):
            self.assert_deadline(await zero_proxy.api(self.request()))
        self.assertEqual(len(observed), 1)
        self.assertIsInstance(observed[0], float)
        self.assertLess(observed[0], time.monotonic())

    async def test_saturated_admission_does_not_queue_another_job(self):
        self.assertTrue(self.slots.acquire(blocking=False))
        try:
            with mock.patch.object(zero_proxy, 'run_in_threadpool', return_value=(200, {})) as pool:
                self.assert_deadline(await zero_proxy.api(self.request()))
                pool.assert_not_called()
        finally:
            self.slots.release()

    async def test_noncooperative_queued_job_cannot_delay_or_multiply_requests(self):
        release = asyncio.Event()
        entered = asyncio.Event()
        scheduled = []

        async def stubborn(function, *args, **kwargs):
            scheduled.append(1)
            entered.set()
            try:
                await release.wait()
            except asyncio.CancelledError:
                await release.wait()
            return function(*args, **kwargs)

        with mock.patch.object(quotes, 'get_quote_response', return_value=(503, {'error': 'QUOTE_DEADLINE'})), mock.patch.object(zero_proxy, 'run_in_threadpool', stubborn):
            task = asyncio.create_task(zero_proxy.api(self.request()))
            try:
                await entered.wait()
                done, _ = await asyncio.wait({task}, timeout=.45)
                self.assertTrue(done, 'the route must not await cancellation of a queued pool task')
                self.assert_deadline(task.result())
                self.assert_deadline(await zero_proxy.api(self.request()))
                self.assertEqual(len(scheduled), 1)
            finally:
                release.set()
                await asyncio.sleep(.02)
                if not task.done():
                    await task

    async def test_timed_out_running_worker_keeps_its_slot_until_it_exits(self):
        release = threading.Event()
        entered = threading.Event()
        finished = threading.Event()

        async def pool(function, *args, **kwargs):
            return await asyncio.to_thread(function, *args, **kwargs)

        def worker(*args, **kwargs):
            entered.set()
            try:
                release.wait(.8)
                return 200, {'quotes': {}}
            finally:
                finished.set()

        with mock.patch.object(quotes, 'get_quote_response', side_effect=worker) as quote, mock.patch.object(zero_proxy, 'run_in_threadpool', pool):
            task = asyncio.create_task(zero_proxy.api(self.request()))
            try:
                done, _ = await asyncio.wait({task}, timeout=.45)
                self.assertTrue(entered.is_set())
                self.assertTrue(done, 'the route deadline must not wait for the running thread')
                self.assert_deadline(task.result())
                self.assert_deadline(await zero_proxy.api(self.request()))
                self.assertEqual(quote.call_count, 1)
            finally:
                release.set()
                await asyncio.to_thread(finished.wait, .5)
                if not task.done():
                    await task
        self.assertTrue(self.slots.acquire(blocking=False))
        self.slots.release()
