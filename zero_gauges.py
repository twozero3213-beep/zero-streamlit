"""Daily public market gauges, shown with their actual recorded dates."""
import csv,io
from datetime import datetime,timezone
from urllib.request import Request,build_opener
from zero_discovery import _NoRedirect as NoRedirect
from zero_statistics import descriptive_statistics

def collect_gauges():
    result=[]
    for identity,name,unit,explain,above,below in [
        ('VIXCLS','VIX 공포지수','지수','S&P 500 옵션 가격에 담긴 앞으로 약 30일의 예상 변동성입니다. 하락 확률이나 확정적인 주가 방향이 아닙니다.','옵션이 비싸져 시장이 더 큰 변동을 경계한다는 해석이 가능합니다. 실제 위험의 종류와 뉴스도 확인합니다.','가격에 반영된 변동성 우려가 줄어든 상태일 수 있지만 큰 사건이 없다는 보장은 아닙니다.'),
        ('DGS2','미국 2년 국채금리','%','짧은 기간의 연준 정책금리 예상에 민감한 시장 금리입니다. 채권 금리와 가격은 일반적으로 반대로 움직입니다.','긴축 예상과 조달 비용 부담이 커졌을 수 있습니다. 인플레이션과 고용 발표를 함께 봅니다.','완화 기대일 수 있지만 경기 둔화 우려 때문에 내렸는지도 확인합니다.'),
        ('DGS10','미국 10년 국채금리','%','장기 성장·물가 기대와 만기 보상이 함께 반영된 시장 금리입니다. 기업의 미래 이익을 현재 가치로 계산할 때 영향을 줍니다.','기업의 자금 비용과 미래 이익 할인 부담이 커질 수 있습니다.','할인 부담이 줄 수 있지만 경기 침체로 기업 이익도 약해지는 경우를 구분합니다.')]:
        url='https://fred.stlouisfed.org/graph/fredgraph.csv?id='+identity
        at=datetime.now(timezone.utc)
        row=dict(id=identity,name=name,country='US',unit=unit,frequency='DAILY',seasonal_adjustment='NOT_APPLICABLE',basis='공식 FRED에 기록된 시장 관측값 · 최근 150개 실제 관측',latest_period=None,latest_value=None,previous_value=None,history=[],statistics=descriptive_statistics([]),source_url='https://fred.stlouisfed.org/series/'+identity,retrieved_at=at.isoformat(),release_url=None,last_release_date=None,next_release_kst=None,explanation=explain,above_range=above,below_range=below,limitations=['LIMITED_HISTORY','최근 150개 실제 관측의 설명 통계입니다. 10년 전체 표본이나 매매 신호가 아닙니다.','최신 수정 관측이며 과거 당시 알 수 있었던 자료를 재현한 백테스트 데이터가 아닙니다.'],status='UNAVAILABLE')
        try:
            with build_opener(NoRedirect()).open(Request(url,headers={'User-Agent':'ZERO-Public-Research/0.6'}),timeout=20) as response:
                body=response.read(4_000_001)
                if len(body)>4_000_000:raise ValueError()
            at=datetime.now(timezone.utc);history=[{'period':r['observation_date'],'value':r[identity]} for r in csv.DictReader(io.StringIO(body.decode('utf8'))) if r[identity] not in ('','.','NaN') and r['observation_date']<=at.date().isoformat()][-150:]
            row.update(latest_period=history[-1]['period'],latest_value=history[-1]['value'],previous_value=history[-2]['value'],history=history,statistics=descriptive_statistics(history),retrieved_at=at.isoformat(),status='PARTIAL')
        except (OSError,ValueError,KeyError,IndexError):row['limitations'].append('PUBLIC_MARKET_SOURCE_UNAVAILABLE')
        result.append(row)
    return result
