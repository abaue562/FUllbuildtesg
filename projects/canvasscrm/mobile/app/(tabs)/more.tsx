// MORE — settings list (Apps & integrations / Marketing tiles + linear list).
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import {
  Sparkles, MessageSquare, CreditCard, Star, Gift, HelpCircle,
  User, Users, Building2, Sliders, LogOut, AppWindow, Megaphone
} from "lucide-react-native";
import { theme } from "@/lib/theme";

const ITEMS = [
  { icon: MessageSquare, label: "Support" },
  { icon: CreditCard,    label: "Subscription" },
  { icon: Star,          label: "Product updates" },
  { icon: Gift,          label: "Refer a friend" },
  { icon: HelpCircle,    label: "About" },
  { icon: User,          label: "Profile",         divider: true },
  { icon: Users,         label: "Manage team" },
  { icon: Building2,     label: "Company details" },
  { icon: Sliders,       label: "Preferences" },
  { icon: LogOut,        label: "Logout",          divider: true, danger: true },
];

export default function More() {
  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <Text style={s.title}>More</Text>
        <Sparkles size={22} color={theme.color.text} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={s.tileRow}>
          <Pressable style={s.tile}>
            <AppWindow size={26} color={theme.color.text} strokeWidth={1.6} />
            <Text style={s.tileText}>Apps &{"\n"}integrations</Text>
          </Pressable>
          <Pressable style={s.tile}>
            <Megaphone size={26} color={theme.color.text} strokeWidth={1.6} />
            <Text style={s.tileText}>Marketing</Text>
          </Pressable>
        </View>

        {ITEMS.map((it, i) => {
          const Icon = it.icon;
          return (
            <View key={i}>
              {it.divider && <View style={s.divider} />}
              <Pressable style={s.row}>
                <Icon size={24} color={it.danger ? theme.color.danger : theme.color.text} strokeWidth={1.6} />
                <Text style={[s.rowText, it.danger && { color: theme.color.danger, fontWeight: "700" }]}>{it.label}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: "800", color: theme.color.text },
  tileRow: { flexDirection: "row", paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  tile: { flex: 1, backgroundColor: theme.color.surfaceAlt, borderRadius: theme.radius.md, padding: 20, gap: 10, minHeight: 110 },
  tileText: { fontSize: 17, fontWeight: "700", color: theme.color.text, lineHeight: 22 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingVertical: 18, gap: 18 },
  rowText: { fontSize: 18, color: theme.color.text, fontWeight: "600" },
  divider: { height: 1, backgroundColor: theme.color.border, marginHorizontal: 24, marginVertical: 8 },
});
