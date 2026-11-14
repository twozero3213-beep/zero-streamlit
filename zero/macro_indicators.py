"""Filter observed research-desk data without inventing a replacement series."""

# Compatibility export; verified observations belong to the dated research desk.
VERIFIED_MACRO_ITEMS = []


def get_macro_indicators(search=None, country="ALL", category="ALL", *, items=None):
    """Return the supplied observations and their original status, dates and sources."""
    rows = [item for item in (items or []) if isinstance(item, dict)]
    if country and country != "ALL":
        rows = [item for item in rows if item.get("country") == country]
    if category and category != "ALL":
        rows = [item for item in rows if item.get("category") == category]
    if search:
        query = search.strip().casefold()
        rows = [item for item in rows if any(query in str(item.get(key, "")).casefold()
                                            for key in ("name", "id", "explanation"))]
    return rows
