"""Live fuel cost for the Trip Cost block's transport line, when the trip is made by the
travelers' own car: the real driving route, split per country, priced with current fuel
prices in each country it passes through.

Sources (all free, no API key):
- Route: OSRM's public demo server (router.project-osrm.org), with the origin, route
  stops and destination geocoded through Nominatim (see geo.py).
- Countries along the route: Nominatim reverse geocoding of points sampled along it.
- Prices, best first:
  1. France / Spain: median of the actual stations within STATION_RADIUS_KM of the route,
     from each government's open fuel-price data (updated many times a day).
  2. Every other EU country: the national average from the European Commission's Weekly
     Oil Bulletin (updated weekly).
  3. A country with neither (e.g. Switzerland, Norway, UK): the median price of the
     other countries on the route, flagged as such in the note.
- Currency: everything above is in EUR; other target currencies are converted with
  ECB reference rates from Frankfurter (api.frankfurter.dev).

Every failure raises FuelPriceError with a step-log-safe reason, and the caller falls
back to the AI estimate - same contract as accommodation_prices.py.
"""

import io
import re
import statistics
import threading
import time
import xml.etree.ElementTree as ET
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import httpx

from .geo import country_code, geocode, haversine_km

_TIMEOUT = 20.0
_BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"

OSRM_BASE = "https://router.project-osrm.org/route/v1/driving"
OIL_BULLETIN_PAGE = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en"
FRANCE_API = (
    "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
    "prix-des-carburants-en-france-flux-instantane-v2/records"
)
SPAIN_API = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/"
FX_API = "https://api.frankfurter.dev/v1/latest"

# The route is cut into chunks of about this length, and each chunk's country is looked
# up at its midpoint. Nominatim allows 1 request/second, so the chunk length grows on long
# routes to keep the lookup count (and the block's run time) bounded.
SAMPLE_KM = 75
MAX_SAMPLES = 20
# Station prices are looked up around at most this many of a country's route samples
# (evenly spread), in parallel - plenty for a median, and keeps long French stretches fast.
MAX_STATION_POINTS = 6
# Stations further than this from a route sample don't count as "on the route".
STATION_RADIUS_KM = 5
# Fewer stations than this near the route -> use the national average instead.
MIN_STATIONS = 3
# Used when the block doesn't set a consumption - a typical loaded family car.
DEFAULT_CONSUMPTION = {"petrol": 7.0, "diesel": 6.0, "lpg": 9.0}

# ISO code -> country name as written in the Oil Bulletin's first column.
EU_COUNTRIES = {
    "at": "Austria", "be": "Belgium", "bg": "Bulgaria", "hr": "Croatia", "cy": "Cyprus",
    "cz": "Czechia", "dk": "Denmark", "ee": "Estonia", "fi": "Finland", "fr": "France",
    "de": "Germany", "gr": "Greece", "hu": "Hungary", "ie": "Ireland", "it": "Italy",
    "lv": "Latvia", "lt": "Lithuania", "lu": "Luxembourg", "mt": "Malta", "nl": "Netherlands",
    "pl": "Poland", "pt": "Portugal", "ro": "Romania", "sk": "Slovakia", "si": "Slovenia",
    "es": "Spain", "se": "Sweden",
}
# Oil Bulletin column per fuel type (B = Euro-super 95, C = automotive gas oil, G = LPG).
_BULLETIN_COLUMNS = {"petrol": "B", "diesel": "C", "lpg": "G"}
# Station price fields per fuel type, in order of preference (E10 is what most petrol
# cars fill up with and what most stations sell, so it goes first).
_FRANCE_FIELDS = {"petrol": ["e10_prix", "sp95_prix"], "diesel": ["gazole_prix"], "lpg": ["gplc_prix"]}
_SPAIN_FIELDS = {
    "petrol": ["Precio Gasolina 95 E10", "Precio Gasolina 95 E5"],
    "diesel": ["Precio Gasoleo A"],
    "lpg": ["Precio Gases licuados del petróleo"],
}

_cache_lock = threading.Lock()
# name -> (fetched_at, value). In-process only.
_cache: dict[str, tuple[float, object]] = {}


class FuelPriceError(Exception):
    """Raised whenever a live fuel cost can't be produced. Carries a message that's safe
    to show in a workflow run's step log."""


def _cached(name: str, max_age_s: float, fetch):
    with _cache_lock:
        hit = _cache.get(name)
        if hit and time.monotonic() - hit[0] < max_age_s:
            return hit[1]
    value = fetch()
    with _cache_lock:
        _cache[name] = (time.monotonic(), value)
    return value


def _get(url: str, **kwargs) -> httpx.Response:
    try:
        resp = httpx.get(url, timeout=kwargs.pop("timeout", _TIMEOUT), follow_redirects=True, **kwargs)
        resp.raise_for_status()
        return resp
    except httpx.HTTPError as exc:
        raise FuelPriceError(f"{url.split('/')[2]} unreachable ({type(exc).__name__})") from exc


def is_own_car(transport_mode: str) -> bool:
    """True for "car", "own car", "auto", "camper"... - but not a rental, whose price is
    mostly the rental fee (left to the AI estimate)."""
    mode = transport_mode.lower()
    if any(word in mode for word in ("rent", "huur", "hire")):
        return False
    return any(word in mode for word in ("car", "auto", "drive", "driving", "camper", "motor"))


def parse_fuel_type(raw: str) -> str:
    value = (raw or "").strip().lower()
    if "electric" in value or "elektrisch" in value or re.search(r"\bev\b", value):
        raise FuelPriceError("electric cars aren't supported yet - only petrol, diesel and LPG")
    if "diesel" in value:
        return "diesel"
    if "lpg" in value or "autogas" in value:
        return "lpg"
    return "petrol"


# --- route -------------------------------------------------------------------------


def _osrm_route(points: list[tuple[float, float]]) -> tuple[float, list[tuple[float, float]]]:
    """(distance in km, [(lat, lon), ...] along the road) for a route through `points`."""
    coords = ";".join(f"{lon},{lat}" for lat, lon in points)
    body = _get(f"{OSRM_BASE}/{coords}", params={"overview": "full", "geometries": "geojson"}).json()
    if body.get("code") != "Ok" or not body.get("routes"):
        raise FuelPriceError(f"no driving route found ({body.get('message') or body.get('code')})")
    route = body["routes"][0]
    return route["distance"] / 1000, [(lat, lon) for lon, lat in route["geometry"]["coordinates"]]


def _chunk_midpoints(path: list[tuple[float, float]], total_km: float) -> tuple[list[tuple[float, float]], float]:
    """Cuts the path into equal chunks; returns each chunk's midpoint and the chunk length."""
    chunk_km = max(SAMPLE_KM, total_km / MAX_SAMPLES)
    n_chunks = max(1, round(total_km / chunk_km))
    chunk_km = total_km / n_chunks
    targets = [(i + 0.5) * chunk_km for i in range(n_chunks)]

    midpoints: list[tuple[float, float]] = []
    walked = 0.0
    t = 0
    for (lat1, lon1), (lat2, lon2) in zip(path, path[1:]):
        seg = haversine_km(lat1, lon1, lat2, lon2)
        while t < len(targets) and walked + seg >= targets[t]:
            frac = (targets[t] - walked) / seg if seg else 0
            midpoints.append((lat1 + (lat2 - lat1) * frac, lon1 + (lon2 - lon1) * frac))
            t += 1
        walked += seg
    # Haversine along the polyline is a little shorter than OSRM's road distance, so the
    # last target(s) can fall just past the end - pin them to the destination.
    while len(midpoints) < n_chunks:
        midpoints.append(path[-1])
    return midpoints, chunk_km


# --- prices --------------------------------------------------------------------------


def _bulletin_xlsx_url() -> str:
    page = _get(OIL_BULLETIN_PAGE, headers={"User-Agent": _BROWSER_UA}).text
    match = re.search(r'href="([^"]+?with%20Taxes[^"]*?\.xlsx)"', page, re.IGNORECASE)
    if not match:
        raise FuelPriceError("could not find the current EU Oil Bulletin on its page")
    href = match.group(1).replace("&amp;", "&")
    return href if href.startswith("http") else "https://energy.ec.europa.eu" + href


def _read_xlsx_sheet(raw: bytes) -> dict[str, str]:
    """Minimal .xlsx reader (stdlib only): {"A3": "Austria", "B3": "1956", ...} for sheet 1."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t")) for si in root.findall("m:si", ns)]
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    cells: dict[str, str] = {}
    for c in sheet.iter(f"{{{ns['m']}}}c"):
        v = c.find("m:v", ns)
        if v is None or v.text is None:
            continue
        cells[c.get("r")] = shared[int(v.text)] if c.get("t") == "s" else v.text
    return cells


def _fetch_oil_bulletin() -> dict:
    cells = _read_xlsx_sheet(_get(_bulletin_xlsx_url(), headers={"User-Agent": _BROWSER_UA}).content)
    prices: dict[str, dict[str, float]] = {}
    row = 3
    while f"A{row}" in cells:
        name = cells[f"A{row}"].strip()
        per_fuel = {}
        for fuel, col in _BULLETIN_COLUMNS.items():
            try:
                per_fuel[fuel] = float(cells[f"{col}{row}"]) / 1000  # sheet is EUR per 1000 L
            except (KeyError, ValueError):
                pass
        prices[name] = per_fuel
        row += 1
    if not prices:
        raise FuelPriceError("the EU Oil Bulletin had no prices in the expected format")
    as_of = None
    try:
        as_of = date(1899, 12, 30) + timedelta(days=int(float(cells["A2"])))  # Excel serial date
    except (KeyError, ValueError):
        pass
    return {"prices": prices, "as_of": as_of}


def _oil_bulletin() -> dict:
    return _cached("oil_bulletin", 12 * 3600, _fetch_oil_bulletin)


def _france_stations(lat: float, lon: float, fuel: str) -> list[float]:
    prices: list[float] = []
    for field in _FRANCE_FIELDS[fuel]:
        body = _get(
            FRANCE_API,
            params={
                "select": field,
                "where": f"within_distance(geom, geom'POINT({lon} {lat})', {STATION_RADIUS_KM}km) and {field} is not null",
                "limit": 50,
            },
        ).json()
        prices = [float(r[field]) for r in body.get("results", []) if r.get(field)]
        if prices:
            break
    return prices


def _fetch_spain_stations() -> list[dict]:
    # The whole country in one ~12 MB response (no per-area endpoint) - hence the cache.
    body = _get(SPAIN_API, headers={"Accept": "application/json"}, timeout=60).json()
    return body.get("ListaEESSPrecio") or []


def _spain_stations(lat: float, lon: float, fuel: str) -> list[float]:
    stations = _cached("spain_stations", 3600, _fetch_spain_stations)
    for field in _SPAIN_FIELDS[fuel]:
        prices = []
        for s in stations:
            try:
                s_lat = float(s["Latitud"].replace(",", "."))
                s_lon = float(s["Longitud (WGS84)"].replace(",", "."))
                price = float((s.get(field) or "").replace(",", "."))
            except (KeyError, ValueError):
                continue
            if abs(s_lat - lat) < 0.1 and abs(s_lon - lon) < 0.15 and haversine_km(lat, lon, s_lat, s_lon) <= STATION_RADIUS_KM:
                prices.append(price)
        if prices:
            return prices
    return []


_STATION_SOURCES = {"fr": _france_stations, "es": _spain_stations}


def _eur_to(currency: str) -> float:
    if currency == "EUR":
        return 1.0

    def fetch() -> float:
        body = _get(FX_API, params={"base": "EUR", "symbols": currency}).json()
        rate = (body.get("rates") or {}).get(currency)
        if not rate:
            raise FuelPriceError(f"no exchange rate available for {currency}")
        return float(rate)

    return _cached(f"fx_{currency}", 12 * 3600, fetch)


# --- main entry point ----------------------------------------------------------------


def estimate_fuel_cost(
    origin: str,
    stops: list[str],
    destination: str,
    fuel_type: str,
    consumption_l_per_100km: float | None,
    currency: str,
) -> dict:
    """Returns one Trip Cost item ({name, category, estimated_cost, currency, note, live})
    for the round trip's fuel, or raises FuelPriceError."""
    fuel = parse_fuel_type(fuel_type)
    consumption = consumption_l_per_100km or DEFAULT_CONSUMPTION[fuel]
    if not 1 <= consumption <= 40:
        raise FuelPriceError(f"a consumption of {consumption:g} L/100km doesn't look right")

    start = geocode(origin)
    if start is None:
        raise FuelPriceError(f'could not find the origin "{origin}" on the map')
    end = geocode(destination)
    if end is None:
        raise FuelPriceError(f'could not find the destination "{destination}" on the map')
    # Stops that can't be found are skipped rather than failing the whole lookup - the
    # note says which ones, and the route is then just a bit shorter than planned.
    via, skipped_stops = [], []
    for stop in stops[:8]:
        point = geocode(stop)
        (via if point else skipped_stops).append(point or stop)

    outbound_km, path = _osrm_route([start, *via, end])
    return_km = _osrm_route([end, start])[0] if via else outbound_km
    total_km = outbound_km + return_km

    # Country split is measured on the outbound route and applied to the whole round
    # trip - the direct way back crosses the same borders in practice.
    midpoints, chunk_km = _chunk_midpoints(path, outbound_km)
    km_by_country: dict[str, float] = {}
    point_by_country: dict[str, list[tuple[float, float]]] = {}
    for lat, lon in midpoints:
        code = country_code(lat, lon) or "??"
        km_by_country[code] = km_by_country.get(code, 0) + chunk_km
        point_by_country.setdefault(code, []).append((lat, lon))

    bulletin = None
    price_by_country: dict[str, tuple[float, str]] = {}
    for code in km_by_country:
        station_source = _STATION_SOURCES.get(code)
        if station_source:
            points = point_by_country[code]
            step = max(1, len(points) // MAX_STATION_POINTS)
            points = points[::step][:MAX_STATION_POINTS]
            try:
                with ThreadPoolExecutor(max_workers=MAX_STATION_POINTS) as pool:
                    found = [p for prices in pool.map(lambda pt: station_source(pt[0], pt[1], fuel), points) for p in prices]
            except FuelPriceError:
                found = []
            if len(found) >= MIN_STATIONS:
                price_by_country[code] = (statistics.median(found), f"median of {len(found)} stations along the route")
                continue
        if code in EU_COUNTRIES:
            bulletin = bulletin or _oil_bulletin()
            price = bulletin["prices"].get(EU_COUNTRIES[code], {}).get(fuel)
            if price:
                as_of = f" {bulletin['as_of']:%d-%m-%Y}" if bulletin["as_of"] else ""
                price_by_country[code] = (price, f"EU Oil Bulletin national average{as_of}")

    if not price_by_country:
        raise FuelPriceError("no fuel prices available for any country on the route")
    fallback_price = statistics.median(p for p, _ in price_by_country.values())
    for code in km_by_country:
        if code not in price_by_country:
            price_by_country[code] = (fallback_price, "no data for this country - used the route's median price")

    fx = _eur_to(currency)
    share = total_km / outbound_km
    total_cost = 0.0
    parts = []
    for code, km in sorted(km_by_country.items(), key=lambda kv: -kv[1]):
        trip_km = km * share
        price = price_by_country[code][0] * fx
        total_cost += trip_km * consumption / 100 * price
        parts.append(f"{code.upper()} {trip_km:.0f} km at {price:.2f} {currency}/L ({price_by_country[code][1]})")

    via_note = f" via {len(via)} stop(s)" if via else ""
    skipped_note = f" Stops not found on the map, left out of the route: {', '.join(skipped_stops)}." if skipped_stops else ""
    note = (
        f"Live fuel prices: {total_km:.0f} km round trip ({outbound_km:.0f} km there{via_note}, "
        f"{return_km:.0f} km back) at {consumption:g} L/100km {fuel}, "
        f"{total_km * consumption / 100:.0f} L in total. {'; '.join(parts)}. Tolls not included.{skipped_note}"
    )
    return {
        "name": f"Fuel ({fuel}) for the round trip {origin} - {destination}",
        "category": "transport",
        "estimated_cost": round(total_cost, 2),
        "currency": currency,
        "note": note,
        "live": True,
    }
