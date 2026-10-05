"""Shared OpenStreetMap helpers for the live price lookups: geocoding, reverse geocoding
to a country, and great-circle distance.

Nominatim's usage policy allows at most one request per second from an identifying user
agent, so every call here goes through one process-wide throttle, and results are cached
in memory (until restart) so repeat runs of the same flow don't hit it again.
"""

import math
import threading
import time

import httpx

NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
_NOMINATIM_UA = "OverFlowEngine/0.1 (workflow builder, live travel price lookup)"
_TIMEOUT = 15.0
_MIN_INTERVAL = 1.05

_throttle_lock = threading.Lock()
_last_call = 0.0

_geocode_cache: dict[str, tuple[float, float] | None] = {}
_country_cache: dict[tuple[float, float], str | None] = {}


def _nominatim(path: str, params: dict) -> dict | list | None:
    global _last_call
    with _throttle_lock:
        wait = _MIN_INTERVAL - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        try:
            resp = httpx.get(
                f"{NOMINATIM_BASE}/{path}",
                params={**params, "format": "json"},
                headers={"User-Agent": _NOMINATIM_UA},
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError):
            return None
        finally:
            _last_call = time.monotonic()


def geocode(query: str) -> tuple[float, float] | None:
    """(lat, lon) of the best match for a free-text place, or None if unknown/unreachable."""
    key = query.strip().lower()
    if key not in _geocode_cache:
        results = _nominatim("search", {"q": query, "limit": 1})
        _geocode_cache[key] = (float(results[0]["lat"]), float(results[0]["lon"])) if results else None
    return _geocode_cache[key]


def country_code(lat: float, lon: float) -> str | None:
    """Lowercase ISO country code ("nl", "fr", ...) at a point, or None (sea, unreachable)."""
    # ~1 km grid - plenty for "which country is this", and lets nearby samples share a lookup.
    key = (round(lat, 2), round(lon, 2))
    if key not in _country_cache:
        result = _nominatim("reverse", {"lat": lat, "lon": lon, "zoom": 3})
        code = ((result or {}).get("address") or {}).get("country_code") if isinstance(result, dict) else None
        _country_cache[key] = code.lower() if code else None
    return _country_cache[key]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = rlat2 - rlat1, math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))
