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

`data/vn_toilets.json` only. Confirmed toilets: `amenity=toilets` (except `access=private` / `access=no`), plus venues below that are tagged `toilets=yes`. Venues without `toilets=yes` are not written.

The file is a JSON array. Each record is:

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

`buildDataSet.py` lists this file in `PRO_SOURCE_FILES` only. It is not in `FREE_SOURCE_FILES`. Publishing still needs `python3 fetchData/buildDataSet.py` and `bash deploy-places.sh`.

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
- A venue with `toilets=yes` keeps that category type and appends `toilets=yes` to `營業時間.raw`. Japan station toilets already store `fee=` on that string.
- `fee`, `access`, and `wheelchair` are appended the same way (`fee=yes wheelchair=limited`). There is no separate field for them.
- Name order is `name`, `name:vi`, `name:en`, then `brand`, `operator`, then the type label.
- Hours use `fetchData/jp_common.py` `hours_from_osm` (`opening_hours`, else `opening_hours:toilets`). Simple `24/7` and `Mo-Su HH:MM-HH:MM` become `byDay`. Anything else stays `unknown: true`, which the app treats as open and, in the detail sheet, replaces with “hours unknown” — so `fee=` / `toilets=yes` on an unparsed raw string is kept in the file and not shown.

City shards (`城市.json`) only match addresses that start with a Taiwan `縣`/`市`. Vietnam rows still land in the `0.02°` cells the map loads.

## Counts from the committed run

Geofabrik extract dated 2026-11-23 (`vietnam-latest.osm.pbf`, data extent 8.56–23.38 N, 102.16–109.46 E). Re-run the script to refresh.

| File | Records | Size | vs existing |
|---|---:|---:|---|
| `data/vn_toilets.json` | 1,304 | 582 KB | smaller than `jp_public_toilets.json` (2,112 / 1.1 MB) |

Unconfirmed venues are not generated. Counts below are confirmed toilets only.

Confirmed 1,304:

| OSM | Type | Count |
|---|---|---:|
| `amenity=toilets` | 公廁 | 1,110 |
| `amenity=cafe` + `toilets=yes` | 咖啡 | 89 |
| `amenity=restaurant` + `toilets=yes` | 餐廳 | 81 |
| `shop=mall` + `toilets=yes` | 商場 | 16 |
| `tourism=museum` + `toilets=yes` | 博物館 | 4 |
| `railway=station` + `toilets=yes` | 車站 | 2 |
| `amenity=bus_station` + `toilets=yes` | 公車站 | 1 |
| `tourism=attraction` + `toilets=yes` | 景點 | 1 |

Urban boxes, not the full municipal boundary:

- Hanoi 20.90–21.20 N, 105.70–106.05 E: 247 (公廁 218, 餐廳 13, 咖啡 8, 商場 7, 博物館 1)
- HCMC 10.68–10.90 N, 106.55–106.85 E: 153 (公廁 103, 咖啡 32, 餐廳 15, 商場 3)

## What the app still needs

No UI change is required to parse these records. They show up only after the Pro pack is rebuilt and a device has downloaded it:

- `resolveMarket()` has no Vietnam market, so help text stays generic.
- `FREE_SOURCE_FILES` is unchanged. Which Vietnam categories belong in the free version is still open. A free install in Vietnam loads empty cells until that choice is made, or until the user downloads the full pack.
- Store listing and the help modal do not mention Vietnam.
- `營業時間.raw` extras (`fee`, `access`, `wheelchair`, `toilets=yes`) are hidden while hours are `unknown`.
