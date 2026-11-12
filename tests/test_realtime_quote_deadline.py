"""Whole-request quote deadlines with synthetic transports only."""
import concurrent.futures
import io
import json
from pathlib import Path
import subprocess
import sys
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from zero import realtime_stock_quote as rq


class Clock:
    def __init__(self):
        self.at = 100.0

    def now(self):
        return self.at

    def advance(self, seconds):
        self.at += seconds


class Process:
    def __init__(self, output=b"{}", communicate=None):
        self.output, self.respond = output, communicate
        self.returncode, self.killed = None, False
        self.calls = []

    def communicate(self, input=None, timeout=None):
        self.calls.append((input, timeout))
        value = self.respond(self, input, timeout) if self.respond is not None else (self.output, b"")
        if self.returncode is None:
            self.returncode = 0
        return value

    def kill(self):
        self.killed, self.returncode = True, -9

    def poll(self):
        return self.returncode


def quote(code, price, market="US", currency="USD"):
    return {"symbol": code, "identity": market + ":" + code, "market": market,
            "currency": currency, "current_price": price, "previous_close": price - 1,
            "market_time": "2026-11-12T00:00:00Z"}


def yahoo_body(price=100):
    return json.dumps({"chart": {"result": [{"meta": {"regularMarketPrice": price, "chartPreviousClose": 90}}]}}).encode()


class QuoteDeadlineTests(unittest.TestCase):
    def setUp(self):
        self.real_popen = subprocess.Popen
        for name in ("_QUOTE_CACHE", "_TOSS_TOKEN_CACHE", "_KIS_TOKEN_CACHE"):
            values = {} if name == "_QUOTE_CACHE" else {"token": None, "expires_at": 0}
            current = patch.dict(getattr(rq, name), values, clear=True)
            current.start()
            self.addCleanup(current.stop)
        self.slots = threading.BoundedSemaphore(8)
        for current in (patch.object(rq, "_get_zero_env", return_value={}),
                        patch.object(rq, "_HTTP_SLOTS", self.slots, create=True),
                        patch.object(rq, "_HTTP_PENDING", [], create=True),
                        patch.object(subprocess, "Popen", side_effect=AssertionError("UNEXPECTED_CHILD_HTTP")),
                        patch.object(rq.urllib.request, "urlopen", side_effect=AssertionError("UNEXPECTED_HTTP"))):
            current.start()
            self.addCleanup(current.stop)

    def read(self, *, deadline):
        self.assertTrue(callable(getattr(rq, "_read_json", None)), "bounded quote HTTP reader is missing")
        return rq._read_json(rq.urllib.request.Request("https://synthetic.invalid/quote"), deadline=deadline)

    def assert_slots_free(self):
        acquired = 0
        try:
            while acquired < 8 and self.slots.acquire(blocking=False):
                acquired += 1
        finally:
            for _ in range(acquired):
                self.slots.release()
        self.assertEqual(acquired, 8, "quote HTTP slot leaked")

    def test_expired_deadline_never_starts_http(self):
        with self.assertRaisesRegex(TimeoutError, "^QUOTE_DEADLINE$"):
            self.read(deadline=time.monotonic() - 1)
        self.assert_slots_free()

    def test_process_startup_consumes_the_same_remaining_deadline(self):
        clock, process = Clock(), Process(b'{"value": 1}')
        def start(*args, **kwargs):
            self.assertLessEqual(set(kwargs["env"]), {"SYSTEMROOT", "WINDIR", "PATH", "TEMP", "TMP"})
            self.assertEqual(args[0][1:6], ["-I", "-S", "-X", "utf8", "-c"])
            clock.advance(0.2)
            return process
        with patch.object(rq.time, "monotonic", clock.now), patch.object(subprocess, "Popen", side_effect=start):
            self.assertEqual(self.read(deadline=100.5), {"value": 1})
        self.assertAlmostEqual(process.calls[0][1], 0.3)
        self.assert_slots_free()

    def test_token_and_price_share_one_provider_budget(self):
        env = {"TOSS_APP_KEY": "SYNTHETIC", "TOSS_SECRET_KEY": "SYNTHETIC",
               "KIS_MOCK_APP_KEY": "SYNTHETIC", "KIS_MOCK_APP_SECRET": "SYNTHETIC"}
        for provider in ("toss", "kis"):
            with self.subTest(provider=provider):
                clock, deadlines = Clock(), []
                def read(request, *, deadline):
                    deadlines.append(deadline)
                    clock.advance(0.75)
                    if "token" in request.full_url:
                        return {"access_token": "SYNTHETIC", "expires_in": 3600}
                    return {"result": [], "output": {}}
                with patch.object(rq.time, "monotonic", clock.now), patch.object(rq, "_read_json", side_effect=read, create=True):
                    if provider == "toss":
                        rq._fetch_from_toss(["005930"], env, deadline=108.0)
                    else:
                        rq._fetch_from_kis_kr("005930", env, deadline=108.0)
                self.assertEqual(deadlines, [102.0, 102.0])

    def test_saved_holdings_chunks_share_one_total_budget(self):
        class Store:
            def snapshot(self):
                return {"holdings": [{"symbol": "S" + str(i)} for i in range(65)]}
        clock, deadlines, work = Clock(), [], []
        def fetch(symbols, *, deadline=None):
            deadlines.append(deadline)
            if deadline <= clock.now():
                return {}
            work.append(symbols)
            clock.advance(min(0.06, deadline - clock.now()))
            return {"005930": quote("005930", 100, "KR", "KRW")}
        with patch.object(rq.time, "monotonic", clock.now), patch.object(rq, "QUOTE_DEADLINE_SECONDS", 0.1, create=True), patch.object(rq, "fetch_multiple_quotes", side_effect=fetch):
            status, body = rq.get_live_quotes_endpoint(Store())
        self.assertEqual(status, 200)
        self.assertEqual(deadlines, [100.1, 100.1, 100.1])
        self.assertEqual(len(work), 2)
        self.assertAlmostEqual(clock.now(), 100.1)
        self.assertEqual([row["symbol"] for row in body["quotes"]], ["005930"])

    def test_stalled_child_is_killed_reaped_and_cannot_fill_quote_cache(self):
        for partial in (False, True):
            with self.subTest(partial=partial):
                processes = []
                code = "import sys,time; sys.stdin.buffer.read(); "
                if partial:
                    code += "sys.stdout.buffer.write(b'{\"late\":'); sys.stdout.buffer.flush(); "
                code += "time.sleep(10)"
                def start(command, **kwargs):
                    process = self.real_popen([*command[:-1], code], **kwargs)
                    processes.append(process)
                    return process
                with patch.object(rq, "QUOTE_DEADLINE_SECONDS", 0.08, create=True), patch.object(subprocess, "Popen", side_effect=start):
                    try:
                        started = time.monotonic()
                        status, body = rq.get_quote_response("/api/market/quote?identity=US:NVDA")
                        self.assertLess(time.monotonic() - started, 0.8)
                        self.assertEqual((status, body["quote"]), (503, None))
                    finally:
                        for process in processes:
                            if process.poll() is None:
                                process.kill()
                            process.communicate(timeout=2)
                self.assertTrue(processes)
                self.assertTrue(all(process.poll() is not None for process in processes))
                self.assertEqual(rq._QUOTE_CACHE, {})
                self.assert_slots_free()

    def test_saturated_slots_refuse_new_requests_without_queueing(self):
        entered, release = threading.Event(), threading.Event()
        lock, count = threading.Lock(), [0]
        def respond(process, input, timeout):
            with lock:
                count[0] += 1
                if count[0] == 8:
                    entered.set()
            release.wait(timeout=2)
            return b"{}", b""
        with patch.object(subprocess, "Popen", side_effect=lambda *a, **k: Process(communicate=respond)) as start:
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as callers:
                futures = [callers.submit(self.read, deadline=time.monotonic() + 2) for _ in range(8)]
                try:
                    self.assertTrue(entered.wait(timeout=1))
                    started = time.monotonic()
                    for _ in range(20):
                        with self.assertRaisesRegex(TimeoutError, "^QUOTE_DEADLINE$"):
                            self.read(deadline=time.monotonic() + 0.1)
                    self.assertLess(time.monotonic() - started, 0.5)
                    self.assertEqual(start.call_count, 8)
                finally:
                    release.set()
                for future in futures:
                    future.result(timeout=2)
            self.assertEqual(start.call_count, 8, "rejected requests were queued")
        self.assert_slots_free()

    def test_partial_success_preserves_valid_cache_and_discards_timeout_output(self):
        clock = Clock()
        cached = quote("NVDA", 100)
        rq._QUOTE_CACHE["NVDA"] = (cached, 1015)
        processes = []
        def respond(process, input, timeout):
            if process.killed:
                return yahoo_body(999), b""
            url = json.loads(input)["url"]
            if "naver" in url:
                return json.dumps({"datas": [{"closePrice": "100", "compareToPreviousClosePrice": "1", "fluctuationsRatio": "1"}]}).encode(), b""
            clock.advance(timeout)
            raise subprocess.TimeoutExpired("synthetic", timeout, output=yahoo_body(999))
        def start(*args, **kwargs):
            process = Process(communicate=respond)
            processes.append(process)
            return process
        with patch.object(rq.time, "time", return_value=1000), patch.object(rq.time, "monotonic", clock.now), patch.object(rq, "QUOTE_DEADLINE_SECONDS", 0.1, create=True), patch.object(subprocess, "Popen", side_effect=start):
            status, body = rq.get_quote_response("/api/market/quote?symbols=005930,NVDA,AAPL")
        self.assertEqual(status, 200)
        self.assertEqual(set(body["quotes"]), {"005930", "NVDA"})
        self.assertEqual(body["missing"], ["AAPL"])
        self.assertEqual(rq._QUOTE_CACHE["NVDA"], (cached, 1015))
        self.assertNotIn("AAPL", rq._QUOTE_CACHE)
        self.assertTrue(any(process.killed for process in processes))
        self.assert_slots_free()

    def test_already_exited_child_cleanup_errors_release_slot(self):
        for failure in ("kill", "pipe"):
            with self.subTest(failure=failure):
                def respond(process, input, timeout):
                    if process.killed:
                        raise OSError("synthetic closed pipe")
                    raise subprocess.TimeoutExpired("synthetic", timeout)
                process = Process(communicate=respond)
                def kill():
                    process.killed, process.returncode = True, -9
                    if failure == "kill":
                        raise ProcessLookupError("synthetic already exited")
                process.kill = kill
                with patch.object(subprocess, "Popen", return_value=process):
                    with self.assertRaises(OSError):
                        self.read(deadline=time.monotonic() + 1)
                self.assert_slots_free()

    def test_unconfirmed_child_keeps_slot_until_a_later_read_reaps_it(self):
        def respond(process, input, timeout):
            raise subprocess.TimeoutExpired("synthetic", timeout)
        process = Process(communicate=respond)
        def kill():
            raise PermissionError("synthetic child still running")
        process.kill = kill
        with patch.object(subprocess, "Popen", return_value=process):
            with self.assertRaises(TimeoutError):
                self.read(deadline=time.monotonic() + 1)
        self.assertEqual(rq._HTTP_PENDING, [process])
        acquired = 0
        try:
            while acquired < 8 and self.slots.acquire(blocking=False):
                acquired += 1
        finally:
            for _ in range(acquired):
                self.slots.release()
        self.assertEqual(acquired, 7, "unconfirmed child must retain admission")
        process.returncode = -9
        with self.assertRaises(TimeoutError):
            self.read(deadline=time.monotonic() - 1)
        self.assertEqual(rq._HTTP_PENDING, [])
        self.assert_slots_free()

    def test_oversized_or_non_object_child_output_is_rejected(self):
        for body in (json.dumps({"large": "x" * 1_000_001}).encode(), b"[]"):
            with self.subTest(size=len(body)), patch.object(subprocess, "Popen", return_value=Process(body)):
                with self.assertRaisesRegex(ValueError, "^QUOTE_SOURCE_INVALID$"):
                    self.read(deadline=time.monotonic() + 1)
                self.assert_slots_free()


    def test_child_enforces_body_limit_without_network_or_partial_stdout(self):
        self.assertIsInstance(getattr(rq, "_QUOTE_HTTP_CHILD", None), str)
        limit, observed = rq.MAX_QUOTE_BODY_BYTES, []
        class Body(io.BytesIO):
            consumed = 0
            def read1(self, size=-1):
                value = super().read1(size)
                self.consumed += len(value)
                return value
        body = Body(b'{"large":"' + b'x' * (limit + 1) + b'"}')
        class Opener:
            def open(self, request, timeout=None):
                return body
        def opener(*handlers):
            observed.append(handlers)
            return Opener()
        spec = {"url": "https://synthetic.invalid/quote", "method": "GET", "headers": {},
                "data": None, "timeout": rq.PROVIDER_TIMEOUT_SECONDS, "limit": limit}
        output = io.BytesIO()
        stdout = io.TextIOWrapper(output, encoding="utf8")
        with patch.object(sys, "stdin", io.StringIO(json.dumps(spec))), patch.object(sys, "stdout", stdout), \
                patch.object(time, "monotonic", return_value=0), \
                patch.object(rq.urllib.request, "build_opener", side_effect=opener):
            with self.assertRaises(SystemExit) as failure:
                exec(rq._QUOTE_HTTP_CHILD, {"__name__": "synthetic_quote_child"})
        self.assertEqual(failure.exception.code, 1)
        self.assertEqual(body.consumed, limit + 1)
        self.assertEqual(output.getvalue(), b"")
        self.assertTrue(body.closed)
        self.assertEqual(len(observed), 1)
        self.assertIsInstance(observed[0][0], rq.urllib.request.ProxyHandler)
        self.assertEqual(observed[0][0].proxies, {})
        self.assertIsInstance(observed[0][1], rq.urllib.request.HTTPRedirectHandler)
        self.assertIsNone(observed[0][1].redirect_request())
        self.assert_slots_free()



if __name__ == "__main__":
    unittest.main()
