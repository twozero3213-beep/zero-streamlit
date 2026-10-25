# -*- coding: utf-8 -*-
"""24시간 속보·단독 기사 감시, 공신력 기반 중복 제거 및 단일 출처 선별 엔진.

비용 0원 원칙: 유료 API를 전혀 사용하지 않고 오픈 RSS/웹 피드 및 텍스트 유사도 알고리즘으로 작동합니다.
"""
from dataclasses import dataclass, field
from datetime import datetime
import re
from typing import Dict, List, Optional, Set


@dataclass
class NewsItem:
    id: str
    title: str
    publisher: str
    url: str
    published_at: str
    summary: str = ""
    is_breaking: bool = False  # 속보 여부
    is_exclusive: bool = False  # 단독 여부
    authority_score: int = 50  # 언론사 공신력 점수 (기본 50)


# ── 언론사 공신력 티어 정의 (1티어: 90~100점, 2티어: 70~85점, 3티어: 50점) ──
PUBLISHER_AUTHORITY_MAP: Dict[str, int] = {
    # 1티어: 국가 기간 통신사, 글로벌 최상위 금융 통신사, 1등 경제지
    "연합뉴스": 100,
    "로이터": 98,
    "Reuters": 98,
    "블룸버그": 98,
    "Bloomberg": 98,
    "한국경제": 92,
    "매일경제": 92,
    "조선일보": 90,
    "중앙일보": 90,
    "동아일보": 90,
    "AP": 95,
    "WSJ": 95,

    # 2티어: 지상파/보도전문채널 및 주요 경제지
    "KBS": 85,
    "MBC": 85,
    "SBS": 85,
    "YTN": 85,
    "연합뉴스TV": 85,
    "머니투데이": 80,
    "이데일리": 80,
    "서울경제": 80,
    "헤럴드경제": 78,
    "파이낸셜뉴스": 78,
    "아시아경제": 75,
    "뉴시스": 78,

    # 3티어: 온라인 전문지 및 기타 미디어
    "디지털타임스": 65,
    "전자신문": 65,
    "인포맥스": 75,
}

# 속보·단독 판별 정규식 패턴
BREAKING_PATTERN = re.compile(r"\[속보\]|\[긴급\]|\[특징주\]|\[1보\]|\[2보\]|Breaking", re.IGNORECASE)
EXCLUSIVE_PATTERN = re.compile(r"\[단독\]|\[단독입수\]|\[단독포착\]|Exclusive", re.IGNORECASE)


class BreakingNewsEngine:
    """24시간 속보 감시 및 공신력 기반 중복 제거 엔진 (메모리 누수 방지 버퍼 탑재)"""

    MAX_BUFFER_LIMIT: int = 500  # 메모리 고갈 방지 최대 버퍼 상한
    DEFAULT_MAX_OUTPUT: int = 50  # 반환 최대 기사 수

    def __init__(self, jaccard_threshold: float = 0.25, max_output_items: int = 50):
        """
        jaccard_threshold: 두 기사 제목 간의 문자/단어 집합 유사도 임계치 (기본 0.25 이상이면 동일 사건으로 판정)
        max_output_items: 반환할 최대 기사 수 (메모리 및 네트워크 누수 방지)
        """
        self.jaccard_threshold = jaccard_threshold
        self.max_output_items = max_output_items

    @classmethod
    def clean_title(cls, title: str) -> str:
        """기사 제목에서 특수문자 및 태그 정제"""
        if not title:
            return ""
        cleaned = re.sub(r"\[.*?\]|\(.*?\)|<.*?>", " ", str(title))
        cleaned = re.sub(r"[^\w\s]", " ", cleaned)
        return " ".join(cleaned.split()).lower()

    @classmethod
    def tokenize(cls, text: str) -> Set[str]:
        """한국어 및 영어 혼합 제목의 핵심 단어 및 문자 bi-gram 토큰 집합 추출 (조사·어미 변화에 강건)"""
        if not text:
            return set()
        cleaned = cls.clean_title(text)
        words = cleaned.split()
        tokens = set()
        for w in words:
            if len(w) >= 2:
                tokens.add(w)
                # 2글자 이상 단어의 문자 2-gram 추출
                for i in range(len(w) - 1):
                    tokens.add(w[i:i+2])
            elif len(w) == 1 and re.match(r"[\uac00-\ud7a3\u4e00-\u9fffA-Za-z0-9]", w):
                # 1글자 국가명/단어 (美, 韓 등) 보존
                tokens.add(w)
        return tokens

    @classmethod
    def calculate_jaccard_similarity(cls, set_a: Set[str], set_b: Set[str]) -> float:
        """자카드 유사도(Jaccard Similarity) 계산: |A ∩ B| / |A ∪ B|"""
        if not set_a or not set_b:
            return 0.0
        intersection = len(set_a.intersection(set_b))
        union = len(set_a.union(set_b))
        return intersection / union if union > 0 else 0.0

    @classmethod
    def evaluate_authority(cls, publisher: str) -> int:
        """언론사 이름을 바탕으로 공신력 점수 산출"""
        for pub, score in PUBLISHER_AUTHORITY_MAP.items():
            if pub in publisher:
                return score
        return 50  # 미등록 언론사 기본값

    def process_raw_item(self, raw_item: Dict[str, str]) -> NewsItem:
        """원시 뉴스 데이터를 NewsItem으로 파싱 및 속보·단독·공신력 평가"""
        title = str(raw_item.get("title") or "")
        publisher = str(raw_item.get("publisher") or "일반")
        url = str(raw_item.get("url") or "")
        published_at = str(raw_item.get("published_at") or datetime.now().isoformat())
        summary = str(raw_item.get("summary") or "")

        is_breaking = bool(BREAKING_PATTERN.search(title))
        is_exclusive = bool(EXCLUSIVE_PATTERN.search(title))
        score = self.evaluate_authority(publisher)

        # 속보/단독인 경우 가산점 (속보 +5점, 단독 +5점)
        if is_breaking:
            score += 5
        if is_exclusive:
            score += 5

        item_id = raw_item.get("id", f"{publisher}_{hash(title)}")
        return NewsItem(
            id=item_id,
            title=title,
            publisher=publisher,
            url=url,
            published_at=published_at,
            summary=summary,
            is_breaking=is_breaking,
            is_exclusive=is_exclusive,
            authority_score=score
        )

    def deduplicate_and_rank(self, items: List[NewsItem]) -> List[NewsItem]:
        """
        제목이 달라도 같은 내용인 기사들을 묶고(Clustering),
        각 클러스터에서 가장 공신력이 높은 단 하나의 대표 기사만 선별합니다.
        """
        if not items:
            return []

        # 1. 기사 토큰화
        tokenized = [(item, self.tokenize(item.title)) for item in items]

        # 2. 클러스터링 (유사도 기준 그룹화)
        clusters: List[List[NewsItem]] = []
        cluster_tokens: List[Set[str]] = []

        for item, tokens in tokenized:
            matched_cluster_idx = -1
            max_sim = 0.0

            for idx, c_toks in enumerate(cluster_tokens):
                sim = self.calculate_jaccard_similarity(tokens, c_toks)
                if sim >= self.jaccard_threshold and sim > max_sim:
                    max_sim = sim
                    matched_cluster_idx = idx

            if matched_cluster_idx >= 0:
                # 기존 클러스터에 포함 및 토큰 확장
                clusters[matched_cluster_idx].append(item)
                cluster_tokens[matched_cluster_idx].update(tokens)
            else:
                # 신규 클러스터 생성
                clusters.append([item])
                cluster_tokens.append(set(tokens))

        # 3. 각 클러스터에서 공신력 최고 기사 1건만 선별
        final_selected: List[NewsItem] = []
        for cluster in clusters:
            # 공신력 점수 내림차순 정렬, 동점일 경우 속보/단독 우선
            best_item = max(
                cluster,
                key=lambda x: (x.authority_score, x.is_breaking, x.is_exclusive)
            )
            final_selected.append(best_item)

        # 4. 전체 선별 기사 정렬 (속보 우선 -> 공신력 순)
        final_selected.sort(key=lambda x: (x.is_breaking, x.authority_score), reverse=True)
        # 메모리 누수 방지: 최대 반환 기사 수(기본 50건)로 엄격 제한
        return final_selected[:self.max_output_items]
