# Vietnam toilets（越南廁所）

Fetches OpenStreetMap places in Vietnam and writes them in the same place schema as Taiwan, Hong Kong, and Japan.

**© OpenStreetMap contributors.** The data is under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).

資料來源：OpenStreetMap，**© OpenStreetMap contributors**，授權 [ODbL](https://www.openstreetmap.org/copyright)。

## Usage

From `app2/`:

```bash
# Geofabrik PBF (primary). Downloads vietnam-latest.osm.pbf on first run.
python3 vn_toilet_script/fetch_vietnam.py

# Reuse a PBF you already have
python3 vn_toilet_script/fetch_vietnam.py --pbf /path/to/vietnam-latest.osm.pbf

# Force a fresh Geofabrik download
python3 vn_toilet_script/fetch_vietnam.py --refresh

# Public Overpass only (slower; one tile at a time)
python3 vn_toilet_script/fetch_vietnam.py --source overpass

python3 vn_toilet_script/fetch_vietnam.py --self-test
```

`--source auto` (the default) uses the PBF. If the download or `osmium` fails, it falls back to Overpass.

Dependencies:

- Python 3, plus `requests` (same import `fetchData/` already uses)
- `osmium-tool` for the PBF path (`apt install osmium-tool` / `brew install osmium-tool`)

The PBF is cached at `$TMPDIR/vn-osm/vietnam-latest.osm.pbf` and is not committed.

Primary URL: <https://download.geofabrik.de/asia/vietnam-latest.osm.pbf>

Overpass endpoint: <https://overpass-api.de/api/interpreter> (plus kumi.systems and lz4 mirrors). Requests are sequential, with a pause between tiles, and send a named User-Agent.

## Output

Two JSON arrays. Venues without `toilets=yes` are not written.

| File | Contents | Pack |
|---|---|---|
| `data/vn_toilets.json` | `amenity=toilets` except `access=private` / `access=no` (type `公廁`) | Pro only |
| `data/vn_venues_toilets.json` | Other confirmed venues tagged `toilets=yes` | Free, and also Pro |

Free sources are listed in both `FREE_SOURCE_FILES` and `PRO_SOURCE_FILES` (7-Eleven, MTR, KFC, McDonald’s, Starbucks/MOS). `vn_venues_toilets.json` follows that. `vn_toilets.json` does not.

Each record is:

```json
{
  "id": "vn-0123456789ab",
  "type": "公廁",
  "name": "…",
  "地址": "…",
  "lat": 21.0278,
  "lng": 105.8342,
  "營業時間": {"raw": "", "allDay": false, "unknown": true, "byDay": {"1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": []}}
}
```

`id` is `vn-` plus a 12-hex SHA1 of type, name, address, and `osm type:id`, same scheme as `hk-` / `jp-` in `fetchData/common.py`. Coordinates are WGS84, rounded to 7 decimals. Way and relation centers come from the polygon centroid (largest ring for multipolygons) or the vertex average for lines.

Publishing still needs `python3 fetchData/buildDataSet.py` and `bash deploy-places.sh`. The free CDN merge (`dataSet.json`) does not include `vn_toilets.json`.

## What is included

- `amenity=toilets`, except `access=private` or `access=no`
- A venue below only when it is tagged `toilets=yes` (same access exclusion):
  - `shop=mall` and `shop=department_store` (`--no-department-store` drops the latter)
  - `tourism=hotel`
  - `amenity=cafe`, `amenity=restaurant`
  - `tourism=museum`, `tourism=attraction`, `tourism=theme_park`
  - `amenity=fuel`
  - `amenity=bus_station`
  - `railway=station`

Excluded:

- Any venue that does not have `toilets=yes`
- `aeroway=*` and `amenity=aerodrome` / `airport`
- `shop=convenience`, even with `toilets=yes`
- Ferry terminals (`amenity=ferry_terminal`, `station=ferry`, `railway=ferry`)
- Objects that are only `public_transport=station` (a railway station that also has that tag is kept)

If one object matches several categories, the first hit wins: railway station, bus station, mall, department store, fuel, hotel, museum, theme park, cafe, restaurant, attraction. `amenity=toilets` wins over all of those.

## Format decisions

`buildDataSet.py` only keeps `id`, `type`, `name`, `地址`, `lat`, `lng`, `營業時間`. Inside a record:

- Confirmed public toilets use the existing type `公廁` (same as Taiwan FAC_P_07 and Hong Kong public toilets).
- Venues use the closest existing type when there is one: `商場` (mall and department store, same as Hong Kong), `加油站`.
- Categories with no existing generic type use a short Chinese label the app can print as-is: `飯店`, `咖啡`, `餐廳`, `博物館`, `主題樂園`, `景點`, `公車站`, `車站`. `港鐵` and `駅トイレ` stay Hong Kong / Japan specific.
- A venue with `toilets=yes` keeps that category type. The category stays in `type`; `name` is only the OSM place name (`name`, then `name:vi`, `name:en`, `brand`, `operator`). There is no type-label fallback. Prices, `yes`/`no`/`free`, and other non-names are dropped, so an unnamed cafe is `type: 咖啡` with an empty `name`.
- Hours use `fetchData/jp_common.py` `hours_from_osm` (`opening_hours`, else `opening_hours:toilets`). Simple `24/7` and `Mo-Su HH:MM-HH:MM` become `byDay`. `營業時間.raw` is only that opening-hours text (or empty when unknown). `fee`, `access`, `wheelchair`, and `toilets=yes` are not stored: the shared schema has no unused field for them, and the app displays `raw` whenever hours are known.

City shards (`城市.json`) only match addresses that start with a Taiwan `縣`/`市`. Vietnam rows still land in the `0.02°` cells the map loads.

## Counts from the committed run

Geofabrik extract dated 2026-11-23 (`vietnam-latest.osm.pbf`, data extent 8.56–23.38 N, 102.16–109.46 E). Re-run the script to refresh.

| File | Records | Size | Pack |
|---|---:|---:|---|
| `data/vn_toilets.json` | 1,110 | 438 KB | Pro only (`公廁`) |
| `data/vn_venues_toilets.json` | 194 | 143 KB | Free and Pro |

`vn_toilets.json` is smaller than `jp_public_toilets.json` (2,112 / 1.1 MB).

| OSM | Type | File | Count |
|---|---|---|---:|
| `amenity=toilets` | 公廁 | `vn_toilets.json` | 1,110 |
| `amenity=cafe` + `toilets=yes` | 咖啡 | `vn_venues_toilets.json` | 89 |
| `amenity=restaurant` + `toilets=yes` | 餐廳 | `vn_venues_toilets.json` | 81 |
| `shop=mall` + `toilets=yes` | 商場 | `vn_venues_toilets.json` | 16 |
| `tourism=museum` + `toilets=yes` | 博物館 | `vn_venues_toilets.json` | 4 |
| `railway=station` + `toilets=yes` | 車站 | `vn_venues_toilets.json` | 2 |
| `amenity=bus_station` + `toilets=yes` | 公車站 | `vn_venues_toilets.json` | 1 |
| `tourism=attraction` + `toilets=yes` | 景點 | `vn_venues_toilets.json` | 1 |

Urban boxes, not the full municipal boundary:

- Hanoi 20.90–21.20 N, 105.70–106.05 E: 公廁 218, venues 29 (餐廳 13, 咖啡 8, 商場 7, 博物館 1)
- HCMC 10.68–10.90 N, 106.55–106.85 E: 公廁 103, venues 50 (咖啡 32, 餐廳 15, 商場 3)

## What the app still needs

No UI change is required to parse these records. They show up after `buildDataSet.py` is run and the free cells (venues) or Pro pack (公廁 plus venues) are deployed:

- `resolveMarket()` has no Vietnam market, so help text stays generic.
- The free map will include `vn_venues_toilets.json` only. `公廁` stays in the Pro pack.
- Store listing and the help modal do not mention Vietnam.
- The app title and Google Maps query are `{type} {name} {地址}` (`MapScreen.navigationQuery`). Cleaning `name` does not remove the category from that query.
