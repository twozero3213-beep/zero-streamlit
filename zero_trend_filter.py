"""Public chatter keywords only; never account inputs or news/article moderation."""
from datetime import datetime
import random
import re
import unicodedata
from zoneinfo import ZoneInfo

BANNED_PATTERNS = re.compile(
    r"(사망|살인|폭행|참사|사고|구속|체포|마약|성폭행|성추행|성폭력|도박|카지노|토토|"
    r"탄핵|대선|총선|여당|야당|시위|파업|전쟁|테러|자살|논란|폭로|혐오|욕설|"
    r"성인|음란|포르노|야동|강간|학대|재난|지진|태풍|홍수|침수|산불|화재|붕괴|"
    r"국민의힘|더불어민주당|민주당|조국혁신당|개혁신당|정의당|진보당|기본소득당|"
    r"사회민주당|녹색당|새누리당|국민의당|자유한국당|공화당|노동당|민생당|자유통일당|정당|정치|선거|대통령|국회|성범죄|실종|혐의|피해|혈당|당뇨|암환자|"
    r"씨발|시발|씨팔|ㅅㅂ|ㅆㅂ|ㅂㅅ|ㅈㄹ|ㄲㅈ|썅|새끼|꺼져|개새끼|개년|개놈|병신|지랄|좆|엿먹|"
    r"(?<![A-Za-z0-9])(?:war|death|murder|arrest|porn|casino|betting|suicide|terror|fuck|shit|sex|av)(?![A-Za-z0-9]))", re.I
)
SAFE_FALLBACK_KEYWORDS = [
    "미국 기준금리", "분기 배당주", "실적 발표", "오늘 점심 메뉴",
    "원·달러 환율", "아이스 아메리카노", "인공지능 반도체", "주말 날씨"
]
KST = ZoneInfo('Asia/Seoul')


def clean_trend_keyword(value: str) -> str | None:
    if not isinstance(value, str) or len(value) > 200:
        return None
    normalized = unicodedata.normalize('NFKC', value).strip()
    if BANNED_PATTERNS.search(value) or BANNED_PATTERNS.search(normalized) or BANNED_PATTERNS.search(re.sub(r'[\W_]+', '', normalized)) or BANNED_PATTERNS.search(re.sub(r'[\W_]+', '', value)):
        return None
    if any(unicodedata.category(char).startswith('C') for char in normalized):
        return None
    cleaned = re.sub(r' +', ' ', normalized)
    if not 2 <= len(cleaned) <= 15:
        return None
    if any(not (char.isalnum() or char in ' ·&.+-') for char in cleaned):
        return None
    # Hangul jamo/compatibility initials and punctuation alone do not form a keyword.
    letters = [char for char in cleaned if char.isalpha() and not ('\u1100' <= char <= '\u11ff' or '\u3130' <= char <= '\u318f' or '\ua960' <= char <= '\ua97f' or '\ud7b0' <= char <= '\ud7ff')]
    return cleaned if letters else None


def safe_trend_keywords(raw_keywords: list[str]) -> list[str]:
    if not isinstance(raw_keywords, (list, tuple)):
        return []
    safe, seen = [], set()
    for value in raw_keywords[:200]:
        cleaned = clean_trend_keyword(value)
        key = cleaned.casefold() if cleaned else None
        if cleaned and key not in seen:
            safe.append(cleaned)
            seen.add(key)
    return safe


def fallback_keywords(now: datetime | None = None) -> list[str]:
    now = now or datetime.now(KST)
    local = now.replace(tzinfo=KST) if now.tzinfo is None else now.astimezone(KST)
    pool = [word for word in SAFE_FALLBACK_KEYWORDS if word not in {'오늘 점심 메뉴', '아이스 아메리카노', '주말 날씨'}]
    if 11 <= local.hour < 14:
        pool.extend(['오늘 점심 메뉴', '점심 산책'])
    elif 6 <= local.hour < 11:
        pool.append('아이스 아메리카노' if 5 <= local.month <= 9 else '따뜻한 모닝커피')
    elif local.hour >= 22 or local.hour < 6:
        pool.extend(['편안한 휴식', '따뜻한 차'])
    else:
        pool.append('산책 날씨' if local.month in (3, 4, 5, 9, 10, 11) else '주말 날씨')
    if local.month in (12, 1, 2):
        pool.append('따뜻한 겨울 차')
    return pool


def get_safe_trend_keyword(raw_keywords: list[str], *, now: datetime | None = None) -> str:
    return random.choice(safe_trend_keywords(raw_keywords) or fallback_keywords(now))
