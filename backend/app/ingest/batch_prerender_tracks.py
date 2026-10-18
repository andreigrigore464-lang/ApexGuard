"""
Batch Pre-Renderer for Surveyed Track CSVs.
Processes all 25 surveyed racetrack CSVs from TUMFTM into pre-rendered, closed-loop JSON files
with exact physical coordinate transformations (z = -y_m) and boundary extrusion.
"""

import os
import csv
import json
import re
from pathlib import Path
from typing import Dict, List, Tuple
import numpy as np

TRACKS_CSV_DIR = Path(__file__).resolve().parent.parent / "data" / "tracks" / "trackCSV"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "tracks"

# Canonical Display Names & Aliases
TRACK_CATALOG: Dict[str, Dict[str, str]] = {
    "Austin": {"name": "Circuit of the Americas (Austin)", "country": "USA", "aliases": "austin,cota,united_states,usa"},
    "BrandsHatch": {"name": "Brands Hatch Circuit", "country": "Great Britain", "aliases": "brands_hatch,brands"},
    "Budapest": {"name": "Hungaroring (Budapest)", "country": "Hungary", "aliases": "budapest,hungaroring,hungary"},
    "Catalunya": {"name": "Circuit de Barcelona-Catalunya", "country": "Spain", "aliases": "catalunya,barcelona,spain"},
    "Hockenheim": {"name": "Hockenheimring", "country": "Germany", "aliases": "hockenheim,hockenheimring,germany"},
    "IMS": {"name": "Indianapolis Motor Speedway", "country": "USA", "aliases": "ims,indianapolis,indy"},
    "Melbourne": {"name": "Albert Park Circuit (Melbourne)", "country": "Australia", "aliases": "melbourne,albert_park,australia"},
    "MexicoCity": {"name": "Autódromo Hermanos Rodríguez (Mexico City)", "country": "Mexico", "aliases": "mexicocity,mexico_city,hermanos_rodriguez,mexico"},
    "Montreal": {"name": "Circuit Gilles Villeneuve (Montreal)", "country": "Canada", "aliases": "montreal,gilles_villeneuve,canada"},
    "Monza": {"name": "Autodromo Nazionale Monza", "country": "Italy", "aliases": "monza,italy"},
    "MoscowRaceway": {"name": "Moscow Raceway", "country": "Russia", "aliases": "moscow,moscow_raceway,russia"},
    "Norisring": {"name": "Norisring", "country": "Germany", "aliases": "norisring"},
    "Nuerburgring": {"name": "Nürburgring", "country": "Germany", "aliases": "nuerburgring,nurburgring"},
    "Oschersleben": {"name": "Motorsport Arena Oschersleben", "country": "Germany", "aliases": "oschersleben"},
    "Sakhir": {"name": "Bahrain International Circuit (Sakhir)", "country": "Bahrain", "aliases": "sakhir,bahrain"},
    "SaoPaulo": {"name": "Autódromo José Carlos Pace (Interlagos)", "country": "Brazil", "aliases": "saopaulo,sao_paulo,interlagos,brazil"},
    "Sepang": {"name": "Sepang International Circuit", "country": "Malaysia", "aliases": "sepang,malaysia"},
    "Shanghai": {"name": "Shanghai International Circuit", "country": "China", "aliases": "shanghai,china"},
    "Silverstone": {"name": "Silverstone Circuit", "country": "Great Britain", "aliases": "silverstone,great_britain,uk"},
    "Sochi": {"name": "Sochi Autodrom", "country": "Russia", "aliases": "sochi,russia"},
    "Spa": {"name": "Circuit de Spa-Francorchamps", "country": "Belgium", "aliases": "spa,spa_francorchamps,belgium"},
    "Spielberg": {"name": "Red Bull Ring (Spielberg)", "country": "Austria", "aliases": "spielberg,red_bull_ring,austria"},
    "Suzuka": {"name": "Suzuka International Racing Course", "country": "Japan", "aliases": "suzuka,japan"},
    "YasMarina": {"name": "Yas Marina Circuit (Abu Dhabi)", "country": "UAE", "aliases": "yasmarina,yas_marina,abu_dhabi,uae"},
    "Zandvoort": {"name": "Circuit Zandvoort", "country": "Netherlands", "aliases": "zandvoort,netherlands,dutch"},
}


def sanitize_track_id(filename_stem: str) -> str:
    if filename_stem == "IMS":
        return "ims"
    clean = re.sub(r"(?<!^)(?=[A-Z])", "_", filename_stem).lower()
    return clean.replace("-", "_")


def extrude_closed_boundaries(
    x: np.ndarray,
    z: np.ndarray,
    w_left: np.ndarray,
    w_right: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Computes closed-loop normal boundary extrusions per Spec §3.1:
      dx = (x[i+1] - x[i-1]) / 2 (cyclic)
      dz = (z[i+1] - z[i-1]) / 2 (cyclic)
      nx = -dz / L
      nz =  dx / L
      bound_left  = (x - w_left * nx,  z - w_left * nz)
      bound_right = (x + w_right * nx, z + w_right * nz)
    """
    n = len(x)
    dx = (np.roll(x, -1) - np.roll(x, 1)) / 2.0
    dz = (np.roll(z, -1) - np.roll(z, 1)) / 2.0
    length = np.hypot(dx, dz)
    zero_mask = length < 1e-9
    length[zero_mask] = 1.0
    dx[zero_mask] = 1.0
    dz[zero_mask] = 0.0

    nx = -dz / length
    nz = dx / length

    b_left_x = x - w_left * nx
    b_left_z = z - w_left * nz
    b_right_x = x + w_right * nx
    b_right_z = z + w_right * nz

    return b_left_x, b_left_z, b_right_x, b_right_z


def process_track_csv(csv_path: Path) -> Dict:
    stem = csv_path.stem
    track_id = sanitize_track_id(stem)
    meta = TRACK_CATALOG.get(stem, {
        "name": f"{stem} Circuit",
        "country": "International",
        "aliases": track_id
    })

    with open(csv_path, "r", encoding="utf-8") as f:
        rows = [r for r in csv.reader(f) if len(r) >= 4 and not r[0].startswith("#")]

    if len(rows) < 10:
        raise ValueError(f"Insufficient rows in {csv_path}: {len(rows)}")

    x = np.array([float(r[0]) for r in rows], dtype=np.float64)
    # Physical ground plane alignment: TUMFTM +y_m (North) corresponds to F1 25 game -Z (South)
    z = -np.array([float(r[1]) for r in rows], dtype=np.float64)
    w_right = np.array([float(r[2]) for r in rows], dtype=np.float64)
    w_left = np.array([float(r[3]) for r in rows], dtype=np.float64)

    # Calculate closed boundaries
    b_left_x, b_left_z, b_right_x, b_right_z = extrude_closed_boundaries(x, z, w_left, w_right)

    # Cumulative distance along centerline
    diffs = np.hypot(np.diff(x), np.diff(z))
    total_length = float(np.sum(diffs))

    # All coordinates for bounding box
    all_x = np.concatenate([x, b_left_x, b_right_x])
    all_z = np.concatenate([z, b_left_z, b_right_z])

    geom = {
        "track_id": track_id,
        "track_name": meta["name"],
        "country": meta.get("country", ""),
        "aliases": [a.strip() for a in meta.get("aliases", track_id).split(",")],
        "is_fallback": False,
        "total_length_m": round(total_length, 2),
        "origin": {"x": float(x[0]), "z": float(z[0])},
        "bounds": {
            "min_x": float(np.min(all_x)),
            "max_x": float(np.max(all_x)),
            "min_z": float(np.min(all_z)),
            "max_z": float(np.max(all_z)),
        },
        "centerline": [{"x": round(float(cx), 3), "z": round(float(cz), 3)} for cx, cz in zip(x, z)],
        "bound_left": [{"x": round(float(lx), 3), "z": round(float(lz), 3)} for lx, lz in zip(b_left_x, b_left_z)],
        "bound_right": [{"x": round(float(rx), 3), "z": round(float(rz), 3)} for rx, rz in zip(b_right_x, b_right_z)],
    }
    return geom


def prerender_all_tracks():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_files = sorted(TRACKS_CSV_DIR.glob("*.csv"))
    print(f"Discovered {len(csv_files)} track CSV files in {TRACKS_CSV_DIR}")

    manifest: List[Dict] = []

    for csv_file in csv_files:
        try:
            geom = process_track_csv(csv_file)
            out_file = OUTPUT_DIR / f"{geom['track_id']}.json"
            out_file.write_text(json.dumps(geom, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
            
            manifest.append({
                "track_id": geom["track_id"],
                "track_name": geom["track_name"],
                "country": geom["country"],
                "total_length_m": geom["total_length_m"],
                "aliases": geom["aliases"],
            })
            print(f"  [OK] Pre-rendered {geom['track_id']}.json ({geom['track_name']} - {geom['total_length_m']}m)")
        except Exception as e:
            print(f"  [ERROR] Failed to process {csv_file.name}: {e}")

    # Write manifest
    manifest_file = OUTPUT_DIR / "tracks_manifest.json"
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSuccessfully pre-rendered {len(manifest)} tracks! Manifest written to {manifest_file}")


if __name__ == "__main__":
    prerender_all_tracks()
