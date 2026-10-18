"use client";

import React, { useRef, useEffect, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Clock,
  Sliders,
  Tv,
} from "lucide-react";

interface BroadcastFootageProps {
  videoSrc: string;
  currentTime: number;
  onTimeChange: (time: number) => void;
  startTime?: number;
  className?: string;
}

export const BroadcastFootage: React.FC<BroadcastFootageProps> = ({
  videoSrc,
  currentTime,
  onTimeChange,
  startTime = 0,
  className = "",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [syncOffset, setSyncOffset] = useState<number>(0.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);

  // Sync video time 1:1 with global telemetry scrubber
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Formula per Spec §4.2: video.currentTime = (t_scrubber - t_start) + t_offset
    const targetVideoTime = Math.max(0, currentTime - startTime + syncOffset);

    // Only update if difference > 0.08s to avoid audio jitter during continuous animation
    if (Math.abs(video.currentTime - targetVideoTime) > 0.08) {
      video.currentTime = targetVideoTime;
    }
  }, [currentTime, startTime, syncOffset]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleVideoTimeUpdate = () => {
    // If user is playing via HTML5 native controls, update telemetry time
    const video = videoRef.current;
    if (!video || !isPlaying) return;
    const computedTelemetryTime = video.currentTime + startTime - syncOffset;
    onTimeChange(computedTelemetryTime);
  };

  const adjustOffset = (delta: number) => {
    setSyncOffset((prev) => parseFloat((prev + delta).toFixed(2)));
  };

  const resetOffset = () => {
    setSyncOffset(0.0);
  };

  return (
    <div
      className={`flex flex-col bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xl ${className}`}
    >
      {/* Cinematic Video Player Container */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group">
        <video
          ref={videoRef}
          src={videoSrc}
          onTimeUpdate={handleVideoTimeUpdate}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration);
            }
          }}
          className="w-full h-full object-contain"
          playsInline
        />

        {/* Live Broadcast Watermark Badge */}
        <div className="absolute top-3 left-3 bg-red-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-widest flex items-center gap-1.5 shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          BROADCAST FEED
        </div>

        {/* Sync Offset Indicator Pill */}
        <div className="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-slate-200 text-[10px] font-mono px-2 py-1 rounded shadow-lg">
          1:1 Time Lock • Offset:{" "}
          <span
            className={
              syncOffset !== 0 ? "text-amber-400 font-bold" : "text-emerald-400"
            }
          >
            {syncOffset > 0 ? `+${syncOffset.toFixed(2)}s` : `${syncOffset.toFixed(2)}s`}
          </span>
        </div>
      </div>

      {/* Sync Offset Nudge Control Bar (Spec §4.2) */}
      <div className="p-3 bg-slate-950/60 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold text-slate-300">
            Sync Offset Nudge:
          </span>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-[10px] font-mono">
            <button
              onClick={() => adjustOffset(-0.2)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Shift video earlier by 0.2s"
            >
              -0.2s
            </button>
            <button
              onClick={() => adjustOffset(-0.05)}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Shift video earlier by 1 frame (0.05s)"
            >
              -0.05s
            </button>
            <button
              onClick={resetOffset}
              className="px-2 py-0.5 rounded text-slate-400 hover:text-white transition"
              title="Reset offset to 0.0s"
            >
              0.0s
            </button>
            <button
              onClick={() => adjustOffset(0.05)}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Shift video later by 1 frame (0.05s)"
            >
              +0.05s
            </button>
            <button
              onClick={() => adjustOffset(0.2)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Shift video later by 0.2s"
            >
              +0.2s
            </button>
          </div>
        </div>

        {/* Video Time Readout */}
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>Video Cursor:</span>
          <span className="text-slate-200 font-bold">
            {videoRef.current ? videoRef.current.currentTime.toFixed(2) : "0.00"}s
          </span>
        </div>
      </div>
    </div>
  );
};
