# -*- coding: utf-8 -*-
"""AI Research Center Operations Engine (리서치센터 운영 총괄 엔진).
전 세계 전설적인 투자자 100인을 리서치센터에 소집하여 상시 시장 분석,
학파별 합의 도출, 심층 토론, 그리고 증류강화학습(DRL) 자가 진화 루프를 지휘합니다.
"""
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from zero.distillation_rl import DistillationRLEngine, MarketState, ModelCheckpoint
from zero.investors_100 import (
    CouncilConsensus,
    InvestorEvaluation,
    calculate_100_investors_consensus,
    evaluate_single_investor,
    get_all_investors,
    get_investor_by_id,
    get_investors_by_category,
    load_investors_data,
)


# 역사적 위기 및 주요 시장 국면 에피소드 라이브러리 (증류강화학습 자가 훈련용)
BENCHMARK_MARKET_EPISODES = [
    {
        "name": "2008 글로벌 금융위기 (서브프라임 붕괴)",
        "regime": "BEAR",
        "volatility": 32.5,
        "downside_vol": 24.0,
        "drift": 8.5,
        "slippage_bps": 22.0,
        "sharpe": 0.45,
        "sortino": 0.60,
        "mdd": 28.5,
        "cvar_95": 9.2,
        "usd_krw": 1450.0,
        "portfolio_value": 50000000,
        "return": -18.5,
        "benchmark_return": -35.2
    },
    {
        "name": "2020 팬데믹 쇼크 및 무제한 양적완화 V자 반등",
        "regime": "VOLATILE",
        "volatility": 28.0,
        "downside_vol": 18.5,
        "drift": 6.0,
        "slippage_bps": 15.0,
        "sharpe": 1.40,
        "sortino": 1.95,
        "mdd": 14.2,
        "cvar_95": 6.5,
        "usd_krw": 1280.0,
        "portfolio_value": 52000000,
        "return": 24.5,
        "benchmark_return": 18.0
    },
    {
        "name": "2021 글로벌 빅테크 유동성 랠리",
        "regime": "BULL",
        "volatility": 13.5,
        "downside_vol": 8.0,
        "drift": 3.2,
        "slippage_bps": 7.0,
        "sharpe": 2.10,
        "sortino": 2.90,
        "mdd": 4.1,
        "cvar_95": 3.2,
        "usd_krw": 1180.0,
        "portfolio_value": 58000000,
        "return": 19.8,
        "benchmark_return": 15.4
    },
    {
        "name": "2022 고인플레이션 및 급격한 금리 인상 충격",
        "regime": "BEAR",
        "volatility": 24.5,
        "downside_vol": 16.8,
        "drift": 5.8,
        "slippage_bps": 14.0,
        "sharpe": 0.70,
        "sortino": 0.95,
        "mdd": 16.5,
        "cvar_95": 6.8,
        "usd_krw": 1420.0,
        "portfolio_value": 54000000,
        "return": -6.5,
        "benchmark_return": -19.8
    },
    {
        "name": "2023 AI 혁신 개막 및 반도체 턴어라운드",
        "regime": "BULL",
        "volatility": 16.2,
        "downside_vol": 9.5,
        "drift": 4.0,
        "slippage_bps": 8.5,
        "sharpe": 1.85,
        "sortino": 2.50,
        "mdd": 5.8,
        "cvar_95": 3.9,
        "usd_krw": 1310.0,
        "portfolio_value": 61000000,
        "return": 16.2,
        "benchmark_return": 12.0
    },
    {
        "name": "2024 고환율·고금리 장기화 및 박스권 횡보",
        "regime": "SIDEWAYS",
        "volatility": 15.0,
        "downside_vol": 10.2,
        "drift": 2.8,
        "slippage_bps": 8.0,
        "sharpe": 1.65,
        "sortino": 2.25,
        "mdd": 5.2,
        "cvar_95": 4.1,
        "usd_krw": 1380.0,
        "portfolio_value": 62500000,
        "return": 8.8,
        "benchmark_return": 5.5
    }
]


class ResearchCenter:
    """100인 전설적 투자자 운용 및 증류강화학습 자가 진화 리서치 센터"""

    def __init__(self):
        self.drl = DistillationRLEngine()
        self._investors = get_all_investors()

    def get_investors_catalog(
        self,
        category: Optional[str] = None,
        search_query: Optional[str] = None,
        regime: str = "SIDEWAYS",
        volatility_ann_pct: float = 16.0
    ) -> Dict[str, Any]:
        """100인 투자자 명부 및 실시간 시장 평가 목록 조회"""
        investors = self._investors
        if category and category != "ALL":
            investors = [inv for inv in investors if inv.get("category") == category]

        if search_query:
            q = search_query.strip().lower()
            investors = [
                inv for inv in investors
                if q in inv.get("name", "").lower()
                or q in inv.get("name_kr", "").lower()
                or q in inv.get("organization", "").lower()
                or q in inv.get("philosophy", "").lower()
            ]

        results = []
        for inv in investors:
            ev = evaluate_single_investor(
                investor=inv,
                regime=regime,
                volatility_ann_pct=volatility_ann_pct
            )
            results.append({
                "id": inv["id"],
                "name": inv["name"],
                "name_kr": inv["name_kr"],
                "category": inv["category"],
                "category_kr": inv["category_kr"],
                "organization": inv["organization"],
                "era": inv.get("era", ""),
                "philosophy": inv.get("philosophy", ""),
                "famous_quote": inv.get("famous_quote", ""),
                "key_metrics": inv.get("key_metrics", []),
                "avatar_badge": inv.get("avatar_badge", ""),
                "evaluation": {
                    "sentiment_score": ev.sentiment_score,
                    "outlook": ev.outlook,
                    "target_weights": ev.target_weights,
                    "commentary": ev.commentary
                }
            })

        meta = load_investors_data()
        return {
            "total_count": len(results),
            "categories": meta.get("categories", {}),
            "investors": results
        }

    def get_council_deliberation(
        self,
        regime: str = "SIDEWAYS",
        volatility_ann_pct: float = 16.0,
        mdd_pct: float = 4.5,
        cvar_95_pct: float = 3.8,
        usd_krw_rate: float = 1350.0
    ) -> Dict[str, Any]:
        """100인 투자자 위원회의 실시간 종합 리서치 합의 및 분과별 분석 보고"""
        consensus: CouncilConsensus = calculate_100_investors_consensus(
            regime=regime,
            volatility_ann_pct=volatility_ann_pct,
            mdd_pct=mdd_pct,
            cvar_95_pct=cvar_95_pct,
            usd_krw_rate=usd_krw_rate
        )

        drl_cp = self.drl.load_checkpoint()

        return {
            "council_size": consensus.council_size,
            "deliberated_at": datetime.now(timezone.utc).isoformat(),
            "regime_input": regime,
            "overall_sentiment_score": consensus.overall_sentiment_score,
            "consensus_regime_call": consensus.consensus_regime_call,
            "consensus_weights": consensus.consensus_weights,
            "category_breakdown": consensus.category_breakdown,
            "top_bullish_voices": consensus.top_bullish_voices,
            "top_defensive_voices": consensus.top_defensive_voices,
            "distillation_rl_status": {
                "drl_version": drl_cp.version,
                "iteration": drl_cp.iteration,
                "student_sortino": drl_cp.student_sortino,
                "teacher_kl_divergence": drl_cp.teacher_kl_divergence,
                "friction_hurdle_ratio": drl_cp.policy_weights.get("friction_hurdle_ratio", 1.50)
            }
        }

    def consult_investor(
        self,
        investor_id: str,
        user_question: str = "",
        regime: str = "SIDEWAYS"
    ) -> Dict[str, Any]:
        """특정 투자자와의 1:1 심층 자문 및 철학 기반 질의응답"""
        inv = get_investor_by_id(investor_id)
        if not inv:
            return {"error": "INVESTOR_NOT_FOUND", "investor_id": investor_id}

        ev = evaluate_single_investor(inv, regime=regime)

        # 철학에 기초한 응답 생성
        name_kr = inv.get("name_kr", inv.get("name"))
        quote = inv.get("famous_quote", "")
        philo = inv.get("philosophy", "")

        consultation_reply = (
            f"[{name_kr}의 조언] \"{quote}\"\n\n"
            f"현재 시장 환경({regime})에 대해 저의 핵심 원칙인 '{philo}'에 비추어 보면, "
            f"{ev.commentary}\n\n"
            f"권고 자산 배분 비중: 주식 {int(ev.target_weights['stock']*100)}%, "
            f"채권 {int(ev.target_weights['bond']*100)}%, "
            f"현금 {int(ev.target_weights['cash']*100)}% 입니다."
        )

        return {
            "investor_id": inv["id"],
            "name_kr": name_kr,
            "organization": inv.get("organization"),
            "category_kr": inv.get("category_kr"),
            "sentiment_score": ev.sentiment_score,
            "outlook": ev.outlook,
            "target_weights": ev.target_weights,
            "famous_quote": quote,
            "reply": consultation_reply
        }

    def run_drl_self_learning_cycle(
        self,
        custom_episodes: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """증류강화학습(DRL) 자가 진화 1회 사이클 실행 및 결과 반환"""
        episodes = custom_episodes or BENCHMARK_MARKET_EPISODES
        old_checkpoint = self.drl.load_checkpoint()
        
        # 증류강화학습 자가 학습 실행
        new_checkpoint = self.drl.run_self_improving_cycle(episodes)

        gain_sharpe = round(new_checkpoint.student_sharpe - old_checkpoint.student_sharpe, 3)
        gain_sortino = round(new_checkpoint.student_sortino - old_checkpoint.student_sortino, 3)
        mdd_reduction = round(old_checkpoint.student_mdd - new_checkpoint.student_mdd, 3)

        return {
            "status": "SELF_LEARNING_COMPLETED",
            "previous_iteration": old_checkpoint.iteration,
            "new_iteration": new_checkpoint.iteration,
            "trained_at": new_checkpoint.trained_at,
            "episodes_trained": len(episodes),
            "teacher_kl_divergence": new_checkpoint.teacher_kl_divergence,
            "metrics": {
                "student_sharpe": new_checkpoint.student_sharpe,
                "sharpe_gain": gain_sharpe,
                "student_sortino": new_checkpoint.student_sortino,
                "sortino_gain": gain_sortino,
                "student_mdd": new_checkpoint.student_mdd,
                "mdd_reduction": mdd_reduction,
                "student_cvar_95": new_checkpoint.student_cvar_95
            },
            "updated_policy_weights": new_checkpoint.policy_weights
        }


# 글로벌 싱글톤 인스턴스
_RESEARCH_CENTER_INSTANCE: Optional[ResearchCenter] = None


def get_research_center() -> ResearchCenter:
    global _RESEARCH_CENTER_INSTANCE
    if _RESEARCH_CENTER_INSTANCE is None:
        _RESEARCH_CENTER_INSTANCE = ResearchCenter()
    return _RESEARCH_CENTER_INSTANCE
