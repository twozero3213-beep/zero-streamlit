# -*- coding: utf-8 -*-
"""100인 전설적 투자자 및 증류강화학습(DRL) 자가 진화 리서치센터 종합 테스트."""
import json
from pathlib import Path
import unittest

from zero.distillation_rl import DistillationRLEngine, MarketState
from zero.investors_100 import (
    calculate_100_investors_consensus,
    get_all_investors,
    get_investor_by_id,
    get_investors_by_category,
)
from zero.research_center import (
    BENCHMARK_MARKET_EPISODES,
    ResearchCenter,
    get_research_center,
)


class Test100InvestorsAndDistillationRL(unittest.TestCase):
    """100인 투자자 명부, 위원회 합의 및 증류강화학습 자가 학습 검증"""

    def setUp(self):
        self.center = get_research_center()
        self.drl = DistillationRLEngine()

    def test_investors_100_integrity(self):
        """100인 투자자가 누락 없이 정확히 100명 등록되어 있고 중복 ID가 없는지 검증"""
        investors = get_all_investors()
        self.assertEqual(len(investors), 100, f"투자자 수가 100명이 아닙니다: {len(investors)}명")

        ids = [inv["id"] for inv in investors]
        self.assertEqual(len(ids), len(set(ids)), "중복된 투자자 ID가 발견되었습니다.")

        # 6대 학파별 인원수 검증
        categories = {}
        for inv in investors:
            cat = inv["category"]
            categories[cat] = categories.get(cat, 0) + 1
            self.assertTrue(inv["name"], "영문 이름 필수")
            self.assertTrue(inv["name_kr"], "한글 이름 필수")
            self.assertTrue(inv["organization"], "소속/펀드 필수")
            self.assertTrue(inv["philosophy"], "투자 철학 필수")
            self.assertTrue(inv["famous_quote"], "대표 명언 필수")
            self.assertGreaterEqual(len(inv["key_metrics"]), 2, "핵심 지표 2개 이상 필수")

        self.assertEqual(categories["VALUE"], 22, "가치투자 22인")
        self.assertEqual(categories["QUANT"], 20, "계량/퀀트 20인")
        self.assertEqual(categories["MACRO"], 20, "글로벌 매크로 20인")
        self.assertEqual(categories["GROWTH_VC"], 18, "성장/VC 18인")
        self.assertEqual(categories["INDEX_ALLOC"], 10, "인덱스/자산배분 10인")
        self.assertEqual(categories["CONTRARIAN_GLOBAL"], 10, "글로벌 역발상 10인")

    def test_key_legendary_investors_exist(self):
        """금융 역사의 핵심 인물들이 올바르게 등록되어 있는지 확인"""
        key_ids = [
            "WARREN_BUFFETT", "CHARLIE_MUNGER", "BENJAMIN_GRAHAM", "PETER_LYNCH",
            "EDWARD_THORP", "JIM_SIMONS", "HARRY_MARKOWITZ", "WILLIAM_SHARPE",
            "GEORGE_SOROS", "RAY_DALIO", "STANLEY_DRUCKENMILLER", "PAUL_TUDOR_JONES",
            "PHILIP_FISHER", "PETER_THIEL", "JOHN_DOERR", "MASAYOSHI_SON",
            "JOHN_BOGLE", "BURTON_MALKIEL", "DAVID_SWENSEN", "NASSIM_TALEB",
            "JOHN_TEMPLETON", "ANDRE_KOSTOLANY"
        ]
        for k_id in key_ids:
            inv = get_investor_by_id(k_id)
            self.assertIsNotNone(inv, f"필수 거장 투자자 {k_id}가 누락되었습니다.")

    def test_council_consensus_deliberation(self):
        """100인 위원회가 시장 국면(상승/하락/변동)에 따라 합의된 비중과 심리를 올바르게 도출하는지 검증"""
        # 1. 상승장(BULL) 국면 합의
        bull_consensus = calculate_100_investors_consensus(regime="BULL", volatility_ann_pct=13.0)
        self.assertGreater(bull_consensus.overall_sentiment_score, 55.0)
        self.assertGreater(bull_consensus.consensus_weights["stock"], 0.55)
        self.assertEqual(bull_consensus.council_size, 100)

        # 2. 하락장(BEAR) 국면 합의
        bear_consensus = calculate_100_investors_consensus(regime="BEAR", volatility_ann_pct=28.0)
        self.assertLess(bear_consensus.overall_sentiment_score, bull_consensus.overall_sentiment_score)
        self.assertGreater(bear_consensus.consensus_weights["bond"] + bear_consensus.consensus_weights["cash"], 0.40)

        # 3. 분과별 집계 무결성
        for cat in ("VALUE", "QUANT", "MACRO", "GROWTH_VC", "INDEX_ALLOC", "CONTRARIAN_GLOBAL"):
            self.assertIn(cat, bull_consensus.category_breakdown)
            self.assertGreater(bull_consensus.category_breakdown[cat]["count"], 0)

    def test_distillation_rl_teacher_student_interaction(self):
        """증류강화학습에서 100인 투자자 교사(Teacher) 지식을 학생(Student)이 증류하는지 검증"""
        state = MarketState(
            regime="VOLATILE",
            volatility_ann_pct=26.0,
            downside_volatility_pct=18.0,
            drift_percent=4.5,
            recent_slippage_bps=12.0,
            sharpe_ratio=1.45,
            sortino_ratio=2.10,
            mdd_current_pct=8.2,
            cvar_95_pct=5.5,
            usd_krw_rate=1390.0,
            portfolio_value_won=60000000
        )

        teacher_weights = self.drl.evaluate_teacher_policy(state)
        self.assertIn("stock", teacher_weights)
        self.assertIn("bond", teacher_weights)
        self.assertIn("cash", teacher_weights)
        self.assertAlmostEqual(sum(teacher_weights.values()), 1.0, places=2)

        student_action = self.drl.infer_student_action(state)
        self.assertIn("equity", student_action.target_weights)
        self.assertIn("fixed_income", student_action.target_weights)
        self.assertIn("liquidity", student_action.target_weights)
        self.assertGreater(student_action.confidence, 0.70)
        self.assertIsNotNone(student_action.thorp_decision)

    def test_drl_self_learning_cycle_execution(self):
        """증류강화학습 자가 진화 사이클이 스스로 실행되어 체크포인트가 향상 갱신되는지 검증"""
        initial_cp = self.drl.load_checkpoint()
        init_iter = initial_cp.iteration

        # 자가 학습 1회 사이클 실행 (벤치마크 6개 위기 에피소드 활용)
        train_result = self.center.run_drl_self_learning_cycle()

        self.assertEqual(train_result["status"], "SELF_LEARNING_COMPLETED")
        self.assertEqual(train_result["new_iteration"], init_iter + 1)
        self.assertGreater(train_result["episodes_trained"], 0)
        self.assertIn("student_sortino", train_result["metrics"])
        self.assertIn("student_sharpe", train_result["metrics"])

        # 저장된 체크포인트 파일 확인
        reloaded_cp = self.drl.load_checkpoint()
        self.assertEqual(reloaded_cp.iteration, init_iter + 1)


if __name__ == "__main__":
    unittest.main()
