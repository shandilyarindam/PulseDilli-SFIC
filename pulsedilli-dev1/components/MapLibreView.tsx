"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

interface MapLibreViewProps {
  severity: string;
  status: string;
  department: string;
  searchQuery: string;
}

interface ComplaintPoint {
  id: string;
  ticket_id: string;
  status: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  location: string | null;
  description: string | null;
  categories: { name: string; department: string } | null;
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  submitted: "#f59e0b",
  open: "#f97316",
  in_progress: "#3b82f6",
  resolved: "#22c55e",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

const DEPT_COLOUR: Record<string, string> = {
  power: "#f59e0b",
  water: "#3b82f6",
  mcd: "#22c55e",
  transport: "#8b5cf6",
  pwd: "#64748b",
  sanitation: "#22c55e",
  roads: "#64748b",
  electricity: "#f59e0b",
};

function getDeptColour(dept: string | null | undefined): string {
  if (!dept) return "#e63946";
  const key = dept.toLowerCase();
  for (const [k, v] of Object.entries(DEPT_COLOUR)) {
    if (key.includes(k)) return v;
  }
  return "#e63946";
}

// ── GeoJSON builder ───────────────────────────────────────────────────────────

function complaintsToGeoJSON(
  complaints: ComplaintPoint[]
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = complaints
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [c.longitude!, c.latitude!],
      },
      properties: {
        id: c.id,
        ticket_id: c.ticket_id,
        status: c.status,
        created_at: c.created_at,
        location: c.location ?? "",
        description: c.description ?? "",
        department: c.categories?.department ?? "",
        category_name: c.categories?.name ?? "",
        dot_color: getDeptColour(c.categories?.department),
      },
    }));

  return { type: "FeatureCollection", features };
}

// ── Ward lookup (point-in-polygon via loaded ward GeoJSON) ────────────────────

let cachedWards: GeoJSON.FeatureCollection | null = null;

async function getWards(): Promise<GeoJSON.FeatureCollection | null> {
  if (cachedWards) return cachedWards;
  try {
    const res = await fetch("/pulsedilli_wards_mapped.geojson");
    cachedWards = await res.json();
    return cachedWards;
  } catch {
    return null;
  }
}

function findWard(
  lng: number,
  lat: number,
  wards: GeoJSON.FeatureCollection
): { ward_no: number | null; ward_name: string; ac_name: string } {
  for (const feature of wards.features) {
    if (!feature.geometry) continue;
    if (pointInPolygon([lng, lat], feature.geometry as any)) {
      const p = feature.properties as any;
      return {
        ward_no: p.ward_no ?? null,
        ward_name: p.ward_name ?? "Unknown Ward",
        ac_name: p.ac_name ?? "",
      };
    }
  }
  return { ward_no: null, ward_name: "Unknown Ward", ac_name: "" };
}

/** Minimal ray-casting point-in-polygon — handles Polygon + MultiPolygon */
function pointInPolygon(
  point: [number, number],
  geometry: GeoJSON.Geometry
): boolean {
  if (geometry.type === "Polygon") {
    return raycast(point, geometry.coordinates[0]);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((poly) => raycast(point, poly[0]));
  }
  return false;
}

function raycast(
  [px, py]: [number, number],
  ring: number[][]
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Popup HTML builder ────────────────────────────────────────────────────────

function buildPopupHTML(
  props: Record<string, any>,
  ward: { ward_no: number | null; ward_name: string; ac_name: string }
): string {
  const statusColour = STATUS_COLOURS[props.status] ?? "#64748b";
  const statusLabel = STATUS_LABEL[props.status] ?? props.status;
  const dept = props.department || props.category_name || "General";
  const deptColour = getDeptColour(props.department);
  const date = props.created_at
    ? new Date(props.created_at).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  const wardLabel =
    ward.ward_no && ward.ward_no < 998
      ? `Ward ${ward.ward_no} · ${ward.ward_name}`
      : ward.ward_name;

  const locationLine =
    props.location || (ward.ac_name ? `${ward.ac_name} Assembly` : "Delhi");

  const descLine = props.description
    ? `<div style="font-size:12px;color:#374151;line-height:1.5;margin-bottom:10px;padding:8px;background:#f8fafc;border-radius:6px;border-left:3px solid ${deptColour};">${props.description.slice(0, 160)}${props.description.length > 160 ? "…" : ""}</div>`
    : "";

  return `
<div style="font-family:'Inter',system-ui,sans-serif;width:260px;padding:0;border-radius:10px;overflow:hidden;">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:12px 14px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:2px;">Complaint</div>
      <div style="font-size:14px;font-weight:800;color:#ffffff;">#${props.ticket_id || props.id.slice(0, 8)}</div>
    </div>
    <div style="padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;color:#fff;background:${statusColour};letter-spacing:0.04em;white-space:nowrap;">
      ${statusLabel}
    </div>
  </div>

  <!-- Body -->
  <div style="padding:12px 14px;background:#ffffff;">

    <!-- Ward & Location -->
    <div style="margin-bottom:10px;">
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px;">📍 ${wardLabel}</div>
      <div style="font-size:11px;color:#6b7280;">${locationLine}</div>
    </div>

    <!-- Description -->
    ${descLine}

    <!-- Meta tags -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:2px;">
      <span style="padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;background:${deptColour}18;color:${deptColour};border:1px solid ${deptColour}40;">
        ${dept}
      </span>
      <span style="padding:3px 8px;border-radius:20px;font-size:10px;font-weight:600;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;">
        📅 ${date}
      </span>
    </div>
  </div>
</div>`;
}

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * MapLibreView — Delhi ward choropleth + live Supabase complaint bubbles.
 *
 * Layers (bottom → top):
 *  1. Carto Positron basemap
 *  2. Ward fill (red gradient choropleth, data-driven by filter props)
 *  3. Ward outline (white 1px)
 *  4. Delhi boundary (red dashed)
 *  5. Complaint circles (colour-coded by department, realtime updates)
 */
export default function MapLibreView({
  severity,
  status,
  department,
  searchQuery,
}: MapLibreViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const complaintsRef = useRef<ComplaintPoint[]>([]);

  // Ref-mirror filter values so hover handlers don't go stale
  const filterRefs = useRef({ severity, status, department, searchQuery });

  // ── Helper: compute ward-choropleth count from filter state ───────────
  const getActiveComplaintCount = (props: Record<string, any>): number => {
    const state = filterRefs.current;
    const severities =
      state.severity === "all" ? ["severe", "moderate"] : [state.severity];
    const statuses =
      state.status === "all"
        ? ["pending", "in_progress", "resolved"]
        : [state.status];
    const departments =
      state.department === "all"
        ? ["power", "water", "mcd", "transport", "pwd"]
        : [state.department];
    let total = 0;
    severities.forEach((s) =>
      statuses.forEach((st) =>
        departments.forEach((d) => {
          total += props[`comp_${s}_${st}_${d}`] || 0;
        })
      )
    );
    return total;
  };

  // ── Refresh the complaints GeoJSON source on the map ──────────────────
  const refreshComplaintsSource = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("complaints-source") as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(complaintsToGeoJSON(complaintsRef.current));
    }
  };

  // ── Sync ward-filter props changes to the live map ────────────────────
  useEffect(() => {
    filterRefs.current = { severity, status, department, searchQuery };
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const severities =
      severity === "all" ? ["severe", "moderate"] : [severity];
    const statuses =
      status === "all"
        ? ["pending", "in_progress", "resolved"]
        : [status];
    const departments =
      department === "all"
        ? ["power", "water", "mcd", "transport", "pwd"]
        : [department];

    const fieldExp: any[] = ["+", 0];
    severities.forEach((s) =>
      statuses.forEach((st) =>
        departments.forEach((d) =>
          fieldExp.push(["get", `comp_${s}_${st}_${d}`])
        )
      )
    );

    const maxVal = severities.length * statuses.length * departments.length * 35;

    if (map.getLayer("wards-fill")) {
      map.setPaintProperty("wards-fill", "fill-color", [
        "interpolate",
        ["linear"],
        fieldExp,
        0, "#ffe5e5",
        maxVal * 0.3, "#ff9999",
        maxVal * 0.6, "#e63946",
        maxVal, "#990000",
      ]);

      const term = searchQuery.toLowerCase().trim();
      if (term.length > 0) {
        map.setFilter("wards-fill", ["in", term, ["downcase", ["get", "ward_name"]]]);
        map.setFilter("wards-outline", ["in", term, ["downcase", ["get", "ward_name"]]]);
      } else {
        map.setFilter("wards-fill", null);
        map.setFilter("wards-outline", null);
      }
    }
  }, [severity, status, department, searchQuery]);

  // ── One-time map initialisation ───────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [77.1025, 28.65],
      zoom: 10,
      minZoom: 9,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
      "bottom-right"
    );

    let hoveredWardId: string | number | null = null;
    const wardHoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 15,
    });

    map.on("load", async () => {
      // ── 1. Ward choropleth ─────────────────────────────────────────
      map.addSource("wards", {
        type: "geojson",
        data: "/pulsedilli_wards_mapped.geojson",
        generateId: true,
      });

      map.addLayer({
        id: "wards-fill",
        type: "fill",
        source: "wards",
        paint: {
          "fill-color": [
            "interpolate", ["linear"],
            ["get", "complaints_total"],
            0, "#ffe5e5",
            500, "#ff9999",
            1000, "#e63946",
            2000, "#990000",
          ],
          "fill-opacity": [
            "case", ["boolean", ["feature-state", "hover"], false], 0.75, 0.5,
          ],
        },
      });

      map.addLayer({
        id: "wards-outline",
        type: "line",
        source: "wards",
        paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.8 },
      });

      // ── 2. Delhi state boundary ────────────────────────────────────
      map.addSource("boundary", { type: "geojson", data: "/Delhi_Boundary.geojson" });
      map.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary",
        paint: { "line-color": "#e63946", "line-width": 2, "line-dasharray": [2, 2] },
      });

      // ── 3. Complaints point source & layer ─────────────────────────
      map.addSource("complaints-source", {
        type: "geojson",
        data: complaintsToGeoJSON([]),  // start empty; filled after fetch
      });

      // Halo / glow ring
      map.addLayer({
        id: "complaints-halo",
        type: "circle",
        source: "complaints-source",
        paint: {
          "circle-radius": 13,
          "circle-color": ["get", "dot_color"],
          "circle-opacity": 0.15,
          "circle-stroke-width": 0,
        },
      });

      // Main dot
      map.addLayer({
        id: "complaints-layer",
        type: "circle",
        source: "complaints-source",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            9, 5,
            12, 8,
            15, 11,
          ],
          "circle-color": ["get", "dot_color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.92,
        },
      });

      // ── 4. Fetch initial complaints from Supabase ──────────────────
      const { data, error } = await supabase
        .from("complaints")
        .select(
          "id, ticket_id, status, created_at, latitude, longitude, location, description, categories(name, department)"
        )
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000) as any;

      if (!error && data) {
        complaintsRef.current = data;
        const src = map.getSource("complaints-source") as maplibregl.GeoJSONSource;
        src.setData(complaintsToGeoJSON(data));
      }

      // ── 5. Realtime subscription ───────────────────────────────────
      const channel = supabase
        .channel("map-complaints")
        .on(
          "postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "complaints" },
          (payload: any) => {
            const newRow = payload.new as ComplaintPoint;
            if (newRow.latitude != null && newRow.longitude != null) {
              complaintsRef.current = [newRow, ...complaintsRef.current];
              const src = mapRef.current?.getSource("complaints-source") as maplibregl.GeoJSONSource | undefined;
              src?.setData(complaintsToGeoJSON(complaintsRef.current));
            }
          }
        )
        .on(
          "postgres_changes" as any,
          { event: "UPDATE", schema: "public", table: "complaints" },
          (payload: any) => {
            const updated = payload.new as ComplaintPoint;
            complaintsRef.current = complaintsRef.current.map((c) =>
              c.id === updated.id ? { ...c, ...updated } : c
            );
            const src = mapRef.current?.getSource("complaints-source") as maplibregl.GeoJSONSource | undefined;
            src?.setData(complaintsToGeoJSON(complaintsRef.current));
          }
        )
        .subscribe();

      // Store channel ref for cleanup
      (map as any)._realtimeChannel = channel;

      // ── 6. Ward hover interaction ──────────────────────────────────
      map.on("mousemove", "wards-fill", (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = "pointer";

        if (hoveredWardId !== null) {
          map.setFeatureState({ source: "wards", id: hoveredWardId }, { hover: false });
        }
        hoveredWardId = e.features[0].id ?? null;
        if (hoveredWardId !== null) {
          map.setFeatureState({ source: "wards", id: hoveredWardId }, { hover: true });
        }

        const props = e.features[0].properties as Record<string, any>;
        const activeVal = getActiveComplaintCount(props);
        const wardTitle =
          props.ward_no === 998 || props.ward_no === 999
            ? props.ward_name
            : `${props.ward_name} (Ward ${props.ward_no})`;

        wardHoverPopup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:'Inter',sans-serif;min-width:200px;padding:4px;">
              <div style="font-weight:700;font-size:15px;margin-bottom:4px;color:#212529;">${wardTitle}</div>
              <div style="font-size:12px;color:#6c757d;margin-bottom:12px;">${props.ac_name} Assembly</div>
              <div style="display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;padding:10px 12px;border-radius:8px;border:1px solid #e9ecef;">
                <span style="font-size:12px;font-weight:600;color:#495057;">Complaints</span>
                <span style="font-weight:700;color:#e63946;font-size:16px;">${activeVal}</span>
              </div>
            </div>`)
          .addTo(map);
      });

      map.on("mouseleave", "wards-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredWardId !== null) {
          map.setFeatureState({ source: "wards", id: hoveredWardId }, { hover: false });
        }
        hoveredWardId = null;
        wardHoverPopup.remove();
      });

      // Ward click → Councillor / MLA info
      map.on("click", "wards-fill", (e) => {
        if (!e.features?.length) return;
        const props = e.features[0].properties as Record<string, any>;
        const councillor = props.Councillor_Name || "N/A";
        const mla = props.MLA_Name || "N/A";
        const party = props.Party || "N/A";
        const wardTitle =
          props.ward_no === 998 || props.ward_no === 999
            ? props.ward_name
            : `${props.ward_name} (Ward ${props.ward_no})`;

        new maplibregl.Popup({ closeButton: true, offset: 15 })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:'Inter',sans-serif;min-width:200px;padding:4px;">
              <div style="font-weight:700;font-size:15px;margin-bottom:4px;color:#212529;">${wardTitle}</div>
              <div style="font-size:12px;color:#6c757d;margin-bottom:12px;">${props.ac_name} Assembly</div>
              <div style="display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;padding:10px 12px;border-radius:8px;border:1px solid #e9ecef;margin-bottom:8px;">
                <span style="font-size:12px;font-weight:600;color:#495057;">Councillor:</span>
                <span style="font-size:12px;color:#333;font-weight:700;">${councillor} <span style="color:#6c757d;font-weight:normal">(${party})</span></span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;padding:10px 12px;border-radius:8px;border:1px solid #e9ecef;">
                <span style="font-size:12px;font-weight:600;color:#495057;">MLA:</span>
                <span style="font-size:12px;color:#333;font-weight:700;">${mla} <span style="color:#6c757d;font-weight:normal">(${party})</span></span>
              </div>
            </div>`)
          .addTo(map);
      });

      // ── 7. Complaint bubble interactions ───────────────────────────
      // Pointer cursor on hover
      map.on("mouseenter", "complaints-layer", () => {
        map.getCanvas().style.cursor = "pointer";
        wardHoverPopup.remove(); // close any ward hover tooltip
      });
      map.on("mouseleave", "complaints-layer", () => {
        map.getCanvas().style.cursor = "";
      });

      // Click → rich popup card
      map.on("click", "complaints-layer", async (e) => {
        if (!e.features?.length) return;
        e.originalEvent.stopPropagation();

        const props = e.features[0].properties as Record<string, any>;
        const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];

        // Ward lookup via point-in-polygon
        const wards = await getWards();
        const ward = wards
          ? findWard(coords[0], coords[1], wards)
          : { ward_no: null, ward_name: "Delhi", ac_name: "" };

        new maplibregl.Popup({ closeButton: true, maxWidth: "300px", offset: [0, -8] })
          .setLngLat(e.lngLat)
          .setHTML(buildPopupHTML(props, ward))
          .addTo(map);
      });
    });

    // Cleanup
    return () => {
      const channel = (map as any)._realtimeChannel;
      if (channel) supabase.removeChannel(channel);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
  );
}
