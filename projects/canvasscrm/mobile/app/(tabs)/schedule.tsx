// SCHEDULE — matches Jobber: month dropdown, Day/List/Map segmented, week strip,
// per-rep columns ("Alec  0", "Andrew  0"), empty state with calendar icon.
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useState } from "react";
import { ChevronDown, Calendar, SlidersHorizontal, Sparkles, Plus } from "lucide-react-native";
import { theme } from "@/lib/theme";

const VIEWS = ["Day", "List", "Map"] as const;
const WEEK = ["S","M","T","W","T","F","S"];
const DATES = [29,30,31,1,2,3,4];
const REPS = ["Alec bauer", "Andrew", "Honalee"];

export default function Schedule() {
  const [view, setView] = useState<typeof VIEWS[number]>("List");
  const [day, setDay] = useState(3);

  return (
    <View style={s.root}>
      {/* TOP BAR */}
      <View style={s.topbar}>
        <Pressable style={s.monthBtn}>
          <Text style={s.monthText}>April</Text>
          <ChevronDown size={20} color={theme.color.text} />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Calendar size={22} color={theme.color.text} />
          <SlidersHorizontal size={22} color={theme.color.text} />
          <Sparkles size={22} color={theme.color.text} />
        </View>
      </View>

      {/* SEGMENTED Day / List / Map */}
      <View style={s.segWrap}>
        {VIEWS.map((v) => (
          <Pressable key={v} onPress={() => setView(v)} style={[s.segBtn, view === v && s.segBtnActive]}>
            <Text style={[s.segText, view === v && s.segTextActive]}>{v}</Text>
          </Pressable>
        ))}
      </View>

      {/* WEEK STRIP */}
      <View style={s.weekStrip}>
        {WEEK.map((d, i) => (
          <Pressable key={i} onPress={() => setDay(DATES[i])} style={s.weekCol}>
            <Text style={s.weekLabel}>{d}</Text>
            <View style={[s.weekDate, day === DATES[i] && s.weekDateActive]}>
              <Text style={[s.weekDateText, day === DATES[i] && s.weekDateTextActive]}>{DATES[i]}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* PER-REP COLUMNS */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        {REPS.map((r) => (
          <View key={r} style={s.repCol}>
            <View style={s.repHeader}>
              <Text style={s.repName}>{r}</Text>
              <View style={s.repCount}><Text style={s.repCountText}>0</Text></View>
            </View>
            <View style={s.emptyCol}>
              <Calendar size={28} color={theme.color.text} strokeWidth={1.5} />
              <Text style={s.emptyText}>No scheduled{"\n"}appointments</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <Pressable style={s.fab}><Plus size={28} color="#fff" /></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  monthBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  monthText: { fontSize: 28, fontWeight: "800", color: theme.color.text },
  segWrap: { flexDirection: "row", marginHorizontal: 20, backgroundColor: theme.color.surfaceAlt, borderRadius: theme.radius.pill, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: theme.radius.pill },
  segBtnActive: { backgroundColor: theme.color.surface, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  segText: { fontSize: 16, color: theme.color.textMute, fontWeight: "500" },
  segTextActive: { color: theme.color.text, fontWeight: "700" },
  weekStrip: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  weekCol: { flex: 1, alignItems: "center", gap: 8 },
  weekLabel: { fontSize: 13, color: theme.color.textMute, fontWeight: "600" },
  weekDate: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  weekDateActive: { backgroundColor: theme.color.primary },
  weekDateText: { fontSize: 17, color: theme.color.text, fontWeight: "700" },
  weekDateTextActive: { color: "#fff" },
  repCol: { width: 200, borderRightWidth: 1, borderRightColor: theme.color.border },
  repHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  repName: { fontSize: 17, fontWeight: "700", color: theme.color.text },
  repCount: { backgroundColor: theme.color.surfaceAlt, paddingHorizontal: 10, paddingVertical: 2, borderRadius: theme.radius.sm },
  repCountText: { fontSize: 14, fontWeight: "700", color: theme.color.text },
  emptyCol: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: 60, gap: 12 },
  emptyText: { textAlign: "center", color: theme.color.text, fontSize: 16, fontWeight: "600", lineHeight: 22 },
  fab: { position: "absolute", right: 20, bottom: 100, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.color.fabBg, alignItems: "center", justifyContent: "center", elevation: 6 },
});
