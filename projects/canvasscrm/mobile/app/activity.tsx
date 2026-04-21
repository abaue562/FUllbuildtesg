// ACTIVITY FEED — back arrow + title, list of recent events with icons + red dot.
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Sparkles, FileText, Check, FilePlus } from "lucide-react-native";
import { theme } from "@/lib/theme";

const ITEMS = [
  { icon: FileText, title: "Andrew Cassidy sent an invoice - $697.76",   sub: "Invoice #1683 - For Services Rendered\nNorda and dave Trask", ago: "2 months ago" },
  { icon: Check,    title: "Andrew Cassidy completed a visit",            sub: "Job #410\nNorda and dave Trask", ago: "2 months ago" },
  { icon: FileText, title: "Andrew Cassidy sent an invoice - $1,495.00",  sub: "Invoice #1684 - For Services Rendered\nNorda and dave Trask", ago: "2 months ago" },
  { icon: FilePlus, title: "Andrew Cassidy created an invoice - $1,674.40", sub: "Invoice #1684 - For Services Rendered\nNorda and dave Trask", ago: "2 months ago" },
  { icon: FilePlus, title: "Andrew Cassidy created an invoice - $2,372.16", sub: "Invoice #1683 - For Services Rendered\nNorda and dave Trask", ago: "2 months ago" },
];

export default function Activity() {
  const router = useRouter();
  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <Pressable onPress={() => router.back()}><ArrowLeft size={26} color={theme.color.text} /></Pressable>
        <Text style={s.title}>Activity Feed</Text>
        <Sparkles size={22} color={theme.color.text} />
      </View>

      <ScrollView>
        {ITEMS.map((it, i) => {
          const Icon = it.icon;
          const isCheck = it.icon === Check;
          return (
            <View key={i} style={s.row}>
              <View style={[s.iconWrap, isCheck && { backgroundColor: "transparent" }]}>
                <Icon size={26} color={isCheck ? theme.color.primary : theme.color.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{it.title}</Text>
                <Text style={s.rowSub}>{it.sub}</Text>
                <Text style={s.rowAgo}>{it.ago}</Text>
              </View>
              <View style={s.dot} />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 16 },
  title: { fontSize: 26, fontWeight: "800", color: theme.color.text, flex: 1, marginLeft: 8 },
  row: { flexDirection: "row", padding: 20, gap: 16, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface },
  iconWrap: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 17, fontWeight: "700", color: theme.color.text, lineHeight: 22 },
  rowSub: { fontSize: 15, color: theme.color.textMute, marginTop: 6, fontStyle: "italic", lineHeight: 20 },
  rowAgo: { fontSize: 14, color: theme.color.textMute, marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.color.danger, marginTop: 4 },
});
