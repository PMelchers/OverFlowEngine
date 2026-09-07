from urllib.parse import urlencode

# Both Google Maps and Apple Maps support building a working directions URL
# with no API key - this is a real, unsimulated feature (unlike the AI blocks).

_GOOGLE_MODES = {"driving", "walking", "bicycling", "transit"}
_APPLE_FLAGS = {"driving": "d", "walking": "w", "transit": "r", "bicycling": "d"}


def build_maps_url(
    provider: str, origin: str, destination: str, mode: str, waypoints: list[str] | None = None
) -> str:
    provider = (provider or "google").strip().lower()
    origin = origin.strip()
    destination = destination.strip()
    mode = mode if mode in _GOOGLE_MODES else "driving"
    stops = [w.strip() for w in (waypoints or []) if w.strip()]

    if provider == "apple":
        # Apple Maps' web URL scheme has no dedicated waypoints param - chaining
        # "to:" segments onto daddr is the documented workaround for multi-stop routes.
        daddr = "+to:".join([*stops, destination]) if stops else destination
        params = {"daddr": daddr, "dirflg": _APPLE_FLAGS.get(mode, "d")}
        if origin:
            params["saddr"] = origin
        return "https://maps.apple.com/?" + urlencode(params)

    params = {"api": "1", "destination": destination, "travelmode": mode}
    if origin:
        params["origin"] = origin
    if stops:
        params["waypoints"] = "|".join(stops)
    return "https://www.google.com/maps/dir/?" + urlencode(params)
