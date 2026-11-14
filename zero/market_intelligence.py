# -*- coding: utf-8 -*-
"""가상 검토 역할의 호환 응답. 검증된 자료나 모델이 없으면 판단을 보류한다."""
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from zero.investors_100 import get_all_investors, get_investor_by_id


# 가상 검토 역할의 호환 모델
@dataclass
class ChiefDirectorVerdict:
    """실제 전문가나 검증된 예측을 뜻하지 않는 가상 검토 상태."""
    director_name: str
    director_title: str
    experience_years: Optional[int]
    evaluated_at: Optional[str]
    target_asset: str
    buy_probability_pct: Optional[float]
    sell_probability_pct: Optional[float]
    verdict_call: str
    decision_reason: str
    economic_outlook: Dict[str, Any]
    state: str = 'UNAVAILABLE'
    role_kind: str = 'SIMULATED_REVIEW_ROLE'
    ai_used: bool = False
    orders_authorized: bool = False

    @property
    def verdict(self) -> str:
        return self.verdict_call

    @property
    def verdict_kr(self) -> str:
        return {'BUY': '매수', 'STRONG_BUY': '매수', 'SELL': '매도', 'STRONG_SELL': '매도'}.get(self.verdict_call, '보류')

    @property
    def buy_prob(self) -> Optional[float]:
        return self.buy_probability_pct

    @property
    def sell_prob(self) -> Optional[float]:
        return self.sell_probability_pct

    @property
    def summary_reasoning(self) -> str:
        return self.decision_reason

    @property
    def economy_outlook(self) -> Dict[str, Any]:
        return self.economic_outlook

    def to_dict(self) -> Dict[str, Any]:
        value = asdict(self)
        value.update(verdict=self.verdict, verdict_kr=self.verdict_kr, buy_prob=self.buy_prob,
                     sell_prob=self.sell_prob, summary_reasoning=self.summary_reasoning)
        return value


def get_chief_director_verdict(target_asset: str = "MARKET_OVERALL") -> ChiefDirectorVerdict:
    """검증된 관측값과 확률 모델이 연결되지 않은 경로에서는 수치나 결론을 만들지 않는다."""
    return ChiefDirectorVerdict(
        director_name='ZERO 가상 검토 역할', director_title='자료 검증 대기',
        experience_years=None, evaluated_at=None, target_asset=target_asset,
        buy_probability_pct=None, sell_probability_pct=None, verdict_call='HOLD',
        decision_reason='검증된 최신 자료와 확률 모델이 연결되지 않아 판단을 보류합니다. 가상 검토 역할이며 실제 전문가의 경력이나 조언을 뜻하지 않습니다.',
        economic_outlook={'direction': 'UNKNOWN', 'positive_prob': None, 'negative_prob': None,
                          'positive_probability_pct': None, 'negative_probability_pct': None,
                          'summary': '검증된 자료가 없어 경제 방향과 확률을 산출하지 않았습니다.',
                          'indicator_breakdown': [], 'key_indicators_analysis': []})


# 2. 100인 투자자 상시 일일 토론 (거시경제, 미시경제, 강세/약세 섹터 및 기업)
@dataclass
class DailyCouncilDebate:
    """검증된 토론 기록이 없는 가상 검토 역할의 호환 응답."""
    date_str: Optional[str]
    macro_debate_topic: str
    macro_dialogue: List[Dict[str, str]]
    micro_debate_topic: str
    micro_dialogue: List[Dict[str, str]]
    strong_sectors: List[Dict[str, Any]]
    weak_sectors: List[Dict[str, Any]]
    chief_verdict: Dict[str, Any]
    state: str = 'UNAVAILABLE'
    role_kind: str = 'SIMULATED_REVIEW_ROLE'
    ai_used: bool = False
    orders_authorized: bool = False

    def __getitem__(self, item: str) -> Any:
        if item == 'date':
            return self.date_str
        if hasattr(self, item):
            return getattr(self, item)
        if item == 'macro_debate':
            return {'topic': self.macro_debate_topic, 'dialogue': self.macro_dialogue, 'summary': self.macro_dialogue[0]['content'] if self.macro_dialogue else ''}
        if item == 'micro_debate':
            return {'topic': self.micro_debate_topic, 'dialogue': self.micro_dialogue, 'summary': self.micro_dialogue[0]['content'] if self.micro_dialogue else ''}
        raise KeyError(item)

    def __contains__(self, item: str) -> bool:
        return item in ('date', 'macro_debate', 'micro_debate', 'strong_sectors', 'weak_sectors', 'chief_verdict',
                        'date_str', 'macro_debate_topic', 'micro_debate_topic', 'state', 'role_kind', 'ai_used', 'orders_authorized')

    @property
    def economy_outlook(self) -> Dict[str, Any]:
        return self.chief_verdict.get('economic_outlook', {})

    def to_dict(self) -> Dict[str, Any]:
        return {'date': self.date_str, 'macro_debate': self['macro_debate'], 'micro_debate': self['micro_debate'],
                'strong_sectors': self.strong_sectors, 'weak_sectors': self.weak_sectors, 'chief_verdict': self.chief_verdict,
                'state': self.state, 'role_kind': self.role_kind, 'ai_used': self.ai_used, 'orders_authorized': self.orders_authorized}


def generate_daily_council_debate(target_date: Optional[str] = None) -> DailyCouncilDebate:
    """명시한 날짜는 요청 식별자이며 실제 분석이 이루어진 관측 시각이 아니다."""
    if target_date is not None:
        datetime.strptime(target_date, '%Y-%m-%d')
    return DailyCouncilDebate(date_str=target_date, macro_debate_topic='거시 자료 확인 대기', macro_dialogue=[],
                             micro_debate_topic='종목 자료 확인 대기', micro_dialogue=[], strong_sectors=[], weak_sectors=[],
                             chief_verdict=asdict(get_chief_director_verdict()))


# 기존 추천 목록 API의 호환 응답
def get_daily_25_recommendations() -> Dict[str, Any]:
    """검증된 선정 결과가 없으므로 기존 목록 키만 빈 값으로 유지한다."""
    return {'nasdaq_10': [], 'kospi_5': [], 'kosdaq_5': [], 'etf_5': [], 'recommendations': [], 'count': 0,
            'state': 'UNAVAILABLE', 'ai_used': False, 'orders_authorized': False}


# 4. 무료 범용 AI 툴을 활용한 100인 투자자 개별 종목/ETF 심층 질의응답
def consult_investor_on_specific_asset(
    investor_id: str,
    asset_symbol_or_name: str,
    user_question: Optional[str] = None
) -> Dict[str, Any]:
    """역할 선택만 보존한다. 실제 인물의 발언이나 검증되지 않은 종목 판단을 생성하지 않는다."""
    if not isinstance(investor_id, str) or not isinstance(asset_symbol_or_name, str):
        raise ValueError('MARKET_INTELLIGENCE_REQUEST_INVALID')
    normalized_id = investor_id.upper().replace('-', '_')
    try:
        inv = get_investor_by_id(normalized_id)
        if not inv:
            inv = next((candidate for candidate in get_all_investors()
                        if candidate['id'].upper().replace('-', '_') == normalized_id or candidate.get('name_kr') == investor_id), None)
    except (OSError, ValueError, KeyError):
        inv = None
    label = (inv.get('name_kr') or inv.get('name') or '선택한 검토 역할') if inv else '선택한 검토 역할'
    name = label + ' (가상 검토 역할)'
    target = asset_symbol_or_name.strip()
    opinion = '검증된 종목별 자료와 모델이 없어 판단을 보류합니다. 선택한 이름은 가상 검토 관점이며 실제 인물의 발언이나 자문이 아닙니다. 이 응답에서 AI 분석은 실행하지 않았습니다.'
    return {'investor_id': inv['id'] if inv else investor_id, 'investor_name_kr': name, 'name_kr': name,
            'name_en': ((inv.get('name') or 'Simulated review role') + ' (simulated review role)') if inv else 'Simulated review role',
            'organization': None, 'category_kr': '가상 검토 관점', 'asset': target, 'target_asset': target,
            'opinion': opinion, 'analysis_reply': opinion, 'verdict': 'HOLD', 'verdict_kr': '보류',
            'recommended_weight': None, 'famous_quote': None, 'state': 'UNAVAILABLE',
            'role_kind': 'SIMULATED_REVIEW_ROLE', 'ai_used': False, 'orders_authorized': False}
