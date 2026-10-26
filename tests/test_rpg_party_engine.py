# -*- coding: utf-8 -*-
"""ZERO RPG 게임화 엔진 단위 테스트."""
import unittest
from zero.rpg_party_engine import RPGPartyEngine, InvestmentParty, MarketBoss, RaidBattleResult


class TestRPGPartyEngine(unittest.TestCase):

    def test_preset_parties_generation(self):
        parties = RPGPartyEngine.get_preset_parties()
        self.assertEqual(len(parties), 3)

        # 1. 소프 켈리 황금 밸런스 파티 검증
        p1 = parties[0]
        self.assertEqual(p1.party_id, "thorp_balance")
        self.assertEqual(p1.leader.name, "에드워드 소프 (대마법사)")
        self.assertEqual(len(p1.members), 3)

        # 비중 합계 검증 (55.6 + 29.4 + 15.0 = 100.0)
        total_weight = sum(m.target_weight_pct for m in p1.members)
        self.assertAlmostEqual(total_weight, 100.0, places=1)

        # 역할 배분 확인 (딜러, 탱커, 힐러)
        roles = {m.role for m in p1.members}
        self.assertIn("DEALER", roles)
        self.assertIn("TANKER", roles)
        self.assertIn("HEALER", roles)

    def test_market_boss_and_raid_battle_simulation(self):
        parties = RPGPartyEngine.get_preset_parties()
        p1 = parties[0]
        boss = RPGPartyEngine.get_current_market_boss()

        self.assertEqual(boss.boss_id, "fomc_rate_dragon")
        self.assertGreater(boss.max_hp, 0)

        # 레이드 모의 전투 실행
        result = RPGPartyEngine.simulate_boss_raid(p1, boss)

        self.assertTrue(result.is_victory)
        self.assertGreater(result.damage_dealt, 0)
        self.assertGreater(result.damage_mitigated, 0)
        self.assertGreater(result.exp_earned, 0)
        self.assertGreater(result.gold_dividend_earned, 0)
        self.assertGreaterEqual(len(result.battle_logs), 4)
        self.assertIn("🎉 전투 승리!", result.battle_logs[-1])


if __name__ == "__main__":
    unittest.main()
