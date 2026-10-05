"""Shared geo helpers for the live price lookups: geocoding, which country a point is in,
and great-circle distance.

Geocoding goes through Nominatim, whose usage policy allows at most one request per
second from an identifying user agent - every call here goes through one process-wide
throttle, and results are cached in memory (until restart).

Country lookups are done locally instead, against Natural Earth's 1:50m country borders
(downloaded once, then kept on disk under backend/.cache/). A route needs hundreds of
lookups (one per ~10 km), which would take minutes through Nominatim's 1/second limit.
"""

import json
import math
import threading
import time
from pathlib import Path

import httpx

NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
_NOMINATIM_UA = "OverFlowEngine/0.1 (workflow builder, live travel price lookup)"
_TIMEOUT = 15.0
_MIN_INTERVAL = 1.05

BORDERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
_CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"
_BORDERS_FILE = _CACHE_DIR / "ne_50m_admin_0_countries.geojson"

_throttle_lock = threading.Lock()
_last_call = 0.0

_geocode_cache: dict[str, tuple[float, float] | None] = {}

_borders_lock = threading.Lock()
# [(iso code, (min_lon, min_lat, max_lon, max_lat), [polygon, ...])] where a polygon is a
# list of rings (first = outer boundary, rest = holes), each ring a list of (lon, lat).
_borders: list[tuple[str, tuple[float, float, float, float], list[list[list[tuple[float, float]]]]]] | None = None


class BordersUnavailable(Exception):
    """The country borders file couldn't be downloaded or read."""


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


def _load_borders():
    global _borders
    with _borders_lock:
        if _borders is not None:
            return _borders
        if not _BORDERS_FILE.exists():
            try:
                resp = httpx.get(BORDERS_URL, timeout=60, follow_redirects=True)
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise BordersUnavailable(f"country borders download failed ({type(exc).__name__})") from exc
            _CACHE_DIR.mkdir(exist_ok=True)
            _BORDERS_FILE.write_bytes(resp.content)
        try:
            features = json.loads(_BORDERS_FILE.read_text(encoding="utf-8"))["features"]
        except (ValueError, KeyError) as exc:
            _BORDERS_FILE.unlink(missing_ok=True)  # corrupt download - fetch again next time
            raise BordersUnavailable("country borders file is unreadable") from exc

        loaded = []
        for feature in features:
            props = feature.get("properties") or {}
            # ISO_A2 is "-99" for a few countries (France, Norway, ...) for political
            # reasons - ISO_A2_EH ("EH" = "except headquarters") always has the real code.
            code = str(props.get("ISO_A2_EH") or props.get("ISO_A2") or "").lower()
            geometry = feature.get("geometry") or {}
            if len(code) != 2 or geometry.get("type") not in ("Polygon", "MultiPolygon"):
                continue
            polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
            polygons = [[[(float(x), float(y)) for x, y, *_ in ring] for ring in polygon] for polygon in polygons]
            xs = [x for polygon in polygons for x, _ in polygon[0]]
            ys = [y for polygon in polygons for _, y in polygon[0]]
            loaded.append((code, (min(xs), min(ys), max(xs), max(ys)), polygons))
        _borders = loaded
        return _borders


def _in_ring(lon: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def country_code(lat: float, lon: float) -> str | None:
    """Lowercase ISO country code ("nl", "fr", ...) at a point, or None when the point is
    outside every border at this resolution (sea, or a coastal road/bridge right on the
    edge - callers should carry the neighbouring point's country over). Raises
    BordersUnavailable if the borders file can't be loaded."""
    for code, (min_x, min_y, max_x, max_y), polygons in _load_borders():
        if not (min_x <= lon <= max_x and min_y <= lat <= max_y):
            continue
        for polygon in polygons:
            if _in_ring(lon, lat, polygon[0]) and not any(_in_ring(lon, lat, hole) for hole in polygon[1:]):
                return code
    return None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = rlat2 - rlat1, math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))
