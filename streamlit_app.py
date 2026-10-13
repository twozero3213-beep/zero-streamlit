"""ZERO public research viewer. Reads only the bundled public JSON snapshots in data/."""
import json
from pathlib import Path

import streamlit as st

DATA = Path(__file__).parent / 'data'
GITHUB = 'https://github.com/'


@st.cache_data
def load(name):
    return json.loads((DATA / (name + '.json')).read_text(encoding='utf-8'))


def github_only(url):
    # Only GitHub https links are rendered as links; anything else is dropped.
    return url if isinstance(url, str) and url.startswith(GITHUB) else None


st.set_page_config(page_title='ZERO 연구 자료', page_icon='📊', layout='wide')
st.title('ZERO 연구 자료')
st.caption('공개 자료만 보여주는 읽기 전용 화면입니다. 계좌·보유 종목·평가액·주문 기능은 없고, 투자 권유가 아닙니다.')

refs, staff, crises, sources, tools = (load(n) for n in (
    'research_connections', 'team_staff', 'crisis_history', 'briefing_sources', 'research_tools'))
staff_names = {s['id']: s['name'] for s in staff['staff']}

tab_home, tab_refs, tab_staff, tab_crisis, tab_sources = st.tabs(
    ['개요', '연구 참고 저장소', '가상 직원', '위기 사례', '자료 출처'])

with tab_home:
    st.subheader('ZERO란')
    st.write('분기 점검과 모의투자(KIS_MOCK)를 근거 중심으로 운영하는 연구 시스템입니다. '
             '이 화면은 그중 공개해도 되는 연구 자료만 모았습니다.')
    c1, c2, c3 = st.columns(3)
    c1.metric('연구 참고 저장소', len(refs['connections']))
    c2.metric('가상 직원 역할', len(staff['staff']))
    c3.metric('위기 사례', len(crises['events']))
    st.info('포크한 저장소는 원본 소스의 사본일 뿐 설치·실행하지 않았고, 주문·계좌 조회·자동 매매 권한이 없습니다. '
            '가상 직원은 실제 고용이나 검증된 수익의 증거가 아닌 역할 설계입니다.')
    st.caption(f"저장소 목록 기준일 {refs['reviewed_on']} · 직원 명부 {staff['reviewed_on']} · 위기 사례 {crises['research_as_of_kst']}")

with tab_refs:
    st.write(refs['ranking_basis'])
    query = st.text_input('검색 (저장소·용도)', '')
    rows = []
    for c in refs['connections']:
        text = f"{c['upstream']} {c['purpose']}".lower()
        if query.lower() in text:
            rows.append({'★ 별': c['stars'], '원본': github_only(c['upstream_url']), '용도': c['purpose'],
                         '라이선스': c['license'], '우리 포크': github_only(c['fork_url']),
                         '담당': ', '.join(staff_names.get(i, i) for i in c['responsible_staff']),
                         '주의': ' / '.join(c['limits'])})
    st.caption(f'{len(rows)}개 · 별 수 내림차순')
    st.dataframe(rows, hide_index=True, width='stretch', column_config={
        '★ 별': st.column_config.NumberColumn(format='%d'),
        '원본': st.column_config.LinkColumn(display_text=r'github\.com/(.*)'),
        '우리 포크': st.column_config.LinkColumn(display_text=r'github\.com/(.*)'),
        '용도': st.column_config.TextColumn(width='large'),
        '주의': st.column_config.TextColumn(width='large')})
    st.caption('\n'.join('· ' + line for line in refs['limits']))

with tab_staff:
    st.write(f"{len(staff['staff'])}개 역할 (가상). 권한: {staff['authority']}")
    for s in staff['staff']:
        with st.expander(f"{s['name']} · {s['priority']}"):
            st.write(s['mandate'])
            st.write('**입력**'); st.write('\n'.join('- ' + x for x in s['inputs']))
            st.write('**산출**'); st.write('\n'.join('- ' + x for x in s['outputs']))
            st.caption(f"상위 {s['owner']} · 검토 {staff_names.get(s['reviewer'], s['reviewer'])}")

with tab_crisis:
    st.write(f"연구 기준일 {crises['research_as_of_kst']} · 상태 {crises['research_status']}")
    st.caption(crises['known_at_policy'])
    for e in crises['events']:
        with st.expander(f"{e['name']} ({e['period']})"):
            st.write('**교훈**'); st.write('\n'.join('- ' + x for x in e['lessons']))
            st.write('**검증할 가설**'); st.write('\n'.join('- ' + x for x in e['hypotheses']))
    st.caption('사례 연구와 가설일 뿐 모형 학습·초과성과·수익이 검증되지 않았습니다.')

with tab_sources:
    st.write('브리핑 자료 출처 (공개 RSS·문서)')
    st.dataframe([{'이름': s['label'], '종류': s['kind'], '형식': s['format'], '주소': s['url']}
                  for s in sources['sources']], hide_index=True, width='stretch',
                 column_config={'주소': st.column_config.LinkColumn(display_text='열기')})
    st.write('격리 연구 도구 (설치 상태와 별도)')
    # Some entries are partial (e.g. only an id), so every field is optional.
    st.dataframe([{'도구': t['id'], '저장소': github_only(t.get('repository')), '버전': t.get('version', '-'),
                   '라이선스': t.get('license', '-')} for t in tools['tools']],
                 hide_index=True, width='stretch',
                 column_config={'저장소': st.column_config.LinkColumn(display_text=r'github\.com/(.*)')})
    st.caption('원천 자료의 이용조건은 코드 라이선스와 별도입니다.')
