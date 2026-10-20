<img width="1200" height="675" alt="AWS Hackathon" src="https://github.com/user-attachments/assets/ae24e686-8479-486d-a3ec-9e222dbe8ba2" />

# ApexGuard

[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue?logo=python)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An automated race-stewarding and telemetry forensics platform for circuit racing. ApexGuard evaluates dual-car telemetry at 50–100Hz, checks spatial and control data against official sporting rulebooks, and generates formal regulatory decisions in under two seconds.

---

## The Problem

High-frequency telemetry (50–100Hz) cannot be fed directly into large language models:
- **High Latency**: General LLMs take 2–5 seconds per inference, which is too slow for race control decisions under safety car or red flag windows.
- **High Cost**: Continuously passing raw coordinate streams costs upwards of $40/hour per session.
- **Mathematical Hallucinations**: General LLMs struggle with spatial coordinate geometry, frequently hallucinating overlap percentages, braking markers, and lateral trajectory lines.

ApexGuard solves this by separating physics calculations, policy evaluation, and legal documentation into three distinct layers.

---

## Architecture: Three-Tier Pipeline

```mermaid
flowchart LR
    IN["<b>Raw Telemetry</b><br/>50–100Hz (GPS X/Z, inputs)"]
    L1["<b>Layer 1: Physics Math</b><br/>NumPy (&lt;4ms | $0.00)<br/>Overlap %, Vortex, Line delta"]
    L2["<b>Layer 2: Policy Gate</b><br/>Strands Decider (~115ms)<br/>Rulebook thresholds"]
    OK["<b>Cleared (~80%)</b><br/>Racing Incident / Green flag"]
    L3["<b>Layer 3: Legal Steward</b><br/>Bedrock (~1.5s, on demand)<br/>Signed FIA Stewards Bulletin"]
    IN --> L1
    L1 -->|StateVector| L2
    L2 -->|Benign| OK
    L2 -->|Escalated| L3
```

### Layer Breakdown

1. **Layer 1: Deterministic Physics Math** (`backend/app/layer1_math/`)  
   Uses NumPy to project cars onto real-world horizontal ground coordinates $(X, Z)$ in meters. Calculates exact axle overlaps, apex distance, lateral closing rate, and whether the attacking car entered the blind-spot vortex before the turn-in point. Runs in under 4ms with zero LLM overhead.

2. **Layer 2: Fast Policy Gatekeeper** (`backend/app/layer2_gatekeeper/`)  
   Runs an ultra-low-latency decision model (Strands Decider 2B) against the mathematical state vector. Benign contacts, clean overtakes, and clear racing incidents are closed out in ~115ms, keeping race control focused on genuine infractions.

3. **Layer 3: Judicial Legal Steward** (`backend/app/layer3_steward/`)  
   When an incident warrants a penalty or official inquiry, Amazon Bedrock drafts a structured, legally sound FIA Stewards Bulletin. Decisions cite specific sporting regulations, timestamped keyframes, and penalty points.

---

## Features

- **2D Track Radar Replay**: Canvas-based real-world coordinate replay with dynamic car bounding boxes, 50% A-pillar overlap lines, and Randy Pobst Vortex of Danger entry wedges.
- **MoTeC-Style Telemetry Curves**: Synchronized speed, throttle, brake, steering angle, and gear telemetry traces mapped to millisecond keyframes.
- **G-G Friction Circle**: Bi-axial lateral and longitudinal acceleration radar showing grip limits at turn-in and apex.
- **Multi-Series Rulebooks**: Switch between rulebooks on the fly to see how different sporting codes judge the same incident:
  - **FIA Formula 1 (Strict)**: 50% front-axle overlap required at apex, zero contact tolerance.
  - **SRO GT3 (Lenient)**: 30% overlap required, body contact permitted under racing room guidelines.
  - **CIK-FIA Junior Karting (Safety)**: 60% overlap required, strict zero-contact enforcement.
- **Live Metric Tuner**: Adjust overlap percentages and line deviations in real time with immediate (~115ms) badge updates.
- **Pre-Flight Telemetry Ingestion**: Automated validator for sample rates (50–100Hz), missing frames, and channel integrity for raw FastF1 and TUMFTM telemetry files.
- **Offline Resilient**: Ships with deterministic rule-based mock fallbacks. Runs locally with full functionality even without AWS credentials or API keys.

---

## Quickstart

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm

### 1. Clone the Repository
```bash
git clone https://github.com/andreigrigore464-lang/ApexGuard.git
cd ApexGuard
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
The FastAPI backend will start at `http://localhost:8000` (API documentation at `http://localhost:8000/docs`).

### 3. Frontend Setup
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Environment Variables (Optional)

ApexGuard runs completely offline out of the box using built-in rulebook logic and historical incident presets. To enable live AWS Bedrock and Strands Decider models, create a `.env` file in `backend/`:

```env
# Optional: Strands Decider API
STRANDS_API_KEY=your_strands_key

# Optional: Amazon Bedrock
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

---

## Incident Presets Included

The workbench includes pre-loaded historical and benchmark telemetry scenarios:
- **Monza 2021 (Verstappen vs. Hamilton)**: Curva Grande chicane overlap, sausage kerb launch, and apex room analysis.
- **Silverstone 2021 (Hamilton vs. Verstappen)**: High-speed Copse entry, missed apex line deviation, and vortex entry.
- **50/50 Racing Incident**: Mid-corner contact with shared responsibility.
- **Yellow Flag Unsafe Rejoin**: Re-entry into traffic with delta-V infractions.

---

## Repository Structure

```
ApexGuard/
├── backend/
│   ├── app/
│   │   ├── layer1_math/          # Overlap, line deviation & vortex math
│   │   ├── layer2_gatekeeper/    # Strands Decider client & triage policies
│   │   ├── layer3_steward/       # Amazon Bedrock FIA bulletin generator
│   │   ├── ingest/               # FastF1 / CSV parsing & track ribbons
│   │   ├── data/                 # Rulebooks & preset incident JSONs
│   │   └── main.py               # FastAPI routes & WebSocket entrypoint
│   └── requirements.txt
├── frontend/
│   ├── app/                      # Next.js App Router (Forensic Workbench)
│   ├── components/               # 2D Radar, MoTeC curves, G-G circle, modals
│   ├── lib/                      # API client and TypeScript definitions
│   └── package.json
└── README.md
```

---

## License

Distributed under the MIT License. See `LICENSE` for details.
