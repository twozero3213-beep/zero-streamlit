"""Streamlit page: the original ZERO UI full-screen.

The UI is served by zero_proxy at zero/ relative to the app. The frame resolves that against the
app's own URL so it also works under Community Cloud's path prefix.
"""
import streamlit as st

st.set_page_config(page_title='ZERO 포트폴리오', page_icon='📊', layout='wide', initial_sidebar_state='collapsed')
st.markdown('<style>header,footer,[data-testid="stToolbar"],[data-testid="stDecoration"]{display:none!important}'
            '.block-container,[data-testid="stMainBlockContainer"]{padding:0!important;max-width:100%!important}'
            'iframe{height:100vh!important;border:0!important}</style>', unsafe_allow_html=True)
st.iframe("<script>location.replace(new URL('zero/', parent.location.href))</script>"
          "<a href='zero/' target='_top'>ZERO 열기</a>", height=900)
