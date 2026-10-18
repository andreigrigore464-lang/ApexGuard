"use client";

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import { SessionState } from "@/lib/types";

interface TelemetryCurvesProps {
  session: SessionState;
  currentTime: number;
  onTimeChange: (time: number) => void;
  carAColor?: string;
  carBColor?: string;
}

export const TelemetryCurves: React.FC<TelemetryCurvesProps> = ({
  session,
  currentTime,
  onTimeChange,
  carAColor = "#06B6D4", // Cyan
  carBColor = "#F43F5E", // Rose
}) => {
  const timeline = session.timeline;

  // Prepare chart dataset (downsampled to ~300-400 points for smooth charting)
  const chartData = useMemo(() => {
    if (!timeline.length) return [];
    const step = Math.max(1, Math.floor(timeline.length / 350));
    const pts = [];

    for (let i = 0; i < timeline.length; i += step) {
      const f = timeline[i];
      pts.push({
        time: f.t,
        speedA: Math.round(f.car_a.speed_kmh),
        speedB: Math.round(f.car_b.speed_kmh),
        throttleA: Math.round(f.car_a.throttle_pct),
        throttleB: Math.round(f.car_b.throttle_pct),
        brakeA: Math.round(f.car_a.brake_pct),
        brakeB: Math.round(f.car_b.brake_pct),
        steerA: Math.round(f.car_a.steer_pct),
        steerB: Math.round(f.car_b.steer_pct),
        glatA: parseFloat(f.car_a.glat.toFixed(2)),
        glatB: parseFloat(f.car_b.glat.toFixed(2)),
        separation: parseFloat(f.separation_m.toFixed(2)),
      });
    }
    return pts;
  }, [timeline]);

  const handleChartClick = (e: any) => {
    if (e && e.activeLabel !== undefined) {
      onTimeChange(Number(e.activeLabel));
    }
  };

  const driverA = session.competitor_a.driver;
  const driverB = session.competitor_b.driver;

  return (
    <div className="flex flex-col gap-4 w-full h-full p-4 overflow-y-auto">
      {/* Chart 1: Speed Comparison */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            Speed Comparison (km/h)
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Cursor: <span className="text-cyan-400 font-bold">{currentTime.toFixed(2)}s</span>
          </div>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              onClick={handleChartClick}
              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="time"
                tick={{ fill: "#64748B", fontSize: 10 }}
                tickFormatter={(val) => `${val.toFixed(0)}s`}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "#64748B", fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0F172A",
                  borderColor: "#334155",
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
              />
              <ReferenceLine
                x={currentTime}
                stroke="#FACC15"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="speedA"
                name={`${driverA} (km/h)`}
                stroke={carAColor}
                strokeWidth={1.8}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="speedB"
                name={`${driverB} (km/h)`}
                stroke={carBColor}
                strokeWidth={1.8}
                dot={false}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                iconType="circle"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Driver Control Inputs (Throttle & Brake) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Pedal Telemetry (Throttle & Brake %)
          </div>
          <div className="text-[11px] font-mono text-slate-400">0 – 100 %</div>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              onClick={handleChartClick}
              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="time"
                tick={{ fill: "#64748B", fontSize: 10 }}
                tickFormatter={(val) => `${val.toFixed(0)}s`}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#64748B", fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0F172A",
                  borderColor: "#334155",
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
              />
              <ReferenceLine
                x={currentTime}
                stroke="#FACC15"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="throttleA"
                name={`${driverA} Throttle %`}
                stroke={carAColor}
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="brakeA"
                name={`${driverA} Brake %`}
                stroke="#EF4444"
                strokeWidth={1.5}
                strokeDasharray="2 2"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="throttleB"
                name={`${driverB} Throttle %`}
                stroke={carBColor}
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="brakeB"
                name={`${driverB} Brake %`}
                stroke="#F59E0B"
                strokeWidth={1.5}
                strokeDasharray="2 2"
                dot={false}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                iconType="circle"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 3: Steering Angle & Lateral G-Force */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            Dynamics & Lateral G-Force (G)
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Lateral Acceleration
          </div>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              onClick={handleChartClick}
              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="time"
                tick={{ fill: "#64748B", fontSize: 10 }}
                tickFormatter={(val) => `${val.toFixed(0)}s`}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "#64748B", fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0F172A",
                  borderColor: "#334155",
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
              />
              <ReferenceLine
                x={currentTime}
                stroke="#FACC15"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="glatA"
                name={`${driverA} Lat G`}
                stroke={carAColor}
                strokeWidth={1.6}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="glatB"
                name={`${driverB} Lat G`}
                stroke={carBColor}
                strokeWidth={1.6}
                dot={false}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                iconType="circle"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
