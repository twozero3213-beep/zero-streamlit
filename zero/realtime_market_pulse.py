# -*- coding: utf-8 -*-
"""공개 지수 및 환율 관측 수집 모듈.

비용 0원 원칙: 유료 API 없이 공개 웹 엔드포인트 및 무료 오픈 피드를 활용하여
주요 지수(코스피, 코스닥, S&P500, 나스닥, 다우) 및 환율(USD/KRW, JPY/KRW, EUR/KRW)을
공개 소스에서 받은 값만 반환하고 수집 실패 때 가격을 만들지 않습니다.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import math
import re
from typing import Dict, List, Optional
from urllib.request import Request, urlopen

@dataclass
class MarketIndexItem:
    symbol: str
    name: str
    price: float
    change: float
    change_percent: float
    updated_at: Optional[str]
    currency: str = "KRW"
    market: str = "KR"


@dataclass
class FxRateItem:
    pair: str  # e.g., "USD/KRW"
    name: str
    rate: float
    change: float
    change_percent: float
    updated_at: Optional[str]


def _number(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(str(value).replace(',', ''))
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None


class RealtimeMarketPulse:
    """공개 금융 지수 및 환율 수집기. 수집 실패와 시각 미확인을 그대로 보존한다."""

    USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    INDEX_MARKETS = {'KOSPI': 'KR', 'KOSDAQ': 'KR', 'NASDAQ': 'US', 'SPX': 'US', 'DJI': 'US', 'SOX': 'US'}
    INDEX_URL = 'https://m.stock.naver.com/api/home/majors'
    FX_URL = 'https://m.stock.naver.com/front-api/v1/marketIndex/prices?category=exchange'

    @classmethod
    def fetch_indices(cls, timeout: int = 5) -> List[MarketIndexItem]:
        """공개 지수 응답의 유효한 행만 반환한다."""
        try:
            req = Request(cls.INDEX_URL, headers={"User-Agent": cls.USER_AGENT, "Accept": "application/json"})
            with urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (OSError, ValueError, TypeError):
            return []
        rows = data.get('homeMajorList') if isinstance(data, dict) else None
        items = []
        for item in rows if isinstance(rows, list) else []:
            if not isinstance(item, dict):
                continue
            sym, name = item.get('itemCode'), item.get('name')
            price = _number(item.get('closePrice'))
            change = _number(item.get('compareToPreviousClosePrice'))
            rate = _number(item.get('fluctuationsRatio'))
            if (not isinstance(sym, str) or sym not in cls.INDEX_MARKETS or not isinstance(name, str) or not name.strip()
                    or price is None or price <= 0 or change is None or rate is None):
                continue
            direction = item.get('compareToPreviousPrice')
            if isinstance(direction, dict) and direction.get('name') == 'FALL':
                change, rate = -abs(change), -abs(rate)
            # 이 응답의 검증된 시장 관측 시각이 없으므로 조회 시각으로 대체하지 않는다.
            market = cls.INDEX_MARKETS[sym]
            items.append(MarketIndexItem(sym, name, price, change, rate, None, 'KRW' if market == 'KR' else 'USD', market))
        return items

    @classmethod
    def fetch_fx_rates(cls, timeout: int = 5) -> List[FxRateItem]:
        """지원 통화를 식별할 수 있는 공개 환율 관측만 반환한다."""
        try:
            req = Request(cls.FX_URL, headers={"User-Agent": cls.USER_AGENT, "Accept": "application/json"})
            with urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (OSError, ValueError, TypeError):
            return []
        rows = data.get('result') if isinstance(data, dict) else None
        items = []
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict) or not isinstance(row.get('name'), str):
                continue
            name = row['name']
            pair = ('USD/KRW' if re.search(r'(?<![A-Z])USD(?![A-Z])|미국\s*달러|원/달러', name) else
                    'JPY/KRW' if re.search(r'(?<![A-Z])JPY(?![A-Z])|일본\s*엔|100엔당\s*원화', name) else
                    'EUR/KRW' if re.search(r'(?<![A-Z])EUR(?![A-Z])|유로', name) else None)
            rate = _number(row.get('closePrice'))
            change = _number(row.get('compareToPreviousClosePrice'))
            percent = _number(row.get('fluctuationsRatio'))
            if pair is None or rate is None or rate <= 0 or change is None or percent is None:
                continue
            direction = row.get('compareToPreviousPrice')
            if isinstance(direction, dict) and direction.get('name') == 'FALL':
                change, percent = -abs(change), -abs(percent)
            items.append(FxRateItem(pair, name, rate, change, percent, None))
        return items

    @classmethod
    def get_market_pulse_summary(cls) -> Dict:
        """지수·환율 수집 결과와 별도 조회 시각을 반환한다."""
        indices = cls.fetch_indices()
        fx_rates = cls.fetch_fx_rates()
        return {
            "state": "AVAILABLE" if indices and fx_rates else "PARTIAL" if indices or fx_rates else "UNAVAILABLE",
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "indices": [
                {
                    "symbol": idx.symbol,
                    "name": idx.name,
                    "price": idx.price,
                    "change": idx.change,
                    "change_percent": idx.change_percent,
                    "currency": idx.currency,
                    "market": idx.market,
                    "updated_at": idx.updated_at,
                    "source_url": cls.INDEX_URL
                }
                for idx in indices
            ],
            "fx_rates": [
                {
                    "pair": fx.pair,
                    "name": fx.name,
                    "rate": fx.rate,
                    "change": fx.change,
                    "change_percent": fx.change_percent,
                    "updated_at": fx.updated_at,
                    "source_url": cls.FX_URL
                }
                for fx in fx_rates
            ]
        }
