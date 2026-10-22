"use client";

import React, { useState } from "react";
import {
  SessionState,
  IncidentStateVector,
  TriageResult,
  StewardsBulletin,
} from "@/lib/types";
import { runFullPipeline } from "@/lib/api";
import {
  ShieldCheck,
  Scale,
  FileText,
  Printer,
  RefreshCw,
  AlertOctagon,
  CheckCircle,
} from "lucide-react";

interface FIABulletinViewProps {
  session: SessionState;
  bulletin: StewardsBulletin | null;
  triage: TriageResult | null;
  kinematics: IncidentStateVector | null;
  onUpdateBulletin?: (bulletin: StewardsBulletin, triage: TriageResult, kinematics: IncidentStateVector) => void;
  className?: string;
}

export const FIABulletinView: React.FC<FIABulletinViewProps> = ({
  session,
  bulletin,
  triage,
  kinematics,
  onUpdateBulletin,
  className = "",
}) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const handleRunPipeline = async () => {
    try {
      setIsRunning(true);
      const res = await runFullPipeline(session);
      if (onUpdateBulletin) {
        onUpdateBulletin(res.bulletin, res.triage, res.kinematics);
      }
    } catch (e: any) {
      alert(`Pipeline execution error: ${e.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`flex flex-col gap-4 w-full h-full p-4 overflow-y-auto ${className}`}>
      {/* Action Bar */}
      <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-md">
        <div className="flex items-center gap-2 text-xs">
          <Scale className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200">
            FIA Stewards' Official Decision Document
          </span>
          {bulletin && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Provider: {bulletin.provider}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRunPipeline}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? "animate-spin" : ""}`} />
            <span>{isRunning ? "Deliberating..." : "Re-evaluate Pipeline"}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Bulletin</span>
          </button>
        </div>
      </div>

      {bulletin ? (
        /* Formal Printable FIA Document Card */
        <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-8 shadow-2xl max-w-4xl mx-auto w-full text-slate-100 font-sans print:bg-white print:text-black print:border-none print:shadow-none">
          {/* Header Banner */}
          <div className="border-b-2 border-slate-800 print:border-black pb-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xl font-black tracking-wider text-white print:text-black">
                  FIA FORMULA ONE WORLD CHAMPIONSHIP
                </div>
                <div className="text-xs uppercase tracking-widest text-slate-400 print:text-gray-600 font-mono mt-0.5">
                  The Panel of Stewards of the Meeting
                </div>
              </div>
              <div className="text-right font-mono text-xs text-slate-400 print:text-gray-600">
                <div className="font-bold text-cyan-400 print:text-black text-sm">
                  {bulletin.document_id}
                </div>
                <div>{bulletin.timestamp_utc}</div>
              </div>
            </div>
          </div>

          {/* Session Overview Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-900/50 print:bg-gray-100 rounded-xl mb-6 text-xs font-mono">
            <div>
              <span className="text-slate-500 uppercase text-[10px] block">Event</span>
              <span className="font-semibold text-slate-200 print:text-black">
                {bulletin.event}
              </span>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] block">Session</span>
              <span className="font-semibold text-slate-200 print:text-black">
                {bulletin.session_name}
              </span>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] block">Competitor Penalized</span>
              <span className="font-semibold text-cyan-400 print:text-black">
                {bulletin.competitor_penalized || "None (Racing Incident)"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] block">Sanction</span>
              <span
                className={`font-bold ${
                  bulletin.time_penalty_seconds
                    ? "text-red-400 print:text-red-600"
                    : "text-emerald-400 print:text-green-600"
                }`}
              >
                {bulletin.decision}
              </span>
            </div>
          </div>

          {/* Decision Headline Banner */}
          <div
            className={`p-4 rounded-xl mb-6 border flex items-center gap-3 ${
              bulletin.time_penalty_seconds
                ? "bg-red-950/30 border-red-500/40 text-red-200"
                : "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
            }`}
          >
            {bulletin.time_penalty_seconds ? (
              <AlertOctagon className="w-6 h-6 text-red-400 shrink-0" />
            ) : (
              <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
            )}
            <div>
              <div className="font-bold text-sm tracking-wide">
                {bulletin.headline}
              </div>
              <div className="text-xs font-mono opacity-90 mt-0.5">
                {bulletin.infringement}
              </div>
            </div>
          </div>

          {/* Section: Facts Established */}
          <div className="mb-6 space-y-2">
            <h3 className="text-xs font-mono uppercase tracking-widest text-slate-400 print:text-gray-700 font-bold">
              1. Established Telemetry Facts
            </h3>
            <p className="text-xs leading-relaxed text-slate-300 print:text-black font-mono bg-slate-900/30 p-3 rounded-lg border border-slate-800/60 print:border-gray-300">
              {bulletin.facts}
            </p>
          </div>

          {/* Section: Reason & Rationale */}
          <div className="mb-8 space-y-2">
            <h3 className="text-xs font-mono uppercase tracking-widest text-slate-400 print:text-gray-700 font-bold">
              2. Stewards' Findings & Legal Reasoning
            </h3>
            <p className="text-xs leading-relaxed text-slate-300 print:text-black bg-slate-900/30 p-3 rounded-lg border border-slate-800/60 print:border-gray-300">
              {bulletin.reasoning}
            </p>
          </div>

          {/* Signatories Footer */}
          <div className="border-t border-slate-800 print:border-black pt-6">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-3">
              The Stewards of the Meeting
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[11px] font-mono text-slate-300 print:text-black">
              {bulletin.signatories.map((name, i) => (
                <div key={i} className="border-t border-slate-700/60 pt-2">
                  <div className="font-semibold">{name.split("(")[0]}</div>
                  <div className="text-[9px] text-slate-500">
                    {name.includes("(") ? `(${name.split("(")[1]}` : "FIA Official"}
                  </div>
                </div>
              ))}
            </div>

            {/* Nominative Fair Use / Educational Prototype Disclaimer */}
            <div className="mt-8 pt-4 border-t border-slate-800/40 text-[9px] text-slate-500 font-mono text-center leading-normal">
              ApexGuard is an independent open-source educational prototype built for the AWS Builder Hackathon. Formula 1, F1, and FIA are registered trademarks of their respective entities and are referenced solely for technical evaluation under nominative fair use.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900/40 rounded-xl border border-slate-800 text-center">
          <FileText className="w-10 h-10 text-slate-600 mb-2" />
          <div className="text-sm font-semibold text-slate-300">
            No Stewards' Decision Document Generated
          </div>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
            Execute the review pipeline to analyze the active incident slice and produce an official FIA judicial ruling.
          </p>
          <button
            onClick={handleRunPipeline}
            disabled={isRunning}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg transition"
          >
            Run Review Pipeline
          </button>
        </div>
      )}
    </div>
  );
};
