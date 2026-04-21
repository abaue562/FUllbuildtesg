// Floating top badge — today's totals at a glance, tap to open full stats.
import { View, Text } from "react-native";
import { useTodayStats } from "@/lib/hooks";

export function TodayBadge() {
  const s = useTodayStats();
  return (
    <View className="bg-black/80 rounded-2xl px-4 py-3 flex-row justify-between items-center">
      <Stat label="Knocked" value={s.knocked} />
      <Stat label="Talked"  value={s.talked} />
      <Stat label="Callbk"  value={s.callbacks} />
      <Stat label="Sold"    value={s.sold} accent="text-emerald-400" />
    </View>
  );
}
function Stat({ label, value, accent = "text-white" }: any) {
  return (
    <View className="items-center">
      <Text className={`text-2xl font-bold ${accent}`}>{value}</Text>
      <Text className="text-zinc-400 text-xs uppercase">{label}</Text>
    </View>
  );
}
