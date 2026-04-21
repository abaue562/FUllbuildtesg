"use client";
// MANAGER LIVE MAP — Next.js 15 page.
// Shows every active rep as a moving pin, color-coded by status.
// Heatmap layer of knock density. Click a rep → breadcrumb playback.
// Realtime powered by Supabase Realtime channel subscriptions.
// Map: MapLibre GL JS + Protomaps tiles (no Google, no Mapbox billing).

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClient } from "@supabase/supabase-js";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type RepPin = {
  user_id: string;
  name: string;
  lat: number;
  lng: number;
  status: "active" | "idle" | "offline";
  knocks_today: number;
  sales_today: number;
};

type Crumb = { lat: number; lng: number; t: string; speed: number };

export default function LiveMapPage() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const [reps, setReps] = useState<RepPin[]>([]);
  const [selectedRep, setSelectedRep] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([]);
  const [playback, setPlayback] = useState(false);
  const [playDate, setPlayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [stats, setStats] = useState({ total_knocks: 0, total_sales: 0, active_reps: 0 });

  // Boot map
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: mapEl.current,
      style: `https://api.protomaps.com/tiles/v4.json?key=${process.env.NEXT_PUBLIC_PROTOMAPS_KEY}`,
      center: [-111.891, 40.76],
      zoom: 11,
    });
    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current.on("load", () => {
      addHeatmapLayer();
      loadInitialReps();
    });
  }, []);

  function addHeatmapLayer() {
    const map = mapRef.current!;
    map.addSource("knocks-heat", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "knock-heatmap",
      type: "heatmap",
      source: "knocks-heat",
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "knocks"], 0, 0, 50, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 1, 15, 3],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(0,0,0,0)",
          0.2, "#3A8540",
          0.5, "#E8A53A",
          0.8, "#E04A3F",
          1, "#0E2B2A",
        ],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 8, 15, 28],
        "heatmap-opacity": 0.7,
      },
    });
    refreshHeatmap();
  }

  async function refreshHeatmap() {
    const { data } = await supa
      .from("knock_heatmap_hourly")
      .select("cell,knocks")
      .order("knocks", { ascending: false })
      .limit(5000);
    if (!data || !mapRef.current) return;
    const features = data.map((r: any) => {
      const coords = r.cell.coordinates ?? [0, 0];
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: coords },
        properties: { knocks: r.knocks },
      };
    });
    (mapRef.current.getSource("knocks-heat") as maplibregl.GeoJSONSource)
      ?.setData({ type: "FeatureCollection", features });
  }

  async function loadInitialReps() {
    const { data } = await supa
      .from("rep_breadcrumbs")
      .select("user_id, recorded_at, speed_mps, geom")
      .gte("recorded_at", new Date(Date.now() - 3600_000).toISOString())
      .order("recorded_at", { ascending: false });
    if (!data) return;

    const latest: Record<string, any> = {};
    for (const r of data) {
      if (!latest[r.user_id]) latest[r.user_id] = r;
    }
    const pins: RepPin[] = Object.values(latest).map((r) => ({
      user_id: r.user_id,
      name: r.user_id.slice(0, 8),
      lat: r.geom.coordinates[1],
      lng: r.geom.coordinates[0],
      status: Date.now() - new Date(r.recorded_at).getTime() < 120_000 ? "active" : "idle",
      knocks_today: 0,
      sales_today: 0,
    }));
    setReps(pins);
    pins.forEach((p) => upsertMarker(p));
  }

  function upsertMarker(rep: RepPin) {
    const map = mapRef.current!;
    const color = rep.status === "active" ? "#3A8540" : rep.status === "idle" ? "#E8A53A" : "#9CA3A3";
    if (markersRef.current[rep.user_id]) {
      markersRef.current[rep.user_id].setLngLat([rep.lng, rep.lat]);
    } else {
      const el = document.createElement("div");
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.4)`;
      el.title = rep.name;
      el.addEventListener("click", () => setSelectedRep(rep.user_id));
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([rep.lng, rep.lat])
        .addTo(map);
      markersRef.current[rep.user_id] = marker;
    }
  }

  // Realtime subscription — breadcrumbs insert
  useEffect(() => {
    const channel = supa
      .channel("breadcrumbs-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rep_breadcrumbs" },
        (payload) => {
          const r = payload.new as any;
          setReps((prev) => {
            const pin: RepPin = {
              user_id: r.user_id,
              name: r.user_id.slice(0, 8),
              lat: r.geom.coordinates[1],
              lng: r.geom.coordinates[0],
              status: "active",
              knocks_today: 0,
              sales_today: 0,
            };
            upsertMarker(pin);
            const idx = prev.findIndex((p) => p.user_id === r.user_id);
            if (idx >= 0) { const next = [...prev]; next[idx] = pin; return next; }
            return [...prev, pin];
          });
        })
      .subscribe();
    return () => { supa.removeChannel(channel); };
  }, []);

  // Load breadcrumb trail for selected rep
  async function loadBreadcrumbs(userId: string, date: string) {
    const { data } = await supa
      .from("rep_breadcrumbs")
      .select("recorded_at, speed_mps, geom")
      .eq("user_id", userId)
      .gte("recorded_at", `${date}T00:00:00`)
      .lte("recorded_at", `${date}T23:59:59`)
      .order("recorded_at");
    if (!data) return;
    const crumbs: Crumb[] = data.map((r: any) => ({
      lat: r.geom.coordinates[1],
      lng: r.geom.coordinates[0],
      t: r.recorded_at,
      speed: r.speed_mps,
    }));
    setBreadcrumbs(crumbs);
    drawTrail(crumbs);
  }

  function drawTrail(crumbs: Crumb[]) {
    const map = mapRef.current!;
    if (map.getLayer("trail")) map.removeLayer("trail");
    if (map.getSource("trail")) map.removeSource("trail");
    map.addSource("trail", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: crumbs.map((c) => [c.lng, c.lat]),
        },
        properties: {},
      },
    });
    map.addLayer({
      id: "trail",
      type: "line",
      source: "trail",
      paint: { "line-color": "#2D7CB8", "line-width": 2, "line-opacity": 0.8 },
    });
    if (crumbs.length) {
      map.flyTo({ center: [crumbs[0].lng, crumbs[0].lat], zoom: 14 });
    }
  }

  useEffect(() => {
    if (selectedRep) loadBreadcrumbs(selectedRep, playDate);
  }, [selectedRep, playDate]);

  // Live stats
  useEffect(() => {
    async function fetchStats() {
      const { data } = await supa
        .from("leaderboard_today")
        .select("knocks,sales");
      if (!data) return;
      setStats({
        total_knocks: data.reduce((a: number, r: any) => a + r.knocks, 0),
        total_sales: data.reduce((a: number, r: any) => a + r.sales, 0),
        active_reps: data.length,
      });
    }
    fetchStats();
    const t = setInterval(fetchStats, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", background: "#F5F5F0", fontFamily: "system-ui" }}>
      {/* Sidebar */}
      <aside style={{ width: 280, background: "#fff", borderRight: "1px solid #E5E5DF", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #E5E5DF" }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0E2B2A" }}>Live Map</h1>
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            {[["Knocks", stats.total_knocks], ["Sales", stats.total_sales], ["Reps", stats.active_reps]].map(([l, v]) => (
              <div key={String(l)}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#0E2B2A" }}>{v}</div>
                <div style={{ fontSize: 11, color: "#5A6B6A" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "12px 20px 8px", fontSize: 13, fontWeight: 700, color: "#5A6B6A", textTransform: "uppercase", letterSpacing: 1 }}>Reps On Field</div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {reps.map((r) => (
            <div key={r.user_id}
              onClick={() => setSelectedRep(r.user_id)}
              style={{ padding: "12px 20px", cursor: "pointer", background: selectedRep === r.user_id ? "#F0F0EA" : "transparent", borderBottom: "1px solid #E5E5DF", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: r.status === "active" ? "#3A8540" : "#E8A53A", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#0E2B2A" }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "#5A6B6A" }}>{r.knocks_today} knocks · {r.sales_today} sales</div>
              </div>
            </div>
          ))}
          {reps.length === 0 && <div style={{ padding: "20px", color: "#5A6B6A", fontSize: 14 }}>No reps active yet</div>}
        </div>

        {selectedRep && (
          <div style={{ padding: 16, borderTop: "1px solid #E5E5DF" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0E2B2A", marginBottom: 8 }}>Breadcrumb Playback</div>
            <input type="date" value={playDate} onChange={(e) => setPlayDate(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E5DF", borderRadius: 8, fontSize: 14, marginBottom: 8, boxSizing: "border-box" }} />
            <div style={{ fontSize: 12, color: "#5A6B6A" }}>{breadcrumbs.length} GPS points</div>
          </div>
        )}
      </aside>

      {/* Map */}
      <div ref={mapEl} style={{ flex: 1 }} />
    </div>
  );
}
