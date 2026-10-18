# TASKS.md — ApexGuard Implementation Plan

Sequential checklist of implementation steps. Refer to `PROJECT_SPEC_V2_GENERIC.md` for architectural contracts, formulas, and visual specifications.

> [!IMPORTANT]
> **Validation Philosophy**: The verification steps listed below are **dynamic validations of implemented features**, NOT hardcoded tests or synthetic test suites. Never create hardcoded test fixtures with expected mock answers. Validate by running the actual components against real telemetry data files and verifying dynamic runtime behavior.

---

## Phase 1: Ingestion & Track Pre-Rendering

- [x] **1.1 Track Geometry Loader (`backend/app/ingest/track_loader.py`)**
  - Parse 4-column surveyed CSVs (`x_m, y_m, w_tr_right_m, w_tr_left_m`). *(See Spec §3.1)*
  - Extrude normal boundaries into pre-rendered JSON caches in `backend/app/data/tracks/`. *(See Spec §3.2)*
  - Implement origin-locked universal fallback corridor along Car A line when track is missing or misaligned. *(See Spec §3.3)*

- [x] **1.2 Multi-Car Telemetry Ingestion (`backend/app/ingest/ingest_service.py`)**
  - Parse metadata from lines 1–7 dynamically; map channels to canonical $(X_{\text{world}}, Z_{\text{world}})$. *(See Spec §2.2, §2.3)*
  - Resample streams onto a synchronized 20Hz timeline grid. *(See Spec §2.4)*
  - Compute Euclidean separation $d(t)$ ($v > 50\text{ km/h}$) and flag all incident proximity minima ($< 4.0\text{m}$) as interactive timeline markers. *(See Spec §2.4)*

- [x] **1.3 Ingestion API Endpoint (`backend/app/main.py`)**
  - Implement `POST /api/ingest` accepting dual CSV uploads and returning the normalized session state JSON. *(See Spec §1.2, §2.1)*

### Feature Validation Steps (Live Feature Verification, Not Hardcoded Tests):
1. **Track Pre-Rendering**: Execute `track_loader.py` against `reference_track_geometry.csv`. Verify that boundary JSON caches are generated with valid extruded coordinate arrays and no NaN values.
2. **Fallback Corridor Verification**: Test loading telemetry with an uncataloged circuit name or $>50\text{m}$ offset. Verify that the fallback asphalt corridor extrudes correctly along Car A's trajectory, anchored at $t=0$.
3. **Telemetry Ingestion**: Send dual real CSV files (`materiale/testCases/#2/`) to `POST /api/ingest`.
4. **Payload Inspection**: Validate that the returned JSON contains dynamically extracted driver names (not hardcoded), synchronized 20Hz frames, valid world $(X, Z)$ coordinates, and correctly identified incident timeline markers ($d(t) < 4.0\text{m}$).

---

## Phase 2: Physics Calculus & Governance Pipeline

- [x] **2.1 Layer 1 Kinematic Engine (`backend/app/layer1_math/`)**
  - Compute relative motion vectors: closing velocity ($v_{\text{close}}$), lateral convergence ($v_{\text{lat}}$), overlap ratio, and contact impulses. *(See Spec §6)*
  - Output structured `IncidentStateVector` with breach categorization. *(See Spec §6)*

- [x] **2.2 Layer 2 Rulebook Gating (`backend/app/layer2_gatekeeper/`)**
  - Evaluate `IncidentStateVector` against active rulebook JSON using Strands Decider 2B. *(See Spec §6)*
  - Implement local deterministic fallback evaluator for offline execution when credentials are not present. *(See Spec §1, §6)*

- [x] **2.3 Layer 3 Judicial Steward (`backend/app/layer3_steward/`)**
  - Generate formal FIA Stewards' Decision Document using Amazon Bedrock for actionable breaches. *(See Spec §6)*
  - Implement local template fallback for offline operation. *(See Spec §1, §6)*

- [x] **2.4 Governance API Endpoints (`backend/app/main.py`)**
  - Expose `/api/telemetry/analyze`, `/api/triage`, and `/api/bulletin`. *(See Spec §1.2)*

### Feature Validation Steps (Live Feature Verification, Not Hardcoded Tests):
1. **Kinematics Calculation**: Pass the ingested 20Hz slice through Layer 1. Verify that $v_{\text{close}}$, $v_{\text{lat}}$, chassis overlap, and minimum separation are calculated dynamically from physical vectors.
2. **Breach Classification**: Validate that the kinematic state vector correctly identifies the encounter pattern (e.g. `REAR_END_SHUNT` for the Brazil turn 4 rear contact where along-track separation $< 1.0\text{m}$).
3. **Rulebook Gating & Fallback**: Call Layer 2 with and without API keys. Validate that both cloud Strands 2B (if key present) and the local offline rulebook evaluator correctly flag the infraction and attribute fault.
4. **Stewards' Decision Generation**: Call Layer 3 with and without Bedrock credentials. Validate that an official, structured FIA Stewards' Decision document is generated, citing the proper regulatory articles and dynamic session details.

---

## Phase 3: 2D Forensic Radar Component

- [x] **3.1 Canvas Setup & Direct Projection (`frontend/components/TrackRadar2D.tsx`)**
  - Hardware-accelerated 2D canvas at 60 FPS using direct $(X_{\text{world}}, Z_{\text{world}})$ world projection. *(See Spec §4.1)*
  - Dynamic bounding-box auto-zoom centered on active incident coordinates. *(See Spec §4.1)*

- [x] **3.2 Visual Rendering Layers**
  - Render dark asphalt fill with crisp $1.5\text{px}$ track boundary lines. Zero highway centerlines. *(See Spec §4.1.1)*
  - Draw scaled car silhouettes ($5.6\text{m} \times 2.0\text{m}$) with front axle line and heading yaw vector. *(See Spec §4.1.2)*
  - Render dual-layer trajectories: full semi-transparent guideline + vibrant 2-second motion tail. *(See Spec §4.1.3)*

- [x] **3.3 Anti-Collision Driver Labels**
  - Position driver pill badges on interior/exterior sides based on corner geometry to prevent overlap. *(See Spec §4.1.4)*

- [x] **3.4 Global Timeline Scrubber Integration**
  - Link scrubber controls directly to car positions, tails, and separation readouts. *(See Spec §2.4, §4.1)*

### Feature Validation Steps (Live Feature Verification, Not Hardcoded Tests):
1. **Visual Projection & Scale**: Run the frontend (`npm run dev`) and load an incident session into `TrackRadar2D`. Verify that the track and cars render in real meters without geometric distortion.
2. **Bounding Box Auto-Zoom**: Scrub through different phases of the incident. Confirm the camera automatically frames and scales around the competing cars.
3. **Chassis & Trajectory Rendering**: Check that cars render as scaled silhouettes with visible front axles and heading vectors. Confirm the 2-second dynamic motion tail fades smoothly behind each car.
4. **Anti-Collision Labels**: Observe label badges during close proximity. Confirm the inside car badge renders toward the interior and the outside car badge renders toward the exterior, avoiding visual overlap.
5. **Timeline Responsiveness**: Drag the timeline slider and verify 60 FPS update of car positions, heading angles, and separation metrics.

---

## Phase 4: Dashboard Workbench & Video Synchronization

- [x] **4.1 Modular Tab Navigation & Dynamic Layout (`frontend/app/page.tsx`)**
  - Default mode (3 tabs: `Forensic Radar 2D`, `Telemetry Studio`, `FIA Bulletin`) expanding to full width (`grid-cols-3`). *(See Spec §7.2)*
  - Video mode (4 tabs: adds `Broadcast Footage`) when video is attached (`grid-cols-4`). *(See Spec §7.2)*
  - Apply clean engineering copy across all UI elements (zero marketing slop). *(See Spec §1.1)*

- [x] **4.2 Synchronized Broadcast Footage Player**
  - HTML5 video player locked 1:1 to global telemetry scrubber with Sync Offset Nudge (`[-0.2s] [0.0s] [+0.2s]`). *(See Spec §4.2, §7.2)*

- [x] **4.3 Telemetry Studio Curves (`frontend/components/TelemetryCurves.tsx`)**
  - Synchronized multi-series charts for speed, throttle, brake, steering, and G-forces. *(See Spec §5)*

- [x] **4.4 Ingest Modal & Sample File Loading**
  - Dual CSV drag-and-drop modal with `[Add Footage: ON/OFF]` switch. *(See Spec §4.2)*
  - Quick-action buttons to load local sample CSVs via the real ingestion API. *(See Spec §8)*

### Feature Validation Steps (Live Feature Verification, Not Hardcoded Tests):
1. **Dynamic Tab Layout**: Load a session without video. Confirm the UI renders exactly 3 tabs consuming the full horizontal width (`grid-cols-3`) with no empty slots.
2. **Video Mode Adaptation**: Attach a sample video clip via the modal. Verify the tab bar dynamically reorganizes into 4 tabs (`grid-cols-4`) and reveals the "Broadcast Footage" player.
3. **1:1 Video Synchronization**: Scrub the global timeline slider. Confirm the HTML5 video playback cursor tracks in lockstep with the 2D radar and telemetry charts.
4. **Sync Offset Nudge**: Click the `[-0.2s]` and `[+0.2s]` nudge buttons. Confirm the video frame shifts relative to the telemetry timeline while maintaining lockstep playback.
5. **Multi-Channel Curves**: Verify that the Telemetry Studio charts render synchronized crosshairs matching the active scrubber timestamp across speed, throttle, brake, steering, and G-forces.
6. **Real Ingest Action**: Click "Load Sample Incident" and verify the files pass through the live `/api/ingest` endpoint rather than loading pre-baked static mock data.
