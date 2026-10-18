# ApexGuard 🏎️🛡️

> **Deterministic Motorsport Telemetry Incident Review & Rulebook Governance Platform**

ApexGuard is a high-precision, low-latency judicial stewards' review platform designed to ingest multi-car telemetry recordings, compute deterministic kinematic state vectors, evaluate contested on-track encounters against regulatory rulebooks, and automatically synthesize official FIA-compliant Stewards' Decision Documents.

---

## 🌟 Core Architecture

ApexGuard implements a 3-layer deterministic governance pipeline engineered for sub-second incident adjudication:

```
Telemetry CSVs (Car A & Car B) + Surveyed Track Geometry
                      │
                      ▼
 ┌─────────────────────────────────────────────────────────┐
 │ Layer 1: Deterministic Physics Math Engine (< 4ms)      │
 │  • Longitudinal closing speed (km/h)                    │
 │  • Lateral convergence rate (m/s)                       │
 │  • Normalized chassis overlap ratio (%)                 │
 │  • Contact impulse & apex clearance vectors             │
 └────────────────────────────┬────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────┐
 │ Layer 2: Rulebook Gatekeeper & Triage (~115ms)          │
 │  • FIA ISC Appendix L Chapter IV Article 2 compliance   │
 │  • Cloud: Strands Decider 2B                            │
 │  • Offline: Local deterministic rulebook gating         │
 └────────────────────────────┬────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────┐
 │ Layer 3: Judicial Steward Bulletin Generator (~1.5s)   │
 │  • Formal FIA Stewards' Decision Document               │
 │  • Cloud: Amazon Bedrock judicial synthesis             │
 │  • Offline: Local dynamic template engine fallback      │
 └─────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Features

- **Generic Telemetry Ingestion (Spec §2)**: Fully dynamic ingestion for 2+ car CSV recordings without hardcoded presets. Automatically resamples disparate telemetry feeds onto a synchronized 20Hz timeline grid ($t=50\text{ms}$).
- **Continuous Proximity & Incident Discovery**: Evaluates Euclidean separation across the racing lap ($v > 50\text{km/h}$), isolating candidate conflict points ($d < 4.0\text{m}$) and setting the critical window ($\pm 4.0\text{s}$) around the encounter peak.
- **Surveyed Racetrack Geometry Engine (Spec §3)**:
  - **25 Canonical Circuits**: Pre-rendered, closed-loop racetrack boundaries derived from TUMFTM surveyed data (Silverstone, Interlagos, Spa, Monza, Suzuka, etc.).
  - **Dynamic Origin Alignment**: Automatically translates surveyed coordinates into the F1 telemetry coordinate frame using centroid bounding-box registration ($< 4.6\text{m}$ median error across $5.8\text{km}$ laps).
  - **Universal Fallback Ribbon Corridor**: Extrudes an origin-locked asphalt corridor ($\pm 6.0\text{m}$) along the driven racing line for unknown or unmapped tracks.
- **Interactive 60 FPS Workbench UI**:
  - **2D Track Radar Canvas**: Dark asphalt polygon fill, crisp 1.5px boundary limits, 2-second motion tails, dynamic camera tracking, and metric spatial grids.
  - **Timeline Scrubber**: Synchronized dual-car HUD gauges (Speed, Throttle, Brake, Steering, Gear, G-Forces).
  - **Telemetry Waveforms**: Real-time multi-channel telemetry graphs with comparative overlays.
  - **Synchronized Broadcast Footage**: Integrated MP4 incident video synced 1:1 with timeline scrubber.
  - **FIA Decision Document Viewer**: Official Stewards' Bulletin with printable/exportable judicial layout.

---

## 📁 Repository Structure

```
ApexGuard/
├── backend/
│   ├── app/
│   │   ├── data/
│   │   │   └── tracks/             # 25 Pre-rendered track JSONs & manifest
│   │   ├── ingest/                 # CSV parser, 20Hz sync, track loader & extrusion
│   │   ├── layer1_math/            # Deterministic kinematics & contact detection
│   │   ├── layer2_gatekeeper/      # Rulebook evaluator (Strands Decider 2B / offline)
│   │   ├── layer3_steward/         # Bulletin synthesis (Amazon Bedrock / offline)
│   │   └── main.py                 # FastAPI application & REST endpoints
│   └── tests/                      # Full test suites (Phase 1 & Phase 2 verification)
├── frontend/
│   ├── app/                        # Next.js 15 App Router pages & layout
│   ├── components/                 # TrackRadar2D, TimelineScrubber, TelemetryCurves, IngestModal
│   └── lib/                        # API client, TypeScript schemas, kinematics types
├── materiale/
│   └── testCases/                  # Real F1 25 telemetry captures & incident clips
├── AGENTS.md                       # Agent directive & engineering rules
├── .env.example                    # Environment template for cloud AI providers
└── README.md
```

---

## 🛠️ Quick Start

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+** (Node 20+ recommended)
- **Git**

### 2. Backend Setup (FastAPI)
```bash
# Install Python dependencies
pip install fastapi uvicorn numpy pydantic python-multipart httpx

# (Optional) Configure Cloud AI credentials in .env
cp .env.example .env

# Run FastAPI backend
python -m uvicorn backend.app.main:app --port 8000 --reload
```
API documentation available at [http://localhost:8000/docs](http://localhost:8000/docs).

### 3. Frontend Setup (Next.js 15)
```bash
cd frontend

# Install Node dependencies
npm install

# Start Next.js development server
npm run dev -- -p 3000
```
Open [http://localhost:3000](http://localhost:3000) to access the ApexGuard Workbench.

### 4. Running Verification Test Suites
```bash
# Execute Phase 1 & Phase 2 integration test suites
python -c "
import importlib
for mod in ['backend.tests.test_phase1_validation', 'backend.tests.test_phase2_validation']:
    m = importlib.import_module(mod)
    for attr in dir(m):
        if attr.startswith('test_'):
            getattr(m, attr)()
print('All validation suites passed cleanly!')
"
```

---

## 📜 Regulatory Standards Citing
Decisions issued by ApexGuard cite genuine articles from the **FIA International Sporting Code (ISC) Appendix L Chapter IV**:
- **Article 2(b)**: Forcing another competitor off the track.
- **Article 2(d)**: Shared racing room & racing incidents without predominant fault.
- **Article 2(e)**: Unorthodox defending or more than one change of direction.

---

## 📄 License
MIT License. Created for competitive motorsport adjudication and deterministic telemetry telemetry analysis.
