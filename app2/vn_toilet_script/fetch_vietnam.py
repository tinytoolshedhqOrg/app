#!/usr/bin/env python3
"""Fetch Vietnam toilet places from OpenStreetMap into app2/data.

Primary source is the Geofabrik Vietnam extract, filtered and exported with
osmium. Overpass is the fallback when the PBF or osmium is unavailable.

Output matches the shared place schema used by Taiwan / Hong Kong / Japan:
id, type, name, 地址, lat, lng, 營業時間.

© OpenStreetMap contributors. Data is licensed under the ODbL.
https://www.openstreetmap.org/copyright
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FETCH_DIR = ROOT / "fetchData"
if str(FETCH_DIR) not in sys.path:
    sys.path.insert(0, str(FETCH_DIR))

from common import record, save_json  # noqa: E402
from jp_common import hours_from_osm  # noqa: E402

USER_AGENT = "ToiletGo-vn-fetch/1.0 (Vietnam toilet dataset; ODbL)"
GEOFABRIK_PBF = "https://download.geofabrik.de/asia/vietnam-latest.osm.pbf"
DEFAULT_PBF = Path(tempfile.gettempdir()) / "vn-osm" / "vietnam-latest.osm.pbf"

# south, west, north, east. Wide enough for the Geofabrik extract plus islands.
VN_BOUNDS = (8.0, 102.0, 23.6, 115.0)

# Urban extents for the summary only. Not official admin boundaries.
CITY_BOXES = {
    "Hanoi": (20.90, 105.70, 21.20, 106.05),
    "HCMC": (10.68, 106.55, 10.90, 106.85),
}

OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
)

GEOM_RANK = {
    "Point": 1,
    "LineString": 2,
    "MultiLineString": 2,
    "Polygon": 3,
    "MultiPolygon": 4,
}

CONFIRMED_FILE = "vn_toilets.json"
POSSIBLE_FILE = "vn_possible.json"

# Existing app type strings where a category already exists (公廁, 商場, 加油站).
# Hotel / cafe / restaurant / museum / attraction / theme park / bus / rail have
# no generic type in the TW/HK/JP feeds, so they use a short Chinese label.
# The app prints `type` as text and does not whitelist it.
VENUE_RULES: tuple[tuple[str, str, str], ...] = (
    ("railway", "station", "車站"),
    ("amenity", "bus_station", "公車站"),
    ("shop", "mall", "商場"),
    ("shop", "department_store", "商場"),
    ("amenity", "fuel", "加油站"),
    ("tourism", "hotel", "飯店"),
    ("tourism", "museum", "博物館"),
    ("tourism", "theme_park", "主題樂園"),
    ("amenity", "cafe", "咖啡"),
    ("amenity", "restaurant", "餐廳"),
    ("tourism", "attraction", "景點"),
)


def _tag(tags: dict, key: str) -> str:
    return str(tags.get(key) or "").strip()


def _closed_access(tags: dict) -> bool:
    return _tag(tags, "access").lower() in {"private", "no"}


def _is_airport(tags: dict) -> bool:
    if _tag(tags, "aeroway"):
        return True
    return _tag(tags, "amenity") in {"aerodrome", "airport"}


def _is_convenience(tags: dict) -> bool:
    return _tag(tags, "shop") == "convenience"


def _is_ferry_terminal(tags: dict) -> bool:
    if _tag(tags, "amenity") == "ferry_terminal":
        return True
    if _tag(tags, "station") == "ferry":
        return True
    return _tag(tags, "railway") in {"ferry", "ferry_terminal"}


def _toilets_yes(tags: dict) -> bool:
    return _tag(tags, "toilets").lower() in {"yes", "true", "1"}


def _toilets_no(tags: dict) -> bool:
    return _tag(tags, "toilets").lower() in {"no", "false", "0"}


def venue_match(tags: dict) -> tuple[str, str] | None:
    """Return (osm bucket, app type) for a possible-tier category."""
    for key, value, type_name in VENUE_RULES:
        if _tag(tags, key) == value:
            return f"{key}={value}", type_name
    return None


def classify(tags: dict, *, include_department_store: bool = True) -> tuple[str, str, str] | None:
    """Return (tier, app type, osm bucket) or None when the feature is dropped.

    tier is `confirmed` or `possible`. Confirmed is amenity=toilets, or a
    venue in the category list tagged toilets=yes. There is no schema field
    for that split: confirmed public toilets use type 公廁, and a confirmed
    venue keeps its category type with `toilets=yes` appended to 營業時間.raw
    (the same channel JP station toilets use for `fee=`).
    """
    if _is_airport(tags) or _is_convenience(tags):
        return None
    amenity = _tag(tags, "amenity")
    if amenity == "toilets":
        if _closed_access(tags):
            return None
        return "confirmed", "公廁", "amenity=toilets"
    if _is_ferry_terminal(tags):
        return None
    matched = venue_match(tags)
    if matched is None:
        return None
    bucket, type_name = matched
    if bucket == "shop=department_store" and not include_department_store:
        return None
    if _toilets_no(tags):
        return None
    if _toilets_yes(tags):
        if _closed_access(tags):
            return None
        return "confirmed", type_name, bucket
    return "possible", type_name, bucket


def pick_name(tags: dict, fallback: str) -> str:
    for key in ("name", "name:vi", "name:en", "brand", "operator"):
        value = _tag(tags, key)
        if value:
            return value
    return fallback


def pick_address(tags: dict) -> str:
    full = _tag(tags, "addr:full")
    if full:
        return full
    number = _tag(tags, "addr:housenumber")
    street = _tag(tags, "addr:street") or _tag(tags, "addr:place")
    line = " ".join(part for part in (number, street) if part)
    rest = [
        _tag(tags, "addr:suburb") or _tag(tags, "addr:quarter") or _tag(tags, "addr:neighbourhood"),
        _tag(tags, "addr:district") or _tag(tags, "addr:subdistrict"),
        _tag(tags, "addr:city") or _tag(tags, "addr:town"),
        _tag(tags, "addr:province") or _tag(tags, "addr:state"),
    ]
    parts = [line, *[part for part in rest if part]]
    return ", ".join(parts)


def annotate_hours(hours: dict, tags: dict, *, toilets_yes: bool) -> dict:
    """Keep the JP/HK hours object. Extra OSM facts go on raw, like fee=."""
    raw = str(hours.get("raw") or "")
    bits: list[str] = []
    for key in ("fee", "access", "wheelchair"):
        value = _tag(tags, key)
        if value:
            bits.append(f"{key}={value}")
    if toilets_yes:
        bits.append("toilets=yes")
    if bits:
        raw = f"{raw} {' '.join(bits)}".strip()
    by_day = hours.get("byDay") or {}
    return {
        "raw": raw,
        "allDay": bool(hours.get("allDay")),
        "unknown": bool(hours.get("unknown")),
        "byDay": {str(day): list(slots) for day, slots in by_day.items()},
    }


def opening_hours_text(tags: dict) -> str:
    return _tag(tags, "opening_hours") or _tag(tags, "opening_hours:toilets")


def build_record(tags: dict, lat: float, lng: float, osm_type: str, osm_id: str, type_name: str, *, toilets_yes: bool) -> dict:
    hours = annotate_hours(hours_from_osm(opening_hours_text(tags)), tags, toilets_yes=toilets_yes)
    return record(
        type_name,
        pick_name(tags, type_name),
        pick_address(tags),
        round(float(lat), 7),
        round(float(lng), 7),
        hours,
        extra={"osm_id": f"{osm_type}:{osm_id}"},
        id_prefix="vn",
    )


def in_vietnam(lat: float, lng: float) -> bool:
    south, west, north, east = VN_BOUNDS
    return south <= lat <= north and west <= lng <= east


def in_box(lat: float, lng: float, box: tuple[float, float, float, float]) -> bool:
    south, west, north, east = box
    return south <= lat <= north and west <= lng <= east


def _ring_stats(ring: list) -> tuple[float, float, float] | None:
    if not ring:
        return None
    pts = list(ring)
    if len(pts) >= 2 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if not pts:
        return None
    if len(pts) < 3:
        lat = sum(float(p[1]) for p in pts) / len(pts)
        lng = sum(float(p[0]) for p in pts) / len(pts)
        return lat, lng, 0.0
    twice_area = 0.0
    cx = 0.0
    cy = 0.0
    count = len(pts)
    for i, point in enumerate(pts):
        x1, y1 = float(point[0]), float(point[1])
        nxt = pts[(i + 1) % count]
        x2, y2 = float(nxt[0]), float(nxt[1])
        cross = x1 * y2 - x2 * y1
        twice_area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(twice_area) < 1e-12:
        lat = sum(float(p[1]) for p in pts) / count
        lng = sum(float(p[0]) for p in pts) / count
        return lat, lng, 0.0
    return cy / (3.0 * twice_area), cx / (3.0 * twice_area), abs(twice_area) / 2.0


def _average(points: list) -> tuple[float, float] | None:
    if not points:
        return None
    lat = sum(float(p[1]) for p in points) / len(points)
    lng = sum(float(p[0]) for p in points) / len(points)
    return lat, lng


def centroid(geometry: dict | None) -> tuple[float, float] | None:
    """Center of a GeoJSON geometry. Points pass through; ways/relations use the ring centroid or vertex average."""
    if not geometry:
        return None
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if not coords:
        return None
    if gtype == "Point":
        return float(coords[1]), float(coords[0])
    if gtype == "LineString":
        return _average(coords)
    if gtype == "MultiLineString":
        flat = [pt for line in coords for pt in line]
        return _average(flat)
    if gtype == "Polygon":
        stats = _ring_stats(coords[0])
        return None if stats is None else (stats[0], stats[1])
    if gtype == "MultiPolygon":
        best = None
        best_area = -1.0
        for poly in coords:
            if not poly:
                continue
            stats = _ring_stats(poly[0])
            if stats is None:
                continue
            if stats[2] >= best_area:
                best_area = stats[2]
                best = stats
        return None if best is None else (best[0], best[1])
    return None


def _finite(lat: float, lng: float) -> bool:
    return math.isfinite(lat) and math.isfinite(lng)


def feature_tags(properties: dict) -> dict:
    return {key: value for key, value in properties.items() if not str(key).startswith("@")}


def feature_identity(feature: dict) -> tuple[str, str]:
    props = feature.get("properties") or {}
    osm_type = props.get("@type")
    osm_id = props.get("@id")
    if osm_type and osm_id is not None:
        return str(osm_type), str(osm_id)
    fid = str(feature.get("id") or "")
    prefix = {"n": "node", "w": "way", "r": "relation"}
    if len(fid) > 1 and fid[0] in prefix and fid[1:].isdigit():
        return prefix[fid[0]], fid[1:]
    return "object", fid or "0"


def iter_geojsonseq(stream) -> dict:
    for raw in stream:
        line = raw.lstrip("\x1e").strip()
        if not line:
            continue
        yield json.loads(line)


def filter_expressions() -> list[str]:
    expressions = ["nwr/amenity=toilets"]
    seen: set[tuple[str, str]] = set()
    for key, value, _type_name in VENUE_RULES:
        pair = (key, value)
        if pair in seen:
            continue
        seen.add(pair)
        expressions.append(f"nwr/{key}={value}")
    return expressions


def run_osmium_export(pbf: Path) -> dict[tuple[str, str], tuple[int, dict, dict]]:
    """Filter the country extract and keep the best geometry per OSM object.

    osmium export emits a closed way twice (LineString and MultiPolygon). The
    polygon outranks the line so the stored center is the area centroid.
    Referenced untagged-category objects (crossings on a way) stay in the
    extract and are dropped later by classify().
    """
    if shutil.which("osmium") is None:
        raise RuntimeError("osmium is not installed (apt install osmium-tool)")
    work = pbf.parent
    work.mkdir(parents=True, exist_ok=True)
    filtered = work / "vn-filtered.osm.pbf"
    expr = work / "vn-filters.txt"
    expr.write_text("\n".join(filter_expressions()) + "\n", encoding="utf-8")
    print(f"osmium tags-filter {pbf.name}", flush=True)
    subprocess.run(
        [
            "osmium",
            "tags-filter",
            "--overwrite",
            "-o",
            str(filtered),
            str(pbf),
            "-e",
            str(expr),
        ],
        check=True,
    )
    print("osmium export geojsonseq", flush=True)
    proc = subprocess.Popen(
        ["osmium", "export", "-f", "geojsonseq", "-a", "type,id", str(filtered)],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    assert proc.stdout is not None
    best: dict[tuple[str, str], tuple[int, dict, dict]] = {}
    for feature in iter_geojsonseq(proc.stdout):
        geometry = feature.get("geometry") or {}
        rank = GEOM_RANK.get(geometry.get("type") or "", 0)
        if rank <= 0:
            continue
        identity = feature_identity(feature)
        tags = feature_tags(feature.get("properties") or {})
        previous = best.get(identity)
        if previous is None or rank >= previous[0]:
            best[identity] = (rank, geometry, tags)
    code = proc.wait()
    if code != 0:
        raise RuntimeError(f"osmium export failed with exit {code}")
    print(f"  unique OSM objects: {len(best)}", flush=True)
    return best


def download_pbf(dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".pbf.part")
    print(f"downloading {GEOFABRIK_PBF}", flush=True)
    request = urllib.request.Request(GEOFABRIK_PBF, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response, tmp.open("wb") as handle:
        while True:
            chunk = response.read(256 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    tmp.replace(dest)
    print(f"  saved {dest} ({dest.stat().st_size} bytes)", flush=True)
    return dest


def resolve_pbf(path: Path | None, *, refresh: bool) -> Path:
    dest = path or DEFAULT_PBF
    if dest.exists() and dest.stat().st_size > 50_000_000 and not refresh:
        print(f"using existing PBF {dest}", flush=True)
        return dest
    if path is not None and not dest.exists():
        raise FileNotFoundError(dest)
    return download_pbf(dest if path is None else dest)


def vietnam_overpass_boxes() -> list[tuple[str, str]]:
    """2.5° tiles covering Vietnam. Overlaps are deduped by OSM id."""
    boxes = []
    lat = 8.2
    while lat < 23.6:
        north = min(lat + 2.5, 23.6)
        lng = 102.0
        while lng < 109.7:
            east = min(lng + 2.5, 109.7)
            boxes.append((f"{lat:.1f},{lng:.1f}", f"{lat:.4f},{lng:.4f},{north:.4f},{east:.4f}"))
            lng += 2.4
        lat += 2.4
    return boxes


def overpass_query(bbox: str) -> str:
    lines = []
    for expr in filter_expressions():
        _prefix, spec = expr.split("/", 1)
        key, value = spec.split("=", 1)
        lines.append(f'  nwr["{key}"="{value}"]({bbox});')
    body = "\n".join(lines)
    return f"[out:json][timeout:180];\n(\n{body}\n);\nout center tags;"


def overpass_once(query: str) -> list[dict]:
    payload = urllib.parse.urlencode({"data": query}).encode()
    last_error: Exception | None = None
    for attempt in range(6):
        url = OVERPASS_URLS[attempt % len(OVERPASS_URLS)]
        request = urllib.request.Request(
            url,
            data=payload,
            headers={
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=200) as response:
                data = json.loads(response.read().decode("utf-8"))
            time.sleep(2.0)
            return list(data.get("elements") or [])
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            last_error = exc
            print(f"  overpass attempt {attempt + 1} failed: {exc}", flush=True)
            time.sleep(min(30, 5 * (attempt + 1)))
    raise RuntimeError(f"overpass failed: {last_error}")


def overpass_vietnam() -> dict[tuple[str, str], tuple[int, dict, dict]]:
    """Fallback. One tile at a time, per the public Overpass usage policy."""
    print("falling back to Overpass (Geofabrik/osmium unavailable)", flush=True)
    best: dict[tuple[str, str], tuple[int, dict, dict]] = {}
    for name, bbox in vietnam_overpass_boxes():
        print(f"  overpass {name}", flush=True)
        for element in overpass_once(overpass_query(bbox)):
            osm_type = str(element.get("type") or "node")
            osm_id = str(element.get("id") or "")
            lat = element.get("lat")
            lng = element.get("lon")
            if lat is None or lng is None:
                center = element.get("center") or {}
                lat, lng = center.get("lat"), center.get("lon")
            if lat is None or lng is None:
                continue
            geometry = {"type": "Point", "coordinates": [float(lng), float(lat)]}
            best[(osm_type, osm_id)] = (GEOM_RANK["Point"], geometry, dict(element.get("tags") or {}))
    print(f"  unique OSM objects: {len(best)}", flush=True)
    return best


def load_objects(source: str, pbf: Path | None, *, refresh: bool) -> dict[tuple[str, str], tuple[int, dict, dict]]:
    if source == "overpass":
        return overpass_vietnam()
    try:
        path = resolve_pbf(pbf, refresh=refresh)
        return run_osmium_export(path)
    except Exception as exc:  # noqa: BLE001
        if source == "pbf":
            raise
        print(f"PBF path failed ({exc})", flush=True)
        return overpass_vietnam()


def collect(objects, *, include_department_store: bool) -> tuple[list[dict], list[dict], Counter]:
    confirmed: list[dict] = []
    possible: list[dict] = []
    stats: Counter = Counter()
    for (osm_type, osm_id), (_rank, geometry, tags) in objects.items():
        stats["objects"] += 1
        point = centroid(geometry)
        if point is None or not _finite(*point):
            stats["dropped_geometry"] += 1
            continue
        lat, lng = point
        if not in_vietnam(lat, lng):
            stats["dropped_bounds"] += 1
            continue
        decision = classify(tags, include_department_store=include_department_store)
        if decision is None:
            stats["dropped_rules"] += 1
            continue
        tier, type_name, bucket = decision
        row = build_record(
            tags,
            lat,
            lng,
            osm_type,
            osm_id,
            type_name,
            toilets_yes=(tier == "confirmed" and bucket != "amenity=toilets"),
        )
        stats[f"tier:{tier}"] += 1
        stats[f"type:{tier}:{type_name}"] += 1
        stats[f"bucket:{tier}:{bucket}"] += 1
        for city, box in CITY_BOXES.items():
            if in_box(lat, lng, box):
                stats[f"city:{city}:{tier}"] += 1
        if tier == "confirmed":
            confirmed.append(row)
        else:
            possible.append(row)
    confirmed.sort(key=lambda row: (row["type"], row["name"], row["id"]))
    possible.sort(key=lambda row: (row["type"], row["name"], row["id"]))
    return confirmed, possible, stats


def print_summary(confirmed: list[dict], possible: list[dict], stats: Counter) -> None:
    print("\n=== Vietnam toilet summary ===", flush=True)
    print(f"confirmed {len(confirmed)}  possible {len(possible)}", flush=True)
    print(
        "dropped "
        f"geometry={stats['dropped_geometry']} "
        f"bounds={stats['dropped_bounds']} "
        f"rules={stats['dropped_rules']}",
        flush=True,
    )
    for tier, rows in (("confirmed", confirmed), ("possible", possible)):
        print(f"[{tier}]", flush=True)
        buckets = [(key, count) for key, count in sorted(stats.items()) if key.startswith(f"bucket:{tier}:")]
        for key, count in buckets:
            print(f"  {count:6d}  {key.split(':', 2)[2]}", flush=True)
        for city in CITY_BOXES:
            print(f"  {city}: {stats[f'city:{city}:{tier}']}", flush=True)
    all_rows = confirmed + possible
    if all_rows:
        lats = [row["lat"] for row in all_rows]
        lngs = [row["lng"] for row in all_rows]
        print(
            f"extent lat {min(lats):.4f}..{max(lats):.4f}  lng {min(lngs):.4f}..{max(lngs):.4f}",
            flush=True,
        )


def self_test() -> None:
    assert classify({"amenity": "toilets"}) == ("confirmed", "公廁", "amenity=toilets")
    assert classify({"amenity": "toilets", "access": "private"}) is None
    assert classify({"amenity": "toilets", "access": "no"}) is None
    assert classify({"amenity": "toilets", "access": "customers"})[0] == "confirmed"
    assert classify({"amenity": "toilets", "shop": "convenience"}) is None
    assert classify({"amenity": "toilets", "aeroway": "terminal"}) is None
    assert classify({"shop": "mall"}) == ("possible", "商場", "shop=mall")
    assert classify({"shop": "mall", "toilets": "yes"}) == ("confirmed", "商場", "shop=mall")
    assert classify({"shop": "mall", "toilets": "yes", "access": "private"}) is None
    assert classify({"amenity": "restaurant", "toilets": "no"}) is None
    assert classify({"amenity": "cafe", "shop": "convenience"}) is None
    assert classify({"public_transport": "station"}) is None
    assert classify({"railway": "station"}) == ("possible", "車站", "railway=station")
    assert classify({"railway": "station", "public_transport": "station"})[2] == "railway=station"
    assert classify({"railway": "station", "station": "ferry"}) is None
    assert classify({"amenity": "ferry_terminal", "tourism": "attraction"}) is None
    assert classify({"tourism": "hotel", "aeroway": "aerodrome"}) is None
    assert classify({"shop": "department_store"}, include_department_store=False) is None
    assert classify({"amenity": "fuel"})[1] == "加油站"
    assert pick_name({"name:vi": "Hà Nội", "name:en": "Hanoi", "name": "Ha Noi"}, "公廁") == "Ha Noi"
    assert pick_name({"name:en": "Hanoi", "name:vi": "Hà Nội"}, "公廁") == "Hà Nội"
    assert pick_name({"brand": "Petrolimex"}, "加油站") == "Petrolimex"
    square = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
    }
    lat, lng = centroid(square)
    assert abs(lat - 1) < 1e-6 and abs(lng - 1) < 1e-6, (lat, lng)
    line = {"type": "LineString", "coordinates": [[106.0, 10.0], [106.2, 10.4]]}
    lat, lng = centroid(line)
    assert abs(lat - 10.2) < 1e-9 and abs(lng - 106.1) < 1e-9
    hours = annotate_hours(
        hours_from_osm("24/7"),
        {"fee": "no", "wheelchair": "yes", "access": "yes"},
        toilets_yes=True,
    )
    assert hours["allDay"] is True
    assert "fee=no" in hours["raw"] and "toilets=yes" in hours["raw"]
    assert "wheelchair=yes" in hours["raw"]
    row = build_record(
        {"name": "Vincom", "opening_hours": "24/7", "fee": "no"},
        10.78,
        106.70,
        "way",
        "1",
        "商場",
        toilets_yes=True,
    )
    for key in ("id", "type", "name", "地址", "lat", "lng", "營業時間"):
        assert key in row
    assert row["id"].startswith("vn-")
    assert row["type"] == "商場"
    assert row["營業時間"]["allDay"] is True
    assert "toilets=yes" in row["營業時間"]["raw"]
    print("self-test ok")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Vietnam OSM toilets into app2/data")
    parser.add_argument("--source", choices=("auto", "pbf", "overpass"), default="auto")
    parser.add_argument("--pbf", type=Path, default=None, help="Geofabrik vietnam-latest.osm.pbf")
    parser.add_argument("--refresh", action="store_true", help="Re-download the Geofabrik PBF")
    parser.add_argument("--no-department-store", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    objects = load_objects(args.source, args.pbf, refresh=args.refresh)
    confirmed, possible, stats = collect(
        objects,
        include_department_store=not args.no_department_store,
    )
    if not confirmed and not possible:
        raise SystemExit("no Vietnam places produced")
    save_json(CONFIRMED_FILE, confirmed)
    save_json(POSSIBLE_FILE, possible)
    print_summary(confirmed, possible, stats)


if __name__ == "__main__":
    main()
