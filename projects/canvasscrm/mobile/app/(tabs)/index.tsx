// HOME — exact Jobber layout: date header, "Good morning, <name>", clock-in card,
// embedded map, To-do list, business health, FAB, sparkle AI button.
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Bell, Sparkles, Play, Plus } from "lucide-react-native";
import MapLibreGL from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { theme } from "@/lib/theme";
import { useTodayStats } from "@/lib/hooks";

MapLibreGL.setAccessToken(null);

export default function Home() {
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [name] = useState("Alec");
  const stats = useTodayStats();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({});
      setCoords([loc.coords.longitude, loc.coords.latitude]);
    })();
  }, []);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* TOP BAR — date + bell + sparkle */}
        <View style={s.topbar}>
          <Text style={s.dateText}>{format(new Date(), "EEEE, MMMM do")}</Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <BellWithBadge count={stats.alerts} />
            <Pressable hitSlop={10}><Sparkles size={24} color={theme.color.text} /></Pressable>
          </View>
        </View>

        {/* GREETING */}
        <Text style={s.greeting}>Good morning, {name}</Text>

        {/* CLOCK-IN CARD floating over map */}
        <View style={s.mapWrap}>
          <View style={s.clockCard}>
            <Text style={s.clockLabel}>Let's get started</Text>
            <Pressable style={s.clockBtn}>
              <Play size={18} color="#fff" fill="#fff" />
              <Text style={s.clockBtnText}>Clock In</Text>
            </Pressable>
          </View>

          <MapLibreGL.MapView
            style={s.map}
            styleURL="https://tiles.canvasscrm.app/styles/streets/style.json"
            logoEnabled={false}
            attributionEnabled={false}
          >
            <MapLibreGL.UserLocation visible androidRenderMode="gps" />
            {coords && <MapLibreGL.Camera zoomLevel={14} centerCoordinate={coords} />}
          </MapLibreGL.MapView>

          <Pressable style={s.viewAllPill}>
            <Text style={s.viewAllText}>View all ›</Text>
          </Pressable>
        </View>

        {/* No visits scheduled card */}
        <View style={s.noVisitsCard}>
          <Text style={s.noVisitsText}>No visits scheduled today</Text>
        </View>

        {/* TO DO */}
        <Text style={s.sectionTitle}>To do</Text>
        <View style={s.todoList}>
          <TodoRow icon="quote" title={`${stats.knocked} doors knocked today`}     subtitle="Worth tracking" />
          <TodoRow icon="quote" title={`${stats.callbacks} callbacks pending`}      subtitle="Geofence active" />
          <TodoRow icon="job"   title={`${stats.talked} conversations recorded`}    subtitle="AI processed" />
          <TodoRow icon="job"   title={`${stats.sold} sales today`}                 subtitle="Stripe links sent" />
          <TodoRow icon="invoice" title="Activity feed"                              subtitle="See team activity" />
        </View>

        {/* BUSINESS HEALTH */}
        <View style={s.healthHeader}>
          <Text style={s.sectionTitle}>Business health</Text>
          <Pressable><Text style={s.viewAllLink}>View all</Text></Pressable>
        </View>
        <View style={s.healthCard}>
          <HealthRow label="Doors knocked" sub="This week" value={String(stats.weekKnocked)} pct="0%" />
          <View style={s.divider} />
          <HealthRow label="Sales value" sub="This week" value={`$${stats.weekSales}`} pct="0%" />
        </View>

        <Pressable style={s.helpBtn}>
          <Text style={s.helpText}>Need Help?</Text>
        </Pressable>
      </ScrollView>

      {/* Floating Action Button */}
      <Pressable style={s.fab}><Plus size={28} color="#fff" /></Pressable>
    </View>
  );
}

function BellWithBadge({ count }: { count: number }) {
  return (
    <View>
      <Bell size={24} color={theme.color.text} />
      {count > 0 && (
        <View style={s.badge}><Text style={s.badgeText}>{count}</Text></View>
      )}
    </View>
  );
}

function TodoRow({ icon, title, subtitle }: any) {
  return (
    <Pressable style={s.todoRow}>
      <View style={s.todoIcon} />
      <View style={{ flex: 1 }}>
        <Text style={s.todoTitle}>{title}</Text>
        <Text style={s.todoSub}>{subtitle}</Text>
      </View>
      <Text style={s.arrow}>→</Text>
    </Pressable>
  );
}

function HealthRow({ label, sub, value, pct }: any) {
  return (
    <View style={s.healthRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.healthLabel}>{label}</Text>
        <Text style={s.healthSub}>{sub}</Text>
      </View>
      <Text style={s.healthValue}>{value}</Text>
      <View style={s.pctChip}><Text style={s.pctText}>{pct}</Text></View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8 },
  dateText: { color: theme.color.textMute, fontSize: 14 },
  greeting: { fontSize: 32, fontWeight: "800", color: theme.color.text, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, letterSpacing: -0.5 },
  mapWrap: { marginHorizontal: 0, height: 320, position: "relative" },
  clockCard: { position: "absolute", top: 12, left: 16, right: 16, zIndex: 10, backgroundColor: theme.color.surface, borderRadius: theme.radius.md, paddingVertical: 14, paddingHorizontal: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  clockLabel: { fontSize: 17, color: theme.color.text, fontWeight: "500" },
  clockBtn: { backgroundColor: theme.color.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: theme.radius.md, flexDirection: "row", alignItems: "center", gap: 8 },
  clockBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  map: { flex: 1 },
  viewAllPill: { position: "absolute", right: 16, bottom: 60, backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  viewAllText: { color: theme.color.text, fontWeight: "600" },
  noVisitsCard: { backgroundColor: theme.color.surfaceAlt, marginHorizontal: 16, marginTop: -8, borderRadius: theme.radius.md, padding: 24, alignItems: "center" },
  noVisitsText: { color: theme.color.textMute, fontSize: 15 },
  sectionTitle: { fontSize: 24, fontWeight: "800", color: theme.color.text, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 },
  todoList: { backgroundColor: theme.color.surface, marginHorizontal: 16, borderRadius: theme.radius.md, overflow: "hidden" },
  todoRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: theme.color.border, gap: 14 },
  todoIcon: { width: 28, height: 28, borderRadius: 6, backgroundColor: theme.color.surfaceAlt },
  todoTitle: { fontSize: 17, fontWeight: "700", color: theme.color.text },
  todoSub: { fontSize: 14, color: theme.color.textMute, marginTop: 2 },
  arrow: { fontSize: 22, color: theme.color.accent },
  healthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingRight: 20 },
  viewAllLink: { color: theme.color.accent, fontWeight: "600" },
  healthCard: { backgroundColor: theme.color.surface, marginHorizontal: 16, borderRadius: theme.radius.md, padding: 4 },
  healthRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  healthLabel: { fontSize: 17, fontWeight: "700", color: theme.color.text },
  healthSub: { fontSize: 13, color: theme.color.textMute, marginTop: 2 },
  healthValue: { fontSize: 22, fontWeight: "800", color: theme.color.text },
  pctChip: { backgroundColor: theme.color.surfaceAlt, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill },
  pctText: { fontSize: 12, color: theme.color.textMute, fontWeight: "600" },
  divider: { height: 1, backgroundColor: theme.color.border, marginHorizontal: 16 },
  helpBtn: { borderWidth: 1, borderColor: theme.color.border, marginHorizontal: 16, marginTop: 20, paddingVertical: 16, borderRadius: theme.radius.md, alignItems: "center", backgroundColor: theme.color.surface },
  helpText: { color: theme.color.accent, fontWeight: "700", fontSize: 16 },
  fab: { position: "absolute", right: 20, bottom: 100, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.color.fabBg, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, elevation: 6 },
  badge: { position: "absolute", top: -6, right: -8, backgroundColor: theme.color.danger, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
