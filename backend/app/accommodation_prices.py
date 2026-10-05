"""Live accommodation prices for the Trip Cost block, from real booking sites instead of
an AI's web-search guess.

Prices come from Xotelo (data.xotelo.com), a free, keyless API that returns the rates
Booking.com, Agoda, Trip.com etc. are currently showing for a TripAdvisor-listed hotel.
Xotelo only takes TripAdvisor location keys ("g188590" = Amsterdam), and its own
name -> key search is RapidAPI-only, so the key is looked up through DuckDuckGo's
no-JS HTML search (TripAdvisor's own typeahead sits behind a bot captcha). A search hit
can be the wrong place ("Gent" -> a hotel named Gent somewhere else), so every key is
checked against an OpenStreetMap geocode of the destination before it's trusted.

Everything here is unofficial-but-public, so anything can break without notice - every
failure raises AccommodationPriceError with a step-log-safe reason, and the caller falls
back to the AI estimate.
"""

import math
import re
import statistics
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import httpx

from .geo import geocode, haversine_km

XOTELO_BASE = "https://data.xotelo.com/api"
_TIMEOUT = 15.0
# DuckDuckGo serves an empty/blocked page to non-browser user agents.
_BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"

# How many hotels get their rates fetched - each one is a separate Xotelo call, so this
# trades a steadier median against how long the Trip Cost block takes to run.
HOTELS_TO_PRICE = 8
# A location key whose hotels are mostly further than this from the geocoded destination
# is treated as a wrong search match. Generous, since a "destination" can be a whole region.
MAX_LOCATION_DISTANCE_KM = 100
# Xotelo rates are per room per night - assume rooms are shared by this many people.
TRAVELERS_PER_ROOM = 2

_LOCATION_KEY_RE = re.compile(r"Hotels-(g\d+)-")

# destination (lowercased) -> location key. In-process only, so it resets on restart -
# it exists to keep repeat runs of the same flow off DuckDuckGo/Nominatim.
_location_cache: dict[str, str] = {}


class AccommodationPriceError(Exception):
    """Raised whenever live prices can't be produced. Carries a message that's safe to
    show in a workflow run's step log."""


def _get_json(url: str, params: dict, headers: dict | None = None) -> dict | list:
    try:
        resp = httpx.get(url, params=params, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise AccommodationPriceError(f"price source unreachable ({type(exc).__name__})") from exc


def _xotelo(endpoint: str, params: dict) -> dict:
    body = _get_json(f"{XOTELO_BASE}/{endpoint}", params)
    if not isinstance(body, dict):
        raise AccommodationPriceError("price source returned an unexpected response")
    if body.get("error"):
        message = (body["error"] or {}).get("message") or "unknown error"
        raise AccommodationPriceError(f"price source error: {message}")
    return body.get("result") or {}


def _search_location_keys(destination: str) -> list[str]:
    try:
        resp = httpx.get(
            "https://html.duckduckgo.com/html/",
            params={"q": f"tripadvisor hotels {destination}"},
            headers={"User-Agent": _BROWSER_UA},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise AccommodationPriceError(f"location search unreachable ({type(exc).__name__})") from exc
    # Unique, in result order - the first hit is usually right, the rest are candidates
    # for when it isn't.
    return list(dict.fromkeys(_LOCATION_KEY_RE.findall(resp.text)))[:3]


def _location_matches(location_key: str, coords: tuple[float, float]) -> bool:
    hotels = _xotelo("list", {"location_key": location_key, "limit": 5}).get("list") or []
    distances = [
        haversine_km(coords[0], coords[1], h["geo"]["latitude"], h["geo"]["longitude"])
        for h in hotels
        if (h.get("geo") or {}).get("latitude") is not None
    ]
    return bool(distances) and statistics.median(distances) <= MAX_LOCATION_DISTANCE_KM


def find_location_key(destination: str) -> str:
    cache_key = destination.strip().lower()
    if cache_key in _location_cache:
        return _location_cache[cache_key]

    candidates = _search_location_keys(destination)
    if not candidates:
        raise AccommodationPriceError(f'could not find "{destination}" on TripAdvisor')

    coords = geocode(destination)
    if coords is None:
        # Not trusting an unverified hit: a made-up or misspelled destination still gets
        # *some* search result, and pricing hotels on the wrong continent is worse than
        # falling back to the AI estimate.
        raise AccommodationPriceError(f'could not locate "{destination}" on the map to verify the hotel listing')
    chosen = next((key for key in candidates if _location_matches(key, coords)), None)
    if chosen is None:
        raise AccommodationPriceError(f'no TripAdvisor hotel listing found near "{destination}"')

    _location_cache[cache_key] = chosen
    return chosen


def _wanted_types(stay_type: str) -> set[str]:
    """Maps the block's free-text stay type onto Xotelo's accommodation_type values.
    Empty means "don't filter". Xotelo only lists hotel-like places - no holiday rentals."""
    s = stay_type.lower()
    if "hostel" in s:
        return {"Hostel"}
    if "b&b" in s or "bed" in s or "guest" in s or "inn" in s:
        return {"B&B", "Inn", "Bed and Breakfast", "Guest house", "Small Hotel"}
    if "hotel" in s:
        return {"Hotel", "Small Hotel"}
    return set()


def _cheapest_rate(hotel: dict, params: dict) -> dict | None:
    try:
        result = _xotelo("rates", {"hotel_key": hotel["key"], **params})
    except AccommodationPriceError:
        return None
    rates = [r for r in (result.get("rates") or []) if isinstance(r.get("rate"), (int, float)) and r["rate"] > 0]
    if not rates:
        return None
    best = min(rates, key=lambda r: r["rate"])
    return {"hotel": hotel["name"], "site": best.get("name") or best.get("code"), "rate": float(best["rate"])}


def fetch_accommodation_price(
    destination: str,
    stay_type: str,
    check_in: date,
    check_out: date,
    adults: int,
    children: int,
    currency: str,
) -> dict:
    """Returns one Trip Cost item ({name, category, estimated_cost, currency, note, live})
    priced from live booking-site rates, or raises AccommodationPriceError."""
    nights = (check_out - check_in).days
    if nights <= 0:
        raise AccommodationPriceError("check-out must be after check-in")

    location_key = find_location_key(destination)
    wanted = _wanted_types(stay_type)
    # Most listings are plain hotels, so filtering on a rarer type (hostel, B&B) needs a
    # bigger pool to find more than one or two of them.
    list_limit = 100 if wanted and wanted != {"Hotel", "Small Hotel"} else 30
    hotels = _xotelo("list", {"location_key": location_key, "limit": list_limit, "sort": "best_value"}).get("list") or []
    matching = [h for h in hotels if h.get("accommodation_type") in wanted] if wanted else hotels
    type_note = ""
    if wanted and not matching:
        # Better a hotel price than none at all - but say so.
        matching = hotels
        type_note = f' No "{stay_type}" listings found, so hotel prices were used.'
    if not matching:
        raise AccommodationPriceError(f'no accommodation listed for "{destination}"')

    travelers = max(adults + children, 1)
    rooms = math.ceil(travelers / TRAVELERS_PER_ROOM)
    # Xotelo's children parameter returned no rates at all when tried, so children are
    # only counted towards the number of rooms, not sent along.
    params = {
        "chk_in": check_in.isoformat(),
        "chk_out": check_out.isoformat(),
        "adults": min(max(adults, 1), TRAVELERS_PER_ROOM),
        "currency": currency,
    }
    with ThreadPoolExecutor(max_workers=HOTELS_TO_PRICE) as pool:
        offers = [o for o in pool.map(lambda h: _cheapest_rate(h, params), matching[:HOTELS_TO_PRICE]) if o]
    if not offers:
        raise AccommodationPriceError(f"no hotel in {destination} had rates for {params['chk_in']} - {params['chk_out']}")

    per_night = statistics.median(o["rate"] for o in offers)
    total = round(per_night * nights * rooms, 2)
    cheapest = min(offers, key=lambda o: o["rate"])
    priciest = max(offers, key=lambda o: o["rate"])
    sites = sorted({o["site"] for o in offers if o["site"]})
    note = (
        f"Live prices from {', '.join(sites)}: median of the cheapest offer at {len(offers)} "
        f"place(s) = {per_night:g} {currency}/night/room, x {nights} night(s) x {rooms} room(s). "
        f'Range {cheapest["rate"]:g} ("{cheapest["hotel"]}") to {priciest["rate"]:g} '
        f'("{priciest["hotel"]}") per night.{type_note}'
    )
    return {
        "name": f"{nights} night(s) of {stay_type or 'accommodation'} in {destination}",
        "category": "accommodation",
        "estimated_cost": total,
        "currency": currency,
        "note": note,
        "live": True,
    }
