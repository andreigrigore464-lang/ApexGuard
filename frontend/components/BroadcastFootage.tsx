"use client";

import React, { useRef, useEffect, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Clock,
  Sliders,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";

interface BroadcastFootageProps {
  videoSrc: string;
  currentTime: number;
  onTimeChange: (time: number) => void;
  startTime?: number;
  isPlaying?: boolean;
  playbackSpeed?: number;
  onPlayChange?: (playing: boolean) => void;
  className?: string;
}

export const BroadcastFootage: React.FC<BroadcastFootageProps> = ({
  videoSrc,
  currentTime,
  onTimeChange,
  startTime = 0,
  isPlaying = false,
  playbackSpeed = 1.0,
  onPlayChange,
  className = "",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [syncOffset, setSyncOffset] = useState<number>(0.0);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [duration, setDuration] = useState<number>(0);

  // Sync video time 1:1 with global telemetry scrubber
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Formula per Spec §4.2: video.currentTime = (t_scrubber - t_start) + t_offset
    const targetVideoTime = Math.max(0, currentTime - startTime + syncOffset);

    if (isPlaying) {
      // While playing, let hardware decoding run; only correct if drift exceeds 0.15s
      if (Math.abs(video.currentTime - targetVideoTime) > 0.15) {
        video.currentTime = targetVideoTime;
      }
    } else {
      // While paused or scrubbing, lock precisely to target frame
      if (Math.abs(video.currentTime - targetVideoTime) > 0.03) {
        video.currentTime = targetVideoTime;
      }
    }
  }, [currentTime, startTime, syncOffset, isPlaying]);

  // Handle play/pause and playback speed sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = playbackSpeed;

    if (isPlaying) {
      video.play().catch((err) => {
        // Safe catch for browser media policies
        console.warn("Video playback note:", err);
      });
    } else {
      video.pause();
    }
  }, [isPlaying, playbackSpeed]);

  const adjustOffset = (delta: number) => {
    setSyncOffset((prev) => parseFloat((prev + delta).toFixed(2)));
  };

  const resetOffset = () => {
    setSyncOffset(0.0);
  };

  const togglePlay = () => {
    if (onPlayChange) {
      onPlayChange(!isPlaying);
    }
  };

  return (
    <div
      className={`flex flex-col bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xl ${className}`}
    >
      {/* Cinematic Video Player Container */}
      <div
        className="relative flex-1 min-h-0 w-full bg-black flex items-center justify-center overflow-hidden group cursor-pointer"
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          muted={isMuted}
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration);
            }
          }}
          onError={(e) => {
            const currentSrc = e.currentTarget.src || "";
            const isSilv = currentSrc.includes("silverstone") || videoSrc.includes("silverstone");
            const fallbackSrc = isSilv ? "/clips/silverstone.mp4" : "/clips/interlagos.mp4";
            if (!currentSrc.endsWith(fallbackSrc)) {
              console.warn(`Video source ${currentSrc} failed, falling back to ${fallbackSrc}`);
              e.currentTarget.src = fallbackSrc;
            }
          }}
          className="max-w-full max-h-full w-auto h-auto object-contain select-none"
        />

        {/* Live Broadcast Watermark Badge */}
        <div className="absolute top-3 left-3 bg-red-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-widest flex items-center gap-1.5 shadow-lg pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          BROADCAST FEED
        </div>

        {/* Top Right Controls: Mute Toggle + Sync Offset Indicator */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted(!isMuted);
            }}
            className="bg-slate-950/80 backdrop-blur-md hover:bg-slate-800 border border-slate-700/60 text-slate-200 p-1.5 rounded shadow-lg transition"
            title={isMuted ? "Unmute Broadcast Audio" : "Mute Broadcast Audio"}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            )}
          </button>

          <div className="bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-slate-200 text-[10px] font-mono px-2 py-1 rounded shadow-lg pointer-events-none">
            1:1 Time Lock • Offset:{" "}
            <span
              className={
                syncOffset !== 0
                  ? "text-amber-400 font-bold"
                  : "text-emerald-400 font-bold"
              }
            >
              {syncOffset > 0
                ? `+${syncOffset.toFixed(2)}s`
                : `${syncOffset.toFixed(2)}s`}
            </span>
          </div>
        </div>

        {/* Center Hover Play/Pause Indicator Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none bg-black/20">
          <div className="w-11 h-11 rounded-full bg-slate-900/80 border border-slate-700 flex items-center justify-center text-white shadow-xl">
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </div>
        </div>
      </div>

      {/* Sync Offset Nudge Control Bar (Spec §4.2) */}
      <div className="px-3 py-2 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold text-slate-300">
            Sync Nudge:
          </span>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-[10px] font-mono">
            <button
              type="button"
              onClick={() => adjustOffset(-0.2)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Shift video earlier by 0.2s"
            >
              -0.2s
            </button>
            <button
              type="button"
              onClick={() => adjustOffset(-0.05)}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Shift video earlier by 1 frame (0.05s)"
            >
              -0.05s
            </button>
            <button
              type="button"
              onClick={resetOffset}
              className="px-2 py-0.5 rounded text-slate-400 hover:text-white transition"
              title="Reset offset to 0.0s"
            >
              0.0s
            </button>
            <button
              type="button"
              onClick={() => adjustOffset(0.05)}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Shift video later by 1 frame (0.05s)"
            >
              +0.05s
            </button>
            <button
              type="button"
              onClick={() => adjustOffset(0.2)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Shift video later by 0.2s"
            >
              +0.2s
            </button>
          </div>
        </div>

        {/* Video Cursor & Telemetry Ref Readout */}
        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>Clip:</span>
            <span className="text-slate-200 font-bold">
              {videoRef.current ? videoRef.current.currentTime.toFixed(2) : "0.00"}s
            </span>
          </div>
          <div className="text-[10px] text-slate-500">|</div>
          <div className="flex items-center gap-1.5">
            <span>Ref:</span>
            <span className="text-cyan-400 font-bold">
              {currentTime.toFixed(2)}s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
