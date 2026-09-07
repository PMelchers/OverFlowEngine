from urllib.parse import urlencode

# Both Google Maps and Apple Maps support building a working directions URL
# with no API key - this is a real, unsimulated feature (unlike the AI blocks).

_GOOGLE_MODES = {"driving", "walking", "bicycling", "transit"}
_APPLE_FLAGS = {"driving": "d", "walking": "w", "transit": "r", "bicycling": "d"}


def build_maps_url(provider: str, origin: str, destination: str, mode: str) -> str:
    provider = (provider or "google").strip().lower()
    origin = origin.strip()
    destination = destination.strip()
    mode = mode if mode in _GOOGLE_MODES else "driving"

    if provider == "apple":
        params = {"daddr": destination, "dirflg": _APPLE_FLAGS.get(mode, "d")}
        if origin:
            params["saddr"] = origin
        return "https://maps.apple.com/?" + urlencode(params)

    params = {"api": "1", "destination": destination, "travelmode": mode}
    if origin:
        params["origin"] = origin
    return "https://www.google.com/maps/dir/?" + urlencode(params)
