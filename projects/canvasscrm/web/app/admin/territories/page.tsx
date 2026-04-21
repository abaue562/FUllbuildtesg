"use client";
// TERRITORY MANAGER — Managers draw polygons on the map, name them,
// assign them to reps. Each territory is a PostGIS polygon stored in
// the territories table. Only doors inside the polygon appear for that rep.
//
// Uses MapLibre GL Draw plugin for freehand polygon drawing.
// MapLibre GL Draw: github.com/mapbox/mapbox-gl-draw (BSD, free)

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { createClient } from "@/lib/supabase-client";

// ── Types ──────────────────────────────────────────────────────────────────────

type Territory = {
  id: string;
  name: string;
  rep_id: string | null;
  rep: { full_name: string } | null;
  geojson: any;
  color: string;
  created_at: string;
};

type Rep = {
  id: string;
  full_name: string;
  avatar_url: string | null;
};

const TERRITORY_COLORS = [
  "#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6",
  "#ec4899","#8b5cf6","#14b8a6","#f97316","#84cc16",
];

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TerritoriesPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const draw = useRef<any>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [drawingActive, setDrawingActive] = useState(false);
  const [pendingFeature, setPendingFeature] = useState<any>(null);
  const [newName, setNewName] = useState("");
  const [newRepId, setNewRepId] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    loadReps();
    loadTerritories();
  }, []);

  async function loadReps() {
    const { data } = await supabase
      .from("users")
      .select("id, full_name, avatar_url")
      .eq("role", "rep")
      .order("full_name");
    setReps(data ?? []);
  }

  async function loadTerritories() {
    const { data } = await supabase
      .from("territories")
      .select(`
        id, name, rep_id, color, created_at,
        rep:users(full_name),
        geojson:geom
      `)
      .order("created_at", { ascending: false });
    setTerritories(data ?? []);
  }

  // ── Init map ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          protomaps: {
            type: "vector",
            url: `${process.env.NEXT_PUBLIC_PROTOMAPS_URL ?? "https://api.protomaps.com/tiles/v3"}/{z}/{x}/{y}.mvt`,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#f8f8f5" } },
          { id: "roads", type: "line", source: "protomaps", "source-layer": "roads",
            paint: { "line-color": "#e0d9c8", "line-width": 1.5 } },
          { id: "buildings", type: "fill", source: "protomaps", "source-layer": "buildings",
            paint: { "fill-color": "#ede8df", "fill-opacity": 0.8 } },
        ],
      },
      center: [-97.7, 30.3],
      zoom: 12,
    });

    // Add Draw control
    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      styles: drawStyles(),
    });
    map.current.addControl(draw.current as any, "top-left");

    map.current.on("draw.create", (e: any) => {
      const feature = e.features[0];
      setPendingFeature(feature);
      setDrawingActive(false);
    });

    // Load existing territories as source layers
    map.current.on("load", () => {
      loadTerritoryLayers();
    });

    return () => { map.current?.remove(); };
  }, []);

  // Re-render territory polygons whenever territories change
  useEffect(() => {
    if (!map.current?.loaded()) return;
    loadTerritoryLayers();
  }, [territories]);

  function loadTerritoryLayers() {
    if (!map.current) return;
    // Remove old layers
    territories.forEach((t) => {
      if (map.current!.getLayer(`territory-fill-${t.id}`)) map.current!.removeLayer(`territory-fill-${t.id}`);
      if (map.current!.getLayer(`territory-line-${t.id}`)) map.current!.removeLayer(`territory-line-${t.id}`);
      if (map.current!.getLayer(`territory-label-${t.id}`)) map.current!.removeLayer(`territory-label-${t.id}`);
      if (map.current!.getSource(`territory-${t.id}`)) map.current!.removeSource(`territory-${t.id}`);
    });

    // Add each territory
    territories.forEach((t) => {
      if (!t.geojson) return;
      const sourceId = `territory-${t.id}`;
      map.current!.addSource(sourceId, {
        type: "geojson",
        data: { type: "Feature", geometry: t.geojson, properties: { name: t.name } },
      });
      map.current!.addLayer({
        id: `territory-fill-${t.id}`,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": t.color ?? "#6366f1", "fill-opacity": 0.12 },
      });
      map.current!.addLayer({
        id: `territory-line-${t.id}`,
        type: "line",
        source: sourceId,
        paint: { "line-color": t.color ?? "#6366f1", "line-width": 2.5, "line-dasharray": [4, 2] },
      });
    });
  }

  // ── Save new territory ─────────────────────────────────────────────────────

  async function savePending() {
    if (!pendingFeature || !newName.trim()) return;
    setSaving(true);
    try {
      const colorIdx = territories.length % TERRITORY_COLORS.length;
      const color = TERRITORY_COLORS[colorIdx];

      const { error } = await supabase.from("territories").insert({
        name: newName.trim(),
        rep_id: newRepId || null,
        color,
        // Store the GeoJSON geometry — PostGIS will convert via generated column
        geom: pendingFeature.geometry,
      });

      if (!error) {
        setPendingFeature(null);
        setNewName("");
        setNewRepId("");
        draw.current?.deleteAll();
        await loadTerritories();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTerritory(id: string) {
    if (!confirm("Delete this territory?")) return;
    await supabase.from("territories").delete().eq("id", id);
    setTerritories((prev) => prev.filter((t) => t.id !== id));
  }

  async function assignRep(territoryId: string, repId: string) {
    await supabase.from("territories").update({ rep_id: repId || null }).eq("id", territoryId);
    loadTerritories();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className="text-lg font-bold text-gray-900">Territories</h1>
          <p className="text-xs text-gray-500 mt-0.5">Draw polygons to assign rep coverage areas</p>
        </div>

        {/* Draw button */}
        <div className="px-4 py-3 border-b border-gray-100">
          <button
            onClick={() => {
              draw.current?.changeMode("draw_polygon");
              setDrawingActive(true);
            }}
            className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            + Draw New Territory
          </button>
          {drawingActive && (
            <p className="text-xs text-indigo-600 text-center mt-2">
              Click on the map to draw • Click first point to close
            </p>
          )}
        </div>

        {/* New territory form */}
        {pendingFeature && (
          <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 space-y-3">
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">New Territory</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Territory name…"
              className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <select
              value={newRepId}
              onChange={(e) => setNewRepId(e.target.value)}
              className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="">Unassigned</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>{r.full_name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => { setPendingFeature(null); draw.current?.deleteAll(); }}
                className="flex-1 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={savePending}
                disabled={!newName.trim() || saving}
                className="flex-1 py-2 rounded-lg text-sm bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Territory list */}
        <div className="flex-1 overflow-y-auto">
          {territories.length === 0 ? (
            <div className="text-center py-12 text-gray-400 px-4">
              <p className="text-sm">No territories yet.</p>
              <p className="text-xs mt-1">Click "Draw New Territory" and sketch a polygon on the map.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {territories.map((t) => (
                <li key={t.id} className="px-4 py-3 hover:bg-gray-50 transition-colors group">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-3 h-3 rounded-full mt-1 shrink-0"
                      style={{ backgroundColor: t.color ?? "#6366f1" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
                      <div className="mt-1.5">
                        <select
                          value={t.rep_id ?? ""}
                          onChange={(e) => assignRep(t.id, e.target.value)}
                          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        >
                          <option value="">Unassigned</option>
                          {reps.map((r) => (
                            <option key={r.id} value={r.id}>{r.full_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteTerritory(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity p-1"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0" />
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-2.5 shadow-sm border border-gray-200 text-xs text-gray-500">
          MapLibre · Protomaps · © OpenStreetMap contributors
        </div>
      </div>
    </div>
  );
}

// ── MapLibre GL Draw custom styles ────────────────────────────────────────────

function drawStyles() {
  return [
    {
      id: "gl-draw-polygon-fill",
      type: "fill",
      filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
      paint: { "fill-color": "#6366f1", "fill-opacity": 0.15 },
    },
    {
      id: "gl-draw-polygon-stroke",
      type: "line",
      filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
      paint: { "line-color": "#6366f1", "line-width": 2.5, "line-dasharray": [4, 2] },
    },
    {
      id: "gl-draw-polygon-midpoint",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
      paint: { "circle-radius": 4, "circle-color": "#6366f1" },
    },
    {
      id: "gl-draw-polygon-and-line-vertex",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"]],
      paint: { "circle-radius": 6, "circle-color": "#fff", "circle-stroke-color": "#6366f1", "circle-stroke-width": 2 },
    },
  ];
}
