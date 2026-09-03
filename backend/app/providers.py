import httpx

_TIMEOUT = 6.0


def verify_api_key(provider: str, api_key: str) -> bool | None:
    """Checks a key against its provider with a lightweight, read-only call.

    Returns True if the provider confirmed the key works, False if the
    provider explicitly rejected it (bad key), or None if it couldn't be
    checked at all (unknown provider, network error, provider outage).
    """
    provider = provider.strip().lower()
    if provider == "test":
        # No real provider to call - lets you try the unlock flow without a
        # real API key. Any non-empty value "verifies".
        return bool(api_key.strip())
    try:
        if provider == "openai":
            resp = httpx.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=_TIMEOUT,
            )
        elif provider == "anthropic":
            resp = httpx.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                timeout=_TIMEOUT,
            )
        elif provider == "google":
            resp = httpx.get(
                "https://generativelanguage.googleapis.com/v1/models",
                params={"key": api_key},
                timeout=_TIMEOUT,
            )
        else:
            return None
    except httpx.HTTPError:
        return None

    if resp.status_code == 200:
        return True
    if resp.status_code in (401, 403):
        return False
    return None
