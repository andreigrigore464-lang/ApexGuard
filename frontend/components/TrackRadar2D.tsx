"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  SessionState,
  SynchronizedFrame,
  Point2D,
} from "@/lib/types";
import { ZoomIn, ZoomOut, Maximize2, Lock, Unlock } from "lucide-react";

interface TrackRadar2DProps {
  session: SessionState;
  currentTime: number;
  onTimeChange?: (time: number) => void;
  carAColor?: string;
  carBColor?: string;
  className?: string;
}

const CHASSIS_LENGTH_M = 5.6;
const CHASSIS_WIDTH_M = 2.0;

export const TrackRadar2D: React.FC<TrackRadar2DProps> = ({
  session,
  currentTime,
  onTimeChange,
  carAColor = "#06B6D4", // Cyan
  carBColor = "#F43F5E", // Rose
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Camera state
  const cameraRef = useRef<{
    cx: number;
    cz: number;
    targetCx: number;
    targetCz: number;
    scale: number;
    targetScale: number;
    userOffsetU: number;
    userOffsetV: number;
    userZoomMultiplier: number;
    autoTrack: boolean;
  }>({
    cx: session.track.origin.x,
    cz: session.track.origin.z,
    targetCx: session.track.origin.x,
    targetCz: session.track.origin.z,
    scale: 8.0,
    targetScale: 8.0,
    userOffsetU: 0,
    userOffsetV: 0,
    userZoomMultiplier: 1.0,
    autoTrack: true,
  });

  const [autoTrack, setAutoTrack] = useState<boolean>(true);
  const [scaleReadout, setScaleReadout] = useState<string>("10m");

  // Drag pan state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Find active synchronized frame matching currentTime
  const getActiveFrame = useCallback((): SynchronizedFrame => {
    const timeline = session.timeline;
    if (!timeline.length) return null as any;

    // Binary search or linear clamp
    let low = 0;
    let high = timeline.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (timeline[mid].t < currentTime) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const idx = Math.min(Math.max(0, low), timeline.length - 1);
    return timeline[idx];
  }, [session, currentTime]);

  // World to Canvas coordinate projection
  const worldToCanvas = useCallback(
    (x: number, z: number, w: number, h: number) => {
      const cam = cameraRef.current;
      const s = cam.scale * cam.userZoomMultiplier;
      const u = w / 2 + (x - cam.cx) * s + cam.userOffsetU;
      const v = h / 2 + (z - cam.cz) * s + cam.userOffsetV;
      return { u, v };
    },
    []
  );

  // 60 FPS Render Loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const frame = getActiveFrame();
      const cam = cameraRef.current;

      // Dynamic Auto-Zoom & Centering
      if (frame && cam.autoTrack) {
        const midX = (frame.car_a.x + frame.car_b.x) / 2;
        const midZ = (frame.car_a.z + frame.car_b.z) / 2;
        cam.targetCx = midX;
        cam.targetCz = midZ;

        const separation = frame.separation_m;
        // Keep cars framed with comfortable track margin
        const targetViewDim = Math.max(45.0, separation * 3.0 + 30.0);
        const minDim = Math.min(width, height);
        cam.targetScale = Math.max(3.0, Math.min(22.0, minDim / targetViewDim));

        // Smooth camera gliding
        cam.cx += (cam.targetCx - cam.cx) * 0.12;
        cam.cz += (cam.targetCz - cam.cz) * 0.12;
        cam.scale += (cam.targetScale - cam.scale) * 0.12;
      }

      // Clear with Deep Midnight Slate background
      ctx.fillStyle = "#0B0F19";
      ctx.fillRect(0, 0, width, height);

      // Render subtle spatial grid lines
      renderSpatialGrid(ctx, width, height);

      // Render Track: Asphalt Polygon Fill + 1.5px Solid Boundaries
      renderTrackLimits(ctx, width, height);

      // Render Trajectories & 2-Second Motion Tails
      if (frame) {
        renderTrajectories(ctx, width, height, frame);

        // Separation Vector & Metric Leader
        renderSeparationVector(ctx, width, height, frame);

        // Render Scaled Cars & Yaw Arrows
        renderCarSilhouette(ctx, width, height, frame.car_a, carAColor, "Car A");
        renderCarSilhouette(ctx, width, height, frame.car_b, carBColor, "Car B");

        // Anti-Collision Dynamic Driver Pill Badges
        renderAntiCollisionLabels(ctx, width, height, frame);
      }

      // Render Scale Bar (in meters)
      renderScaleBar(ctx, width, height);

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [session, getActiveFrame, carAColor, carBColor, worldToCanvas]);

  // Spatial coordinate grid in world meters
  const renderSpatialGrid = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ) => {
    const cam = cameraRef.current;
    const s = cam.scale * cam.userZoomMultiplier;
    const gridStepM = s > 12 ? 10 : 25; // meters
    const gridStepPx = gridStepM * s;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;

    const startX = (w / 2 + cam.userOffsetU) % gridStepPx;
    for (let x = startX; x < w; x += gridStepPx) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const startY = (h / 2 + cam.userOffsetV) % gridStepPx;
    for (let y = startY; y < h; y += gridStepPx) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  };

  // Spec §4.1.1: Asphalt Surface & Solid Crisp Limits (No centerlines)
  const renderTrackLimits = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ) => {
    const track = session.track;
    if (!track.bound_left.length || !track.bound_right.length) return;

    const left = track.bound_left;
    const right = track.bound_right;

    // 1. Asphalt Surface Polygon Fill (#141A26)
    ctx.beginPath();
    const startLeft = worldToCanvas(left[0].x, left[0].z, w, h);
    ctx.moveTo(startLeft.u, startLeft.v);

    for (let i = 1; i < left.length; i++) {
      const p = worldToCanvas(left[i].x, left[i].z, w, h);
      ctx.lineTo(p.u, p.v);
    }

    // Connect along right boundary in reverse
    for (let i = right.length - 1; i >= 0; i--) {
      const p = worldToCanvas(right[i].x, right[i].z, w, h);
      ctx.lineTo(p.u, p.v);
    }

    ctx.closePath();
    ctx.fillStyle = "#141A26"; // Dark asphalt
    ctx.fill();

    // 2. Track Limits: Crisp Solid White Boundary Lines (1.5px)
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(248, 250, 252, 0.85)";

    // Left boundary
    ctx.beginPath();
    ctx.moveTo(startLeft.u, startLeft.v);
    for (let i = 1; i < left.length; i++) {
      const p = worldToCanvas(left[i].x, left[i].z, w, h);
      ctx.lineTo(p.u, p.v);
    }
    if (!track.is_fallback) ctx.closePath();
    ctx.stroke();

    // Right boundary
    ctx.beginPath();
    const startRight = worldToCanvas(right[0].x, right[0].z, w, h);
    ctx.moveTo(startRight.u, startRight.v);
    for (let i = 1; i < right.length; i++) {
      const p = worldToCanvas(right[i].x, right[i].z, w, h);
      ctx.lineTo(p.u, p.v);
    }
    if (!track.is_fallback) ctx.closePath();
    ctx.stroke();
  };

  // Spec §4.1.3: Full Faded Guideline + Vibrant 2-Second Motion Tail
  const renderTrajectories = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    activeFrame: SynchronizedFrame
  ) => {
    const timeline = session.timeline;
    if (timeline.length < 2) return;

    // Incident active slice or full timeline
    const tActive = activeFrame.t;
    const tTailStart = Math.max(timeline[0].t, tActive - 2.0);

    const drawLine = (
      carKey: "car_a" | "car_b",
      color: string
    ) => {
      // 1. Full Faded Guideline (opacity: 0.22)
      ctx.beginPath();
      const p0 = worldToCanvas(timeline[0][carKey].x, timeline[0][carKey].z, w, h);
      ctx.moveTo(p0.u, p0.v);
      for (let i = 1; i < timeline.length; i++) {
        const p = worldToCanvas(timeline[i][carKey].x, timeline[i][carKey].z, w, h);
        ctx.lineTo(p.u, p.v);
      }
      ctx.strokeStyle = `${color}38`; // ~0.22 opacity
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 2. Vibrant 2-Second Motion Tail with Smooth Rear Fade
      const tailFrames = timeline.filter(
        (f) => f.t >= tTailStart && f.t <= tActive
      );
      if (tailFrames.length > 1) {
        for (let i = 1; i < tailFrames.length; i++) {
          const fPrev = tailFrames[i - 1];
          const fCurr = tailFrames[i];
          const ptPrev = worldToCanvas(fPrev[carKey].x, fPrev[carKey].z, w, h);
          const ptCurr = worldToCanvas(fCurr[carKey].x, fCurr[carKey].z, w, h);

          // Normalized progress across 2-second tail: 0.0 (oldest) to 1.0 (current)
          const prog = (fCurr.t - tTailStart) / Math.max(0.01, tActive - tTailStart);
          const alpha = Math.max(0.05, Math.pow(prog, 1.8));

          ctx.beginPath();
          ctx.moveTo(ptPrev.u, ptPrev.v);
          ctx.lineTo(ptCurr.u, ptCurr.v);
          ctx.strokeStyle = `${color}${Math.floor(alpha * 255)
            .toString(16)
            .padStart(2, "0")}`;
          ctx.lineWidth = 2.0 + prog * 2.5; // Tapers toward rear
          ctx.stroke();
        }
      }
    };

    drawLine("car_a", carAColor);
    drawLine("car_b", carBColor);
  };

  // Separation distance connector & indicator
  const renderSeparationVector = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    frame: SynchronizedFrame
  ) => {
    const ptA = worldToCanvas(frame.car_a.x, frame.car_a.z, w, h);
    const ptB = worldToCanvas(frame.car_b.x, frame.car_b.z, w, h);

    const dist = frame.separation_m;
    const isCollision = dist < 2.0;
    const isProximity = dist < 4.0;

    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(ptA.u, ptA.v);
    ctx.lineTo(ptB.u, ptB.v);
    ctx.strokeStyle = isCollision
      ? "rgba(239, 68, 68, 0.9)"
      : isProximity
      ? "rgba(245, 158, 11, 0.8)"
      : "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = isCollision ? 2 : 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // Separation metric pill at midpoint
    const midU = (ptA.u + ptB.u) / 2;
    const midV = (ptA.v + ptB.v) / 2;

    const label = `${dist.toFixed(2)}m`;
    ctx.font = "bold 10px JetBrains Mono, monospace";
    const textW = ctx.measureText(label).width;

    ctx.fillStyle = isCollision
      ? "rgba(220, 38, 38, 0.95)"
      : isProximity
      ? "rgba(217, 119, 6, 0.95)"
      : "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = isCollision
      ? "#EF4444"
      : isProximity
      ? "#F59E0B"
      : "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;

    const pad = 5;
    ctx.beginPath();
    ctx.roundRect(
      midU - textW / 2 - pad,
      midV - 8,
      textW + pad * 2,
      16,
      4
    );
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, midU, midV);
  };

  // Spec §4.1.2: Scaled Physical Chassis Silhouettes (5.6m x 2.0m)
  const renderCarSilhouette = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    car: SynchronizedFrame["car_a"],
    color: string,
    label: string
  ) => {
    const cam = cameraRef.current;
    const s = cam.scale * cam.userZoomMultiplier;
    const center = worldToCanvas(car.x, car.z, w, h);

    const lenPx = CHASSIS_LENGTH_M * s;
    const widthPx = CHASSIS_WIDTH_M * s;

    // Heading yaw in canvas space (u = +x, v = +z -> atan2(dz, dx))
    const yawAngle = car.heading_rad;

    ctx.save();
    ctx.translate(center.u, center.v);
    ctx.rotate(yawAngle);

    // Chassis Body (Aerodynamic open-wheel silhouette)
    ctx.beginPath();
    const halfL = lenPx / 2;
    const halfW = widthPx / 2;

    // Nose cone (front)
    ctx.moveTo(halfL, 0);
    ctx.lineTo(halfL * 0.7, halfW * 0.4);
    ctx.lineTo(halfL * 0.3, halfW); // Front wheel pod
    ctx.lineTo(-halfL * 0.4, halfW * 0.95); // Sidepod
    ctx.lineTo(-halfL * 0.85, halfW * 0.7); // Rear wheel pod
    ctx.lineTo(-halfL, halfW * 0.5); // Rear wing corner
    ctx.lineTo(-halfL, -halfW * 0.5);
    ctx.lineTo(-halfL * 0.85, -halfW * 0.7);
    ctx.lineTo(-halfL * 0.4, -halfW * 0.95);
    ctx.lineTo(halfL * 0.3, -halfW);
    ctx.lineTo(halfL * 0.7, -halfW * 0.4);
    ctx.closePath();

    // Solid competitor fill
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Cockpit cut-out
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.beginPath();
    ctx.roundRect(-halfL * 0.1, -halfW * 0.25, halfL * 0.35, halfW * 0.5, 2);
    ctx.fill();

    // Front Axle Indicator Line
    const frontAxleX = halfL * 0.5;
    ctx.beginPath();
    ctx.moveTo(frontAxleX, -halfW * 0.9);
    ctx.lineTo(frontAxleX, halfW * 0.9);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Heading Yaw Direction Arrow (extends forward from nose)
    ctx.beginPath();
    ctx.moveTo(halfL * 0.9, 0);
    ctx.lineTo(halfL + Math.max(12, 1.5 * s), 0);
    ctx.strokeStyle = "#FDE047"; // Vibrant yellow vector
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arrow tip
    const arrowTipX = halfL + Math.max(12, 1.5 * s);
    ctx.beginPath();
    ctx.moveTo(arrowTipX, 0);
    ctx.lineTo(arrowTipX - 5, -3.5);
    ctx.lineTo(arrowTipX - 5, 3.5);
    ctx.closePath();
    ctx.fillStyle = "#FDE047";
    ctx.fill();

    ctx.restore();
  };

  // Spec §4.1.4: Collision-Free Dynamic Driver Labels (Interior/Exterior offset)
  const renderAntiCollisionLabels = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    frame: SynchronizedFrame
  ) => {
    const ptA = worldToCanvas(frame.car_a.x, frame.car_a.z, w, h);
    const ptB = worldToCanvas(frame.car_b.x, frame.car_b.z, w, h);

    // Vector from Car A to Car B
    const deltaU = ptB.u - ptA.u;
    const deltaV = ptB.v - ptA.v;

    // Lateral normal in canvas coordinates (-deltaV, deltaU)
    const len = Math.hypot(deltaU, deltaV) || 1;
    const normU = -deltaV / len;
    const normV = deltaU / len;

    // Offset A in negative normal, B in positive normal to prevent overlap
    const offsetDist = 32;

    const drawPill = (
      carCenter: { u: number; v: number },
      offsetSign: number,
      driverName: string,
      carInfo: string,
      speedKmh: number,
      color: string
    ) => {
      const pillU = carCenter.u + normU * offsetDist * offsetSign;
      const pillV = carCenter.v + normV * offsetDist * offsetSign;

      // Leader line
      ctx.beginPath();
      ctx.moveTo(carCenter.u, carCenter.v);
      ctx.lineTo(pillU, pillV);
      ctx.strokeStyle = `${color}88`;
      ctx.lineWidth = 1;
      ctx.stroke();

      const text = `${driverName} | ${speedKmh.toFixed(0)} km/h`;
      ctx.font = "bold 10px JetBrains Mono, monospace";
      const metrics = ctx.measureText(text);
      const pillW = metrics.width + 12;
      const pillH = 18;

      ctx.beginPath();
      ctx.roundRect(pillU - pillW / 2, pillV - pillH / 2, pillW, pillH, 4);
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)"; // Dark glass
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = "#F8FAFC";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, pillU, pillV);
    };

    drawPill(
      ptA,
      -1,
      session.competitor_a.driver,
      session.competitor_a.car,
      frame.car_a.speed_kmh,
      carAColor
    );
    drawPill(
      ptB,
      1,
      session.competitor_b.driver,
      session.competitor_b.car,
      frame.car_b.speed_kmh,
      carBColor
    );
  };

  // Scale Bar in Meters in corner
  const renderScaleBar = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ) => {
    const cam = cameraRef.current;
    const s = cam.scale * cam.userZoomMultiplier;

    // Choose round meter length: 10m or 25m or 50m
    const meterOptions = [5, 10, 20, 50, 100];
    let chosenM = 20;
    for (const m of meterOptions) {
      if (m * s >= 60 && m * s <= 180) {
        chosenM = m;
        break;
      }
    }
    const barPx = chosenM * s;

    const posX = w - barPx - 20;
    const posY = h - 20;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(posX, posY);
    ctx.lineTo(posX + barPx, posY);
    // End ticks
    ctx.moveTo(posX, posY - 4);
    ctx.lineTo(posX, posY + 4);
    ctx.moveTo(posX + barPx, posY - 4);
    ctx.lineTo(posX + barPx, posY + 4);
    ctx.stroke();

    ctx.font = "9px JetBrains Mono, monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${chosenM}m`, posX + barPx / 2, posY - 5);
  };

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    cameraRef.current.userOffsetU += dx;
    cameraRef.current.userOffsetV += dy;
    cameraRef.current.autoTrack = false;
    setAutoTrack(false);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    cameraRef.current.userZoomMultiplier = Math.max(
      0.3,
      Math.min(5.0, cameraRef.current.userZoomMultiplier * zoomFactor)
    );
  };

  const resetCamera = () => {
    cameraRef.current.userOffsetU = 0;
    cameraRef.current.userOffsetV = 0;
    cameraRef.current.userZoomMultiplier = 1.0;
    cameraRef.current.autoTrack = true;
    setAutoTrack(true);
  };

  const toggleAutoTrack = () => {
    const next = !autoTrack;
    cameraRef.current.autoTrack = next;
    setAutoTrack(next);
    if (next) {
      cameraRef.current.userOffsetU = 0;
      cameraRef.current.userOffsetV = 0;
    }
  };

  return (
    <div className={`relative w-full h-full bg-[#0B0F19] overflow-hidden rounded-xl border border-slate-800 ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Floating Viewport Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md px-2 py-1.5 rounded-lg border border-slate-700/60 shadow-lg text-xs">
        <button
          type="button"
          onClick={() => {
            cameraRef.current.userZoomMultiplier = Math.min(
              5.0,
              cameraRef.current.userZoomMultiplier * 1.2
            );
          }}
          className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            cameraRef.current.userZoomMultiplier = Math.max(
              0.3,
              cameraRef.current.userZoomMultiplier / 1.2
            );
          }}
          className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-[1px] h-4 bg-slate-700 my-auto" />
        <button
          type="button"
          onClick={toggleAutoTrack}
          className={`flex items-center gap-1 px-2 py-1 rounded transition text-[11px] font-mono ${
            autoTrack
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
              : "text-slate-400 hover:text-slate-200"
          }`}
          title="Auto-Frame Incident"
        >
          {autoTrack ? (
            <Lock key="lock-icon" className="w-3 h-3" />
          ) : (
            <Unlock key="unlock-icon" className="w-3 h-3" />
          )}
          <span>Auto-Zoom</span>
        </button>
        <button
          type="button"
          onClick={resetCamera}
          className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition"
          title="Reset Camera Framing"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Circuit & Session HUD Badge */}
      <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-700/60 shadow-lg pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-200 tracking-wide">
            {session.track_name}
          </span>
          {session.track.is_fallback && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
              Driven Corridor
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
          Direct World Projection (X, Z) • 60 FPS
        </div>
      </div>
    </div>
  );
};
