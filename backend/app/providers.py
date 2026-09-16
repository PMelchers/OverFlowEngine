import anthropic
import httpx

_TIMEOUT = 6.0
_CALL_TIMEOUT = 30.0


class ModelCallError(Exception):
    """Raised whenever a real provider call can't be completed - bad key,
    rate limit, network error, unrecognized provider. Carries a message
    that's safe to show back in a workflow run's step log."""

# Which models a credential can offer, scoped to the platform its key was
# recognized as belonging to - keeps the AI Model block from suggesting a
# model the linked key can't actually call.
PROVIDER_MODELS: dict[str, list[str]] = {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini"],
    "anthropic": ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"],
    "google": ["gemini-2.5-pro", "gemini-2.5-flash"],
    "test": ["test-model"],
}


def detect_provider(api_key: str) -> str:
    """Recognizes which platform a key is from by its own format, so the
    user never has to tell us which provider they're linking."""
    key = api_key.strip()
    if key.lower().startswith("test"):
        return "test"
    if key.startswith("sk-ant-"):
        return "anthropic"
    if key.startswith("sk-"):
        return "openai"
    # Classic Google API key format. Google has since started issuing Gemini API
    # keys under a second format too (seen starting "AQ.") - recognize both rather
    # than only the original one.
    if key.startswith("AIza") or key.startswith("AQ."):
        return "google"
    return "other"


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


def call_model(provider: str, api_key: str, model: str, system_prompt: str | None, user_message: str) -> str:
    """Sends one message to the given provider/model and returns the reply text.

    Raises ModelCallError with a step-log-safe message on any failure - bad
    key, rate limit, network error, or an unrecognized provider.
    """
    provider = provider.strip().lower()
    try:
        if provider == "test":
            # No real provider to call - mirrors the shape of a real reply so
            # the rest of the workflow (AI Output, downstream blocks) can be
            # exercised without a real API key.
            return f'[test reply from {model}] responding to: "{user_message}"'

        if provider == "anthropic":
            client = anthropic.Anthropic(api_key=api_key, timeout=_CALL_TIMEOUT)
            response = client.messages.create(
                model=model,
                max_tokens=1024,
                system=system_prompt or anthropic.NOT_GIVEN,
                messages=[{"role": "user", "content": user_message}],
            )
            text = "".join(block.text for block in response.content if block.type == "text")
            if not text:
                raise ModelCallError(f"{provider} returned no text content")
            return text

        if provider == "openai":
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": user_message})
            resp = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": model, "messages": messages},
                timeout=_CALL_TIMEOUT,
            )
            if resp.status_code != 200:
                raise ModelCallError(f"{provider} rejected the request: {_short_error(resp)}")
            body = resp.json()
            text = body["choices"][0]["message"]["content"]
            if not text:
                raise ModelCallError(f"{provider} returned no text content")
            return text

        if provider == "google":
            contents = [{"role": "user", "parts": [{"text": user_message}]}]
            payload: dict = {"contents": contents}
            if system_prompt:
                payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
            resp = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                params={"key": api_key},
                json=payload,
                timeout=_CALL_TIMEOUT,
            )
            if resp.status_code != 200:
                raise ModelCallError(f"{provider} rejected the request: {_short_error(resp)}")
            body = resp.json()
            try:
                text = "".join(part.get("text", "") for part in body["candidates"][0]["content"]["parts"])
            except (KeyError, IndexError):
                text = ""
            if not text:
                raise ModelCallError(f"{provider} returned no text content")
            return text

        raise ModelCallError(f"unknown provider '{provider}'")

    except ModelCallError:
        raise
    except anthropic.APIStatusError as exc:
        raise ModelCallError(f"{provider} rejected the request: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise ModelCallError(f"could not reach {provider}: {exc}") from exc
    except httpx.HTTPError as exc:
        raise ModelCallError(f"could not reach {provider}: {exc}") from exc


def _short_error(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        detail = body.get("error", {}).get("message") or body.get("error")
        if detail:
            return str(detail)
    except ValueError:
        pass
    return f"HTTP {resp.status_code}"
