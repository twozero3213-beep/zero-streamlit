# zero-streamlit

ZERO 공개 연구 자료 뷰어(Streamlit). 링크를 아는 누구나 읽기만 할 수 있다.
계좌·보유 종목·평가액·주문·키·원장·로그는 이 저장소와 앱에 없다.

## 담긴 자료 (`data/`, ZERO `zero/data`의 커밋된 파일 6개에서 화면에 쓰는 항목만 남긴 사본)
연구 참고 저장소 목록, 가상 직원 명부, 위기 사례 연구, 브리핑 자료 출처, 격리 연구 도구, 미국 자료 출처.
직원 작업 지시·코드 모듈 경로·부족 근거 같은 내부 항목은 `sync_data.py`가 걸러낸다.
다른 파일·내부 항목·계좌·키·이메일 모양은 `tests/test_app.py`가 거부한다.

## 실행·검사
```
pip install -r requirements.txt
streamlit run streamlit_app.py
python -m unittest discover -s tests
```

## 자료 갱신 (ZERO 체크아웃의 커밋된 상태에서만)
```
python sync_data.py <ZERO 체크아웃 경로> [커밋]
python -m unittest discover -s tests
```
테스트가 통과하면 커밋·push한다. Streamlit Community Cloud가 다시 배포한다.

## 배포
Streamlit Community Cloud → New app → 이 저장소, 브랜치 `main`, 파일 `streamlit_app.py`.
무료 플랜은 비공개 저장소 앱이 1개뿐이라 이 저장소를 공개로 두고 공개 앱으로 배포한다. Secrets는 필요 없다.
