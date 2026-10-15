"""Optional trend sidecar; the existing HTTP route is deliberately wired by its owner.

Keep one TrendService per trusted server configuration. Google shares the existing
proxy's hourly cache/singleflight; YouTube uses the same cache machinery with an
opaque per-instance key so credentials never enter cache keys or public output.
No environment, Streamlit Secrets or runtime configuration is read by this module.
"""
from datetime import datetime, timezone
import json

import zero_trend_providers as providers
from zero_trend_filter import fallback_keywords, get_safe_trend_keyword, safe_trend_keywords


class TrendService:
    def __init__(self, *, youtube_enabled=False, youtube_api_key=None):
        self._youtube_enabled = youtube_enabled is True
        self._youtube_api_key = (youtube_api_key if isinstance(youtube_api_key, str)
                                 and providers._KEY.fullmatch(youtube_api_key) else None)
        self._youtube_cache_key = object()

    def get_trends(self, now=None):
        import zero_proxy as proxy

        google = json.loads(proxy.get_trends())
        now = now or datetime.now(timezone.utc)
        observed_at = google.get('retrieved_at')
        try:
            observed = datetime.fromisoformat(observed_at)
            if observed.tzinfo is None or observed > now:
                raise ValueError('TREND_OBSERVATION_INVALID')
            observed_at = observed.astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError):
            google = {'state': 'UNAVAILABLE', 'items': []}
            observed_at = None
        # Refilter even an already-cached result before creating keyword variables.
        google = providers._result('GOOGLE_TRENDS_RSS',
                                   'AVAILABLE' if google.get('state') == 'AVAILABLE' else 'UNAVAILABLE', now,
                                   titles=[row.get('keyword') for row in google.get('items', [])[:200]
                                           if isinstance(row, dict)], secret=self._youtube_api_key)
        google['retrieved_at'] = observed_at if google['state'] == 'AVAILABLE' else None

        def load_youtube():
            value = providers.collect_youtube(now, enabled=self._youtube_enabled, api_key=self._youtube_api_key)
            return json.dumps(value, ensure_ascii=False).encode('utf-8')

        youtube = json.loads(proxy._cached(self._youtube_cache_key, proxy.TRENDS_SECONDS, load_youtube))
        results = [google, youtube, providers.naver_trends(now)]
        keywords = safe_trend_keywords([row['keyword'] for result in results for row in result['items']])
        return {'schema_version': 1, 'providers': results, 'fallback': not bool(keywords),
                'safe_keywords': keywords or fallback_keywords(now),
                'safe_keyword': get_safe_trend_keyword(keywords, now=now)}
