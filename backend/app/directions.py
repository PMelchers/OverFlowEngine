"""Turn-by-turn route directions for the Trip Summary block, shown inside the app instead
of only handing the traveler off to a Google/Apple Maps link.

Sources (all free, no API key - same family fuel_prices.py already relies on):
- Places: origin, route stops and destination geocoded through Nominatim (geo.geocode,
  which owns the 1 req/s throttle and the cache).
- Route + maneuvers: OSRM. Cars use the public demo server (router.project-osrm.org,
  the one fuel_prices.py uses); that server only has a car profile, so bike and walking
  routes go to FOSSGIS' OSRM instances on routing.openstreetmap.de.

OSRM returns maneuvers (type + modifier + road name), not sentences, so _instruction()
writes the English text the app shows. Every failure raises DirectionsError with a
step-log-safe reason; the executor still shows the rest of the trip summary without it.
"""

import httpx

from .geo import far_from_road, geocode

_TIMEOUT = 20.0
_MAX_STOPS = 8
# The route line is only drawn as a small SVG preview, so a few hundred points is plenty -
# a cross-Europe drive at full resolution is tens of thousands, all stored in the run row.
_MAX_GEOMETRY_POINTS = 300

_OSRM_BASES = {
    "driving": "https://router.project-osrm.org/route/v1/driving",
    "cycling": "https://routing.openstreetmap.de/routed-bike/route/v1/driving",
    "walking": "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
}

_MODIFIER_TEXT = {
    "slight left": "slightly left",
    "slight right": "slightly right",
    "sharp left": "sharply left",
    "sharp right": "sharply right",
}

_COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]


class DirectionsError(Exception):
    """Directions couldn't be built; the message is safe to show in the step log."""


def travel_profile(transport_mode: str) -> str | None:
    """Maps the trip's free-text transport ("own car", "fiets", "train"...) to an OSRM
    profile, or None when there's no road route to describe (train, plane, bus...).
    Blank means driving - the Trip Summary block's default when no transport is wired in.
    Unlike fuel_prices.is_own_car, a rental car still counts: it drives the same roads."""
    mode = (transport_mode or "").strip().lower()
    if not mode:
        return "driving"
    if any(w in mode for w in ("walk", "foot", "hike", "hiking", "lopen", "wandel")):
        return "walking"
    if any(w in mode for w in ("bike", "bicycle", "cycl", "fiets")):
        return "cycling"
    if any(w in mode for w in ("car", "auto", "drive", "driving", "camper", "motor", "rent", "huur", "hire")):
        return "driving"
    return None


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _instruction(step: dict, arrival: str) -> str:
    """English sentence for one OSRM step; `arrival` names the stop this leg ends at."""
    maneuver = step.get("maneuver") or {}
    kind = maneuver.get("type", "")
    modifier = maneuver.get("modifier", "")
    direction = _MODIFIER_TEXT.get(modifier, modifier)
    road = step.get("name") or step.get("ref") or ""
    onto = f" onto {road}" if road else ""
    towards = f" towards {step['destinations']}" if step.get("destinations") else ""
    # Ramps and exits only need the side ("on the right"), not "on the slight right".
    side = "left" if "left" in modifier else "right" if "right" in modifier else ""
    on_side = f" on the {side}" if side else ""

    if step.get("mode") == "ferry":
        return f"Take the ferry{f' ({road})' if road else ''}"
    if kind == "depart":
        bearing = maneuver.get("bearing_after")
        heading = _COMPASS[round(bearing / 45) % 8] if isinstance(bearing, (int, float)) else ""
        on_road = f" on {road}" if road else ""
        return f"Head {heading}{on_road}" if heading else f"Start{on_road}"
    if kind == "arrive":
        side_note = f", on your {modifier}" if modifier in ("left", "right") else ""
        return f"Arrive at {arrival}{side_note}"
    if kind in ("roundabout", "rotary"):
        exit_no = maneuver.get("exit")
        exit_part = f"take the {_ordinal(exit_no)} exit" if exit_no else "go round"
        return f"At the roundabout, {exit_part}{onto}"
    if kind == "roundabout turn":
        return f"At the roundabout, turn {direction}{onto}"
    if modifier == "uturn":
        return f"Make a U-turn{onto}"
    if kind in ("turn", "end of road"):
        return f"Continue straight{onto}" if modifier == "straight" else f"Turn {direction}{onto}"
    if kind == "fork":
        return f"Keep {direction} at the fork{onto}{towards}"
    if kind == "merge":
        return f"Merge{f' {direction}' if direction else ''}{onto}"
    if kind == "on ramp":
        return f"Take the ramp{on_side}{onto}{towards}"
    if kind == "off ramp":
        return f"Take the exit{on_side}{onto}{towards}"
    # "new name", "continue", "notification" and anything newer OSRM may add.
    if direction and direction != "straight" and kind == "continue":
        return f"Keep {direction}{onto}"
    return f"Continue{onto}"


def _downsample(coords: list[list[float]]) -> list[list[float]]:
    if len(coords) <= _MAX_GEOMETRY_POINTS:
        picked = coords
    else:
        stride = (len(coords) - 1) / (_MAX_GEOMETRY_POINTS - 1)
        picked = [coords[round(i * stride)] for i in range(_MAX_GEOMETRY_POINTS)]
    # GeoJSON is [lon, lat]; everything else in the app is (lat, lon).
    return [[round(lat, 5), round(lon, 5)] for lon, lat in picked]


def build_directions(origin: str, stops: list[str], destination: str, profile: str) -> dict:
    """One-way route origin -> stops -> destination with per-leg turn-by-turn steps:
    {mode, distanceKm, durationMin, legs: [{from, to, distanceKm, durationMin, steps:
    [{instruction, distanceM}]}], points: [{name, lat, lon, kind}], geometry: [[lat, lon]],
    skippedStops}. Raises DirectionsError."""
    if profile not in _OSRM_BASES:
        raise DirectionsError(f'unknown travel mode "{profile}"')
    start = geocode(origin)
    if start is None:
        raise DirectionsError(f'could not find the starting point "{origin}" on the map')
    end = geocode(destination)
    if end is None:
        raise DirectionsError(f'could not find the destination "{destination}" on the map')
    # Same rule as fuel_prices: a stop the geocoder can't place is left out (and named in
    # the result) rather than throwing away the whole route over one vague AI suggestion.
    via: list[tuple[str, tuple[float, float]]] = []
    skipped: list[str] = []
    for stop in stops[:_MAX_STOPS]:
        point = geocode(stop)
        if point:
            via.append((stop, point))
        else:
            skipped.append(stop)

    named = [(origin, start, "start"), *[(n, p, "stop") for n, p in via], (destination, end, "end")]
    coords = ";".join(f"{lon},{lat}" for _, (lat, lon), _ in named)
    try:
        resp = httpx.get(
            f"{_OSRM_BASES[profile]}/{coords}",
            params={"steps": "true", "overview": "full", "geometries": "geojson"},
            timeout=_TIMEOUT,
        )
        body = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise DirectionsError(f"the routing service is unreachable ({type(exc).__name__})") from exc
    if body.get("code") != "Ok" or not body.get("routes"):
        reason = body.get("message") or body.get("code") or f"HTTP {resp.status_code}"
        raise DirectionsError(f"no {profile} route found ({reason})")
    misplaced = far_from_road(body, [n for n, _, _ in named])
    if misplaced:
        raise DirectionsError(misplaced)

    route = body["routes"][0]
    legs = []
    for i, leg in enumerate(route.get("legs", [])):
        steps: list[dict] = []
        arrival = named[i + 1][0]
        for step in leg.get("steps", []):
            text = _instruction(step, arrival)
            # OSRM emits a "new name" step every time a road's name changes; folding
            # identical consecutive lines keeps a long drive readable without losing distance.
            if steps and steps[-1]["instruction"] == text:
                steps[-1]["distanceM"] += round(step.get("distance", 0))
                continue
            entry = {"instruction": text, "distanceM": round(step.get("distance", 0))}
            if (step.get("maneuver") or {}).get("type") == "arrive":
                # Lets the app mark the moment a stop (or the destination) is reached.
                entry["arrival"] = arrival
            steps.append(entry)
        legs.append(
            {
                "from": named[i][0],
                "to": arrival,
                "distanceKm": round(leg.get("distance", 0) / 1000, 1),
                "durationMin": round(leg.get("duration", 0) / 60),
                "steps": steps,
            }
        )

    return {
        "mode": profile,
        "distanceKm": round(route.get("distance", 0) / 1000, 1),
        "durationMin": round(route.get("duration", 0) / 60),
        "legs": legs,
        "points": [{"name": n, "lat": lat, "lon": lon, "kind": k} for n, (lat, lon), k in named],
        "geometry": _downsample(route.get("geometry", {}).get("coordinates", [])),
        "skippedStops": skipped,
    }
