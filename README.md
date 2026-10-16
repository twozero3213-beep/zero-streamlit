# zero-streamlit

ZERO 포트폴리오 화면(로컬 `127.0.0.1:8765`와 같은 화면)을 Streamlit으로 배포하는 저장소.
링크를 아는 누구나 볼 수 있다(2026-10-13 소유자 결정: 계좌 금액·수량·수익률까지 전부 공개).
화면의 새로고침은 공개 시세로 평가액을 다시 계산한다. **계좌 새로고침과 업무 요청 제출은 소유자 PC에서만** 되며
이 앱은 모든 쓰기 요청을 `OWNER_PC_ONLY`로 거부한다. 주문 기능은 없다.

## 구조
- `streamlit_app.py` — 진입점. `st.App`(Streamlit 1.65+)이 아래 경로를 함께 제공한다.
- `zero_page.py` — `/` 페이지. 원래 화면을 전체 크기로 연다.
- `ui/` — 원래 ZERO 웹 화면(Cloudflare 빌드 `public/`의 사본, 경로만 상대경로로 변환). `/zero/`에서 서빙.
- `zero_proxy.py` — `/zero/api/*`를 ZERO Cloudflare 사이트에서 서버가 대신 읽는다(허용 목록 GET만, 짧은 캐시).
  `/zero/status`는 키 설정 모양과 연결 결과만 알려준다(키 값 없음, 항상 200).
- `zero_headlines.py` — `/zero/api/headlines`: 뉴스 검색 결과 제목만 요청 때 모아 5분 캐시(https 링크만, 전부 실패하면 캐시하지 않고 503).
- `extras/headlines.js` — 주요 뉴스 화면 위에 "실시간 헤드라인" 패널. 경로가 없거나 실패하면 숨겨져 원래 화면과 같다.
- `build_ui.py` — `ui/`를 다시 만들고 `extras/*.js`를 `index.html`에 붙인다.
  닉네임 계정 서버 주소는 환경변수 `ZERO_LOBBY_API`로 주입한다(현재 `https://zero-lobby.zero-cloudflare.workers.dev`, zero-bot의 `scripts/build_lobby_worker.py`로 만든 Worker). 비우면 가입 버튼은 "준비 중"이다. 빌드 때 이 값을 빼먹으면 가입이 꺼지니 주의.

이메일 가입·로그인은 별도 공개 인증 서버의 `AUTH_EMAIL_ENABLED`와 Supabase SMTP·숫자 인증번호 메일 템플릿을 함께 설정해야 합니다. Streamlit의 HTTP 보안정책은 ZERO의 기존 공개 Supabase 프로젝트 한 곳을 기본 허용하며, `ZERO_AUTH_SUPABASE_ORIGIN`으로 지정된 HTTPS 프로젝트 주소로만 교체할 수 있습니다. Streamlit이 HTTP 보안 헤더를 전달하지 않아도 보호되도록 빌드 시 HTML CSP에도 같은 인증 주소를 반영합니다.

## 배포 (Streamlit Community Cloud)
New app → 저장소 `twozero3213-beep/zero-streamlit`, 브랜치 `main`, 파일 `streamlit_app.py`, Python 3.13.
Settings → Secrets (값은 소유자의 `zero-cloudflare.env`에서, 저장소에는 넣지 않는다):

```
CF_ACCESS_CLIENT_ID = "..."
CF_ACCESS_CLIENT_SECRET = "..."
```
Community Cloud는 앱의 오류 상태를 일반 500으로 바꾸므로, 데이터가 비면 `<앱 주소>/~/+/zero/status`로 원인을 본다.

## 갱신·검사
- 화면(`zero_page.py`, `ui/`)은 푸시하면 바로 반영된다. **프록시(`zero_proxy.py`)·`zero_headlines.py`를 고치면 앱 프로세스를 다시 시작해야** 새 경로가 보인다:
  `requirements.txt` 맨 아래 날짜 주석을 바꿔 푸시하거나 Manage app → Reboot.
```
python build_ui.py <...\d\sites\zero-cloudflare\public> <...\outputs\zero-v2>
python -m unittest discover -s tests
```
로컬 실행: 환경변수 `ZERO_CF_ACCESS_CLIENT_ID`, `ZERO_CF_ACCESS_CLIENT_SECRET`을 두고 `streamlit run streamlit_app.py`.
