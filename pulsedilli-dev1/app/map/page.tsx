"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import MapLibreView from "@/components/MapLibreView";

/**
 * Full-page ward choropleth map — same MapLibre implementation as the
 * Dashboard card, expanded to fill the entire main content area.
 * Sidebar and layout are untouched (handled by app/layout.tsx).
 */
export default function MapPage() {
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [department, setDepartment] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="relative w-full h-full overflow-hidden bg-white">
      {/* ── Filter bar — top left ─────────────────────────────────── */}
      <div className="absolute top-4 left-4 bg-white/95 p-3 rounded-lg shadow-sm z-10 flex gap-4 items-center backdrop-blur-sm border border-black/5">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
            Severity
          </label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="px-2 py-1.5 rounded-md border border-slate-200 text-xs font-medium bg-slate-50 text-slate-800 cursor-pointer outline-none hover:border-slate-300 focus:border-red-500 min-w-[120px]"
          >
            <option value="all">All Severities</option>
            <option value="severe">Severe</option>
            <option value="moderate">Moderate</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-2 py-1.5 rounded-md border border-slate-200 text-xs font-medium bg-slate-50 text-slate-800 cursor-pointer outline-none hover:border-slate-300 focus:border-red-500 min-w-[120px]"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
            Department
          </label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="px-2 py-1.5 rounded-md border border-slate-200 text-xs font-medium bg-slate-50 text-slate-800 cursor-pointer outline-none hover:border-slate-300 focus:border-red-500 min-w-[120px]"
          >
            <option value="all">All Departments</option>
            <option value="power">Power</option>
            <option value="water">Water</option>
            <option value="mcd">MCD (Sanitation)</option>
            <option value="transport">Transport</option>
            <option value="pwd">PWD (Roads)</option>
          </select>
        </div>
      </div>

      {/* ── Search bar — top right ────────────────────────────────── */}
      <div className="absolute top-4 right-4 z-10 bg-white/95 rounded-full shadow-sm px-4 py-2 flex items-center border border-black/5 backdrop-blur-sm w-[240px]">
        <Search className="w-4 h-4 text-slate-400 mr-2" />
        <input
          type="text"
          placeholder="Search area..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-none bg-transparent text-sm text-slate-800 w-full outline-none placeholder:text-slate-400"
        />
      </div>

      {/* ── MapLibre map fills the full container ─────────────────── */}
      <MapLibreView
        severity={severity}
        status={status}
        department={department}
        searchQuery={searchQuery}
      />
    </div>
  );
}
