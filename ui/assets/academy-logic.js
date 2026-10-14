/* ZERO 주식 입문 학교: levels, lessons, quizzes, XP and the practice trade. Pure data and rules, no DOM and no network,
   so every rule is unit-testable in Node. Educational content only: no order is ever sent and nothing here is investment advice. */
(() => {
  'use strict';
  // In every quiz the FIRST choice is the right one; `shuffled` reorders it deterministically so the answer position varies.
  const LEVELS = [
    {id: 'L1', badge: '🌱', rank: '주식 새싹', title: '주식이 뭔가요?', goal: '주식이 무엇이고 가격이 왜 움직이는지 알아요.',
      pages: [
        {title: '주식은 회사의 작은 조각이에요', body: ['회사는 사업에 쓸 돈이 필요하면 회사의 소유권을 잘게 쪼개 "주식"으로 팔아요. 주식을 가진 사람을 "주주"라고 해요.', '주식 1주는 회사 전체의 아주 작은 일부예요. 회사가 돈을 잘 벌면 배당금을 받거나 주가가 오를 수 있고, 어려워지면 주가가 내릴 수 있어요.'], tip: '예금과 달리 주식은 원금이 보장되지 않아요.'},
        {title: '주가는 왜 움직일까요?', body: ['주식은 거래소에서 사려는 사람과 팔려는 사람의 가격이 맞을 때 거래돼요.', '더 높은 가격에도 사려는 수요가 강해지면 주가가 오르기 쉽고, 더 낮은 가격에도 팔려는 공급이 강해지면 내리기 쉬워요. 회사 실적, 경제 소식, 사람들의 기대와 불안이 모두 영향을 줘요.'], tip: '가격이 움직이는 이유는 하나가 아니에요. 한 가지 이유로 단정하지 않아요.'},
        {title: '어디서 어떻게 사요?', body: ['증권사에서 주식 계좌를 열고, 증권사 앱으로 사고팔아요.', '한국은 코스피(큰 기업 중심)와 코스닥(성장 기업 중심), 미국은 뉴욕증권거래소와 나스닥이 대표적이에요. 종목마다 구분용 코드가 있어요(삼성전자 005930, 엔비디아 NVDA).'], tip: 'ZERO 위쪽 검색창에 종목 이름이나 코드를 넣으면 바로 찾아볼 수 있어요.'}],
      quiz: [
        {id: 'L1Q1', q: '주식 1주를 가진다는 것은 무슨 뜻일까요?', choices: ['회사의 아주 작은 일부를 소유한다', '회사에 돈을 빌려주고 이자를 받는다', '그 회사 상품을 평생 할인받는다', '은행 예금처럼 원금이 보장된다'], why: '주식은 회사의 소유권 일부예요. 빌려준 돈(채권)이나 예금과는 달라요.'},
        {id: 'L1Q2', q: '주가가 오르기 쉬운 상황은 어느 쪽일까요?', choices: ['더 높은 가격에도 사려는 수요가 강해질 때', '팔려는 사람이 훨씬 많을 때', '거래하는 사람이 아무도 없을 때', '회사 이름이 바뀔 때'], why: '가격은 사고 싶은 힘과 팔고 싶은 힘이 만나서 정해져요.'},
        {id: 'L1Q3', q: '주식을 사고팔려면 무엇이 필요할까요?', choices: ['증권사 계좌', '회사 대표의 허락', '은행 적금 통장만', '아무것도 필요 없어요'], why: '증권사 계좌를 열고 앱으로 주문해요.'},
        {id: 'L1Q4', q: '주식이 예금과 가장 다른 점은?', choices: ['원금이 보장되지 않고 가격이 오르내려요', '항상 예금보다 이자가 높아요', '가격이 절대 변하지 않아요', '정부가 가격을 정해 줘요'], why: '주식은 오를 수도 내릴 수도 있어서 잃을 수 있는 돈으로만 해요.'}]},
    {id: 'L2', badge: '🛒', rank: '거래 초보', title: '사고팔기 — 매수와 매도', goal: '매수·매도, 호가와 주문 종류, 비용을 알고 연습 거래로 직접 해 봐요.', practice: 'trade',
      pages: [
        {title: '매수는 사기, 매도는 팔기', body: ['"매수"는 주식을 사는 것, "매도"는 파는 것이에요. 매매 수익은 산 가격과 판 가격의 차이에서 비용을 뺀 돈이에요. 회사가 배당을 지급하면 배당금도 받을 수 있어요.', '사서 들고 있는 동안의 이익·손실은 아직 확정되지 않은 "평가손익"이고, 팔아서 확정되면 "실현손익"이에요. 내가 산 평균 가격은 "평균단가"예요.'], tip: '평가손익은 화면 위의 숫자일 뿐, 팔기 전에는 바뀔 수 있어요.'},
        {title: '호가와 체결, 주문 종류', body: ['사려는 가격(매수호가)과 팔려는 가격(매도호가)이 줄 서 있다가 서로 맞는 순간 "체결"돼요.', '"시장가" 주문은 가격을 정하지 않고 가능한 상대 주문과 거래해요. 표시 가격과 다르거나 거래가 안 될 수도 있어요. "지정가" 매수는 정한 가격 이하, 매도는 정한 가격 이상에서만 체결돼요. 가격에 도달해도 체결이 보장되지는 않아요.'], tip: '처음에는 가격을 직접 정하는 지정가가 더 안전해요.'},
        {title: '비용과 거래 시간', body: ['거래할 때 증권사 수수료가 들 수 있고, 국내 일반 주식을 팔 때는 증권거래세 등 세금이 붙어요. ETF는 증권거래세가 면제되지만 상품과 계좌에 따라 다른 세금이 생길 수 있어요. 최신 비용은 증권사 안내를 확인해요.', '한국 정규장은 평일 09:00~15:30이에요. 미국은 한국 시간으로 밤에 열려요(서머타임이면 밤 10:30~새벽 5:00, 아니면 밤 11:30~새벽 6:00). 한국 주식은 하루에 ±30%까지만 움직일 수 있어요.', '거래 후 돈과 주식이 실제로 오가는 "결제"는 보통 한국은 2영업일, 미국은 1영업일 뒤예요(제도에 따라 바뀔 수 있어요).'], tip: '수수료와 세금은 수익에서 빠져요. 자주 사고팔수록 비용이 쌓여요.'}],
      quiz: [
        {id: 'L2Q1', q: '"매도"는 무엇일까요?', choices: ['주식을 파는 것', '주식을 사는 것', '주식을 빌리는 것', '계좌를 닫는 것'], why: '매수는 사기, 매도는 팔기예요.'},
        {id: 'L2Q2', q: '1만원에 산 주식을 1만 2천원에 팔았어요. 수수료·세금을 무시하면 실현손익은?', choices: ['+2,000원', '-2,000원', '0원', '+12,000원'], why: '12,000원 − 10,000원 = +2,000원이에요. 팔았기 때문에 "실현"손익이에요.'},
        {id: 'L2Q3', q: '매수는 정한 가격 이하, 매도는 정한 가격 이상으로 제한하는 주문은?', choices: ['지정가 주문', '시장가 주문', '평균가 주문', '예약가 주문'], why: '지정가는 매수할 최대 가격이나 매도할 최소 가격을 정해요. 정한 가격보다 유리하게 거래될 수도 있고, 체결되지 않을 수도 있어요.'},
        {id: 'L2Q4', q: '아직 팔지 않은 주식의 가격이 올라서 생긴 이익은?', choices: ['평가이익(아직 확정 전)', '실현이익', '배당금', '수수료'], why: '팔기 전의 이익은 평가손익이라 가격에 따라 사라질 수 있어요.'}]},
    {id: 'L3', badge: '📈', rank: '숫자 읽기', title: '숫자 읽는 법', goal: '등락률, 거래량, 시가총액, 캔들, PER 같은 기본 숫자를 읽어요.',
      pages: [
        {title: '등락률은 어제 대비 몇 %?', body: ['등락률 = (현재가 − 전일 종가) ÷ 전일 종가 × 100. 예를 들어 10,000원이 10,500원이 되면 +5%예요.', '한국에서는 상승을 빨강, 하락을 파랑으로 써요(미국은 반대라 헷갈릴 수 있어요). ZERO도 한국식을 따르고, 색뿐 아니라 부호(+, −)도 함께 적어요.'], tip: '종가는 그날 마지막 거래 가격이에요.'},
        {title: '거래량과 시가총액', body: ['"거래량"은 그날 거래된 주식 수예요. 많을수록 사람들의 관심이 많다는 뜻이에요.', '"시가총액" = 주가 × 발행 주식 수. 시장이 매긴 회사의 몸값이에요. 주가가 비싸다고 큰 회사인 것은 아니에요.'], tip: '회사 크기는 주가가 아니라 시가총액으로 비교해요.'},
        {title: '캔들, 이동평균, PER', body: ['캔들 하나에는 시가(처음)·고가(가장 높은)·저가(가장 낮은)·종가(마지막) 네 가격이 담겨요.', '"이동평균"은 최근 n일 종가의 평균이에요. 들쭉날쭉한 가격을 완만하게 보여 주지만 과거 평균이라 늦게 반응해요.', '"PER" = 주가 ÷ 주당순이익. 이익의 몇 배 가격에 거래되는지 보여 줘요. 낮다고 무조건 싼 것은 아니고 업종마다 달라요.'], tip: '숫자 하나만 보고 싸다·비싸다고 단정하지 않아요. ZERO의 "주식 공부" 화면에서 차트를 직접 읽어 볼 수 있어요.'}],
      quiz: [
        {id: 'L3Q1', q: '어제 종가 20,000원, 지금 21,000원이에요. 등락률은?', choices: ['+5%', '+10%', '+1%', '−5%'], why: '(21,000 − 20,000) ÷ 20,000 = 0.05 → +5%예요.'},
        {id: 'L3Q2', q: '시가총액은 어떻게 계산할까요?', choices: ['주가 × 발행 주식 수', '거래량 × 주가', '매출 − 비용', '주가 ÷ 거래량'], why: '회사 전체 주식을 현재 가격으로 곱한 값이에요.'},
        {id: 'L3Q3', q: '주가 10만원인 A사와 1만원인 B사. 어느 회사가 더 큰 회사일까요?', choices: ['주가만으로는 알 수 없어요. 시가총액을 봐야 해요', '무조건 A사', '무조건 B사', '둘은 같아요'], why: '발행 주식 수가 다를 수 있어서 시가총액으로 비교해야 해요.'},
        {id: 'L3Q4', q: '한국 주식 화면에서 보통 상승을 나타내는 색은?', choices: ['빨강', '파랑', '초록', '검정'], why: '한국은 상승 빨강, 하락 파랑이에요. 미국은 반대인 곳이 많아요.'}]},
    {id: 'L4', badge: '🛡️', rank: '위험 관리자', title: '위험과 분산', goal: '손실의 무게, 분산투자, ETF, 빚투의 위험을 알아요.',
      pages: [
        {title: '손실은 비대칭이에요', body: ['100만원이 50% 떨어지면 50만원이 돼요. 본전이 되려면 +50%가 아니라 +100%가 올라야 해요.', '−10%는 +11.1%, −20%는 +25%, −50%는 +100%가 필요해요. 크게 잃을수록 되찾기가 어려워요.'], tip: '그래서 "얼마나 벌까"보다 "얼마까지 잃어도 괜찮을까"를 먼저 생각해요.'},
        {title: '분산투자와 ETF', body: ['한 종목에 모두 넣지 않고 여러 종목·자산·시기로 나누면 한 종목이 무너질 때의 충격이 줄어요.', '"ETF"는 여러 종목을 한 바구니에 묶어 놓은 펀드를 주식처럼 사고파는 상품이에요. 분산해도 시장 전체가 떨어지면 같이 떨어져요.'], tip: '분산은 위험을 줄이는 방법이지 손실이 없어지는 방법은 아니에요.'},
        {title: '빚투와 레버리지', body: ['빌린 돈으로 하는 투자("빚투")는 이익도 손실도 커지고, 원금보다 더 잃을 수도 있어요.', '레버리지 ETF는 지수의 하루 변동을 몇 배로 따라가서, 오래 들고 있으면 기대와 다르게 움직일 수 있어요.', '정해진 날에 나누어 사는 "적립식"은 한 번에 사는 위험을 줄여 줘요.'], tip: '투자는 잃어도 생활에 지장이 없는 돈으로만 해요.'}],
      quiz: [
        {id: 'L4Q1', q: '100만원이 50% 떨어져 50만원이 됐어요. 원금을 되찾으려면 얼마나 올라야 할까요?', choices: ['+100%', '+50%', '+25%', '+75%'], why: '50만원이 100만원이 되려면 두 배, 즉 +100%가 필요해요.'},
        {id: 'L4Q2', q: '분산투자를 가장 잘 설명한 것은?', choices: ['한곳에 몰리지 않게 나눠서 한 종목의 위험을 줄이는 것', '손실을 완전히 없애는 것', '수익을 두 배로 만드는 것', '한 종목만 오래 보는 것'], why: '분산은 위험을 줄이지만 없애지는 못해요.'},
        {id: 'L4Q3', q: 'ETF는 무엇일까요?', choices: ['여러 종목을 묶어 주식처럼 사고파는 상품', '은행 예금의 이름', '한 회사가 새로 찍은 주식', '증권사 수수료의 이름'], why: '많은 ETF는 여러 종목을 담지만, 특정 자산이나 전략에 집중한 ETF도 있어요. 이름만 보고 분산된 상품이라고 단정하지 말고 구성과 위험을 확인해요.'},
        {id: 'L4Q4', q: '빌린 돈으로 투자하는 "빚투"의 위험은?', choices: ['이익도 손실도 커지고 원금보다 더 잃을 수 있어요', '손실이 절대 나지 않아요', '이자만 내면 끝이에요', '정부가 손실을 보상해요'], why: '빚은 갚아야 해서 손실이 나면 부담이 훨씬 커져요.'}]},
    {id: 'L5', badge: '🌐', rank: '시장 관찰자', title: '경제와 뉴스 읽기', goal: '금리·물가·환율과 경제지표, 뉴스를 어떻게 읽는지 알아요.',
      pages: [
        {title: '금리, 물가, 환율', body: ['"기준금리"는 중앙은행(한국은행, 미국 연준)이 정하는 금리예요. 금리가 오르면 대출 이자 부담이 커지고 예금의 매력이 올라서, 주식에는 부담이 되는 경우가 많지만 항상 그런 것은 아니에요.', '"물가"가 빠르게 오르면 금리를 올릴 거라는 걱정이 생겨요. "환율"이 1,300원에서 1,400원이 되면 달러가 원화보다 비싸진 거예요.'], tip: '경제 변수 하나가 주가를 정하지 않아요. 여러 요인 중 하나로 봐요.'},
        {title: '경제지표 발표 읽기', body: ['경제지표는 발표 때 "예상치"와 비교해서 시장이 놀라면 가격이 움직여요. 숫자 자체보다 예상보다 높은지 낮은지, 직전 값과 어떤지가 중요해요.', 'ZERO의 경제지표 화면은 과거 발표가 직전 값보다 높게 나온 횟수와 낮게 나온 횟수를 세어 "높게 51% 대 낮게 49%"처럼 보여 줘요. 과거를 센 참고 통계이고, 100% 맞는 예측은 없어요.'], tip: '확률처럼 보이는 숫자도 미래를 보장하지 않아요.'},
        {title: '뉴스는 이렇게 읽어요', body: ['제목만 보고 사거나 팔지 않아요. 출처가 믿을 만한지, 날짜가 언제인지, 사실과 의견이 섞이지 않았는지 확인해요.', '좋은 소식이 이미 가격에 반영돼 있을 수도 있어요. 같은 소식을 여러 곳에서 비교해요. ZERO 전광판은 정치·경제 분야의 공신력 있는 기관 기사만 모아요.'], tip: '소문과 사실은 달라요. 출처가 없으면 의심해요.'}],
      quiz: [
        {id: 'L5Q1', q: '일반적으로 금리가 오르면 주식에는?', choices: ['부담이 되는 경우가 많지만 항상 그런 것은 아니에요', '항상 주가가 올라요', '항상 주가가 내려요', '아무 영향이 없어요'], why: '금리는 중요한 요인이지만 기업 실적 등 다른 요인과 함께 움직여요.'},
        {id: 'L5Q2', q: '원/달러 환율이 1,300원에서 1,400원이 됐어요. 어떤 뜻일까요?', choices: ['달러가 원화보다 비싸졌어요', '달러가 싸졌어요', '아무 변화가 없어요', '원화 가치가 올랐어요'], why: '달러 1개를 사는 데 더 많은 원화가 필요하니 달러가 비싸진 거예요.'},
        {id: 'L5Q3', q: 'ZERO의 "높게 51% 대 낮게 49%" 같은 숫자는 무엇일까요?', choices: ['과거 발표를 센 참고 통계이고 맞는다는 보장은 없어요', '반드시 맞는 예언이에요', '사라는 신호예요', '정부의 공식 전망이에요'], why: '과거 빈도를 센 것이라 앞으로를 보장하지 않아요. 100% 맞는 예측은 없어요.'},
        {id: 'L5Q4', q: '뉴스를 볼 때 가장 좋은 습관은?', choices: ['출처와 날짜를 확인하고 여러 곳과 비교해요', '제목만 보고 바로 거래해요', 'SNS 소문을 먼저 믿어요', '가장 자극적인 기사를 믿어요'], why: '출처·날짜·비교가 기본이에요.'}]},
    {id: 'L6', badge: '🏆', rank: 'ZERO 마스터', title: 'ZERO 사용법', goal: 'ZERO가 해 주는 일과 쓰는 방법, 믿는 방법을 알아요.',
      pages: [
        {title: 'ZERO가 해 주는 일', body: ['1억원으로 시작한 가상 참고 포트폴리오("내 자산")를 보여 줘요. 종목 검색·차트·기업 정보, 경제지표·뉴스·보고서를 출처와 기준 시각과 함께 모아 줘요.', '근거가 없는 숫자는 지어내지 않고 "미확인"이라고 적어요. ZERO 팀(가상 직원들)이 역할을 나눠 일하는 모습도 볼 수 있어요.', 'ZERO가 하지 않는 것: 실제 주문, 투자 권유, 수익 보장. 공부와 참고용이에요.'], tip: '모든 숫자에 기준 시각과 출처가 붙어 있어요.'},
        {title: '화면 둘러보기', body: ['내 자산 · 주식 탐색 · 종목·차트 · 주요 뉴스 · 경제 지표 · 보고서 자료실 · 주식 공부 · ZERO 사무실/팀. 왼쪽 메뉴(휴대폰은 아래 메뉴)에서 이동해요.', '위쪽 검색창에 종목 이름이나 코드를 입력하면 차트와 기업 정보가 열려요(컴퓨터에서는 / 키).', '긴 숫자는 소수점 둘째 자리까지만(반올림 없이 자른 값) 보이고, 숫자에 마우스를 올리거나 누르면 전체 값이 나와요.'], tip: '경제 지표를 누르면 설명과 과거 통계, 참고 시나리오가 열려요.'},
        {title: '어떻게 믿고 써요?', body: ['"미확인"은 모른다는 정직한 표시예요. 0원이나 오류가 아니에요.', '같은 출처의 자료는 한 줄로 묶어 보여 주고 "더 보기"로 펼칠 수 있어요.', '모든 투자 판단은 대표님의 몫이에요. ZERO는 이해를 돕는 도구예요. 내 사무실에서는 나만의 팀과 사무실을 꾸미고, 연습용 1억원으로 연습 수익률을 겨뤄 볼 수 있어요.'], tip: '막히면 사무실의 총괄에게 "ZERO가 뭐예요?"라고 물어보세요.'}],
      quiz: [
        {id: 'L6Q1', q: 'ZERO가 실제 주식 주문을 내나요?', choices: ['아니요, 주문은 내지 않아요(공부·참고용)', '네, 자동으로 내요', '버튼을 누르면 바로 내요', '유료일 때만 내요'], why: 'ZERO는 실제 주문을 내지 않는 공부·참고용 도구예요.'},
        {id: 'L6Q2', q: '화면에 "미확인"이라고 보이면 무슨 뜻일까요?', choices: ['확인된 근거가 없어서 숫자를 지어내지 않은 거예요', '값이 0원이라는 뜻이에요', '곧 오른다는 신호예요', '삭제된 종목이라는 뜻이에요'], why: '모르는 것을 아는 척하지 않으려고 "미확인"이라고 적어요.'},
        {id: 'L6Q3', q: '종목을 찾는 가장 빠른 방법은?', choices: ['위쪽 검색창에 이름이나 코드를 입력해요', '캐릭터를 걷게 해요', '설정을 열어요', '새로고침을 반복해요'], why: '검색창에 이름이나 코드를 넣으면 차트와 기업 정보가 열려요.'},
        {id: 'L6Q4', q: '줄여 보이는 긴 숫자의 전체 값은 어떻게 볼까요?', choices: ['숫자에 마우스를 올리거나 눌러요', '화면을 닫아요', '방법이 없어요', '메뉴에서 로그아웃해요'], why: '숫자에 마우스를 올리거나 누르면 전체 값이 나와요.'}]}
  ];

  const PASS_RATIO = 0.75, XP_RIGHT = 10, XP_PASS = 30, XP_PERFECT = 20;
  const levelById = (id) => LEVELS.find((level) => level.id === id) || null;
  const emptyProgress = () => ({v: 1, xp: 0, passed: {}, solved: {}});

  // Deterministic shuffle (mulberry32 seeded from the question id): stable across renders, different per question.
  function seedOf(text) { let h = 2166136261; for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffled(question) {
    let state = seedOf(question.id), order = question.choices.map((_, index) => index);
    const next = () => { state = (state + 0x6D2B79F5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return {choices: order.map((index) => question.choices[index]), answer: order.indexOf(0)};
  }
  const needed = (level) => Math.ceil(level.quiz.length * PASS_RATIO);

  // `picks` holds the chosen index (in shuffled order) for every question, in order.
  function evaluate(level, picks) {
    const right = level.quiz.filter((question, index) => picks[index] === shuffled(question).answer).length;
    return {correct: right, total: level.quiz.length, needed: needed(level), passed: right >= needed(level), perfect: right === level.quiz.length};
  }
  // Applies a finished quiz to the saved progress. XP is paid once per question and once per level, so retries never farm points.
  function submit(progress, level, picks) {
    const next = {...emptyProgress(), ...progress, passed: {...progress.passed}, solved: {...progress.solved}}, result = evaluate(level, picks);
    let gained = 0;
    level.quiz.forEach((question, index) => { if (picks[index] === shuffled(question).answer && !next.solved[question.id]) { next.solved[question.id] = 1; gained += XP_RIGHT; } });
    const before = next.passed[level.id], leveledUp = result.passed && !before;
    if (result.passed) {
      if (!before) gained += XP_PASS;
      if (result.perfect && !(before && before.perfect)) gained += XP_PERFECT;
      next.passed[level.id] = {score: Math.max(result.correct, before?.score || 0), total: result.total, perfect: Boolean(result.perfect || before?.perfect)};
    }
    next.xp += gained;
    return {progress: next, result, gained, leveledUp};
  }
  const unlocked = (progress, level) => { const index = LEVELS.indexOf(level); return index === 0 || Boolean(progress.passed[LEVELS[index - 1].id]); };
  const playerLevel = (progress) => Math.min(LEVELS.length + 1, 1 + LEVELS.filter((level) => progress.passed[level.id]).length);
  const currentLevel = (progress) => LEVELS.find((level) => !progress.passed[level.id]) || null;
  // The title of the highest passed level; before the first pass the learner is a beginner.
  const rankOf = (progress) => { const done = LEVELS.filter((level) => progress.passed[level.id]); return done.length ? done[done.length - 1].rank : '입문 전'; };
  const maxXp = () => LEVELS.reduce((sum, level) => sum + level.quiz.length * XP_RIGHT + XP_PASS + XP_PERFECT, 0);
  // Share of the current level's questions answered correctly at least once (the bar under the title).
  function levelProgress(progress) {
    const level = currentLevel(progress); if (!level) return 1;
    return level.quiz.filter((question) => progress.solved[question.id]).length / level.quiz.length;
  }
  // Tolerant load: anything unexpected in saved data falls back to a fresh start.
  function normalize(raw) {
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data || data.v !== 1) return emptyProgress();
      const known = new Set(LEVELS.flatMap((level) => level.quiz.map((question) => question.id))), out = emptyProgress();
      out.xp = Number.isFinite(data.xp) && data.xp >= 0 ? Math.min(data.xp, maxXp()) : 0;
      Object.keys(data.solved || {}).forEach((id) => { if (known.has(id)) out.solved[id] = 1; });
      Object.keys(data.passed || {}).forEach((id) => { const level = levelById(id), row = data.passed[id]; if (level && row && Number.isFinite(row.score)) out.passed[id] = {score: Math.min(level.quiz.length, Math.max(0, row.score)), total: level.quiz.length, perfect: Boolean(row.perfect)}; });
      return out;
    } catch (_) { return emptyProgress(); }
  }

  // ---- practice trade (level 2): a made-up stock, whole shares, no fees, to feel what buy and sell do ----------
  const PRACTICE_PRICES = [10000, 10400, 9800, 10900, 10300, 11200], PRACTICE_CASH = 100000;
  const practiceStart = () => ({day: 0, cash: PRACTICE_CASH, qty: 0, avg: 0, realized: 0, sold: 0, log: ['연습 시작! 가상의 종목, 현금 100,000원이에요.']});
  const practicePrice = (state) => PRACTICE_PRICES[state.day];
  const won = (value) => Math.trunc(value).toLocaleString('ko-KR') + '원';
  function practiceAct(state, action) {
    const price = practicePrice(state), next = {...state, log: state.log.slice(-5)};
    delete next.error;
    if (action === 'buy') {
      if (state.cash < price) return {...next, error: '현금이 부족해요.'};
      next.avg = (state.avg * state.qty + price) / (state.qty + 1); next.qty = state.qty + 1; next.cash = state.cash - price;
      next.log.push((state.day + 1) + '일차: 1주를 ' + won(price) + '에 샀어요. 평균단가 ' + won(next.avg));
    } else if (action === 'sell') {
      if (state.qty < 1) return {...next, error: '팔 주식이 없어요. 먼저 사 보세요.'};
      const gain = price - state.avg; next.qty = state.qty - 1; next.cash = state.cash + price; next.realized = state.realized + gain; next.sold = state.sold + 1; if (next.qty === 0) next.avg = 0;
      next.log.push((state.day + 1) + '일차: 1주를 ' + won(price) + '에 팔았어요. 실현손익 ' + (gain >= 0 ? '+' : '−') + won(Math.abs(gain)));
    } else if (action === 'next') {
      if (state.day >= PRACTICE_PRICES.length - 1) return {...next, error: '마지막 날이에요.'};
      next.day = state.day + 1; next.log.push((next.day + 1) + '일차가 됐어요. 가격이 ' + won(PRACTICE_PRICES[next.day]) + '(으)로 바뀌었어요.');
    } else return next;
    return next;
  }
  const practiceView = (state) => ({price: practicePrice(state), value: state.qty * practicePrice(state), unrealized: state.qty ? (practicePrice(state) - state.avg) * state.qty : 0, goalMet: state.realized > 0, lastDay: state.day >= PRACTICE_PRICES.length - 1});

  const api = {LEVELS, PASS_RATIO, XP_RIGHT, XP_PASS, XP_PERFECT, levelById, emptyProgress, shuffled, needed, evaluate, submit, unlocked, playerLevel, currentLevel, rankOf, maxXp, levelProgress, normalize,
    PRACTICE_PRICES, practiceStart, practiceAct, practiceView, won};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ZEROAcademyLogic = api;
})();
