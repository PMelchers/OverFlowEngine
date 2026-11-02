"""Websites a run must not take information from - the "Websites to exclude" field on the
Trip Cost and Suggest Activities blocks, usually filled from the Vacation Planner form.

The field is free text a person types ("Booking.com, https://www.tripadvisor.com/Hotels"),
so everything that uses it goes through parse_excluded_sites() first: providers.py passes
the result to the AI (a hard search filter where the provider supports one, an instruction
otherwise) and accommodation_prices.py drops rates from those sites.
"""

import re

# A bare hostname: dot-separated labels ending in an alphabetic TLD. Deliberately strict -
# these go straight into an AI provider's search filter, which rejects the whole request
# on anything that isn't a valid domain.
_HOST_RE = re.compile(r"^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.-]*://")


def parse_excluded_sites(raw: str) -> tuple[list[str], list[str]]:
    """Turns the field's free text into bare hostnames, plus the entries that weren't a
    website at all so the step log can say what was ignored.

    "Booking.com, https://www.tripadvisor.com/Hotels; pinterest" ->
    (["booking.com", "tripadvisor.com"], ["pinterest"]). Entries can be separated by
    commas, semicolons, "|" (the separator other trip fields use) or whitespace. A scheme,
    "www.", a path and a port are dropped - this excludes whole websites, not pages."""
    domains: list[str] = []
    ignored: list[str] = []
    for token in re.split(r"[\s,;|]+", raw or ""):
        if not token:
            continue
        host = _SCHEME_RE.sub("", token.lower())
        host = re.split(r"[/?#:]", host, maxsplit=1)[0].strip(".")
        host = host.removeprefix("www.")
        if _HOST_RE.match(host):
            if host not in domains:
                domains.append(host)
        else:
            ignored.append(token)
    return domains, ignored


def is_excluded(source: str | None, domains: list[str]) -> bool:
    """Whether a source belongs to one of the excluded domains. A source is either a
    hostname ("m.booking.com" counts as booking.com) or a name the way a price feed reports
    a booking site - "Booking.com", or a hotel chain's own site with no domain at all, like
    "ibis" or the code "Accor". Those bare names are compared against each domain's main
    label ("accor" for accor.com), with and without the TLD ("bookingcom")."""
    name = (source or "").strip().lower().removeprefix("www.")
    if not name or not domains:
        return False
    if "." in name:
        return any(name == d or name.endswith("." + d) for d in domains)
    brand = re.sub(r"[^a-z0-9]", "", name)
    for d in domains:
        main_label = max(d.split(".")[:-1], key=len)
        if brand in (main_label, re.sub(r"[^a-z0-9]", "", d)):
            return True
    return False
