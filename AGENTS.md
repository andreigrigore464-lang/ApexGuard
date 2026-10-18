# AGENTS.md — ApexGuard Agent Directive

Operational entrypoint for AI coding agents working on ApexGuard.

## 1. Prime Directives
1. **Fully Dynamic**: Never hardcode driver names, track names, turn numbers, or presets. Parse all metadata and coordinates dynamically from input files.
2. **Real Physical Coordinates**: The horizontal ground plane is strictly $(X_{\text{world}}, Z_{\text{world}})$ in meters (`x`/`z` in telemetry, `x_m`/`y_m` in track CSVs). Vertical $Y$ is elevation and is ignored. No synthetic splines or heuristic curves.
3. **Engineering Rigor**: Use clean, technical stewarding terminology (see Spec §1.1). Avoid marketing buzzwords.
4. **Offline Resiliency**: Ensure local rulebook fallbacks execute cleanly when LLM credentials (`.env`) are missing.

## 2. Sources of Truth
The following files are located insie ./.specs
- **`PROJECT_SPEC.md`**: Master architectural blueprint, kinematic formulas, CSV schemas, and UI specifications.
- **`TASKS.md`**: Step-by-step implementation plan. Work strictly phase by phase and verify each before advancing.
- **`reference_*.csv`**: Canonical structural examples for telemetry (IBaldo tool) and track geometry (TUMFTM).

## 3. Core Directory Layout
These folders and files will be situated in the root folder, not the .specs. This is situated at D:\Work\ApexGuard
- `backend/`: FastAPI application (`/ingest`, `/layer1_math`, `/layer2_gatekeeper`, `/layer3_steward`).
- `frontend/`: Next.js 15 App Router (`/components`, `/lib`, `/app`).
