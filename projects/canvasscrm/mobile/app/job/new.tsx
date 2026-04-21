// NEW JOB modal — matches Jobber: X close, "New job" title, sparkle right.
// Sections: Client info, Overview (job title, instructions), Schedule (calendar),
// Team, Invoicing toggle, Save button.
import { View, Text, ScrollView, TextInput, Pressable, Switch, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { X, Sparkles, Search as SearchIcon, Contact, MapPin, Phone, Mail, Users, ChevronRight } from "lucide-react-native";
import { theme } from "@/lib/theme";

const WEEK = ["S","M","T","W","T","F","S"];
const DAYS = [
  [29,30,31,1,2,3,4],
  [5,6,7,8,9,10,11],
  [12,13,14,15,16,17,18],
  [19,20,21,22,23,24,25],
  [26,27,28,29,30,1,2],
];

export default function NewJob() {
  const router = useRouter();
  const [scheduleLater, setScheduleLater] = useState(false);
  const [remind, setRemind] = useState(true);
  const [selected, setSelected] = useState(3);

  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <Pressable onPress={() => router.back()}><X size={26} color={theme.color.text} /></Pressable>
        <Text style={s.title}>New job</Text>
        <Sparkles size={22} color={theme.color.text} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <Text style={s.section}>Client info</Text>
        <Pressable style={s.selectBtn}>
          <SearchIcon size={20} color={theme.color.accent} />
          <Text style={s.selectBtnText}>Select Existing Client</Text>
        </Pressable>

        <Field icon={Contact} placeholder="First name" />
        <Field placeholder="Last name" inset />
        <Field icon={MapPin} placeholder="Property address" />

        <Pressable style={s.linkRow}><Phone size={22} color={theme.color.text} /><Text style={s.linkText}>Add Phone Number</Text></Pressable>
        <Pressable style={s.linkRow}><Mail size={22} color={theme.color.text} /><Text style={s.linkText}>Add Email</Text></Pressable>

        <View style={s.divider} />
        <Text style={s.section}>Overview</Text>
        <View style={s.inputBox}><TextInput placeholder="Job title" placeholderTextColor={theme.color.textMute} style={s.input} /></View>
        <View style={[s.inputBox, { height: 90 }]}><TextInput placeholder="Instructions" multiline placeholderTextColor={theme.color.textMute} style={[s.input, { height: 80 }]} /></View>

        <View style={s.divider} />
        <Text style={s.section}>Schedule</Text>
        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>Schedule later</Text>
          <Switch value={scheduleLater} onValueChange={setScheduleLater} trackColor={{ true: theme.color.primary, false: "#ccc" }} />
        </View>

        <Text style={s.month}>April 2026</Text>
        <View style={s.weekRow}>
          {WEEK.map((d, i) => <Text key={i} style={s.weekHead}>{d}</Text>)}
        </View>
        {DAYS.map((row, ri) => (
          <View key={ri} style={s.weekRow}>
            {row.map((d, i) => (
              <Pressable key={i} onPress={() => setSelected(d)} style={s.dayCell}>
                <View style={[s.dayCircle, selected === d && s.daySelected]}>
                  <Text style={[s.dayText, selected === d && s.dayTextSelected]}>{d}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ))}

        <View style={s.divider} />
        <Pressable style={s.teamRow}>
          <Users size={22} color={theme.color.text} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.teamLabel}>Team</Text>
            <Text style={s.teamValue}>Alec bauer</Text>
          </View>
          <ChevronRight size={22} color={theme.color.accent} />
        </Pressable>

        <View style={s.divider} />
        <Text style={s.section}>Invoicing</Text>
        <View style={s.toggleRow}>
          <Text style={[s.toggleLabel, { flex: 1, paddingRight: 16 }]}>Remind me to invoice when I close the job</Text>
          <Switch value={remind} onValueChange={setRemind} trackColor={{ true: theme.color.primary, false: "#ccc" }} />
        </View>

        <Pressable style={s.saveBtn}><Text style={s.saveText}>Save</Text></Pressable>
      </ScrollView>
    </View>
  );
}

function Field({ icon: Icon, placeholder, inset }: any) {
  return (
    <View style={[s.fieldRow, inset && { paddingLeft: 60 }]}>
      {Icon && <Icon size={22} color={theme.color.text} style={{ marginRight: 14 }} />}
      <View style={s.inputBoxFlex}>
        <TextInput placeholder={placeholder} placeholderTextColor={theme.color.textMute} style={s.input} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 16, justifyContent: "space-between" },
  title: { fontSize: 26, fontWeight: "800", color: theme.color.text, flex: 1, marginLeft: 8 },
  section: { fontSize: 16, color: theme.color.textMute, fontWeight: "600", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  selectBtn: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center", marginHorizontal: 20, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingVertical: 16, backgroundColor: theme.color.surface },
  selectBtnText: { color: theme.color.accent, fontSize: 16, fontWeight: "700" },
  fieldRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 8 },
  inputBox: { borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 20, marginVertical: 6, backgroundColor: theme.color.surface },
  inputBoxFlex: { flex: 1, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.color.surface },
  input: { fontSize: 16, color: theme.color.text },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, paddingVertical: 16 },
  linkText: { color: theme.color.accent, fontSize: 17, fontWeight: "700" },
  divider: { height: 8, backgroundColor: theme.color.surfaceAlt, marginVertical: 8 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 8 },
  toggleLabel: { fontSize: 17, color: theme.color.text },
  month: { fontSize: 22, fontWeight: "800", color: theme.color.text, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  weekRow: { flexDirection: "row", paddingHorizontal: 12 },
  weekHead: { flex: 1, textAlign: "center", color: theme.color.textMute, fontWeight: "600", paddingVertical: 8 },
  dayCell: { flex: 1, alignItems: "center", paddingVertical: 6 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  daySelected: { backgroundColor: theme.color.primary },
  dayText: { fontSize: 16, color: theme.color.text },
  dayTextSelected: { color: "#fff", fontWeight: "700" },
  teamRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 18 },
  teamLabel: { fontSize: 17, fontWeight: "700", color: theme.color.text },
  teamValue: { fontSize: 15, color: theme.color.textMute, marginTop: 2 },
  saveBtn: { backgroundColor: theme.color.primary, marginHorizontal: 20, marginTop: 24, paddingVertical: 18, borderRadius: theme.radius.md, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 18, fontWeight: "800" },
});
