# ApexGuard — Architecture & Engineering Specification (Generic / Production Contract)
**Motorsport Telemetry Incident Review & Rulebook Governance Platform**

---

## 1. Executive Summary & Core Philosophy

ApexGuard is a **deterministic, data-driven telemetry review platform**. It contains **no hardcoded presets, no fake incident fixtures, and no driver/turn-specific branching logic**.

### Core Tenets:
1. **Generic Contract**: The engine accepts standard 2-car telemetry files. Driver identities, teams, circuit geometries, and incident moments are calculated directly from raw data.
2. **Direct 2D World Projection**: Renders physical $(x, z)$ coordinates directly onto an HTML5 canvas in meters. Bounding box and camera zoom center automatically around the cars.
3. **Automated Incident Slicing**: The incident moment is detected by calculating the minimum distance between cars, not using hardcoded timestamps.
4. **Three-Step Review Pipeline**:
   * **Step 1 (Physics Math)**: Vector calculations in $< 4\text{ms}$ (overlap percentage, braking point delta, lateral/longitudinal gap).
   * **Step 2 (Fast Policy Gating via Strands Decider 2B)**: Fast rulebook evaluation in $\approx 115\text{ms}$ ($0.0001/call) to separate benign racing from actionable rule breaches.
   * **Step 3 (Document Generation via Amazon Bedrock)**: Generates a formal FIA Stewards' Decision document when an actionable breach occurs.
   * **Offline Resilient**: Built-in local fallbacks so the app runs smoothly without cloud API keys.

### 1.1 UI Copy & Tone: Clean Technical Wording (Zero Marketing Slop)
All UI labels, tooltips, tab titles, and modal headers must use **down-to-earth, professional engineering and stewarding language**. 

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              UI WORDING GUIDELINES                                     │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│ ❌ PREVENT SLOP / PRETENTIOUS BUZZWORDS    │ ✅ USE CLEAN, DIRECT TECHNICAL TERMS       │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ "AI-Enhanced Ingestion Studio"            │ "Upload Telemetry (CSV)"                   │
│ "Cognitive Multi-Tier Governance Engine"  │ "Review Pipeline (Math -> Gating -> Doc)"  │
│ "Deep Forensic Neural Arbiter"            │ "Rulebook Gating (Strands 2B)"             │
│ "Automated Synaptic Bulletin Generation"  │ "Stewards' Decision Document"              │
│ "Real-time Heuristic Ribbon Extrusion"    │ "Track Limits & Boundaries"                │
│ "Multi-Dimensional Vector Deliberation"   │ "Incident Metrics (Overlap, Speed, Gap)"   │
│ "Predictive Collision Telepathy"          │ "Car Separation / Distance"                │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

### 1.2 Technology Stack & Execution Environment

ApexGuard is a modern full-stack web application with a decoupled polyglot monorepo architecture:

* **Frontend (`/frontend`)**:
  - **Framework**: Next.js 15 (App Router, React 19, TypeScript).
  - **Styling**: Tailwind CSS (Clean Minimalist slate/cream tokens from UI/UX Pro Max).
  - **Icons**: Lucide React.
  - **Charts**: Recharts for synchronized multi-channel telemetry curves.
  - **Visualizer**: Pure HTML5 `<canvas>` (2D Context, hardware-accelerated, zero heavy 3D engine overhead).
  - **Dev Server**: Run from `/frontend` via `npm run dev` (Runs on `http://localhost:3000`).

* **Backend (`/backend`)**:
  - **Framework**: FastAPI (Python 3.11+ / Uvicorn).
  - **Scientific Math**: NumPy (Layer 1 physics calculus & 20Hz vector resampling).
  - **LLM Integration**: Boto3 (Amazon Bedrock) + Strands Decider Client (with local mock fallbacks).
  - **Dev Server**: Run from workspace root via `uvicorn backend.app.main:app --reload --port 8000` (Runs on `http://localhost:8000`).

* **API Communication Contract**:
  - Frontend communicates with FastAPI via standard JSON REST endpoints (`/api/ingest`, `/api/telemetry/analyze`, `/api/triage`, `/api/bulletin`).

---

## 2. Telemetry Schema & Generic Ingestion Contract

### 2.1 File Inputs & Canonical Reference Telemetry
The ingestion endpoint accepts two arbitrary CSV files (`Car_A.csv` and `Car_B.csv`).

> [!NOTE] **Local Canonical Telemetry Reference File**  
> Situated in the root workspace directory alongside this specification is a canonical example file:  
> `reference_lap_telemetry.csv` (e.g. recorded lap from the F1 Telemetry Tool).  
> Developers and AI agents must consult this local file as the **ground-truth structural definition** for the 7 metadata header rows and the subsequent time-series columns. Note that this file serves purely as a structural format contract; the system must remain completely decoupled from specific driver names, tracks, or laptimes contained within it.

### 2.2 Dynamic Metadata Extraction (Lines 1–7)
The parser dynamically reads the file header without hardcoded string matching:
* **Driver Identifier**: Extracted from Line 1, Field 3 (Fallback: `"Competitor A"` / `"Competitor B"`).
* **Track Identifier**: Extracted from Line 3, Field 4 (Fallback: `"Custom Circuit"`).
* **Vehicle / Team**: Extracted from Line 3, Field 5 (Fallback: `"Vehicle A"` / `"Vehicle B"`).
* **Reference Laptime**: Extracted from Line 3, Field 7 (Fallback: maximum elapsed time).

### 2.3 Coordinate System Standardization & Telemetry Channel Mapping
To prevent coordinate mismatches between game 3D physics engines and 2D track databases, the system establishes a **Canonical Ground Plane**:
$$\text{Horizontal Track Plane} = (X_{\text{world}}, Z_{\text{world}})$$

* **In Telemetry CSVs**:
  * `x [m]` | `x` $\rightarrow$ maps to $X_{\text{world}}$ (horizontal axis).
  * `z [m]` | `z` $\rightarrow$ maps to $Z_{\text{world}}$ (horizontal axis).
  * `y [m]` | `y` (vertical elevation) $\rightarrow$ discarded for 2D horizontal radar mapping.
* **In Track CSVs (TUMFTM)**:
  * `x_m` $\rightarrow$ maps to $X_{\text{world}}$.
  * `y_m` $\rightarrow$ maps directly to $Z_{\text{world}}$.
* **Other Telemetry Channels**:
  * Timestamp: `laptime [s]` | `laptime` | `time` $\rightarrow$ `time`
  * Distance: `lapdistance [m]` | `distance` $\rightarrow$ `distance_m`
  * Speed: `speed [km/h]` | `speed [m/s]` (auto-converted to km/h) $\rightarrow$ `speed_kmh`
  * Inputs: `throttle [%]` | `throttlepercentage [%]`, `brake [%]` | `brakepercentage [%]`, `steer [%]`
  * Accelerations: `glat [G]` | `gforcelatitudinal [g]`, `glon [G]` | `gforcelongitudinal [g]`

### 2.4 Deterministic Processing & Multi-Incident Discovery
Rather than arbitrarily locking onto a single moment, the pipeline filters non-racing states and flags all battles across the timeline:

```
[ User Uploads Car_A.csv + Car_B.csv ]
                   │
                   ▼
1. Extract dynamic metadata from headers (No hardcoded driver/team lookups)
                   │
                   ▼
2. Resample both streams onto unified 20Hz timeline grid (t_0 to t_end)
                   │
                   ▼
3. Continuous Separation Analysis:
   - Filter out stationary/pit periods: evaluate only where both cars have speed > 50 km/h
     (prevents grid-start formation slots from falsely triggering as collisions)
   - Compute Euclidean separation: d(t) = sqrt((x_A(t) - x_B(t))^2 + (z_A(t) - z_B(t))^2)
   - Identify candidate incident peaks (local proximity minima where d(t) < 4.0m)
                   │
                   ▼
4. Output Session State with Incident Timeline Markers:
   - Mark all detected close encounters along the global timeline scrubber
   - Default active slice: the incident with minimum clearance [t_incident - 4.0s, t_incident + 4.0s]
   - Allow user to click any timeline marker to switch the active incident focus
```

---

## 3. Generic Track Database & Pre-Rendered Caching Architecture

Located in `backend/app/data/tracks/`:

> [!NOTE] **Local Canonical Track Reference File**  
> Situated in the root workspace directory alongside this specification is a canonical example file:  
> `reference_track_geometry.csv` (e.g. surveyed track centerline and boundary widths).  
> This file demonstrates the exact 4-column layout (`x_m, y_m, w_tr_right_m, w_tr_left_m`). Note that the track reference and the telemetry reference need not belong to the same circuit; they are standalone format blueprints.

1. **Track Construction from Surveyed CSV Files**:
   * Tracks are constructed directly from standard 4-column CSV definitions: `# x_m, y_m, w_tr_right_m, w_tr_left_m`.
   * Outer and inner boundaries are calculated via unit normal extrusion along the centerline:
     $$n_x = \frac{-\Delta z}{L}, \quad n_z = \frac{\Delta x}{L}$$
     $$\text{bound}_{\text{left}} = (x - w_{\text{left}} \cdot n_x,\; z - w_{\text{left}} \cdot n_z)$$
     $$\text{bound}_{\text{right}} = (x + w_{\text{right}} \cdot n_x,\; z + w_{\text{right}} \cdot n_z)$$
2. **Pre-Rendered Geometry Caching for High Efficiency**:
   * For maximum runtime efficiency during development and live usage, circuit boundary polygons and cumulative distance splines are parsed and pre-rendered into lightweight, indexed geometry caches (`.json` / binary cache).
   * When an incident is loaded, the visualizer retrieves the pre-rendered geometry instantly without re-parsing large CSV files on every frame.
3. **Registration & Origin-Locked Universal Fallback**:
   * If an uploaded session references an uncataloged circuit or if the surveyed track origin drifts $> 50\text{m}$ from the telemetry coordinates, the visualizer activates the universal fallback:
   * **Origin-Locked Driven Corridor**: The visualizer extrudes a uniform asphalt ribbon ($\pm 6.0\text{m}$) along the driven racing line of Car A, **strictly anchored at the exact point where the telemetry lap begins ($t=0$, lapdistance $=0$)**. This guarantees that the circuit start matches the lap start and cars are never orphaned in empty space.

---

## 4. Generic 2D Visualizer Component (`TrackRadar2D.tsx`) & Synchronized Footage

### 4.1 Architecture, Visual Style & Rendering Specifications

The 2D visualizer is an unencumbered, high-precision visual tool. All dense telemetry readouts (speed, delta, G-forces) live in the sidebar and bottom charts to keep the track view 100% clean and readable.

#### 1. Track Limits & Asphalt Surface
* **Asphalt Surface**: Dark asphalt polygon fill (`#1E293B` or `#141A26`) directly constructed from pre-rendered track boundary coordinates.
* **Track Limits**: Solid, crisp white boundary lines ($1.5\text{px}$ width) marking the left and right asphalt edges.
* **No Road Markings**: Strictly **no dashed/discontinued centerlines** — this is an authentic race circuit, not a public highway.

#### 2. Scaled Vehicle Silhouettes & Proportions
Cars are drawn as **true-to-scale physical silhouettes** rather than simple dots:
* **Physical Dimensions**: Scaled rectangle matching real regulations ($\approx 5.6\text{m}$ length $\times 2.0\text{m}$ width).
* **Front Axle & Direction Indicator**:
  * A clear front axle line drawn across the chassis width.
  * A forward-facing direction arrow / yaw vector pointing along the car's instantaneous heading:
    $$\theta_{\text{heading}} = \operatorname{atan2}(\Delta z, \Delta x)$$
* **Chassis Fill & Contrast**:
  * Car A: Solid fill using `Theme.competitorA` with a distinct outline.
  * Car B: Solid fill using `Theme.competitorB` with a distinct outline.

#### 3. Trajectory Lines & Motion Tails
* **Full Faded Line**: The complete recorded driving path over the incident window is drawn as a semi-transparent, subtle guideline (`opacity: 0.25`).
* **Active 2-Second Motion Tail**: A vibrant, high-contrast trailing ribbon covering the car's most recent 2.0 seconds of motion, fading smoothly toward the rear. This clearly visualizes the dynamic braking, turn-in arc, and lateral drift into the corner.

#### 4. Collision-Free Dynamic Driver Labels
During wheel-to-wheel combat, standard label tags often overlap and become unreadable. ApexGuard solves this with **geometric offset positioning**:
* **Interior vs. Exterior Offset**:
  * The car positioned closer to the inside of the active corner (determined by curvature sign or lateral track offset) renders its label on its **interior side**.
  * The car on the outside renders its label on its **exterior side**.
* **Label Content**: Clean, compact pill containing `[Driver Name | Car Number]` rendered in `JetBrains Mono` ($10\text{px}$) with an unobtrusive leader line. Labels never occlude the opponent car or the contact point.

### 4.2 "Add Footage" Switch, 1:1 Sync & Nudge Offset
* **Upload Modal Switch**:
  * In the incident upload modal, a clean toggle switch labeled **`[Add Footage: ON / OFF]`** allows the user to optionally attach a recorded MP4/WebM video clip of the incident.
* **Deterministic 1:1 Timeline Synchronization**:
  * When footage is attached, the visualizer links the HTML5 `<video>` element directly to the global timeline scrubber:
    $$\text{video.currentTime} = (t_{\text{scrubber}} - t_{\text{incident\_start}}) + t_{\text{offset}}$$
* **Sync Offset Nudge Control**:
  * Because human screen recorders rarely start at frame zero of the telemetry window, the video player UI includes a subtle **Sync Offset Nudge** (`[-0.2s] [0.0s] [+0.2s]` or slider) to achieve frame-perfect alignment between visual car contact and telemetry spikes.
  * When `Add Footage` is OFF, the visualizer operates in pure radar mode with zero performance overhead.

---

## 5. Synchronized Telemetry Curves (`TelemetryCurves.tsx`)

Generic multi-series plotting component connected to the global time scrubber:
* **Series 1**: Speed comparison ($v_A(t)$ vs. $v_B(t)$) with delta indicator.
* **Series 2**: Driver control inputs (Throttle and Brake percentages).
* **Series 3**: Steering angle and Longitudinal/Lateral G-forces.
* Labels and legend dynamically display the names parsed from the files.

---

## 6. The Three-Layer Governance Pipeline

```
[ Ingested Session Data ]
           │
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 1: Deterministic Physics Math (< 4ms, $0)                        │
│ • Pure Kinematic Relative Motion Vectors (No Corner Assumptions):       │
│   1. Relative Longitudinal Motion (Closing Velocity):                  │
│      v_close = d/dt(dist_defender - dist_attacker)                     │
│      - If along-track gap < 1.0m & lateral gap < 1.5m -> REAR_END_SHUNT│
│   2. Relative Lateral Convergence (Squeeze Rate):                      │
│      v_lat = d/dt(lateral_clearance)                                   │
│      - If overlap >= 30% & lateral room closing < 2.0m -> CROWD_SQUEEZE│
│      (Valid on straights, high-speed kinks, and low-speed hairpins)    │
│   3. Overlap Gating:                                                   │
│      - Ratio of alongside length: (L_chassis - delta_s) / L_chassis     │
│      - If overlap < 50% & high approach speed delta -> APEX_DIVEBOMB   │
│   4. Contact Detection:                                                │
│      - Euclidean center separation < 2.0m (chassis boundary breach)    │
│      - G-force vector spike (sudden d/dt(glon, glat) impulse)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Outputs: IncidentStateVector
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 2: Strands Decider 2B Policy Engine (~115ms)                     │
│ • Evaluates State Vector against active Rulebook JSON                  │
│ • Gating decision: RACING_INCIDENT vs INFRINGEMENT                    │
│ • Fault attribution: COMPETITOR_A / COMPETITOR_B / 5050                │
│ • Assigns specific rulebook breach category                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ If Actionable Infringement
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 3: Amazon Bedrock Judicial Steward (~1.5s)                       │
│ • Formats formal legal bulletin from structured prompt                 │
│ • Injects dynamic driver names, track, and timestamps                  │
│ • Cites applicable articles from the active rulebook                   │
│ • Issues penalty points and formal time penalties                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. UI/UX Pro Max Architecture & Theming

### 7.1 Visual Aesthetic: Clean Minimalist / Modern Judicial
* **Deep Base**: `#0F172A` (Midnight Slate) anchor.
* **Surfaces**: Soft cream and warm slate palettes (`#F8F9FA` / `#1E293B`) ensuring zero eye strain.
* **Typography**: Geometric display font (`Inter` / `Space Grotesk`) paired with tabular monospace (`JetBrains Mono`) for all coordinates, times, and metrics.
* **Borders**: Crisp $1\text{px}$ architectural borders (`rgba(255, 255, 255, 0.1)`).

### 7.2 Interconnected Modular Tabs & Dynamic Footage Arrangement

The tab navigation responds dynamically to the presence of incident video footage:

```
[ Default Mode (No Footage Attached) — 3 Tabs Expand to Fill Space ]
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│     Forensic Radar 2D         │       Telemetry Studio        │       FIA Bulletin            │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘

[ Video Footage Mode (Footage Attached) — 4 Tabs Dynamically Rearranged ]
┌───────────────────────┬───────────────────────┬───────────────────────┬───────────────────────┐
│   Broadcast Footage   │   Forensic Radar 2D   │   Telemetry Studio    │   FIA Bulletin        │
│    (1:1 Time Lock)    │  (Direct Projection)  │ (Synchronized Curves) │   (Official Verdict)  │
└───────────────────────┴───────────────────────┴───────────────────────┴───────────────────────┘
```

1. **Conditional Tab Visibility**:
   * **When `has_video === false` (Standard Telemetry)**:
     * The **"Broadcast Footage"** tab is completely removed from the DOM.
     * The remaining 3 tabs (`Forensic Radar 2D`, `Telemetry Studio`, `FIA Bulletin`) automatically expand responsively (`grid-cols-3` or flex-1) to consume the full available horizontal space without awkward empty gaps.
   * **When `has_video === true` (Footage Uploaded)**:
     * The tab bar smoothly recalculates into a 4-tab modular layout (`grid-cols-4`).
     * The dedicated **"Broadcast Footage"** tab appears as Tab 1 (or split view).
2. **Tab 1: Broadcast Footage View (When Video Exists)**:
   * Displays the uploaded MP4/WebM video in a clean, cinematic dark-slate player.
   * **Zero Playback Desync**: The HTML5 `<video>` time is bound 1:1 to the global timeline scrubber. Scrubbing the timeline slider scrubs the video; pressing spacebar plays both the video and the telemetry simultaneously.
3. **Tab 2: Forensic Radar 2D**: Direct-projection canvas with dynamic bounding-box auto-zoom, physical asphalt limits, and competitor trajectory ribbons.
4. **Tab 3: Telemetry Studio**: Full-width multi-channel graphs (Speed, Brake, Throttle, Steering, G-forces) linked to the global scrubber.
5. **Tab 4: FIA Bulletin**: Print-ready, formal judicial document rendering the Layer 3 verdict.

## 8. Demo & Testing Strategy (No Presets in Source Code)

* **No Hardcoded Fixtures in Code**: The application code contains zero embedded incident scenarios.
* **File-Based Sample Ingestion**:
  * The repository includes a `sample_data/` folder containing pairs of real recorded CSVs.
  * In the UI, clicking "Load Sample Incident" simply invokes the standard `/api/ingest` upload pipeline using the files on disk, ensuring 100% of testing passes through the real ingestion code.
