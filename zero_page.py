"""Streamlit page: the original ZERO UI full-screen.

The UI is served by zero_proxy at zero/ relative to the app. The frame resolves that against the
app's own URL so it also works under Community Cloud's path prefix.
"""
from pathlib import Path

import streamlit as st

CANVAS = '#f7f8fa'  # the ZERO UI's own background, so nothing dark shows before or around it

# The ZERO UI scrolls by itself. Pin its frame to the whole viewport and stop the Streamlit page from
# scrolling; a 100vh frame inside a taller element left a dark band and a second scrollbar.
FULL_SCREEN = f"""<style>
html,body,[data-testid="stApp"],[data-testid="stAppViewContainer"],[data-testid="stMain"]{{background:{CANVAS}!important;overflow:hidden!important}}
header,footer,[data-testid="stToolbar"],[data-testid="stDecoration"]{{display:none!important}}
.block-container,[data-testid="stMainBlockContainer"]{{padding:0!important;max-width:100%!important}}
iframe{{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;border:0!important;background:{CANVAS}}}
</style>"""

# The tab shows the ZERO UI's own title and logo (not Streamlit's default emoji), so it matches the page it frames.
st.set_page_config(page_title='ZERO · 나의 포트폴리오', page_icon=str(Path(__file__).with_name('ui') / 'assets' / 'icon-192.png'),
                   layout='wide', initial_sidebar_state='collapsed')
st.markdown(FULL_SCREEN, unsafe_allow_html=True)
st.iframe("<script>location.replace(new URL('zero/', parent.location.href))</script>"
          "<a href='zero/' target='_top'>ZERO 열기</a>", height=100)
