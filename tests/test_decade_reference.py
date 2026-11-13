"""10년 전 1억 참고 계산: 합성 월봉으로 손계산 값과 맞춘다. 네트워크를 쓰지 않는다."""
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
import json
import threading
import time
import unittest
from unittest.mock import patch

from zero import decade_reference as decade


def months(count, start_year=2016, start_month=12):
    out, year, month = [], start_year, start_month
    for _ in range(count):
        out.append(f'{year:04d}-{month:02d}-01')
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return out


def stamp(day):
    return int(datetime.fromisoformat(day + 'T00:00:00+00:00').timestamp())


def payload(days, values, adjusted=True):
    indicators = {'adjclose': [{'adjclose': values}], 'quote': [{'close': values}]} if adjusted else {'quote': [{'close': values}]}
    return {'chart': {'result': [{'timestamp': [stamp(day) for day in days], 'indicators': indicators}]}}


class DecadeReferenceTests(unittest.TestCase):
    def setUp(self):
        self.days = months(120)
        self.slots = threading.BoundedSemaphore(2)
        for current in (patch.dict(decade._cache, {"at": 0, "body": None}, clear=True),
                        patch.object(decade, "_pending", None),
                        patch.object(decade, "_history_slots", self.slots)):
            current.start()
            self.addCleanup(current.stop)

    def tearDown(self):
        end = time.monotonic() + 3
        acquired = 0
        while time.monotonic() < end:
            acquired = 0
            while acquired < 2 and self.slots.acquire(blocking=False):
                acquired += 1
            for _ in range(acquired):
                self.slots.release()
            if acquired == 2:
                break
            time.sleep(0.005)
        self.assertEqual(acquired, 2, "history jobs must finish before fixture restoration")
        self.assertIsNone(decade._pending)

    def test_lump_sum_matches_hand_calculation(self):
        # 가격 100 -> 400(4배), 환율 1000 -> 1200(1.2배): 원화로 4.8배, 1억 -> 4억 8천만원.
        prices = list(zip(self.days, [100 + 300 * index / 119 for index in range(120)]))
        fx = list(zip(self.days, [1000 + 200 * index / 119 for index in range(120)]))
        result = decade.lump_sum(prices, fx)
        self.assertAlmostEqual(result['return_percent_usd'], 300.0)
        self.assertAlmostEqual(result['return_percent_krw'], 380.0)
        self.assertEqual(result['value_krw'], 480_000_000)
        self.assertEqual((result['start_date'], result['end_date']), (self.days[0], self.days[-1]))
        self.assertEqual(result['points'][0], {'date': self.days[0], 'value_krw': 100_000_000})
        self.assertEqual(result['points'][-1]['value_krw'], 480_000_000)
        self.assertEqual(len(result['points']), 12)  # 시작 달, 2017~2026년 1월 10번, 마지막 달
        self.assertEqual(result['max_drawdown_percent_krw'], 0.0, '계속 오르기만 한 기록')

    def test_drawdown_uses_krw_month_end_values(self):
        # 원화 평가액: 100 -> 200 -> 50 -> 300. 고점 200에서 50까지 75% 하락.
        prices = list(zip(self.days, [100.0] * 30 + [200.0] * 30 + [50.0] * 30 + [300.0] * 30))
        fx = list(zip(self.days, [1000.0] * 120))
        self.assertAlmostEqual(decade.lump_sum(prices, fx)['max_drawdown_percent_krw'], 75.0)
        # 달러 값은 그대로여도 환율이 반으로 떨어지면 원화 기준 50% 하락이다.
        prices = list(zip(self.days, [100.0] * 120))
        fx = list(zip(self.days, [1000.0] * 60 + [500.0] * 60))
        self.assertAlmostEqual(decade.lump_sum(prices, fx)['max_drawdown_percent_krw'], 50.0)

    def test_short_or_unmatched_history_is_refused(self):
        prices = list(zip(self.days, [100.0] * 120))
        fx = list(zip(self.days, [1000.0] * 120))
        self.assertIsNone(decade.lump_sum(prices[:109], fx), '10년에 못 미치는 기록')
        self.assertIsNone(decade.lump_sum(prices, fx[:1]))
        self.assertIsNone(decade.lump_sum(prices, fx[5:]), '시작 달 환율이 없으면 계산하지 않는다')
        self.assertIsNone(decade.lump_sum([], []))

    def test_series_parser_drops_bad_rows_and_broken_payloads(self):
        days = self.days[:4]
        rows = decade.monthly_series(payload(days, [10.0, None, 0, 12.5]))
        self.assertEqual(rows, [(days[0], 10.0), (days[3], 12.5)])
        self.assertEqual(decade.monthly_series({}), [])
        self.assertEqual(decade.monthly_series({'chart': {'result': []}}), [])
        self.assertEqual(decade.monthly_series(payload(days, [1.0, 2.0, 3.0, 4.0], adjusted=False), adjusted=False)[-1], (days[3], 4.0))

    def test_build_reports_only_what_was_computed(self):
        now = datetime(2026, 11, 10, tzinfo=timezone.utc)

        def fetch(symbol):
            if symbol == 'SOXL':
                raise OSError('synthetic outage')
            if symbol == 'SCHD':
                return payload(self.days[:50], [100.0] * 50)
            values = [1000.0] * 120 if symbol == decade.FX_SYMBOL else [100.0 + index for index in range(120)]
            return payload(self.days, values, adjusted=symbol != decade.FX_SYMBOL)

        status, body = decade.build(fetch, now)
        self.assertEqual(status, 200)
        self.assertEqual([item['label'] for item in body['items']], ['S&P 500', 'TQQQ'])
        self.assertEqual(body['failed'], ['SOXL', 'SCHD'])
        self.assertEqual(body['items'][0]['value_krw'], 219_000_000)
        self.assertIs(body['orders_authorized'], False)
        self.assertEqual(body['retrieved_at'], now.isoformat())
        self.assertNotIn('synthetic outage', str(body), '원인 문구를 응답에 싣지 않는다')

        def broken(symbol):
            raise OSError('down')

        status, body = decade.build(broken, now)
        self.assertEqual((status, body['state'], body['items']), (503, 'UNAVAILABLE', []))


    def test_first_build_overlaps_at_most_two_history_reads(self):
        entered, release = threading.Event(), threading.Event()
        lock, counts = threading.Lock(), {"active": 0, "maximum": 0, "calls": 0}
        def fetch(symbol):
            with lock:
                counts["active"] += 1
                counts["calls"] += 1
                counts["maximum"] = max(counts["maximum"], counts["active"])
                if counts["active"] == 2:
                    entered.set()
            try:
                release.wait(timeout=3)
                values = [1000.0] * 120 if symbol == decade.FX_SYMBOL else [100.0 + i for i in range(120)]
                return payload(self.days, values, adjusted=symbol != decade.FX_SYMBOL)
            finally:
                with lock:
                    counts["active"] -= 1
        with ThreadPoolExecutor(max_workers=1) as caller:
            future = caller.submit(decade.build, fetch)
            try:
                self.assertTrue(entered.wait(timeout=1), "initial histories are still fetched serially")
            finally:
                release.set()
            status, body = future.result(timeout=3)
        self.assertEqual((status, len(body["items"])), (200, 4))
        self.assertEqual((counts["calls"], counts["maximum"]), (5, 2))

    def test_network_histories_share_one_absolute_deadline(self):
        clock, work, lock = [100.0], [], threading.Lock()
        def read(request, *, deadline):
            with lock:
                if clock[0] >= deadline:
                    raise TimeoutError("synthetic deadline")
                work.append(deadline)
                clock[0] += 3
            symbol = request.full_url.split('/chart/', 1)[1].split('?', 1)[0]
            values = [1000.0] * 120 if symbol == decade.FX_SYMBOL else [100.0 + i for i in range(120)]
            return payload(self.days, values, adjusted=symbol != decade.FX_SYMBOL)
        with patch.object(decade.time, "monotonic", side_effect=lambda: clock[0]), \
                patch.object(decade, "_read_json", side_effect=read, create=True), \
                patch.object(decade.urllib.request, "urlopen", side_effect=OSError("UNEXPECTED_HTTP")):
            status, body = decade.build()
        self.assertEqual(work, [108.0, 108.0, 108.0])
        self.assertIn(status, (200, 503))
        self.assertLess(len(body["items"]), 4)
        self.assertTrue(body["failed"])

    def test_concurrent_cache_misses_share_one_build(self):
        entered, release, looked = threading.Event(), threading.Event(), threading.Event()
        real_lock, readers = threading.Lock(), set()
        class ObservedLock:
            def __enter__(self):
                real_lock.acquire()
                readers.add(threading.get_ident())
                if len(readers) == 8:
                    looked.set()
            def __exit__(self, *args):
                real_lock.release()
        def build(**kwargs):
            entered.set()
            release.wait(timeout=3)
            return 200, {"state": "AVAILABLE", "items": [{"symbol": "SPY"}]}
        with patch.dict(decade._cache, {"at": 0, "body": None}, clear=True), \
                patch.object(decade, "_lock", ObservedLock()), patch.object(decade, "build", side_effect=build) as collect:
            with ThreadPoolExecutor(max_workers=8) as callers:
                futures = [callers.submit(decade.get_decade_reference) for _ in range(8)]
                try:
                    self.assertTrue(entered.wait(timeout=1))
                    self.assertTrue(looked.wait(timeout=2))
                finally:
                    release.set()
                results = [future.result(timeout=3) for future in futures]
        self.assertEqual(collect.call_count, 1)
        self.assertTrue(all(result == results[0] for result in results))


    def test_cache_failure_retry_and_six_hour_expiry_preserve_prior_body(self):
        old = {"state": "AVAILABLE", "items": [{"symbol": "SPY"}], "retrieved_at": "old"}
        fresh = {**old, "retrieved_at": "fresh"}
        updated = {**old, "retrieved_at": "updated"}
        failed = {"state": "UNAVAILABLE", "items": []}
        decade._cache.update(at=0, body=old)
        with patch.object(decade.time, "time", return_value=100000) as clock, \
                patch.object(decade, "build", side_effect=[(503, failed), RuntimeError("synthetic failure"), (200, fresh), (200, updated)]) as collect:
            self.assertEqual(decade.get_decade_reference(), (503, failed))
            self.assertIs(decade._cache["body"], old)
            with self.assertRaisesRegex(RuntimeError, "synthetic failure"):
                decade.get_decade_reference()
            self.assertIsNone(decade._pending)
            self.assertEqual(decade.get_decade_reference(), (200, fresh))
            clock.return_value = 100000 + decade.CACHE_SECONDS - 1
            self.assertEqual(decade.get_decade_reference(), (200, fresh))
            self.assertEqual(collect.call_count, 3)
            clock.return_value += 1
            self.assertEqual(decade.get_decade_reference(), (200, updated))
            self.assertEqual(collect.call_count, 4)

    def test_expired_running_histories_do_not_queue_retries_or_change_cache(self):
        entered, release = threading.Event(), threading.Event()
        clock, calls, lock = [100.0], [], threading.Lock()
        old = {"state": "AVAILABLE", "items": [{"symbol": "SPY"}], "retrieved_at": "old"}
        decade._cache.update(at=0, body=old)
        source = payload(self.days, [100.0] * 120)
        def read(request, *, deadline):
            with lock:
                calls.append(request.full_url)
                if len(calls) == 2:
                    entered.set()
            release.wait(timeout=3)
            return source
        def expire(futures, **kwargs):
            self.assertTrue(entered.wait(timeout=2), "both fixed workers must enter before expiry")
            clock[0] = 109.0
            return set(), set(futures)
        try:
            with patch.object(decade.time, "time", return_value=100000), \
                    patch.object(decade.time, "monotonic", side_effect=lambda: clock[0]), \
                    patch.object(decade, "_read_json", side_effect=read), patch.object(decade, "wait", side_effect=expire):
                self.assertEqual(decade.get_decade_reference()[0], 503)
                self.assertEqual(decade.get_decade_reference()[0], 503)
                self.assertEqual(len(calls), 2, "busy workers must not accumulate new history jobs")
                self.assertIs(decade._cache["body"], old)
        finally:
            release.set()
            end = time.monotonic() + 2
            while time.monotonic() < end:
                acquired = 0
                while acquired < 2 and self.slots.acquire(blocking=False):
                    acquired += 1
                for _ in range(acquired):
                    self.slots.release()
                if acquired == 2:
                    break
                time.sleep(0.005)
            self.assertEqual(acquired, 2, "history admission did not recover")
        self.assertIs(decade._cache["body"], old, "late histories must not overwrite cached reference")

    def test_cancelled_queued_histories_release_admission(self):
        clock, submitted = [100.0], []
        class QueuedPool:
            def submit(self, *args):
                future = Future()
                submitted.append(future)
                return future
        def expire(futures, **kwargs):
            clock[0] = 109.0
            return set(), set(futures)
        with patch.object(decade, "_history_pool", QueuedPool()), \
                patch.object(decade.time, "monotonic", side_effect=lambda: clock[0]), \
                patch.object(decade, "wait", side_effect=expire):
            self.assertEqual(decade.build()[0], 503)
        self.assertEqual(len(submitted), 2)
        self.assertTrue(all(future.cancelled() for future in submitted))
        acquired = 0
        try:
            while acquired < 2 and self.slots.acquire(blocking=False):
                acquired += 1
        finally:
            for _ in range(acquired):
                self.slots.release()
        self.assertEqual(acquired, 2)

    def test_default_transport_reuses_bounded_reader_without_credentials(self):
        source = payload(self.days, [1000.0] * 120, adjusted=False)
        sent = []
        class Process:
            returncode = 0
            def communicate(self, input=None, timeout=None):
                sent.append((json.loads(input), timeout))
                return json.dumps(source).encode(), None
            def poll(self):
                return 0
        with patch("subprocess.Popen", return_value=Process()), \
                patch("zero.realtime_stock_quote._get_zero_env", side_effect=AssertionError("CREDENTIAL_LOADER_FORBIDDEN")):
            actual = decade._fetch(decade.FX_SYMBOL, deadline=time.monotonic() + 8)
        self.assertEqual(actual, source)
        self.assertEqual(len(sent), 1)
        self.assertIn('/chart/KRW=X?', sent[0][0]["url"])
        self.assertLessEqual(sent[0][1], 2)


if __name__ == '__main__':
    unittest.main()
