// TEAM COMPETITION SCREEN — real-time shift scoreboard.
// Reps see who's winning as the shift happens.
// Every sale broadcasts a fire event. The screen pulses.

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Animated } from "react-native";
import { useRouter } from "expo-router";
import { X, Flame, Zap, Trophy } from "lucide-react-native";
import { theme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

type TeamRow = {
  team_id: string;
  name: string;
  color: string;
  emoji: string;
  knocks: number;
  sales: number;
  revenue: number;
  conv_pct: number;
};

type SaleEvent = {
  message: string;
  user_id: string;
  created_at: string;
};

export default function CompetitionScreen() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [feed, setFeed] = useState<SaleEvent[]>([]);
  const [pulse] = useState(new Animated.Value(1));

  useEffect(() => {
    loadTeams();
    const ch = supabase
      .channel("commission-events-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "commission_events" },
        (payload) => {
          const ev = payload.new as SaleEvent;
          setFeed((f) => [ev, ...f].slice(0, 20));
          // Pulse animation on new sale
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1.06, duration: 150, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 150, useNativeDriver: true }),
          ]).start();
          loadTeams(); // refresh scores
        })
      .subscribe();
    const t = setInterval(loadTeams, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  async function loadTeams() {
    const { data } = await supabase
      .from("team_leaderboard_live")
      .select("*")
      .order("sales", { ascending: false });
    setTeams(data ?? []);
  }

  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <Pressable onPress={() => router.back()}><X size={26} color={theme.color.text} /></Pressable>
        <Text style={s.title}>Live Competition</Text>
        <Flame size={22} color={theme.color.danger} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Team scores */}
        {teams.map((t, i) => (
          <Animated.View key={t.team_id}
            style={[s.teamCard, i === 0 && s.teamCardFirst, { transform: [{ scale: i === 0 ? pulse : 1 }] }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {i === 0 && <Trophy size={22} color="#FFD700" />}
              <Text style={s.teamEmoji}>{t.emoji}</Text>
              <Text style={[s.teamName, i === 0 && { color: "#fff" }]}>{t.name}</Text>
              <View style={[s.badge, { backgroundColor: t.color }]}>
                <Text style={s.badgeText}>#{i + 1}</Text>
              </View>
            </View>
            <View style={s.statsRow}>
              {[
                ["Sales", t.sales, theme.color.primary],
                ["Knocks", t.knocks, theme.color.info],
                ["Conv%", `${t.conv_pct ?? 0}%`, theme.color.warning],
                ["Rev", `$${(t.revenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, i === 0 ? "#fff" : theme.color.text],
              ].map(([l, v, c]) => (
                <View key={String(l)} style={s.stat}>
                  <Text style={[s.statNum, { color: i === 0 ? "#fff" : String(c) }]}>{v}</Text>
                  <Text style={[s.statLabel, { color: i === 0 ? "rgba(255,255,255,0.7)" : theme.color.textMute }]}>{l}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        ))}

        {/* Live feed */}
        <Text style={s.section}>Live Feed</Text>
        {feed.length === 0 && <Text style={s.empty}>No sales yet — go close something! 💪</Text>}
        {feed.map((e, i) => (
          <View key={i} style={s.feedRow}>
            <Zap size={18} color={theme.color.warning} />
            <View style={{ flex: 1 }}>
              <Text style={s.feedMsg}>{e.message}</Text>
              <Text style={s.feedTime}>{new Date(e.created_at).toLocaleTimeString()}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 16 },
  title: { fontSize: 26, fontWeight: "800", color: theme.color.text, flex: 1, marginLeft: 8 },
  teamCard: { margin: 16, marginBottom: 8, padding: 18, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border },
  teamCardFirst: { backgroundColor: "#0E2B2A" },
  teamEmoji: { fontSize: 24 },
  teamName: { fontSize: 20, fontWeight: "800", color: theme.color.text, flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  statsRow: { flexDirection: "row", marginTop: 16, justifyContent: "space-between" },
  stat: { alignItems: "center" },
  statNum: { fontSize: 24, fontWeight: "800" },
  statLabel: { fontSize: 12, marginTop: 2 },
  section: { fontSize: 16, color: theme.color.textMute, fontWeight: "600", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  feedRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface },
  feedMsg: { fontSize: 15, fontWeight: "700", color: theme.color.text },
  feedTime: { fontSize: 12, color: theme.color.textMute, marginTop: 2 },
  empty: { paddingHorizontal: 20, color: theme.color.textMute, fontStyle: "italic" },
});
