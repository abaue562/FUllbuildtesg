// STREET MAP TAB — every door on the current street, color-coded by status.
// Shows exactly where the rep has been and where they haven't.
// Tap any door pin → door history drawer slides up showing every visit,
// every transcript, every outcome. Tap "Re-Knock" to log a new attempt.
//
// Colors:
//   Grey      = unknocked (never been there)
//   Blue      = no_answer (knocked, no response)
//   Orange    = not_home / callback due
//   Yellow    = interested (warm)
//   Green     = sold ✓
//   Red       = not_interested / DNC / no_soliciting
//   Purple    = language barrier / spanish_only
//
// The breadcrumb trail (rep's walk path) is drawn as a blue line under the pins.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  Animated, PanResponder, Dimensions,
} from "react-native";
import MapLibreGL from "@maplibre/maplibre-react-native";
import { useRouter } from "expo-router";
import {
  X, RefreshCw, MapPin, Mic, ChevronDown,
  Check, Clock, XCircle, AlertTriangle, MessageSquare,
} from "lucide-react-native";
import { theme, doorColor } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { logKnockHere } from "@/lib/knocks";

MapLibreGL.setAccessToken(null); // Protomaps — no token needed

const { height: SCREEN_H } = Dimensions.get("window");
const DRAWER_SNAP_CLOSED = SCREEN_H * 0.92;
const DRAWER_SNAP_HALF   = SCREEN_H * 0.45;
const DRAWER_SNAP_FULL   = 90;

type DoorPin = {
  id: string;
  lat: number;
  lng: number;
  status: string;
  address: string;
  knock_count: number;
  last_knocked: string | null;
  last_summary: string | null;
  callback_at: string | null;
  score: number;
};

type KnockRecord = {
  id: string;
  captured_at: string;
  status: string;
  summary: string | null;
  transcripts: { text: string }[];
};

const OUTCOME_BUTTONS = [
  { key: "no_answer",      label: "No answer",    icon: XCircle,       color: theme.color.textMute },
  { key: "not_home",       label: "Not home",     icon: Clock,         color: theme.color.textMute },
  { key: "callback",       label: "Come back",    icon: AlertTriangle, color: theme.color.warning },
  { key: "interested",     label: "Interested",   icon: MessageSquare, color: theme.color.info },
  { key: "sold",           label: "Sold ✓",       icon: Check,         color: theme.color.primary },
  { key: "not_interested", label: "Not int.",     icon: XCircle,       color: theme.color.danger },
];

export default function MapTab() {
  const router = useRouter();
  const mapRef = useRef<MapLibreGL.MapViewRef>(null);
  const cameraRef = useRef<MapLibreGL.CameraRef>(null);
  const drawerY = useRef(new Animated.Value(DRAWER_SNAP_CLOSED)).current;

  const [doors, setDoors] = useState<DoorPin[]>([]);
  const [crumbs, setCrumbs] = useState<[number, number][]>([]);
  const [selectedDoor, setSelectedDoor] = useState<DoorPin | null>(null);
  const [history, setHistory] = useState<KnockRecord[]>([]);
  const [streetName, setStreetName] = useState("Your Territory");
  const [streetStats, setStreetStats] = useState({ total: 0, worked: 0, sold: 0 });
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => { loadDoors(); loadCrumbs(); }, []);

  // Realtime: update pins as autopilot logs knocks
  useEffect(() => {
    const ch = supabase
      .channel("doors-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "knocks" },
        () => loadDoors())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "knocks" },
        () => loadDoors())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function loadDoors() {
    const { data } = await supabase
      .from("doors")
      .select(`
        id, status,
        addresses ( line1, city, lat, lng ),
        door_scores ( score ),
        door_callbacks ( callback_at, status ),
        knocks (
          id, captured_at, status, summary,
          knock_transcripts ( text )
        )
      `)
      .order("captured_at", { referencedTable: "knocks", ascending: false });

    if (!data) return;

    const pins: DoorPin[] = data
      .filter((d: any) => d.addresses?.lat && d.addresses?.lng)
      .map((d: any) => {
        const knocks = d.knocks ?? [];
        const pendingCb = d.door_callbacks?.find((c: any) => c.status === "pending");
        return {
          id: d.id,
          lat: d.addresses.lat,
          lng: d.addresses.lng,
          status: d.status ?? "unknocked",
          address: d.addresses.line1,
          knock_count: knocks.length,
          last_knocked: knocks[0]?.captured_at ?? null,
          last_summary: knocks[0]?.summary ?? null,
          callback_at: pendingCb?.callback_at ?? null,
          score: d.door_scores?.[0]?.score ?? 0,
        };
      });

    setDoors(pins);

    // Street stats
    const total = pins.length;
    const worked = pins.filter((p) => p.status !== "unknocked").length;
    const sold = pins.filter((p) => p.status === "sold").length;
    setStreetStats({ total, worked, sold });

    // Street name from first address
    if (data[0]?.addresses?.line1) {
      const parts = data[0].addresses.line1.split(" ");
      setStreetName(parts.slice(1).join(" "));
    }
  }

  async function loadCrumbs() {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("rep_breadcrumbs")
      .select("geom")
      .gte("recorded_at", `${today}T00:00:00`)
      .order("recorded_at");
    if (!data) return;
    const coords: [number, number][] = data
      .map((r: any) => r.geom?.coordinates)
      .filter(Boolean);
    setCrumbs(coords);
  }

  function openDoor(door: DoorPin) {
    setSelectedDoor(door);
    loadHistory(door.id);
    snapDrawer(DRAWER_SNAP_HALF);
    cameraRef.current?.setCamera({
      centerCoordinate: [door.lng, door.lat],
      zoomLevel: 17,
      animationDuration: 400,
    });
  }

  function closeDrawer() {
    setSelectedDoor(null);
    snapDrawer(DRAWER_SNAP_CLOSED);
  }

  function snapDrawer(to: number) {
    Animated.spring(drawerY, {
      toValue: to,
      useNativeDriver: false,
      tension: 65,
      friction: 11,
    }).start();
  }

  async function loadHistory(doorId: string) {
    const { data } = await supabase
      .from("knocks")
      .select("id, captured_at, status, summary, knock_transcripts(text)")
      .eq("door_id", doorId)
      .order("captured_at", { ascending: false });
    setHistory(data ?? []);
  }

  async function reKnock(outcome: string) {
    if (!selectedDoor) return;
    await logKnockHere({
      outcome,
      doorId: selectedDoor.id,
      lat: selectedDoor.lat,
      lng: selectedDoor.lng,
    });
    await loadDoors();
    await loadHistory(selectedDoor.id);
    setSelectedDoor((d) => d ? { ...d, status: outcome, knock_count: d.knock_count + 1 } : d);
  }

  // GeoJSON for door pins
  const doorsGeoJSON = {
    type: "FeatureCollection" as const,
    features: doors.map((d) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [d.lng, d.lat] },
      properties: {
        id: d.id,
        status: d.status,
        color: doorColor[d.status] ?? "#9CA3A3",
        knock_count: d.knock_count,
        address: d.address,
        score: d.score,
      },
    })),
  };

  const crumbGeoJSON = {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: crumbs },
    properties: {},
  };

  const pct = streetStats.total > 0
    ? Math.round((streetStats.worked / streetStats.total) * 100)
    : 0;

  return (
    <View style={s.root}>
      {/* ── Street Header ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.streetName}>{streetName}</Text>
          <Text style={s.streetSub}>
            {streetStats.worked}/{streetStats.total} doors worked · {streetStats.sold} sold · {pct}% complete
          </Text>
        </View>
        <Pressable onPress={loadDoors} style={s.refreshBtn}>
          <RefreshCw size={18} color={theme.color.textMute} />
        </Pressable>
      </View>

      {/* ── Progress Bar ── */}
      <View style={s.progressBg}>
        <View style={[s.progressFill, { width: `${pct}%` }]} />
      </View>

      {/* ── Map ── */}
      <MapLibreGL.MapView
        ref={mapRef}
        style={{ flex: 1 }}
        styleURL={`https://api.protomaps.com/tiles/v4.json?key=${process.env.EXPO_PUBLIC_PROTOMAPS_KEY}`}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          followUserLocation
          followZoomLevel={16}
        />
        <MapLibreGL.UserLocation visible animated />

        {/* Rep breadcrumb trail */}
        {crumbs.length > 1 && (
          <MapLibreGL.ShapeSource id="crumbs" shape={crumbGeoJSON}>
            <MapLibreGL.LineLayer
              id="crumb-line"
              style={{ lineColor: theme.color.info, lineWidth: 2.5, lineOpacity: 0.6 }}
            />
          </MapLibreGL.ShapeSource>
        )}

        {/* Door pins */}
        <MapLibreGL.ShapeSource
          id="doors"
          shape={doorsGeoJSON}
          onPress={(e) => {
            const feat = e.features?.[0];
            if (!feat) return;
            const door = doors.find((d) => d.id === feat.properties?.id);
            if (door) openDoor(door);
          }}
          cluster
          clusterRadius={40}
        >
          {/* Cluster circles */}
          <MapLibreGL.CircleLayer
            id="clusters"
            belowLayerID="cluster-count"
            filter={["has", "point_count"]}
            style={{
              circleColor: theme.color.primary,
              circleRadius: ["step", ["get", "point_count"], 18, 10, 24, 30, 30],
              circleOpacity: 0.85,
            }}
          />
          <MapLibreGL.SymbolLayer
            id="cluster-count"
            filter={["has", "point_count"]}
            style={{
              textField: "{point_count_abbreviated}",
              textSize: 13,
              textColor: "#fff",
              textFont: ["Open Sans Bold"],
            }}
          />
          {/* Individual door circles */}
          <MapLibreGL.CircleLayer
            id="door-pins"
            filter={["!", ["has", "point_count"]]}
            style={{
              circleColor: ["get", "color"],
              circleRadius: 9,
              circleStrokeWidth: 2,
              circleStrokeColor: "#fff",
            }}
          />
          {/* Knock count badge */}
          <MapLibreGL.SymbolLayer
            id="knock-count"
            filter={["all", ["!", ["has", "point_count"]], [">", ["get", "knock_count"], 0]]}
            style={{
              textField: "{knock_count}",
              textSize: 9,
              textColor: "#fff",
              textFont: ["Open Sans Bold"],
              textOffset: [0, 0],
            }}
          />
        </MapLibreGL.ShapeSource>
      </MapLibreGL.MapView>

      {/* ── Legend ── */}
      <View style={s.legend}>
        {[
          ["unknocked", "Unvisited"],
          ["no_answer", "No answer"],
          ["callback", "Callback"],
          ["sold", "Sold"],
          ["dnc", "DNC"],
        ].map(([status, label]) => (
          <View key={status} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: doorColor[status] ?? "#9CA3A3" }]} />
            <Text style={s.legendLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ── Door Detail Drawer ── */}
      <Animated.View style={[s.drawer, { top: drawerY }]}>
        <View style={s.drawerHandle} />
        <Pressable style={s.drawerClose} onPress={closeDrawer}>
          <X size={20} color={theme.color.textMute} />
        </Pressable>

        {selectedDoor && (
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Address + status */}
            <View style={s.drawerHeader}>
              <View style={[s.statusDot, { backgroundColor: doorColor[selectedDoor.status] ?? "#9CA3A3" }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.drawerAddress}>{selectedDoor.address}</Text>
                <Text style={s.drawerStatus}>
                  {selectedDoor.status.replace(/_/g, " ")} · {selectedDoor.knock_count} knock{selectedDoor.knock_count !== 1 ? "s" : ""}
                  {selectedDoor.callback_at ? ` · Callback ${new Date(selectedDoor.callback_at).toLocaleDateString()}` : ""}
                </Text>
              </View>
            </View>

            {/* Last summary */}
            {selectedDoor.last_summary && (
              <View style={s.summaryCard}>
                <Text style={s.summaryLabel}>Last visit</Text>
                <Text style={s.summaryText}>{selectedDoor.last_summary}</Text>
              </View>
            )}

            {/* Re-knock outcome buttons */}
            <Text style={s.section}>Re-Knock — Log Outcome</Text>
            <View style={s.outcomeGrid}>
              {OUTCOME_BUTTONS.map(({ key, label, icon: Icon, color }) => (
                <Pressable key={key} onPress={() => reKnock(key)} style={s.outcomeBtn}>
                  <Icon size={20} color={color} />
                  <Text style={s.outcomeBtnLabel}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Full knock history */}
            <Text style={s.section}>Full History</Text>
            {history.length === 0 && (
              <Text style={s.empty}>No visits recorded yet.</Text>
            )}
            {history.map((k) => (
              <View key={k.id} style={s.historyCard}>
                <View style={s.historyTop}>
                  <View style={[s.historyDot, { backgroundColor: doorColor[k.status] ?? "#9CA3A3" }]} />
                  <Text style={s.historyStatus}>{k.status.replace(/_/g, " ")}</Text>
                  <Text style={s.historyTime}>{new Date(k.captured_at).toLocaleString()}</Text>
                </View>
                {k.summary && <Text style={s.historySummary}>{k.summary}</Text>}
                {k.knock_transcripts?.map((t, i) => (
                  <View key={i} style={s.transcriptBubble}>
                    <Text style={s.transcriptText}>{t.text}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 10, gap: 12, backgroundColor: theme.color.surface, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  streetName: { fontSize: 20, fontWeight: "800", color: theme.color.text },
  streetSub: { fontSize: 13, color: theme.color.textMute, marginTop: 2 },
  refreshBtn: { padding: 8 },
  progressBg: { height: 4, backgroundColor: theme.color.border },
  progressFill: { height: 4, backgroundColor: theme.color.primary },
  legend: { position: "absolute", top: 130, right: 12, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 10, padding: 10, gap: 6, borderWidth: 1, borderColor: theme.color.border },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: theme.color.text, fontWeight: "600" },
  drawer: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: theme.color.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 20 },
  drawerHandle: { width: 36, height: 4, backgroundColor: theme.color.border, borderRadius: 2, alignSelf: "center", marginTop: 12 },
  drawerClose: { position: "absolute", top: 12, right: 16, padding: 6 },
  drawerHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 20, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  statusDot: { width: 14, height: 14, borderRadius: 7, flexShrink: 0 },
  drawerAddress: { fontSize: 18, fontWeight: "800", color: theme.color.text },
  drawerStatus: { fontSize: 13, color: theme.color.textMute, marginTop: 2, textTransform: "capitalize" },
  summaryCard: { margin: 16, padding: 14, backgroundColor: "#F0F7FF", borderRadius: theme.radius.md, borderWidth: 1, borderColor: "#BFDBFE" },
  summaryLabel: { fontSize: 11, fontWeight: "800", color: theme.color.info, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 },
  summaryText: { fontSize: 15, color: theme.color.text, lineHeight: 21 },
  section: { fontSize: 15, color: theme.color.textMute, fontWeight: "600", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  outcomeGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8 },
  outcomeBtn: { flexBasis: "30%", flexGrow: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, backgroundColor: theme.color.bg },
  outcomeBtnLabel: { fontSize: 12, fontWeight: "700", color: theme.color.text, textAlign: "center" },
  historyCard: { marginHorizontal: 16, marginBottom: 10, padding: 14, backgroundColor: theme.color.bg, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border },
  historyTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  historyDot: { width: 10, height: 10, borderRadius: 5 },
  historyStatus: { fontSize: 14, fontWeight: "800", color: theme.color.text, textTransform: "capitalize", flex: 1 },
  historyTime: { fontSize: 12, color: theme.color.textMute },
  historySummary: { fontSize: 14, color: theme.color.text, lineHeight: 20, marginBottom: 6, fontStyle: "italic" },
  transcriptBubble: { backgroundColor: theme.color.surface, borderRadius: 10, padding: 10, marginTop: 4, borderWidth: 1, borderColor: theme.color.border },
  transcriptText: { fontSize: 13, color: theme.color.text, lineHeight: 19 },
  empty: { paddingHorizontal: 16, color: theme.color.textMute, fontStyle: "italic" },
});
