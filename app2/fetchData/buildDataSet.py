"""Merge source JSON files under data/ into data/dataSet.json, then shard by grid.

Outputs:
  data/dataSet.json              — free-tier merge; CDN online default
  data/dist/manifest.json        — cellSize, counts, cell keys, cities
  data/dist/index.slim.json      — id/lat/lng/type for free places
  data/dist/cells/{i}_{j}.json   — full records per ~2 km cell (free)
  data/dist/cities/{縣市}.json    — full records per city (free)
  data/dist/pack/full.json       — Pro offline pack (all types, one file)
  data/dist/pack/manifest.json   — pack version + placeCount + types
  web/public/places/…            — same tree for Vite / CDN static fetch
  mobile/assets/places/cells/…   — hotspot cells only (no pack / no cities)
  mobile/src/data/cellRegistry.js — require() map for those hotspot cells
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "dataSet.json"
DIST_DIR = DATA_DIR / "dist"
PACK_DIR = DIST_DIR / "pack"
WEB_PLACES = ROOT / "web" / "public" / "places"
MOBILE_PLACES = ROOT / "mobile" / "assets" / "places"
MOBILE_REGISTRY = ROOT / "mobile" / "src" / "data" / "cellRegistry.js"

# Free CDN / App Store default.
FREE_SOURCE_FILES = [
    "711_with_toilet.json",
    "hk_mtr.json",
    "hk_kfc.json",
    "jp_mcdonalds.json",
    "jp_starbucks_mos.json",
]

# Pro offline pack includes every free source plus paid types.
# (Taiwan gas / department / MRT JSONs removed — overlapped with public toilets)
PRO_SOURCE_FILES = [
    "711_with_toilet.json",
    "family_with_toilet.json",
    "louisa_stores.json",
    "starbucks_stores.json",
    "poya_stores.json",
    "public_toilets.json",
    "hk_mtr.json",
    "hk_kfc.json",
    "hk_public_toilets.json",
    "hk_lcsd.json",
    "hk_gas_stations.json",
    "hk_restaurants.json",
    "hk_malls.json",
    "hk_big_box.json",
    "jp_mcdonalds.json",
    "jp_starbucks_mos.json",
    "jp_public_toilets.json",
    "jp_ckan_public_toilets.json",
    "jp_station_toilets.json",
    "jp_sapa.json",
    "jp_michinoeki.json",
    # Vietnam OSM confirmed toilets only (© OpenStreetMap contributors, ODbL).
    # Pro pack only; free list is unchanged until categories are chosen.
    "vn_toilets.json",
]

REQUIRED = ("id", "type", "地址", "lat", "lng", "營業時間")

# ~0.02° ≈ 2 km in Taiwan; must match app2/shared/places.js
CELL_SIZE = 0.02
CITY_RE = re.compile(r"^(.{2,3}[縣市])")

# Last-resort bundled cells (Kaohsiung demo center + 8 neighbors). Full data lives on CDN.
HOTSPOT_LATLNG = [(22.6273, 120.3014)]


def city_from_address(addr: str) -> str | None:
    m = CITY_RE.match(addr or "")
    return m.group(1) if m else None

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hours import normalize_hours  # noqa: E402


def load_source(path: Path) -> list[dict]:
    if not path.exists():
        print(f"skip missing: {path.name}")
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{path.name} must be a JSON array")
    return data


def coerce_hours(value) -> dict:
    if isinstance(value, dict) and "byDay" in value:
        return {
            "raw": str(value.get("raw") or ""),
            "allDay": bool(value.get("allDay")),
            "unknown": bool(value.get("unknown")),
            "byDay": value.get("byDay") or {},
        }
    return normalize_hours(str(value or ""))


def normalize(item: dict) -> dict | None:
    for key in REQUIRED:
        if key not in item:
            print(f"skip incomplete record (missing {key}): {item.get('地址')}")
            return None
    return {
        "id": str(item["id"]),
        "type": str(item["type"]),
        "name": str(item.get("name") or ""),
        "地址": str(item["地址"]),
        "lat": float(item["lat"]),
        "lng": float(item["lng"]),
        "營業時間": coerce_hours(item["營業時間"]),
    }


def merge_sources(names: list[str]) -> list[dict]:
    merged: list[dict] = []
    seen: set[str] = set()
    for name in names:
        for item in load_source(DATA_DIR / name):
            normalized = normalize(item)
            if normalized is None:
                continue
            if normalized["id"] in seen:
                continue
            seen.add(normalized["id"])
            merged.append(normalized)
    return merged


def cell_key(lat: float, lng: float) -> str:
    return f"{int(lat // CELL_SIZE)}_{int(lng // CELL_SIZE)}"


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def write_shards(places: list[dict]) -> dict:
    slim: list[dict] = []
    buckets: dict[str, list[dict]] = defaultdict(list)
    cities: dict[str, list[dict]] = defaultdict(list)

    for p in places:
        slim.append(
            {
                "id": p["id"],
                "lat": round(p["lat"], 5),
                "lng": round(p["lng"], 5),
                "type": p["type"],
            }
        )
        buckets[cell_key(p["lat"], p["lng"])].append(p)
        city = city_from_address(p["地址"])
        if city:
            cities[city].append(p)

    reset_dir(DIST_DIR / "cells")
    for key, rows in sorted(buckets.items()):
        write_json(DIST_DIR / "cells" / f"{key}.json", rows)

    reset_dir(DIST_DIR / "cities")
    for city, rows in sorted(cities.items()):
        write_json(DIST_DIR / "cities" / f"{city}.json", rows)

    write_json(DIST_DIR / "index.slim.json", slim)

    built_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {
        "cellSize": CELL_SIZE,
        "placeCount": len(places),
        "cellCount": len(buckets),
        "version": built_at,
        "builtAt": built_at,
        "cells": sorted(buckets.keys()),
        "cities": {city: len(rows) for city, rows in sorted(cities.items())},
        "tier": "free",
    }
    write_json(DIST_DIR / "manifest.json", manifest)
    return manifest


def write_pro_pack(places: list[dict], built_at: str) -> dict:
    """Single-file offline pack for Pro unlock."""
    reset_dir(PACK_DIR)
    pack_path = PACK_DIR / "full.json"
    write_json(pack_path, places)
    types: dict[str, int] = defaultdict(int)
    for p in places:
        types[p["type"]] += 1
    byte_size = pack_path.stat().st_size
    manifest = {
        "id": "full",
        "title": "完整資料包",
        "version": built_at,
        "builtAt": built_at,
        "placeCount": len(places),
        "byteSize": byte_size,
        "types": dict(sorted(types.items())),
        "file": "full.json",
    }
    write_json(PACK_DIR / "manifest.json", manifest)
    return manifest


def sync_tree(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)


def hotspot_cell_keys() -> list[str]:
    keys: set[str] = set()
    for lat, lng in HOTSPOT_LATLNG:
        i = int(lat // CELL_SIZE)
        j = int(lng // CELL_SIZE)
        for di in range(-1, 2):
            for dj in range(-1, 2):
                keys.add(f"{i + di}_{j + dj}")
    return sorted(keys)


def sync_mobile_hotspot(hot_keys: list[str]) -> None:
    """Ship only last-resort cells in the app binary; full shards stay on CDN."""
    if MOBILE_PLACES.exists():
        shutil.rmtree(MOBILE_PLACES)
    cells_dest = MOBILE_PLACES / "cells"
    cells_dest.mkdir(parents=True)
    for key in hot_keys:
        src = DIST_DIR / "cells" / f"{key}.json"
        if not src.exists():
            print(f"warn: missing hotspot cell {key}")
            continue
        shutil.copy2(src, cells_dest / f"{key}.json")
    manifest_src = DIST_DIR / "manifest.json"
    if manifest_src.exists():
        shutil.copy2(manifest_src, MOBILE_PLACES / "manifest.json")


def write_mobile_registry(cell_keys: list[str]) -> None:
    lines = [
        "/* AUTO-GENERATED by fetchData/buildDataSet.py — do not edit */",
        "/* Last-resort hotspot only; full data is CDN + Pro pack */",
        "",
        "const loaders = {",
    ]
    for key in cell_keys:
        lines.append(f"  '{key}': () => require('../../assets/places/cells/{key}.json'),")
    lines.extend(
        [
            "};",
            "",
            "export function loadCellSync(key) {",
            "  const load = loaders[key];",
            "  if (!load) return [];",
            "  const rows = load();",
            "  return Array.isArray(rows) ? rows : [];",
            "}",
            "",
        ]
    )
    MOBILE_REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    MOBILE_REGISTRY.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    free_places = merge_sources(FREE_SOURCE_FILES)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(free_places, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(free_places)} free places → {OUT_PATH}")

    manifest = write_shards(free_places)
    city_names = list(manifest.get("cities") or {})
    print(
        f"wrote free shards → {DIST_DIR} "
        f"({manifest['cellCount']} cells, {len(city_names)} cities, "
        f"version={manifest['version']})"
    )

    print("merging Pro pack sources…")
    pro_places = merge_sources(PRO_SOURCE_FILES)
    pack_manifest = write_pro_pack(pro_places, manifest["version"])
    mb = pack_manifest["byteSize"] / (1024 * 1024)
    print(
        f"wrote Pro pack → {PACK_DIR} "
        f"({pack_manifest['placeCount']} places, {mb:.1f} MB)"
    )

    sync_tree(DIST_DIR, WEB_PLACES)
    print(f"synced → {WEB_PLACES}")

    hot_keys = [k for k in hotspot_cell_keys() if k in set(manifest["cells"])]
    sync_mobile_hotspot(hot_keys)
    write_mobile_registry(hot_keys)
    print(f"bundled fallback → {len(hot_keys)} hotspot cells → {MOBILE_PLACES}")
    print(f"wrote → {MOBILE_REGISTRY}")


if __name__ == "__main__":
    main()
