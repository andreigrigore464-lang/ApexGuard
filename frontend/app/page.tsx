"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  SessionState,
  IncidentStateVector,
  TriageResult,
  StewardsBulletin,
} from "@/lib/types";
import {
  listSamples,
  loadSample,
  SampleMeta,
  ingestTelemetry,
  runFullPipeline,
  listTracks,
  TrackMeta,
  API_BASE,
} from "@/lib/api";
import { TrackRadar2D } from "@/components/TrackRadar2D";
import { TimelineScrubber } from "@/components/TimelineScrubber";
import { TelemetryCurves } from "@/components/TelemetryCurves";
import { BroadcastFootage } from "@/components/BroadcastFootage";
import { FIABulletinView } from "@/components/FIABulletinView";
import { IngestModal } from "@/components/IngestModal";
import {
  Tv,
  Radar,
  Activity,
  FileCheck2,
  Upload,
  RefreshCw,
  ChevronDown,
  Layers,
  AlertTriangle,
} from "lucide-react";

type ActiveTab = "footage" | "radar" | "curves" | "bulletin";

export default function WorkbenchPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [samples, setSamples] = useState<SampleMeta[]>([]);
  const [tracks, setTracks] = useState<TrackMeta[]>([]);
  const [activeSampleId, setActiveSampleId] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Video Footage State
  const [hasVideo, setHasVideo] = useState<boolean>(false);
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("radar");

  // Governance Pipeline Results
  const [kinematics, setKinematics] = useState<IncidentStateVector | null>(null);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [bulletin, setBulletin] = useState<StewardsBulletin | null>(null);

  // Modal State
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);

  // Load sample sessions on mount
  useEffect(() => {
    async function init() {
      try {
        setIsLoading(true);
        const [sampleList, trackList] = await Promise.all([
          listSamples(),
          listTracks(),
        ]);
        setSamples(sampleList);
        setTracks(trackList);

        if (sampleList.length > 0) {
          const defaultSample = sampleList[0];
          await loadSelectedSample(defaultSample.id, sampleList);
        }
      } catch (err: any) {
        console.error("Failed to load initial session:", err);
        setError(err.message || "Failed to load telemetry session from API");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  const loadSelectedSample = async (
    sampleId: string,
    sampleList: SampleMeta[] = samples
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      setActiveSampleId(sampleId);
      const loaded = await loadSample(sampleId);
      setSession(loaded);

      // Check video footage availability
      const sampleMeta = sampleList.find((s) => s.id === sampleId);
      if (sampleMeta && sampleMeta.has_video && sampleMeta.video_path) {
        setHasVideo(true);
        setVideoSrc(`${API_BASE}${sampleMeta.video_path}`);
      } else {
        setHasVideo(false);
        setVideoSrc("");
        if (activeTab === "footage") setActiveTab("radar");
      }

      // Set initial scrubber timestamp to primary active incident
      if (loaded.active_slice) {
        setCurrentTime(loaded.active_slice.incident_time);
      } else if (loaded.timeline.length) {
        setCurrentTime(loaded.timeline[0].t);
      }

      // Automatically evaluate governance pipeline in background for immediate bulletin availability
      runFullPipeline(loaded)
        .then((res) => {
          setKinematics(res.kinematics);
          setTriage(res.triage);
          setBulletin(res.bulletin);
        })
        .catch((e) => console.warn("Background pipeline review note:", e));
    } catch (err: any) {
      setError(err.message || "Failed to load selected sample");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomUpload = async (
    fileA: File,
    fileB: File,
    videoFile?: File | null,
    trackId?: string
  ) => {
    setIsLoading(true);
    try {
      const loaded = await ingestTelemetry(fileA, fileB, undefined, trackId);
      setSession(loaded);
      setActiveSampleId("");

      if (videoFile) {
        const objectUrl = URL.createObjectURL(videoFile);
        setHasVideo(true);
        setVideoSrc(objectUrl);
      } else {
        setHasVideo(false);
        setVideoSrc("");
        if (activeTab === "footage") setActiveTab("radar");
      }

      if (loaded.active_slice) {
        setCurrentTime(loaded.active_slice.incident_time);
      } else if (loaded.timeline.length) {
        setCurrentTime(loaded.timeline[0].t);
      }

      // Run pipeline
      runFullPipeline(loaded)
        .then((res) => {
          setKinematics(res.kinematics);
          setTriage(res.triage);
          setBulletin(res.bulletin);
        })
        .catch((e) => console.warn("Pipeline note:", e));
    } finally {
      setIsLoading(false);
    }
  };

  // Synchronized active frame
  const activeFrame = session?.timeline?.length
    ? (() => {
        let low = 0;
        let high = session.timeline.length - 1;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          if (session.timeline[mid].t < currentTime) {
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        const idx = Math.min(Math.max(0, low), session.timeline.length - 1);
        return session.timeline[idx];
      })()
    : null;

  return (
    <div className="flex flex-col h-screen bg-[#0F172A] text-slate-100 select-none overflow-hidden font-sans">
      {/* Top Technical Navigation Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-black text-sm tracking-tighter">
              AG
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                ApexGuard
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded">
                  v2.0
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono -mt-0.5">
                Telemetry Incident Review & Rulebook Governance
              </div>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-slate-800 mx-2 hidden sm:block" />

          {/* Circuit Banner */}
          {session && (
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span className="text-slate-400">Circuit:</span>
              <span className="font-semibold text-slate-200">
                {session.track_name}
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                {session.track.total_length_m.toFixed(0)}m
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  session.track.is_fallback
                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                    : "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                }`}
              >
                {session.track.is_fallback ? "Fallback Ribbon" : "Surveyed Track"}
              </span>
              {triage && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    triage.decision === "INFRINGEMENT"
                      ? "bg-red-500/20 text-red-300 border-red-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  {triage.decision}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Top Right Actions */}
        <div className="flex items-center gap-2">
          {/* Real Incident Sample Switcher */}
          {samples.length > 0 && (
            <div className="relative">
              <select
                value={activeSampleId}
                onChange={(e) => loadSelectedSample(e.target.value)}
                className="bg-slate-800/80 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 pr-7 appearance-none cursor-pointer hover:bg-slate-700 transition font-medium"
              >
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload CSVs</span>
          </button>
        </div>
      </header>

      {/* Spec §7.2: Interconnected Modular Tab Navigation */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 shrink-0">
        <nav
          className={`grid gap-1 w-full max-w-4xl mx-auto py-1 ${
            hasVideo ? "grid-cols-4" : "grid-cols-3"
          }`}
        >
          {/* Conditional Tab 1: Broadcast Footage (Only when hasVideo is true) */}
          {hasVideo && (
            <button
              onClick={() => setActiveTab("footage")}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                activeTab === "footage"
                  ? "bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-md"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <Tv className="w-4 h-4 text-purple-400" />
              <span>Broadcast Footage</span>
            </button>
          )}

          {/* Tab 2: Forensic Radar 2D */}
          <button
            onClick={() => setActiveTab("radar")}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
              activeTab === "radar"
                ? "bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Radar className="w-4 h-4 text-cyan-400" />
            <span>Forensic Radar 2D</span>
          </button>

          {/* Tab 3: Telemetry Studio */}
          <button
            onClick={() => setActiveTab("curves")}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
              activeTab === "curves"
                ? "bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Telemetry Studio</span>
          </button>

          {/* Tab 4: FIA Bulletin */}
          <button
            onClick={() => setActiveTab("bulletin")}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
              activeTab === "bulletin"
                ? "bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <FileCheck2 className="w-4 h-4 text-amber-400" />
            <span>FIA Bulletin</span>
          </button>
        </nav>
      </div>

      {/* Main Workspace Body */}
      <main className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800 gap-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <div className="text-xs font-mono text-slate-400">
                Processing 20Hz Telemetry & Kinematics...
              </div>
            </div>
          ) : session ? (
            <>
              {/* Dynamic Tab Views */}
              <div className="flex-1 relative min-h-0 overflow-hidden">
                {activeTab === "footage" && hasVideo && (
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <BroadcastFootage
                      videoSrc={videoSrc}
                      currentTime={currentTime}
                      onTimeChange={setCurrentTime}
                      startTime={session.timeline[0]?.t || 0}
                      className="max-w-4xl w-full"
                    />
                  </div>
                )}

                {activeTab === "radar" && (
                  <TrackRadar2D
                    session={session}
                    currentTime={currentTime}
                    onTimeChange={setCurrentTime}
                    carAColor="#06B6D4"
                    carBColor="#F43F5E"
                  />
                )}

                {activeTab === "curves" && (
                  <TelemetryCurves
                    session={session}
                    currentTime={currentTime}
                    onTimeChange={setCurrentTime}
                    carAColor="#06B6D4"
                    carBColor="#F43F5E"
                  />
                )}

                {activeTab === "bulletin" && (
                  <FIABulletinView
                    session={session}
                    bulletin={bulletin}
                    triage={triage}
                    kinematics={kinematics}
                    onUpdateBulletin={(b, t, k) => {
                      setBulletin(b);
                      setTriage(t);
                      setKinematics(k);
                    }}
                  />
                )}
              </div>

              {/* Bottom Docked Scrubber (Persistent across views) */}
              <div className="shrink-0">
                <TimelineScrubber
                  session={session}
                  currentTime={currentTime}
                  onTimeChange={setCurrentTime}
                  carAColor="#06B6D4"
                  carBColor="#F43F5E"
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800 p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-400 mb-2" />
              <div className="text-sm font-semibold text-slate-200">
                {error ? "Backend Connection Error" : "No Telemetry Session Loaded"}
              </div>
              <div className="text-xs text-slate-400 max-w-md mt-1">
                {error ? (
                  <span className="text-red-400">
                    {error}. The frontend cannot reach the ApexGuard API at{" "}
                    <code className="text-cyan-300 font-mono bg-slate-800 px-1 py-0.5 rounded">
                      {API_BASE}
                    </code>
                    . If deployed on Vercel, ensure the backend is running and{" "}
                    <code className="text-cyan-300 font-mono bg-slate-800 px-1 py-0.5 rounded">
                      NEXT_PUBLIC_API_URL
                    </code>{" "}
                    is set in Vercel project environment variables.
                  </span>
                ) : (
                  "Upload dual car telemetry CSV files or select an authentic sample case from the dropdown."
                )}
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-xs transition"
                >
                  Upload Telemetry Files
                </button>
                {error && (
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-xs transition border border-slate-700"
                  >
                    Retry Connection
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Forensic Sidebar (Incident Overview & Breach Metrics) */}
        {session && (
          <aside className="w-80 border-l border-slate-800 bg-slate-900/60 backdrop-blur-md p-3.5 flex flex-col gap-4 overflow-y-auto shrink-0 hidden lg:flex">
            {/* Active Incident Breach Overview */}
            {kinematics && (
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                    Kinematic Review
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                      kinematics.categorization === "RACING_INCIDENT"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-red-500/20 text-red-300 border-red-500/30"
                    }`}
                  >
                    {kinematics.categorization}
                  </span>
                </div>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Closing Speed:</span>
                    <span className="font-bold text-amber-300">
                      {kinematics.closing_velocity_kmh.toFixed(1)} km/h
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Lateral Squeeze:</span>
                    <span className="text-slate-200">
                      {kinematics.lateral_convergence_ms.toFixed(2)} m/s
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Chassis Overlap:</span>
                    <span className="text-cyan-400 font-bold">
                      {(kinematics.overlap_ratio * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Min Separation:</span>
                    <span
                      className={`font-bold ${
                        kinematics.min_separation_m < 2.0
                          ? "text-red-400"
                          : "text-amber-300"
                      }`}
                    >
                      {kinematics.min_separation_m.toFixed(2)}m
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Session Competitors Card */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mb-2">
                Competitors
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between border-l-2 border-cyan-400 pl-2">
                  <div>
                    <div className="text-xs font-bold text-cyan-400">
                      {session.competitor_a.driver}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {session.competitor_a.car}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-mono">Laptime</div>
                    <div className="text-xs font-mono text-slate-200 font-semibold">
                      {session.competitor_a.reference_laptime?.toFixed(3)}s
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-l-2 border-rose-400 pl-2">
                  <div>
                    <div className="text-xs font-bold text-rose-400">
                      {session.competitor_b.driver}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {session.competitor_b.car}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-mono">Laptime</div>
                    <div className="text-xs font-mono text-slate-200 font-semibold">
                      {session.competitor_b.reference_laptime?.toFixed(3)}s
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Incident Markers Feed */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                  Encounter Peaks (&lt;4.0m)
                </div>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono px-1.5 py-0.2 rounded border border-amber-500/30">
                  {session.incident_markers.length}
                </span>
              </div>

              <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                {session.incident_markers.map((marker, idx) => {
                  const isActive = Math.abs(currentTime - marker.timestamp) < 0.2;
                  return (
                    <div
                      key={marker.incident_id}
                      onClick={() => setCurrentTime(marker.timestamp)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition ${
                        isActive
                          ? "bg-cyan-950/40 border-cyan-500/60 ring-1 ring-cyan-500/30"
                          : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono text-slate-200">
                          #{idx + 1} {marker.incident_id.toUpperCase()}
                        </span>
                        {marker.is_primary && (
                          <span className="text-[9px] bg-red-500/20 text-red-300 px-1.5 py-0.2 rounded font-mono border border-red-500/30">
                            PRIMARY
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[11px] font-mono">
                        <span className="text-slate-400">Timestamp:</span>
                        <span className="text-slate-200 font-semibold">
                          {marker.timestamp.toFixed(2)}s
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-400">Clearance:</span>
                        <span
                          className={`font-bold ${
                            marker.distance_m < 2.0
                              ? "text-red-400"
                              : "text-amber-400"
                          }`}
                        >
                          {marker.distance_m.toFixed(2)} m
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        )}
      </main>

      {/* Dual CSV + Footage Ingestion Modal */}
      <IngestModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSubmit={handleCustomUpload}
        onSelectSample={loadSelectedSample}
        samples={samples}
        tracks={tracks}
        isLoading={isLoading}
      />
    </div>
  );
}
