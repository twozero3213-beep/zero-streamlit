# zero-streamlit

ZERO 포트폴리오 화면(로컬 `127.0.0.1:8765`와 같은 화면)을 Streamlit으로 공개 배포하는 저장소.
링크를 아는 누구나 읽기만 할 수 있다. **계좌 금액·수량·가격·손익·수익률은 서버에서 지운 뒤** 보내고,
보유 종목은 비중(%)만 보인다. 주문·계좌 새로고침·업무 요청 제출은 막혀 있다.

## 구조
- `streamlit_app.py` — 진입점. `st.App`(Streamlit 1.65+)이 아래 경로를 함께 제공한다.
- `zero_page.py` — `/` 페이지. 원래 화면을 전체 크기로 연다.
- `ui/` — 원래 ZERO 웹 화면(Cloudflare 빌드 `public/`의 사본). `/zero/`에서 서빙.
- `zero_proxy.py` — `/zero/api/*`를 ZERO Cloudflare 사이트에서 서버가 대신 읽는다(허용 목록 GET만).
  포트폴리오는 금액류를 모두 null로 바꾸고 평가액 칸을 비중으로 바꾼다. 업무 요청 목록은 비운다.
- `build_ui.py` — `ui/`를 다시 만든다. 경로를 상대경로로 바꾸고 공개용 표시(비공개 문구·새로고침 숨김)를 넣는다.

## 배포 (Streamlit Community Cloud)
New app → 저장소 `twozero3213-beep/zero-streamlit`, 브랜치 `main`, 파일 `streamlit_app.py`.
Advanced settings → Secrets에 아래 두 줄(값은 소유자의 `zero-cloudflare.env`에서 붙여넣기, 저장소에는 넣지 않는다):

```
CF_ACCESS_CLIENT_ID = "..."
CF_ACCESS_CLIENT_SECRET = "..."
```
Secrets가 없으면 화면은 열리지만 데이터 칸이 비고 `/zero/api/*`는 `NOT_CONFIGURED`를 돌려준다.

## 갱신·검사
```
python build_ui.py <...\d\sites\zero-cloudflare\public> <...\outputs\zero-v2>
python -m unittest discover -s tests
```
로컬 실행: 환경변수 `ZERO_CF_ACCESS_CLIENT_ID`, `ZERO_CF_ACCESS_CLIENT_SECRET`을 두고 `streamlit run streamlit_app.py`.
