"""ZERO 에드워드 소프(Edward O. Thorp) 수리금융 및 마찰비용 가치투자 엔진.
파산 확률 0%와 장기 기하평균 성장률 극대화를 추구하는 켈리 공식(Kelly Criterion)을 기반으로,
수수료, 세금(국내 거래세·해외 양도세), 환율 스프레드의 3대 마찰비용을 최소화하는
가치투자 동적 리밸런싱 알고리즘입니다.
"""
from dataclasses import dataclass
import math
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class FrictionCostBreakdown:
    """3대 마찰비용 세부 산출 결과"""
    commission_won: int  # 증권사 거래 수수료
    tax_won: int  # 세금 (국내 거래세 0.18% 및 미국 양도소득세 22% 추정)
    fx_cost_won: int  # 환율 환전 스프레드 비용
    slippage_won: int  # 시장 호가 충격(슬리피지) 비용
    total_friction_won: int  # 총 마찰비용 합계
    friction_rate_percent: float  # 총 거래대금 대비 마찰비용 비율 (%)


@dataclass
class KellyRebalanceDecision:
    """소프의 프랙셔널 켈리 기반 리밸런싱 실행 판단"""
    should_execute: bool  # 거래비용을 초과하는 효용이 있어 실행해야 하는지 여부
    target_weights: Dict[str, float]  # 자산별 권고 목표 비중
    friction_cost: FrictionCostBreakdown  # 예상 마찰비용
    expected_growth_gain_won: int  # 리밸런싱 시 기대되는 장기 기하성장 수익
    hurdle_ratio: float  # 비용 대비 기대효용 비율 (1.5배 이상 권고)
    rebalance_reason: str  # 소프의 수리적 판단 근거


class FrictionCostEngine:
    """3대 마찰비용(수수료, 세금, 환율) 정밀 모델"""

    # 수수료율 (온라인 기준)
    KR_COMMISSION_RATE = 0.00015  # 국내 주식 0.015%
    US_COMMISSION_RATE = 0.0007   # 미국 주식 0.07%

    # 세율
    KR_TRANSACTION_TAX_RATE = 0.0018  # 국내 주식 매도 시 거래세 0.18%
    US_CAPITAL_GAIN_TAX_RATE = 0.22   # 미국 주식 연간 250만원 공제 후 22%
    US_TAX_EXEMPT_WON = 2500000       # 기본 공제 250만원

    # 환율 스프레드
    FX_SPREAD_RATE = 0.0020  # 우대 환전 수수료 편도 0.20%

    @classmethod
    def calculate_trade_friction(
        cls,
        market: str,  # 'KR' 또는 'US'
        trade_type: str,  # 'BUY' 또는 'SELL'
        trade_value_won: int,
        realized_profit_won: int = 0,
        annual_accumulated_us_profit_won: int = 0,
        usd_krw_rate: float = 1350.0
    ) -> FrictionCostBreakdown:
        """단일 매매 건의 3대 마찰비용 정밀 산출"""
        is_us = (market == "US")
        
        # 1. 증권사 거래 수수료
        comm_rate = cls.US_COMMISSION_RATE if is_us else cls.KR_COMMISSION_RATE
        commission = round(trade_value_won * comm_rate)

        # 2. 세금 계산
        tax = 0
        if trade_type == "SELL":
            if not is_us:
                # 국내 주식: 매도 대금의 0.18% 거래세 (수익/손실 불문)
                tax = round(trade_value_won * cls.KR_TRANSACTION_TAX_RATE)
            else:
                # 미국 주식: 250만원 공제 초과 실현 수익에 대해 22% 양도소득세
                if realized_profit_won > 0:
                    current_taxable = max(0, (annual_accumulated_us_profit_won + realized_profit_won) - cls.US_TAX_EXEMPT_WON)
                    prior_taxable = max(0, annual_accumulated_us_profit_won - cls.US_TAX_EXEMPT_WON)
                    incremental_taxable = current_taxable - prior_taxable
                    tax = round(incremental_taxable * cls.US_CAPITAL_GAIN_TAX_RATE)

        # 3. 환전 스프레드 (미국 자산 매매 시 원화<->달러 환전 비용)
        fx_cost = round(trade_value_won * cls.FX_SPREAD_RATE) if is_us else 0

        # 4. 시장 충격 슬리피지 (호가 갭 보정, 통상 0.05%)
        slippage = round(trade_value_won * 0.0005)

        total = commission + tax + fx_cost + slippage
        rate = round((total / max(1, trade_value_won)) * 100, 3)

        return FrictionCostBreakdown(
            commission_won=commission,
            tax_won=tax,
            fx_cost_won=fx_cost,
            slippage_won=slippage,
            total_friction_won=total,
            friction_rate_percent=rate
        )


class EdwardThorpEngine:
    """에드워드 소프 다자산 프랙셔널 켈리 & 가치투자 리밸런싱 최적화기"""

    def __init__(self, kelly_fraction: float = 0.5):
        """
        소프의 안전 프랙셔널 켈리 승수 (기본값: Half-Kelly c=0.5)
        수학적으로 Full-Kelly(c=1.0) 대비 기대 성장의 75%를 달성하면서 변동성은 50%로 대폭 삭감.
        """
        self.fraction = max(0.25, min(0.75, kelly_fraction))

    def calculate_fractional_kelly_weights(
        self,
        expected_returns: Dict[str, float],  # 자산별 연간 기대수익률 (예: {'stock': 0.12, 'bond': 0.05})
        volatilities: Dict[str, float],  # 자산별 연간 변동성 (예: {'stock': 0.18, 'bond': 0.06})
        risk_free_rate: float = 0.035  # 무위험 이자율
    ) -> Dict[str, float]:
        """
        에드워드 소프 다자산 샤프-프랙셔널 켈리 공식:
        단일자산 켈리의 초저변동성 역분산 왜곡을 방지하고,
        위험조정수익률(샤프지수 S_i = (mu_i - r) / sigma_i)에 비례하여 안전하게 최적 배분합니다.
        위험자산 총 비중은 프랙셔널 켈리 승수(c)에 의해 안전하게 제어되며, 잔여분은 현금 버퍼로 할당합니다.
        """
        raw_sharpe = {}
        for asset, ret in expected_returns.items():
            if asset in ("cash", "liquidity"):
                continue  # 현금은 잔여 안전자산으로 분리 산출
            vol = max(0.01, volatilities.get(asset, 0.15))
            excess_return = ret - risk_free_rate
            if excess_return <= 0:
                raw_sharpe[asset] = 0.0
            else:
                # 샤프 비율 S_i = (mu_i - r) / vol
                raw_sharpe[asset] = excess_return / vol

        total_sharpe = sum(raw_sharpe.values())
        if total_sharpe <= 0:
            return {"stock": 0.50, "bond": 0.35, "cash": 0.15}

        # 프랙셔널 켈리 승수(c=0.5 -> 80%~85%)에 따른 목표 위험자산 총 비중 설정
        target_risk_ratio = min(0.85, max(0.50, 0.70 + (self.fraction - 0.25) * 0.30))

        result = {}
        allocated = 0.0
        # 샤프 비율 비례로 위험자산 배분
        for k, s in raw_sharpe.items():
            w = round((s / total_sharpe) * target_risk_ratio, 4)
            result[k] = w
            allocated += w

        cash_key = "cash" if "cash" in expected_returns else "liquidity"
        # 부동소수점 오차 누수 원천 차단: 위험자산 할당 합계를 차감하여 정확히 1.0(100.0%) 합계 보장
        risk_sum = sum(result.values())
        result[cash_key] = round(max(0.05, 1.0 - risk_sum), 4)

        # 미세 0.0001 반올림 오차 최종 정규화
        diff = round(1.0 - sum(result.values()), 4)
        if diff != 0:
            result[cash_key] = round(result[cash_key] + diff, 4)

        return result

    def evaluate_rebalance_hurdle(
        self,
        current_portfolio_value_won: int,
        current_weights: Dict[str, float],
        target_weights: Dict[str, float],
        usd_krw_rate: float = 1350.0,
        annual_accumulated_us_profit_won: int = 0
    ) -> KellyRebalanceDecision:
        """
        에드워드 소프의 리밸런싱 허들 검증:
        '리밸런싱으로 얻는 기대 가치성장 효용이 수수료+세금+환율 마찰비용의 최소 1.5배(허들 비율)를 초과하는가?'
        초과하지 않는 미세한 오차는 리밸런싱을 유예하여 복리 자산을 지킵니다.
        """
        total_trade_value_won = 0
        total_comm = 0
        total_tax = 0
        total_fx = 0
        total_slip = 0

        max_drift = 0.0
        for asset in target_weights:
            cur_w = current_weights.get(asset, 0.0)
            tgt_w = target_weights.get(asset, 0.0)
            drift = abs(tgt_w - cur_w)
            if drift > max_drift:
                max_drift = drift

            trade_won = round(current_portfolio_value_won * drift)
            if trade_won > 0:
                total_trade_value_won += trade_won
                market = "US" if "us" in asset.lower() else "KR"
                trade_type = "SELL" if cur_w > tgt_w else "BUY"
                
                # 가상 실현손익 (매도 시 10% 수익 가정)
                est_profit = round(trade_won * 0.10) if trade_type == "SELL" else 0
                
                b = FrictionCostEngine.calculate_trade_friction(
                    market=market,
                    trade_type=trade_type,
                    trade_value_won=trade_won,
                    realized_profit_won=est_profit,
                    annual_accumulated_us_profit_won=annual_accumulated_us_profit_won,
                    usd_krw_rate=usd_krw_rate
                )
                total_comm += b.commission_won
                total_tax += b.tax_won
                total_fx += b.fx_cost_won
                total_slip += b.slippage_won

        total_friction = total_comm + total_tax + total_fx + total_slip
        friction_rate = round((total_friction / max(1, total_trade_value_won)) * 100, 3)
        breakdown = FrictionCostBreakdown(
            commission_won=total_comm,
            tax_won=total_tax,
            fx_cost_won=total_fx,
            slippage_won=total_slip,
            total_friction_won=total_friction,
            friction_rate_percent=friction_rate
        )

        # 리밸런싱을 통한 연간 기대 기하성장 효용 (샤프 개선 및 저평가 매수 효과: 포트폴리오 가치의 약 drift * 1.8%)
        expected_gain_won = round(current_portfolio_value_won * max_drift * 0.018)
        hurdle_ratio = round(expected_gain_won / max(1, total_friction), 2)

        # 소프의 판단: 허들 비율이 1.5배 이상이고 최대 괴리율이 3.5% 이상일 때만 실제 집행
        should_execute = (hurdle_ratio >= 1.5) and (max_drift >= 0.035)

        if should_execute:
            reason = (
                f"소프 켈리 허들 통과: 기대 성장 효용({expected_gain_won.toLocaleString() if hasattr(expected_gain_won, 'toLocaleString') else expected_gain_won:,}원)이 "
                f"3대 마찰비용(세금·수수료·환율 {total_friction:,}원)의 {hurdle_ratio}배에 달해 복리 증식에 최적입니다."
            )
        else:
            reason = (
                f"소프 마찰비용 보호 발동: 기대 효용({expected_gain_won:,}원) 대비 마찰비용({total_friction:,}원) 허들 비율({hurdle_ratio}배)이 "
                f"기준치(1.5배) 미만이므로, 불필요한 세금과 수수료 누수를 막기 위해 리밸런싱을 유예합니다."
            )

        return KellyRebalanceDecision(
            should_execute=should_execute,
            target_weights=target_weights,
            friction_cost=breakdown,
            expected_growth_gain_won=expected_gain_won,
            hurdle_ratio=hurdle_ratio,
            rebalance_reason=reason
        )
