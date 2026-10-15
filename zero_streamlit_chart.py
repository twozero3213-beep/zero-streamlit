"""Pinned lightweight-charts-python component for completed public OHLCV."""
from datetime import datetime, timezone
from math import isfinite
from pathlib import Path


def chart_frame(bars):
    if not isinstance(bars, list) or not 1 <= len(bars) <= 2200:
        raise ValueError('CHART_BARS_INVALID')
    rows, previous = [], 0
    now = datetime.now(timezone.utc).timestamp()
    for bar in bars:
        if not isinstance(bar, dict) or bar.get('completed') is not True:
            raise ValueError('CHART_BARS_INVALID')
        timestamp = bar.get('time')
        if type(timestamp) is not int or not previous < timestamp < now:
            raise ValueError('CHART_TIME_INVALID')
        values = [bar.get(k) for k in ('open', 'high', 'low', 'close', 'volume')]
        if any(type(v) not in (int, float) or not isfinite(v) for v in values):
            raise ValueError('CHART_VALUES_INVALID')
        opened, high, low, closed, volume = values
        if not 0 < low <= min(opened, closed) <= max(opened, closed) <= high or volume < 0:
            raise ValueError('CHART_VALUES_INVALID')
        rows.append(dict(time=datetime.fromtimestamp(timestamp, timezone.utc).replace(tzinfo=None),
                         open=opened, high=high, low=low, close=closed, volume=volume))
        previous = timestamp
    import pandas as pd
    return pd.DataFrame(rows)


def _technical_series(chart, frame):
    # Averages start only after the full number of completed observations exists.
    chart.price_scale(scale_margin_top=0.08, scale_margin_bottom=0.28)
    chart.volume_config(scale_margin_top=0.78, scale_margin_bottom=0.02,
                        up_color='#c93b4960', down_color='#1b64da60')
    for period, color in ((20, '#8b5cf6'), (60, '#009681')):
        name = f'MA{period}'
        values = frame[['time']].copy()
        values[name] = frame['close'].rolling(period, min_periods=period).mean()
        line = chart.create_line(name=name, color=color, width=1,
                                 price_line=False, price_label=False)
        line.set(values.dropna())
    chart.fit()


def render_chart(bars, *, height=240):
    """Normal Streamlit widget for callers already inside a fragment/page."""
    if type(height) is not int or not 160 <= height <= 360:
        raise ValueError('CHART_HEIGHT_INVALID')
    frame = chart_frame(bars)
    from lightweight_charts.widgets import StreamlitChart
    chart = StreamlitChart(height=height, toolbox=False)
    chart.layout(background_color='#ffffff', text_color='#333d4b', font_size=13)
    chart.candle_style(up_color='#c93b49', down_color='#1b64da',
                       border_up_color='#c93b49', border_down_color='#1b64da',
                       wick_up_color='#c93b49', wick_down_color='#1b64da')
    chart.set(frame)
    _technical_series(chart, frame)
    chart.load()
    return chart


def chart_document(bars, *, height=240):
    """Standalone iframe response avoids Python reruns while zooming or panning."""
    if type(height) is not int or not 160 <= height <= 360:
        raise ValueError('CHART_HEIGHT_INVALID')
    frame = chart_frame(bars)
    from lightweight_charts.widgets import StreamlitChart

    class IndependentChart(StreamlitChart):
        # Version 2.1 exposes this widget-specific rendering hook.
        def _load(self):
            self.document = (self._html + ";window.parent.postMessage({type:'zero-technical-ready'},'*');</script>"
                             '<a href="https://www.tradingview.com/" target="_blank" '
                             'rel="noopener noreferrer" style="position:fixed;bottom:0;right:4px;'
                             'font-size:12px;background:white;color:#333">'
                             'TradingView Lightweight Charts™</a></body></html>')

    chart = IndependentChart(height=height, toolbox=False)
    chart.layout(background_color='#ffffff', text_color='#333d4b', font_size=13)
    chart.candle_style(up_color='#c93b49', down_color='#1b64da',
                       border_up_color='#c93b49', border_down_color='#1b64da',
                       wick_up_color='#c93b49', wick_down_color='#1b64da')
    chart.set(frame)
    _technical_series(chart, frame)
    chart.load()
    licenses = Path(__file__).with_name('chart_licenses.txt').read_text(encoding='utf-8')
    return chart.document + '\n<!--\n' + licenses.replace('--', '- -') + '\n-->'
