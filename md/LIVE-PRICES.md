# Live prices

The **Trip Cost** block (`costEstimate`) prices two lines from real, current data instead of an AI's guess:

- **Accommodation:** the rates booking sites are currently showing (Booking.com, Agoda, Trip.com, Vio.com and hotels' own sites).
- **Fuel:** for trips made by the travelers' own car, a simulation of the real driving route that fills up where the tank runs low, at current prices in that country.

For both lines the AI web-search estimate is only a fallback. Route stops, destination activities, road tolls, ferry tickets and non-car transport are still priced by the AI.

| Code | What it does |
|---|---|
| [`backend/app/accommodation_prices.py`](../backend/app/accommodation_prices.py) | Accommodation lookup |
| [`backend/app/fuel_prices.py`](../backend/app/fuel_prices.py) | Fuel lookup |
| [`backend/app/geo.py`](../backend/app/geo.py) | Shared geo helpers (Nominatim geocoding, offline country lookup, distance) |
| `costEstimate` branch in [`backend/app/executor.py`](../backend/app/executor.py) | Calls both lookups and decides what the AI still has to price |

In the frontend, an item with `live: true` gets a green **LIVE** label in the cost summary card ([`CostSummaryCard.tsx`](../frontend/src/CostSummaryCard.tsx)).

---

## Accommodation

Here is what happens for one run, using the destination "Rotterdam", stay type "hotel", 4–6 December, 2 adults + 1 child, in EUR:

```
destination "Rotterdam"
   │
   ├─1─▶ DuckDuckGo HTML search "tripadvisor hotels Rotterdam"
   │       → candidate TripAdvisor location codes, e.g. g188632
   │
   ├─2─▶ Nominatim (OpenStreetMap) geocode "Rotterdam" → lat/lon
   │       for each candidate: Xotelo /list (5 hotels) → are they within 100 km?
   │       → first candidate that matches is used (and cached in memory)
   │
   ├─3─▶ Xotelo /list for that location (30 hotels, or 100 when filtering on a rarer type)
   │       → keep the ones matching the stay type (hotel / hostel / B&B)
   │
   ├─4─▶ Xotelo /rates for the first 8, in parallel
   │       → cheapest offer per hotel, per room per night
   │
   └─5─▶ median of those 8 × nights × rooms  = accommodation line in the breakdown
```

### 1. Finding the location code

Xotelo only accepts TripAdvisor location codes (`g188590` = Amsterdam). Neither of the obvious ways to get one works:
- Xotelo's own `/search` endpoint is only available through paid RapidAPI.
- TripAdvisor's typeahead blocks server requests with a DataDome captcha.

So we search DuckDuckGo's no-JavaScript HTML page for `tripadvisor hotels <destination>` and pull codes out of the result links (`Hotels-g188632-...`). Up to 3 unique codes are kept as candidates, in result order.

### 2. Verifying the location

A search always returns *something*, even for a misspelled or made-up place. Without a check, a made-up destination came out as hotels in Kuala Lumpur. To prevent that:
- The destination is geocoded with Nominatim.
- For each candidate code we fetch 5 hotels and take the median of their distances to that point.
- The first candidate within `MAX_LOCATION_DISTANCE_KM` (100 km) wins. The limit is generous because a destination can be a whole region.
- If Nominatim doesn't know the place, or no candidate is close enough, the lookup **fails** rather than guessing.

A verified destination → code mapping is cached in process memory (`_location_cache`), so repeat runs skip steps 1 and 2. The cache is cleared when the backend restarts.

### 3. Filtering on stay type

The block's free-text stay type is mapped onto Xotelo's `accommodation_type` values:

| Stay type contains | Xotelo types kept |
|---|---|
| `hostel` | Hostel |
| `b&b`, `bed`, `guest`, `inn` | B&B, Inn, Bed and Breakfast, Guest house, Small Hotel |
| `hotel` | Hotel, Small Hotel |
| anything else | no filter |

If nothing matches (for example, no B&Bs listed in Tromsø), hotel prices are used and the item note says so.

### 4. Fetching rates

For the first `HOTELS_TO_PRICE` (8) hotels, sorted by Xotelo's "best value", `/rates` is called in parallel with the check-in/check-out dates, adults (max 2 per room) and the target currency. Each hotel contributes its **cheapest** offer across all booking sites. Hotels without rates for those dates are skipped.

### 5. The total

```
total = median(cheapest rate per hotel) × nights × rooms
rooms = ceil((adults + children) / 2)
```

- Xotelo rates are **per room per night**. We verified this by comparing a 1-night and a 4-night query: the 4-night rate was a lower nightly average, not 4× higher.
- The median is used instead of the minimum so one unusually cheap or expensive place doesn't skew the total.
- Children only count towards the number of rooms. Sending Xotelo's children parameter returned no rates at all.

The resulting item looks like this:

```json
{
  "name": "2 night(s) of hotel in Rotterdam",
  "category": "accommodation",
  "estimated_cost": 356.0,
  "currency": "EUR",
  "note": "Live prices from Agoda.com, Trip.com, Vio.com: median of the cheapest offer at 8 place(s) = 89 EUR/night/room, x 2 night(s) x 2 room(s). Range 70 (\"Art Hotel Rotterdam\") to 158 (\"Hotel New York by Westcord\") per night.",
  "live": true
}
```

The accommodation lookup only runs when the block has a stay type, valid check-in/check-out dates (`YYYY-MM-DD`, check-out after check-in) and a resolved destination.

---

## Fuel

The fuel lookup only runs when **all** of these are true:
- The transport mode is the travelers' **own car**. `is_own_car()` matches `car`, `auto`, `drive`, `camper` or `motor`, but not anything containing `rent`, `huur` or `hire`, because a rental's cost is mostly the rental fee and stays with the AI.
- The origin is set.
- The destination is resolved.

Three optional block fields feed into it:

| Field | Default | Notes |
|---|---|---|
| Fuel type (`fuelType`) | petrol | `diesel`, `lpg`/`autogas`; electric raises an error (not supported yet) |
| Consumption (`fuelConsumption`) | petrol 7, diesel 6, LPG 9 L/100km | Accepts `5,8` or `5.8`; values outside 1–40 are rejected |
| Tank size (`tankSize`) | 50 L | Values outside 10–200 L are rejected |

### The idea

The lookup doesn't just multiply distance by an average price. It **simulates the trip**: where the car is when the tank runs low, and in which country it fills up. That matters on long routes, where prices between neighbouring countries can differ by 30–50 cents per litre. A sensible driver fills up in Poland rather than Germany, or waits until Sweden.

Here is what happens for one run, using Dublin → Helsinki via the route stops "Berlin" and "Riga", petrol, defaults:

```
origin, route stops, destination
   │
   ├─1─▶ Nominatim geocodes each place (stops it can't find are skipped and listed in the note)
   │
   ├─2─▶ OSRM driving route Dublin → Berlin → Riga → Helsinki, step by step
   │     OSRM direct route Helsinki → Dublin (only when there are stops; otherwise the way out is mirrored)
   │       → ferry steps (Dublin–Holyhead, Channel, Tallinn–Helsinki, ...) are set aside:
   │         419 km by ferry, no fuel used
   │       → a route point every 10 km of driving: 7245 km → ~725 points
   │
   ├─3─▶ each point's country, looked up locally against Natural Earth borders
   │
   ├─4─▶ price per litre for each country on the route (best source first):
   │       FR, ES, GB → median of real stations within 5 km of the route
   │       other EU countries → EU Weekly Oil Bulletin national average
   │       no data (CH, NO, ...) → median of the other countries on the route
   │
   └─5─▶ fill-up simulation along the points → cost, list of fuel stops, litres left
```

### 1–2. The route

Origin, stops and destination are geocoded with Nominatim. OSRM's public demo server then computes the actual driving route, with `steps=true`, so every step says whether it is driven or a **ferry**:
- **Ferry steps** add no driving km and get no route points. The car neither burns nor buys fuel on board. Their total distance is reported (`ferryKm`).
- **Driving steps** are resampled into a route point every `SAMPLE_KM` (10 km). The distances follow OSRM's own road distance per step, not straight lines.

The trip out goes through the block's route stops (up to 8) in order. The trip back is a separate direct route, which can legitimately be longer: OSRM may pick a different ferry or road. If there are no stops, the outbound points are mirrored instead, which saves an OSRM call.

### 3. Countries along the route

Each route point's country is looked up locally against [Natural Earth](https://www.naturalearthdata.com/)'s 1:50m country borders (`geo.country_code`):
- The ~3 MB GeoJSON is downloaded once and kept in `backend/.cache/` (gitignored).
- It loads in about half a second, and a lookup takes under a millisecond. Hundreds of points cost nothing, unlike Nominatim's 1 request/second.
- The `ISO_A2_EH` property is used because `ISO_A2` is `-99` for France and Norway.
- A point just outside every border at this resolution (coastal road, bridge, ferry terminal) takes the previous point's country.

### 4. Price per country

| Country | Source | Freshness |
|---|---|---|
| France | Government open data ([prix-carburants](https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/)): stations within `STATION_RADIUS_KM` (5 km) of up to 6 route points, queried in parallel | Updated continuously |
| Spain | Government open data ([Geoportal Gasolineras](https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/)): same radius. This source has no per-area endpoint, so the whole country (~12 MB) is downloaded once and cached for 1 hour | Updated several times a day |
| United Kingdom | Retailers' open price feeds under the CMA fuel-price transparency scheme: Asda (~800 stations) and Motor Fuel Group (~1200). Prices are in pence and converted from GBP; cached for 1 hour. Tesco and Sainsbury's feeds block server requests, so they aren't used | Daily |
| Other EU countries | [EU Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en), "prices with taxes", national average. The download link changes weekly, so it's scraped from the page and the file cached for 12 hours | Weekly |
| Non-EU without data (CH, NO, ...) | Median price of the other countries on the route, flagged in the note | n/a |

Details:
- France, Spain and the UK need at least `MIN_STATIONS` (3) stations near the route. Otherwise France and Spain fall back to their bulletin average, and the UK to the route median.
- The bulletin's `.xlsx` file is read with the standard library (`zipfile` + XML), so no `openpyxl` dependency is needed.
- Fuel type fields used:

| Fuel | France | Spain | UK | Bulletin column |
|---|---|---|---|---|
| petrol | `e10_prix`, then `sp95_prix` | `Gasolina 95 E10`, then `95 E5` | `E10`, then `E5` | Euro-super 95 |
| diesel | `gazole_prix` | `Gasoleo A` | `B7` | Automotive gas oil |
| lpg | `gplc_prix` | `Gases licuados del petróleo` | none | LPG |

Prices are handled in EUR internally. For any other target currency, they are converted with ECB reference rates from [Frankfurter](https://frankfurter.dev), cached for 12 hours.

### 5. Fill-up simulation

`simulate_fill_ups()` drives along the route points:

1. **Leave home with a full tank**, bought at the home country's price.
2. Once the tank is **below half** (`REFUEL_FROM`), the car may fill up. It must do so before the tank drops to the **reserve** (`RESERVE`, 15%). That stretch is the fill-up window: about 250 km with a 50 L tank at 7 L/100km.
3. Within that window the car fills up at the **cheapest point**. On a tie it picks the latest point, so it buys as much as possible at that price. A cheap country just ahead is therefore waited for, and an expensive one is driven through without stopping where the range allows.
4. It **fills to full**, except near the end of the trip, where it only buys enough to get home with the reserve left.
5. On arrival, the **fuel left in the tank is deducted** at the home price. The total is then what the trip's fuel actually cost, not what was in the tank.

```
cost = full tank × home price + Σ fill-ups (litres × local price) − litres left × home price
```

Note that a short trip may need no fill-ups at all. In that case it is simply the fuel used, at the home price.

The resulting item looks like this (shortened):

```json
{
  "name": "Fuel (petrol) for the round trip Dublin - Helsinki",
  "category": "transport",
  "estimated_cost": 994.03,
  "currency": "EUR",
  "note": "Live fuel prices, simulated fill-ups: 7245 km driving (3055 there via 2 stop(s), 4190 back) plus 419 km by ferry (no fuel used, tickets not included), 7 L/100km petrol, 50 L tank. Leaves IE with a full tank; 12 fill-up(s): 3x SE, 2x GB, 2x DE, 2x PL, 1x EE, 1x FI, 1x BE - each at the cheapest point in reach once the tank is half empty. 8 L left on return, deducted at the IE price. EUR per litre: SE 1680 km, 1.59/L (EU Oil Bulletin 28-09-2026); DE 1270 km, 2.35/L (...); GB 1110 km, 2.07/L (median of 8 stations on the route); ... Tolls not included.",
  "live": true,
  "fuelStops": [
    { "km": 560, "country": "GB", "liters": 39.2, "pricePerLiter": 2.069, "cost": 81.1 },
    { "km": 1160, "country": "DE", "liters": 42.0, "pricePerLiter": 2.345, "cost": 98.49 },
    { "km": 1760, "country": "PL", "liters": 42.0, "pricePerLiter": 1.853, "cost": 77.83 }
  ],
  "ferryKm": 419
}
```

The cost summary card shows `fuelStops` as a collapsible "N fuel stops" list under the fuel line: km, country, litres × price.

### Tolls and ferry tickets

None of these sources include road tolls, vignettes or ferry tickets. When the live fuel lookup succeeds and an AI Model block is connected, the AI gets one extra request: a separate `transport` line with **only** the tolls and vignettes, explicitly excluding fuel. If the route crosses water (`ferryKm` > 0), the request also asks for the car ferry crossings for the car and the whole group. Without an AI Model block, the run log notes `tolls not estimated - connect an AI Model block to include them`.

---

## Fallback behaviour

All sources are free and public, but **unofficial** (Xotelo, DuckDuckGo) or not guaranteed for heavy use (OSRM demo server, Nominatim). Any of them can change or start blocking requests without notice. Every failure raises `AccommodationPriceError` or `FuelPriceError` with a readable reason, and the executor then handles it as follows:

| Situation | Result |
|---|---|
| Live lookup succeeds | That line is the live item. The AI is only asked about the remaining lines (plus tolls, after a live fuel line). |
| Live lookup succeeds, no AI Model block connected | The live lines are still priced. A note says the rest (and tolls) need an AI Model block. |
| Live lookup fails, AI Model block connected | That line is estimated by the AI as before. The run log says `no live accommodation prices (<reason>)` or `no live fuel prices (<reason>)`, followed by `- used the AI estimate instead`. |
| Live lookup fails, no AI Model block, no other live line | `could not estimate costs: no AI Model block connected/unlocked` |

## Data sources

| Source | Used for | Key needed | Notes |
|---|---|---|---|
| [Xotelo](https://xotelo.com) (`data.xotelo.com/api`) | Hotel list per location (`/list`), live rates (`/rates`) | No | `/search` is RapidAPI-only and not used |
| DuckDuckGo HTML (`html.duckduckgo.com/html/`) | Destination → TripAdvisor location code | No | Needs a browser-like User-Agent |
| Nominatim (`nominatim.openstreetmap.org`) | Geocoding places | No | Usage policy: identifying User-Agent, max 1 request/second. `geo.py` enforces this with one process-wide throttle and caches results. |
| OSRM demo (`router.project-osrm.org`) | Driving route, distance, ferry crossings | No | Public demo server, fine for low volume |
| [Natural Earth](https://www.naturalearthdata.com/) 1:50m countries (GitHub raw) | Country of each route point | No | Downloaded once to `backend/.cache/` |
| French government open data | Fuel prices per station | No | |
| Spanish government open data | Fuel prices per station | No | Whole country per request, cached 1 h |
| UK retailer feeds (Asda, Motor Fuel Group) | Fuel prices per station | No | CMA transparency scheme, pence per litre, cached 1 h |
| EU Weekly Oil Bulletin | National average fuel prices, all EU countries | No | `.xlsx`, link scraped from the page weekly |
| Frankfurter (`api.frankfurter.dev`) | EUR ↔ other currencies for fuel prices | No | ECB reference rates |

Rejected alternatives:
- **Amadeus Self-Service:** shut down on 17 July 2026.
- **SerpApi Google Hotels and LiteAPI:** need a signup and API key, and SerpApi is paid above 250 searches per month.
- **Scraping Booking.com or Airbnb directly:** against their terms and heavily bot-protected.
- **Tankerkönig (Germany):** station-level prices, but needs an API key. The bulletin average is used for Germany instead.
- **Nominatim reverse geocoding for countries:** the first version did this. At 1 request/second it forced ~75–200 km samples and ~45 s runs; the local border lookup allows 10 km samples in milliseconds.

## Tuning

`accommodation_prices.py`:

| Constant | Default | Effect |
|---|---|---|
| `HOTELS_TO_PRICE` | 8 | More hotels give a steadier median but more calls and a slower block |
| `MAX_LOCATION_DISTANCE_KM` | 100 | How far the hotels may be from the geocoded destination before a search hit is rejected |
| `TRAVELERS_PER_ROOM` | 2 | Used to work out the number of rooms |
| `_TIMEOUT` | 15 s | Per HTTP request |

`fuel_prices.py`:

| Constant | Default | Effect |
|---|---|---|
| `SAMPLE_KM` | 10 | Distance between route points: country resolution and possible fill-up spots |
| `STATION_RADIUS_KM` | 5 | How far from the route a station still counts as "on the route" |
| `MAX_STATION_POINTS` | 6 | Route points per country used for station lookups |
| `MIN_STATIONS` | 3 | Fewer stations than this → use the national average |
| `DEFAULT_CONSUMPTION` | 7 / 6 / 9 | L/100km for petrol / diesel / LPG when the block doesn't set one |
| `DEFAULT_TANK_LITERS` | 50 | Tank size when the block doesn't set one |
| `REFUEL_FROM` | 0.5 | Tank fraction below which a fill-up is allowed (start of the fill-up window) |
| `RESERVE` | 0.15 | Tank fraction the car never drops below (end of the fill-up window) |

## Limitations

**Accommodation**
- **Speed:** a lookup takes roughly 10–13 seconds, or less when the location is cached.
- **Coverage:** only hotel-like places listed on TripAdvisor (hotels, hostels, B&Bs). No holiday rentals such as Airbnb or holiday parks.
- **Room assumption:** a fixed 2 people per room, with no room types or family rooms.
- **Price basis:** the price is the median of each hotel's cheapest offer. It isn't a specific bookable room, and taxes may not be included (Xotelo's `tax` field is usually empty).
- **Thin results:** rarer stay types can end up with only 1–2 places priced. The note shows how many were used.

**Fuel**
- **Speed:** a first run takes roughly 3–12 s depending on the route (plus ~10 s once per hour if it passes through Spain). A repeat run is faster: geocoding and price data are cached.
- **Station-level prices:** only in France, Spain and the UK. Elsewhere you get the weekly national average, which can be 10–20 cents per litre off a cheap station. The simulation therefore picks the cheapest *country*, not the cheapest station.
- **Not supported:** electric cars.
- **Not included:** tolls and ferry tickets, which come from the AI if a model is connected.
- **Fill-up behaviour:** the strategy is a reasonable driver, not an optimum. It only looks ahead within the current fill-up window. Every fill-up is assumed possible anywhere on the route (motorways have stations every ~30–50 km), and the trip always starts with a full tank.
- **Route stops** are the block's "route activity" names. A stop that doesn't geocode (e.g. "a nice lunch spot") is left out of the route, which makes it a bit shorter than planned.
- **Assumptions:** consumption is one fixed number for the whole trip (no extra for mountains or a roof box), and borders are accurate to roughly 1–2 km at Natural Earth's 1:50m scale.

## Testing it manually

From `backend/`, with Postgres running:

```powershell
# accommodation
.venv\Scripts\python.exe -c "from datetime import date; from app.accommodation_prices import fetch_accommodation_price as f; print(f('Gent', 'hotel', date(2026,12,4), date(2026,12,6), 2, 1, 'EUR'))"

# fuel: origin, route stops, destination, fuel type, L/100km, tank litres (None = default), currency
.venv\Scripts\python.exe -c "from app.fuel_prices import estimate_fuel_cost as f; print(f('Rotterdam', [], 'Paris', 'petrol', None, None, 'EUR'))"
```

Quick checks on the sources themselves:

```bash
curl "https://data.xotelo.com/api/list?location_key=g188590&limit=3"
curl "https://data.xotelo.com/api/rates?hotel_key=g188590-d6599284&chk_in=2026-12-04&chk_out=2026-12-06&adults=2&currency=EUR"
curl "https://router.project-osrm.org/route/v1/driving/4.4777,51.9244;2.3522,48.8566?overview=false"
curl "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=SEK"
curl "https://fuel.motorfuelgroup.com/fuel_prices_data.json" | head -c 400
```

If live prices suddenly stop appearing, check the backend log for `Live accommodation price lookup failed` or `Live fuel price lookup failed`. The reason says which step or source broke.
