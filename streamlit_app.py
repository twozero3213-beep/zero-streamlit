"""Entry point. `streamlit run streamlit_app.py` detects `app` (st.App) and serves:
- /           a Streamlit page that shows the ZERO UI full-screen,
- /zero/      the original ZERO web UI (ui/, built by build_ui.py),
- /zero/api/  a read-only bridge to the ZERO Cloudflare site with owner-approved reference figures; write requests are refused (zero_proxy.py).
"""
from pathlib import Path

import streamlit as st

from zero_proxy import routes

app = st.App(str(Path(__file__).with_name('zero_page.py')), routes=routes)
