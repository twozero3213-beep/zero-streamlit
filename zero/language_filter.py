# -*- coding: utf-8 -*-
"""한국어 및 영어 전용 텍스트 정제, 금융 오탈자·맞춤법 교정 및 한자 한글화 모듈.

규칙:
1. 영어와 한글을 제외한 다른 언어(일본어, 중국어, 아랍어, 키릴 문자 등)는 결과물에 나오지 않도록 엄격 필터링합니다.
2. 경제/증권 기사에서 빈출되는 1글자 국가·금융 한자(美, 韓, 日, 中 등)는 정확한 한글 단어로 치환합니다.
3. 잦은 오탈자, 띄어쓰기 오류, 깨진 HTML 엔티티를 정제합니다.
"""
import html
import re
from typing import Optional

# ── 1. 금융/시황 뉴스 한자 -> 한글 자동 변환 사전 ──
HANJA_TO_KOREAN = {
    # 국가 및 지역
    "美": "미국",
    "韓": "한국",
    "日": "일본",
    "中": "중국",
    "北": "북한",
    "歐": "유럽",
    "英": "영국",
    "露": "러시아",
    "印": "인도",
    "尹": "윤석열",
    "與": "여당",
    "野": "야당",
    "靑": "대통령실",
    # 금융 및 자산
    "株": "주식",
    "證": "증권",
    "銀": "은행",
    "債": "채권",
    "金": "금",
    "油": "유가",
    "車": "자동차",
    "電": "전자",
    "半": "반도체",
    "製": "제조",
    "藥": "제약",
    "生": "바이오",
    "房": "부동산",
    "稅": "세금",
    "物": "물가",
    "價": "가격",
    "率": "비율",
    "費": "비용",
    # 변동 및 방향
    "昇": "상승",
    "降": "하락",
    "急": "급변",
    "暴": "폭락",
    "續": "지속",
    "反": "반등",
    "新": "신규",
    "前": "이전",
    "後": "이후",
    "破": "돌파",
    "超": "초과",
    "低": "저",
    "高": "고",
    # 단위 및 숫자
    "兆": "조",
    "億": "억",
    "萬": "만",
    "年": "년",
    "月": "월",
}

# ── 2. 금융·경제 오탈자 및 맞춤법 교정 사전 ──
TYPO_CORRECTIONS = [
    # 속보 및 태그 정규화
    (re.compile(r"\[\s*속보\s*\]"), "[속보]"),
    (re.compile(r"\[\s*긴급\s*\]"), "[긴급]"),
    (re.compile(r"\[\s*단독\s*\]"), "[단독]"),
    (re.compile(r"\[\s*특징주\s*\]"), "[특징주]"),
    (re.compile(r"\[\s*1보\s*\]"), "[1보]"),
    (re.compile(r"\[\s*2보\s*\]"), "[2보]"),
    # 지수 및 통화 표기 정규화
    (re.compile(r"\b코스피지수\b"), "코스피 지수"),
    (re.compile(r"\b코스닥지수\b"), "코스닥 지수"),
    (re.compile(r"\b나스닥지수\b"), "나스닥 지수"),
    (re.compile(r"\b원달러\b"), "원/달러"),
    (re.compile(r"\b원엔\b"), "원/엔"),
    (re.compile(r"\b원유로\b"), "원/유로"),
    (re.compile(r"\b달러원\b"), "원/달러"),
    (re.compile(r"\b달러엔\b"), "달러/엔"),
    (re.compile(r"\b환율전망\b"), "환율 전망"),
    (re.compile(r"\b기준 금리\b"), "기준금리"),
    (re.compile(r"\b금리인하\b"), "금리 인하"),
    (re.compile(r"\b금리인상\b"), "금리 인상"),
    (re.compile(r"\b연방준비제도\(Fed\)\b"), "미국 연준(Fed)"),
    (re.compile(r"\b미연준\b"), "미국 연준"),
    (re.compile(r"\b한은\b"), "한국은행"),
    # 흔한 오탈자 및 띄어쓰기 오류
    (re.compile(r"\b되여\b"), "되어"),
    (re.compile(r"\b뵈요\b"), "봬요"),
    (re.compile(r"\b어의없는\b"), "어이없는"),
    (re.compile(r"\b몇일\b"), "며칠"),
    (re.compile(r"\b어떻해\b"), "어떡해"),
    (re.compile(r"\b인건가\b"), "인 건가"),
    (re.compile(r"\b뿐만아니라\b"), "뿐만 아니라"),
]

# 허용되는 문자 집합 정규식: 한글(완성형/자모), 영문(대소문자), 숫자, 안전한 문장부호/기호
# 일본어(가나), 중국어(미치환 한자), 아랍어, 키릴 문자 등 기타 외국어는 철저히 배제
ALLOWED_CHARS_REGEX = re.compile(
    r"[^\uac00-\ud7a3\u1100-\u11ff\u3130-\u318fA-Za-z0-9\s"
    r"\.,!\?:;'\-\_\(\)\[\]\{\}\<\>\/%\+\=\*·’‘“”~…₩\$€£¥]"
)


def replace_hanja(text: str) -> str:
    """기사 제목 및 본문의 한자를 한글로 안전하게 변환합니다."""
    if not text:
        return ""
    for hanja, korean in HANJA_TO_KOREAN.items():
        if hanja in text:
            text = text.replace(hanja, korean)
    return text


def clean_html_and_spaces(text: str) -> str:
    """HTML 엔티티 및 다중 공백을 정제합니다."""
    if not text:
        return ""
    text = html.unescape(text)
    # 잔여 엔티티 수동 변환
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"&amp;", '&', text)
    text = re.sub(r"&#39;", "'", text)
    text = re.sub(r"&lt;", '<', text)
    text = re.sub(r"&gt;", '>', text)
    # 다중 공백 압축
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def correct_typos_and_spelling(text: str) -> str:
    """오탈자 및 맞춤법을 정정합니다."""
    if not text:
        return ""
    for pattern, replacement in TYPO_CORRECTIONS:
        text = pattern.sub(replacement, text)
    return text


def filter_non_korean_english(text: str) -> str:
    """영어와 한글을 제외한 다른 언어(일본어, 중국어, 아랍어, 키릴 등) 문자를 완벽히 제거합니다."""
    if not text:
        return ""
    # 허용되지 않는 외래어 문자 제거
    cleaned = ALLOWED_CHARS_REGEX.sub("", text)
    # 공백 재정리
    return re.sub(r"\s+", " ", cleaned).strip()


def sanitize_text(text: Optional[str]) -> str:
    """
    통합 텍스트 정제 파이프라인:
    1. HTML 엔티티 및 공백 정제
    2. 주요 금융 한자 -> 한글 자동 변환
    3. 오탈자 및 맞춤법 정정
    4. 영어/한글 외 타 언어 문자 차단 및 필터링
    """
    if not text:
        return ""
    text = clean_html_and_spaces(str(text))
    text = replace_hanja(text)
    text = correct_typos_and_spelling(text)
    text = filter_non_korean_english(text)
    return text
