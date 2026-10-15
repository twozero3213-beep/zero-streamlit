"""Headline language policy at the collector and browser boundaries; no live providers."""
from datetime import datetime, timezone
from functools import partial
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import threading
import time
import unittest
from unittest import mock
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import zero_discovery as discovery
import zero_headlines as headlines

NOW = datetime(2026, 10, 15, 1, tzinfo=timezone.utc)


def feed(*titles):
    root = ET.Element('rss')
    channel = ET.SubElement(root, 'channel')
    for index, title in enumerate(titles):
        item = ET.SubElement(channel, 'item')
        for key, value in {'title': title + ' - Reuters', 'source': 'Reuters',
                           'link': 'https://news.google.com/rss/articles/' + str(index),
                           'pubDate': 'Thu, 15 Oct 2026 00:00:00 GMT'}.items():
            ET.SubElement(item, key).text = value
    return ET.tostring(root, encoding='utf-8')


class HeadlineLanguageTests(unittest.TestCase):
    def collect(self, *titles, translate=lambda row: None, cached=lambda row: (False, None)):
        return headlines.collect(NOW, fetch=lambda url: feed(*titles), translate=translate, cached=cached)

    def test_explicit_unsupported_rss_language_cannot_pass_as_ascii_english(self):
        for location in ('root', 'channel', 'item', 'title', 'source', 'channel_language', 'item_language', 'dc_language'):
            with self.subTest(location=location):
                root = ET.fromstring(feed('La banque augmente les taux'))
                channel, item = root.find('channel'), root.find('./channel/item')
                if location == 'channel_language':
                    ET.SubElement(channel, 'language').text = 'fr'
                elif location == 'item_language':
                    ET.SubElement(item, 'language').text = 'fr'
                elif location == 'dc_language':
                    ET.SubElement(item, '{http://purl.org/dc/elements/1.1/}language').text = 'fr'
                else:
                    element = {'root': root, 'channel': channel, 'item': item,
                               'title': item.find('title'), 'source': item.find('source')}[location]
                    element.set('{http://www.w3.org/XML/1998/namespace}lang', 'fr')
                translate = mock.Mock(return_value='은행이 금리를 인상')
                cached = mock.Mock(return_value=(True, '은행이 금리를 인상'))
                value = headlines.collect(NOW, fetch=lambda url: ET.tostring(root), translate=translate, cached=cached)
                self.assertEqual(value['items'], [])
                translate.assert_not_called()
                cached.assert_not_called()

    def test_declared_english_and_korean_languages_remain_supported(self):
        for declared, title, translated in (('en-US', 'Congress approves budget', '의회 예산 승인'),
                                            ('ko-KR', '정부 경제 대책 발표', None)):
            with self.subTest(declared=declared):
                root = ET.fromstring(feed(title))
                root.set('{http://www.w3.org/XML/1998/namespace}lang', declared)
                channel, item = root.find('channel'), root.find('./channel/item')
                ET.SubElement(channel, 'language').text = declared
                item.set('{http://www.w3.org/XML/1998/namespace}lang', declared)
                value = headlines.collect(NOW, fetch=lambda url: ET.tostring(root),
                                          translate=lambda row: translated, cached=lambda row: (False, None))
                self.assertEqual([row['title'] for row in value['items']], [title])

    def test_foreign_item_is_removed_without_dropping_supported_sibling(self):
        root = ET.fromstring(feed('La banque augmente les taux', 'Congress approves budget'))
        ET.SubElement(root.find('channel'), 'language').text = 'en'
        root.find('./channel/item').set('{http://www.w3.org/XML/1998/namespace}lang', 'fr')
        value = headlines.collect(NOW, fetch=lambda url: ET.tostring(root),
                                  translate=lambda row: '의회 예산 승인', cached=lambda row: (False, None))
        self.assertEqual([row['title'] for row in value['items']], ['Congress approves budget'])

    def test_untranslated_english_is_omitted_on_failure_or_cached_failure(self):
        for cached in (lambda row: (False, None), lambda row: (True, None)):
            with self.subTest(cached=cached):
                value = self.collect('Congress approves budget', '정부 경제 대책 발표', cached=cached)
                self.assertEqual([row['title'] for row in value['items']], ['정부 경제 대책 발표'])

    def test_unsupported_scripts_and_empty_titles_never_reach_translation(self):
        translate = mock.Mock(return_value='정치 경제 뉴스')
        for title in ('中国经济增长', 'Российская экономика', '日本の経済', 'اقتصاد العالم',
                      'Économie en hausse', 'English 中文', '정부 中文 발표', '1234',
                      'English\u200b headline', 'English\u0301 headline', '정부 � 발표'):
            with self.subTest(title=title):
                self.assertEqual(self.collect(title, translate=translate)['items'], [])
        translate.assert_not_called()

    def test_invalid_cached_or_provider_translation_is_omitted(self):
        for translated in ('Congress approves budget', '翻译 제목', '<b>예산 승인</b>', '', None):
            for cache_hit in (True, False):
                with self.subTest(translated=translated, cache_hit=cache_hit):
                    value = self.collect('Congress approves budget', translate=lambda row: translated,
                                         cached=lambda row: (cache_hit, translated if cache_hit else None))
                    self.assertEqual(value['items'], [])

    def test_real_korean_translation_keeps_original_and_status(self):
        value = self.collect('Congress approves budget', translate=lambda row: '의회 예산 승인')
        row = value['items'][0]
        self.assertEqual((row['title'], row['title_ko'], row['translation_status']),
                         ('Congress approves budget', '의회 예산 승인', 'TRANSLATED'))

    def test_cached_translation_after_two_misses_survives_without_extra_requests(self):
        translate = mock.Mock(return_value=None)
        value = self.collect('Congress approves budget', 'Oil demand slumps', 'Inflation hits consumers',
                             translate=translate,
                             cached=lambda row: (True, '물가 상승이 소비자에게 타격') if row['title'] == 'Inflation hits consumers' else (False, None))
        self.assertEqual([row['title'] for row in value['items']], ['Inflation hits consumers'])
        self.assertEqual(translate.call_count, 2)

    def test_existing_translation_cache_and_byte_budget_are_reused(self):
        with TemporaryDirectory() as tmp:
            store = Path(tmp) / 'translations.json'
            payload = json.dumps({'responseStatus': 200, 'quotaFinished': False,
                                  'responseData': {'translatedText': '의회 예산 승인'}}).encode()
            fetch = mock.Mock(return_value=payload)
            translate = partial(discovery.translate_public_headline, store=store, fetch=fetch, now=100000)
            cached = partial(discovery.cached_public_headline, store=store, now=100000)
            first = self.collect('Congress approves budget', translate=translate, cached=cached)
            second = self.collect('Congress approves budget', translate=translate, cached=cached)
            self.assertEqual(first['items'], second['items'])
            self.assertEqual(first['items'][0]['title_ko'], '의회 예산 승인')
            self.assertEqual(fetch.call_count, 1)
            state = json.loads(store.read_text(encoding='utf-8'))
            self.assertEqual(state['charges'], [[100000, 24]])
            state['charges'] = [[100000, 500]] * 8
            state['cache'] = {}
            store.write_text(json.dumps(state), encoding='utf-8')
            self.assertEqual(self.collect('Congress approves budget', translate=translate, cached=cached)['items'], [])
            self.assertEqual(fetch.call_count, 1)

    def test_deadline_snapshot_retains_only_korean_and_cached_translations(self):
        entered, release = threading.Event(), threading.Event()
        def translate(row):
            entered.set()
            release.wait(timeout=2)
            return '늦게 도착한 번역'
        try:
            with mock.patch.object(headlines, 'COLLECT_SECONDS', 0.08):
                value = self.collect('Congress approves budget', '정부 경제 대책 발표', 'Oil demand slumps',
                                     translate=translate,
                                     cached=lambda row: (True, '원유 수요 하락') if row['title'] == 'Oil demand slumps' else (False, None))
            self.assertTrue(entered.is_set())
            self.assertEqual({row['title'] for row in value['items']}, {'정부 경제 대책 발표', 'Oil demand slumps'})
            before = json.dumps(value, ensure_ascii=False)
        finally:
            release.set()
            for _ in range(200):
                if not headlines._collect_lock.locked():
                    break
                time.sleep(0.005)
        self.assertFalse(headlines._collect_lock.locked())
        self.assertEqual(json.dumps(value, ensure_ascii=False), before)

    def test_browser_hides_legacy_untranslated_or_foreign_rows_and_formats_translation(self):
        program = r"""
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.hidden = false; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  before(panel) { this.panel = panel; }
  closest() { return this.group || null; }
}
async function render(items, wrapped=true) {
  const anchor = new Element('div'), group = new Element('div');
  group.parentElement = {classList:{contains:name=>name==='viewport-pages-body'}};
  if(wrapped) anchor.group=group;
  const document = {hidden:false, documentElement:{dataset:{zeroView:'news'}},
    getElementById:id => id === 'news-list' ? anchor : new Element('div'),
    createElement:tag => new Element(tag), addEventListener(){}, querySelectorAll:()=>[]};
  vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), {
    document, Intl, Date, AbortSignal, setInterval(){},
    fetch:async()=>({ok:true,json:async()=>({schema_version:1,items,checked_at:'2026-10-15T00:00:00Z'})})
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(anchor.panel, wrapped ? undefined : anchor.panel, 'wrapped live headlines are a separate page, not inside the news archive');
  return wrapped ? group.panel : anchor.panel;
}
(async()=>{
  const base={url:'https://news.google.com/rss/articles/x',market:'미국',publisher:'Reuters',published_at:'2026-10-15T00:00:00Z'};
  const bad=[
    {...base,title:'Congress approves budget',title_ko:null,translation_status:'PENDING'},
    {...base,title:'Congress approves budget',title_ko:'Same English',translation_status:'TRANSLATED'},
    {...base,title:'中国经济增长',title_ko:'중국 경제 성장',translation_status:'TRANSLATED'},
    {...base,title:'정부 中文 발표'},
    {...base,title:'Congress approves budget',title_ko:'의회 예산 승인',translation_status:'PENDING'},
    {...base,title:'Congress approves budget',title_ko:'예산 中文',translation_status:'TRANSLATED'},
    {...base,title:'Économie en hausse',title_ko:'경제 상승',translation_status:'TRANSLATED'},
    {...base,title:'정부 � 발표'},
    {...base,title:'Congress approves budget',title_ko:'<b>예산 승인</b>',translation_status:'TRANSLATED'}
  ];
  const panel=await render([...bad,
    {...base,title:'정부 경제 대책 발표',title_ko:'append nothing'},
    {...base,title:'Congress approves budget',title_ko:'의회 예산 승인',translation_status:'TRANSLATED'}]);
  const labels=panel.children[2].children.map(row=>row.children[0].textContent);
  assert.deepEqual(labels,['정부 경제 대책 발표','Congress approves budget (의회 예산 승인)']);
  assert.equal(panel.hidden,false);
  assert.equal(panel.children[2].id,'live-headlines-list','live rows participate in the existing responsive pager');
  assert.equal((await render([{...base,title:'한국 경제 뉴스'}],false)).hidden,false,'plain layouts retain the original insertion fallback');
  assert.equal((await render(bad)).hidden,true);
  assert.equal((await render([])).hidden,true);
})().catch(error=>{console.error(error);process.exitCode=1;});
"""
        result = subprocess.run(['node', '-e', program, str(ROOT / 'extras' / 'headlines.js')],
                                capture_output=True, text=True, encoding='utf-8', timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
