// NEW QUOTE modal — Service for, Salesperson, Line items, totals,
// Attachments / Images / Reviews / Client message / Contract, Review and Send + Save.
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { X, Sparkles, Search as SearchIcon, Contact, MapPin, Phone, Mail, ChevronDown, Plus, ArrowRight } from "lucide-react-native";
import { theme } from "@/lib/theme";

export default function NewQuote() {
  const router = useRouter();

  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <Pressable onPress={() => router.back()}><X size={26} color={theme.color.text} /></Pressable>
        <Text style={s.title}>New quote</Text>
        <Sparkles size={22} color={theme.color.text} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <Text style={s.section}>Service for</Text>
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

        <Pressable style={s.dropdown}>
          <View>
            <Text style={s.dropdownLabel}>Salesperson</Text>
            <Text style={s.dropdownVal}>Please select</Text>
          </View>
          <ChevronDown size={22} color={theme.color.text} />
        </Pressable>

        <View style={s.divider} />
        <Text style={s.section}>Product / Service</Text>
        <View style={s.lineRow}>
          <Text style={s.lineLabel}>Line items</Text>
          <Pressable><Plus size={26} color={theme.color.accent} /></Pressable>
        </View>

        <Totals />

        <View style={s.divider} />
        {["Attachments", "Images", "Reviews", "Client message"].map((t) => (
          <Pressable key={t} style={s.expandRow}>
            <Text style={s.expandLabel}>{t}</Text>
            <Plus size={24} color={theme.color.accent} />
          </Pressable>
        ))}

        <View style={s.divider} />
        <Pressable style={s.expandRow}>
          <Text style={s.expandLabel}>Contract / Disclaimer</Text>
          <ArrowRight size={22} color={theme.color.accent} />
        </Pressable>
        <Text style={s.disclaimer}>This quote is valid for the next 30 days, after which values may be subject to change.</Text>

        <Pressable style={s.primaryBtn}><Text style={s.primaryText}>Review and Send</Text></Pressable>
        <Pressable style={s.linkBtn}><Text style={s.linkBtnText}>Save</Text></Pressable>
      </ScrollView>
    </View>
  );
}

function Totals() {
  return (
    <View style={s.totals}>
      <Row label="Subtotal" val="$0.00" bold />
      <Row label="Discount" val="$0.00" green />
      <Row label="Tax"      val="$0.00" green />
      <View style={s.totalBar}><Text style={s.totalLabel}>Total</Text><Text style={s.totalVal}>$0.00</Text></View>
      <Row label="Required deposit" val="$0.00" green />
    </View>
  );
}
function Row({ label, val, green, bold }: any) {
  return (
    <View style={s.totalRow}>
      <Text style={[s.totalRowLabel, bold && { fontWeight: "700" }]}>{label}</Text>
      <Text style={[s.totalRowVal, green && { color: theme.color.accent }]}>{val}</Text>
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
  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 16 },
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
  dropdown: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 20, marginVertical: 6, backgroundColor: theme.color.surface },
  dropdownLabel: { fontSize: 13, color: theme.color.textMute },
  dropdownVal: { fontSize: 17, color: theme.color.text, marginTop: 4 },
  lineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.color.border },
  lineLabel: { fontSize: 17, fontWeight: "700", color: theme.color.text },
  totals: { backgroundColor: theme.color.surface },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  totalRowLabel: { fontSize: 17, color: theme.color.text },
  totalRowVal: { fontSize: 17, color: theme.color.text, fontWeight: "700" },
  totalBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 18, backgroundColor: theme.color.surfaceAlt },
  totalLabel: { fontSize: 18, fontWeight: "800", color: theme.color.text },
  totalVal: { fontSize: 18, fontWeight: "800", color: theme.color.text },
  expandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface },
  expandLabel: { fontSize: 17, fontWeight: "700", color: theme.color.text },
  disclaimer: { paddingHorizontal: 20, paddingVertical: 16, color: theme.color.text, fontSize: 15, lineHeight: 22 },
  primaryBtn: { backgroundColor: theme.color.primary, marginHorizontal: 20, marginTop: 16, paddingVertical: 18, borderRadius: theme.radius.md, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  linkBtn: { paddingVertical: 16, alignItems: "center" },
  linkBtnText: { color: theme.color.accent, fontSize: 16, fontWeight: "700" },
});
