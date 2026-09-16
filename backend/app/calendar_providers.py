"""Google Calendar + Microsoft (Outlook) Calendar integration via OAuth2.

Real, unsimulated - fetches, creates, and deletes events on the user's actual
calendar. There is no shared, server-wide OAuth app: every user registers their
own OAuth app with Google/Microsoft (see RUNNING.md) and pastes their own client
id/secret into Settings before connecting - so every function here that talks to
the provider takes those credentials as arguments rather than reading them from
the environment.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")

# "offline" + "consent" force Google to hand back a refresh_token every time -
# without them it only does so on the very first authorization ever granted.
GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar openid email"
MICROSOFT_SCOPE = "offline_access Calendars.ReadWrite User.Read"

PROVIDERS = ("google", "microsoft")


def redirect_uri(provider: str) -> str:
    """Fixed regardless of which user is connecting - this is the URI every user
    must register as an "Authorized redirect URI" on their own OAuth app."""
    return f"{BACKEND_BASE_URL}/calendar/{provider}/callback"


def authorization_url(provider: str, client_id: str, state: str) -> str:
    if provider == "google":
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri(provider),
            "response_type": "code",
            "scope": GOOGLE_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    if provider == "microsoft":
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri(provider),
            "response_type": "code",
            "scope": MICROSOFT_SCOPE,
            "response_mode": "query",
            "state": state,
        }
        return "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" + urlencode(params)
    raise ValueError(f"Unknown provider: {provider}")


def _token_request(provider: str, data: dict) -> dict:
    url = (
        "https://oauth2.googleapis.com/token"
        if provider == "google"
        else "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    )
    resp = httpx.post(url, data=data, timeout=15)
    resp.raise_for_status()
    return resp.json()


def exchange_code(provider: str, client_id: str, client_secret: str, code: str) -> dict:
    """Returns {access_token, refresh_token, expires_in, ...}."""
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri(provider),
        "grant_type": "authorization_code",
    }
    if provider == "microsoft":
        data["scope"] = MICROSOFT_SCOPE
    elif provider != "google":
        raise ValueError(f"Unknown provider: {provider}")
    return _token_request(provider, data)


def refresh_access_token(provider: str, client_id: str, client_secret: str, refresh_token: str) -> dict:
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    if provider == "microsoft":
        data["scope"] = MICROSOFT_SCOPE
    elif provider != "google":
        raise ValueError(f"Unknown provider: {provider}")
    return _token_request(provider, data)


def fetch_account_email(provider: str, access_token: str) -> str | None:
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        if provider == "google":
            resp = httpx.get("https://www.googleapis.com/oauth2/v2/userinfo", headers=headers, timeout=10)
            resp.raise_for_status()
            return resp.json().get("email")
        if provider == "microsoft":
            resp = httpx.get("https://graph.microsoft.com/v1.0/me", headers=headers, timeout=10)
            resp.raise_for_status()
            body = resp.json()
            return body.get("mail") or body.get("userPrincipalName")
    except httpx.HTTPError:
        return None
    return None


def get_valid_access_token(db, connection) -> str:
    """Returns a usable access token, transparently refreshing (and persisting
    the refresh) if the stored one has expired or is about to. Uses the
    connection's own client_id/client_secret - each user's own OAuth app."""
    now = datetime.now(timezone.utc)
    if connection.expires_at is not None and connection.expires_at > now + timedelta(seconds=60):
        return connection.access_token
    tokens = refresh_access_token(
        connection.provider, connection.client_id, connection.client_secret, connection.refresh_token
    )
    connection.access_token = tokens["access_token"]
    if tokens.get("refresh_token"):
        # Google doesn't always send a new one back - keep the old one when it doesn't.
        connection.refresh_token = tokens["refresh_token"]
    connection.expires_at = now + timedelta(seconds=tokens.get("expires_in", 3600))
    db.commit()
    return connection.access_token


def list_events(provider: str, access_token: str, time_min: str, time_max: str) -> list[dict[str, Any]]:
    headers = {"Authorization": f"Bearer {access_token}"}
    if provider == "google":
        resp = httpx.get(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers=headers,
            params={"timeMin": time_min, "timeMax": time_max, "singleEvents": "true", "orderBy": "startTime"},
            timeout=15,
        )
        resp.raise_for_status()
        return [
            {
                "id": e["id"],
                "title": e.get("summary", "(no title)"),
                "start": (e.get("start") or {}).get("dateTime") or (e.get("start") or {}).get("date"),
                "end": (e.get("end") or {}).get("dateTime") or (e.get("end") or {}).get("date"),
            }
            for e in resp.json().get("items", [])
        ]
    if provider == "microsoft":
        headers["Prefer"] = 'outlook.timezone="UTC"'
        resp = httpx.get(
            "https://graph.microsoft.com/v1.0/me/calendarview",
            headers=headers,
            params={"startDateTime": time_min, "endDateTime": time_max, "$orderby": "start/dateTime"},
            timeout=15,
        )
        resp.raise_for_status()
        return [
            {
                "id": e["id"],
                "title": e.get("subject", "(no title)"),
                "start": (e.get("start") or {}).get("dateTime"),
                "end": (e.get("end") or {}).get("dateTime"),
            }
            for e in resp.json().get("value", [])
        ]
    raise ValueError(f"Unknown provider: {provider}")


def create_event(provider: str, access_token: str, title: str, start: str, end: str, description: str = "") -> str:
    headers = {"Authorization": f"Bearer {access_token}"}
    if provider == "google":
        resp = httpx.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers=headers,
            json={"summary": title, "description": description, "start": {"dateTime": start}, "end": {"dateTime": end}},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()["id"]
    if provider == "microsoft":
        resp = httpx.post(
            "https://graph.microsoft.com/v1.0/me/events",
            headers=headers,
            json={
                "subject": title,
                "body": {"contentType": "text", "content": description},
                "start": {"dateTime": start, "timeZone": "UTC"},
                "end": {"dateTime": end, "timeZone": "UTC"},
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()["id"]
    raise ValueError(f"Unknown provider: {provider}")


def delete_event(provider: str, access_token: str, event_id: str) -> None:
    headers = {"Authorization": f"Bearer {access_token}"}
    if provider == "google":
        url = f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}"
    elif provider == "microsoft":
        url = f"https://graph.microsoft.com/v1.0/me/events/{event_id}"
    else:
        raise ValueError(f"Unknown provider: {provider}")
    resp = httpx.delete(url, headers=headers, timeout=15)
    if resp.status_code not in (200, 202, 204):
        resp.raise_for_status()
