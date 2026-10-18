"""
Track Geometry Loader and Extrusion Engine for ApexGuard.
Implements surveyed 4-column CSV parsing, normal boundary extrusion,
pre-rendered caching, and origin-locked universal fallback corridor generation.
(See Spec §3.1, §3.2, §3.3)
"""

import os
import csv
import json
import re
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any
import numpy as np

from backend.app.ingest.schemas import TrackGeometry, TrackBounds, Point2D

DEFAULT_TRACKS_DIR = Path(__file__).resolve().parent.parent / "data" / "tracks"


def sanitize_track_id(name: str) -> str:
    """Sanitize track name into canonical track_id (e.g. 'Brazil Interlagos' -> 'brazil_interlagos')."""
    clean = re.sub(r"[^\w\s-]", "", name).strip().lower()
    return re.sub(r"[-\s]+", "_", clean) or "custom_circuit"


def calculate_normal_boundaries(
    x: np.ndarray,
    z: np.ndarray,
    w_left: np.ndarray,
    w_right: np.ndarray,
    is_closed: bool = True
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Extrudes left and right track boundaries using 2D unit normal vectors.
    Formulas per Spec §3.1:
      n_x = -Delta z / L
      n_z =  Delta x / L
      bound_left  = (x - w_left * n_x,  z - w_left * n_z)
      bound_right = (x + w_right * n_x, z + w_right * n_z)
    """
    n_points = len(x)
    if n_points < 2:
        raise ValueError("At least 2 points required to extrude boundaries")

    dx = np.zeros(n_points, dtype=np.float64)
    dz = np.zeros(n_points, dtype=np.float64)

    if is_closed and n_points > 2:
        # Central difference with cyclic wrap-around for closed circuit
        dx = (np.roll(x, -1) - np.roll(x, 1)) / 2.0
        dz = (np.roll(z, -1) - np.roll(z, 1)) / 2.0
    else:
        # Open curve: forward diff at start, backward at end, central inside
        dx[0] = x[1] - x[0]
        dz[0] = z[1] - z[0]
        dx[-1] = x[-1] - x[-2]
        dz[-1] = z[-1] - z[-2]
        if n_points > 2:
            dx[1:-1] = (x[2:] - x[:-2]) / 2.0
            dz[1:-1] = (z[2:] - z[:-2]) / 2.0

    length = np.hypot(dx, dz)
    # Avoid division by zero
    zero_mask = length < 1e-9
    length[zero_mask] = 1.0
    dx[zero_mask] = 1.0
    dz[zero_mask] = 0.0

    # Unit normal vector (nx, nz)
    nx = -dz / length
    nz = dx / length

    # Bound coordinates
    b_left_x = x - w_left * nx
    b_left_z = z - w_left * nz
    b_right_x = x + w_right * nx
    b_right_z = z + w_right * nz

    # Ensure no NaN or Inf values
    b_left_x = np.nan_to_num(b_left_x, nan=0.0, posinf=0.0, neginf=0.0)
    b_left_z = np.nan_to_num(b_left_z, nan=0.0, posinf=0.0, neginf=0.0)
    b_right_x = np.nan_to_num(b_right_x, nan=0.0, posinf=0.0, neginf=0.0)
    b_right_z = np.nan_to_num(b_right_z, nan=0.0, posinf=0.0, neginf=0.0)

    return b_left_x, b_left_z, b_right_x, b_right_z


class TrackLoader:
    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or DEFAULT_TRACKS_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def parse_surveyed_csv(self, file_path_or_content: str, track_name: str = "Surveyed Circuit") -> TrackGeometry:
        """
        Parses 4-column surveyed CSV (x_m, y_m, w_tr_right_m, w_tr_left_m)
        Mapping per Spec §2.3:
          x_m -> X_world
          y_m -> Z_world
        Extrudes boundaries and returns structured TrackGeometry.
        """
        lines = []
        if os.path.exists(file_path_or_content):
            with open(file_path_or_content, "r", encoding="utf-8", errors="ignore") as f:
                lines = [line.strip() for line in f if line.strip()]
        else:
            lines = [line.strip() for line in file_path_or_content.strip().splitlines() if line.strip()]

        if not lines:
            raise ValueError("Empty track CSV content")

        # Determine column indexes
        first_line = lines[0]
        col_names = [c.strip().lower() for c in first_line.lstrip("#").split(",")]
        start_row = 1 if any("x" in c or "m" in c for c in col_names) else 0

        # Default standard 4-column indices if no explicit header
        idx_x = 0
        idx_y = 1
        idx_w_right = 2
        idx_w_left = 3

        if start_row == 1:
            for i, c in enumerate(col_names):
                clean = c.replace(" ", "").replace("_", "")
                if clean in ("xm", "x"):
                    idx_x = i
                elif clean in ("ym", "y", "zm", "z"):
                    idx_y = i
                elif "right" in clean:
                    idx_w_right = i
                elif "left" in clean:
                    idx_w_left = i

        xs, zs, w_rights, w_lefts = [], [], [], []
        for line in lines[start_row:]:
            if line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 4:
                continue
            try:
                vx = float(parts[idx_x])
                vy = -float(parts[idx_y])  # Physical ground plane alignment: TUMFTM +y_m (North) is F1 25 -Z (South)
                v_right = float(parts[idx_w_right])
                v_left = float(parts[idx_w_left])

                if np.isnan(vx) or np.isnan(vy):
                    continue

                xs.append(vx)
                zs.append(vy)
                w_rights.append(v_right)
                w_lefts.append(v_left)
            except ValueError:
                continue

        if len(xs) < 3:
            raise ValueError(f"Insufficient valid coordinate rows in track CSV: found {len(xs)}")

        arr_x = np.array(xs, dtype=np.float64)
        arr_z = np.array(zs, dtype=np.float64)
        arr_w_r = np.array(w_rights, dtype=np.float64)
        arr_w_l = np.array(w_lefts, dtype=np.float64)

        # Check if closed circuit (distance between first and last point < 100m)
        is_closed = np.hypot(arr_x[0] - arr_x[-1], arr_z[0] - arr_z[-1]) < 100.0

        b_left_x, b_left_z, b_right_x, b_right_z = calculate_normal_boundaries(
            arr_x, arr_z, arr_w_l, arr_w_r, is_closed=is_closed
        )

        # Cumulative distance along centerline
        step_dist = np.hypot(np.diff(arr_x), np.diff(arr_z))
        total_length = float(np.sum(step_dist))

        # All coordinate bounds
        all_x = np.concatenate([arr_x, b_left_x, b_right_x])
        all_z = np.concatenate([arr_z, b_left_z, b_right_z])
        bounds = TrackBounds(
            min_x=float(np.min(all_x)),
            max_x=float(np.max(all_x)),
            min_z=float(np.min(all_z)),
            max_z=float(np.max(all_z)),
        )

        origin = Point2D(x=float(arr_x[0]), z=float(arr_z[0]))
        centerline = [Point2D(x=round(float(x), 3), z=round(float(z), 3)) for x, z in zip(arr_x, arr_z)]
        bound_left = [Point2D(x=round(float(x), 3), z=round(float(z), 3)) for x, z in zip(b_left_x, b_left_z)]
        bound_right = [Point2D(x=round(float(x), 3), z=round(float(z), 3)) for x, z in zip(b_right_x, b_right_z)]

        track_id = sanitize_track_id(track_name)
        return TrackGeometry(
            track_id=track_id,
            track_name=track_name,
            is_fallback=False,
            total_length_m=round(total_length, 2),
            origin=origin,
            bounds=bounds,
            centerline=centerline,
            bound_left=bound_left,
            bound_right=bound_right,
        )

    def save_cache(self, track: TrackGeometry) -> Path:
        """Saves pre-rendered TrackGeometry to JSON cache."""
        target_path = self.cache_dir / f"{track.track_id}.json"
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(track.model_dump_json(indent=2))
        return target_path

    def load_cache(self, track_id: str) -> Optional[TrackGeometry]:
        """Loads pre-rendered TrackGeometry from JSON cache if exists."""
        clean_id = sanitize_track_id(track_id)
        target_path = self.cache_dir / f"{clean_id}.json"
        if not target_path.exists():
            return None
        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return TrackGeometry.model_validate(data)

    def get_manifest(self) -> List[Dict[str, Any]]:
        """Loads canonical tracks manifest metadata for UI track selection."""
        manifest_path = self.cache_dir / "tracks_manifest.json"
        if not manifest_path.exists():
            return []
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def find_track_id(self, query: Optional[str]) -> Optional[str]:
        """
        Dynamically resolves a circuit identifier or display name against
        canonical track IDs and alias registry.
        """
        if not query:
            return None
        clean_q = sanitize_track_id(query)
        if (self.cache_dir / f"{clean_q}.json").exists():
            return clean_q

        manifest = self.get_manifest()
        for t in manifest:
            tid = t.get("track_id", "")
            if clean_q == tid:
                return tid
            aliases = t.get("aliases", [])
            for alias in aliases:
                clean_alias = sanitize_track_id(alias)
                if clean_q == clean_alias or clean_alias in clean_q or clean_q in clean_alias:
                    return tid
            t_name = sanitize_track_id(t.get("track_name", ""))
            if clean_q in t_name or t_name in clean_q:
                return tid

        return None

    def align_track_to_telemetry(
        self,
        track: TrackGeometry,
        car_x: np.ndarray,
        car_z: np.ndarray,
        car_dist: Optional[np.ndarray] = None
    ) -> TrackGeometry:
        """
        Translates surveyed track coordinates so that its geometric origin
        and path align precisely with the F1 25 world coordinates of the car telemetry.
        Formula:
          shift_x = (min(car_x) + max(car_x))/2 - (min(track_x) + max(track_x))/2
          shift_z = (min(car_z) + max(car_z))/2 - (min(track_z) + max(track_z))/2
          X_aligned = track_x + shift_x,  Z_aligned = track_z + shift_z
        """
        tx = np.array([p.x for p in track.centerline], dtype=np.float64)
        tz = np.array([p.z for p in track.centerline], dtype=np.float64)

        car_span_x = float(np.ptp(car_x))
        car_span_z = float(np.ptp(car_z))
        track_span_x = float(np.ptp(tx))
        track_span_z = float(np.ptp(tz))

        # Check if telemetry spans a substantial part of the circuit (> 30% of each dimension)
        if (track_span_x > 0 and track_span_z > 0 and
                car_span_x > 0.3 * track_span_x and car_span_z > 0.3 * track_span_z):
            shift_x = float((np.min(car_x) + np.max(car_x)) / 2.0 - (np.min(tx) + np.max(tx)) / 2.0)
            shift_z = float((np.min(car_z) + np.max(car_z)) / 2.0 - (np.min(tz) + np.max(tz)) / 2.0)
        elif car_dist is not None and len(car_dist) > 0 and float(car_dist[0]) > 0 and track.total_length_m > 0:
            step_dists = np.hypot(np.diff(tx), np.diff(tz))
            cum_dist = np.insert(np.cumsum(step_dists), 0, 0.0)
            target_d = float(car_dist[0]) % track.total_length_m
            idx = int(np.argmin(np.abs(cum_dist - target_d)))
            shift_x = float(car_x[0] - tx[idx])
            shift_z = float(car_z[0] - tz[idx])
        else:
            shift_x = float(car_x[0] - tx[0])
            shift_z = float(car_z[0] - tz[0])

        aligned_centerline = [
            Point2D(x=round(float(p.x + shift_x), 3), z=round(float(p.z + shift_z), 3))
            for p in track.centerline
        ]
        aligned_bound_left = [
            Point2D(x=round(float(p.x + shift_x), 3), z=round(float(p.z + shift_z), 3))
            for p in track.bound_left
        ]
        aligned_bound_right = [
            Point2D(x=round(float(p.x + shift_x), 3), z=round(float(p.z + shift_z), 3))
            for p in track.bound_right
        ]
        aligned_origin = Point2D(
            x=round(float(track.origin.x + shift_x), 3),
            z=round(float(track.origin.z + shift_z), 3)
        )
        aligned_bounds = TrackBounds(
            min_x=round(float(track.bounds.min_x + shift_x), 3),
            max_x=round(float(track.bounds.max_x + shift_x), 3),
            min_z=round(float(track.bounds.min_z + shift_z), 3),
            max_z=round(float(track.bounds.max_z + shift_z), 3),
        )

        return TrackGeometry(
            track_id=track.track_id,
            track_name=track.track_name,
            is_fallback=False,
            total_length_m=track.total_length_m,
            origin=aligned_origin,
            bounds=aligned_bounds,
            centerline=aligned_centerline,
            bound_left=aligned_bound_left,
            bound_right=aligned_bound_right,
        )

    def build_fallback_corridor(
        self,
        car_a_x: np.ndarray,
        car_a_z: np.ndarray,
        track_name: str = "Fallback Corridor",
        width_m: float = 6.0
    ) -> TrackGeometry:
        """
        Spec §3.3 Origin-Locked Universal Fallback Corridor:
        Extrudes a uniform asphalt ribbon (± 6.0m) along the driven racing line of Car A,
        strictly anchored at the exact point where the telemetry begins (t=0, lapdistance=0).
        Guarantees that the circuit start matches the lap start and cars are never orphaned in empty space.
        """
        n_points = len(car_a_x)
        if n_points < 2:
            raise ValueError("Car A trajectory must have at least 2 points to build fallback corridor")

        if n_points > 1500:
            step = int(np.ceil(n_points / 1200))
            idx = np.arange(0, n_points, step)
            if idx[-1] != n_points - 1:
                idx = np.append(idx, n_points - 1)
            x_pts = car_a_x[idx]
            z_pts = car_a_z[idx]
        else:
            x_pts = car_a_x.copy()
            z_pts = car_a_z.copy()

        w_arr = np.full(len(x_pts), width_m, dtype=np.float64)

        b_left_x, b_left_z, b_right_x, b_right_z = calculate_normal_boundaries(
            x_pts, z_pts, w_arr, w_arr, is_closed=False
        )

        step_dist = np.hypot(np.diff(x_pts), np.diff(z_pts))
        total_length = float(np.sum(step_dist))

        all_x = np.concatenate([x_pts, b_left_x, b_right_x])
        all_z = np.concatenate([z_pts, b_left_z, b_right_z])
        bounds = TrackBounds(
            min_x=float(np.min(all_x)),
            max_x=float(np.max(all_x)),
            min_z=float(np.min(all_z)),
            max_z=float(np.max(all_z)),
        )

        origin = Point2D(x=float(x_pts[0]), z=float(z_pts[0]))
        centerline = [Point2D(x=float(x), z=float(z)) for x, z in zip(x_pts, z_pts)]
        bound_left = [Point2D(x=float(x), z=float(z)) for x, z in zip(b_left_x, b_left_z)]
        bound_right = [Point2D(x=float(x), z=float(z)) for x, z in zip(b_right_x, b_right_z)]

        return TrackGeometry(
            track_id=sanitize_track_id(track_name),
            track_name=track_name,
            is_fallback=True,
            total_length_m=round(total_length, 2),
            origin=origin,
            bounds=bounds,
            centerline=centerline,
            bound_left=bound_left,
            bound_right=bound_right,
        )

    def resolve_track(
        self,
        track_name: str,
        car_a_x: np.ndarray,
        car_a_z: np.ndarray,
        track_id: Optional[str] = None,
        track_csv_path: Optional[str] = None,
        car_a_dist: Optional[np.ndarray] = None,
    ) -> TrackGeometry:
        """
        Resolves track geometry:
        1. If track_id == 'fallback', strictly builds origin-locked ribbon corridor.
        2. If track_csv_path provided, parses and aligns surveyed track CSV.
        3. Looks up track in pre-rendered cache (by track_id or dynamic alias matching).
        4. Aligns the surveyed track origin/coordinates to telemetry.
        5. Validates telemetry overlap; if unknown circuit or verification fails,
           falls back to origin-locked ribbon corridor.
        """
        if track_id == "fallback":
            return self.build_fallback_corridor(car_a_x, car_a_z, track_name=f"{track_name} (Fallback Corridor)")

        track: Optional[TrackGeometry] = None

        if track_csv_path and (os.path.exists(track_csv_path) or len(track_csv_path.splitlines()) > 5):
            track = self.parse_surveyed_csv(track_csv_path, track_name=track_name)
        else:
            resolved_id = track_id if (track_id and track_id != "auto") else self.find_track_id(track_name)
            if resolved_id:
                track = self.load_cache(resolved_id)

        if track is not None:
            aligned_track = self.align_track_to_telemetry(track, car_a_x, car_a_z, car_a_dist)

            # Verification: sample points along Car A to verify alignment (< 35m median deviation)
            tx = np.array([p.x for p in aligned_track.centerline])
            tz = np.array([p.z for p in aligned_track.centerline])
            sample_step = max(1, len(car_a_x) // 30)
            sample_x = car_a_x[::sample_step]
            sample_z = car_a_z[::sample_step]

            sample_dists = [
                float(np.min(np.hypot(tx - sx, tz - sz)))
                for sx, sz in zip(sample_x, sample_z)
            ]
            median_dev = float(np.median(sample_dists))

            if median_dev <= 35.0:
                return aligned_track
            elif track_id and track_id != "auto":
                # Explicit user override
                return aligned_track

        # Fallback corridor along Car A line anchored at t=0
        fallback_name = f"{track_name} (Fallback Corridor)" if track_name else "Driven Corridor"
        return self.build_fallback_corridor(car_a_x, car_a_z, track_name=fallback_name)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="ApexGuard Track Geometry Pre-Renderer")
    parser.add_argument("--csv", required=True, help="Path to 4-column surveyed track CSV")
    parser.add_argument("--name", default=None, help="Track name (default: filename stem)")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"Error: file not found: {csv_path}")
        exit(1)

    t_name = args.name or csv_path.stem.replace("reference_", "").replace("_", " ").title()
    loader = TrackLoader()
    print(f"Parsing surveyed track geometry: {csv_path} as '{t_name}'...")
    geom = loader.parse_surveyed_csv(str(csv_path), track_name=t_name)
    saved_path = loader.save_cache(geom)
    print(f"Successfully extruded track limits! Cached to: {saved_path}")
    print(f"  Length: {geom.total_length_m}m | Points: {len(geom.centerline)}")
    print(f"  Bounds: X [{geom.bounds.min_x:.1f}, {geom.bounds.max_x:.1f}], Z [{geom.bounds.min_z:.1f}, {geom.bounds.max_z:.1f}]")

