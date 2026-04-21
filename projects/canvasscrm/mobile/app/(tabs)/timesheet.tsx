// TIMESHEET — month dropdown, week strip, big "Tracked time 00:00" + Clock In, empty state.
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useState } from "react";
import { ChevronDown, Calendar, Sparkles, Plus } from "lucide-react-native";
import { theme } from "@/lib/theme";

const WEEK = ["S","M","T","W","T","F","S"];
const DATES = [29,30,31,1,2,3,4];

export default function Timesheet() {
  const [day, setDay] = useState(3);
  const [running, setRunning] = useState(false);

  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <Pressable style={s.monthBtn}>
          <Text style={s.monthText}>April</Text>
          <ChevronDown size={20} color={theme.color.text} />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Calendar size={22} color={theme.color.text} />
          <Sparkles size={22} color={theme.color.text} />
        </View>
      </View>

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

      <View style={s.trackedCard}>
        <View>
          <Text style={s.trackedLabel}>Tracked time</Text>
          <Text style={s.trackedValue}>00:00</Text>
        </View>
        <Pressable style={s.clockBtn} onPress={() => setRunning(!running)}>
          <Text style={s.clockBtnText}>{running ? "Clock Out" : "Clock In"}</Text>
        </Pressable>
      </View>

      <View style={s.empty}>
        <Text style={s.emptyTitle}>No time entries for today</Text>
        <Text style={s.emptySub}>You can track your time by clocking in</Text>
      </View>

      <Pressable style={s.fab}><Plus size={28} color="#fff" /></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  monthBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  monthText: { fontSize: 28, fontWeight: "800", color: theme.color.text },
  weekStrip: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface },
  weekCol: { flex: 1, alignItems: "center", gap: 8 },
  weekLabel: { fontSize: 13, color: theme.color.textMute, fontWeight: "600" },
  weekDate: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  weekDateActive: { backgroundColor: theme.color.primary },
  weekDateText: { fontSize: 17, color: theme.color.text, fontWeight: "700" },
  weekDateTextActive: { color: "#fff" },
  trackedCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, backgroundColor: theme.color.surface, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  trackedLabel: { fontSize: 15, color: theme.color.textMute, marginBottom: 4 },
  trackedValue: { fontSize: 32, fontWeight: "800", color: theme.color.text },
  clockBtn: { backgroundColor: theme.color.primary, paddingHorizontal: 28, paddingVertical: 16, borderRadius: theme.radius.md },
  clockBtnText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: theme.color.text, textAlign: "center" },
  emptySub: { fontSize: 17, color: theme.color.textMute, marginTop: 8, textAlign: "center" },
  fab: { position: "absolute", right: 20, bottom: 100, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.color.fabBg, alignItems: "center", justifyContent: "center", elevation: 6 },
});
