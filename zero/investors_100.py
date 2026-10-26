# -*- coding: utf-8 -*-
"""100 World-Famous Legendary Investors Council & Research Engine.
전 세계 금융 역사상 가장 위대한 100인의 투자자를 AI 리서치 센터에 소집하여
실시간 시장 분석, 학파별 합의 도출, 증류강화학습 교사(Teacher) 모델로 운용합니다.
"""
from dataclasses import asdict, dataclass
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


DATA_DIR = Path(__file__).resolve().parent / "data"
INVESTORS_PATH = DATA_DIR / "investors_100.json"


_INVESTORS_CACHE: Optional[Dict[str, Any]] = None


def load_investors_data() -> Dict[str, Any]:
    """100인 투자자 데이터베이스 로드 및 캐싱"""
    global _INVESTORS_CACHE
    if _INVESTORS_CACHE is None:
        if not INVESTORS_PATH.exists():
            raise FileNotFoundError(f"Missing investors data file: {INVESTORS_PATH}")
        _INVESTORS_CACHE = json.loads(INVESTORS_PATH.read_text(encoding="utf-8"))
    return _INVESTORS_CACHE


def get_all_investors() -> List[Dict[str, Any]]:
    """100인 투자자 전원 목록 반환"""
    data = load_investors_data()
    return list(data.get("investors", []))


def get_investor_by_id(investor_id: str) -> Optional[Dict[str, Any]]:
    """투자자 ID로 개별 투자자 정보 조회"""
    for inv in get_all_investors():
        if inv["id"] == investor_id:
            return inv
    return None


def get_investors_by_category(category: str) -> List[Dict[str, Any]]:
    """투자 학파/카테고리별 투자자 목록 필터링"""
    return [inv for inv in get_all_investors() if inv.get("category") == category]


@dataclass
class InvestorEvaluation:
    """개별 투자자의 시장 분석 평가 결과"""
    investor_id: str
    name: str
    name_kr: str
    category: str
    category_kr: str
    organization: str
    sentiment_score: float  # 0.0 (극단적 비관) ~ 100.0 (극단적 낙관)
    outlook: str  # BULLISH, CAUTIOUS, NEUTRAL, DEFENSIVE
    target_weights: Dict[str, float]  # stock, bond, cash, alt
    commentary: str  # 투자 철학에 입각한 맞춤형 코멘트
    weight_in_council: float


def evaluate_single_investor(
    investor: Dict[str, Any],
    regime: str = "SIDEWAYS",
    volatility_ann_pct: float = 16.0,
    mdd_pct: float = 4.5,
    cvar_95_pct: float = 3.8,
    usd_krw_rate: float = 1350.0,
    pe_ratio: float = 14.5
) -> InvestorEvaluation:
    """개별 투자자의 투자 철학 및 현재 시장 상태에 기초한 평가 계산"""
    cat = investor.get("category", "VALUE")
    weight = float(investor.get("weight_in_council", 0.01))
    name_kr = investor.get("name_kr", investor.get("name", ""))

    # 기본 감정 점수 및 가중치 계산 (학파별 반응 특성)
    if cat == "VALUE":
        # 밸류에이션(PE)과 변동성 역상관
        base_score = 50.0 + (16.0 - pe_ratio) * 3.5 - (max(0.0, volatility_ann_pct - 20.0) * 0.8)
        if regime == "BEAR":
            base_score += 15.0  # 가치투자자는 하락장에서 염가 매수 선호
            commentary = f"{name_kr}: '시장의 비관론으로 좋은 기업들이 안전마진 영역에 진입했습니다. 현금 일부를 우량주 매수로 전환합니다.'"
        elif regime == "BULL":
            base_score -= 5.0
            commentary = f"{name_kr}: '지수 상승세 속에서도 밸류에이션이 과도한 종목을 경계하고 내재가치가 확실한 기업에만 집중해야 합니다.'"
        elif regime == "VOLATILE":
            commentary = f"{name_kr}: '주가 변동성에 흔들리지 말고 기업의 장기 복리 성장 잠재력과 탄탄한 재무상태표를 점검하십시오.'"
        else:
            commentary = f"{name_kr}: '합리적인 가격대에 있는 고ROE 및 잉여현금흐름 우량주를 선별하여 차분히 보유하는 구간입니다.'"

        stock_w = max(0.35, min(0.85, 0.55 + (base_score - 50.0) * 0.005))
        bond_w = max(0.10, min(0.35, 0.25 - (base_score - 50.0) * 0.002))
        cash_w = round(max(0.05, 1.0 - stock_w - bond_w), 3)

    elif cat == "QUANT":
        # 변동성과 CVaR 위험 통제 우선 (소프, 사이먼스 스타일)
        vol_stress = max(0.0, volatility_ann_pct - 15.0) * 1.5 + max(0.0, cvar_95_pct - 3.5) * 4.0
        base_score = max(20.0, min(85.0, 65.0 - vol_stress))
        if regime == "VOLATILE" or volatility_ann_pct > 22.0:
            commentary = f"{name_kr}: '변동성 및 테일 리스크 신호가 상승했습니다. 켈리 비중(Kelly Fraction)을 축소하고 시장 충격 분산 매매를 권고합니다.'"
        elif regime == "BULL":
            commentary = f"{name_kr}: '체계적 모멘텀과 팩터 시그널이 긍정적입니다. 통계적 유의성을 검증하며 포지션을 분할 유지합니다.'"
        else:
            commentary = f"{name_kr}: '다자산 상관계수 행렬을 기반으로 효율적 분산선(Efficient Frontier) 내 최적 가중치를 산출합니다.'"

        stock_w = max(0.30, min(0.80, 0.50 + (base_score - 50.0) * 0.006))
        bond_w = max(0.15, min(0.40, 0.30 - (base_score - 50.0) * 0.003))
        cash_w = round(max(0.05, 1.0 - stock_w - bond_w), 3)

    elif cat == "MACRO":
        # 거시 통화정책, 금리, 환율 충격 반응 (소로스, 달리오 스타일)
        fx_pressure = max(0.0, (usd_krw_rate - 1340.0) / 10.0)
        base_score = 50.0
        if regime == "BULL":
            base_score = 75.0 - fx_pressure
            commentary = f"{name_kr}: '글로벌 유동성과 경기 사이클이 주식 자산에 우호적입니다. 성장 모멘텀에 체계적으로 편승합니다.'"
        elif regime == "BEAR":
            base_score = 30.0
            commentary = f"{name_kr}: '거시적 디레버리징 및 유동성 위축 국면입니다. 안전자산과 헤지 포지션 비중을 확충해야 합니다.'"
        elif regime == "VOLATILE":
            base_score = 40.0
            commentary = f"{name_kr}: '재귀성(Reflexivity)에 의한 시장 오차가 극대화되는 시기입니다. 극단적 불균형을 노린 비대칭 베팅을 모색합니다.'"
        else:
            commentary = f"{name_kr}: '원자재, 금리, 통화 간 스프레드가 안정화 상태입니다. 올웨더(전천후) 균형 포트폴리오를 유지합니다.'"

        stock_w = max(0.25, min(0.80, 0.50 + (base_score - 50.0) * 0.006))
        bond_w = max(0.15, min(0.45, 0.30 - (base_score - 50.0) * 0.003))
        cash_w = round(max(0.05, 1.0 - stock_w - bond_w), 3)

    elif cat == "GROWTH_VC":
        # 기술 혁신과 미래 성장 잠재력 (피셔, 틸, 손정의 스타일)
        base_score = 70.0 if regime == "BULL" else (45.0 if regime == "BEAR" else 58.0)
        if regime == "BULL":
            commentary = f"{name_kr}: '인공지능과 소프트웨어 혁신의 기하급수적 성장 곡선이 본격화되고 있습니다. 과감한 미래 테크에 투자하십시오.'"
        elif regime == "BEAR":
            commentary = f"{name_kr}: '성장주 조정기는 진정한 독점 플랫폼과 가짜 스타트업이 걸러지는 정화의 시간입니다. 핵심 독점 기업에 집중합니다.'"
        else:
            commentary = f"{name_kr}: '단기 거시 지표에 흔들리지 마십시오. 10년 후 세상을 바꿀 기술 혁신 기업의 독점력만을 응시합니다.'"

        stock_w = max(0.40, min(0.90, 0.65 + (base_score - 50.0) * 0.005))
        bond_w = max(0.05, min(0.25, 0.15 - (base_score - 50.0) * 0.002))
        cash_w = round(max(0.05, 1.0 - stock_w - bond_w), 3)

    elif cat == "INDEX_ALLOC":
        # 비용 절감, 장기 보유, 리밸런싱 원칙 (보글, 스웬슨, 탈렙 스타일)
        base_score = 55.0
        commentary = f"{name_kr}: '불필요한 매매 수수료와 세금을 아끼고, 시장 지수를 넓게 보유하며 목표 비중 괴리율을 규율 있게 리밸런싱하십시오.'"
        stock_w = 0.60
        bond_w = 0.25
        cash_w = 0.15

    else:  # CONTRARIAN_GLOBAL
        # 템플턴, 코스톨라니 등 역발상
        if regime in ("BEAR", "VOLATILE") or mdd_pct > 8.0:
            base_score = 80.0
            commentary = f"{name_kr}: '비관론이 극에 달했을 때가 바로 최고의 매수 시점입니다. 부화뇌동파가 던진 진주를 담으십시오.'"
            stock_w = 0.70; bond_w = 0.20; cash_w = 0.10
        elif regime == "BULL":
            base_score = 45.0
            commentary = f"{name_kr}: '파티가 무르익었을 때 문가로 조용히 이동해야 합니다. 과열된 탐욕에 휩쓸리지 마십시오.'"
            stock_w = 0.45; bond_w = 0.35; cash_w = 0.20
        else:
            base_score = 52.0
            commentary = f"{name_kr}: '코스톨라니의 달걀 모델처럼 시장 순환의 다음 국면을 대비하며 우량 자산을 수면제 먹고 묻어둘 때입니다.'"
            stock_w = 0.55; bond_w = 0.30; cash_w = 0.15

    score = round(max(5.0, min(95.0, base_score)), 1)
    if score >= 65.0:
        outlook = "BULLISH"
    elif score <= 40.0:
        outlook = "DEFENSIVE"
    elif score >= 55.0:
        outlook = "CAUTIOUS_OPTIMISM"
    else:
        outlook = "NEUTRAL"

    return InvestorEvaluation(
        investor_id=investor["id"],
        name=investor["name"],
        name_kr=name_kr,
        category=cat,
        category_kr=investor.get("category_kr", cat),
        organization=investor.get("organization", ""),
        sentiment_score=score,
        outlook=outlook,
        target_weights={"stock": round(stock_w, 3), "bond": round(bond_w, 3), "cash": round(cash_w, 3)},
        commentary=commentary,
        weight_in_council=weight
    )


@dataclass
class CouncilConsensus:
    """100인 투자자 위원회 종합 리서치 합의 결과"""
    council_size: int
    overall_sentiment_score: float  # 0~100 종합 점수
    consensus_regime_call: str  # BULLISH, NEUTRAL, DEFENSIVE
    consensus_weights: Dict[str, float]  # stock, bond, cash
    category_breakdown: Dict[str, Dict[str, Any]]
    top_bullish_voices: List[Dict[str, Any]]
    top_defensive_voices: List[Dict[str, Any]]
    active_advisers_count: int


def calculate_100_investors_consensus(
    regime: str = "SIDEWAYS",
    volatility_ann_pct: float = 16.0,
    mdd_pct: float = 4.5,
    cvar_95_pct: float = 3.8,
    usd_krw_rate: float = 1350.0,
    pe_ratio: float = 14.5
) -> CouncilConsensus:
    """100인 투자자 전원의 의견을 취합하여 정밀 가중 합의 도출"""
    investors = get_all_investors()
    evaluations: List[InvestorEvaluation] = []
    
    total_weight = 0.0
    weighted_sentiment = 0.0
    weighted_stock = 0.0
    weighted_bond = 0.0
    weighted_cash = 0.0

    cat_map: Dict[str, List[InvestorEvaluation]] = {}

    for inv in investors:
        ev = evaluate_single_investor(
            investor=inv,
            regime=regime,
            volatility_ann_pct=volatility_ann_pct,
            mdd_pct=mdd_pct,
            cvar_95_pct=cvar_95_pct,
            usd_krw_rate=usd_krw_rate,
            pe_ratio=pe_ratio
        )
        evaluations.append(ev)
        w = ev.weight_in_council
        total_weight += w
        weighted_sentiment += ev.sentiment_score * w
        weighted_stock += ev.target_weights["stock"] * w
        weighted_bond += ev.target_weights["bond"] * w
        weighted_cash += ev.target_weights["cash"] * w

        cat_map.setdefault(ev.category, []).append(ev)

    norm = max(0.001, total_weight)
    avg_sentiment = round(weighted_sentiment / norm, 1)
    target_stock = round(weighted_stock / norm, 4)
    target_bond = round(weighted_bond / norm, 4)
    target_cash = round(max(0.05, 1.0 - target_stock - target_bond), 4)

    # 카테고리별 요약
    cat_summary = {}
    for cat_name, cat_evals in cat_map.items():
        cat_w_sum = sum(e.weight_in_council for e in cat_evals)
        cat_sent = sum(e.sentiment_score * e.weight_in_council for e in cat_evals) / max(0.001, cat_w_sum)
        cat_stock = sum(e.target_weights["stock"] * e.weight_in_council for e in cat_evals) / max(0.001, cat_w_sum)
        cat_summary[cat_name] = {
            "name_kr": cat_evals[0].category_kr,
            "count": len(cat_evals),
            "sentiment_score": round(cat_sent, 1),
            "stock_weight": round(cat_stock, 3)
        }

    # 정렬: 가장 낙관적인 목소리와 가장 방어적인 목소리 추출
    sorted_by_score = sorted(evaluations, key=lambda x: x.sentiment_score, reverse=True)
    top_bulls = [
        {"id": e.investor_id, "name_kr": e.name_kr, "score": e.sentiment_score, "quote": e.commentary}
        for e in sorted_by_score[:4]
    ]
    top_bears = [
        {"id": e.investor_id, "name_kr": e.name_kr, "score": e.sentiment_score, "quote": e.commentary}
        for e in sorted_by_score[-4:]
    ]

    consensus_regime = "BULLISH" if avg_sentiment >= 62.0 else ("DEFENSIVE" if avg_sentiment <= 42.0 else "NEUTRAL")

    return CouncilConsensus(
        council_size=len(investors),
        overall_sentiment_score=avg_sentiment,
        consensus_regime_call=consensus_regime,
        consensus_weights={"stock": target_stock, "bond": target_bond, "cash": target_cash},
        category_breakdown=cat_summary,
        top_bullish_voices=top_bulls,
        top_defensive_voices=top_bears,
        active_advisers_count=len(investors)
    )
