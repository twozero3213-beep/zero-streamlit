# -*- coding: utf-8 -*-
"""ZERO RPG 게임화 엔진: 45인 팀 파티 편성, 시장 보스 레이드 및 모험가 퀘스트 시스템.

경제·금융을 몰라도 터치 한 번으로 최적의 투자 파티(팀장+팀원)를 소환하고,
시장 위기(금리 인상, 폭락장)를 보스 몬스터 레이드로 극복하는 RPG 투자 경험을 제공합니다.
비용 0원: 순수 로컬 알고리즘으로 작동합니다.
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional


@dataclass
class PartyMember:
    id: str
    name: str  # 캐릭터 이름 (예: '수학자 에드워드 소프', '성기사 미국채', '전사 S&P500')
    role: str  # 'LEADER'(팀장), 'DEALER'(공격), 'TANKER'(방어), 'HEALER'(회복/배당), 'BUFFER'(버프)
    role_korean: str  # '팀장', '딜러(공격)', '탱커(방어)', '힐러(배당회복)', '버퍼(비상금)'
    asset_name: str  # 연동 자산 (예: 'S&P 500 ETF', '단기국채 BIL', 'SCHD 월배당')
    target_weight_pct: float  # 배분 비중 (%)
    attack_power: int  # 공격력 (기대수익 창출 능력)
    defense_power: int  # 방어력 (하락장 손실 방어력)
    recovery_power: int  # 회복력 (배당금 및 현금흐름 충전력)
    special_skill: str  # 고유 스킬명 (예: '복리 연속 베기', '철벽 금리 쉴드')
    skill_desc: str  # 스킬 설명


@dataclass
class InvestmentParty:
    party_id: str
    party_name: str  # 파티명 (예: '소프 켈리 황금 밸런스 파티', '철벽 수비 방패 파티')
    party_type: str  # 'BALANCE', 'DEFENSE', 'ATTACK'
    concept: str  # 파티 컨셉 및 설명
    leader: PartyMember  # 파티장
    members: List[PartyMember]  # 파티원 4인
    total_combat_power: int  # 총 전투력 (CP)
    recommended_user: str  # 추천 모험가 (예: '주린이 초보자', '안정적 복리 추구자')


@dataclass
class MarketBoss:
    boss_id: str
    name: str  # 보스 이름 (예: '고금리 볼케이노 드래곤', '인플레이션 베어')
    title: str  # 보스 칭호
    max_hp: int
    current_hp: int
    attack_points: int  # 시장 충격 공격력
    element: str  # 약점 속성 (예: '단기채 쉴드', '가치투자 둔기')
    desc: str


@dataclass
class RaidBattleResult:
    is_victory: bool
    rounds: int
    battle_logs: List[str]  # 턴별 전투 로그
    damage_dealt: int  # 가한 데미지
    damage_mitigated: int  # 방어한 손실액 (원)
    exp_earned: int  # 획득 경험치
    gold_dividend_earned: int  # 획득 배당금 골드
    boss_remaining_hp: int


class RPGPartyEngine:
    """ZERO RPG 파티 편성 마법사 및 시장 보스 레이드 시뮬레이터"""

    @classmethod
    def get_preset_parties(cls) -> List[InvestmentParty]:
        """주식·경제를 몰라도 터치 한 번으로 소환하는 3대 완성형 파티 프리셋"""
        # 1. 소프 켈리 황금 밸런스 파티 (표준 추천)
        thorp_leader = PartyMember(
            id="thorp",
            name="에드워드 소프 (대마법사)",
            role="LEADER",
            role_korean="팀장 (전략 총괄)",
            asset_name="확률 알고리즘 엔진",
            target_weight_pct=0.0,
            attack_power=95,
            defense_power=95,
            recovery_power=90,
            special_skill="켈리의 황금 분할",
            skill_desc="파티 전체의 변동성을 50% 삭감하고 복리 성장을 극대화합니다."
        )
        p1_members = [
            PartyMember("sp500", "S&P 500 (성기사)", "DEALER", "딜러 (성장)", "미국 대표 500 우량주", 55.6, 92, 70, 40, "복리 일격", "미국 최강 기업들의 힘으로 시장을 정복합니다."),
            PartyMember("treasury", "단기국채 (철벽 탱커)", "TANKER", "탱커 (방어)", "미국 단기국채 (BIL/SGOV)", 29.4, 30, 98, 70, "금리 방패벽", "어떤 폭락장이 와도 자산을 100% 원금 방어합니다."),
            PartyMember("cash", "달러 비상금 (사제)", "HEALER", "힐러 (비상금)", "현금 및 달러 버퍼", 15.0, 10, 85, 95, "긴급 통행료 면제", "세금과 수수료 마찰을 완충하고 위기 시 즉각 회복합니다.")
        ]
        party1 = InvestmentParty(
            party_id="thorp_balance",
            party_name="⚖️ 소프 켈리 황금 밸런스 파티 (강력 추천)",
            party_type="BALANCE",
            concept="수학적으로 가장 완벽한 황금비율(주식 55.6% : 채권 29.4% : 비상금 15.0%)로 복리를 누리는 정석 파티",
            leader=thorp_leader,
            members=p1_members,
            total_combat_power=148500,
            recommended_user="경제를 전혀 모르는 초보자부터 장기 복리를 원하는 모든 모험가"
        )

        # 2. 철벽 방패 성기사 파티 (극단적 안정 추구형)
        buffett_leader = PartyMember(
            id="buffett",
            name="워런 버핏 (성기사단장)",
            role="LEADER",
            role_korean="팀장 (가치 수호)",
            asset_name="해자(Moat) 가치투자",
            target_weight_pct=0.0,
            attack_power=80,
            defense_power=99,
            recovery_power=95,
            special_skill="영구 보유의 축복",
            skill_desc="원금을 잃지 않는 제1원칙으로 어떤 공황도 방어합니다."
        )
        p2_members = [
            PartyMember("schd", "배당다우존스 (성직자)", "HEALER", "힐러 (배당)", "SCHD / 미국배당다우존스", 40.0, 75, 88, 98, "마르지 않는 배당샘", "매달 꾸준한 현금 배당으로 파티의 HP를 회복합니다."),
            PartyMember("bond_shield", "종합채권 (수호 골렘)", "TANKER", "탱커 (철벽 방어)", "국채 및 우량 회사채", 45.0, 25, 99, 75, "성스러운 방어 진지", "주식 폭락 시 반대로 가격이 상승하여 계좌를 지킵니다."),
            PartyMember("cash_safe", "비상금 금고 (지원가)", "BUFFER", "버퍼 (안전핀)", "초단기 MMF 및 예수금", 15.0, 10, 90, 99, "절세 장막", "모든 매매 수수료와 거래세를 최소화합니다.")
        ]
        party2 = InvestmentParty(
            party_id="defense_knight",
            party_name="🛡️ 철벽 방패 성기사 파티 (원금 보존형)",
            party_type="DEFENSE",
            concept="배당금과 국채 이자로 계좌를 매달 치유하며, 주가가 떨어져도 마음 편히 잠들 수 있는 수비형 파티",
            leader=buffett_leader,
            members=p2_members,
            total_combat_power=136200,
            recommended_user="원금 손실이 두렵고 매달 월급처럼 배당금을 받고 싶은 모험가"
        )

        # 3. 질풍의 테크 드래곤 파티 (미래 혁신 공격형)
        lynch_leader = PartyMember(
            id="lynch",
            name="피터 린치 (레인저 마스터)",
            role="LEADER",
            role_korean="팀장 (성장 탐색)",
            asset_name="10루타 성장주 엔진",
            target_weight_pct=0.0,
            attack_power=99,
            defense_power=65,
            recovery_power=70,
            special_skill="텐배거의 화살",
            skill_desc="세상을 바꾸는 1등 혁신 기업들을 찾아내어 화력을 집중합니다."
        )
        p3_members = [
            PartyMember("qqq", "나스닥 100 (드래곤 라이더)", "DEALER", "딜러 (폭발적 화력)", "QQQ 빅테크 100", 65.0, 99, 55, 30, "AI 기가 임팩트", "글로벌 테크 대장주들의 혁신으로 가장 높은 수익률을 겨냥합니다."),
            PartyMember("semi", "반도체 챔피언 (마법사)", "DEALER", "딜러 (치명타)", "KODEX 200 / 반도체 ETF", 20.0, 90, 60, 40, "실리콘 블래스터", "인공지능 혁명의 필수 인프라에 투자합니다."),
            PartyMember("buffer_cash", "지원 사제 (현금 버퍼)", "BUFFER", "버퍼 (기회 포착)", "달러 현금", 15.0, 10, 85, 95, "급락장 바겐세일", "단기 폭락 시 저평가된 우량주를 줍는 기회 포착 스킬을 씁니다.")
        ]
        party3 = InvestmentParty(
            party_id="tech_attack",
            party_name="🚀 질풍의 테크 드래곤 파티 (미래 성장형)",
            party_type="ATTACK",
            concept="인공지능과 혁신 기술주 중심으로 구성되어 폭발적인 자산 증식을 노리는 공격형 파티",
            leader=lynch_leader,
            members=p3_members,
            total_combat_power=152800,
            recommended_user="젊은 투자자 및 5년 이상 장기 투자로 큰 자산 형성을 꿈꾸는 모험가"
        )

        return [party1, party2, party3]

    @classmethod
    def get_current_market_boss(cls) -> MarketBoss:
        """현재 시장에 출현한 위기 보스 몬스터 정보"""
        return MarketBoss(
            boss_id="fomc_rate_dragon",
            name="고금리 볼케이노 드래곤",
            title="연준의 긴축 화염군주 (기준금리 4.75%)",
            max_hp=10000,
            current_hp=6800,
            attack_points=1200,
            element="단기국채 방패 & 소프 켈리 허들",
            desc="전 세계 시장을 공포에 떨게 하는 고금리 화염을 내뿜습니다. 단기국채 탱커와 현금 버퍼를 장착한 파티만이 데미지 없이 공략할 수 있습니다!"
        )

    @classmethod
    def simulate_boss_raid(cls, party: InvestmentParty, boss: MarketBoss) -> RaidBattleResult:
        """내 파티와 시장 보스 몬스터 간의 RPG 모의 전투 시뮬레이션"""
        logs = []
        logs.append(f"⚔️ [{party.party_name}]이(가) [{boss.title} {boss.name}] 레이드 던전에 진입했습니다!")
        logs.append(f"👑 팀장 [{party.leader.name}]이(가) 고유 스킬 [{party.leader.special_skill}]을(를) 발동! 파티 변동성 50% 삭감 장막 전개!")

        total_damage = 0
        total_mitigated = 45000  # 방어한 마찰비용 및 손실 (원)

        # 턴 1: 딜러들의 총공격
        dealer = next(m for m in party.members if m.role == "DEALER")
        dmg1 = dealer.attack_power * 35
        total_damage += dmg1
        logs.append(f"💥 {dealer.name}의 [{dealer.special_skill}]! 보스에게 {dmg1:,} 데미지 명중!")

        # 턴 2: 보스의 강력한 공격 및 탱커의 방어
        tanker = next(m for m in party.members if m.role == "TANKER")
        logs.append(f"🔥 {boss.name}이(가) [금리 불꽃 브레스(공격력 {boss.attack_points})]를 시전!")
        logs.append(f"🛡️ {tanker.name}이(가) [{tanker.special_skill}]으로 완벽 방어! 계좌 손실 0원 및 45,000원 세금 마찰 방어 성공!")

        # 턴 3: 힐러의 배당 회복 및 마무리 일격
        healer = next((m for m in party.members if m.role in ("HEALER", "BUFFER")), party.members[-1])
        dmg2 = healer.recovery_power * 25
        total_damage += dmg2
        logs.append(f"✨ {healer.name}의 [{healer.special_skill}] 발동! 배당금 12,500원 골드 회복 및 추가 {dmg2:,} 데미지!")

        rem_hp = max(0, boss.current_hp - total_damage)
        is_win = (rem_hp == 0 or total_damage >= 3000)
        logs.append(f"🎉 전투 승리! 보스를 성공적으로 격퇴하고 던전을 정복했습니다!")

        return RaidBattleResult(
            is_victory=is_win,
            rounds=3,
            battle_logs=logs,
            damage_dealt=total_damage,
            damage_mitigated=total_mitigated,
            exp_earned=85,
            gold_dividend_earned=12500,
            boss_remaining_hp=rem_hp
        )
