"use client";

import React, { useState, useEffect } from "react";
import { SampleMeta, TrackMeta, listTracks } from "@/lib/api";
import { Upload, Film, FileText, Check, X, Sparkles, Layers } from "lucide-react";

interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fileA: File, fileB: File, videoFile?: File | null, trackId?: string) => Promise<void>;
  onSelectSample: (sampleId: string) => Promise<void>;
  samples: SampleMeta[];
  tracks?: TrackMeta[];
  isLoading: boolean;
}

export const IngestModal: React.FC<IngestModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onSelectSample,
  samples,
  tracks = [],
  isLoading,
}) => {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string>("");
  const [tracksList, setTracksList] = useState<TrackMeta[]>(tracks);
  const [addFootage, setAddFootage] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tracks.length > 0) {
      setTracksList(tracks);
    } else {
      listTracks().then(setTracksList).catch(console.error);
    }
  }, [tracks]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileA || !fileB) {
      setError("Please select telemetry CSV files for both Car A and Car B.");
      return;
    }
    setError(null);
    try {
      await onSubmit(fileA, fileB, addFootage ? videoFile : null, selectedTrackId);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to ingest telemetry files");
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Upload className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white tracking-tight">
            Upload Telemetry (CSV)
          </h2>
        </div>
        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
          Upload dual car telemetry recordings. Drivers, teams, circuit coordinates, and encounter moments are dynamically resolved.
        </p>

        {/* Quick-Action Authentic Samples (Spec §8) */}
        <div className="mb-5 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-2 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
              <Sparkles className="w-3.5 h-3.5" /> Quick-Load Real Incidents
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {samples.map((sample) => (
              <button
                key={sample.id}
                type="button"
                disabled={isLoading}
                onClick={async () => {
                  await onSelectSample(sample.id);
                  onClose();
                }}
                className="text-left p-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/60 hover:border-cyan-500/50 transition group disabled:opacity-50"
              >
                <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                  {sample.name}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                  {sample.car_a} vs {sample.car_b}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Upload Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Car A Telemetry (CSV)
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFileA(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-300 bg-slate-950/70 border border-slate-800 rounded-lg p-2 cursor-pointer file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/20 file:text-cyan-400 hover:file:bg-cyan-500/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Car B Telemetry (CSV)
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFileB(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-300 bg-slate-950/70 border border-slate-800 rounded-lg p-2 cursor-pointer file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-rose-500/20 file:text-rose-400 hover:file:bg-rose-500/30"
              />
            </div>

            {/* Track Selection Dropdown */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" /> Circuit Geometry Map
                </label>
                <span className="text-[10px] font-mono text-slate-400">
                  {tracksList.length} Surveyed Tracks
                </span>
              </div>
              <select
                value={selectedTrackId}
                onChange={(e) => setSelectedTrackId(e.target.value)}
                className="w-full text-xs text-slate-200 bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 cursor-pointer focus:outline-none focus:border-cyan-500/60 font-sans"
              >
                <option value="">Auto-Detect Circuit from Telemetry (Recommended)</option>
                <optgroup label="Canonical Surveyed Racetracks (TUMFTM / F1)">
                  {tracksList.map((t) => (
                    <option key={t.track_id} value={t.track_id}>
                      {t.track_name} — {t.country} ({t.total_length_m.toFixed(0)}m)
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Fallback Mode">
                  <option value="fallback">Universal Driven Corridor (±6m Ribbon Fallback)</option>
                </optgroup>
              </select>
              <p className="text-[10px] text-slate-400 mt-1 font-mono leading-tight">
                Surveyed track origin is matched dynamically to lap telemetry. Driven corridor serves strictly as fallback.
              </p>
            </div>

            {/* Spec §4.2: [Add Footage: ON / OFF] Switch */}
            <div className="pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    Add Broadcast Footage
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddFootage(!addFootage)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-bold border transition ${
                    addFootage
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  [Add Footage: {addFootage ? "ON" : "OFF"}]
                </button>
              </div>

              {addFootage && (
                <div className="animate-in fade-in duration-200 mt-2">
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-300 bg-slate-950/70 border border-purple-900/40 rounded-lg p-2 cursor-pointer file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-purple-500/20 file:text-purple-300 hover:file:bg-purple-500/30"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">
                    Locked 1:1 to telemetry scrubber with sync offset nudge.
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg transition disabled:opacity-50"
            >
              {isLoading ? "Ingesting..." : "Ingest Telemetry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
