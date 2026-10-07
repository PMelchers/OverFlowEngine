"""Live fuel cost for the Trip Cost block's transport line, when the trip is made by the
travelers' own car: the real driving route, priced with current fuel prices in each
country it passes through, by simulating where the car would actually fill up.

Sources (all free, no API key):
- Route: OSRM's public demo server (router.project-osrm.org), with the origin, route
  stops and destination geocoded through Nominatim (see geo.py). Ferry crossings are
  recognised from OSRM's step mode and burn no fuel.
- Country of every ~10 km route point: a local lookup against Natural Earth borders
  (geo.country_code).
- Prices, best first:
  1. France / Spain / UK: median of the actual stations within STATION_RADIUS_KM of the
     route - government open data (FR, ES) and the UK retailers' open price feeds
     published under the CMA's fuel-price transparency scheme (Asda, Motor Fuel Group).
  2. Every other EU country: the national average from the European Commission's Weekly
     Oil Bulletin (updated weekly).
  3. A country with neither (e.g. Switzerland, Norway): the median price of the other
     countries on the route, flagged as such in the note.
- Currency: prices are handled in EUR internally (UK prices converted from GBP) and
  converted to the target currency with ECB reference rates from Frankfurter.

The fill-up simulation (simulate_fill_ups) leaves home with a full tank, and every time
the tank drops below REFUEL_FROM (half) it fills up again at the cheapest point it can
still reach before hitting the RESERVE - so a cheap country just ahead is waited for,
an expensive one is skipped where the range allows. Fuel left on return is deducted at
the home price, so the total is what the trip's fuel actually cost.

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
from dataclasses import dataclass
from datetime import date, timedelta

import httpx

from .geo import BordersUnavailable, country_code, geocode, haversine_km

_TIMEOUT = 20.0
_BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"

OSRM_BASE = "https://router.project-osrm.org/route/v1/driving"
OIL_BULLETIN_PAGE = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en"
FRANCE_API = (
    "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
    "prix-des-carburants-en-france-flux-instantane-v2/records"
)
SPAIN_API = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/"
# UK retailers that publish open price feeds and don't block server requests (Tesco and
# Sainsbury's feeds answer 403). Same JSON shape for both, prices in pence per litre.
UK_FEEDS = [
    "https://storelocator.asda.com/fuel_prices_data.json",
    "https://fuel.motorfuelgroup.com/fuel_prices_data.json",
]
FX_API = "https://api.frankfurter.dev/v1/latest"

# Distance between route points: each one gets a country (and so a price) and is a
# possible fill-up spot.
SAMPLE_KM = 10
# Station prices are looked up around at most this many of a country's route points
# (evenly spread), in parallel - plenty for a median, and keeps long stretches fast.
MAX_STATION_POINTS = 6
# Stations further than this from a route point don't count as "on the route".
STATION_RADIUS_KM = 5
# Fewer stations than this near the route -> use the national average instead.
MIN_STATIONS = 3
# Used when the block doesn't set them - a typical loaded family car.
DEFAULT_CONSUMPTION = {"petrol": 7.0, "diesel": 6.0, "lpg": 9.0}
DEFAULT_TANK_LITERS = 50.0
# Fill-up window, as a fraction of the tank: from when it's half empty until the reserve.
REFUEL_FROM = 0.5
RESERVE = 0.15

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
_UK_FIELDS = {"petrol": ["E10", "E5"], "diesel": ["B7"], "lpg": []}

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


@dataclass
class RoutePoint:
    lat: float
    lon: float
    km: float  # driving km from the start of the round trip (ferry crossings don't count)
    country: str = "??"


def _osrm_route(points: list[tuple[float, float]]) -> tuple[float, float, list[RoutePoint]]:
    """(driving km, ferry km, points every ~SAMPLE_KM of driving) for a route through
    `points`. Ferry steps are skipped: they add no driving km and get no points, so the
    car neither burns nor buys fuel on board."""
    coords = ";".join(f"{lon},{lat}" for lat, lon in points)
    body = _get(
        f"{OSRM_BASE}/{coords}", params={"overview": "false", "steps": "true", "geometries": "geojson"}
    ).json()
    if body.get("code") != "Ok" or not body.get("routes"):
        raise FuelPriceError(f"no driving route found ({body.get('message') or body.get('code')})")

    driven = ferry_km = 0.0
    next_emit = 0.0
    out: list[RoutePoint] = []
    last: tuple[float, float] | None = None
    for leg in body["routes"][0]["legs"]:
        for step in leg["steps"]:
            path = [(lat, lon) for lon, lat in step["geometry"]["coordinates"]]
            step_km = step["distance"] / 1000
            if step.get("mode") == "ferry":
                ferry_km += step_km
                continue
            if len(path) < 2:
                continue
            # Scale the straight-line segment lengths to OSRM's own road distance for the step.
            seg_lengths = [haversine_km(*a, *b) for a, b in zip(path, path[1:])]
            geo_km = sum(seg_lengths)
            scale = step_km / geo_km if geo_km else 0
            for (a, b), seg in zip(zip(path, path[1:]), seg_lengths):
                seg *= scale
                while seg and driven + seg >= next_emit:
                    frac = (next_emit - driven) / seg
                    out.append(RoutePoint(a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, next_emit))
                    next_emit += SAMPLE_KM
                driven += seg
            last = path[-1]
    if last and (not out or out[-1].km < driven):
        out.append(RoutePoint(last[0], last[1], driven))
    if len(out) < 2:
        raise FuelPriceError("the route is too short to price")
    return driven, ferry_km, out


def _assign_countries(points: list[RoutePoint]) -> None:
    try:
        codes = [country_code(p.lat, p.lon) for p in points]
    except BordersUnavailable as exc:
        raise FuelPriceError(str(exc)) from exc
    # A point just outside every border (coastal road, bridge, ferry terminal) takes its
    # neighbour's country - the previous one, or the next one at the very start.
    known = next((c for c in codes if c), None)
    if known is None:
        raise FuelPriceError("could not tell which countries the route goes through")
    for p, code in zip(points, codes):
        known = code or known
        p.country = known


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


def _fetch_uk_stations() -> list[dict]:
    stations: list[dict] = []
    for url in UK_FEEDS:
        try:
            stations += _get(url, headers={"User-Agent": _BROWSER_UA}).json().get("stations") or []
        except (FuelPriceError, ValueError):
            continue  # one retailer down still leaves the other
    return stations


def _uk_stations(lat: float, lon: float, fuel: str) -> list[float]:
    stations = _cached("uk_stations", 3600, _fetch_uk_stations)
    gbp_per_eur = _eur_to("GBP")
    for field in _UK_FIELDS[fuel]:
        prices = []
        for s in stations:
            loc, price = s.get("location") or {}, (s.get("prices") or {}).get(field)
            try:
                s_lat, s_lon, pence = float(loc["latitude"]), float(loc["longitude"]), float(price)
            except (KeyError, TypeError, ValueError):
                continue
            if abs(s_lat - lat) < 0.1 and abs(s_lon - lon) < 0.15 and haversine_km(lat, lon, s_lat, s_lon) <= STATION_RADIUS_KM:
                prices.append(pence / 100 / gbp_per_eur)
        if prices:
            return prices
    return []


_STATION_SOURCES = {"fr": _france_stations, "es": _spain_stations, "gb": _uk_stations}


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


# --- fill-up simulation ---------------------------------------------------------------


def simulate_fill_ups(
    points: list[RoutePoint], price_eur: dict[str, float], tank: float, consumption: float
) -> tuple[float, list[dict], float]:
    """(fuel cost in EUR, fill-up stops, litres left at the end).

    Leaves with a full tank bought at the first point's price. Whenever the tank has
    dropped below REFUEL_FROM, it fills up at the cheapest point reachable before the
    RESERVE (the latest one on a tie, so it buys as much as possible at that price) -
    filling to full, or just enough to get home on the reserve near the end. The fuel
    left on arrival is deducted at the home price."""
    per_km = consumption / 100
    reserve = tank * RESERVE
    end_km = points[-1].km
    home_price = price_eur[points[0].country]

    fuel = tank
    cost = tank * home_price
    stops: list[dict] = []
    i = 0
    while fuel - reserve < (end_km - points[i].km) * per_km:
        candidates = []
        last_reachable = None
        for j in range(i + 1, len(points)):
            fuel_at = fuel - (points[j].km - points[i].km) * per_km
            if fuel_at < reserve:
                break
            last_reachable = j
            if fuel_at <= tank * REFUEL_FROM:
                candidates.append(j)
        if not candidates:
            if last_reachable is None:
                raise FuelPriceError(
                    f"a {tank:g} L tank at {consumption:g} L/100km can't cover {SAMPLE_KM} km above the reserve"
                )
            candidates = [last_reachable]
        best = min(candidates, key=lambda j: (round(price_eur[points[j].country], 3), -j))
        fuel -= (points[best].km - points[i].km) * per_km
        to_finish = (end_km - points[best].km) * per_km + reserve
        buy = max(0.0, min(tank - fuel, to_finish - fuel))
        price = price_eur[points[best].country]
        cost += buy * price
        fuel += buy
        stops.append(
            {"km": round(points[best].km), "country": points[best].country.upper(), "liters": round(buy, 1), "priceEur": price}
        )
        i = best

    left = fuel - (end_km - points[i].km) * per_km
    cost -= left * home_price
    return cost, stops, left


# --- main entry point ----------------------------------------------------------------


def estimate_fuel_cost(
    origin: str,
    stops: list[str],
    destination: str,
    fuel_type: str,
    consumption_l_per_100km: float | None,
    tank_liters: float | None,
    currency: str,
) -> dict:
    """Returns one Trip Cost item ({name, category, estimated_cost, currency, note, live,
    fuelStops, ferryKm}) for the round trip's fuel, or raises FuelPriceError."""
    fuel = parse_fuel_type(fuel_type)
    consumption = consumption_l_per_100km or DEFAULT_CONSUMPTION[fuel]
    if not 1 <= consumption <= 40:
        raise FuelPriceError(f"a consumption of {consumption:g} L/100km doesn't look right")
    tank = tank_liters or DEFAULT_TANK_LITERS
    if not 10 <= tank <= 200:
        raise FuelPriceError(f"a {tank:g} L fuel tank doesn't look right")

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

    out_km, out_ferry, out_points = _osrm_route([start, *via, end])
    if via:
        back_km, back_ferry, back_points = _osrm_route([end, start])
    else:
        # Same road back - mirror the outbound points instead of asking OSRM again.
        back_km, back_ferry = out_km, out_ferry
        back_points = [RoutePoint(p.lat, p.lon, out_km - p.km) for p in reversed(out_points)]
    points = out_points + [RoutePoint(p.lat, p.lon, out_km + p.km) for p in back_points[1:]]
    driving_km, ferry_km = out_km + back_km, out_ferry + back_ferry
    _assign_countries(points)

    km_by_country: dict[str, float] = {}
    for a, b in zip(points, points[1:]):
        km_by_country[b.country] = km_by_country.get(b.country, 0) + (b.km - a.km)
    countries = set(km_by_country) | {points[0].country}

    bulletin = None
    price_by_country: dict[str, tuple[float, str]] = {}
    for code in countries:
        station_source = _STATION_SOURCES.get(code)
        if station_source:
            country_points = [p for p in points if p.country == code]
            step = max(1, len(country_points) // MAX_STATION_POINTS)
            country_points = country_points[::step][:MAX_STATION_POINTS]
            try:
                with ThreadPoolExecutor(max_workers=MAX_STATION_POINTS) as pool:
                    found = [x for prices in pool.map(lambda p: station_source(p.lat, p.lon, fuel), country_points) for x in prices]
            except FuelPriceError:
                found = []
            if len(found) >= MIN_STATIONS:
                price_by_country[code] = (statistics.median(found), f"median of {len(found)} stations on the route")
                continue
        if code in EU_COUNTRIES:
            bulletin = bulletin or _oil_bulletin()
            price = bulletin["prices"].get(EU_COUNTRIES[code], {}).get(fuel)
            if price:
                as_of = f" {bulletin['as_of']:%d-%m-%Y}" if bulletin["as_of"] else ""
                price_by_country[code] = (price, f"EU Oil Bulletin{as_of}")

    if not price_by_country:
        raise FuelPriceError("no fuel prices available for any country on the route")
    fallback_price = statistics.median(p for p, _ in price_by_country.values())
    for code in countries:
        if code not in price_by_country:
            price_by_country[code] = (fallback_price, "no data - route median used")

    cost_eur, fill_ups, left = simulate_fill_ups(
        points, {code: p for code, (p, _) in price_by_country.items()}, tank, consumption
    )
    fx = _eur_to(currency)
    for stop in fill_ups:
        stop["pricePerLiter"] = round(stop.pop("priceEur") * fx, 3)
        stop["cost"] = round(stop["liters"] * stop["pricePerLiter"], 2)

    home = points[0].country.upper()
    per_country_stops: dict[str, int] = {}
    for stop in fill_ups:
        per_country_stops[stop["country"]] = per_country_stops.get(stop["country"], 0) + 1
    stops_summary = ", ".join(f"{n}x {c}" for c, n in sorted(per_country_stops.items(), key=lambda kv: -kv[1]))
    price_parts = "; ".join(
        f"{code.upper()} {km_by_country.get(code, 0):.0f} km, {price_by_country[code][0] * fx:.2f}/L ({price_by_country[code][1]})"
        for code in sorted(km_by_country, key=lambda c: -km_by_country[c])
    )
    fill_up_note = (
        f"{len(fill_ups)} fill-up(s): {stops_summary} - each at the cheapest point in reach once the tank is half empty"
        if fill_ups
        else "no fill-ups needed"
    )
    via_note = f" via {len(via)} stop(s)" if via else ""
    ferry_note = f" plus {ferry_km:.0f} km by ferry (no fuel used, tickets not included)" if ferry_km >= 1 else ""
    skipped_note = f" Stops not found on the map, left out of the route: {', '.join(skipped_stops)}." if skipped_stops else ""
    note = (
        f"Live fuel prices, simulated fill-ups: {driving_km:.0f} km driving ({out_km:.0f} there{via_note}, "
        f"{back_km:.0f} back){ferry_note}, {consumption:g} L/100km {fuel}, {tank:g} L tank. Leaves {home} "
        f"with a full tank; {fill_up_note}. {left:.0f} L left on return, deducted at the {home} price. {currency} per litre: {price_parts}. Tolls not included.{skipped_note}"
    )
    return {
        "name": f"Fuel ({fuel}) for the round trip {origin} - {destination}",
        "category": "transport",
        "estimated_cost": round(cost_eur * fx, 2),
        "currency": currency,
        "note": note,
        "live": True,
        "fuelStops": fill_ups,
        "ferryKm": round(ferry_km),
    }
