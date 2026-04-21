// SEARCH — Jobber-style: title + sparkle, search box, filter chips, list of records.
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet } from "react-native";
import { useState } from "react";
import { Search as SearchIcon, Sparkles, FileText, X, Plus } from "lucide-react-native";
import { theme } from "@/lib/theme";

const FILTERS = [
  { key: "all",     label: "" , icon: true },
  { key: "draft",   label: "Draft" },
  { key: "past",    label: "Past due" },
  { key: "await",   label: "Awaiting" },
];

const ROWS = [
  { name: "Norda and dave Trask",    date: "Feb 13", amount: "$698",  status: "Past Due", desc: "For Services..." },
  { name: "Norda and dave Trask",    date: "Feb 13", amount: "$1.5k", status: "Past Due", desc: "For Services..." },
  { name: "Lory and ray Legere",     date: "Jan 10", amount: "$2.6k", status: "Past Due", desc: "For Services..." },
  { name: "Jamuna",                  date: "Jan 08", amount: "$126",  status: "Past Due", desc: "For Services..." },
  { name: "Sylvain Lachapelle",      date: "Dec 22", amount: "$2.8k", status: "Past Due", desc: "For Service..."  },
  { name: "Joey and margarette Konsrosky", date: "Dec 17", amount: "$1.6k", status: "Past Due", desc: "For Services..." },
];

export default function Search() {
  const [active, setActive] = useState("all");
  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <Text style={s.title}>Search</Text>
        <Sparkles size={22} color={theme.color.text} />
      </View>

      <View style={s.searchBox}>
        <SearchIcon size={20} color={theme.color.textMute} />
        <TextInput placeholder="Search invoices" placeholderTextColor={theme.color.textMute} style={s.searchInput} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
        {FILTERS.map((f) => (
          <Pressable key={f.key} onPress={() => setActive(f.key)} style={[s.chip, active === f.key && s.chipActive]}>
            {f.icon
              ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <FileText size={16} color={active === f.key ? "#fff" : theme.color.text} />
                  <X size={14} color={active === f.key ? "#fff" : theme.color.text} />
                </View>
              : <Text style={[s.chipText, active === f.key && s.chipTextActive]}>{f.label}</Text>}
          </Pressable>
        ))}
      </ScrollView>

      <Text style={s.sectionLabel}>Invoices awaiting payment</Text>
      <ScrollView>
        {ROWS.map((r, i) => (
          <View key={i} style={s.row}>
            <View style={s.rowIcon}><FileText size={20} color={theme.color.info} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowName}>{r.name}</Text>
              <Text style={s.rowMeta}>{r.date}  |  {r.amount}  |  {r.desc}</Text>
            </View>
            <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Text style={s.rowStatus}>{r.status}</Text>
              <View style={s.dot} />
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
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: "800", color: theme.color.text },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: theme.color.border, marginHorizontal: 20, paddingHorizontal: 14, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.color.surface },
  searchInput: { flex: 1, fontSize: 16, color: theme.color.text },
  chipRow: { paddingVertical: 16, maxHeight: 64 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceAlt },
  chipActive: { backgroundColor: theme.color.info },
  chipText: { fontSize: 15, color: theme.color.text, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  sectionLabel: { paddingHorizontal: 20, fontSize: 16, color: theme.color.textMute, fontWeight: "600", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface },
  rowIcon: { width: 36, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  rowName: { fontSize: 17, fontWeight: "700", color: theme.color.text },
  rowMeta: { fontSize: 14, color: theme.color.textMute, marginTop: 2 },
  rowStatus: { fontSize: 14, color: theme.color.textMute, fontWeight: "600" },
  dot: { width: 12, height: 12, backgroundColor: theme.color.danger, borderRadius: 2, marginLeft: 6 },
  fab: { position: "absolute", right: 20, bottom: 100, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.color.fabBg, alignItems: "center", justifyContent: "center", elevation: 6 },
});
