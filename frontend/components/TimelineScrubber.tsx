"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  SessionState,
  SynchronizedFrame,
  IncidentTimelineMarker,
} from "@/lib/types";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  AlertCircle,
  Gauge,
  Flame,
  Zap,
} from "lucide-react";

interface TimelineScrubberProps {
  session: SessionState;
  currentTime: number;
  onTimeChange: (time: number) => void;
  isPlaying?: boolean;
  onPlayChange?: (playing: boolean) => void;
  playbackSpeed?: number;
  onSpeedChange?: (speed: number) => void;
  carAColor?: string;
  carBColor?: string;
  className?: string;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  session,
  currentTime,
  onTimeChange,
  isPlaying: controlledIsPlaying,
  onPlayChange,
  playbackSpeed: controlledSpeed,
  onSpeedChange,
  carAColor = "#06B6D4",
  carBColor = "#F43F5E",
  className = "",
}) => {
  const [internalIsPlaying, setInternalIsPlaying] = useState<boolean>(false);
  const [internalSpeed, setInternalSpeed] = useState<number>(1.0);

  const isPlaying =
    controlledIsPlaying !== undefined ? controlledIsPlaying : internalIsPlaying;
  const setIsPlaying = (val: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof val === "function" ? val(isPlaying) : val;
    if (onPlayChange) {
      onPlayChange(nextVal);
    } else {
      setInternalIsPlaying(nextVal);
    }
  };

  const playbackSpeed =
    controlledSpeed !== undefined ? controlledSpeed : internalSpeed;
  const setPlaybackSpeed = (val: number | ((prev: number) => number)) => {
    const nextVal = typeof val === "function" ? val(playbackSpeed) : val;
    if (onSpeedChange) {
      onSpeedChange(nextVal);
    } else {
      setInternalSpeed(nextVal);
    }
  };

  const timeline = session.timeline;
  const tMin = timeline.length ? timeline[0].t : 0;
  const tMax = timeline.length ? timeline[timeline.length - 1].t : 1;
  const totalDuration = Math.max(0.1, tMax - tMin);

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying) return;

    let lastTimestamp = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const deltaSec = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      const next = currentTimeRef.current + deltaSec * playbackSpeed;
      if (next >= tMax) {
        onTimeChange(tMax);
        setIsPlaying(false);
      } else {
        onTimeChange(next);
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playbackSpeed, tMax, onTimeChange]);

  // Spacebar play/pause listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        onTimeChange(Math.max(tMin, currentTime - 0.05));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        onTimeChange(Math.min(tMax, currentTime + 0.05));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTime, tMin, tMax, onTimeChange]);

  // Find active frame
  const activeFrame = useCallback((): SynchronizedFrame => {
    if (!timeline.length) return null as any;
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
  }, [timeline, currentTime])();

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onTimeChange(val);
  };

  const jumpToIncident = (marker: IncidentTimelineMarker) => {
    onTimeChange(marker.timestamp);
  };

  const progressPct = ((currentTime - tMin) / totalDuration) * 100;

  return (
    <div
      className={`bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-3.5 ${className}`}
    >
      {/* Top Metrics Row: Live Separation & Car Speeds */}
      {activeFrame && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Separation Badge */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                Clearance
              </div>
              <div
                className={`text-base font-bold font-mono ${
                  activeFrame.separation_m < 2.0
                    ? "text-red-400 animate-pulse"
                    : activeFrame.separation_m < 4.0
                    ? "text-amber-400"
                    : "text-slate-200"
                }`}
              >
                {activeFrame.separation_m.toFixed(2)} m
              </div>
            </div>
            {activeFrame.separation_m < 4.0 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  activeFrame.separation_m < 2.0
                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                }`}
              >
                {activeFrame.separation_m < 2.0 ? "CONTACT" : "CLOSE"}
              </span>
            )}
          </div>

          {/* Competitor A Telemetry Pill */}
          <div className="bg-slate-950/60 border border-cyan-950/50 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-cyan-400 truncate max-w-[120px]">
                {session.competitor_a.driver}
              </span>
              <span className="text-slate-400 font-mono text-[10px]">
                {session.competitor_a.car}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-base font-bold font-mono text-slate-100">
                {activeFrame.car_a.speed_kmh.toFixed(0)}{" "}
                <span className="text-[10px] text-slate-400 font-normal">km/h</span>
              </span>
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className="text-emerald-400">
                  T:{activeFrame.car_a.throttle_pct.toFixed(0)}%
                </span>
                <span className="text-red-400">
                  B:{activeFrame.car_a.brake_pct.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Competitor B Telemetry Pill */}
          <div className="bg-slate-950/60 border border-rose-950/50 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-rose-400 truncate max-w-[120px]">
                {session.competitor_b.driver}
              </span>
              <span className="text-slate-400 font-mono text-[10px]">
                {session.competitor_b.car}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-base font-bold font-mono text-slate-100">
                {activeFrame.car_b.speed_kmh.toFixed(0)}{" "}
                <span className="text-[10px] text-slate-400 font-normal">km/h</span>
              </span>
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className="text-emerald-400">
                  T:{activeFrame.car_b.throttle_pct.toFixed(0)}%
                </span>
                <span className="text-red-400">
                  B:{activeFrame.car_b.brake_pct.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Speed Delta & G-Forces */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="uppercase tracking-wider">Speed Delta (Δv)</span>
              <span className="font-mono">
                Lat G: {activeFrame.car_a.glat.toFixed(1)} vs {activeFrame.car_b.glat.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-base font-bold font-mono text-amber-300">
                {(activeFrame.car_a.speed_kmh - activeFrame.car_b.speed_kmh > 0 ? "+" : "")}
                {(activeFrame.car_a.speed_kmh - activeFrame.car_b.speed_kmh).toFixed(1)}{" "}
                <span className="text-[10px] text-slate-400 font-normal">km/h</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Dist: {Math.abs(activeFrame.car_a.distance_m - activeFrame.car_b.distance_m).toFixed(1)}m
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Interactive Trackbar & Incident Markers */}
      <div className="relative flex flex-col gap-1.5">
        <div className="relative w-full h-7 flex items-center">
          {/* Interactive Range Input with Dynamic Real-Time Fill & Custom Styled Thumb */}
          <input
            type="range"
            min={tMin}
            max={tMax}
            step={0.05}
            value={currentTime}
            onChange={handleSliderChange}
            style={{
              background: `linear-gradient(to right, #06B6D4 0%, #06B6D4 ${progressPct}%, rgba(51, 65, 85, 0.85) ${progressPct}%, rgba(51, 65, 85, 0.85) 100%)`,
            }}
            className="timeline-slider w-full h-2 rounded-lg cursor-pointer z-10 border border-slate-600/70 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
          />

          {/* Incident Proximity Peak Markers (<4.0m & Braking Crashes) */}
          {session.incident_markers.map((marker) => {
            const markerPosPct =
              ((marker.timestamp - tMin) / totalDuration) * 100;
            const isCrash = marker.incident_id === "turn4_braking_crash";
            return (
              <button
                key={marker.incident_id}
                type="button"
                onClick={() => jumpToIncident(marker)}
                className="absolute top-0 transform -translate-x-1/2 w-4 h-7 flex flex-col items-center justify-center group z-20 transition"
                style={{ left: `${markerPosPct}%` }}
                title={`${isCrash ? "Turn 4 Braking Crash" : marker.incident_id}: ${marker.distance_m}m clearance at t=${marker.timestamp}s`}
              >
                <div
                  className={`rounded-full border transition-transform ${
                    isCrash
                      ? "w-3 h-3 bg-red-600 border-white ring-4 ring-red-500/60 animate-pulse shadow-red-500/50 shadow-lg"
                      : marker.is_primary
                      ? "w-2.5 h-2.5 bg-red-500 border-white ring-2 ring-red-500/40 shadow-md"
                      : "w-2.5 h-2.5 bg-amber-400 border-slate-900 shadow-md"
                  } group-hover:scale-125`}
                />
                <div className={`w-[1.5px] h-3 mt-0.5 ${isCrash ? "bg-red-500 shadow-sm" : "bg-amber-400/60"}`} />

                {/* Tooltip on hover */}
                <div className="absolute bottom-8 hidden group-hover:flex flex-col items-center bg-slate-900 text-slate-100 text-[10px] font-mono px-2 py-1 rounded shadow-xl border border-slate-700 whitespace-nowrap z-30">
                  <span className={`font-semibold ${isCrash ? "text-red-400 font-bold" : "text-amber-300"}`}>
                    {isCrash ? "💥 TURN 4 BRAKING CRASH" : marker.incident_id.toUpperCase()} ({marker.distance_m}m)
                  </span>
                  <span className="text-slate-400">
                    {marker.timestamp.toFixed(2)}s {isCrash ? "• Rear-End Impact (Δv ≈ 50 km/h)" : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Timeline Time Indicators */}
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-0.5">
          <span>{tMin.toFixed(2)}s</span>
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-bold text-xs">
              {currentTime.toFixed(3)}s
            </span>
            <span className="text-slate-500">/</span>
            <span>{tMax.toFixed(2)}s</span>
          </div>
          <span>{totalDuration.toFixed(2)}s total</span>
        </div>
      </div>

      {/* Control Buttons Row */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
        {/* Playback Transport Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onTimeChange(tMin)}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="Reset to Start (0.0s)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onTimeChange(Math.max(tMin, currentTime - 0.05))}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white transition font-mono text-xs"
            title="Step Back 1 Frame (-0.05s)"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 text-xs transition ${
              isPlaying
                ? "bg-amber-500 hover:bg-amber-600 text-slate-950"
                : "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
            }`}
          >
            {isPlaying ? (
              <Pause key="pause-icon" className="w-3.5 h-3.5 fill-current shrink-0" />
            ) : (
              <Play key="play-icon" className="w-3.5 h-3.5 fill-current shrink-0" />
            )}
            <span>{isPlaying ? "Pause" : "Play"}</span>
          </button>
          <button
            type="button"
            onClick={() => onTimeChange(Math.min(tMax, currentTime + 0.05))}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white transition font-mono text-xs"
            title="Step Forward 1 Frame (+0.05s)"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Incident Quick Jump Badges */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs">
          <span className="text-[10px] text-slate-400 font-mono">INCIDENTS:</span>
          {session.incident_markers.map((m, idx) => {
            const isCrash = m.incident_id === "turn4_braking_crash";
            const isActive = Math.abs(currentTime - m.timestamp) < 0.1;
            return (
              <button
                key={m.incident_id || idx}
                type="button"
                onClick={() => jumpToIncident(m)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition flex items-center gap-1 ${
                  isActive
                    ? isCrash
                      ? "bg-red-500/30 text-red-200 border-red-500 font-bold ring-1 ring-red-400/50 shadow-sm shadow-red-500/40"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/50"
                    : isCrash
                    ? "bg-red-950/50 text-red-300 border-red-700/70 hover:bg-red-900/40 hover:text-red-200 font-semibold"
                    : "bg-slate-800/40 text-slate-400 border-slate-700/60 hover:text-slate-200"
                }`}
              >
                <span>{isCrash ? "💥 T4 CRASH" : `#${idx + 1}`} ({m.distance_m}m)</span>
              </button>
            );
          })}
        </div>

        {/* Playback Speed Toggles */}
        <div className="flex items-center gap-1 bg-slate-950/50 p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
          {[0.25, 0.5, 1.0, 2.0].map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => setPlaybackSpeed(spd)}
              className={`px-2 py-0.5 rounded transition ${
                playbackSpeed === spd
                  ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>{spd}x</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
