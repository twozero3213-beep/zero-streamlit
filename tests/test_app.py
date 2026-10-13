"""Smoke test the viewer and guard the public data folder against private material."""
import json
import re
import unittest
from pathlib import Path

from streamlit.testing.v1 import AppTest

ROOT = Path(__file__).resolve().parents[1]
TIMEOUT = 240  # the first import of streamlit is slow on a loaded machine
ALLOWED = {'briefing_sources.json', 'crisis_history.json', 'research_connections.json',
           'research_tools.json', 'team_staff.json', 'us_data_sources.json'}
# Account/credential shapes that must never reach a public app.
FORBIDDEN = [r'[\w.+-]+@[\w-]+\.[\w.]+', r'\b\d{8}-\d{2}\b', r'(?i)(app_?secret|api[_-]?key|access[_-]?token|authorization)\s*[:=]',
             r'(?i)\bcano\b|acnt_prdt|계좌번호', r'[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}']


class ViewerTests(unittest.TestCase):
    def test_app_renders_every_tab_without_error(self):
        app = AppTest.from_file(str(ROOT / 'streamlit_app.py'), default_timeout=TIMEOUT).run()
        self.assertFalse(app.exception, app.exception)
        self.assertEqual(len(app.tabs), 5)
        self.assertGreaterEqual(len(app.dataframe), 3)

    def test_search_filters_references(self):
        app = AppTest.from_file(str(ROOT / 'streamlit_app.py'), default_timeout=TIMEOUT).run()
        app.text_input[0].set_value('vnpy').run()
        self.assertFalse(app.exception)
        self.assertTrue(any('1개' in c.value or '2개' in c.value for c in app.caption))

    def test_internal_fields_are_not_published(self):
        staff = json.loads((ROOT / 'data' / 'team_staff.json').read_text(encoding='utf-8'))
        for s in staff['staff']:
            self.assertFalse({'work_order', 'existing_modules', 'missing_evidence', 'acceptance', 'current_coverage'} & set(s))
        crisis = json.loads((ROOT / 'data' / 'crisis_history.json').read_text(encoding='utf-8'))
        for e in crisis['events']:
            self.assertFalse({'data_gaps', 'publication_limits', 'entries'} & set(e))

    def test_data_folder_is_the_public_allowlist_and_clean(self):
        files = {p.name for p in (ROOT / 'data').iterdir()}
        self.assertEqual(files, ALLOWED)
        for name in files:
            text = (ROOT / 'data' / name).read_text(encoding='utf-8')
            for pattern in FORBIDDEN:
                self.assertIsNone(re.search(pattern, text), f'{name}: {pattern}')


if __name__ == '__main__':
    unittest.main()
